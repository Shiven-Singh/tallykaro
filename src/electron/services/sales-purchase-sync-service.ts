/**
 * Sales & Purchase Sync Service
 * Syncs transaction data from Tally ODBC to Supabase
 */

import { TallyService } from './tally-services';
import { SupabaseService } from './supabase-service';
import { TallyXMLAPIService } from './tally-xml-api';

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  errors: string[];
  lastSyncTime: Date;
  tableName: string;
}

export interface SalesVoucher {
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  party_name: string;
  party_ledger_name?: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  net_amount: number;
  reference_number?: string;
  narration?: string;
}

export interface PurchaseVoucher {
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  party_name: string;
  party_ledger_name?: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  net_amount: number;
  reference_number?: string;
  narration?: string;
}

export interface PurchaseOrder {
  stock_item_name: string;
  stock_group?: string;
  stock_category?: string;
  quantity: number;
  rate: number;
  amount: number;
  order_date?: string;
  due_date?: string;
  supplier_name?: string;
  status?: string;
}

export class SalesPurchaseSyncService {
  private tallyService: TallyService;
  private supabaseService: SupabaseService;
  private tallyXMLAPI: TallyXMLAPIService;
  private isSyncing: boolean = false; // Lock to prevent concurrent syncs

  constructor(tallyService: TallyService, supabaseService: SupabaseService) {
    this.tallyService = tallyService;
    this.supabaseService = supabaseService;
    this.tallyXMLAPI = new TallyXMLAPIService({ host: 'localhost', port: 9000 });
  }

  /**
   * Sync sales vouchers from Tally to Supabase using RTSAllVouchers ODBC table
   */
  async syncSalesVouchers(clientId: string, fromDate?: string, toDate?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('⚠️ Sales sync already in progress, skipping...');
      return {
        success: false,
        recordsSynced: 0,
        errors: ['Sync already in progress'],
        lastSyncTime: new Date(),
        tableName: 'sales_vouchers'
      };
    }

    this.isSyncing = true;
    const errors: string[] = [];
    let recordsSynced = 0;
    const tableName = 'sales_vouchers';

