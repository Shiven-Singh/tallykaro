import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SupabaseService } from './supabase-service';

export interface LoginCredentials {
  mobileNumber: string;
  password: string;
}

export interface UserSession {
  userId: string;
  mobileNumber: string;
  clientId: string;
  isAuthenticated: boolean;
  loginMode: 'tally' | 'mobile';
  accessToken?: string;
  expiresAt?: Date;
}

export interface UserRegistration {
  mobileNumber: string;
  password: string;
  companyName?: string;
  businessType?: string;
}

export class AuthService {
  private supabase: SupabaseService;
  private currentSession: UserSession | null = null;
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'tallykaro-secret-key-2024';
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.supabase = new SupabaseService();
  }

  /**
   * Check if Tally is connected and active
   */
  async isTallyActive(): Promise<boolean> {
    try {
      // This would check if Tally ODBC connection is available
      return await this.supabase.testConnection();
    } catch (error) {
      console.log('Tally connection check failed:', error);
      return false;
    }
  }

  /**
   * Register new user with mobile number
   */
  async registerUser(registration: UserRegistration): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
      console.log(`=� Registering new user: ${registration.mobileNumber}`);

      // Validate mobile number format
      if (!this.isValidMobileNumber(registration.mobileNumber)) {
        return { success: false, message: 'Invalid mobile number format. Please use 10-digit Indian mobile number.' };
      }

      // Check if user already exists
      const existingUser = await this.supabase.getUserByMobile(registration.mobileNumber);
      if (existingUser) {
        return { success: false, message: 'User already registered with this mobile number. Please login instead.' };
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(registration.password, saltRounds);

      // Create user record
      const userId = `user_${registration.mobileNumber}_${Date.now()}`;
      const clientId = `client_${registration.mobileNumber}`;

      const userData = {
        user_id: userId,
        mobile_number: registration.mobileNumber,
        password_hash: hashedPassword,
        client_id: clientId,
        company_name: registration.companyName || null,
        business_type: registration.businessType || null,
        created_at: new Date().toISOString(),
        is_active: true,
        login_mode: 'mobile' as const
      };

      const success = await this.supabase.createUser(userData);

      if (success) {
        console.log(` User registered successfully: ${userId}`);
        return { 
          success: true, 
          message: 'Registration successful! You can now login with your mobile number and password.',
          userId 
        };
      } else {
        return { success: false, message: 'Registration failed. Please try again.' };
      }

    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed due to server error. Please try again.' };
    }
  }

  /**
   * Login with mobile number and password
   */
  async loginWithMobile(credentials: LoginCredentials): Promise<{ success: boolean; message: string; session?: UserSession }> {
    try {
      console.log(`=� Mobile login attempt: ${credentials.mobileNumber}`);

      // Validate input
      if (!this.isValidMobileNumber(credentials.mobileNumber)) {
        return { success: false, message: 'Invalid mobile number format' };
      }

      if (!credentials.password || credentials.password.length < 6) {
        return { success: false, message: 'Password must be at least 6 characters' };
      }

      // Get user from database
      const user = await this.supabase.getUserByMobile(credentials.mobileNumber);
      if (!user) {
        return { success: false, message: 'User not found. Please register first.' };
      }

      if (!user.is_active) {
        return { success: false, message: 'Account is deactivated. Please contact support.' };
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(credentials.password, user.password_hash);
      if (!passwordMatch) {
        console.log('L Password verification failed');
        return { success: false, message: 'Invalid password' };
      }

      // Create session
      const session = await this.createSession(user, 'mobile');
      
      if (session) {
        console.log(` Mobile login successful: ${session.userId}`);
        return { 
          success: true, 
          message: 'Login successful', 
          session 
        };
      } else {
        return { success: false, message: 'Session creation failed' };
      }

    } catch (error) {
      console.error('Mobile login error:', error);
      return { success: false, message: 'Login failed due to server error' };
    }
  }

  /**
   * Login with Tally mode (when Tally is active)
   */
  async loginWithTally(companyName: string, mobileNumber?: string): Promise<{ success: boolean; message: string; session?: UserSession }> {
    try {
      console.log(`📊 Tally login: ${companyName} ${mobileNumber ? `(Mobile: ${mobileNumber})` : '(Guest mode)'}`);

      // Check if Tally is actually connected
      const tallyActive = await this.isTallyActive();
      if (!tallyActive) {
        return { 
          success: false, 
          message: 'Tally connection not available. Please use mobile login instead.' 
        };
      }

      // If mobile number provided, try to link with existing user
      if (mobileNumber && this.isValidMobileNumber(mobileNumber)) {
        const existingUser = await this.supabase.getUserByMobile(mobileNumber);
        if (existingUser && existingUser.is_active) {
          // Create Tally session for registered user
          const session: UserSession = {
            userId: existingUser.user_id,
            clientId: existingUser.client_id,
            mobileNumber: existingUser.mobile_number,
            isAuthenticated: true,
            loginMode: 'tally',
            expiresAt: new Date(Date.now() + this.SESSION_DURATION)
          };

          this.currentSession = session;
          
          // Update last login
          await this.supabase.updateUserLastLogin(existingUser.user_id);

          console.log(`✅ Tally login successful for registered user: ${session.userId}`);
          return { 
            success: true, 
            message: `Connected to Tally successfully. Welcome back, ${mobileNumber}!`, 
            session 
          };
        } else {
          return {
            success: false,
            message: 'Mobile number not registered. Please register first or login without mobile number for guest access.'
          };
        }
      }

      // Guest mode - create temporary Tally session
      const sessionId = `tally_guest_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      const guestClientId = `guest_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      const session: UserSession = {
        userId: sessionId,
        clientId: guestClientId,
        mobileNumber: 'guest_user',
        isAuthenticated: true,
        loginMode: 'tally',
        expiresAt: new Date(Date.now() + this.SESSION_DURATION)
      };

      this.currentSession = session;

      console.log(`🔓 Tally guest login successful: ${session.userId}`);
      return { 
        success: true, 
        message: 'Connected to Tally in guest mode. For full features, please register with mobile number.', 
        session 
      };

    } catch (error) {
      console.error('Tally login error:', error);
      return { success: false, message: 'Tally connection failed' };
    }
  }

  /**
   * Create authenticated session
   */
  private async createSession(user: any, loginMode: 'tally' | 'mobile'): Promise<UserSession | null> {
    try {
      const expiresAt = new Date(Date.now() + this.SESSION_DURATION);
      
      const session: UserSession = {
        userId: user.user_id,
        clientId: user.client_id,
        mobileNumber: user.mobile_number,
        isAuthenticated: true,
        loginMode,
        expiresAt
      };

      // Generate JWT token for mobile sessions
      if (loginMode === 'mobile') {
        const payload = {
          userId: session.userId,
          clientId: session.clientId,
          mobileNumber: session.mobileNumber,
          exp: Math.floor(expiresAt.getTime() / 1000)
        };

        session.accessToken = jwt.sign(payload, this.JWT_SECRET);
      }

      // Store session
      this.currentSession = session;

      // Update last login in database
      await this.supabase.updateUserLastLogin(user.user_id);

      return session;

    } catch (error) {
      console.error('Session creation error:', error);
      return null;
    }
  }

  /**
   * Verify current session
   */
  async verifySession(): Promise<{ isValid: boolean; session?: UserSession }> {
    try {
      if (!this.currentSession) {
        return { isValid: false };
      }

      // Check expiration
      if (this.currentSession.expiresAt && new Date() > this.currentSession.expiresAt) {
        console.log('Session expired');
        this.currentSession = null;
        return { isValid: false };
      }

      // For mobile sessions, verify JWT token
      if (this.currentSession.loginMode === 'mobile' && this.currentSession.accessToken) {
        try {
          jwt.verify(this.currentSession.accessToken, this.JWT_SECRET);
        } catch (jwtError) {
          console.log('JWT verification failed:', jwtError);
          this.currentSession = null;
          return { isValid: false };
        }
      }

      // For Tally sessions, verify Tally is still connected
      if (this.currentSession.loginMode === 'tally') {
        const tallyActive = await this.isTallyActive();
        if (!tallyActive) {
          console.log('Tally connection lost');
          this.currentSession = null;
          return { isValid: false };
        }
      }

      return { isValid: true, session: this.currentSession };

    } catch (error) {
      console.error('Session verification error:', error);
      this.currentSession = null;
      return { isValid: false };
    }
  }

  /**
   * Logout current user
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.currentSession) {
        console.log(`=K Logging out user: ${this.currentSession.userId}`);
        this.currentSession = null;
      }

      return { success: true, message: 'Logged out successfully' };

    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, message: 'Logout failed' };
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession;
  }

  /**
   * Change password for mobile users
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.currentSession || this.currentSession.loginMode !== 'mobile') {
        return { success: false, message: 'Password change only available for mobile login users' };
      }

      if (newPassword.length < 6) {
        return { success: false, message: 'New password must be at least 6 characters' };
      }

      const user = await this.supabase.getUserByMobile(this.currentSession.mobileNumber);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Verify old password
      const passwordMatch = await bcrypt.compare(oldPassword, user.password_hash);
      if (!passwordMatch) {
        return { success: false, message: 'Current password is incorrect' };
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password in database
      const success = await this.supabase.updateUserPassword(user.user_id, hashedPassword);

      if (success) {
        return { success: true, message: 'Password changed successfully' };
      } else {
        return { success: false, message: 'Failed to update password' };
      }

    } catch (error) {
      console.error('Password change error:', error);
      return { success: false, message: 'Password change failed due to server error' };
    }
  }

  /**
   * Validate Indian mobile number
   */
  private isValidMobileNumber(mobile: string): boolean {
    // Remove any spaces, dashes, or plus signs
    const cleaned = mobile.replace(/[\s\-\+]/g, '');
    
    // Check if it's a valid Indian mobile number
    // Format: 10 digits starting with 6, 7, 8, or 9
    const indianMobileRegex = /^[6-9]\d{9}$/;
    
    return indianMobileRegex.test(cleaned);
  }

  /**
   * Get login recommendations based on system state
   */
  async getLoginRecommendations(): Promise<{
    recommendedMode: 'tally' | 'mobile';
    tallyAvailable: boolean;
    message: string;
  }> {
    try {
      const tallyActive = await this.isTallyActive();

      if (tallyActive) {
        return {
          recommendedMode: 'tally',
          tallyAvailable: true,
          message: 'Tally is connected. You can use direct Tally login for real-time data access.'
        };
      } else {
        return {
          recommendedMode: 'mobile',
          tallyAvailable: false,
          message: 'Tally is not active. Please login with your mobile number to access stored data.'
        };
      }

    } catch (error) {
      console.error('Login recommendation error:', error);
      return {
        recommendedMode: 'mobile',
        tallyAvailable: false,
        message: 'Please login with your mobile number to continue.'
      };
    }
  }
}

export const authService = new AuthService();