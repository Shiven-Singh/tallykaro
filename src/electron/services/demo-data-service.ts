/**
 * Demo Data Service - For Hackathon Submission
 *
 * This replaces real Tally ODBC and Supabase connections with mock data
 * Allows demo to work without any real credentials or database access
 */

export interface DemoCompany {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  financialYearFrom: string;
  financialYearTo: string;
}

export interface DemoLedger {
  name: string;
  parent: string;
  closingBalance: number;
  isDeemedPositive: boolean;
  isRevenue: boolean;
}

export interface DemoStockItem {
  name: string;
  group: string;
  category: string;
  quantity: number;
  rate: number;
  value: number;
  unit: string;
}

export interface DemoSalesVoucher {
  voucherNumber: string;
  voucherDate: string;
  voucherType: string;
  partyName: string;
  totalAmount: number;
  taxAmount: number;
  netAmount: number;
  referenceNumber?: string;
}

export interface DemoPurchaseVoucher {
  voucherNumber: string;
  voucherDate: string;
  voucherType: string;
  partyName: string;
  totalAmount: number;
  taxAmount: number;
  netAmount: number;
  referenceNumber?: string;
}

export class DemoDataService {
  private company: DemoCompany;
  private ledgers: DemoLedger[];
  private stockItems: DemoStockItem[];
  private salesVouchers: DemoSalesVoucher[];
  private purchaseVouchers: DemoPurchaseVoucher[];

