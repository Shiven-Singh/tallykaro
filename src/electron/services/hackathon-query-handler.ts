/**
 * Hackathon Query Handler - Demonstration Version
 *
 * This handler integrates:
 * - Demo Data Service (replaces Tally ODBC + Supabase)
 * - Demo Bedrock Service (simulates AWS Bedrock Agent)
 *
 * Works WITHOUT any real credentials or database connections
 */

import { getDemoDataService, DemoDataService } from './demo-data-service';
import { getDemoBedrockService, DemoBedrockService } from './demo-bedrock-service';

export interface QueryResult {
  success: boolean;
  response: string;
  data?: any[];
  type: 'smart_query' | 'general' | 'sql';
  executionTime?: number;
  error?: string;
}

export class HackathonQueryHandler {
  private demoData: DemoDataService;
  private demoBedrock: DemoBedrockService;

  constructor() {
    this.demoData = getDemoDataService();
    this.demoBedrock = getDemoBedrockService();
    console.log('🎯 Hackathon Query Handler initialized (DEMO MODE)');
  }

  /**
   * Main query processing method
   * Routes queries through simulated Bedrock agent to appropriate data services
   */
  async processQuery(userQuery: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      console.log(`\n📝 Processing query: "${userQuery}"`);

      // Step 1: Get Bedrock agent analysis
      const bedrockResponse = await this.demoBedrock.processQuery(userQuery);
      console.log(`🤖 Bedrock analysis:`, bedrockResponse);

      // Step 2: Execute data retrieval based on analysis
      if (!bedrockResponse.requiresExecution) {
        // Just return the Bedrock response (no data needed)
        return {
          success: true,
          response: bedrockResponse.response,
          type: 'general',
          executionTime: Date.now() - startTime
        };
      }

      // Step 3: Route to appropriate data service
      const dataType = bedrockResponse.data;
      let result: any;

      switch (dataType) {
        // Company queries
        case 'company_info':
          result = await this.handleCompanyQuery();
          break;

        // Sales queries
        case 'sales_all':
          result = await this.handleSalesQuery('all', userQuery);
          break;
        case 'sales_positive':
          result = await this.handleSalesQuery('positive', userQuery);
          break;
        case 'sales_negative':
          result = await this.handleSalesQuery('negative', userQuery);
          break;
        case 'sales_highest':
          result = await this.handleHighestSale(userQuery);
          break;
        case 'sales_lowest':
          result = await this.handleLowestSale(userQuery);
          break;

        // Purchase queries
        case 'purchase_all':
          result = await this.handlePurchaseQuery('all', userQuery);
          break;
        case 'purchase_negative':
          result = await this.handlePurchaseQuery('negative', userQuery);
          break;

        // Stock queries
        case 'stock_all':
          result = await this.handleStockQuery('all');
          break;
        case 'stock_positive':
          result = await this.handleStockQuery('positive');
          break;
        case 'stock_negative':
          result = await this.handleStockQuery('negative');
          break;

        // Ledger queries
        case 'ledger_all':
          result = await this.handleLedgerQuery();
          break;
        case 'outstanding_all':
          result = await this.handleOutstandingQuery();
          break;
        default:
          // Ledger search
          if (dataType?.startsWith('ledger_search:')) {
            const searchTerm = dataType.split(':')[1];
            result = await this.handleLedgerSearch(searchTerm);
          } else {
            throw new Error(`Unknown data type: ${dataType}`);
          }
      }

      return {
        success: true,
        response: bedrockResponse.response + '\n\n' + result.summary,
        data: result.data,
        type: 'smart_query',
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Query processing error:', error);
      return {
        success: false,
        response: 'An error occurred while processing your query.',
        error: error instanceof Error ? error.message : String(error),
        type: 'general',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Parse date range from query (simplified version)
   */
  private parseDateRange(query: string): { startDate?: string; endDate?: string } {
    const queryLower = query.toLowerCase();

    // July 2024
    if (queryLower.includes('july') || queryLower.includes('जुलाई')) {
      return { startDate: '2024-07-01', endDate: '2024-07-31' };
    }

    // August 2024
    if (queryLower.includes('august') || queryLower.includes('अगस्त')) {
      return { startDate: '2024-08-01', endDate: '2024-08-31' };
    }

    // This month (assuming current month for demo)
    if (queryLower.includes('this month') || queryLower.includes('is mahine')) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      };
    }

    return {};
  }

  // Handler methods for different query types

  private async handleCompanyQuery() {
    const company = await this.demoData.getCompanyInfo();
    return {
      data: [company],
      summary: `**Company Information:**\n\n` +
        `**Name:** ${company.name}\n` +
        `**Address:** ${company.address}, ${company.city}, ${company.state} - ${company.pincode}\n` +
        `**Financial Year:** ${company.financialYearFrom} to ${company.financialYearTo}`
    };
  }

  private async handleSalesQuery(filter: 'all' | 'positive' | 'negative', query: string) {
    const { startDate, endDate } = this.parseDateRange(query);
    const vouchers = await this.demoData.getSalesByFilter(filter, startDate, endDate);
    const summary = this.demoData.getSalesSummary(vouchers);

    let filterText = '';
    if (filter === 'positive') filterText = ' (Positive Sales)';
    else if (filter === 'negative') filterText = ' (Credit Notes/Returns)';

    let periodText = '';
    if (startDate && endDate) {
      periodText = ` from ${startDate} to ${endDate}`;
    }

    return {
      data: vouchers,
      summary: `**Sales Summary${filterText}${periodText}:**\n\n` +
        `📊 **Total Sales:** ₹${summary.totalSales.toLocaleString('en-IN')}\n` +
        `📝 **Transaction Count:** ${summary.transactionCount}\n` +
        `💰 **Average Sale:** ₹${summary.averageSale.toLocaleString('en-IN')}\n` +
        `🏷️ **Tax Amount:** ₹${summary.taxAmount.toLocaleString('en-IN')}\n` +
        `👥 **Unique Customers:** ${summary.uniqueCustomers}`
    };
  }

  private async handleHighestSale(query: string) {
    const { startDate, endDate } = this.parseDateRange(query);
    const highestSale = await this.demoData.getHighestSale(startDate, endDate);

    if (!highestSale) {
      return {
        data: [],
        summary: 'No sales found for the specified period.'
      };
    }

    return {
      data: [highestSale],
      summary: `**Highest Sale:**\n\n` +
        `🏆 **Voucher:** ${highestSale.voucherNumber}\n` +
        `📅 **Date:** ${highestSale.voucherDate}\n` +
        `👤 **Customer:** ${highestSale.partyName}\n` +
        `💰 **Amount:** ₹${highestSale.netAmount.toLocaleString('en-IN')}\n` +
        `🏷️ **Tax:** ₹${highestSale.taxAmount.toLocaleString('en-IN')}`
    };
  }

  private async handleLowestSale(query: string) {
    const { startDate, endDate } = this.parseDateRange(query);
    const lowestSale = await this.demoData.getLowestSale(startDate, endDate);

    if (!lowestSale) {
      return {
        data: [],
        summary: 'No sales found for the specified period.'
      };
    }

    return {
      data: [lowestSale],
      summary: `**Lowest Sale:**\n\n` +
        `📝 **Voucher:** ${lowestSale.voucherNumber}\n` +
        `📅 **Date:** ${lowestSale.voucherDate}\n` +
        `👤 **Customer:** ${lowestSale.partyName}\n` +
        `💰 **Amount:** ₹${lowestSale.netAmount.toLocaleString('en-IN')}\n` +
        `🏷️ **Tax:** ₹${lowestSale.taxAmount.toLocaleString('en-IN')}`
    };
  }

  private async handlePurchaseQuery(filter: 'all' | 'positive' | 'negative', query: string) {
    const { startDate, endDate } = this.parseDateRange(query);
    const vouchers = await this.demoData.getPurchasesByFilter(filter, startDate, endDate);
    const summary = this.demoData.getPurchaseSummary(vouchers);

    let filterText = '';
    if (filter === 'positive') filterText = ' (Positive Purchases)';
    else if (filter === 'negative') filterText = ' (Debit Notes/Returns)';

    let periodText = '';
    if (startDate && endDate) {
      periodText = ` from ${startDate} to ${endDate}`;
    }

    return {
      data: vouchers,
      summary: `**Purchase Summary${filterText}${periodText}:**\n\n` +
        `📊 **Total Purchases:** ₹${summary.totalPurchases.toLocaleString('en-IN')}\n` +
        `📝 **Transaction Count:** ${summary.transactionCount}\n` +
        `💰 **Average Purchase:** ₹${summary.averagePurchase.toLocaleString('en-IN')}\n` +
        `🏷️ **Tax Amount:** ₹${summary.taxAmount.toLocaleString('en-IN')}\n` +
        `🏢 **Unique Suppliers:** ${summary.uniqueSuppliers}`
    };
  }

  private async handleStockQuery(filter: 'all' | 'positive' | 'negative') {
    const stocks = await this.demoData.getStocksByFilter(filter);

    let filterText = '';
    if (filter === 'positive') filterText = ' (In Stock)';
    else if (filter === 'negative') filterText = ' (Out of Stock)';

    const totalValue = stocks.reduce((sum, s) => sum + s.value, 0);
    const totalQuantity = stocks.reduce((sum, s) => sum + s.quantity, 0);

    return {
      data: stocks,
      summary: `**Stock Summary${filterText}:**\n\n` +
        `📦 **Total Items:** ${stocks.length}\n` +
        `📊 **Total Quantity:** ${totalQuantity.toLocaleString('en-IN')}\n` +
        `💰 **Total Value:** ₹${totalValue.toLocaleString('en-IN')}`
    };
  }

  private async handleLedgerQuery() {
    const ledgers = await this.demoData.getAllLedgers();

    const totalDr = ledgers.filter(l => l.closingBalance > 0).reduce((sum, l) => sum + l.closingBalance, 0);
    const totalCr = ledgers.filter(l => l.closingBalance < 0).reduce((sum, l) => sum + Math.abs(l.closingBalance), 0);

    return {
      data: ledgers,
      summary: `**Ledger Summary:**\n\n` +
        `📚 **Total Ledgers:** ${ledgers.length}\n` +
        `📈 **Total Debit:** ₹${totalDr.toLocaleString('en-IN')}\n` +
        `📉 **Total Credit:** ₹${totalCr.toLocaleString('en-IN')}`
    };
  }

  private async handleLedgerSearch(searchTerm: string) {
    const ledgers = await this.demoData.searchLedgers(searchTerm);

    if (ledgers.length === 0) {
      return {
        data: [],
        summary: `No ledgers found matching "${searchTerm}". Please try a different search term.`
      };
    }

    if (ledgers.length === 1) {
      const ledger = ledgers[0];
      const balance = Math.abs(ledger.closingBalance);
      const type = ledger.closingBalance >= 0 ? 'Dr' : 'Cr';

      return {
        data: ledgers,
        summary: `**${ledger.name}**\n\n` +
          `📂 **Group:** ${ledger.parent}\n` +
          `💰 **Closing Balance:** ₹${balance.toLocaleString('en-IN')} ${type}`
      };
    }

    return {
      data: ledgers,
      summary: `Found ${ledgers.length} ledgers matching "${searchTerm}". Click on a ledger to see details.`
    };
  }

  private async handleOutstandingQuery() {
    const outstandings = await this.demoData.getOutstandings();

    const totalDr = outstandings.filter(l => l.closingBalance > 0).reduce((sum, l) => sum + l.closingBalance, 0);
    const totalCr = outstandings.filter(l => l.closingBalance < 0).reduce((sum, l) => sum + Math.abs(l.closingBalance), 0);

    return {
      data: outstandings,
      summary: `**Outstanding Summary (Top ${outstandings.length}):**\n\n` +
        `📈 **Total Receivables:** ₹${totalDr.toLocaleString('en-IN')}\n` +
        `📉 **Total Payables:** ₹${Math.abs(totalCr).toLocaleString('en-IN')}\n` +
        `💼 **Net Position:** ₹${(totalDr - Math.abs(totalCr)).toLocaleString('en-IN')}`
    };
  }
}

// Singleton instance
let hackathonHandlerInstance: HackathonQueryHandler | null = null;

export function getHackathonQueryHandler(): HackathonQueryHandler {
  if (!hackathonHandlerInstance) {
    hackathonHandlerInstance = new HackathonQueryHandler();
  }
  return hackathonHandlerInstance;
}
