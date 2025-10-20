import { TallyService } from './tally-services';
import { S3Service } from './s3-service';
import { SupabaseService } from './supabase-service';

export interface SyncConfig {
  intervalMinutes: number;
  autoStart: boolean;
  syncTables: string[];
  clientId: string;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync?: Date;
  nextSync?: Date;
  totalRecords?: number;
  errors?: string[];
  uploadedFiles?: string[];
  currentTable?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  estimatedTimeRemaining?: number;
}

export class EnhancedCloudSyncService {
  private tallyService: TallyService;
  private s3Service: S3Service;
  private supabaseService?: SupabaseService;
  private syncInterval: NodeJS.Timeout | null = null;
  private config: SyncConfig;
  private status: SyncStatus = { isRunning: false };
  private syncAbortController: AbortController | null = null;
  private isSyncing: boolean = false; // Mutex lock for sync operations

  constructor(config: SyncConfig, tallyService: TallyService, supabaseService?: SupabaseService) {
    this.tallyService = tallyService;
    this.s3Service = new S3Service();
    this.supabaseService = supabaseService;
    this.config = config;
  }

  /**
   * Start auto-sync with configured interval
   */
  async startAutoSync(): Promise<void> {
    if (this.syncInterval) {
      console.log('Auto-sync already running');
      return;
    }

    console.log(`Starting auto-sync every ${this.config.intervalMinutes} minutes`);
    
    // Initial sync
    await this.performSync();
    
    // Schedule recurring sync
    this.syncInterval = setInterval(async () => {
      await this.performSync();
    }, this.config.intervalMinutes * 60 * 1000);

    this.status.isRunning = true;
    this.updateNextSyncTime();
  }

