import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { encryptionService } from './encryption-service';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

export interface LedgerRecord {
  id?: number;
  name: string;
  parent: string;
  closing_balance: number;
  address?: string;
  phone?: string;
  client_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyRecord {
  id?: number;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  gst_registration?: string;
  client_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface QueryCache {
  id?: number;
  query_hash: string;
  query_text: string;
  response_data: any;
  client_id: string;
  expires_at: string;
  created_at?: string;
}

export class SupabaseService {
  public supabase: SupabaseClient | null = null;
  private config: SupabaseConfig | null = null;
  private isConfigured: boolean = false;

  constructor() {
    try {
      this.initializeSupabase();
    } catch (error) {
      console.warn('Supabase not configured, running in offline mode:', error);
      this.isConfigured = false;
    }
  }

  private initializeSupabase() {
    // Try to get environment variables first
    let url = process.env.SUPABASE_URL;
    let anonKey = process.env.SUPABASE_ANON_KEY;
    let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // If not found in environment, try settings service
    if (!url || !anonKey) {
      try {
        const { settingsService } = require('./settings-service');
        const config = settingsService.getSupabaseConfig();
        
        if (config) {
          url = config.url;
          anonKey = config.anonKey;
          serviceRoleKey = config.serviceRoleKey || serviceRoleKey;
          console.log('📂 Using Supabase config from settings');
        }
      } catch (error) {
        console.log('⚠️ Settings service not available, continuing with env vars only');
      }
    }

    if (!url || !anonKey || url.includes('your-project') || anonKey.includes('your-anon-key')) {
      // Not properly configured, enable offline mode
      console.log('🔄 Supabase not configured - running in offline mode');
      console.log('💡 Configure Supabase in the app settings to enable database features');
      this.isConfigured = false;
      return;
    }

    this.config = {
      url,
      anonKey,
      serviceRoleKey
    };

    // Use service role key for backend operations if available
    this.supabase = createClient(url, serviceRoleKey || anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.isConfigured = true;
    console.log('✅ Supabase configured successfully');
  }

  /**
   * Configure Supabase with provided credentials (for runtime configuration)
   */
  configure(url: string, anonKey: string, serviceRoleKey?: string): boolean {
    try {
      this.config = { url, anonKey, serviceRoleKey };
      
      this.supabase = createClient(url, serviceRoleKey || anonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      this.isConfigured = true;
      console.log('✅ Supabase configured at runtime');
      return true;
    } catch (error) {
      console.error('Failed to configure Supabase:', error);
      return false;
    }
  }

  /**
   * Check if Supabase is configured
   */
  isSupabaseConfigured(): boolean {
    return this.isConfigured && this.supabase !== null;
  }

  /**
   * Test Supabase connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase not configured - running in offline mode');
      return false;
    }

    try {
      const { data, error } = await this.supabase!
        .from('ledgers')
        .select('count')
        .limit(1);

      if (error) {
        console.error('Supabase connection test failed:', error);
        return false;
      }

      console.log('✅ Supabase connection successful');
      return true;
    } catch (error) {
      console.error('Supabase connection error:', error);
      return false;
    }
  }

  /**
   * Get all ledgers for a client
   */
  async getLedgers(clientId: string, limit: number = 100): Promise<LedgerRecord[]> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - returning empty ledgers list');
      return [];
    }

    try {
      const { data, error } = await this.supabase!
        .from('ledgers')
        .select('*')
        .eq('client_id', clientId)
        .limit(limit)
        .order('name');

      if (error) {
        console.error('Error fetching ledgers:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Ledger fetch error:', error);
      return [];
    }
  }

  /**
   * Search ledgers by name (using searchable hash for encrypted data)
   */
  async searchLedgers(clientId: string, searchTerm: string, limit: number = 10): Promise<LedgerRecord[]> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - returning empty search results');
      return [];
    }

    try {
      // Create searchable hash for exact match
      const searchHash = encryptionService.createSearchQuery(searchTerm, clientId);
      
      // First try exact hash match (most efficient for encrypted data)
      let { data, error } = await this.supabase!
        .from('ledgers')
        .select('*')
        .eq('client_id', clientId)
        .eq('name_hash', searchHash)
        .limit(limit);

      // If no exact match found, try partial matches on multiple hash variants
      if (!data || data.length === 0) {
        console.log('No exact match found, trying partial search...');
        
        // Try common variations and partial terms
        const searchVariations = [
          searchTerm.toLowerCase(),
          searchTerm.toUpperCase(),
          searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase(),
          ...searchTerm.split(' ').filter(word => word.length > 2) // Individual words
        ];
        
        const hashVariations = searchVariations.map(term => 
          encryptionService.createSearchQuery(term, clientId)
        );
        
        const { data: variantData, error: variantError } = await this.supabase!
          .from('ledgers')
          .select('*')
          .eq('client_id', clientId)
          .in('name_hash', hashVariations)
          .limit(limit);
          
        data = variantData;
        error = variantError;
      }

      if (error) {
        console.error('Error searching encrypted ledgers:', error);
        return [];
      }

      if (!data) return [];

      // Decrypt the results before returning
      const decryptedResults: LedgerRecord[] = data.map(encryptedRecord => {
        try {
          return encryptionService.decryptLedgerRecord(encryptedRecord);
        } catch (decryptError) {
          console.error('Error decrypting ledger record:', decryptError);
          // Return a placeholder if decryption fails
          return {
            name: '[Decryption Error]',
            parent: encryptedRecord.parent || '',
            closing_balance: 0,
            client_id: clientId
          };
        }
      });

      return decryptedResults;
    } catch (error) {
      console.error('Encrypted ledger search error:', error);
      return [];
    }
  }

  /**
   * Get all ledgers for a client (alias for getLedgers with different default limit)
   */
  async getAllLedgers(clientId: string, limit: number = 100): Promise<LedgerRecord[]> {
    return this.getLedgers(clientId, limit);
  }

  /**
   * Get ledgers with highest closing balances
   */
  async getTopBalances(clientId: string, limit: number = 10): Promise<LedgerRecord[]> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - returning demo top balances');
      return [];
    }