  constructor() {
    console.log('🎬 DEMO MODE: Using mock data (no real database connection)');
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Demo Company
    this.company = {
      name: 'TechCorp Enterprises Ltd',
      address: '123 Innovation Street',
      city: 'Tech City',
      state: 'Demo State',
      pincode: '110001',
      financialYearFrom: '2024-04-01',
      financialYearTo: '2025-03-31'
    };

    // Demo Ledgers (realistic accounting structure)
    this.ledgers = [
      { name: 'Cash Account', parent: 'Cash-in-Hand', closingBalance: 125000, isDeemedPositive: true, isRevenue: false },
      { name: 'HDFC Bank - Current', parent: 'Bank Accounts', closingBalance: 450000, isDeemedPositive: true, isRevenue: false },
      { name: 'ICICI Bank - Savings', parent: 'Bank Accounts', closingBalance: 280000, isDeemedPositive: true, isRevenue: false },
      { name: 'Axis Bank - CC', parent: 'Bank OCC A/c', closingBalance: -75000, isDeemedPositive: false, isRevenue: false },

      // Sundry Debtors
      { name: 'Tech Solutions Pvt Ltd', parent: 'Sundry Debtors', closingBalance: 185000, isDeemedPositive: true, isRevenue: false },
      { name: 'Digital Innovations Inc', parent: 'Sundry Debtors', closingBalance: 95000, isDeemedPositive: true, isRevenue: false },
      { name: 'Cloud Services Co', parent: 'Sundry Debtors', closingBalance: 125000, isDeemedPositive: true, isRevenue: false },
      { name: 'Enterprise Systems Ltd', parent: 'Sundry Debtors', closingBalance: 68000, isDeemedPositive: true, isRevenue: false },
      { name: 'Smart Tech Solutions', parent: 'Sundry Debtors', closingBalance: 42000, isDeemedPositive: true, isRevenue: false },

      // Sundry Creditors
      { name: 'Software Suppliers Inc', parent: 'Sundry Creditors', closingBalance: -95000, isDeemedPositive: false, isRevenue: false },
      { name: 'Hardware Distributors', parent: 'Sundry Creditors', closingBalance: -125000, isDeemedPositive: false, isRevenue: false },
      { name: 'Cloud Infrastructure Co', parent: 'Sundry Creditors', closingBalance: -58000, isDeemedPositive: false, isRevenue: false },

      // Revenue
      { name: 'Sales - Software Licenses', parent: 'Sales Accounts', closingBalance: -2500000, isDeemedPositive: false, isRevenue: true },
      { name: 'Sales - Consulting Services', parent: 'Sales Accounts', closingBalance: -1800000, isDeemedPositive: false, isRevenue: true },
      { name: 'Sales - Support & Maintenance', parent: 'Sales Accounts', closingBalance: -950000, isDeemedPositive: false, isRevenue: true },

      // Expenses
      { name: 'Salary & Wages', parent: 'Direct Expenses', closingBalance: 1200000, isDeemedPositive: true, isRevenue: false },
      { name: 'Rent', parent: 'Indirect Expenses', closingBalance: 180000, isDeemedPositive: true, isRevenue: false },
      { name: 'Electricity', parent: 'Indirect Expenses', closingBalance: 45000, isDeemedPositive: true, isRevenue: false },
      { name: 'Internet & Telecom', parent: 'Indirect Expenses', closingBalance: 28000, isDeemedPositive: true, isRevenue: false },
      { name: 'Office Supplies', parent: 'Indirect Expenses', closingBalance: 35000, isDeemedPositive: true, isRevenue: false }
    ];

    // Demo Stock Items
    this.stockItems = [
      { name: 'Enterprise Software License v5.0', group: 'Software Products', category: 'Licenses', quantity: 150, rate: 25000, value: 3750000, unit: 'Nos' },
      { name: 'Professional Edition License', group: 'Software Products', category: 'Licenses', quantity: 85, rate: 15000, value: 1275000, unit: 'Nos' },
      { name: 'Standard Edition License', group: 'Software Products', category: 'Licenses', quantity: 200, rate: 8000, value: 1600000, unit: 'Nos' },
      { name: 'Cloud Storage - 1TB Plan', group: 'Cloud Services', category: 'Subscriptions', quantity: 50, rate: 12000, value: 600000, unit: 'Nos' },
      { name: 'Cloud Storage - 500GB Plan', group: 'Cloud Services', category: 'Subscriptions', quantity: 120, rate: 6000, value: 720000, unit: 'Nos' },
      { name: 'Dell Latitude 5420 Laptop', group: 'Hardware', category: 'IT Equipment', quantity: 25, rate: 65000, value: 1625000, unit: 'Nos' },
      { name: 'HP ProBook 450 G9', group: 'Hardware', category: 'IT Equipment', quantity: 15, rate: 55000, value: 825000, unit: 'Nos' },
      { name: 'USB-C Docking Station', group: 'Hardware', category: 'Accessories', quantity: 40, rate: 8500, value: 340000, unit: 'Nos' },
      { name: 'Wireless Mouse & Keyboard', group: 'Hardware', category: 'Accessories', quantity: 60, rate: 2500, value: 150000, unit: 'Nos' },
      { name: 'Anti-virus License (Annual)', group: 'Software Products', category: 'Security', quantity: 100, rate: 1200, value: 120000, unit: 'Nos' },

      // Some negative stocks (out of stock)
      { name: 'Premium Support Package', group: 'Services', category: 'Support', quantity: -5, rate: 35000, value: -175000, unit: 'Nos' },
      { name: 'Custom Development Hours', group: 'Services', category: 'Development', quantity: -12, rate: 5000, value: -60000, unit: 'Hours' }
    ];

    // Demo Sales Vouchers (realistic pattern for July 2024)
    this.salesVouchers = [
      { voucherNumber: 'SALE-2024-001', voucherDate: '2024-07-02', voucherType: 'Sales', partyName: 'Tech Solutions Pvt Ltd', totalAmount: 250000, taxAmount: 45000, netAmount: 295000, referenceNumber: 'PO-TS-1234' },
      { voucherNumber: 'SALE-2024-002', voucherDate: '2024-07-05', voucherType: 'Sales', partyName: 'Digital Innovations Inc', totalAmount: 180000, taxAmount: 32400, netAmount: 212400, referenceNumber: 'PO-DI-5678' },
      { voucherNumber: 'SALE-2024-003', voucherDate: '2024-07-08', voucherType: 'Sales', partyName: 'Cloud Services Co', totalAmount: 320000, taxAmount: 57600, netAmount: 377600, referenceNumber: 'PO-CS-9012' },
      { voucherNumber: 'SALE-2024-004', voucherDate: '2024-07-10', voucherType: 'Sales', partyName: 'Enterprise Systems Ltd', totalAmount: 150000, taxAmount: 27000, netAmount: 177000 },
      { voucherNumber: 'SALE-2024-005', voucherDate: '2024-07-12', voucherType: 'Sales', partyName: 'Smart Tech Solutions', totalAmount: 95000, taxAmount: 17100, netAmount: 112100 },
      { voucherNumber: 'SALE-2024-006', voucherDate: '2024-07-15', voucherType: 'Sales', partyName: 'Tech Solutions Pvt Ltd', totalAmount: 420000, taxAmount: 75600, netAmount: 495600, referenceNumber: 'PO-TS-1245' },
      { voucherNumber: 'SALE-2024-007', voucherDate: '2024-07-18', voucherType: 'Sales', partyName: 'Digital Innovations Inc', totalAmount: 275000, taxAmount: 49500, netAmount: 324500 },
      { voucherNumber: 'SALE-2024-008', voucherDate: '2024-07-20', voucherType: 'Sales', partyName: 'Cloud Services Co', totalAmount: 185000, taxAmount: 33300, netAmount: 218300 },
      { voucherNumber: 'SALE-2024-009', voucherDate: '2024-07-22', voucherType: 'Sales', partyName: 'Enterprise Systems Ltd', totalAmount: 340000, taxAmount: 61200, netAmount: 401200, referenceNumber: 'PO-ES-3456' },
      { voucherNumber: 'SALE-2024-010', voucherDate: '2024-07-25', voucherType: 'Sales', partyName: 'Smart Tech Solutions', totalAmount: 125000, taxAmount: 22500, netAmount: 147500 },
      { voucherNumber: 'SALE-2024-011', voucherDate: '2024-07-28', voucherType: 'Sales', partyName: 'Tech Solutions Pvt Ltd', totalAmount: 560000, taxAmount: 100800, netAmount: 660800, referenceNumber: 'PO-TS-1256' },

      // Credit notes (negative sales)
      { voucherNumber: 'CN-2024-001', voucherDate: '2024-07-14', voucherType: 'Credit Note', partyName: 'Digital Innovations Inc', totalAmount: -25000, taxAmount: -4500, netAmount: -29500, referenceNumber: 'RETURN-001' },
      { voucherNumber: 'CN-2024-002', voucherDate: '2024-07-26', voucherType: 'Credit Note', partyName: 'Cloud Services Co', totalAmount: -18000, taxAmount: -3240, netAmount: -21240, referenceNumber: 'RETURN-002' },

      // August sales (for date range testing)
      { voucherNumber: 'SALE-2024-012', voucherDate: '2024-08-03', voucherType: 'Sales', partyName: 'Tech Solutions Pvt Ltd', totalAmount: 380000, taxAmount: 68400, netAmount: 448400 },
      { voucherNumber: 'SALE-2024-013', voucherDate: '2024-08-07', voucherType: 'Sales', partyName: 'Digital Innovations Inc', totalAmount: 220000, taxAmount: 39600, netAmount: 259600 },
      { voucherNumber: 'SALE-2024-014', voucherDate: '2024-08-12', voucherType: 'Sales', partyName: 'Enterprise Systems Ltd', totalAmount: 295000, taxAmount: 53100, netAmount: 348100 }
    ];

    // Demo Purchase Vouchers
    this.purchaseVouchers = [
      { voucherNumber: 'PURCH-2024-001', voucherDate: '2024-07-03', voucherType: 'Purchase', partyName: 'Software Suppliers Inc', totalAmount: 180000, taxAmount: 32400, netAmount: 212400, referenceNumber: 'INV-SS-7890' },
      { voucherNumber: 'PURCH-2024-002', voucherDate: '2024-07-06', voucherType: 'Purchase', partyName: 'Hardware Distributors', totalAmount: 250000, taxAmount: 45000, netAmount: 295000 },
      { voucherNumber: 'PURCH-2024-003', voucherDate: '2024-07-11', voucherType: 'Purchase', partyName: 'Cloud Infrastructure Co', totalAmount: 95000, taxAmount: 17100, netAmount: 112100 },
      { voucherNumber: 'PURCH-2024-004', voucherDate: '2024-07-16', voucherType: 'Purchase', partyName: 'Software Suppliers Inc', totalAmount: 320000, taxAmount: 57600, netAmount: 377600, referenceNumber: 'INV-SS-7901' },
      { voucherNumber: 'PURCH-2024-005', voucherDate: '2024-07-21', voucherType: 'Purchase', partyName: 'Hardware Distributors', totalAmount: 185000, taxAmount: 33300, netAmount: 218300 },
      { voucherNumber: 'PURCH-2024-006', voucherDate: '2024-07-27', voucherType: 'Purchase', partyName: 'Cloud Infrastructure Co', totalAmount: 125000, taxAmount: 22500, netAmount: 147500 },

      // Debit notes (negative purchases)
      { voucherNumber: 'DN-2024-001', voucherDate: '2024-07-19', voucherType: 'Debit Note', partyName: 'Hardware Distributors', totalAmount: -22000, taxAmount: -3960, netAmount: -25960, referenceNumber: 'RET-HW-001' },

      // August purchases
      { voucherNumber: 'PURCH-2024-007', voucherDate: '2024-08-05', voucherType: 'Purchase', partyName: 'Software Suppliers Inc', totalAmount: 275000, taxAmount: 49500, netAmount: 324500 },
      { voucherNumber: 'PURCH-2024-008', voucherDate: '2024-08-14', voucherType: 'Purchase', partyName: 'Cloud Infrastructure Co', totalAmount: 165000, taxAmount: 29700, netAmount: 194700 }
    ];
  }

