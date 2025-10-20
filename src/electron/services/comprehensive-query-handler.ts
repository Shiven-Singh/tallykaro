/**
 * Comprehensive Query Handler for TallyKaro WhatsApp System
 * Handles all query categories shown in the user requirements image
 */

import { TallyService } from './tally-services';
import { PDFService } from './pdf-service';

export interface QueryCategory {
  id: string;
  name: string;
  keywords: string[];
  handlers: string[];
}

export interface QueryResult {
  success: boolean;
  category: string;
  response: string;
  data?: any;
  responseType: 'text' | 'document' | 'list';
  executionTime: number;
}

export class ComprehensiveQueryHandler {
  private tallyService: TallyService;
  private pdfService: PDFService;

  // Query categories based on the image requirements
  private readonly queryCategories: QueryCategory[] = [
    {
      id: 'company',
      name: 'Company Information',
      keywords: ['company address', 'my address', 'company details', 'company info', 'my company', 'address', 'company'],
      handlers: ['handleCompanyInfo', 'handleCompanyAddress']
    },
    {
      id: 'sales',
      name: 'Sales',
      keywords: ['sales', 'revenue', 'income', 'show me', 'what are', 'send me', 'how much', 'show sale', 'sales by', 'give me', 'what is', 'sales trend', 'sales invoice', 'share sale'],
      handlers: ['handleSalesQueries', 'handleSalesTrends', 'handleSalesInvoices']
    },
    {
      id: 'purchase',
      name: 'Purchase',
      keywords: ['purchase', 'purchases', 'total purch', 'share purch', 'what\'s th'],
      handlers: ['handlePurchaseQueries', 'handlePurchaseReports']
    },
    {
      id: 'ledger',
      name: 'Ledger',
      keywords: ['ledger', 'trial balance', 'profit & loss', 'balance sheet', 'show led', 'what is th', 'give me a', 'how much'],
      handlers: ['handleLedgerQueries', 'handleTrialBalance', 'handlePandL', 'handleBalanceSheet']
    },
    {
      id: 'outstanding',
      name: 'Outstanding',
      keywords: ['outstanding', 'receivables', 'payables', 'who has r', 'total outs', 'list all ove', 'show out'],
      handlers: ['handleOutstandingQueries', 'handleReceivables', 'handlePayables']
    },
    {
      id: 'cash_bank',
      name: 'Cash & Bank',
      keywords: ['cash', 'bank', 'cash in ha', 'show my', 'total cash', 'show ban', 'give me c', 'send me i'],
      handlers: ['handleCashQueries', 'handleBankQueries', 'handleCashFlow']
    },
    {
      id: 'inventory',
      name: 'Inventory',
      keywords: ['inventory', 'stock', 'stock sum', 'show inve', 'send me s', 'what is m'],
      handlers: ['handleInventoryQueries', 'handleStockSummary', 'handleStockReports']
    },
    {
      id: 'invoices',
      name: 'Invoices',
      keywords: ['invoice', 'invoices', 'bill', 'share tod', 'show all p', 'invoice re', 'bill summ'],
      handlers: ['handleInvoiceQueries', 'handleTodayInvoices', 'handlePendingInvoices']
    },
    {
      id: 'reminder',
      name: 'Reminder',
      keywords: ['remind', 'reminder', 'set remin', 'show me', 'what task', 'pending'],
      handlers: ['handleReminderQueries', 'handleTaskManagement']
    },
    {
      id: 'analytical',
      name: 'Analytical',
      keywords: ['highest', 'maximum', 'top', 'most', 'largest', 'analytical'],
      handlers: ['handleAnalyticalQueries', 'handleHighestBalance']
    },
    {
      id: 'miscellaneous',
      name: 'Miscellaneous',
      keywords: ['vat return', 'profit mar', 'day book', 'cash flow', 'show me'],
      handlers: ['handleVATQueries', 'handleProfitMargin', 'handleDayBook', 'handleCashFlowReport', 'handleWorkOrders']
    }
  ];

  constructor(tallyService: TallyService, pdfService: PDFService) {
    this.tallyService = tallyService;
    this.pdfService = pdfService;
  }

