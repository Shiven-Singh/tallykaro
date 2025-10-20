/**
 * Tally Bridge Client
 * TypeScript client to connect to Python Bridge Server
 * Replaces direct ODBC connections with HTTP REST API calls
 */

import axios, { AxiosInstance } from 'axios';

export interface BridgeConnectionConfig {
  mobileNumber: string;
  password: string;
  companyName?: string;
  port?: number;
  serverPath?: string;
}

export interface BridgeConnectionStatus {
  is_connected: boolean;
  company_name?: string;
  tally_version?: string;
  message: string;
  error?: string;
  timestamp: string;
}

export interface BridgeQueryResponse {
  success: boolean;
  data?: any[];
  error?: string;
  execution_time_ms: number;
  row_count: number;
}

export class TallyBridgeClient {
  private baseURL: string;
  private token: string | null = null;
  private axios: AxiosInstance;

  constructor(bridgeServerURL: string = 'http://localhost:8765') {
    this.baseURL = bridgeServerURL;
    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Authenticate with bridge server
   */
  async authenticate(mobileNumber: string, password: string): Promise<{ success: boolean; token?: string; message: string }> {
    try {
      const response = await this.axios.post('/auth/login', {
        mobile_number: mobileNumber,
        password
      });

      if (response.data.success && response.data.token) {
        this.token = response.data.token;
        console.log('✅ Bridge server authentication successful');
        return {
          success: true,
          token: response.data.token,
          message: 'Authenticated successfully'
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Authentication failed'
        };
      }
    } catch (error: any) {
      console.error('❌ Bridge authentication error:', error);
      return {
        success: false,
        message: error.response?.data?.detail || error.message || 'Authentication failed'
      };
    }
  }

  /**
   * Connect to Tally via bridge server
   */
  async connect(config: BridgeConnectionConfig): Promise<BridgeConnectionStatus> {
    try {
      if (!this.token) {
        // Attempt to authenticate first
        const authResult = await this.authenticate(config.mobileNumber, config.password);
        if (!authResult.success) {
          return {
            is_connected: false,
            message: 'Authentication failed',
            error: authResult.message,
            timestamp: new Date().toISOString()
          };
        }
      }

      const response = await this.axios.post(
        '/tally/connect',
        {
          mobile_number: config.mobileNumber,
          password: config.password,
          company_name: config.companyName || null,
          port: config.port || 9000,
          server_path: config.serverPath || 'localhost'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      console.log('✅ Tally connection via bridge:', response.data);
      return response.data;

    } catch (error: any) {
      console.error('❌ Bridge connection error:', error);
      return {
        is_connected: false,
        message: 'Bridge connection failed',
        error: error.response?.data?.detail || error.message || 'Connection failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute SQL query via bridge server
   */
  async executeQuery(sql: string): Promise<BridgeQueryResponse> {
    try {
      if (!this.token) {
        return {
          success: false,
          error: 'Not authenticated. Please authenticate first.',
          execution_time_ms: 0,
          row_count: 0
        };
      }

      const response = await this.axios.post(
        '/tally/query',
        {
          sql,
          token: this.token
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        }
      );

      return response.data;

    } catch (error: any) {
      console.error('❌ Query execution error:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message || 'Query failed',
        execution_time_ms: 0,
        row_count: 0
      };
    }
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<BridgeConnectionStatus> {
    try {
      if (!this.token) {
        return {
          is_connected: false,
          message: 'Not authenticated',
          timestamp: new Date().toISOString()
        };
      }

      const response = await this.axios.get('/tally/status', {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      return response.data;

    } catch (error: any) {
      return {
        is_connected: false,
        message: 'Status check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Disconnect from Tally
   */
  async disconnect(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.token) {
        return { success: true, message: 'Not connected' };
      }

      await this.axios.post('/tally/disconnect', {}, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      this.token = null;
      return { success: true, message: 'Disconnected successfully' };

    } catch (error: any) {
      console.error('Disconnect error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check if Tally is running
   */
  async checkTallyProcess(): Promise<{ tally_running: boolean; message: string }> {
    try {
      const response = await this.axios.get('/tally/check-process');
      return response.data;
    } catch (error: any) {
      return {
        tally_running: false,
        message: 'Unable to check Tally process'
      };
    }
  }

  /**
   * Check bridge server health
   */
  async healthCheck(): Promise<{ status: string; tally_running: boolean; connected: boolean }> {
    try {
      const response = await this.axios.get('/health');
      return response.data;
    } catch (error) {
      throw new Error('Bridge server is not reachable');
    }
  }
}

// Export singleton instance
export const tallyBridge = new TallyBridgeClient();