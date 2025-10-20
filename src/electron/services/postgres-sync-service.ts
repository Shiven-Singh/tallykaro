import { Client } from 'pg';
import { S3Service } from './s3-service';

export interface SyncStatus {
  isRunning: boolean;
  lastSync?: Date;
  totalRecords?: number;
  errors?: string[];
  syncedTables?: string[];
}

export class PostgresSyncService {
  private pgClient: Client;
  private s3Service: S3Service;
  private syncInterval: NodeJS.Timeout | null = null;
  private status: SyncStatus = { isRunning: false };

  constructor() {
    this.pgClient = new Client({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'tallykaro',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    this.s3Service = new S3Service();
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.pgClient.connect();
      console.log('✅ PostgreSQL connected for sync service');
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
    }
  }

  /**
   * Start automatic sync from S3 to PostgreSQL
   */
  async startAutoSync(intervalMinutes: number = 30): Promise<void> {
    if (this.syncInterval) {
      console.log('Auto-sync already running');
      return;
    }

    console.log(`Starting auto-sync every ${intervalMinutes} minutes`);
    
    // Initial sync
    await this.performSync();
    
    // Schedule recurring sync
    this.syncInterval = setInterval(async () => {
      await this.performSync();
    }, intervalMinutes * 60 * 1000);

    this.status.isRunning = true;
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      this.status.isRunning = false;
      console.log('Auto-sync stopped');
    }
  }

  /**
   * Perform complete sync from S3 to PostgreSQL
   */
  async performSync(): Promise<SyncStatus> {
    console.log('Starting S3 → PostgreSQL sync...');
    
    const startTime = Date.now();
    const errors: string[] = [];
    const syncedTables: string[] = [];
    let totalRecords = 0;

    try {
      // Get all clients
      const clients = await this.getAllActiveClients();
      
      for (const client of clients) {
        try {
          console.log(`Syncing data for client: ${client.client_name}`);
          
          // Sync ledger data
          const ledgerCount = await this.syncLedgerData(client.id, client.client_code);
          if (ledgerCount > 0) {
            totalRecords += ledgerCount;
            syncedTables.push(`${client.client_code}_LEDGER`);
          }
          
          // Could add more table syncs here (COMPANY, STOCKITEM, etc.)
          
        } catch (clientError) {
          const errorMsg = `${client.client_name}: ${this.extractErrorMessage(clientError)}`;
          errors.push(errorMsg);
          console.error(`❌ Client sync error: ${errorMsg}`);
        }
      }

      // Update sync status
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        totalRecords,
        errors: errors.length > 0 ? errors : undefined,
        syncedTables
      };

      const duration = Date.now() - startTime;
      console.log(`✅ Sync completed in ${duration}ms`);
      console.log(`📊 Records synced: ${totalRecords}, Tables: ${syncedTables.length}, Errors: ${errors.length}`);

      return this.status;

    } catch (error) {
      const errorMsg = this.extractErrorMessage(error);
      console.error('❌ Sync failed:', errorMsg);
      
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        errors: [errorMsg]
      };
      