  /**
   * Main query processing function
   */
  async processQuery(userQuery: string): Promise<QueryResult> {
    const startTime = Date.now();
    const query = userQuery.toLowerCase().trim();

    try {
      // Determine query category
      const category = this.determineQueryCategory(query);
      
      if (!category) {
        return {
          success: false,
          category: 'unknown',
          response: 'I couldn\'t understand your query. Please try rephrasing or use specific keywords like "sales", "purchase", "ledger", etc.',
          responseType: 'text',
          executionTime: Date.now() - startTime
        };
      }

      // Route to appropriate handler
      const result = await this.routeToHandler(category.id, query);
      result.executionTime = Date.now() - startTime;
      
      return result;

    } catch (error) {
      console.error('Query processing error:', error);
      return {
        success: false,
        category: 'error',
        response: `Sorry, I encountered an error: ${error}`,
        responseType: 'text',
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Determine query category based on intent analysis
   */
  private determineQueryCategory(query: string): QueryCategory | null {
    const queryLower = query.toLowerCase().trim();
    
    // Exact pattern matching with high specificity
    const exactPatterns = [
      // Company Information - highest priority for address queries
      {
        patterns: [
          'company address', 'my address', 'company details', 'company info', 
          'my company', 'what is my address', 'company ka address', 'address kya hai'
        ],
        category: 'company'
      },
      // Cash & Bank queries - specific patterns
      {
        patterns: [
          'bank balance', 'cash balance', 'mere paas kitna cash', 'bank balance kitna',
          'cash in hand', 'show bank', 'total cash', 'what is bank balance',
          'cash kitna hai', 'bank account balance'
        ],
        category: 'cash_bank'
      },
      // Sales queries - specific patterns only
      {
        patterns: [
          'sales this month', 'my sales', 'sales for', 'total sales', 
          'sales summary', 'sales report', 'what are my sales', 'sales august',
          'sales april', 'sales july', 'sales june', 'sales may', 'sales march',
          'sales february', 'sales january', 'sales september', 'sales october',
          'sales november', 'sales december', 'monthly sales', 'revenue this month', 
          'sales for august month', 'sales for april month', 'sales for july month',
          'sales for june month', 'sales for may month', 'sales for march month',
          'sales for february month', 'sales for january month', 'sales for september month',
          'sales for october month', 'sales for november month', 'sales for december month',
          'sales for june 2023', 'sales for july 2023', 'sales for august 2023',
          'sales for april 2023', 'sales for may 2023', 'sales for march 2023',
          'sales for february 2023', 'sales for january 2023', 'sales for september 2023',
          'sales for october 2023', 'sales for november 2023', 'sales for december 2023',
          'sales for june 2024', 'sales for july 2024', 'sales for august 2024',
          'sales for april 2024', 'sales for may 2024', 'sales for march 2024',
          'what is my sales for', 'show me my sales', 'what are my sales for'
        ],
        category: 'sales'
      },
      // Outstanding queries
      {
        patterns: [
          'outstanding', 'receivables', 'payables', 'who has r', 'total outs', 
          'list all ove', 'show out', 'what are my outstanding', 'pending payments'
        ],
        category: 'outstanding'
      },
      // Inventory queries
      {
        patterns: [
          'stock status', 'inventory', 'stock sum', 'my stock', 'what is my stock',
          'stock items', 'inventory status', 'stock kitna hai'
        ],
        category: 'inventory'
      },
      // Ledger queries
      {
        patterns: [
          'ledger', 'trial balance', 'profit & loss', 'balance sheet', 
          'how many ledgers', 'ledger list', 'all accounts', 'account list'
        ],
        category: 'ledger'
      },
      // Analytical queries - highest balance, maximum balance, etc.
      {
        patterns: [
          'highest balance', 'maximum balance', 'top balance', 'highest closing balance',
          'which company has highest', 'who has maximum balance', 'sabse zyada balance',
          'most balance', 'largest balance', 'who has the highest closing balance',
          'which company has highest closing balance', 'highest closing', 'maximum closing',
          'sabse zyada balance kiska hai', 'sabse zyada', 'maximum kiska', 'highest kiska',
          'top customer', 'largest debtor', 'biggest balance', 'maximum amount'
        ],
        category: 'analytical'
      },
      // Purchase queries
      {
        patterns: [
          'purchase', 'purchases', 'total purch', 'share purch', 'purchase report',
          'what are my purchases', 'purchase summary'
        ],
        category: 'purchase'
      },
      // Invoice queries
      {
        patterns: [
          'invoice', 'invoices', 'bill', 'share tod', 'show all p', 
          'invoice re', 'bill summ', 'today invoices', 'pending invoices'
        ],
        category: 'invoices'
      },
      // Reminder queries
      {
        patterns: [
          'remind', 'reminder', 'set remin', 'what task', 'pending',
          'set reminder', 'task reminder'
        ],
        category: 'reminder'
      }
    ];

    // Check exact patterns first (most specific)
    for (const pattern of exactPatterns) {
      for (const patternText of pattern.patterns) {
        if (queryLower.includes(patternText)) {
          const category = this.queryCategories.find(c => c.id === pattern.category);
          if (category) {
            return category;
          }
        }
      }
    }

    // Check for year patterns in sales queries
    if (queryLower.includes('sales') && /\b(20\d{2})\b/.test(query)) {
      const salesCategory = this.queryCategories.find(c => c.id === 'sales');
      if (salesCategory) {
        return salesCategory;
      }
    }

    // Secondary keyword matching for broader queries
    const keywordMappings = [
      { keywords: ['address'], category: 'company' },
      { keywords: ['cash', 'bank'], category: 'cash_bank' },
      { keywords: ['sales', 'revenue'], category: 'sales' },
      { keywords: ['outstanding', 'receivable'], category: 'outstanding' },
      { keywords: ['stock', 'inventory'], category: 'inventory' },
      { keywords: ['ledger', 'account'], category: 'ledger' },
      { keywords: ['purchase'], category: 'purchase' },
      { keywords: ['invoice', 'bill'], category: 'invoices' },
      { keywords: ['remind'], category: 'reminder' },
      { keywords: ['highest', 'maximum', 'top'], category: 'analytical' },
      { keywords: ['day book', 'daybook', 'work order', 'job order', 'production'], category: 'miscellaneous' }
    ];

    for (const mapping of keywordMappings) {
      for (const keyword of mapping.keywords) {
        if (queryLower.includes(keyword) && !this.isGenericWord(keyword)) {
          const category = this.queryCategories.find(c => c.id === mapping.category);
          if (category) {
            return category;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a keyword is too generic and might cause false positives
   */
  private isGenericWord(keyword: string): boolean {
    const genericWords = ['show me', 'what are', 'send me', 'give me', 'what is', 'show', 'what', 'how', 'give', 'send'];
    return genericWords.includes(keyword);
  }

  /**
   * Get current month name
   */
  private getCurrentMonth(): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[new Date().getMonth()];
  }

  /**
   * Extract date information from query
   */
  private extractDateFromQuery(query: string): {
    hasDateFilter: boolean;
    period?: string;
    month?: string;
    year?: string;
    description: string;
    isToday?: boolean;
    isThisMonth?: boolean;
  } {
    const queryLower = query.toLowerCase();

    // Check for "today" or "today's"
    if (queryLower.includes('today') || queryLower.includes("today's")) {
      return {
        hasDateFilter: true,
        isToday: true,
        description: 'Today',
        period: 'daily'
      };
    }

    // Check for "this month" or "current month"
    if (queryLower.includes('this month') || queryLower.includes('current month')) {
      return {
        hasDateFilter: true,
        isThisMonth: true,
        description: 'This Month',
        period: 'monthly',
        month: this.getCurrentMonth()
      };
    }

    // Check for specific months
    const monthMap: { [key: string]: string } = {
      'january': 'January', 'jan': 'January',
      'february': 'February', 'feb': 'February',
      'march': 'March', 'mar': 'March',
      'april': 'April', 'apr': 'April',
      'may': 'May',
      'june': 'June', 'jun': 'June',
      'july': 'July', 'jul': 'July',
      'august': 'August', 'aug': 'August',
      'september': 'September', 'sep': 'September', 'sept': 'September',
      'october': 'October', 'oct': 'October',
      'november': 'November', 'nov': 'November',
      'december': 'December', 'dec': 'December'
    };

    // Find month in query
    let foundMonth = '';
    for (const [monthKey, monthName] of Object.entries(monthMap)) {
      if (queryLower.includes(monthKey)) {
        foundMonth = monthName;
        break;
      }
    }

    // Extract year from query (4-digit years like 2023, 2024, etc.)
    const yearMatch = query.match(/\b(20\d{2})\b/);
    const foundYear = yearMatch ? yearMatch[1] : '';

    if (foundMonth || foundYear) {
      const description = foundYear ? `${foundMonth || 'Unknown Month'} ${foundYear}` : foundMonth;
      return {
        hasDateFilter: true,
        month: foundMonth,
        year: foundYear,
        description: description,
        period: 'monthly'
      };
    }

    // Check for "last month"
    if (queryLower.includes('last month') || queryLower.includes('previous month')) {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const lastMonthName = this.getMonthName(lastMonth.getMonth());
      return {
        hasDateFilter: true,
        description: `Last Month (${lastMonthName})`,
        period: 'monthly',
        month: lastMonthName
      };
    }

    return {
      hasDateFilter: false,
      description: 'All Time'
    };
  }

  /**
   * Get month name by index
   */
  private getMonthName(monthIndex: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIndex] || 'Unknown';
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(value: any): number {
    if (value === undefined || value === null) return 0;

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      // Handle string amounts like "₹12,63,844.06 Dr" or "—"
      if (value === '—' || value === '-' || value === '') {
        return 0;
      }

      // Extract numeric part from currency string
      const cleanStr = value.replace(/[₹,\s]/g, '');
      const numericMatch = cleanStr.match(/[\d.-]+/);
      if (numericMatch) {
        let amount = parseFloat(numericMatch[0]);
        if (cleanStr.includes('Dr')) {
          amount = Math.abs(amount); // Debit is positive
        } else if (cleanStr.includes('Cr')) {
          amount = -Math.abs(amount); // Credit is negative
        }
        return amount;
      }
    }

    return 0;
  }

  /**
   * Get sales transaction data (alternative method when voucher tables are blocked)
   */
  private async getSalesTransactionData(query: string, dateInfo: any): Promise<QueryResult> {
    try {
      // Try to access alternative transaction data sources
      const transactionQueries = [
        // Try Ledger Entries table if available
        'SELECT $LedgerName, $Amount, $Date, $VoucherType FROM LedgerEntries WHERE $LedgerName LIKE \'%Sales%\' ORDER BY $Date DESC LIMIT 50',

        // Try Company Vouchers table if available
        'SELECT $PartyLedgerName, $Amount, $Date, $VoucherTypeName FROM Voucher WHERE $VoucherTypeName LIKE \'%Sales%\' ORDER BY $Date DESC LIMIT 50',

        // Try alternative voucher access
        'SELECT $Name, $Amount, $Date FROM AllLedgerEntries WHERE $Name LIKE \'%Sales%\' ORDER BY $Date DESC LIMIT 50'
      ];

      for (const sqlQuery of transactionQueries) {
        try {
          const result = await this.tallyService.executeQuery(sqlQuery);
          if (result.success && result.data && result.data.length > 0) {
            return this.formatTransactionData(result.data, query, dateInfo);
          }
        } catch (error) {
          console.log(`Transaction query failed, trying next: ${error}`);
          continue;
        }
      }

      // If no transaction data available, return failure to fall back to ledger balances
      return {
        success: false,
        category: 'Sales',
        response: 'Transaction data not available',
        responseType: 'text',
        executionTime: 0
      };

    } catch (error) {
      console.error('Error getting transaction data:', error);
      return {
        success: false,
        category: 'Sales',
        response: 'Error accessing transaction data',
        responseType: 'text',
        executionTime: 0
      };
    }
  }

  /**
   * Format transaction data for response
   */
  private formatTransactionData(data: any[], query: string, dateInfo: any): QueryResult {
    let response = `📊 **Sales Transactions - ${dateInfo.description}:**\n\n`;
    let totalAmount = 0;
    let transactionCount = 0;

    // Filter and format transaction data
    data.forEach((transaction: any, index: number) => {
      const ledgerName = transaction.$LedgerName || transaction.$PartyLedgerName || transaction.$Name || 'Unknown';
      const amount = this.parseAmount(transaction.$Amount);
      const date = transaction.$Date || 'Unknown Date';
      const voucherType = transaction.$VoucherType || transaction.$VoucherTypeName || 'Sales';

      if (Math.abs(amount) > 0) {
        response += `${transactionCount + 1}. **${ledgerName}**\n`;
        response += `   Amount: ₹${Math.abs(amount).toLocaleString('en-IN')}\n`;
        response += `   Date: ${date}\n`;
        response += `   Type: ${voucherType}\n\n`;

        totalAmount += Math.abs(amount);
        transactionCount++;
      }
    });

    if (transactionCount === 0) {
      response += `❌ **No transactions found for ${dateInfo.description}**\n\n`;
      response += `This could mean:\n`;
      response += `• No sales recorded for this period\n`;
      response += `• Transaction data is not accessible via ODBC\n`;
      response += `• Sales are recorded in different voucher types\n\n`;
      response += `💡 **Try checking ledger balances or use Tally reports**`;
    } else {
      response += `💰 **Total Sales (${dateInfo.description}): ₹${totalAmount.toLocaleString('en-IN')}**\n`;
      response += `📈 **Transaction Count: ${transactionCount}**`;
    }

    return {
      success: true,
      category: 'Sales',
      response: this.addTimestampToResponse(response),
      data: data,
      responseType: 'text',
      executionTime: 0
    };
  }

  /**
   * Add timestamp to response
   */
  private addTimestampToResponse(response: string): string {
    const now = new Date();
    const timestamp = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return `${response}\n\n---\n🕒 **Last Synced:** ${timestamp} IST`;
  }

  /**
   * Route query to appropriate handler
   */
  private async routeToHandler(categoryId: string, query: string): Promise<QueryResult> {
    const category = this.queryCategories.find(c => c.id === categoryId);
    if (!category) {
      throw new Error(`Unknown category: ${categoryId}`);
    }

    // Try handlers in order
    for (const handlerName of category.handlers) {
      try {
        const result = await (this as any)[handlerName](query);
        if (result.success) {
          result.category = category.name;
          return result;
        }
      } catch (error) {
        console.error(`Handler ${handlerName} failed:`, error);
      }
    }

    // Fallback to generic handler
    return this.handleGenericQuery(query, category.name);
  }

  // ==================== COMPANY INFORMATION HANDLERS ====================

  private async handleCompanyInfo(query: string): Promise<QueryResult> {
    const companyQuery = `
      SELECT $Name, $Address, $Phone, $Email
      FROM Company
    `;

    const result = await this.tallyService.executeQuery(companyQuery);
    if (result.success && result.data && result.data.length > 0) {
      const company = result.data[0];
      let response = '🏢 **Company Information:**\n\n';
      
      // Use actual field names from Tally ODBC
      const companyName = company.$Name || company.Name || 'Not Available';
      const address = company.$Address || company.Address || 'Not Available';
      const phone = company.$Phone || company.Phone || 'Not Available';
      const email = company.$Email || company.Email || 'Not Available';
      
      response += `**Company Name:** ${companyName}\n`;
      response += `**Address:** ${address}\n`;
      if (phone !== 'Not Available' && phone !== '—') {
        response += `**Phone:** ${phone}\n`;
      }
      if (email !== 'Not Available' && email !== '—') {
        response += `**Email:** ${email}\n`;
      }

      return {
        success: true,
        category: 'Company Information',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { 
      success: false, 
      category: 'Company Information', 
      response: this.addTimestampToResponse('Company information not found in Tally database'), 
      responseType: 'text', 
      executionTime: 0 
    };
  }

  private async handleCompanyAddress(query: string): Promise<QueryResult> {
    const addressQuery = `
      SELECT $Name, $Address
      FROM Company
    `;

    const result = await this.tallyService.executeQuery(addressQuery);
    if (result.success && result.data && result.data.length > 0) {
      const company = result.data[0];
      let response = '📍 **Company Address:**\n\n';
      
      // Use actual field names from Tally ODBC
      const companyName = company.$Name || company.Name || 'Company Name Not Available';
      const address = company.$Address || company.Address || 'Address not available in Tally database';
      
      response += `**${companyName}**\n`;
      response += `${address}`;

      return {
        success: true,
        category: 'Company Information',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { 
      success: false, 
      category: 'Company Information', 
      response: this.addTimestampToResponse('Company address not found in Tally database'), 
      responseType: 'text', 
      executionTime: 0 
    };
  }

  // ==================== SALES QUERY HANDLERS ====================

  private async handleSalesQueries(query: string): Promise<QueryResult> {
    console.log(`🔍 Processing sales query: "${query}"`);

    // Extract date information from the query
    const dateInfo = this.extractDateFromQuery(query);
    console.log(`📅 Date extracted:`, dateInfo);

    // Try to get transaction data first (if available)
    if (dateInfo.hasDateFilter) {
      const transactionResult = await this.getSalesTransactionData(query, dateInfo);
      if (transactionResult.success) {
        return transactionResult;
      }
    }

    // Multiple fallback queries based on Tally ODBC research
    const salesQueries = [
      // Primary query - Sales Accounts group (most common in Tally)
      'SELECT $Name, $Parent, $ClosingBalance, $OpeningBalance FROM Ledger WHERE $Parent = \'Sales Accounts\' ORDER BY ABS($ClosingBalance) DESC',

      // Fallback 1 - Direct Income and Indirect Income
      'SELECT $Name, $Parent, $ClosingBalance, $OpeningBalance FROM Ledger WHERE $Parent IN (\'Direct Income\', \'Indirect Income\') ORDER BY ABS($ClosingBalance) DESC',

      // Fallback 2 - LIKE patterns for sales-related groups
      'SELECT $Name, $Parent, $ClosingBalance, $OpeningBalance FROM Ledger WHERE $Parent LIKE \'%Sales%\' OR $Parent LIKE \'%Income%\' ORDER BY ABS($ClosingBalance) DESC',

      // Fallback 3 - Check ledger names that contain sales keywords
      'SELECT $Name, $Parent, $ClosingBalance, $OpeningBalance FROM Ledger WHERE $Name LIKE \'%Sales%\' OR $Name LIKE \'%Revenue%\' OR $Name LIKE \'%Income%\' ORDER BY ABS($ClosingBalance) DESC',

      // Fallback 4 - Trading Account (if sales are under trading)
      'SELECT $Name, $Parent, $ClosingBalance, $OpeningBalance FROM Ledger WHERE $Parent = \'Trading Account\' ORDER BY ABS($ClosingBalance) DESC'
    ];

    for (const sqlQuery of salesQueries) {
      try {
        const result = await this.tallyService.executeQuery(sqlQuery);
        if (result.success && result.data && result.data.length > 0) {
          let response = '📊 **Sales & Revenue Summary:**\n\n';
          let totalSales = 0;
          let validSalesCount = 0;

          result.data.forEach((item: any, index: number) => {
            // Handle Tally ODBC field names - these are the actual field names from logs
            const accountName = item.$Name || item.Name || 'Unknown Account';
            const accountType = item.$Parent || item.Parent || 'Unknown Type';

            // Parse the closing balance and opening balance
            const closingBalance = this.parseAmount(item.$ClosingBalance);
            const openingBalance = this.parseAmount(item.$OpeningBalance);

            // Calculate period movement (for date-based queries)
            const periodMovement = Math.abs(closingBalance) - Math.abs(openingBalance);

            let amount = closingBalance;
            let amountStr = '';

            // For date-based queries, show period movement
            if (dateInfo.hasDateFilter && periodMovement !== 0) {
              amount = periodMovement;
              amountStr = `₹${Math.abs(periodMovement).toLocaleString('en-IN')} (Period Movement)`;
            } else {
              amountStr = amount === 0 ? '₹0 (Zero)' : `₹${Math.abs(amount).toLocaleString('en-IN')}`;
            }

            // Show all sales accounts (including zero amounts for transparency)
            response += `${index + 1}. **${accountName}** (${accountType})\n   Amount: ${amountStr}`;

            // Show period details for date queries
            if (dateInfo.hasDateFilter) {
              response += `\n   Opening: ₹${Math.abs(openingBalance).toLocaleString('en-IN')}`;
              response += `\n   Closing: ₹${Math.abs(closingBalance).toLocaleString('en-IN')}`;
            }

            response += '\n\n';
            totalSales += amount;
            validSalesCount++;
          });

          if (validSalesCount === 0) {
            response += `📊 **Sales Status:**\n\n`;
            response += `✅ **No active sales accounts found**\n`;
            response += `• This could mean:\n`;
            response += `  - Sales accounts have zero balance\n`;
            response += `  - No sales transactions recorded yet\n`;
            response += `  - Sales accounts are not properly configured\n\n`;
            response += `💡 **Total Sales: ₹0**`;
          } else {
            const totalSalesStr = dateInfo.hasDateFilter ? 'Period Sales' : 'Total Sales';
            response += `💰 **${totalSalesStr}: ₹${Math.abs(totalSales).toLocaleString('en-IN')}**\n`;
            response += `📈 **Active Sales Accounts: ${validSalesCount}**`;

            if (dateInfo.hasDateFilter) {
              response += `\n🗓️ **Period**: ${dateInfo.description}`;
            }
          }

          return {
            success: true,
            category: 'Sales',
            response: this.addTimestampToResponse(response),
            data: result.data,
            responseType: 'text',
            executionTime: 0
          };
        }
      } catch (error) {
        console.error(`Sales query failed: ${sqlQuery}`, error);
        continue; // Try next query
      }
    }

    // If all queries fail, try a diagnostic query to understand the data structure
    try {
      const diagnosticQuery = 'SELECT DISTINCT $Parent FROM Ledger WHERE $Parent LIKE \'%Sales%\' OR $Parent LIKE \'%Income%\' OR $Parent LIKE \'%Revenue%\' ORDER BY $Parent';
      const diagnosticResult = await this.tallyService.executeQuery(diagnosticQuery);
      
      if (diagnosticResult.success && diagnosticResult.data && diagnosticResult.data.length > 0) {
        let diagnosticResponse = `📊 **Sales Query Result:**\n\n❌ **No sales data found with current queries**\n\n🔍 **Available Sales-related Groups:**\n`;
        diagnosticResult.data.forEach((item: any, index: number) => {
          const groupName = item.$Parent || item.Parent || 'Unknown Group';
          diagnosticResponse += `${index + 1}. ${groupName}\n`;
        });
        diagnosticResponse += `\n💡 **Try these queries in Tally:**\n`;
        diagnosticResponse += `• Check if sales accounts are under different groups\n`;
        diagnosticResponse += `• Verify sales transactions are recorded\n`;
        diagnosticResponse += `• Check Tally ODBC server configuration`;
        
        return { 
          success: true, 
          category: 'Sales', 
          response: this.addTimestampToResponse(diagnosticResponse), 
          responseType: 'text', 
          executionTime: 0 
        };
      }
    } catch (error) {
      console.error('Diagnostic query failed:', error);
    }
    
    // Final fallback message
    return { 
      success: true, 
      category: 'Sales', 
      response: this.addTimestampToResponse(`📊 **Sales Query Result:**\n\n❌ **No sales data found**\n\nThis could mean:\n• Sales accounts are not configured in Tally\n• No sales transactions recorded\n• Sales accounts have zero balance\n• Database connection issue\n\n💡 Try checking your Tally company data or contact support.`), 
      responseType: 'text', 
      executionTime: 0 
    };
  }

  private async handleSalesTrends(query: string): Promise<QueryResult> {
    console.log(`📈 Processing sales trends query: "${query}"`);

    // Extract date information using the enhanced method
    const dateInfo = this.extractDateFromQuery(query);
    console.log(`📅 Date info for trends:`, dateInfo);

    // Always try to get sales data with date context
    const salesResult = await this.handleSalesQueries(query);

    if (salesResult.success) {
      // Enhance the response with trend context
      let enhancedResponse = `📈 **Sales Trends - ${dateInfo.description}:**\n\n`;
      enhancedResponse += salesResult.response;

      // Add trend analysis notes
      if (dateInfo.hasDateFilter) {
        enhancedResponse += `\n\n📊 **Trend Analysis Notes:**\n`;
        enhancedResponse += `• Period analyzed: ${dateInfo.description}\n`;
        enhancedResponse += `• Data source: Tally ledger balances${dateInfo.isToday ? ' (real-time)' : ''}\n`;

        if (dateInfo.isToday) {
          enhancedResponse += `• Today's data: Reflects transactions up to current time\n`;
        } else if (dateInfo.isThisMonth) {
          enhancedResponse += `• Month-to-date: Reflects transactions for current month\n`;
        } else {
          enhancedResponse += `• Historical data: Limited to opening/closing balance differences\n`;
        }

        enhancedResponse += `\n💡 **For detailed transaction-level trends, use Tally ERP reports**`;
      } else {
        enhancedResponse += `\n\n📊 **Current Status:**\n`;
        enhancedResponse += `• Showing cumulative sales balances\n`;
        enhancedResponse += `• For period-specific trends, try: "sales for July", "sales today", "sales this month"\n`;
        enhancedResponse += `• For detailed trends, use Tally ERP date-range reports`;
      }

      return {
        success: true,
        category: 'Sales',
        response: this.addTimestampToResponse(enhancedResponse),
        data: salesResult.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    // Fallback if sales query failed
    return {
      success: true,
      category: 'Sales',
      response: this.addTimestampToResponse(`📈 **Sales Trends - ${dateInfo.description}:**\n\n❌ **No sales data available**\n\nThis could mean:\n• No sales accounts configured\n• No sales transactions recorded\n• Database connectivity issues\n\n💡 **Try:**\n• Check individual ledger accounts\n• Use Tally ERP sales reports\n• Verify Tally ODBC connection`),
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleSalesInvoices(query: string): Promise<QueryResult> {
    // Generate sales invoice report
    const salesResult = await this.handleSalesQueries(query);
    if (salesResult.success) {
      // Generate PDF report
      const pdfResult = await this.pdfService.generateTallyFormatPDF({
        title: 'Sales Report',
        companyName: 'Your Company',
        reportDate: new Date().toLocaleDateString('en-IN'),
        data: salesResult.data,
        type: 'sales'
      });
      if (pdfResult.success) {
        return {
          success: true,
          category: 'Sales',
          response: `📄 Sales report generated successfully!\n\n${salesResult.response}`,
          data: { pdfPath: pdfResult.filePath },
          responseType: 'document',
          executionTime: 0
        };
      }
    }
    return salesResult;
  }

  // ==================== PURCHASE QUERY HANDLERS ====================

  private async handlePurchaseQueries(query: string): Promise<QueryResult> {
    const purchaseQueries = [
      'SELECT $Name as account_name, $Parent as account_type, $ClosingBalance as amount FROM Ledger WHERE $Parent LIKE \'%Purchase%\' OR $Parent = \'Direct Expenses\' ORDER BY ABS($ClosingBalance) DESC',
      'SELECT $Name as account_name, $ClosingBalance as amount FROM Ledger WHERE $Parent IN (\'Purchase Accounts\', \'Direct Expenses\') ORDER BY $ClosingBalance DESC'
    ];

    for (const sqlQuery of purchaseQueries) {
      const result = await this.tallyService.executeQuery(sqlQuery);
      if (result.success && result.data && result.data.length > 0) {
        let response = '🛒 **Purchase Account Summary:**\n\n';
        let totalPurchases = 0;

        result.data.forEach((item: any, index: number) => {
          const accountName = item.account_name || item.$Name || item.Name || 'Unknown Account';
          const amount = Math.abs(parseFloat(item.amount || item.$ClosingBalance || item.ClosingBalance || 0));
          totalPurchases += amount;
          response += `${index + 1}. **${accountName}** - ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        });

        response += `\n💰 **Total Purchase Accounts: ₹${totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**`;

        return {
          success: true,
          category: 'Purchase',
          response,
          data: result.data,
          responseType: 'text',
          executionTime: 0
        };
      }
    }

    return { success: false, category: 'Purchase', response: 'No purchase data found', responseType: 'text', executionTime: 0 };
  }

  private async handlePurchaseReports(query: string): Promise<QueryResult> {
    const purchaseResult = await this.handlePurchaseQueries(query);
    if (purchaseResult.success) {
      const pdfResult = await this.pdfService.generateTallyFormatPDF({
        title: 'Purchase Report',
        companyName: 'Your Company',
        reportDate: new Date().toLocaleDateString('en-IN'),
        data: purchaseResult.data,
        type: 'custom'
      });
      if (pdfResult.success) {
        return {
          success: true,
          category: 'Purchase',
          response: `📄 Purchase report generated successfully!\n\n${purchaseResult.response}`,
          data: { pdfPath: pdfResult.filePath },
          responseType: 'document',
          executionTime: 0
        };
      }
    }
    return purchaseResult;
  }

  // ==================== LEDGER QUERY HANDLERS ====================

  private async handleLedgerQueries(query: string): Promise<QueryResult> {
    // Check if user wants simple list or detailed view
    const wantsSimple = query.toLowerCase().includes('how many') || query.toLowerCase().includes('count') || query.toLowerCase().includes('list');
    
    const ledgerQueries = [
      'SELECT $Name, $Parent, $ClosingBalance FROM Ledger ORDER BY $Name',
      'SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE $ClosingBalance != 0 ORDER BY ABS($ClosingBalance) DESC'
    ];

    for (const sqlQuery of ledgerQueries) {
      const result = await this.tallyService.executeQuery(sqlQuery);
      if (result.success && result.data && result.data.length > 0) {
        let response = '📋 **Ledger Accounts:**\n\n';
        
        if (wantsSimple) {
          // Simple list - just show names and count
          response += `**Total Accounts: ${result.data.length}**\n\n`;
          response += '**Account Names:**\n';
          
          const displayData = result.data.slice(0, 50); // Show first 50 for simple list
          displayData.forEach((item: any, index: number) => {
            const accountName = item.$Name || item.Name || 'Unknown Account';
            response += `${index + 1}. ${accountName}\n`;
          });
          
          if (result.data.length > 50) {
            response += `\n... and ${result.data.length - 50} more accounts`;
          }
        } else {
          // Detailed view with balances
          const displayData = result.data.slice(0, 20);
          
          displayData.forEach((item: any, index: number) => {
            // Use actual field names from Tally ODBC
            const accountName = item.$Name || item.Name || 'Unknown Account';
            const accountGroup = item.$Parent || item.Parent || 'Unknown Group';
            
            // Parse balance - handle string and numeric values
            let balance = 0;
            let balanceStr = ' - ₹0';
            
            if (item.$ClosingBalance !== undefined && item.$ClosingBalance !== null) {
              if (typeof item.$ClosingBalance === 'number') {
                balance = item.$ClosingBalance;
              } else if (typeof item.$ClosingBalance === 'string') {
                if (item.$ClosingBalance === '—' || item.$ClosingBalance === '-') {
                  balance = 0;
                } else {
                  // Handle currency strings like "₹12,63,844.06 Dr"
                  const cleanStr = item.$ClosingBalance.replace(/[₹,\s]/g, '');
                  const numericMatch = cleanStr.match(/[\d.-]+/);
                  if (numericMatch) {
                    balance = parseFloat(numericMatch[0]);
                    if (cleanStr.includes('Dr')) {
                      balance = Math.abs(balance); // Debit is positive
                    } else if (cleanStr.includes('Cr')) {
                      balance = -Math.abs(balance); // Credit is negative
                    }
                  }
                }
              }
            }
            
            if (balance !== 0) {
              balanceStr = ` - ₹${Math.abs(balance).toLocaleString('en-IN')} ${balance >= 0 ? 'Dr' : 'Cr'}`;
            }
            
            response += `${index + 1}. **${accountName}** (${accountGroup})${balanceStr}\n`;
          });

          if (result.data.length > 20) {
            response += `\n... and ${result.data.length - 20} more accounts`;
          }
        }

        return {
          success: true,
          category: 'Ledger',
          response: this.addTimestampToResponse(response),
          data: result.data,
          responseType: 'text',
          executionTime: 0
        };
      }
    }

    return { success: false, category: 'Ledger', response: this.addTimestampToResponse('No ledger data found'), responseType: 'text', executionTime: 0 };
  }

  private async handleTrialBalance(query: string): Promise<QueryResult> {
    const trialBalanceQuery = `
      SELECT 
        $Name as account_name,
        $Parent as account_group,
        CASE WHEN $ClosingBalance >= 0 THEN $ClosingBalance ELSE 0 END as debit_balance,
        CASE WHEN $ClosingBalance < 0 THEN ABS($ClosingBalance) ELSE 0 END as credit_balance
      FROM Ledger 
      WHERE $ClosingBalance != 0
      ORDER BY $Name
    `;

    const result = await this.tallyService.executeQuery(trialBalanceQuery);
    if (result.success && result.data && result.data.length > 0) {
      let response = '⚖️ **Trial Balance:**\n\n';
      let totalDebits = 0;
      let totalCredits = 0;

      result.data.forEach((item: any, index: number) => {
        const debit = parseFloat(item.debit_balance || 0);
        const credit = parseFloat(item.credit_balance || 0);
        totalDebits += debit;
        totalCredits += credit;
        
        response += `${index + 1}. **${item.account_name}**\n`;
        if (debit > 0) response += `   Dr: ₹${debit.toLocaleString('en-IN')}\n`;
        if (credit > 0) response += `   Cr: ₹${credit.toLocaleString('en-IN')}\n`;
        response += '\n';
      });

      response += `💰 **Total Debits: ₹${totalDebits.toLocaleString('en-IN')}**\n`;
      response += `💰 **Total Credits: ₹${totalCredits.toLocaleString('en-IN')}**`;

      return {
        success: true,
        category: 'Ledger',
        response,
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { success: false, category: 'Ledger', response: 'Unable to generate trial balance', responseType: 'text', executionTime: 0 };
  }

  private async handlePandL(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Ledger',
      response: '📊 Profit & Loss statement requires advanced reporting features. Please use Tally ERP for detailed P&L reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleBalanceSheet(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Ledger',
      response: '📊 Balance Sheet requires advanced reporting features. Please use Tally ERP for detailed Balance Sheet reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  // ==================== OUTSTANDING QUERY HANDLERS ====================

  private async handleOutstandingQueries(query: string): Promise<QueryResult> {
    // Check if user is asking for specific company outstanding
    const companyMatch = query.match(/(?:outstanding|balance|due)\s+(?:of|for)\s+([a-zA-Z\s]+)/i);
    if (companyMatch) {
      const companyName = companyMatch[1].trim();
      return await this.handleSpecificCompanyOutstanding(companyName);
    }

    // Check for patterns like "aditya outstanding" or "outstanding aditya"
    const directMatch = query.match(/(?:outstanding|balance|due)\s+([a-zA-Z\s]+)|([a-zA-Z\s]+)\s+(?:outstanding|balance|due)/i);
    if (directMatch) {
      const companyName = (directMatch[1] || directMatch[2]).trim();
      return await this.handleSpecificCompanyOutstanding(companyName);
    }

    // Try to get bill-wise outstandings with due dates from LedgerOutstandings table
    const outstandingWithDatesQuery = `
      SELECT
        $LedgerName as party_name,
        $BillName as bill_reference,
        $BillDate as bill_date,
        $DueDate as due_date,
        $ClosingBalance as amount
      FROM LedgerOutstandings
      WHERE $ClosingBalance <> 0
      ORDER BY ABS($ClosingBalance) DESC
    `;

    // Fallback to simple Ledger query if LedgerOutstandings doesn't work
    const simpleLedgerQuery = `
      SELECT
        CASE WHEN $Parent = 'Sundry Debtors' THEN 'Receivable' ELSE 'Payable' END as type,
        $Name as party_name,
        $ClosingBalance as amount
      FROM Ledger
      WHERE ($Parent = 'Sundry Debtors' OR $Parent = 'Sundry Creditors')
        AND $ClosingBalance <> 0
      ORDER BY ABS($ClosingBalance) DESC
    `;

    // Try detailed query first
    let result = await this.tallyService.executeQuery(outstandingWithDatesQuery);
    let hasDueDates = false;

    // If detailed query fails, use simple query
    if (!result.success || !result.data || result.data.length === 0) {
      console.log('📋 LedgerOutstandings not available, using simple Ledger query');
      result = await this.tallyService.executeQuery(simpleLedgerQuery);
    } else {
      hasDueDates = true;
      console.log('📋 Using LedgerOutstandings with due dates');
    }

    if (result.success && result.data && result.data.length > 0) {
      // Group by party if we have bill-wise data
      const partyMap = new Map<string, {
        bills: any[];
        totalAmount: number;
        type: string;
        earliestDueDate?: Date;
      }>();

      result.data.forEach((item: any) => {
        const partyName = item.party_name || item.$LedgerName || item.$Name || 'Unknown Party';
        const amount = this.parseAmount(item.amount || item.$ClosingBalance);

        if (amount === 0) return;

        // Determine type based on amount sign or parent
        const type = amount > 0 ? 'Receivable' : 'Payable';

        if (!partyMap.has(partyName)) {
          partyMap.set(partyName, {
            bills: [],
            totalAmount: 0,
            type,
            earliestDueDate: undefined
          });
        }

        const party = partyMap.get(partyName)!;
        party.totalAmount += Math.abs(amount);

        // Add bill details if available
        if (hasDueDates) {
          const dueDate = item.due_date || item.$DueDate;
          const billDate = item.bill_date || item.$BillDate;
          const billRef = item.bill_reference || item.$BillName;

          party.bills.push({
            reference: billRef,
            billDate,
            dueDate,
            amount: Math.abs(amount)
          });

          // Track earliest due date
          if (dueDate) {
            const dueDateObj = new Date(dueDate);
            if (!party.earliestDueDate || dueDateObj < party.earliestDueDate) {
              party.earliestDueDate = dueDateObj;
            }
          }
        }
      });

      // Sort parties by total amount (highest to lowest)
      const sortedParties = Array.from(partyMap.entries())
        .sort((a, b) => b[1].totalAmount - a[1].totalAmount);

      let response = '💼 **Outstanding Summary (Sorted by Amount):**\n\n';
      let totalReceivables = 0;
      let totalPayables = 0;

      sortedParties.forEach(([partyName, party]) => {
        const amountStr = `₹${party.totalAmount.toLocaleString('en-IN')}`;

        if (party.type === 'Receivable') {
          totalReceivables += party.totalAmount;
          response += `💰 **${partyName}** owes you: ${amountStr}`;
        } else {
          totalPayables += party.totalAmount;
          response += `💸 You owe **${partyName}**: ${amountStr}`;
        }

        // Add due date if available
        if (party.earliestDueDate) {
          const dueDateStr = party.earliestDueDate.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
          const today = new Date();
          const daysOverdue = Math.floor((today.getTime() - party.earliestDueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysOverdue > 0) {
            response += ` | 🔴 **Due:** ${dueDateStr} (${daysOverdue} days overdue)`;
          } else if (daysOverdue > -7) {
            response += ` | 🟡 **Due:** ${dueDateStr} (due soon)`;
          } else {
            response += ` | 🟢 **Due:** ${dueDateStr}`;
          }
        }

        response += '\n';
      });

      response += `\n📊 **Summary:**\n`;
      response += `💰 Total Receivables: ₹${totalReceivables.toLocaleString('en-IN')}\n`;
      response += `💸 Total Payables: ₹${totalPayables.toLocaleString('en-IN')}\n`;
      response += `📈 Net Position: ₹${(totalReceivables - totalPayables).toLocaleString('en-IN')}`;

      // Prepare data for table display
      const tableData = sortedParties.map(([partyName, party]) => ({
        party_name: partyName,
        type: party.type,
        amount: party.totalAmount,
        due_date: party.earliestDueDate?.toISOString().split('T')[0] || 'N/A',
        days_overdue: party.earliestDueDate
          ? Math.floor((new Date().getTime() - party.earliestDueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      }));

      return {
        success: true,
        category: 'Outstanding',
        response: this.addTimestampToResponse(response),
        data: tableData,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { success: false, category: 'Outstanding', response: this.addTimestampToResponse('No outstanding amounts found'), responseType: 'text', executionTime: 0 };
  }

  private async handleSpecificCompanyOutstanding(companyName: string): Promise<QueryResult> {
    // Search for companies matching the given name (partial match)
    const specificOutstandingQuery = `
      SELECT 
        CASE WHEN $Parent = 'Sundry Debtors' THEN 'Receivable' ELSE 'Payable' END as type,
        $Name as party_name, 
        $ClosingBalance as amount,
        $Parent as parent_group
      FROM Ledger 
      WHERE ($Parent = 'Sundry Debtors' OR $Parent = 'Sundry Creditors') 
        AND $ClosingBalance <> 0
        AND LOWER($Name) LIKE LOWER('%${companyName}%')
      ORDER BY ABS($ClosingBalance) DESC
    `;

    const result = await this.tallyService.executeQuery(specificOutstandingQuery);
    if (result.success && result.data && result.data.length > 0) {
      let response = `🔍 **Outstanding for companies matching "${companyName}":**\n\n`;
      let totalReceivables = 0;
      let totalPayables = 0;

      result.data.forEach((item: any, index: number) => {
        const partyName = item.party_name || item.$Name || item.Name || 'Unknown Party';
        const type = item.type || (item.$Parent === 'Sundry Debtors' ? 'Receivable' : 'Payable');
        
        // Parse amount - handle string and numeric values
        let amount = 0;
        if (item.amount !== undefined && item.amount !== null) {
          if (typeof item.amount === 'number') {
            amount = item.amount;
          } else if (typeof item.amount === 'string') {
            if (item.amount === '—' || item.amount === '-') {
              amount = 0;
            } else {
              // Handle currency strings like "₹12,63,844.06 Dr"
              const cleanStr = item.amount.replace(/[₹,\s]/g, '');
              const numericMatch = cleanStr.match(/[\d.-]+/);
              if (numericMatch) {
                amount = parseFloat(numericMatch[0]);
                if (cleanStr.includes('Dr')) {
                  amount = Math.abs(amount); // Debit is positive
                } else if (cleanStr.includes('Cr')) {
                  amount = -Math.abs(amount); // Credit is negative
                }
              }
            }
          }
        }
        
        // Skip zero amounts
        if (amount === 0) return;
        
        const amountStr = `₹${Math.abs(amount).toLocaleString('en-IN')}`;
        
        if (type === 'Receivable') {
          totalReceivables += Math.abs(amount);
          response += `💰 **${partyName}** owes you: ${amountStr}\n`;
        } else {
          totalPayables += Math.abs(amount);
          response += `💸 You owe **${partyName}**: ${amountStr}\n`;
        }
      });

      if (totalReceivables === 0 && totalPayables === 0) {
        response += `No outstanding amounts found for companies matching "${companyName}"`;
      } else {
        response += `\n📊 **Summary:**\n`;
        response += `💰 Total Receivables: ₹${totalReceivables.toLocaleString('en-IN')}\n`;
        response += `💸 Total Payables: ₹${totalPayables.toLocaleString('en-IN')}\n`;
        response += `📈 Net Position: ₹${(totalReceivables - totalPayables).toLocaleString('en-IN')}`;
      }

      return {
        success: true,
        category: 'Outstanding',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { 
      success: false, 
      category: 'Outstanding', 
      response: this.addTimestampToResponse(`No companies found matching "${companyName}"`), 
      responseType: 'text', 
      executionTime: 0 
    };
  }

  private async handleReceivables(query: string): Promise<QueryResult> {
    const receivablesQuery = `
      SELECT $Name, $ClosingBalance
      FROM Ledger 
      WHERE $Parent = 'Sundry Debtors' AND $ClosingBalance != 0
      ORDER BY ABS($ClosingBalance) DESC
    `;

    const result = await this.tallyService.executeQuery(receivablesQuery);
    if (result.success && result.data && result.data.length > 0) {
      let response = '💰 **Accounts Receivable:**\n\n';
      let totalReceivables = 0;

      result.data.forEach((item: any, index: number) => {
        // Use actual field names from Tally ODBC
        const customerName = item.$Name || item.Name || item.customer_name || 'Unknown Customer';
        
        // Parse amount - handle string and numeric values
        let amount = 0;
        if (item.$ClosingBalance !== undefined && item.$ClosingBalance !== null) {
          if (typeof item.$ClosingBalance === 'number') {
            amount = item.$ClosingBalance;
          } else if (typeof item.$ClosingBalance === 'string') {
            if (item.$ClosingBalance === '—' || item.$ClosingBalance === '-') {
              amount = 0;
            } else {
              // Handle currency strings like "₹12,63,844.06 Dr"
              const cleanStr = item.$ClosingBalance.replace(/[₹,\s]/g, '');
              const numericMatch = cleanStr.match(/[\d.-]+/);
              if (numericMatch) {
                amount = parseFloat(numericMatch[0]);
                if (cleanStr.includes('Dr')) {
                  amount = Math.abs(amount); // Debit is positive
                } else if (cleanStr.includes('Cr')) {
                  amount = -Math.abs(amount); // Credit is negative
                }
              }
            }
          }
        }
        
        // Skip zero amounts
        if (amount === 0) return;
        
        totalReceivables += Math.abs(amount);
        const amountStr = `₹${Math.abs(amount).toLocaleString('en-IN')}`;
        
        // Add color coding: Green for receivables (money coming to you)
        response += `${index + 1}. **${customerName}** - ${amountStr}\n`;
      });

      response += `\n💰 **Total Receivables: ₹${totalReceivables.toLocaleString('en-IN')}**`;

      return {
        success: true,
        category: 'Outstanding',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { success: false, category: 'Outstanding', response: this.addTimestampToResponse('No receivables found'), responseType: 'text', executionTime: 0 };
  }

  private async handlePayables(query: string): Promise<QueryResult> {
    const payablesQuery = `
      SELECT $Name, $ClosingBalance
      FROM Ledger 
      WHERE $Parent = 'Sundry Creditors' AND $ClosingBalance != 0
      ORDER BY ABS($ClosingBalance) DESC
    `;

    const result = await this.tallyService.executeQuery(payablesQuery);
    if (result.success && result.data && result.data.length > 0) {
      let response = '💸 **Accounts Payable:**\n\n';
      let totalPayables = 0;

      result.data.forEach((item: any, index: number) => {
        // Use actual field names from Tally ODBC
        const supplierName = item.$Name || item.Name || item.supplier_name || 'Unknown Supplier';
        
        // Parse amount - handle string and numeric values
        let amount = 0;
        if (item.$ClosingBalance !== undefined && item.$ClosingBalance !== null) {
          if (typeof item.$ClosingBalance === 'number') {
            amount = item.$ClosingBalance;
          } else if (typeof item.$ClosingBalance === 'string') {
            if (item.$ClosingBalance === '—' || item.$ClosingBalance === '-') {
              amount = 0;
            } else {
              // Handle currency strings like "₹12,63,844.06 Dr"
              const cleanStr = item.$ClosingBalance.replace(/[₹,\s]/g, '');
              const numericMatch = cleanStr.match(/[\d.-]+/);
              if (numericMatch) {
                amount = parseFloat(numericMatch[0]);
                if (cleanStr.includes('Dr')) {
                  amount = Math.abs(amount); // Debit is positive
                } else if (cleanStr.includes('Cr')) {
                  amount = -Math.abs(amount); // Credit is negative
                }
              }
            }
          }
        }
        
        // Skip zero amounts
        if (amount === 0) return;
        
        totalPayables += Math.abs(amount);
        const amountStr = `₹${Math.abs(amount).toLocaleString('en-IN')}`;
        
        // Add color coding: Red for payables (money you owe)
        response += `${index + 1}. **${supplierName}** - ${amountStr}\n`;
      });

      response += `\n💸 **Total Payables: ₹${totalPayables.toLocaleString('en-IN')}**`;

      return {
        success: true,
        category: 'Outstanding',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { success: false, category: 'Outstanding', response: this.addTimestampToResponse('No payables found'), responseType: 'text', executionTime: 0 };
  }

  // ==================== CASH & BANK QUERY HANDLERS ====================

  private async handleCashQueries(query: string): Promise<QueryResult> {
    const cashQuery = `
      SELECT $Name, $ClosingBalance 
      FROM Ledger 
      WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts' 
      ORDER BY $ClosingBalance DESC
    `;

    const result = await this.tallyService.executeQuery(cashQuery);
    if (result.success && result.data && result.data.length > 0) {
      let response = '💵 **Cash & Bank Summary:**\n\n';
      let totalCash = 0;

      result.data.forEach((item: any, index: number) => {
        // Use actual field names from Tally ODBC
        const accountName = item.$Name || item.Name || 'Unknown Account';
        
        // Parse balance - handle string and numeric values
        let balance = 0;
        
        if (item.$ClosingBalance !== undefined && item.$ClosingBalance !== null) {
          if (typeof item.$ClosingBalance === 'number') {
            balance = item.$ClosingBalance;
          } else if (typeof item.$ClosingBalance === 'string') {
            if (item.$ClosingBalance === '—' || item.$ClosingBalance === '-') {
              balance = 0;
            } else {
              // Handle currency strings like "₹12,63,844.06 Dr"
              const cleanStr = item.$ClosingBalance.replace(/[₹,\s]/g, '');
              const numericMatch = cleanStr.match(/[\d.-]+/);
              if (numericMatch) {
                balance = parseFloat(numericMatch[0]);
                if (cleanStr.includes('Dr')) {
                  balance = Math.abs(balance); // Debit is positive
                } else if (cleanStr.includes('Cr')) {
                  balance = -Math.abs(balance); // Credit is negative
                }
              }
            }
          }
        }
        
        // For cash accounts, we need to interpret the balance correctly
        // In Tally, cash accounts typically show credit balance when you have cash
        // Let's use the absolute value for display and calculation
        const displayBalance = Math.abs(balance);
        totalCash += displayBalance; // Always add positive amounts for total
        
        // For cash accounts, any balance (Dr or Cr) means available cash
        // Only show overdraft if the account name suggests it's a loan/overdraft account
        const isOverdraftAccount = accountName.toLowerCase().includes('overdraft') || 
                                   accountName.toLowerCase().includes('loan') ||
                                   accountName.toLowerCase().includes('credit');
        
        if (isOverdraftAccount && balance < 0) {
          response += `${index + 1}. **${accountName}** - ₹${displayBalance.toLocaleString('en-IN')} (Overdraft)\n`;
        } else {
          response += `${index + 1}. **${accountName}** - ₹${displayBalance.toLocaleString('en-IN')} (Available)\n`;
        }
      });

      response += `\n💰 **Total Cash & Bank: ₹${totalCash.toLocaleString('en-IN')}**`;

      return {
        success: true,
        category: 'Cash & Bank',
        response: this.addTimestampToResponse(response),
        data: result.data,
        responseType: 'text',
        executionTime: 0
      };
    }

    return { success: false, category: 'Cash & Bank', response: this.addTimestampToResponse('No cash/bank accounts found'), responseType: 'text', executionTime: 0 };
  }

  private async handleBankQueries(query: string): Promise<QueryResult> {
    return this.handleCashQueries(query); // Same handler for bank queries
  }

  private async handleCashFlow(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Cash & Bank',
      response: '📊 Cash flow analysis requires advanced reporting features. Please use Tally ERP for detailed cash flow reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  // ==================== INVENTORY QUERY HANDLERS ====================

  private async handleInventoryQueries(query: string): Promise<QueryResult> {
    const inventoryQueries = [
      'SELECT $Name, $Parent, $ClosingBalance, $BaseUnits FROM StockItem',
      'SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems',
      'SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE $Parent LIKE \'%Stock%\''
    ];

    for (const sqlQuery of inventoryQueries) {
      const result = await this.tallyService.executeQuery(sqlQuery);
      if (result.success && result.data && result.data.length > 0) {
        // Sort by quantity (highest to lowest) and take top 10
        const sortedData = result.data
          .map((item: any) => ({
            name: item.$Name || item.Name || 'Unknown',
            parent: item.$Parent || item.Parent || item.$StockGroup || 'Unknown',
            quantity: parseFloat(item.$ClosingBalance || item.ClosingBalance || 0),
            unit: item.$BaseUnits || item.BaseUnits || 'Units'
          }))
          .filter((item: any) => Math.abs(item.quantity) > 0)
          .sort((a: any, b: any) => Math.abs(b.quantity) - Math.abs(a.quantity));

        const totalItemsCount = sortedData.length;
        const totalQuantity = sortedData.reduce((sum: number, item: any) => sum + Math.abs(item.quantity), 0);

        // Show only top 10
        const top10 = sortedData.slice(0, 10);

        let response = '📦 **Stock Status (Top 10 by Quantity):**\n\n';

        top10.forEach((item: any, index: number) => {
          response += `${index + 1}. **${item.name}** (${item.parent})\n`;
          response += `   Quantity: ${Math.abs(item.quantity).toLocaleString('en-IN')} ${item.unit}\n\n`;
        });

        response += `📊 **Summary:**\n`;
        response += `• Showing top 10 of ${totalItemsCount} items\n`;
        response += `• Total stock items: ${totalItemsCount.toLocaleString('en-IN')}\n`;
        response += `• Total quantity (all items): ${totalQuantity.toLocaleString('en-IN')}\n\n`;
        response += `💡 **Tip:** Data table below shows 10 items per page with pagination`;

        return {
          success: true,
          category: 'Inventory',
          response,
          data: sortedData, // Return all data for pagination in UI
          responseType: 'text',
          executionTime: 0
        };
      }
    }

    return { success: false, category: 'Inventory', response: 'No inventory data found', responseType: 'text', executionTime: 0 };
  }

  private async handleStockSummary(query: string): Promise<QueryResult> {
    return this.handleInventoryQueries(query); // Same handler
  }

  private async handleStockReports(query: string): Promise<QueryResult> {
    const inventoryResult = await this.handleInventoryQueries(query);
    if (inventoryResult.success) {
      const pdfResult = await this.pdfService.generateTallyFormatPDF({
        title: 'Inventory Report',
        companyName: 'Your Company',
        reportDate: new Date().toLocaleDateString('en-IN'),
        data: inventoryResult.data,
        type: 'stock'
      });
      if (pdfResult.success) {
        return {
          success: true,
          category: 'Inventory',
          response: `📄 Inventory report generated successfully!\n\n${inventoryResult.response}`,
          data: { pdfPath: pdfResult.filePath },
          responseType: 'document',
          executionTime: 0
        };
      }
    }
    return inventoryResult;
  }

  // ==================== INVOICE QUERY HANDLERS ====================

  private async handleInvoiceQueries(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Invoices',
      response: '📄 Invoice queries require access to voucher data. Please use Tally ERP for detailed invoice reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleTodayInvoices(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Invoices',
      response: '📄 Today\'s invoices require date-based voucher queries. Please use Tally ERP for daily invoice reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handlePendingInvoices(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Invoices',
      response: '📄 Pending invoices require voucher status tracking. Please use Tally ERP for pending invoice reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  // ==================== REMINDER QUERY HANDLERS ====================

  private async handleReminderQueries(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Reminder',
      response: '⏰ Reminder system is under development. This feature will allow you to set reminders for payments, follow-ups, and tasks.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleTaskManagement(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Reminder',
      response: '✅ Task management system is under development. This feature will help you track pending tasks and deadlines.',
      responseType: 'text',
      executionTime: 0
    };
  }

  // ==================== ANALYTICAL QUERY HANDLERS ====================

  private async handleAnalyticalQueries(query: string): Promise<QueryResult> {
    // Get all ledgers and sort in JavaScript for better compatibility
    const analyticalQuery = `
      SELECT $Name as name, $Parent as parent, $ClosingBalance as balance
      FROM Ledger
    `;

    const result = await this.tallyService.executeQuery(analyticalQuery);
    console.log('📊 Analytical query result:', {
      success: result.success,
      hasData: !!result.data,
      dataLength: result.data?.length,
      dataType: Array.isArray(result.data) ? 'array' : typeof result.data,
      firstItem: result.data?.[0]
    });

    if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
      // Filter and sort in JavaScript
      const nonZeroBalances = result.data
        .map((item: any) => ({
          name: item.name || item.$Name || 'Unknown',
          parent: item.parent || item.$Parent || 'Unknown',
          balance: this.parseAmount(item.balance || item.$ClosingBalance)
        }))
        .filter((item: any) => Math.abs(item.balance) > 0)
        .sort((a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance))
        .slice(0, 10);

      console.log('📊 Processed data:', {
        totalItems: result.data.length,
        nonZeroCount: nonZeroBalances.length,
        firstItem: nonZeroBalances[0]
      });

      if (nonZeroBalances.length === 0) {
        return {
          success: false,
          category: 'Analytical',
          response: this.addTimestampToResponse('No accounts with non-zero balances found'),
          responseType: 'text',
          executionTime: 0
        };
      }

      let response = '📈 **Top 10 Accounts by Balance:**\n\n';

      nonZeroBalances.forEach((item: any, index: number) => {
        const balance = item.balance;
        const balanceStr = `₹${Math.abs(balance).toLocaleString('en-IN')} ${balance >= 0 ? 'Dr' : 'Cr'}`;
        response += `${index + 1}. **${item.name}** (${item.parent})\n   Balance: ${balanceStr}\n\n`;
      });

      const highest = nonZeroBalances[0];
      const highestBalance = highest.balance;
      response += `🏆 **Highest Balance:** ${highest.name} - ₹${Math.abs(highestBalance).toLocaleString('en-IN')}`;

      return {
        success: true,
        category: 'Analytical',
        response: this.addTimestampToResponse(response),
        data: nonZeroBalances,
        responseType: 'text',
        executionTime: 0
      };
    }

    return {
      success: false,
      category: 'Analytical',
      response: this.addTimestampToResponse('No analytical data found'),
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleHighestBalance(query: string): Promise<QueryResult> {
    const highestBalanceQuery = `
      SELECT $Name as name, $Parent as parent, $ClosingBalance as balance
      FROM Ledger
    `;

    const result = await this.tallyService.executeQuery(highestBalanceQuery);
    console.log('🏆 Highest balance query result:', {
      success: result.success,
      hasData: !!result.data,
      dataLength: result.data?.length,
      dataType: Array.isArray(result.data) ? 'array' : typeof result.data
    });

    if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
      // Find highest balance in JavaScript
      const allLedgers = result.data
        .map((item: any) => ({
          name: item.name || item.$Name || 'Unknown',
          parent: item.parent || item.$Parent || 'Unknown',
          balance: this.parseAmount(item.balance || item.$ClosingBalance)
        }))
        .filter((item: any) => Math.abs(item.balance) > 0)
        .sort((a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance));

      console.log('🏆 Highest balance - processed ledgers:', {
        totalLedgers: result.data.length,
        nonZeroCount: allLedgers.length,
        highest: allLedgers[0]
      });

      if (allLedgers.length === 0) {
        return {
          success: false,
          category: 'Analytical',
          response: this.addTimestampToResponse('No accounts with non-zero balances found'),
          responseType: 'text',
          executionTime: 0
        };
      }

      const account = allLedgers[0];
      const balance = account.balance;
      const balanceStr = `₹${Math.abs(balance).toLocaleString('en-IN')} ${balance >= 0 ? 'Dr' : 'Cr'}`;

      const response = `🏆 **Highest Balance Account:**\n\n**${account.name}**\nAccount Group: ${account.parent}\nBalance: ${balanceStr}`;

      return {
        success: true,
        category: 'Analytical',
        response: this.addTimestampToResponse(response),
        data: [account],
        responseType: 'text',
        executionTime: 0
      };
    }

    return { 
      success: false, 
      category: 'Analytical', 
      response: this.addTimestampToResponse('No account data found for highest balance query'), 
      responseType: 'text', 
      executionTime: 0 
    };
  }

  // ==================== MISCELLANEOUS QUERY HANDLERS ====================

  private async handleVATQueries(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Miscellaneous',
      response: '📋 VAT return queries require tax-specific reporting. Please use Tally ERP for VAT returns and tax reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleProfitMargin(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Miscellaneous',
      response: '📊 Profit margin analysis requires advanced financial calculations. Please use Tally ERP for detailed profit margin reports.',
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleDayBook(query: string): Promise<QueryResult> {
    console.log(`📖 Processing day book query: "${query}"`);

    // Extract date information
    const dateInfo = this.extractDateFromQuery(query);

    try {
      // Try to get day book data using available tables
      const dayBookQueries = [
        // Try to get all ledger entries for the day
        'SELECT $Name, $ClosingBalance, $OpeningBalance, $Parent FROM Ledger WHERE $ClosingBalance != $OpeningBalance ORDER BY $Name',

        // Try to get cash and bank movements
        'SELECT $Name, $ClosingBalance, $OpeningBalance FROM Ledger WHERE ($Parent = \'Cash-in-Hand\' OR $Parent = \'Bank Accounts\') AND $ClosingBalance != $OpeningBalance',

        // Try to get all account movements
        'SELECT $Name, $ClosingBalance, $OpeningBalance, $Parent FROM Ledger ORDER BY $Parent, $Name'
      ];

      for (const sqlQuery of dayBookQueries) {
        try {
          const result = await this.tallyService.executeQuery(sqlQuery);
          if (result.success && result.data && result.data.length > 0) {
            return this.formatDayBookData(result.data, dateInfo);
          }
        } catch (error) {
          console.error(`Day book query failed: ${error}`);
          continue;
        }
      }

      // Fallback response
      return {
        success: true,
        category: 'Miscellaneous',
        response: this.addTimestampToResponse(`📖 **Day Book - ${dateInfo.description}:**\n\n❌ **No transaction data available**\n\nThis could mean:\n• No transactions recorded for today\n• Day book data requires voucher access\n• ODBC connection limitations\n\n💡 **Try using Tally ERP for detailed day book reports**\n\n📋 **Alternative:** Check individual account balances or cash flow`),
        responseType: 'text',
        executionTime: 0
      };

    } catch (error) {
      return {
        success: false,
        category: 'Miscellaneous',
        response: this.addTimestampToResponse(`📖 **Day Book Error:**\n\n❌ Unable to access day book data: ${error}\n\n💡 Please use Tally ERP for day book reports.`),
        responseType: 'text',
        executionTime: 0
      };
    }
  }

  /**
   * Format day book data from ledger movements
   */
  private formatDayBookData(data: any[], dateInfo: any): QueryResult {
    let response = `📖 **Day Book - ${dateInfo.description}:**\n\n`;
    let totalDebits = 0;
    let totalCredits = 0;
    let movementCount = 0;

    // Group by account type
    const groupedData: { [key: string]: any[] } = {};

    data.forEach((item: any) => {
      const parent = item.$Parent || item.Parent || 'Other';
      if (!groupedData[parent]) {
        groupedData[parent] = [];
      }

      const openingBalance = this.parseAmount(item.$OpeningBalance);
      const closingBalance = this.parseAmount(item.$ClosingBalance);
      const movement = closingBalance - openingBalance;

      if (Math.abs(movement) > 0) {
        groupedData[parent].push({
          name: item.$Name || item.Name,
          opening: openingBalance,
          closing: closingBalance,
          movement: movement
        });

        if (movement > 0) {
          totalDebits += movement;
        } else {
          totalCredits += Math.abs(movement);
        }
        movementCount++;
      }
    });

    if (movementCount === 0) {
      response += `❌ **No account movements found**\n\n`;
      response += `This could mean:\n`;
      response += `• No transactions for ${dateInfo.description}\n`;
      response += `• All accounts have same opening/closing balance\n`;
      response += `• Limited data access via ODBC\n\n`;
      response += `💡 **Try checking specific accounts or use Tally reports**`;
    } else {
      // Show movements by group
      Object.entries(groupedData).forEach(([groupName, accounts]) => {
        if (accounts.length > 0) {
          response += `**${groupName}:**\n`;
          accounts.forEach((account: any) => {
            const movementStr = account.movement > 0 ?
              `+₹${account.movement.toLocaleString('en-IN')} Dr` :
              `-₹${Math.abs(account.movement).toLocaleString('en-IN')} Cr`;
            response += `  • ${account.name}: ${movementStr}\n`;
          });
          response += '\n';
        }
      });

      response += `💰 **Summary:**\n`;
      response += `📈 Total Debits: ₹${totalDebits.toLocaleString('en-IN')}\n`;
      response += `📉 Total Credits: ₹${totalCredits.toLocaleString('en-IN')}\n`;
      response += `⚖️ Net Movement: ₹${(totalDebits - totalCredits).toLocaleString('en-IN')}\n`;
      response += `📊 Accounts with Movement: ${movementCount}`;
    }

    return {
      success: true,
      category: 'Miscellaneous',
      response: this.addTimestampToResponse(response),
      data: data,
      responseType: 'text',
      executionTime: 0
    };
  }

  private async handleCashFlowReport(query: string): Promise<QueryResult> {
    return {
      success: true,
      category: 'Miscellaneous',
      response: '📊 Cash flow reports require advanced financial analysis. Please use Tally ERP for detailed cash flow statements.',
      responseType: 'text',
      executionTime: 0
    };
  }

  /**
   * Handle work order queries
   */
  private async handleWorkOrders(query: string): Promise<QueryResult> {
    console.log(`🔧 Processing work order query: "${query}"`);

    try {
      // Try to access work order or manufacturing data
      const workOrderQueries = [
        // Try to get stock items that might be work in progress
        'SELECT $Name, $Parent, $ClosingBalance, $ClosingRate FROM StockItem WHERE $Parent LIKE \'%Work%\' OR $Parent LIKE \'%Production%\' OR $Parent LIKE \'%Manufacturing%\'',

        // Try to get cost centres related to production
        'SELECT $Name, $Parent FROM CostCentre WHERE $Name LIKE \'%Production%\' OR $Name LIKE \'%Manufacturing%\' OR $Name LIKE \'%Work%\'',

        // Try to get ledger accounts related to work orders
        'SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE $Name LIKE \'%Work Order%\' OR $Name LIKE \'%Job Order%\' OR $Name LIKE \'%Production%\' OR $Parent LIKE \'%Manufacturing%\'',

        // Fallback: Get all stock items
        'SELECT $Name, $Parent, $ClosingBalance, $ClosingRate FROM StockItem ORDER BY $Name'
      ];

      for (const sqlQuery of workOrderQueries) {
        try {
          const result = await this.tallyService.executeQuery(sqlQuery);
          if (result.success && result.data && result.data.length > 0) {
            return this.formatWorkOrderData(result.data, query);
          }
        } catch (error) {
          console.error(`Work order query failed: ${error}`);
          continue;
        }
      }

      // Fallback response
      return {
        success: true,
        category: 'Miscellaneous',
        response: this.addTimestampToResponse(`🔧 **Work Orders:**\n\n❌ **No work order data found**\n\nThis could mean:\n• No work orders/job orders configured in Tally\n• Manufacturing module not enabled\n• Work orders are managed differently\n\n💡 **Try:**\n• Check stock items for work-in-progress\n• Use Tally ERP manufacturing reports\n• Check cost centres for production tracking`),
        responseType: 'text',
        executionTime: 0
      };

    } catch (error) {
      return {
        success: false,
        category: 'Miscellaneous',
        response: this.addTimestampToResponse(`🔧 **Work Order Error:**\n\n❌ Unable to access work order data: ${error}\n\n💡 Please use Tally ERP manufacturing module for work order management.`),
        responseType: 'text',
        executionTime: 0
      };
    }
  }

  /**
   * Format work order data
   */
  private formatWorkOrderData(data: any[], query: string): QueryResult {
    let response = `🔧 **Work Orders / Production Status:**\n\n`;
    let totalItems = 0;
    let totalValue = 0;
    let activeWorkOrders = 0;

    data.forEach((item: any, index: number) => {
      const itemName = item.$Name || item.Name || 'Unknown Item';
      const parent = item.$Parent || item.Parent || 'Unknown Category';
      const quantity = this.parseAmount(item.$ClosingBalance);
      const rate = this.parseAmount(item.$ClosingRate) || 0;
      const value = quantity * rate;

      if (Math.abs(quantity) > 0) {
        response += `${activeWorkOrders + 1}. **${itemName}**\n`;
        response += `   Category: ${parent}\n`;
        response += `   Quantity: ${Math.abs(quantity).toLocaleString('en-IN')}\n`;
        if (rate > 0) {
          response += `   Rate: ₹${rate.toLocaleString('en-IN')}\n`;
          response += `   Value: ₹${Math.abs(value).toLocaleString('en-IN')}\n`;
        }
        response += '\n';

        totalItems += Math.abs(quantity);
        totalValue += Math.abs(value);
        activeWorkOrders++;
      }
    });

    if (activeWorkOrders === 0) {
      response += `❌ **No active work orders found**\n\n`;
      response += `This could mean:\n`;
      response += `• No work-in-progress items\n`;
      response += `• All production orders completed\n`;
      response += `• Manufacturing not tracked in stock items\n\n`;
      response += `💡 **Try checking:**\n`;
      response += `• Stock summary for all items\n`;
      response += `• Cost centres for production tracking\n`;
      response += `• Tally manufacturing reports`;
    } else {
      response += `📊 **Summary:**\n`;
      response += `🔧 Active Work Orders: ${activeWorkOrders}\n`;
      response += `📦 Total Quantity: ${totalItems.toLocaleString('en-IN')}\n`;
      if (totalValue > 0) {
        response += `💰 Total Value: ₹${totalValue.toLocaleString('en-IN')}\n`;
      }
      response += `\n📝 **Note:** Based on stock items and production categories available via ODBC`;
    }

    return {
      success: true,
      category: 'Miscellaneous',
      response: this.addTimestampToResponse(response),
      data: data,
      responseType: 'text',
      executionTime: 0
    };
  }

  // ==================== GENERIC HANDLER ====================

  private async handleGenericQuery(query: string, categoryName: string): Promise<QueryResult> {
    return {
      success: true,
      category: categoryName,
      response: `I understand you're asking about ${categoryName.toLowerCase()}. Please be more specific about what information you need. For example:\n\n• "Show me sales summary"\n• "What are my outstanding receivables?"\n• "Give me inventory list"`,
      responseType: 'text',
      executionTime: 0
    };
  }
}