  /**
   * Stop auto-sync
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
   * Perform complete data sync with enhanced error handling and progress tracking
   */
  async performSync(): Promise<SyncStatus> {
    // Check if sync is already running
    if (this.isSyncing) {
      console.log('⚠️ Sync already in progress, skipping this request');
      return {
        ...this.status,
        errors: ['Sync already in progress']
      };
    }

    // Acquire lock
    this.isSyncing = true;

    try {
      console.log('🔄 Starting enhanced Tally data sync...');

      const startTime = Date.now();
      const errors: string[] = [];
      const uploadedFiles: string[] = [];
      let totalRecords = 0;

      // Create abort controller for cancellation
      this.syncAbortController = new AbortController();

      // Update status to show sync is starting
      this.status = {
        ...this.status,
        currentTable: 'Initializing...',
        progress: { current: 0, total: this.config.syncTables.length, percentage: 0 },
        errors: []
      };

      // Step 1: Check Tally connection
      if (!this.tallyService.isConnected()) {
        throw new Error('Tally not connected. Please connect to Tally first.');
      }

      // Step 2: Extract data from all configured tables with progress tracking
      for (let i = 0; i < this.config.syncTables.length; i++) {
        const tableName = this.config.syncTables[i];
        
        // Check if sync was aborted
        if (this.syncAbortController?.signal.aborted) {
          throw new Error('Sync operation was cancelled');
        }
        
        // Update progress
        const progressPercentage = Math.round((i / this.config.syncTables.length) * 100);
        this.status = {
          ...this.status,
          currentTable: tableName,
          progress: {
            current: i + 1,
            total: this.config.syncTables.length,
            percentage: progressPercentage
          },
          estimatedTimeRemaining: this.calculateETA(startTime, i, this.config.syncTables.length)
        };
        
        try {
          console.log(`[${i + 1}/${this.config.syncTables.length}] 📊 Syncing ${tableName} table...`);
          
          // Add timeout protection for large datasets
          const data = await Promise.race([
            this.extractTableData(tableName),
            this.createTimeoutPromise<any[]>(120000, `${tableName} extraction timeout`) // 2 minutes timeout
          ]);
          
          if (data && Array.isArray(data) && data.length > 0) {
            // Process large datasets in chunks to prevent memory issues
            if (data.length > 2000) {
              console.log(`⚠️ Large dataset detected (${data.length} records), using chunked processing...`);
              const uploadKey = await this.uploadTableToS3WithChunking(tableName, data);
              uploadedFiles.push(uploadKey);
            } else {
              const uploadKey = await this.uploadTableToS3(tableName, data);
              uploadedFiles.push(uploadKey);
            }
            
            totalRecords += data.length;
            console.log(`✅ ${tableName}: ${data.length} records synced successfully`);
          } else {
            console.log(`⚠️ ${tableName}: No data found or invalid data type`);
          }
          
        } catch (tableError) {
          const errorMsg = `${tableName}: ${this.extractErrorMessage(tableError)}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
          
          // Continue with other tables even if one fails
          continue;
        }
        
        // Add small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Step 4: Update sync status
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        totalRecords,
        errors: errors.length > 0 ? errors : undefined,
        uploadedFiles,
        currentTable: undefined,
        progress: undefined,
        estimatedTimeRemaining: undefined
      };
      
      this.updateNextSyncTime();

      console.log(`✅ Sync completed in ${Date.now() - startTime}ms`);
      console.log(`📊 Total records: ${totalRecords}, Files: ${uploadedFiles.length}, Errors: ${errors.length}`);

      return this.status;

    } catch (error) {
      const errorMsg = this.extractErrorMessage(error);
      console.error('❌ Sync failed:', errorMsg);
      
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        errors: [errorMsg],
        currentTable: undefined,
        progress: undefined,
        estimatedTimeRemaining: undefined
      };
      
      return this.status;
    } finally {
      this.syncAbortController = null;
      // Release lock
      this.isSyncing = false;
    }
  }

  /**
   * Extract data from specific Tally table with enhanced error handling
   */
  private async extractTableData(tableName: string): Promise<any[]> {
    const queries: { [key: string]: string } = {
      'COMPANY': 'SELECT * FROM COMPANY',
      'LEDGER': 'SELECT $Name, $Parent, $ClosingBalance, $Address, $Phone FROM LEDGER',
      'GROUP': 'SELECT $Name, $Parent, $ClosingBalance FROM GROUP',
      'STOCKITEM': 'SELECT $Name, $Parent, $ClosingBalance, $ClosingRate FROM STOCKITEM',
      'COSTCENTRE': 'SELECT $Name, $Parent FROM COSTCENTRE',
      'SALESVOUCHERS': 'SELECT $Date, $VoucherNumber, $Reference, $VouchertypeName, $PartyLedgerName, $$CollectionField:$Amount:1:LedgerEntries FROM RTSAllVouchers WHERE $$IsSales:$VoucherTypeName',
      'PURCHASEVOUCHERS': 'SELECT $Date, $VoucherNumber, $Reference, $VouchertypeName, $PartyLedgerName, $$CollectionField:$Amount:1:LedgerEntries FROM RTSAllVouchers WHERE $$IsPurchase:$VoucherTypeName'
    };

    const query = queries[tableName.toUpperCase()];
    if (!query) {
      throw new Error(`No query defined for table: ${tableName}`);
    }

    console.log(`📊 Executing query for ${tableName}...`);
    const startTime = Date.now();
    
    try {
      const result = await this.tallyService.executeQuery(query);
      const executionTime = Date.now() - startTime;
      
      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      const data = result.data || [];
      console.log(`⏱️ ${tableName} query completed in ${executionTime}ms, ${data.length} records`);
      
      return data;
    } catch (error) {
      console.error(`❌ Query failed for ${tableName}:`, error);
      throw new Error(`Failed to extract ${tableName}: ${this.extractErrorMessage(error)}`);
    }
  }

  /**
   * Upload table data to S3 with chunked processing for large datasets
   */
  private async uploadTableToS3WithChunking(tableName: string, data: any[]): Promise<string> {
    const CHUNK_SIZE = 1000;
    const chunks = [];
    
    // Split data into chunks
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(data.slice(i, i + CHUNK_SIZE));
    }

    console.log(`📦 Processing ${data.length} records in ${chunks.length} chunks of ${CHUNK_SIZE}`);
    
    // Process chunks with delay to prevent memory issues
    const processedData = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`📦 Processing chunk ${i + 1}/${chunks.length}...`);
      processedData.push(...chunks[i]);
      
      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return await this.uploadTableToS3(tableName, processedData);
  }

  /**
   * Upload table data to S3 or Supabase depending on table type
   */
  private async uploadTableToS3(tableName: string, data: any[]): Promise<string> {
    // Handle sales/purchase vouchers separately - upload to Supabase instead of S3
    if (tableName.toUpperCase() === 'SALESVOUCHERS' || tableName.toUpperCase() === 'PURCHASEVOUCHERS') {
      return await this.uploadVouchersToSupabase(tableName, data);
    }

    // Create data hash for deduplication
    const dataHash = this.generateDataHash(data);

    // Check if this exact data already exists
    try {
      const existingData = await this.s3Service.getTallyData(this.config.clientId, tableName);
      if (existingData && Array.isArray(existingData) && existingData.length > 0) {
        const existingHash = this.generateDataHash(existingData);
        if (existingHash === dataHash) {
          console.log(`📋 ${tableName}: Data unchanged, skipping upload`);
          return `tally-data/${this.config.clientId}/${tableName.toLowerCase()}-latest.json`;
        }
      }
    } catch (error) {
      console.log(`📋 ${tableName}: No existing data found or error checking, proceeding with upload`);
    }

    // Use "latest" filename instead of timestamp to avoid duplicates
    const fileName = `${tableName.toLowerCase()}-latest.json`;
    const key = `tally-data/${this.config.clientId}/${fileName}`;

    // Prepare data with metadata
    const uploadData = {
      tableName,
      extractedAt: new Date().toISOString(),
      recordCount: data.length,
      clientId: this.config.clientId,
      dataHash: dataHash,
      data
    };

    const dataBuffer = Buffer.from(JSON.stringify(uploadData, null, 2));

    // Use S3Service to upload (it handles encryption)
    await this.s3Service.storeTallyData(this.config.clientId, tableName, dataBuffer);

    console.log(`✅ ${tableName}: Updated with ${data.length} records`);
    return key;
  }

  /**
   * Upload vouchers to Supabase database tables
   */
  private async uploadVouchersToSupabase(tableName: string, data: any[]): Promise<string> {
    if (!this.supabaseService) {
      console.log(`⚠️ ${tableName}: Supabase not configured, skipping database upload`);
      return `${tableName}-skipped`;
    }

    // Transform data to match Supabase schema
    const transformedData = data.map((row: any, index: number) => {
      const amount = parseFloat(row['$$CollectionField:$Amount:1:LedgerEntries'] || row.amount || '0');
      const voucherNumber = row.$VoucherNumber || row.voucher_number || `AUTO-${Date.now()}-${index}`;
      const rawDate = row.$Date || row.voucher_date;

      // Convert Tally date format (YYYYMMDD) to SQL date format (YYYY-MM-DD)
      let voucherDate = rawDate;
      if (rawDate && /^\d{8}$/.test(String(rawDate))) {
        const dateStr = String(rawDate);
        voucherDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }

      return {
        client_id: this.config.clientId,
        voucher_number: voucherNumber,
        voucher_date: voucherDate,
        voucher_type: row.$VouchertypeName || row.voucher_type || (tableName === 'SALESVOUCHERS' ? 'Sales' : 'Purchase'),
        party_name: row.$PartyLedgerName || row.party_name || 'Unknown',
        party_ledger_name: row.$PartyLedgerName || row.party_name || null,
        total_amount: Math.abs(amount),
        tax_amount: 0,
        discount_amount: 0,
        net_amount: Math.abs(amount),
        reference_number: row.$Reference || row.reference_number || null,
        narration: null,
        synced_at: new Date().toISOString()
      };
    });

    // Determine Supabase table name
    const supabaseTableName = tableName.toUpperCase() === 'SALESVOUCHERS' ? 'sales_vouchers' : 'purchase_vouchers';

    try {
      await this.supabaseService.upsertRecords(supabaseTableName, transformedData);
      console.log(`✅ ${tableName}: Synced ${transformedData.length} records to Supabase ${supabaseTableName} table`);
      return `supabase:${supabaseTableName}`;
    } catch (error) {
      console.error(`❌ ${tableName}: Failed to upload to Supabase:`, error);
      throw error;
    }
  }

  /**
   * Create a timeout promise
   */
  private createTimeoutPromise<T>(ms: number, message: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout: ${message}`)), ms);
    });
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateETA(startTime: number, currentIndex: number, totalTables: number): number {
    if (currentIndex === 0) return 0;
    
    const elapsed = Date.now() - startTime;
    const avgTimePerTable = elapsed / currentIndex;
    const remaining = totalTables - currentIndex;
    
    return Math.round((remaining * avgTimePerTable) / 1000); // Return in seconds
  }

  /**
   * Generate hash for data deduplication
   */
  private generateDataHash(data: any[]): string {
    const crypto = require('crypto');
    const dataString = JSON.stringify(data);
    return crypto.createHash('md5').update(dataString).digest('hex');
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart auto-sync if interval changed and currently running
    if (newConfig.intervalMinutes && this.status.isRunning) {
      this.stopAutoSync();
      this.startAutoSync();
    }
  }

  /**
   * Manual sync trigger with cancellation support
   */
  async triggerManualSync(): Promise<SyncStatus> {
    console.log('🚀 Manual sync triggered with enhanced error handling');

    // Wait for existing sync to complete instead of cancelling
    if (this.isSyncing) {
      console.log('⚠️ Sync already in progress, waiting for completion...');
      // Wait up to 60 seconds for current sync to complete
      for (let i = 0; i < 120; i++) {
        if (!this.isSyncing) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (this.isSyncing) {
        console.log('❌ Previous sync did not complete, skipping manual sync');
        return this.status;
      }
    }

    return await this.performSync();
  }
  
  /**
   * Cancel ongoing sync operation
   */
  cancelSync(): void {
    if (this.syncAbortController && !this.syncAbortController.signal.aborted) {
      console.log('🛑 Cancelling sync operation...');
      this.syncAbortController.abort();
      this.status = {
        ...this.status,
        currentTable: undefined,
        progress: undefined,
        errors: [...(this.status.errors || []), 'Sync cancelled by user']
      };
    }
  }

  /**
   * Update next sync time
   */
  private updateNextSyncTime(): void {
    if (this.status.isRunning && this.status.lastSync) {
      this.status.nextSync = new Date(
        this.status.lastSync.getTime() + (this.config.intervalMinutes * 60 * 1000)
      );
    }
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
   * Default sync configuration
   */
  static getDefaultConfig(clientId: string): SyncConfig {
    return {
      intervalMinutes: 30, // Sync every 30 minutes
      autoStart: true,
      // Removed SALESVOUCHERS and PURCHASEVOUCHERS from auto-sync as they timeout
      // These are synced on-demand via sales-purchase-sync-service
      syncTables: ['COMPANY', 'LEDGER', 'GROUP', 'STOCKITEM', 'COSTCENTRE'],
      clientId
    };
  }

  /**
   * Create EnhancedCloudSyncService with existing TallyService instance
   */
  static create(clientId: string, tallyService: TallyService, supabaseService?: SupabaseService): EnhancedCloudSyncService {
    const config = EnhancedCloudSyncService.getDefaultConfig(clientId);
    return new EnhancedCloudSyncService(config, tallyService, supabaseService);
  }

  /**
   * Get sync configuration
   */
  getConfig(): SyncConfig {
    return { ...this.config };
  }

  /**
   * Get the Supabase service instance
   */
  getSupabaseService(): SupabaseService | undefined {
    return this.supabaseService;
  }
}