  // Company Data
  async getCompanyInfo(): Promise<DemoCompany> {
    return this.company;
  }

  // Ledger Queries
  async getAllLedgers(): Promise<DemoLedger[]> {
    return this.ledgers;
  }

  async searchLedgers(searchTerm: string): Promise<DemoLedger[]> {
    const term = searchTerm.toLowerCase();
    return this.ledgers.filter(ledger =>
      ledger.name.toLowerCase().includes(term) ||
      ledger.parent.toLowerCase().includes(term)
    );
  }

  async getLedgerByName(name: string): Promise<DemoLedger | null> {
    return this.ledgers.find(l => l.name.toLowerCase() === name.toLowerCase()) || null;
  }

  async getOutstandings(): Promise<DemoLedger[]> {
    // Return debtors and creditors with non-zero balances
    return this.ledgers
      .filter(l =>
        (l.parent === 'Sundry Debtors' || l.parent === 'Sundry Creditors') &&
        l.closingBalance !== 0
      )
      .sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance))
      .slice(0, 10); // Top 10
  }

  // Stock Queries
  async getAllStocks(): Promise<DemoStockItem[]> {
    return this.stockItems;
  }

  async getStocksByFilter(filter: 'all' | 'positive' | 'negative'): Promise<DemoStockItem[]> {
    if (filter === 'positive') {
      return this.stockItems.filter(s => s.quantity > 0);
    } else if (filter === 'negative') {
      return this.stockItems.filter(s => s.quantity < 0);
    }
    return this.stockItems;
  }

  // Sales Queries
  async getSalesVouchers(startDate?: string, endDate?: string): Promise<DemoSalesVoucher[]> {
    if (!startDate && !endDate) {
      return this.salesVouchers;
    }

    return this.salesVouchers.filter(voucher => {
      const vDate = voucher.voucherDate;
      if (startDate && vDate < startDate) return false;
      if (endDate && vDate > endDate) return false;
      return true;
    });
  }

  async getSalesByFilter(filter: 'all' | 'positive' | 'negative', startDate?: string, endDate?: string): Promise<DemoSalesVoucher[]> {
    let vouchers = await this.getSalesVouchers(startDate, endDate);

    if (filter === 'positive') {
      return vouchers.filter(v => v.netAmount > 0);
    } else if (filter === 'negative') {
      return vouchers.filter(v => v.netAmount < 0);
    }
    return vouchers;
  }

  async getHighestSale(startDate?: string, endDate?: string): Promise<DemoSalesVoucher | null> {
    const vouchers = await this.getSalesVouchers(startDate, endDate);
    if (vouchers.length === 0) return null;

    return vouchers.reduce((max, v) =>
      v.netAmount > max.netAmount ? v : max
    );
  }

  async getLowestSale(startDate?: string, endDate?: string): Promise<DemoSalesVoucher | null> {
    const vouchers = await this.getSalesVouchers(startDate, endDate);
    if (vouchers.length === 0) return null;

    return vouchers.reduce((min, v) =>
      v.netAmount < min.netAmount ? v : min
    );
  }

  // Purchase Queries
  async getPurchaseVouchers(startDate?: string, endDate?: string): Promise<DemoPurchaseVoucher[]> {
    if (!startDate && !endDate) {
      return this.purchaseVouchers;
    }

    return this.purchaseVouchers.filter(voucher => {
      const vDate = voucher.voucherDate;
      if (startDate && vDate < startDate) return false;
      if (endDate && vDate > endDate) return false;
      return true;
    });
  }

  async getPurchasesByFilter(filter: 'all' | 'positive' | 'negative', startDate?: string, endDate?: string): Promise<DemoPurchaseVoucher[]> {
    let vouchers = await this.getPurchaseVouchers(startDate, endDate);

    if (filter === 'positive') {
      return vouchers.filter(v => v.netAmount > 0);
    } else if (filter === 'negative') {
      return vouchers.filter(v => v.netAmount < 0);
    }
    return vouchers;
  }

  // Summary Statistics
  getSalesSummary(vouchers: DemoSalesVoucher[]) {
    const totalSales = vouchers.reduce((sum, v) => sum + v.netAmount, 0);
    const totalTax = vouchers.reduce((sum, v) => sum + v.taxAmount, 0);
    const uniqueCustomers = new Set(vouchers.map(v => v.partyName)).size;

    return {
      totalSales,
      transactionCount: vouchers.length,
      averageSale: vouchers.length > 0 ? totalSales / vouchers.length : 0,
      taxAmount: totalTax,
      uniqueCustomers
    };
  }

  getPurchaseSummary(vouchers: DemoPurchaseVoucher[]) {
    const totalPurchases = vouchers.reduce((sum, v) => sum + v.netAmount, 0);
    const totalTax = vouchers.reduce((sum, v) => sum + v.taxAmount, 0);
    const uniqueSuppliers = new Set(vouchers.map(v => v.partyName)).size;

    return {
      totalPurchases,
      transactionCount: vouchers.length,
      averagePurchase: vouchers.length > 0 ? totalPurchases / vouchers.length : 0,
      taxAmount: totalTax,
      uniqueSuppliers
    };
  }
}

// Singleton instance
let demoDataServiceInstance: DemoDataService | null = null;

export function getDemoDataService(): DemoDataService {
  if (!demoDataServiceInstance) {
    demoDataServiceInstance = new DemoDataService();
  }
  return demoDataServiceInstance;
}