    try {
      console.log(`📊 Syncing sales vouchers from Tally using RTSAllVouchers ODBC collection...`);

      // Use RTSAllVouchers collection with proper Fetch attributes in TDL
      // Query format from Stack Overflow: https://stackoverflow.com/a/53654432
      // $VoucherNumber is the actual voucher number, $Reference is the bill reference
      const salesQuery = `SELECT $Date, $VoucherNumber, $Reference, $VouchertypeName, $PartyLedgerName, $$CollectionField:$Amount:1:LedgerEntries FROM RTSAllVouchers WHERE $$IsSales:$VoucherTypeName`;

      console.log('🔍 Executing sales query:', salesQuery);

      // Execute query via TallyService
      const result = await this.tallyService.executeQuery(salesQuery);

      if (!result.success) {
        errors.push(result.error || 'Query execution failed');
        console.error('❌ Sales query failed:', result.error);

        return {
          success: false,
          recordsSynced: 0,
          errors,
          lastSyncTime: new Date(),
          tableName
        };
      }

      const salesData = result.data || [];
      console.log(`✅ Retrieved ${salesData.length} sales vouchers from Tally`);

      if (salesData.length === 0) {
        console.log('⚠️ No sales vouchers found');
        return {
          success: true,
          recordsSynced: 0,
          errors: [],
          lastSyncTime: new Date(),
          tableName
        };
      }

      // Transform data for Supabase - match schema exactly
      // Use $VoucherNumber as the primary identifier, $Reference is the bill reference
      const transformedData = salesData.map((row: any, index: number) => {
        const amount = parseFloat(row['$$CollectionField:$Amount:1:LedgerEntries'] || row.amount || row.AMOUNT || '0');
        const voucherNumber = row.$VoucherNumber || row.voucher_number || row.VOUCHER_NUMBER || `AUTO-${Date.now()}-${index}`;
        const rawDate = row.$Date || row.voucher_date || row.VOUCHER_DATE;
        const billReference = row.$Reference || row.reference_number || row.REFERENCE_NUMBER || null;

        // Convert Tally date format (YYYYMMDD) to SQL date format (YYYY-MM-DD)
        let voucherDate = rawDate;
        if (rawDate && /^\d{8}$/.test(String(rawDate))) {
          // Format: YYYYMMDD -> YYYY-MM-DD
          const dateStr = String(rawDate);
          voucherDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }

        return {
          client_id: clientId,
          voucher_number: voucherNumber,
          voucher_date: voucherDate,
          voucher_type: row.$VouchertypeName || row.voucher_type || row.VOUCHER_TYPE || 'Sales',
          party_name: row.$PartyLedgerName || row.party_name || row.PARTY_NAME || 'Unknown',
          party_ledger_name: row.$PartyLedgerName || row.party_name || row.PARTY_NAME || null,
          total_amount: Math.abs(amount),
          tax_amount: 0,
          discount_amount: 0,
          net_amount: Math.abs(amount),
          reference_number: billReference,
          narration: null,
          synced_at: new Date().toISOString()
        };
      });

      // Upsert to Supabase
      await this.supabaseService.upsertRecords(tableName, transformedData);
      recordsSynced = transformedData.length;

      console.log(`✅ Synced ${recordsSynced} sales vouchers to Supabase`);

      // Skip sync_status update for now - non-critical
      // await this.updateSyncStatus(clientId, tableName, recordsSynced, errors);

      return {
        success: true,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };

    } catch (error) {
      console.error('❌ Sales sync error:', error);
      errors.push(`Critical error: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync purchase vouchers from Tally to Supabase using RTSAllVouchers ODBC table
   */
  async syncPurchaseVouchers(clientId: string, fromDate?: string, toDate?: string): Promise<SyncResult> {
    const errors: string[] = [];
    let recordsSynced = 0;
    const tableName = 'purchase_vouchers';

    try {
      console.log(`📊 Syncing purchase vouchers from Tally using RTSAllVouchers ODBC collection...`);

      // Use RTSAllVouchers collection with proper Fetch attributes in TDL
      // $VoucherNumber is the actual voucher number, $Reference is the bill reference
      const purchaseQuery = `SELECT $Date, $VoucherNumber, $Reference, $VouchertypeName, $PartyLedgerName, $$CollectionField:$Amount:1:LedgerEntries FROM RTSAllVouchers WHERE $$IsPurchase:$VoucherTypeName`;

      console.log('🔍 Executing purchase query:', purchaseQuery);

      // Execute query via TallyService
      const result = await this.tallyService.executeQuery(purchaseQuery);

      if (!result.success) {
        errors.push(result.error || 'Query execution failed');
        console.error('❌ Purchase query failed:', result.error);

        return {
          success: false,
          recordsSynced: 0,
          errors,
          lastSyncTime: new Date(),
          tableName
        };
      }

      const purchaseData = result.data || [];
      console.log(`✅ Retrieved ${purchaseData.length} purchase vouchers from Tally`);

      if (purchaseData.length === 0) {
        console.log('⚠️ No purchase vouchers found');
        return {
          success: true,
          recordsSynced: 0,
          errors: [],
          lastSyncTime: new Date(),
          tableName
        };
      }

      // Transform data for Supabase - match schema exactly
      // Use $VoucherNumber as the primary identifier, $Reference is the bill reference
      const transformedData = purchaseData.map((row: any, index: number) => {
        const amount = parseFloat(row['$$CollectionField:$Amount:1:LedgerEntries'] || row.amount || row.AMOUNT || '0');
        const voucherNumber = row.$VoucherNumber || row.voucher_number || row.VOUCHER_NUMBER || `AUTO-${Date.now()}-${index}`;
        const rawDate = row.$Date || row.voucher_date || row.VOUCHER_DATE;
        const billReference = row.$Reference || row.reference_number || row.REFERENCE_NUMBER || null;

        // Convert Tally date format (YYYYMMDD) to SQL date format (YYYY-MM-DD)
        let voucherDate = rawDate;
        if (rawDate && /^\d{8}$/.test(String(rawDate))) {
          // Format: YYYYMMDD -> YYYY-MM-DD
          const dateStr = String(rawDate);
          voucherDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }

        return {
          client_id: clientId,
          voucher_number: voucherNumber,
          voucher_date: voucherDate,
          voucher_type: row.$VouchertypeName || row.voucher_type || row.VOUCHER_TYPE || 'Purchase',
          party_name: row.$PartyLedgerName || row.party_name || row.PARTY_NAME || 'Unknown',
          party_ledger_name: row.$PartyLedgerName || row.party_name || row.PARTY_NAME || null,
          total_amount: Math.abs(amount),
          tax_amount: 0,
          discount_amount: 0,
          net_amount: Math.abs(amount),
          reference_number: billReference,
          narration: null,
          synced_at: new Date().toISOString()
        };
      });

      // Upsert to Supabase
      await this.supabaseService.upsertRecords(tableName, transformedData);
      recordsSynced = transformedData.length;

      console.log(`✅ Synced ${recordsSynced} purchase vouchers to Supabase`);

      // Skip sync_status update for now - non-critical
      // await this.updateSyncStatus(clientId, tableName, recordsSynced, errors);

      return {
        success: true,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };

    } catch (error) {
      console.error('❌ Purchase sync error:', error);
      errors.push(`Critical error: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };
    }
  }

  /**
   * Update sync status in Supabase
   */
  private async updateSyncStatus(
    clientId: string,
    tableName: string,
    recordsSynced: number,
    errors: string[]
  ): Promise<void> {
    try {
      // Update sync_status with correct column names
      const statusRecord = {
        client_id: clientId,
        table_name: tableName,
        last_sync_at: new Date().toISOString(),
        records_synced: recordsSynced,
        sync_status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        error_message: errors.length > 0 ? errors.join('; ') : null,
        updated_at: new Date().toISOString()
      };

      await this.supabaseService.upsertRecords('sync_status', [statusRecord]);
    } catch (error) {
      console.error('Failed to update sync status (non-critical):', error);
      // Non-critical error - don't throw
    }
  }

  /**
   * Sync purchase orders from Tally to Supabase using POStockItem ODBC table
   */
  async syncPurchaseOrders(clientId: string): Promise<SyncResult> {
    const errors: string[] = [];
    let recordsSynced = 0;
    const tableName = 'purchase_orders';

    try {
      console.log(`📦 Syncing purchase orders from Tally using POStockItem ODBC table...`);

      // Query Tally's Purchase Order tables
      // POStockItem contains stock items with pending purchase orders
      const poQuery = `SELECT $Name, $Parent, $ClosingBalance, $ClosingRate FROM POStockItem`;

      console.log('🔍 Executing purchase order query:', poQuery);

      const result = await this.tallyService.executeQuery(poQuery);

      if (!result.success) {
        errors.push(result.error || 'Purchase order query execution failed');
        console.error('❌ Purchase order query failed:', result.error);

        return {
          success: false,
          recordsSynced: 0,
          errors,
          lastSyncTime: new Date(),
          tableName
        };
      }

      const poData = result.data || [];
      console.log(`✅ Retrieved ${poData.length} purchase order items from Tally`);

      if (poData.length === 0) {
        console.log('⚠️ No purchase order data found');
        return {
          success: true,
          recordsSynced: 0,
          errors: [],
          lastSyncTime: new Date(),
          tableName
        };
      }

      // Transform data for Supabase
      const transformedData = poData.map((row: any, index: number) => {
        const quantity = parseFloat(row.$ClosingBalance || row.ClosingBalance || '0');
        const rate = parseFloat(row.$ClosingRate || row.ClosingRate || '0');
        const amount = quantity * rate;

        return {
          client_id: clientId,
          stock_item_name: row.$Name || row.Name || `Unknown-${index}`,
          stock_group: row.$Parent || row.Parent || null,
          quantity: Math.abs(quantity),
          rate: rate,
          amount: Math.abs(amount),
          order_date: new Date().toISOString().split('T')[0],
          status: quantity > 0 ? 'pending' : 'fulfilled',
          synced_at: new Date().toISOString()
        };
      }).filter(po => po.quantity > 0); // Only include pending orders (quantity > 0)

      if (transformedData.length === 0) {
        console.log('⚠️ No pending purchase orders found');
        return {
          success: true,
          recordsSynced: 0,
          errors: [],
          lastSyncTime: new Date(),
          tableName
        };
      }

      // Upsert to Supabase
      await this.supabaseService.upsertRecords(tableName, transformedData);
      recordsSynced = transformedData.length;

      console.log(`✅ Synced ${recordsSynced} purchase orders to Supabase`);

      return {
        success: true,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };

    } catch (error) {
      console.error('❌ Purchase order sync error:', error);
      errors.push(`Critical error: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        recordsSynced,
        errors,
        lastSyncTime: new Date(),
        tableName
      };
    }
  }

  /**
   * Comprehensive sync - syncs sales, purchases, and purchase orders
   */
  async syncAll(clientId: string, fromDate?: string, toDate?: string): Promise<{
    sales: SyncResult;
    purchases: SyncResult;
    purchaseOrders: SyncResult;
  }> {
    console.log('🚀 Starting comprehensive sales, purchase & PO sync...');

    const [sales, purchases, purchaseOrders] = await Promise.all([
      this.syncSalesVouchers(clientId, fromDate, toDate),
      this.syncPurchaseVouchers(clientId, fromDate, toDate),
      this.syncPurchaseOrders(clientId)
    ]);

    return { sales, purchases, purchaseOrders };
  }
}