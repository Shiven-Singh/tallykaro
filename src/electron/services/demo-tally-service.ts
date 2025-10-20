/**
 * Demo Tally Service - For Hackathon Submission
 *
 * Provides stub implementations for TallyService methods
 * Works without any real Tally ODBC connection
 */

export class DemoTallyService {
  private connected: boolean = false;

  isConnected(): boolean {
    return this.connected;
  }

  async getAvailableCompanies(): Promise<any> {
    console.log('🎬 Demo mode: Returning demo companies');
    return {
      success: true,
      companies: ['TechCorp Enterprises Ltd'],
      message: 'Demo mode - 1 company available'
    };
  }

  async connect(config: any): Promise<any> {
    console.log('🎬 Demo mode: Simulating Tally connection');
    this.connected = true;
    return {
      success: true,
      message: 'Connected to demo company: TechCorp Enterprises Ltd',
      company: 'TechCorp Enterprises Ltd'
    };
  }

  async disconnect(): Promise<any> {
    console.log('🎬 Demo mode: Simulating disconnect');
    this.connected = false;
    return { success: true };
  }

  async getCompanyInfo(): Promise<any> {
    return {
      success: true,
      company: {
        name: 'TechCorp Enterprises Ltd',
        address: '123 Business Park, Tech District',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        financialYearFrom: '2024-04-01',
        financialYearTo: '2025-03-31'
      }
    };
  }

  async getLedgers(): Promise<any> {
    return {
      success: true,
      ledgers: [
        { name: 'Cash', parent: 'Cash-in-Hand', closingBalance: 50000 },
        { name: 'HDFC Bank', parent: 'Bank Accounts', closingBalance: 250000 },
        { name: 'Sales', parent: 'Sales Accounts', closingBalance: 0 }
      ]
    };
  }

  // Stub methods for other TallyService functions
  async executeQuery(query: string): Promise<any> {
    console.log('🎬 Demo mode: Query execution not available in demo');
    return { success: false, error: 'Query execution not available in demo mode' };
  }
}

// Singleton instance
let demoTallyServiceInstance: DemoTallyService | null = null;

export function getDemoTallyService(): DemoTallyService {
  if (!demoTallyServiceInstance) {
    demoTallyServiceInstance = new DemoTallyService();
    console.log('🎬 DEMO MODE: Using simulated Tally service (no ODBC connection)');
  }
  return demoTallyServiceInstance;
}
