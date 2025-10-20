import { TallyService } from './tally-services';
import { S3Service } from './s3-service';

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
}

export class CloudSyncService {
  private tallyService: TallyService;
  private s3Service: S3Service;
  private syncInterval: NodeJS.Timeout | null = null;
  private config: SyncConfig;
  private status: SyncStatus = { isRunning: false };

  constructor(config: SyncConfig, tallyService: TallyService) {
    this.tallyService = tallyService; // Use the existing connected instance
    this.s3Service = new S3Service();
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
   * Perform complete data sync
   */
  async performSync(): Promise<SyncStatus> {
    console.log('Starting Tally data sync...');
    
    const startTime = Date.now();
    const errors: string[] = [];
    const uploadedFiles: string[] = [];
    let totalRecords = 0;

    try {
      // Step 1: Check Tally connection
      if (!this.tallyService.isConnected()) {
        throw new Error('Tally not connected. Please connect to Tally first.');
      }

      // Step 2: Extract data from all configured tables
      for (const tableName of this.config.syncTables) {
        try {
          console.log(`Syncing ${tableName} table...`);
          
          const data = await this.extractTableData(tableName);
          if (data && data.length > 0) {
            
            // Step 3: Upload to S3
            const uploadKey = await this.uploadTableToS3(tableName, data);
            uploadedFiles.push(uploadKey);
            totalRecords += data.length;
            
            console.log(` ${tableName}: ${data.length} records synced`);
          } else {
            console.log(`� ${tableName}: No data found`);
          }
          
        } catch (tableError) {
          const errorMsg = `${tableName}: ${this.extractErrorMessage(tableError)}`;
          errors.push(errorMsg);
          console.error(`L ${errorMsg}`);
        }
      }

      // Step 4: Update sync status
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        totalRecords,
        errors: errors.length > 0 ? errors : undefined,
        uploadedFiles
      };
      
      this.updateNextSyncTime();

      console.log(` Sync completed in ${Date.now() - startTime}ms`);
      console.log(`=� Total records: ${totalRecords}, Files: ${uploadedFiles.length}, Errors: ${errors.length}`);

      return this.status;

    } catch (error) {
      const errorMsg = this.extractErrorMessage(error);
      console.error('L Sync failed:', errorMsg);
      
      this.status = {
        isRunning: this.status.isRunning,
        lastSync: new Date(),
        errors: [errorMsg]
      };
      
      return this.status;
    }
  }

  /**
   * Extract data from specific Tally table
   */
  private async extractTableData(tableName: string): Promise<any[]> {
    const queries: { [key: string]: string } = {
      'COMPANY': 'SELECT * FROM COMPANY',
      'LEDGER': 'SELECT $Name, $Parent, $ClosingBalance, $Address, $Phone FROM LEDGER',
      'GROUP': 'SELECT $Name, $Parent, $ClosingBalance FROM GROUP',
      'STOCKITEM': 'SELECT $Name, $Parent, $ClosingBalance, $ClosingRate FROM STOCKITEM',
      'COSTCENTRE': 'SELECT $Name, $Parent FROM COSTCENTRE'
    };

    const query = queries[tableName.toUpperCase()];
    if (!query) {
      throw new Error(`No query defined for table: ${tableName}`);
    }

    const result = await this.tallyService.executeQuery(query);
    if (!result.success) {
      throw new Error(result.error || 'Query failed');
    }

    return result.data || [];
  }

  /**
   * Upload table data to S3 with smart deduplication
   */
  private async uploadTableToS3(tableName: string, data: any[]): Promise<string> {
    // Create data hash for deduplication
    const dataHash = this.generateDataHash(data);
    
    // Check if this exact data already exists
    const existingData = await this.s3Service.getTallyData(this.config.clientId, tableName);
    if (existingData && existingData.length > 0) {
      const existingHash = this.generateDataHash(existingData);
      if (existingHash === dataHash) {
        console.log(`📋 ${tableName}: Data unchanged, skipping upload`);
        return `tally-data/${this.config.clientId}/${tableName.toLowerCase()}-latest.json`;
      }
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
   * Manual sync trigger
   */
  async triggerManualSync(): Promise<SyncStatus> {
    console.log('Manual sync triggered');
    return await this.performSync();
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
      syncTables: ['COMPANY', 'LEDGER', 'GROUP', 'STOCKITEM', 'COSTCENTRE'],
      clientId
    };
  }

  /**
   * Create CloudSyncService with existing TallyService instance
   */
  static create(clientId: string, tallyService: TallyService): CloudSyncService {
    const config = CloudSyncService.getDefaultConfig(clientId);
    return new CloudSyncService(config, tallyService);
  }

  /**
   * Get sync configuration
   */
  getConfig(): SyncConfig {
    return { ...this.config };
  }
}