      return this.status;
    }
  }

  /**
   * Sync ledger data from S3 to PostgreSQL search index
   */
  private async syncLedgerData(clientId: string, clientCode: string): Promise<number> {
    try {
      // Get latest ledger data from S3
      const ledgerData = await this.s3Service.getTallyData(clientCode, 'LEDGER');
      
      if (!ledgerData || ledgerData.length === 0) {
        console.log(`No ledger data found in S3 for client: ${clientCode}`);
        return 0;
      }

      console.log(`Found ${ledgerData.length} ledger records in S3 for ${clientCode}`);

      // Clear existing data for this client
      await this.pgClient.query('DELETE FROM ledger_search_index WHERE client_id = $1', [clientId]);

      // Prepare batch insert
      const insertValues: any[] = [];
      const batchSize = 100;
      
      for (const record of ledgerData) {
        const ledgerName = record.$Name || record.name || '';
        const ledgerParent = record.$Parent || record.parent || '';
        const closingBalance = this.parseBalance(record.$ClosingBalance || record.closingBalance || record.closing_balance);
        const balanceType = closingBalance >= 0 ? 'Dr' : 'Cr';
        
        // Skip empty records
        if (!ledgerName.trim()) continue;
        
        insertValues.push([
          clientId,
          ledgerName,
          ledgerParent,
          Math.abs(closingBalance),
          balanceType,
          ledgerParent, // Using parent as group for now
          record.$Phone || record.phone || null,
          record.$Email || record.email || null,
          record.$Address || record.address || null
        ]);
      }

      // Batch insert in chunks
      let totalInserted = 0;
      for (let i = 0; i < insertValues.length; i += batchSize) {
        const batch = insertValues.slice(i, i + batchSize);
        const placeholders = batch.map((_, index) => {
          const start = index * 9;
          return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9})`;
        }).join(', ');

        const query = `
          INSERT INTO ledger_search_index 
          (client_id, ledger_name, ledger_parent, closing_balance, balance_type, ledger_group, phone, email, address)
          VALUES ${placeholders}
          ON CONFLICT (client_id, ledger_name) DO UPDATE SET
            ledger_parent = EXCLUDED.ledger_parent,
            closing_balance = EXCLUDED.closing_balance,
            balance_type = EXCLUDED.balance_type,
            ledger_group = EXCLUDED.ledger_group,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            address = EXCLUDED.address,
            last_updated_at = CURRENT_TIMESTAMP
        `;

        const flatValues = batch.flat();
        await this.pgClient.query(query, flatValues);
        totalInserted += batch.length;
      }

      console.log(`✅ Synced ${totalInserted} ledger records for ${clientCode}`);
      return totalInserted;

    } catch (error) {
      console.error(`Error syncing ledger data for ${clientCode}:`, error);
      throw error;
    }
  }

  /**
   * Get all active clients
   */
  private async getAllActiveClients(): Promise<any[]> {
    const query = `
      SELECT id, client_name, client_code
      FROM clients
      WHERE is_active = true
    `;
    
    const result = await this.pgClient.query(query);
    return result.rows;
  }

  /**
   * Parse balance from various formats
   */
  private parseBalance(balance: any): number {
    if (typeof balance === 'number') return balance;
    if (typeof balance === 'string') {
      // Handle Tally's "—" symbol for zero
      if (balance === '—' || balance === '-' || balance === '') return 0;
      
      // Remove currency symbols and formatting
      const cleaned = balance.replace(/[₹,\s]/g, '').replace(/—/g, '0');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Extract error message
   */
  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }
    return String(error);
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Manual sync trigger
   */
  async triggerManualSync(): Promise<SyncStatus> {
    console.log('Manual PostgreSQL sync triggered');
    return await this.performSync();
  }

  /**
   * Initialize database with sample client
   */
  async initializeSampleClient(clientName: string, whatsappNumber: string): Promise<string> {
    try {
      const query = `SELECT insert_sample_client($1, $2, $3)`;
      const result = await this.pgClient.query(query, [
        clientName,
        whatsappNumber,
        '/path/to/tally/data'
      ]);
      
      const clientId = result.rows[0].insert_sample_client;
      console.log(`✅ Sample client created: ${clientId}`);
      
      return clientId;
    } catch (error) {
      console.error('Error creating sample client:', error);
      throw error;
    }
  }

  /**
   * Clean up old data
   */
  async cleanupOldData(): Promise<void> {
    try {
      await this.pgClient.query('SELECT clean_expired_data()');
      console.log('✅ Cleaned up expired data');
    } catch (error) {
      console.error('Error cleaning up data:', error);
    }
  }

  /**
   * Get performance stats
   */
  async getPerformanceStats(): Promise<any> {
    try {
      const query = `
        SELECT 
          query_type,
          COUNT(*) as total_queries,
          AVG(total_response_time_ms) as avg_response_time,
          SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100 as cache_hit_rate
        FROM query_analytics
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY query_type
        ORDER BY total_queries DESC
      `;
      
      const result = await this.pgClient.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting performance stats:', error);
      return [];
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.pgClient.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('PostgreSQL connection test failed:', error);
      return false;
    }
  }
}