    try {
      const { data, error } = await this.supabase!
        .from('ledgers')
        .select('*')
        .eq('client_id', clientId)
        .neq('closing_balance', 0)
        .order('closing_balance', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching top balances:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Top balances fetch error:', error);
      return [];
    }
  }

  /**
   * Get company information
   */
  async getCompany(clientId: string): Promise<CompanyRecord | null> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - returning demo company data');
      // Return demo company data for offline mode
      return {
        id: 1,
        name: 'Demo Company (Offline Mode)',
        address: 'Please configure Supabase to see real company data',
        phone: 'N/A',
        email: 'N/A',
        client_id: clientId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    try {
      const { data, error } = await this.supabase!
        .from('companies')
        .select('*')
        .eq('client_id', clientId)
        .single();

      if (error) {
        console.error('Error fetching company:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Company fetch error:', error);
      return null;
    }
  }

  /**
   * Sync ledger data from S3 to Supabase
   */
  async syncLedgers(clientId: string, ledgers: any[]): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - cannot sync ledgers');
      return false;
    }

    try {
      // Transform S3 data to Supabase format with encryption
      const ledgerRecords = ledgers.map(ledger => {
        // Enhanced balance parsing to handle various formats
        let balance = 0;
        const balanceValue = ledger.$ClosingBalance || ledger.closing_balance || ledger.ClosingBalance || '0';
        
        if (typeof balanceValue === 'string') {
          // Remove currency symbols, commas, and other formatting
          const cleanedValue = balanceValue.replace(/[₹$,\s]/g, '');
          balance = parseFloat(cleanedValue) || 0;
        } else if (typeof balanceValue === 'number') {
          balance = balanceValue;
        }
        
        // console.log(`Balance parsing for ${ledger.$Name || ledger.name}: raw=${balanceValue}, parsed=${balance}`);
        
        const plainRecord = {
          name: ledger.$Name || ledger.name || '',
          parent: ledger.$Parent || ledger.parent || '',
          closing_balance: balance,
          address: ledger.$Address || ledger.address,
          phone: ledger.$Phone || ledger.phone,
          client_id: clientId
        };

        // Encrypt sensitive data before storing
        return encryptionService.encryptLedgerRecord(plainRecord, clientId);
      });

      // Delete existing records for this client
      await this.supabase!
        .from('ledgers')
        .delete()
        .eq('client_id', clientId);

      // Insert new encrypted records
      const { error } = await this.supabase!
        .from('ledgers')
        .insert(ledgerRecords);

      if (error) {
        console.error('Error syncing ledgers:', error);
        return false;
      }

      console.log(`✅ Synced ${ledgerRecords.length} ledgers for ${clientId}`);
      return true;
    } catch (error) {
      console.error('Ledger sync error:', error);
      return false;
    }
  }

  /**
   * Sync company data from S3 to Supabase
   */
  async syncCompany(clientId: string, companies: any[]): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - cannot sync company');
      return false;
    }

    try {
      if (!companies || companies.length === 0) {
        return true;
      }

      const company = companies[0]; // Take first company
      const companyRecord: CompanyRecord = {
        name: company.$Name || company.Name || company.name || '',
        address: company.$Address || company.Address || company.address || '',
        phone: company.$Phone || company.phone,
        email: company.$Email || company.email,
        gst_registration: company.$GSTRegistration || company.gst_registration,
        client_id: clientId
      };

      // Upsert company record
      const { error } = await this.supabase!
        .from('companies')
        .upsert(companyRecord, { onConflict: 'client_id' });

      if (error) {
        console.error('Error syncing company:', error);
        return false;
      }

      console.log(`✅ Synced company data for ${clientId}`);
      return true;
    } catch (error) {
      console.error('Company sync error:', error);
      return false;
    }
  }

  /**
   * Generic upsert method for any table
   */
  async upsertRecords(tableName: string, records: any[]): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupabaseConfigured()) {
      return {
        success: false,
        error: 'Supabase not configured'
      };
    }

    try {
      if (!records || records.length === 0) {
        return { success: true };
      }

      // Determine conflict columns based on table name
      let onConflict: string;
      if (tableName === 'purchase_orders') {
        onConflict = 'client_id,stock_item_name,order_date';
      } else {
        // Default for sales_vouchers and purchase_vouchers
        onConflict = 'client_id,voucher_number,voucher_date';
      }

      const { error } = await this.supabase!
        .from(tableName)
        .upsert(records, {
          onConflict,
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`Error upserting to ${tableName}:`, error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log(`✅ Upserted ${records.length} records to ${tableName}`);
      return { success: true };

    } catch (error) {
      console.error(`Upsert error for ${tableName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Cache query results
   */
  async cacheQuery(clientId: string, queryText: string, responseData: any, expiryMinutes: number = 30): Promise<void> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - skipping query cache');
      return;
    }

    try {
      const queryHash = this.generateQueryHash(queryText);
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

      const cacheRecord: QueryCache = {
        query_hash: queryHash,
        query_text: queryText,
        response_data: responseData,
        client_id: clientId,
        expires_at: expiresAt
      };

      await this.supabase!
        .from('query_cache')
        .upsert(cacheRecord, { onConflict: 'query_hash,client_id' });

    } catch (error) {
      console.error('Query cache error:', error);
    }
  }

  /**
   * Get cached query result
   */
  async getCachedQuery(clientId: string, queryText: string): Promise<any | null> {
    if (!this.isSupabaseConfigured()) {
      return null;
    }

    try {
      const queryHash = this.generateQueryHash(queryText);
      const now = new Date().toISOString();

      const { data, error } = await this.supabase!
        .from('query_cache')
        .select('response_data')
        .eq('query_hash', queryHash)
        .eq('client_id', clientId)
        .gt('expires_at', now)
        .single();

      if (error || !data) {
        return null;
      }

      console.log('🚀 Cache hit for query:', queryText);
      return data.response_data;
    } catch (error) {
      console.error('Cache lookup error:', error);
      return null;
    }
  }

  /**
   * Generate hash for query caching
   */
  private generateQueryHash(queryText: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(queryText.toLowerCase().trim()).digest('hex');
  }

  /**
   * Get analytics/stats
   */
  async getStats(clientId: string): Promise<any> {
    if (!this.isSupabaseConfigured()) {
      return {
        ledger_count: 0,
        company: null,
        cache_entries: 0,
        last_updated: new Date().toISOString(),
        offline_mode: true
      };
    }

    try {
      const [ledgerCount, companyData, cacheStats] = await Promise.all([
        this.supabase!.from('ledgers').select('count').eq('client_id', clientId),
        this.supabase!.from('companies').select('*').eq('client_id', clientId).single(),
        this.supabase!.from('query_cache').select('count').eq('client_id', clientId)
      ]);

      return {
        ledger_count: ledgerCount.count || 0,
        company: companyData.data,
        cache_entries: cacheStats.count || 0,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Stats fetch error:', error);
      return {};
    }
  }

  /**
   * Record query analytics for performance monitoring
   */
  async recordQueryAnalytics(analyticsData: {
    client_id: string;
    query_type: string;
    query_text: string;
    response_time_ms: number;
    cache_hit: boolean;
    whatsapp_number?: string | null;
  }): Promise<void> {
    if (!this.isSupabaseConfigured()) {
      return; // Skip analytics in offline mode
    }

    try {
      await this.supabase!
        .from('query_analytics')
        .insert({
          client_id: analyticsData.client_id,
          query_type: analyticsData.query_type,
          query_text: analyticsData.query_text,
          response_time_ms: analyticsData.response_time_ms,
          cache_hit: analyticsData.cache_hit,
          whatsapp_number: analyticsData.whatsapp_number
        });
    } catch (error) {
      console.error('Analytics recording error:', error);
    }
  }

  /**
   * User Authentication Methods
   */

  /**
   * Create new user account
   */
  async createUser(userData: any): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - cannot create user');
      return false;
    }

    try {
      const { error } = await this.supabase!
        .from('users')
        .insert(userData);

      if (error) {
        console.error('User creation error:', error);
        return false;
      }

      console.log(`✅ User created: ${userData.user_id}`);
      return true;
    } catch (error) {
      console.error('Create user error:', error);
      return false;
    }
  }

  /**
   * Get user by mobile number
   */
  async getUserByMobile(mobileNumber: string): Promise<any | null> {
    if (!this.isSupabaseConfigured()) {
      console.log('📴 Supabase offline - cannot get user');
      return null;
    }

    try {
      const { data, error } = await this.supabase!
        .from('users')
        .select('*')
        .eq('mobile_number', mobileNumber)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Get user error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Get user by mobile error:', error);
      return null;
    }
  }

  /**
   * Update user last login timestamp
   */
  async updateUserLastLogin(userId: string): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await this.supabase!
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) {
        console.error('Update last login error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Update last login error:', error);
      return false;
    }
  }

  /**
   * Update user password
   */
  async updateUserPassword(userId: string, hashedPassword: string): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await this.supabase!
        .from('users')
        .update({ 
          password_hash: hashedPassword,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Update password error:', error);
        return false;
      }

      console.log(`✅ Password updated for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('Update password error:', error);
      return false;
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      return false;
    }

    try {
      const { error } = await this.supabase!
        .from('users')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Deactivate user error:', error);
        return false;
      }

      console.log(`✅ User deactivated: ${userId}`);
      return true;
    } catch (error) {
      console.error('Deactivate user error:', error);
      return false;
    }
  }

  /**
   * Get user by client ID for Tally sessions
   */
  async getUserByClientId(clientId: string): Promise<any | null> {
    if (!this.isSupabaseConfigured()) {
      return null;
    }

    try {
      const { data, error } = await this.supabase!
        .from('users')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Get user by client ID error:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Get user by client ID error:', error);
      return null;
    }
  }

  /**
   * Create users table if it doesn't exist
   */
  async ensureUsersTableExists(): Promise<boolean> {
    if (!this.isSupabaseConfigured()) {
      return false;
    }

    try {
      // Check if table exists by trying to count records
      const { error } = await this.supabase!
        .from('users')
        .select('count')
        .limit(1);

      if (error && error.code === '42P01') { // Table doesn't exist
        console.log('📋 Users table not found. Please create it in Supabase dashboard.');
        console.log('SQL to create users table:');
        console.log(`
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  mobile_number TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  client_id TEXT NOT NULL,
  company_name TEXT,
  business_type TEXT,
  is_active BOOLEAN DEFAULT true,
  login_mode TEXT DEFAULT 'mobile',
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_mobile ON users(mobile_number);
CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_users_user_id ON users(user_id);
        `);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Users table check error:', error);
      return false;
    }
  }
}