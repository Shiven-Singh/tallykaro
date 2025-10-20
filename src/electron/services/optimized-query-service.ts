import { SupabaseService, LedgerRecord, CompanyRecord } from './supabase-service';
import { S3Service } from './s3-service';
import { clientPreferences } from './client-preferences';
import { conversationService } from './conversation-service';
import { OpenAIService } from '../utils/ai/openai';
import { GeminiService } from '../utils/ai/gemini';
import { tallyKnowledgeBase, TallyQuery } from '../utils/ai/tally-knowledge-base';
import { ComprehensiveQueryHandler } from './comprehensive-query-handler';
import { PDFService } from './pdf-service';
import { SalesPurchaseQueryService } from './sales-purchase-query-service';

export interface QueryRequest {
  query: string;
  clientId: string;
  whatsappNumber?: string;
  sessionId?: string;
}

export interface QueryResponse {
  success: boolean;
  type: 'company' | 'ledger' | 'analytical' | 'inventory' | 'reminders' | 'cached' | 'error' | 'general';
  data: any;
  response: string;
  executionTime: number;
  cacheHit: boolean;
  suggestions?: string[];
}

export class OptimizedQueryService {
  private supabase: SupabaseService | null = null;
  private s3Service: S3Service;
  private openaiService: OpenAIService | null = null;
  private geminiService: GeminiService | null = null;
  private tallyService: any; // TallyService instance
  private comprehensiveHandler: ComprehensiveQueryHandler | null = null;
  private salesPurchaseService: SalesPurchaseQueryService | null = null;

  constructor(tallyService?: any) {
    // Don't create SupabaseService in constructor to avoid env var errors
    this.s3Service = new S3Service();
    this.tallyService = tallyService; // Store the connected instance

    // Initialize AI services
    this.initializeAIServices();

    // Initialize comprehensive query handler
    if (tallyService) {
      try {
        const pdfService = new PDFService();
        this.comprehensiveHandler = new ComprehensiveQueryHandler(tallyService, pdfService);
        console.log('✅ Comprehensive query handler initialized');
      } catch (error) {
        console.log('⚠️ Comprehensive query handler initialization failed:', error);
      }
    }
  }

  private initializeAIServices() {
    // Try OpenAI first
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openaiService = new OpenAIService();
        console.log('🤖 OpenAI service enabled for query understanding');
      }
    } catch (error) {
      console.log('⚠️ OpenAI service initialization failed');
    }

    // Try Gemini
    try {
      if (process.env.GOOGLE_AI_API_KEY) {
        this.geminiService = new GeminiService();
        console.log('🤖 Gemini service enabled for query understanding');
      }
    } catch (error) {
      console.log('⚠️ Gemini service initialization failed');
    }

    if (!this.openaiService && !this.geminiService) {
      console.log('💡 AI services disabled - set OPENAI_API_KEY or GOOGLE_AI_API_KEY to enable intelligent query processing');
    }
  }

  private getSupabaseService(): SupabaseService {
    if (!this.supabase) {
      this.supabase = new SupabaseService();
    }
    return this.supabase;
  }

  private getSalesPurchaseService(): SalesPurchaseQueryService {
    if (!this.salesPurchaseService) {
      const supabaseService = this.getSupabaseService();
      this.salesPurchaseService = new SalesPurchaseQueryService(supabaseService);
      console.log('✅ Sales/Purchase query service initialized');
    }
    return this.salesPurchaseService;
  }

  /**
   * Process query with lightning-fast Supabase backend
   */
  async processQuery(request: QueryRequest): Promise<QueryResponse> {
    const startTime = Date.now();
    
    try {
      // Expand shortcuts first to avoid repetitive typing
      const expandedQuery = clientPreferences.expandQueryShortcuts(request.query);
      const processedRequest = { ...request, query: expandedQuery };

      // Check if this is a numeric selection from previous results
      const numericSelection = this.isNumericSelection(processedRequest.query);
      if (numericSelection > 0) {
        const contextResult = await this.handleNumericSelection(request, numericSelection);
        if (contextResult) {
          contextResult.executionTime = Date.now() - startTime;
          return contextResult;
        }
      }

      // Check for shortcuts help
      if (processedRequest.query.toLowerCase().trim() === 'shortcuts' || 
          processedRequest.query.toLowerCase().trim() === 'help shortcuts') {
        return {
          success: true,
          type: 'general',
          data: null,
          response: clientPreferences.getShortcutsHelp(),
          executionTime: Date.now() - startTime,
          cacheHit: false
        };
      }

      // Check for sales/purchase queries FIRST (before cache)
      const queryLower = processedRequest.query.toLowerCase();

      // Check for purchase orders first (more specific than general purchase)
      const isPurchaseOrderQuery = this.isPurchaseOrderQuery(queryLower);
      if (isPurchaseOrderQuery) {
        console.log(`📦 Detected PURCHASE ORDER query, routing to SalesPurchaseQueryService...`);
        const salesPurchaseService = this.getSalesPurchaseService();

        try {
          const result = await salesPurchaseService.queryPurchaseOrders(request.clientId, request.query);

          if (result.success && result.data && result.data.length > 0) {
            // Format response for purchase orders
            const summary = result.summary;
            const period = result.period || 'all time';

            let response = `📦 **Purchase Orders Summary**\n`;
            response += `📅 **Period:** ${period}\n\n`;
            response += `📋 **Total Orders:** ${summary.totalOrders}\n`;
            response += `💵 **Total Amount:** ₹${summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
            response += `📊 **Total Quantity:** ${summary.totalQuantity.toLocaleString('en-IN')}\n`;
            response += `📦 **Unique Items:** ${summary.uniqueItems}\n`;
            if (summary.status && summary.status !== 'all') {
              response += `🏷️ **Status:** ${summary.status}\n`;
            }

            return {
              success: true,
              type: 'analytical',
              data: result.data,
              response: response,
              executionTime: Date.now() - startTime,
              cacheHit: false
            };
          } else {
            // No data found
            return {
              success: true,
              type: 'analytical',
              data: [],
              response: result.error || 'No purchase orders found for the specified period.',
              executionTime: Date.now() - startTime,
              cacheHit: false
            };
          }
        } catch (error) {
          console.error('Purchase order query error:', error);
          return {
            success: false,
            type: 'error',
            data: null,
            response: `Error querying purchase orders: ${error instanceof Error ? error.message : String(error)}`,
            executionTime: Date.now() - startTime,
            cacheHit: false
          };
        }
      }

      const isSalesQuery = this.isSalesQuery(queryLower);
      const isPurchaseQuery = this.isPurchaseQuery(queryLower);

      if (isSalesQuery || isPurchaseQuery) {
        console.log(`📊 Detected ${isSalesQuery ? 'SALES' : 'PURCHASE'} query, routing to SalesPurchaseQueryService...`);
        const salesPurchaseService = this.getSalesPurchaseService();

        try {
          let result;
          if (isSalesQuery) {
            result = await salesPurchaseService.querySales(request.clientId, request.query);
          } else {
            result = await salesPurchaseService.queryPurchases(request.clientId, request.query);
          }

          if (result.success && result.data && result.data.length > 0) {
            // Format response
            const response = this.formatSalesPurchaseResponse(result, isSalesQuery);
            return {
              success: true,
              type: 'analytical',
              data: result.data,
              response: response,
              executionTime: Date.now() - startTime,
              cacheHit: false
            };
          } else if (result.success && result.data && result.data.length === 0) {
            // No data found - simple message
            return {
              success: true,
              type: 'analytical',
              data: [],
              response: `No ${isSalesQuery ? 'sales' : 'purchase'} data found for the specified period.`,
              executionTime: Date.now() - startTime,
              cacheHit: false
            };
          } else {
            // Error occurred
            return {
              success: false,
              type: 'error',
              data: null,
              response: result.error || `Failed to query ${isSalesQuery ? 'sales' : 'purchase'} data`,
              executionTime: Date.now() - startTime,
              cacheHit: false
            };
          }
        } catch (error) {
          console.error('Sales/Purchase query error:', error);
          return {
            success: false,
            type: 'error',
            data: null,
            response: `Error querying ${isSalesQuery ? 'sales' : 'purchase'} data: ${error instanceof Error ? error.message : String(error)}`,
            executionTime: Date.now() - startTime,
            cacheHit: false
          };
        }
      }

      // Check cache first
      const supabase = this.getSupabaseService();
      const cachedResult = await supabase.getCachedQuery(processedRequest.clientId, processedRequest.query);
      if (cachedResult) {
        return {
          success: true,
          type: 'cached',
          data: cachedResult.data,
          response: cachedResult.response,
          executionTime: Date.now() - startTime,
          cacheHit: true
        };
      }

      // Try AI-powered query understanding for complex queries first
      if (this.shouldUseAI(processedRequest.query)) {
        console.log('🤖 Using AI-powered query understanding...');
        const aiResult = await this.processWithAI(processedRequest);
        if (aiResult) {
          aiResult.executionTime = Date.now() - startTime;
          return aiResult;
        }
      }

      // Try comprehensive query handler first (enhanced with date filtering)
      if (this.comprehensiveHandler) {
        try {
          console.log('🔄 Using comprehensive query handler for enhanced processing...');
          const comprehensiveResult = await this.comprehensiveHandler.processQuery(processedRequest.query);

          if (comprehensiveResult.success) {
            // Convert to our response format
            const result: QueryResponse = {
              success: true,
              type: this.mapCategoryToType(comprehensiveResult.category),
              data: comprehensiveResult.data,
              response: comprehensiveResult.response,
              executionTime: comprehensiveResult.executionTime || 0,
              cacheHit: false
            };

            // Cache and return enhanced result
            if (!result.cacheHit) {
              await supabase.cacheQuery(
                processedRequest.clientId,
                processedRequest.query,
                { data: result.data, response: result.response }
              );
            }

            await this.recordQueryAnalytics(processedRequest, result, startTime);
            result.executionTime = Date.now() - startTime;
            return result;
          }
        } catch (error) {
          console.log('⚠️ Comprehensive handler failed, falling back to legacy routing:', error);
        }
      }

      // Fallback to legacy routing
      const queryType = this.analyzeQueryType(processedRequest.query);
      let result: QueryResponse;

      switch (queryType) {
        case 'company':
          result = await this.processCompanyQuery(processedRequest);
          break;
        case 'analytical':
          result = await this.processAnalyticalQuery(processedRequest);
          break;
        case 'inventory':
          result = await this.processInventoryQuery(processedRequest);
          break;
        case 'ledger':
          result = await this.processLedgerQuery(processedRequest);
          break;
        case 'reminders':
          result = await this.processReminderQuery(processedRequest);
          break;
        default:
          result = await this.processGeneralQuery(processedRequest);
      }

      // Cache successful results
      if (result.success && !result.cacheHit) {
        await supabase.cacheQuery(
          processedRequest.clientId, 
          processedRequest.query, 
          { data: result.data, response: result.response }
        );
      }

      // Record analytics
      await this.recordQueryAnalytics(processedRequest, result, startTime);

      result.executionTime = Date.now() - startTime;
      return result;

    } catch (error) {
      console.error('Query processing error:', error);
      return {
        success: false,
        type: 'error',
        data: null,
        response: 'Sorry, I encountered an error processing your query. Please try again.',
        executionTime: Date.now() - startTime,
        cacheHit: false
      };
    }
  }

  /**
   * Process company-related queries
   */
  private async processCompanyQuery(request: QueryRequest): Promise<QueryResponse> {
    console.log(`Processing company query: ${request.query}`);
    
    const supabase = this.getSupabaseService();
    const company = await supabase.getCompany(request.clientId);
    
    if (!company) {
      return {
        success: false,
        type: 'company',
        data: null,
        response: '❌ **Company information not found**\n\nPlease ensure:\n• Your Tally data has been synced\n• Company master data exists in Tally\n• Try running data sync again\n\n💡 Use "sync data" command to refresh',
        executionTime: 0,
        cacheHit: false,
        suggestions: ['Try: "sync data"', 'Check if company data exists in Tally', 'Contact support if issue persists']
      };
    }

    const query = request.query.toLowerCase();
    let response = '';

    if (query.includes('address') || query.includes('location')) {
      response = `🏢 **Company Address:**\n${company.address || 'Address not available'}`;
    } else if (query.includes('name')) {
      response = `🏢 **Company Name:**\n${company.name}`;
    } else if (query.includes('phone') || query.includes('contact')) {
      response = `📞 **Company Phone:**\n${company.phone || 'Phone not available'}`;
    } else if (query.includes('email')) {
      response = `📧 **Company Email:**\n${company.email || 'Email not available'}`;
    } else if (query.includes('gst') || query.includes('gstin')) {
      response = `🧾 **GST Registration:**\n${company.gst_registration || 'GST not available'}`;
    } else {
      // Full company details
      response = `🏢 **${company.name}**\n\n📍 **Address:**\n${company.address || 'Not available'}\n\n📞 **Phone:** ${company.phone || 'Not available'}\n📧 **Email:** ${company.email || 'Not available'}`;
      
      if (company.gst_registration) {
        response += `\n🧾 **GST:** ${company.gst_registration}`;
      }
    }

    return {
      success: true,
      type: 'company',
      data: company,
      response,
      executionTime: 0,
      cacheHit: false
    };
  }

  /**
   * Process analytical queries (highest, lowest, totals) with improved validation
   */
  private async processAnalyticalQuery(request: QueryRequest): Promise<QueryResponse> {
    const query = request.query.toLowerCase();
    
    // Enhanced analysis for sales, profit/loss, and financial queries with ODBC support
    if (query.includes('sales') || query.includes('revenue') || query.includes('turnover') || 
        query.includes('today') || query.includes('month') || query.includes('bikri')) {
      
      console.log('🎯 Processing sales/revenue query using Sales Register (per Tally navigation guide)');
      
      // First try direct ODBC query for real-time sales data using correct Tally paths
      try {
        // Use the existing connected TallyService instance
        if (this.tallyService && this.tallyService.isConnected()) {
          console.log('📊 Using Sales Register for real-time sales analysis');
          
          // Try correct Tally ODBC tables (Sales Register doesn't exist as ODBC table)
          const salesRegisterQueries = [
            // Primary: CompanyVouchers for sales transactions (correct Tally ODBC table)
            `SELECT VOUCHER_DATE, VOUCHER_TYPE, AMOUNT, CUSTOMER, LEDGER_NAME FROM CompanyVouchers WHERE VOUCHER_TYPE LIKE '%Sales%' OR VOUCHER_TYPE LIKE '%Receipt%' ORDER BY VOUCHER_DATE DESC LIMIT 100`,
            
            // Fallback: All ledger accounts for sales analysis
            `SELECT $Name, $Parent, $ClosingBalance FROM LEDGER WHERE ($Parent LIKE '%Sales%' OR $Parent LIKE '%Income%' OR $Parent LIKE '%Revenue%' OR $Parent LIKE '%Turnover%') AND $ClosingBalance != 0 ORDER BY ABS($ClosingBalance) DESC`
          ];
          
          let odbcResult = null;
          let searchDescription = '';
          let queryType = '';
          
          for (let i = 0; i < salesRegisterQueries.length; i++) {
            console.log(`📊 Trying sales query ${i + 1}/2...`);
            odbcResult = await this.tallyService.executeQuery(salesRegisterQueries[i]);
            
            if (odbcResult.success && odbcResult.data && odbcResult.data.length > 0) {
              const descriptions = [
                'Sales Vouchers (CompanyVouchers)', 
                'Sales Ledger Balances (fallback)'
              ];
              const types = ['vouchers', 'ledger'];
              searchDescription = descriptions[i];
              queryType = types[i];
              console.log(`✅ Found ${odbcResult.data.length} records using ${searchDescription}`);
              break;
            }
          }
          
          if (odbcResult && odbcResult.success && odbcResult.data && odbcResult.data.length > 0) {
            const salesData = odbcResult.data;
            let totalSales = 0;
            let currentMonthSales = 0;
            let response = `**📊 Sales Analysis (${searchDescription}):**\n\n`;
            
            // Process different types of sales data based on which query worked
            if (queryType === 'vouchers') {
              // CompanyVouchers data - voucher level
              console.log('🔍 Processing CompanyVouchers data...');
              
              const currentMonth = new Date().getMonth();
              const currentYear = new Date().getFullYear();
              
              salesData.forEach((voucher: any) => {
                const amount = Math.abs(parseFloat(voucher.AMOUNT || 0));
                totalSales += amount;
                
                if (query.includes('month') || query.includes('this month')) {
                  const voucherDate = new Date(voucher.VOUCHER_DATE);
                  if (voucherDate.getMonth() === currentMonth && voucherDate.getFullYear() === currentYear) {
                    currentMonthSales += amount;
                  }
                }
              });
              
              if (query.includes('month') || query.includes('this month')) {
                response += `**Total Sales (Current Month):** ₹${currentMonthSales.toLocaleString('en-IN')}\n`;
                response += `**Total Sales (All Time):** ₹${totalSales.toLocaleString('en-IN')}\n\n`;
              } else {
                response += `**Total Sales:** ₹${totalSales.toLocaleString('en-IN')}\n\n`;
              }
              
              response += `**Recent Sales:**\n`;
              
              salesData.slice(0, 10).forEach((voucher: any, i: number) => {
                const amount = Math.abs(parseFloat(voucher.AMOUNT || 0));
                const customer = voucher.CUSTOMER || 'Unknown Customer';
                const date = voucher.VOUCHER_DATE ? new Date(voucher.VOUCHER_DATE).toLocaleDateString('en-IN') : 'Unknown Date';
                response += `${i + 1}. **${customer}** - ₹${amount.toLocaleString('en-IN')} (${date})\n`;
              });
              
            } else {
              // Ledger data - account level (fallback)
              console.log('🔍 Processing Sales Ledger balances...');
              
              salesData.forEach((account: any) => {
                const balance = Math.abs(parseFloat(account.$ClosingBalance || 0));
              totalSales += balance;
            });
            
              // Determine time period context
              const currentDate = new Date();
              const monthNames = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
              const currentMonth = monthNames[currentDate.getMonth()];
              const currentYear = currentDate.getFullYear();
              const financialYearStart = currentDate.getMonth() >= 3 ? currentYear : currentYear - 1;
              const financialYearEnd = financialYearStart + 1;
              
              // Professional CXO-style response
              response = `SALES ANALYSIS REPORT\n\n`;
              response += `Period: Cumulative as of ${currentDate.toLocaleDateString('en-IN')}\n`;
              response += `Financial Year: ${financialYearStart}-${financialYearEnd.toString().slice(-2)}\n\n`;
              
              if (query.includes('august') || query.includes('month')) {
                response += `Note: Monthly breakdown requires transaction-level data.\n`;
                response += `Current data shows cumulative sales accounts balances.\n\n`;
              }
              
              response += `TOTAL SALES REVENUE: Rs.${totalSales.toLocaleString('en-IN')}\n\n`;
              response += `SALES BREAKDOWN BY ACCOUNT:\n\n`;
              
              salesData.slice(0, 10).forEach((account: any, i: number) => {
                const balance = Math.abs(parseFloat(account.$ClosingBalance || 0));
                const accountName = account.$Name || 'Unknown';
                const groupName = account.$Parent || 'Unknown Group';
                const percentage = totalSales > 0 ? ((balance / totalSales) * 100).toFixed(1) : '0.0';
                
                response += `${i + 1}. ${accountName}\n`;
                response += `   Group: ${groupName}\n`;
                response += `   Amount: Rs.${balance.toLocaleString('en-IN')} (${percentage}%)\n\n`;
              });
              
              // Add professional recommendations
              response += `RECOMMENDATIONS:\n`;
              response += `- For monthly sales analysis, implement transaction-level reporting\n`;
              response += `- Consider setting up periodic sales reports for better insights\n`;
              response += `- Review sales account classification for accuracy\n\n`;
              
              response += `Data Source: Tally Ledger Balances (Real-time)\n`;
              response += `Generated: ${new Date().toLocaleString('en-IN')}`;
            }
            
            return {
              success: true,
              type: 'analytical',
              data: salesData,
              response,
              executionTime: odbcResult.executionTime,
              cacheHit: false
            };
          }
        }
      } catch (odbcError) {
        console.error('ODBC sales query failed, falling back to Supabase:', odbcError);
      }
      
      // Fallback to Supabase if ODBC fails
      const supabase = this.getSupabaseService();
      const allLedgers = await supabase.getAllLedgers(request.clientId, 100);
      const salesAccounts = allLedgers.filter((ledger: any) => {
        const parent = (ledger.parent || '').toLowerCase();
        const name = (ledger.name || '').toLowerCase();
        return parent.includes('sales') || parent.includes('income') || 
               parent.includes('revenue') || name.includes('sales') ||
               name.includes('revenue') || parent.includes('turnover');
      });
      
      if (salesAccounts.length === 0) {
        return {
          success: false,
          type: 'analytical',
          data: [],
          response: '**Sales Analysis:** No sales accounts found.\n\n**Suggestions:**\n- Set up income/sales accounts in Tally\n- Check account grouping under "Income" or "Sales"\n- Try "show all income accounts"',
          executionTime: 0,
          cacheHit: false
        };
      }

      const totalSales = salesAccounts.reduce((sum: number, acc: any) => sum + Math.abs(acc.closing_balance || 0), 0);
      let response = `**📊 Sales Analysis (from cached data):**\n\n`;
      response += `**Total Sales/Revenue:** ₹${totalSales.toLocaleString('en-IN')}\n\n`;
      response += `**Account Breakdown:**\n`;
      
      salesAccounts.forEach((account: any, i: number) => {
        const balance = Math.abs(account.closing_balance || 0);
        response += `${i + 1}. **${account.name}** - ₹${balance.toLocaleString('en-IN')}\n`;
      });

      return {
        success: true,
        type: 'analytical',
        data: salesAccounts,
        response,
        executionTime: 0,
        cacheHit: false
      };
    }

    // Profit & Loss analysis
    if (query.includes('profit') || query.includes('loss') || query.includes('p&l') || query.includes('pl')) {
      const supabase = this.getSupabaseService();
      const allLedgers = await supabase.getAllLedgers(request.clientId, 200);
      
      const incomeAccounts = allLedgers.filter((ledger: any) => {
        const parent = (ledger.parent || '').toLowerCase();
        return parent.includes('income') || parent.includes('sales') || 
               parent.includes('revenue') || parent.includes('profit');
      });
      
      const expenseAccounts = allLedgers.filter((ledger: any) => {
        const parent = (ledger.parent || '').toLowerCase();
        return parent.includes('expense') || parent.includes('cost') || 
               parent.includes('charges') || parent.includes('fees');
      });
      
      const totalIncome = incomeAccounts.reduce((sum: number, acc: any) => sum + Math.abs(acc.closing_balance || 0), 0);
      const totalExpenses = expenseAccounts.reduce((sum: number, acc: any) => sum + Math.abs(acc.closing_balance || 0), 0);
      const netProfit = totalIncome - totalExpenses;
      
      let response = `**Profit & Loss Summary:**\n\n`;
      response += `**Total Income:** ₹${totalIncome.toLocaleString('en-IN')}\n`;
      response += `**Total Expenses:** ₹${totalExpenses.toLocaleString('en-IN')}\n`;
      response += `**Net ${netProfit >= 0 ? 'Profit' : 'Loss'}:** ₹${Math.abs(netProfit).toLocaleString('en-IN')}\n\n`;
      
      if (incomeAccounts.length > 0 || expenseAccounts.length > 0) {
        response += `**Business Performance:** ${netProfit >= 0 ? 'Profitable' : 'Loss-making'} operations\n`;
        response += `**Margin:** ${totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : '0.0'}%`;
      }

      return {
        success: true,
        type: 'analytical',
        data: [...incomeAccounts, ...expenseAccounts],
        response,
        executionTime: 0,
        cacheHit: false
      };
    }
    
    if (query.includes('highest') || query.includes('sabse zyada') || query.includes('maximum') ||
        query.includes('sabse bada') || query.includes('biggest') || query.includes('which company has') ||
        query.includes('kiska hai') || query.includes('kon sa') || query.includes('kaun sa')) {
      const supabase = this.getSupabaseService();
      const topBalances = await supabase.getTopBalances(request.clientId, 10);
      
      if (topBalances.length === 0) {
        return {
          success: false,
          type: 'analytical',
          data: [],
          response: 'No accounts with balances found.',
          executionTime: 0,
          cacheHit: false
        };
      }

      // Data validation - ensure balances are reasonable
      const validatedBalances = topBalances.filter(ledger => {
        const balance = Math.abs(ledger.closing_balance || 0);
        // Filter out unreasonable values (over 100 crores might be data errors)
        return balance < 10000000000; // 1000 crores limit
      });

      let response = '**Top 10 Highest Balances:**\n\n';
      validatedBalances.slice(0, 10).forEach((ledger, i) => {
        const balance = Math.abs(ledger.closing_balance);
        const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
        // Format large numbers properly
        let formattedBalance;
        if (balance >= 10000000) { // 1 crore+
          formattedBalance = (balance / 10000000).toFixed(2) + ' Cr';
        } else if (balance >= 100000) { // 1 lakh+
          formattedBalance = (balance / 100000).toFixed(2) + ' L';
        } else {
          formattedBalance = balance.toLocaleString('en-IN');
        }
        response += `${i + 1}. **${ledger.name}** (${ledger.parent})\n   ₹${formattedBalance} ${type}\n\n`;
      });

      return {
        success: true,
        type: 'analytical',
        data: validatedBalances,
        response,
        executionTime: 0,
        cacheHit: false
      };
    }

    // Default analytical response
    return {
      success: false,
      type: 'analytical',
      data: null,
      response: 'I can help you analyze highest balances, sales performance, profit & loss, and more. Try asking "What are my sales?" or "Show me profit and loss"',
      executionTime: 0,
      cacheHit: false,
      suggestions: [
        'What are my today sales?',
        'Show me profit and loss',
        'Which account has highest balance?'
      ]
    };
  }

  /**
   * Process inventory/stock queries
   */
  private async processInventoryQuery(request: QueryRequest): Promise<QueryResponse> {
    const query = request.query.toLowerCase();
    
    // Check if this is a PDF generation request for stock items
    if (query.includes('pdf') || query.includes('send me pdf') || query.includes('generate pdf') || 
        query.includes('export') || query.includes('report')) {
      
      // Extract stock item name from PDF request
      const stockItemName = this.extractStockItemFromQuery(request.query);
      
      if (stockItemName) {
        // This should trigger PDF generation for specific stock item
        return {
          success: true,
          type: 'inventory',
          data: { action: 'generate_pdf', stockItem: stockItemName },
          response: `📄 **PDF Generation Request**\n\n🔧 **Item:** ${stockItemName}\n\n⚡ **Processing PDF generation...**\n\nThis will generate a detailed stock report including:\n• Current stock levels\n• Stock value\n• Transaction history\n• Item details\n\n💡 **Note:** Ensure you're connected to Tally for accurate data.`,
          executionTime: 0,
          cacheHit: false,
          suggestions: [
            'Check Tally connection',
            'Verify stock item exists',
            'Try: "stock summary pdf"'
          ]
        };
      } else {
        // General stock PDF request
        return {
          success: true,
          type: 'inventory', 
          data: { action: 'generate_pdf', stockItem: 'all' },
          response: `📄 **Stock Summary PDF Generation**\n\n📊 **Generating complete stock report...**\n\nThis will include:\n• All stock items\n• Current quantities\n• Stock values\n• Low stock alerts\n• Zero stock items\n\n⚡ **Processing...**`,
          executionTime: 0,
          cacheHit: false
        };
      }
    }
    
    // We can now directly call TallyService for stock data (injected via constructor or global access)
    // Let's check if there's access to stock data via IPC or direct service calls
    
    // For now, detect the query and mark it for stock processing in main.ts
    let response = '';
    
    if (query.includes('how many') || query.includes('kitne') || query.includes('quantity')) {
      if (query.includes('pipe') || query.includes('pipes')) {
        response = '🔧 **Pipe Inventory Query**\n\n📦 **Stock items feature available!**\n\n🔍 **To check pipe stock:**\n• Use "Connect to Tally" first\n• Enable inventory features in Tally\n• Stock items will be accessible via ODBC\n\n💡 **Try:** After connecting to Tally, this query will show actual pipe quantities!';
      } else {
        response = '📊 **Inventory Quantity Query**\n\n📦 **Stock tracking available via Tally ODBC!**\n\n🔍 **Setup:**\n• Connect to Tally with ODBC enabled\n• Ensure inventory features are enabled in Tally\n• Stock items will be queried directly from Tally\n\n💡 **Try:** After Tally connection, this will show actual item quantities!';
      }
    } else if (query.includes('lowest stock') || query.includes('minimum')) {
      response = '📉 **Minimum Stock Analysis**\n\n📊 **Stock analysis available!**\n\n🎯 **Features:**\n• Low stock item detection\n• Zero stock alerts\n• Stock value analysis\n\n💡 **Setup:** Connect to Tally with inventory enabled to see actual low stock items!';
    } else if (query.includes('stock looking') || query.includes('status') || query.includes('list all stock')) {
      response = '📊 **Stock Status Overview**\n\n✅ **Complete stock summary available!**\n\n📈 **Features:**\n• Total stock items count\n• Total stock value\n• Low stock alerts\n• Zero stock items\n• High value items\n\n💡 **Setup:** Connect to Tally first, then ask for "stock summary" to see complete analysis!';
    } else if (query.includes('pipe') || query.includes('pipes')) {
      response = '🔧 **Pipe Inventory Query**\n\n📦 **Pipe tracking available via Tally!**\n\n🔍 **To check pipe stock:**\n• Ensure Tally is connected\n• Pipe items configured in stock items\n• Query will return current pipe balances\n\n💡 **Try:** "How many pipes do I have?" after Tally connection!';
    } else {
      response = '📦 **Inventory & Stock Management**\n\n✅ **Full stock functionality available!**\n\n🛠️ **Available features:**\n• Complete stock item listing\n• Stock quantities and values\n• Low stock analysis\n• Search by item name\n• Stock summaries\n\n💡 **Quick start:**\n1. Connect to Tally with ODBC enabled\n2. Ensure inventory is enabled in company features\n3. Ask: "show stock summary" or "list all stock items"';
    }

    return {
      success: true,
      type: 'inventory',
      data: null,
      response,
      executionTime: 0,
      cacheHit: false,
      suggestions: [
        'Connect to Tally first',
        'Enable inventory in Tally company features',
        'Try: "show stock summary"',
        'Try: "list all stock items"',
        'Try: "how many [item name] do I have?"'
      ]
    };
  }

  /**
   * Process ledger-specific queries
   */
  private async processLedgerQuery(request: QueryRequest): Promise<QueryResponse> {
    const query = request.query.toLowerCase();
    const searchTerm = this.extractSearchTerm(request.query);
    
    // Check if this is a PDF/Invoice generation request
    if (query.includes('invoice') || query.includes('pdf') || query.includes('bill') || 
        query.includes('statement') || query.includes('e-invoice')) {
      
      if (!searchTerm || searchTerm.length < 3) {
        return {
          success: false,
          type: 'ledger',
          data: null,
          response: 'Please specify a company/ledger name for PDF generation. Example: "send me e-invoice of gangotri steel"',
          executionTime: 0,
          cacheHit: false
        };
      }
      
      const supabase = this.getSupabaseService();
      const ledgers = await supabase.searchLedgers(request.clientId, searchTerm, 5);
      
      if (ledgers.length === 0) {
        const isSupabaseConfigured = supabase.isSupabaseConfigured();
        
        if (!isSupabaseConfigured) {
          return {
            success: false,
            type: 'ledger',
            data: [],
            response: `⚠️ **Cannot generate PDF - Data not available**\n\n🔧 **Possible issues:**\n• Tally software is not running\n• Data has not been synced yet\n• Database connection not configured\n\n💡 **Next steps:**\n• Start Tally software\n• Click "Sync Data" in the app\n• Try the PDF generation again`,
            executionTime: 0,
            cacheHit: false,
            suggestions: [
              'Start Tally software first', 
              'Click "Sync Data" to refresh', 
              'Check if ledger accounts exist in Tally'
            ]
          };
        }

        return {
          success: false,
          type: 'ledger',
          data: [],
          response: `❌ Failed to generate PDF for "${searchTerm}": No ledger found matching "${searchTerm}"`,
          executionTime: 0,
          cacheHit: false,
          suggestions: ['Try searching with partial names', 'Check for typos', 'Use "List all ledger accounts" to see available options']
        };
      }

      if (ledgers.length === 1) {
        // Single match - indicate PDF will be generated
        const ledger = ledgers[0];
        const balance = Math.abs(ledger.closing_balance);
        const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
        
        return {
          success: true,
          type: 'ledger',
          data: { ...ledger, generatePDF: true },
          response: `📄 **Generating E-Invoice for ${ledger.name}**\n\nClosing Balance: ₹${balance.toLocaleString('en-IN')} ${type}\n\n⏳ Processing e-invoice generation...`,
          executionTime: 0,
          cacheHit: false
        };
      }

      // Multiple matches for PDF generation
      let response = `Found ${ledgers.length} matching accounts for PDF generation:\n\n`;
      ledgers.forEach((ledger, i) => {
        const balance = Math.abs(ledger.closing_balance);
        const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
        response += `${i + 1}. **${ledger.name}** (${ledger.parent}) - ₹${balance.toLocaleString('en-IN')} ${type}\n`;
      });
      response += '\n💡 Reply with a number (1, 2, etc.) to generate PDF for that account.';

      return {
        success: true,
        type: 'ledger',
        data: ledgers.map(l => ({ ...l, generatePDF: true })),
        response,
        executionTime: 0,
        cacheHit: false
      };
    }

    // Regular ledger balance queries
    const supabase = this.getSupabaseService();
    const ledgers = await supabase.searchLedgers(request.clientId, searchTerm, 10);

    if (ledgers.length === 0) {
      // Check if this might be a Tally connection issue
      const isSupabaseConfigured = supabase.isSupabaseConfigured();
      
      if (!isSupabaseConfigured) {
        return {
          success: false,
          type: 'ledger',
          data: [],
          response: `⚠️ **Data not available**\n\n🔧 **Possible issues:**\n• Tally software is not running\n• Data has not been synced yet\n• Database connection not configured\n\n💡 **Next steps:**\n• Start Tally software\n• Click "Sync Data" in the app\n• Check connection settings`,
          executionTime: 0,
          cacheHit: false,
          suggestions: [
            'Start Tally software first', 
            'Click "Sync Data" to refresh', 
            'Check if ledger accounts exist in Tally'
          ]
        };
      }

      return {
        success: false,
        type: 'ledger',
        data: [],
        response: `No ledger found matching "${searchTerm}". Please check the spelling or try a different search term.`,
        executionTime: 0,
        cacheHit: false,
        suggestions: ['Try searching with partial names', 'Check for typos', 'Use "List all ledger accounts" to see available options']
      };
    }

    if (ledgers.length === 1) {
      const ledger = ledgers[0];
      const balance = Math.abs(ledger.closing_balance);
      const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
      
      // Track this ledger as recently used
      clientPreferences.addToLastUsed(request.clientId, ledger.name);
      
      return {
        success: true,
        type: 'ledger',
        data: ledger,
        response: `**${ledger.name}** (${ledger.parent})\nClosing Balance: ₹${balance.toLocaleString('en-IN')} ${type}\n\n💡 Say "generate pdf" or "send invoice" to create an e-invoice for this account.`,
        executionTime: 0,
        cacheHit: false
      };
    }

    // Multiple matches - store in context for selection
    await conversationService.storeContext(
      request.clientId,
      'ledger_selection',
      { ledgers, originalQuery: request.query }
    );

    let response = `Found ${ledgers.length} matching accounts:\n\n`;
    ledgers.forEach((ledger, i) => {
      const balance = Math.abs(ledger.closing_balance);
      const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
      response += `${i + 1}. **${ledger.name}** (${ledger.parent}) - ₹${balance.toLocaleString('en-IN')} ${type}\n`;
    });
    response += '\n💡 Reply with a number (1, 2, etc.) to select an account, or say "generate pdf" with the exact name.';

    return {
      success: true,
      type: 'ledger',
      data: ledgers,
      response,
      executionTime: 0,
      cacheHit: false
    };
  }


  /**
   * Analyze query type based on fuzzy keyword matching and intent detection
   */
  private analyzeQueryType(query: string): 'company' | 'analytical' | 'ledger' | 'inventory' | 'reminders' | 'general' {
    const q = this.correctSpelling(query.toLowerCase().trim());
    
    console.log(`🔍 Analyzing query type for: "${query}" -> normalized: "${q}"`);

    // Enhanced fuzzy matching with intent scoring
    const intentScores = {
      general: this.calculateGeneralScore(q),
      inventory: this.calculateInventoryScore(q), 
      company: this.calculateCompanyScore(q),
      analytical: this.calculateAnalyticalScore(q),
      ledger: this.calculateLedgerScore(q),
      reminders: this.calculateReminderScore(q)
    };

    console.log('🎯 Intent scores:', intentScores);

    // Find highest scoring intent
    const topIntent = Object.entries(intentScores)
      .sort(([,a], [,b]) => b - a)[0];

    const [detectedType, score] = topIntent as [string, number];
    
    // Only use high-confidence classifications
    if (score > 0.3) {
      console.log(`✅ Detected as: ${detectedType} (confidence: ${score.toFixed(2)})`);
      return detectedType as 'company' | 'analytical' | 'ledger' | 'inventory' | 'reminders' | 'general';
    }

    // Fallback to exact keyword matching for backward compatibility
    console.log('🔄 Using fallback exact keyword matching');
    return this.analyzeQueryTypeExact(q);
  }

  /**
   * Calculate intent scores for fuzzy matching
   */
  private calculateGeneralScore(q: string): number {
    const generalKeywords = ['list all', 'show all', 'all ledger', 'sare accounts', 'sabhi accounts', 
                           'list', 'accounts', 'ledgers', 'quick access', 'recent', 'shortcuts'];
    return this.calculateKeywordScore(q, generalKeywords);
  }

  private calculateInventoryScore(q: string): number {
    // Check if it's a cash/balance query first - these should NOT be inventory
    if (q.includes('cash') || q.includes('balance') || q.includes('bank') || 
        (q.includes('kitna') && (q.includes('cash') || q.includes('paisa') || q.includes('balance')))) {
      return 0; // Force zero score for cash/balance queries
    }
    
    const inventoryKeywords = ['stock', 'inventory', 'item', 'items', 'pipe', 'pipes', 'product', 'products',
                              'how many items', 'kitne items', 'quantity', 'lowest stock', 'sabse kam stock',
                              'highest stock', 'sabse zyada stock', 'stock looking', 'stock status',
                              'out of stock', 'stock khatam', 'reorder', 'minimum stock', 'maal', 'samaan',
                              'saman', 'goods', 'material', 'chij', 'cheez', 'current stock', 'stock summary',
                              'closing stock', 'inventory value', 'stock ageing', 'how much stock'];
    return this.calculateKeywordScore(q, inventoryKeywords);
  }

  private calculateCompanyScore(q: string): number {
    const companyKeywords = ['company details', 'company info', 'company name', 'show company', 
                            'my company', 'company address', 'company phone', 'company email',
                            'show details', 'company', 'my details', 'details', 'address', 'my address', 'mera address'];
    
    let score = this.calculateKeywordScore(q, companyKeywords);
    
    // Exact matches get higher scores
    if (q === 'details' || q === 'show details' || q === 'company') score += 0.3;
    
    // Penalize if contains company names (likely ledger query)
    if (this.containsCompanyName(q)) score -= 0.4;
    
    return Math.max(0, score);
  }

  /**
   * Correct common spelling mistakes in queries
   */
  private correctSpelling(query: string): string {
    const corrections: { [key: string]: string } = {
      // Sales variations
      'slaes': 'sales',
      'sale': 'sales',
      'seles': 'sales',
      'saels': 'sales',
      
      // Balance variations
      'balence': 'balance',
      'ballance': 'balance',
      'balanc': 'balance',
      
      // Month variations
      'mont': 'month',
      'monht': 'month',
      'mounth': 'month',
      
      // Company variations
      'compny': 'company',
      'compani': 'company',
      'comapny': 'company',
      
      // Ledger variations
      'ledgor': 'ledger',
      'legers': 'ledger',
      'leder': 'ledger',
      
      // Bank variations
      'bnk': 'bank',
      'banck': 'bank',
      
      // Common typos
      'wat': 'what',
      'wht': 'what',
      'whta': 'what',
      'teh': 'the',
      'hte': 'the'
    };

    let corrected = query;
    
    // Apply word-level corrections
    for (const [typo, correction] of Object.entries(corrections)) {
      // Replace whole words only (with word boundaries)
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      corrected = corrected.replace(regex, correction);
    }
    
    // Log if corrections were made
    if (corrected !== query) {
      console.log(`🔤 Spell correction: "${query}" → "${corrected}"`);
    }
    
    return corrected;
  }

  private calculateAnalyticalScore(q: string): number {
    const analyticalKeywords = ['highest', 'lowest', 'sabse zyada', 'sabse kam', 'maximum', 'minimum', 
                               'top', 'which has', 'sabse bada', 'sabse chota', 'biggest', 'smallest',
                               'which company has', 'kiska hai', 'kon sa', 'kaun sa',
                               // Sales & Revenue terms
                               'sales', 'revenue', 'turnover', 'income', 'profit', 'loss', 'p&l', 'pl',
                               'today sales', 'this month sales', 'monthly sales', 'total sales', 
                               'sales analysis', 'business performance', 'today\'s sales', 'last week\'s sales',
                               'this quarter', 'yearly sales', 'sales trend', 'sales invoice', 'sales summary',
                               // Purchase terms
                               'purchase', 'purchases', 'today\'s purchases', 'monthly purchases', 'purchase summary',
                               'purchase invoices', 'purchase bills', 'biggest purchase', 'vendor', 'supplier',
                               // Outstanding & Receivables
                               'outstanding', 'receivables', 'payables', 'due', 'overdue', 'pending bills',
                               'pending invoices', 'who has not paid', 'pending', 'outstanding amount',
                               // Cash & Bank
                               'cash in hand', 'bank balance', 'cash balance', 'bank transactions', 'cash book',
                               'bank book', 'total cash balance',
                               // Reports & Statements
                               'trial balance', 'balance sheet', 'gst report', 'vat return', 'expense summary',
                               'profit margin', 'day book', 'cash flow', 'invoice report', 'bill summary',
                               // Hindi/Hinglish terms
                               'bikri', 'kamai', 'munafa', 'nuksan', 'aaj ki sales', 'is month ki sales', 
                               'total bikri', 'khareed', 'kharidari', 'udhaar', 'bachaat', 'jama', 'naqad',
                               // General balance queries (ALL accounts, not specific)
                               'closing balance kitna hai', 'balane kitna hai', 'balance dikhao', 'all balance'];
    
    let score = this.calculateKeywordScore(q, analyticalKeywords);
    
    // BOOST for general balance queries that don't specify account names (with typo tolerance)
    const isGeneralBalanceQuery = (
      q.includes('balane kitna hai') || q.includes('balance kitna hai') ||
      q.includes('balace kitna h') || q.includes('balance kitna h') ||
      q.includes('closing balance') || q.includes('closing balace') ||
      (q.includes('kitna h') && (q.includes('balance') || q.includes('balace') || q.includes('balane')))
    ) && !this.containsCompanyName(q) && !this.containsSpecificAccount(q);
    
    if (isGeneralBalanceQuery) {
      score += 0.8; // Very high boost for general balance queries
    }
    
    // Boost sales-related queries
    if (q.includes('sales') || q.includes('bikri')) score += 0.2;
    if (q.includes('month') && (q.includes('sales') || q.includes('bikri'))) score += 0.1;
    
    return score;
  }

  private calculateLedgerScore(q: string): number {
    // Ledger queries are typically specific account names or searches
    let score = 0;
    
    // REDUCE score for general balance queries (should go to analytical)
    const isGeneralBalanceQuery = (
      q.includes('balane kitna hai') || q.includes('balance kitna hai') ||
      q.includes('balace kitna h') || q.includes('balance kitna h') ||
      q.includes('closing balance') || q.includes('closing balace') ||
      (q.includes('kitna h') && (q.includes('balance') || q.includes('balace') || q.includes('balane')))
    ) && !this.containsCompanyName(q) && !this.containsSpecificAccount(q);
    
    if (isGeneralBalanceQuery) {
      score -= 0.5; // Strong negative score to prefer analytical
    }
    
    // High priority for cash/balance queries (Hindi/Hinglish)
    if ((q.includes('cash') && (q.includes('kitna') || q.includes('balance'))) ||
        (q.includes('paisa') && q.includes('kitna')) ||
        (q.includes('mere paas') && q.includes('kitna')) ||
        q.includes('cash balance') || q.includes('bank balance')) {
      score += 0.8; // Very high score for cash balance queries
    }
    
    // Check if contains potential company/account names
    if (this.containsCompanyName(q)) score += 0.3;
    
    // Check for ledger-specific terms
    const ledgerKeywords = ['balance of', 'account', 'ledger', 'customer', 'supplier', 'party', 
                           'cash hai', 'balance hai', 'kitna hai'];
    score += this.calculateKeywordScore(q, ledgerKeywords);
    
    // If it's a short query with no analytical keywords, likely a ledger search
    if (q.length > 3 && q.length < 30 && !q.includes('sales') && !q.includes('highest') && !q.includes('company')) {
      score += 0.2;
    }
    
    return score;
  }

  private calculateReminderScore(q: string): number {
    const reminderKeywords = ['remind me', 'reminder', 'set reminder', 'reminders', 
                             'today\'s reminders', 'pending tasks', 'to-do', 'task', 'tasks',
                             'due bills', 'yaad dilana', 'reminder set kar', 'collect payment',
                             'bank transfer', 'follow-up', 'follow up'];
    return this.calculateKeywordScore(q, reminderKeywords);
  }

  /**
   * Calculate keyword matching score with fuzzy logic
   */
  private calculateKeywordScore(query: string, keywords: string[]): number {
    let totalScore = 0;
    
    for (const keyword of keywords) {
      if (query.includes(keyword)) {
        // Exact match gets full points
        totalScore += 1.0;
      } else {
        // Check for partial/fuzzy matches
        const words = keyword.split(' ');
        let partialMatches = 0;
        
        for (const word of words) {
          if (query.includes(word)) partialMatches++;
        }
        
        // Partial match gets proportional points
        if (partialMatches > 0) {
          totalScore += (partialMatches / words.length) * 0.5;
        }
      }
    }
    
    // Normalize score by number of keywords
    return totalScore / keywords.length;
  }

  /**
   * Fallback exact keyword matching (original logic)
   */
  private analyzeQueryTypeExact(q: string): 'company' | 'analytical' | 'ledger' | 'inventory' | 'reminders' | 'general' {
    // General list queries (should be handled first)
    if (q.includes('list all') || q.includes('show all') || q.includes('all ledger') || 
        q.includes('sare accounts') || q.includes('sabhi accounts') || 
        q === 'list' || q === 'accounts' || q === 'ledgers' ||
        q.includes('quick access') || q.includes('recent') || q.includes('shortcuts')) {
      return 'general';
    }

    // Inventory/Stock queries - comprehensive category for stock management
    if (q.includes('stock') || q.includes('inventory') || q.includes('item') || q.includes('items') ||
        q.includes('pipe') || q.includes('pipes') || q.includes('product') || q.includes('products') ||
        q.includes('how many') || q.includes('kitne') || q.includes('kitna') || q.includes('quantity') ||
        q.includes('lowest stock') || q.includes('sabse kam stock') ||
        q.includes('highest stock') || q.includes('sabse zyada stock') ||
        q.includes('stock looking') || q.includes('stock status') ||
        q.includes('out of stock') || q.includes('stock khatam') ||
        q.includes('reorder') || q.includes('minimum stock') ||
        q.includes('maal') || q.includes('samaan') || q.includes('saman') ||
        q.includes('goods') || q.includes('material') || q.includes('chij') || q.includes('cheez') ||
        q.includes('current stock') || q.includes('stock summary') || q.includes('closing stock') ||
        q.includes('inventory value') || q.includes('stock ageing') || q.includes('how much stock')) {
      console.log('✅ Detected as: inventory');
      return 'inventory';
    }

    // Reminder/To-do queries 
    if (q.includes('remind me') || q.includes('reminder') || q.includes('set reminder') ||
        q.includes('reminders') || q.includes('today\'s reminders') || q.includes('pending tasks') ||
        q.includes('to-do') || q.includes('task') || q.includes('due bills') || 
        q.includes('yaad dilana') || q.includes('reminder set kar') || 
        q.includes('collect payment') || q.includes('bank transfer')) {
      console.log('✅ Detected as: reminders');
      return 'reminders';
    }

    // Company queries - EXPANDED to catch more patterns including "show company details"
    if (q.includes('company details') || q.includes('company info') || q.includes('company name') ||
        q.includes('show company') || q.includes('my company') || q.includes('company address') ||
        q.includes('company phone') || q.includes('company email') ||
        q === 'show details' || q === 'company' || q === 'my details' ||
        q === 'details' || // Single word "details" should be company
        q.includes('show details') || // "show details" should be company
        (q.includes('address') && !this.containsCompanyName(q)) || 
        q.includes('my address') || q.includes('mera address')) {
      console.log('✅ Detected as: company');
      return 'company';
    }

    // Sales, Financial and Analytical queries (expanded for all categories)
    if (q.includes('highest') || q.includes('lowest') || q.includes('sabse zyada') || q.includes('sabse kam') || 
        q.includes('maximum') || q.includes('minimum') || q.includes('top') || q.includes('which has') ||
        q.includes('sabse bada') || q.includes('sabse chota') || q.includes('biggest') || q.includes('smallest') ||
        q.includes('which company has') || q.includes('kiska hai') || q.includes('kon sa') || q.includes('kaun sa') ||
        // Sales & Revenue Analysis
        q.includes('sales') || q.includes('revenue') || q.includes('turnover') || q.includes('income') ||
        q.includes('profit') || q.includes('loss') || q.includes('p&l') || q.includes('pl') ||
        q.includes('today sales') || q.includes('this month sales') || q.includes('monthly sales') ||
        q.includes('total sales') || q.includes('sales analysis') || q.includes('business performance') ||
        q.includes('today\'s sales') || q.includes('last week\'s sales') || q.includes('this quarter') ||
        q.includes('yearly sales') || q.includes('sales trend') || q.includes('sales invoice') ||
        // Purchase queries
        q.includes('purchase') || q.includes('purchases') || q.includes('today\'s purchases') ||
        q.includes('monthly purchases') || q.includes('purchase summary') || q.includes('purchase invoices') ||
        q.includes('purchase bills') || q.includes('biggest purchase') || q.includes('vendor') ||
        // Outstanding & Receivables
        q.includes('outstanding') || q.includes('receivables') || q.includes('payables') || q.includes('due') ||
        q.includes('overdue') || q.includes('pending bills') || q.includes('pending invoices') ||
        q.includes('who has not paid') || q.includes('outstanding amount') ||
        // Cash & Bank
        q.includes('cash in hand') || q.includes('bank balance') || q.includes('cash balance') ||
        q.includes('bank transactions') || q.includes('cash book') || q.includes('bank book') ||
        q.includes('total cash balance') ||
        // Reports & Statements
        q.includes('trial balance') || q.includes('balance sheet') || q.includes('gst report') ||
        q.includes('vat return') || q.includes('expense summary') || q.includes('profit margin') ||
        q.includes('day book') || q.includes('cash flow') || q.includes('invoice report') || q.includes('bill summary') ||
        // Hindi/Hinglish terms
        q.includes('bikri') || q.includes('kamai') || q.includes('munafa') || q.includes('nuksan') ||
        q.includes('aaj ki sales') || q.includes('is month ki sales') || q.includes('total bikri') ||
        q.includes('khareed') || q.includes('kharidari') || q.includes('udhaar') || q.includes('bachaat') ||
        q.includes('jama') || q.includes('naqad')) {
      console.log('✅ Detected as: analytical');
      return 'analytical';
    }

    // PDF/Invoice generation queries
    if (q.includes('invoice') || q.includes('pdf') || q.includes('bill') || q.includes('generate') || 
        q.includes('statement') || q.includes('e-invoice')) {
      console.log('✅ Detected as: ledger (PDF generation)');
      return 'ledger'; // Will be handled in ledger processing
    }

    // Check for general balance queries (asking for ALL balances, not specific ledger)
    const isGeneralBalanceQuery = (
      (q.includes('balane kitna hai') || q.includes('balance kitna hai')) && 
      !this.containsCompanyName(q) && 
      !this.containsSpecificAccount(q)
    ) || 
    q.includes('total balance') || 
    q.includes('all balance') || 
    q.includes('sabse zyada balance') || 
    q.includes('highest balance') || 
    q.includes('balance dikhao');
    
    if (isGeneralBalanceQuery) {
      console.log('✅ Detected as: analytical (general balance query)');
      return 'analytical';
    }

    // Ledger queries (specific balance queries or company name queries)
    if (q.includes('balance') || q.includes('kitna') || q.includes('closing') || this.containsCompanyName(q)) {
      console.log('✅ Detected as: ledger');
      return 'ledger';
    }

    console.log('✅ Detected as: general (fallback)');
    return 'general';
  }

  /**
   * Check if query contains a specific account name (like "HDFC bank balance")
   */
  private containsSpecificAccount(query: string): boolean {
    // Common account keywords that indicate specific account queries
    const accountKeywords = ['bank', 'hdfc', 'sbi', 'icici', 'axis', 'cash', 'petty cash',
                            'salary', 'rent', 'electricity', 'phone', 'internet', 'fuel'];
    return accountKeywords.some(keyword => query.toLowerCase().includes(keyword.toLowerCase()));
  }

  /**
   * Check if query contains a potential company name (more than basic English words)
   */
  private containsCompanyName(query: string): boolean {
    const basicWords = ['what', 'is', 'the', 'balance', 'closing', 'kitna', 'hai', 'ka', 'send', 'me', 'show', 'get', 'find', 
                       'sabse', 'bada', 'zyada', 'highest', 'biggest', 'company', 'has', 'which', 'kiska', 'kon', 'kaun', 
                       'maximum', 'minimum', 'top', 'lowest', 'smallest', 'details', 'info', 'address', 'phone', 'email'];
    const words = query.toLowerCase().split(/\s+/);
    
    // Don't consider analytical queries as containing company names
    if (query.includes('sabse bada') || query.includes('highest') || query.includes('biggest') || 
        query.includes('which company') || query.includes('kiska hai')) {
      return false;
    }
    
    // Don't consider company detail queries as containing ledger company names
    if (query.includes('company details') || query.includes('company info') || query.includes('show company') ||
        query.includes('my company') || query.includes('company address') || query.includes('company phone')) {
      return false;
    }
    
    // Look for words that are likely company names (not basic English/Hindi words)
    for (const word of words) {
      if (word.length > 2 && !basicWords.includes(word)) {
        // If it contains letters and possibly numbers/special chars, likely a company name
        if (/[a-zA-Z]/.test(word)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Extract search term from query (Enhanced for Hinglish)
   */
  private extractSearchTerm(query: string): string {
    let cleaned = query
      .replace(/what\s+is\s+(?:the\s+)?/gi, '')
      .replace(/show\s+me\s+(?:the\s+)?/gi, '')
      .replace(/send\s+me\s+(?:the\s+)?/gi, '') // Remove "send me"
      .replace(/generate\s+(?:an?\s+)?/gi, '') // Remove "generate" 
      .replace(/(?:e-?)?invoice\s+(?:of|for)\s+/gi, '') // Remove "invoice of"
      .replace(/(?:pdf|bill|statement)\s+(?:of|for)\s+/gi, '') // Remove PDF/bill keywords
      .replace(/(?:closing\s*)?balance\s+(?:of|for)\s+/gi, '')
      .replace(/(?:closing\s*)?balance\s*$/gi, '')
      .replace(/\s+ka\s+balance\s*$/gi, '') // Remove Hinglish "ka balance"
      .replace(/\s+kitna\s+hai\s*$/gi, '') // Remove Hinglish "kitna hai"
      .replace(/\s+balance\s+kitna\s*$/gi, '') // Remove "balance kitna"
      .replace(/[?!]/g, '')
      .trim();

    // Handle variations of company names like "gangotri steels" -> should match "gangotri steel"
    cleaned = cleaned
      .replace(/\bsteels?\b/gi, 'steel') // "steels" -> "steel"
      .replace(/\bcompanies\b/gi, 'company') // "companies" -> "company"
      .replace(/\benterprises?\b/gi, 'enterprise'); // Handle enterprise variations

    // For queries like "gangotri steel ka balance kitna hai"
    // Extract meaningful company/ledger names
    if (cleaned.includes(' ')) {
      const words = cleaned.split(/\s+/).filter(word => 
        word.length > 2 && 
        !['the', 'and', 'for', 'with', 'from', 'has', 'are', 'was', 'were', 'what', 'show', 'send', 'generate'].includes(word.toLowerCase())
      );
      
      // Take first 2-3 meaningful words for company names
      if (words.length >= 2) {
        return words.slice(0, 2).join(' ');
      }
    }

    return cleaned;
  }

  /**
   * Process general queries (list all, show all, etc.)
   */
  private async processGeneralQuery(request: QueryRequest): Promise<QueryResponse> {
    const query = request.query.toLowerCase();
    
    // Handle "List all ledger accounts" and similar
    if (query.includes('list all') || query.includes('show all') || query.includes('all ledger') || 
        query.includes('sare accounts') || query.includes('sabhi accounts') || 
        query === 'list' || query === 'accounts' || query === 'ledgers') {
      
      const supabase = this.getSupabaseService();
      const ledgers = await supabase.getAllLedgers(request.clientId, 50); // Get up to 50 accounts
      
      if (ledgers.length === 0) {
        return {
          success: false,
          type: 'ledger',
          data: [],
          response: 'No ledger accounts found. Please ensure your data is synced.',
          executionTime: 0,
          cacheHit: false
        };
      }

      let response = `**All Ledger Accounts (Showing ${Math.min(10, ledgers.length)} of ${ledgers.length}):**\n\n`;
      ledgers.slice(0, 10).forEach((ledger, i) => {
        const balance = Math.abs(ledger.closing_balance);
        const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
        const displayBalance = balance === 0 ? '—' : `₹${balance.toLocaleString('en-IN')} ${type}`;
        response += `${i + 1}. **${ledger.name}** - ${displayBalance}\n`;
      });
      
      if (ledgers.length > 10) {
        response += `\n... and ${ledgers.length - 10} more accounts.`;
      }
      
      response += '\n\n💡 **Tip:** Use "Quick access" to see your frequently used accounts!';

      return {
        success: true,
        type: 'ledger',
        data: ledgers,
        response,
        executionTime: 0,
        cacheHit: false
      };
    }

    // Handle quick access / recent accounts
    if (query.includes('quick access') || query.includes('recent') || query.includes('shortcuts')) {
      const recentLedgers = clientPreferences.getLastUsed(request.clientId);
      
      let response = '🚀 **Quick Commands & Shortcuts:**\n\n';
      
      // Essential quick commands
      response += '**📊 Analytics:**\n';
      response += '• "my sales" - Sales analysis\n';
      response += '• "bank balance" - Total bank balance\n';
      response += '• "highest balance" - Top balances\n';
      response += '• "how many ledgers" - Account count\n\n';
      
      response += '**🏢 Company Info:**\n';
      response += '• "details" - Company details\n';
      response += '• "address" - Company address\n';
      response += '• "phone" - Company phone\n\n';
      
      response += '**📈 Reports:**\n';
      response += '• "list" - All accounts\n';
      response += '• "monthly sales" - Monthly analysis\n';
      response += '• "profit loss" - P&L summary\n\n';
      
      response += '**🔍 Search:**\n';
      response += '• "[company name] balance" - Specific balance\n';
      response += '• "top 10 customers" - Customer analysis\n\n';
      
      // Add recently used accounts if available
      if (recentLedgers.length > 0) {
        response += '**🕰️ Recently Used Accounts:**\n';
        const supabase = this.getSupabaseService();
        for (let i = 0; i < Math.min(5, recentLedgers.length); i++) {
          const ledgerName = recentLedgers[i];
          const ledgers = await supabase.searchLedgers(request.clientId, ledgerName, 1);
          if (ledgers.length > 0) {
            const ledger = ledgers[0];
            const balance = Math.abs(ledger.closing_balance);
            const type = ledger.closing_balance >= 0 ? 'Dr' : 'Cr';
            response += `${i + 1}. **${ledger.name}** - ₹${balance.toLocaleString('en-IN')} ${type}\n`;
          }
        }
      } else {
        response += '**📁 Tip:** Start searching for accounts to see your recently used ones here!';
      }

      return {
        success: true,
        type: 'general',
        data: { quickCommands: true, recentLedgers },
        response,
        executionTime: 0,
        cacheHit: false,
        suggestions: [
          'Try: "my sales"',
          'Try: "bank balance"', 
          'Try: "details"',
          'Try: "highest balance"'
        ]
      };
    }

    // Default fallback for unrecognized queries
    return {
      success: false,
      type: 'ledger',
      data: null,
      response: 'I can help you with:\n\n• **Account balances:** "What is [company name] balance?"\n• **List accounts:** "List all ledger accounts"\n• **Quick access:** "Show recent accounts"\n• **Generate PDFs:** "Send invoice of [company name]"\n• **Analytics:** "Which company has highest balance?"',
      executionTime: 0,
      cacheHit: false,
      suggestions: [
        'Try: "What is [company name] closing balance?"',
        'Try: "List all ledger accounts"',
        'Try: "Which company has highest balance?"'
      ]
    };
  }

  /**
   * Check if query should use AI processing - now includes inventory/stock queries for better understanding
   */
  private shouldUseAI(query: string): boolean {
    const q = query.toLowerCase();
    
    console.log(`🤖 Checking if AI should be used for query: "${query}"`);
    
    // Always use AI for better natural language understanding
    // This allows the AI to handle both simple and complex queries intelligently
    const alwaysUseAiPatterns = [
      // Natural language questions
      /what\s+is/i,
      /how\s+much/i,
      /how\s+many/i,
      /show\s+me/i,
      /give\s+me/i,
      /tell\s+me/i,
      
      // Hindi/Hinglish patterns
      /kitna|kitne|kya|hai|maal|samaan|saman/i,
      /mere\s+paas|humara|hamare/i,
      
      // Balance and account queries
      /balance/i,
      /account/i,
      /ledger/i,
      
      // PDF generation patterns
      /send\s+me\s+pdf/i,
      /generate\s+pdf/i,
      /pdf\s+of\s+.*stock/i,
      /pdf\s+for\s+.*stock/i,
      /export\s+.*pdf/i,
      /create\s+.*report/i,
      /report\s+of\s+stock/i,
      
      // Complex analytical patterns
      /analyze\s+my\s+.*performance/i,
      /compare\s+.*with\s+.*trend/i,
      /show\s+me\s+.*insights/i,
      /what\s+are\s+my\s+.*recommendations/i,
      /predict\s+.*based\s+on/i,
      
      // Natural language inventory queries
      /how\s+much.*do\s+i\s+have/i,
      /what.*stock.*available/i,
      /show.*inventory/i,
      /stock.*status/i
    ];
    
    // Use AI for most queries to improve natural language understanding
    const shouldUse = alwaysUseAiPatterns.some(pattern => pattern.test(query)) || q.length > 3;
    console.log(`🤖 AI usage decision for "${query}": ${shouldUse}`);
    
    if (shouldUse) {
      console.log('🧠 Using AI processing for better natural language understanding');
    }
    
    return shouldUse;
  }

  /**
   * Process query using AI (OpenAI, Gemini, or Knowledge Base fallback)
   */
  private async processWithAI(request: QueryRequest): Promise<QueryResponse | null> {
    console.log('\n=== 🤖 AI QUERY PROCESSING START ===');
    console.log(`📝 User Query: "${request.query}"`);
    console.log(`🏢 Client ID: ${request.clientId}`);
    console.log(`📞 WhatsApp: ${request.whatsappNumber || 'N/A'}`);
    
    const aiStartTime = Date.now();
    
    // Check available AI services
    console.log('\n🔍 Checking available AI services:');
    console.log(`🚀 OpenAI: ${this.openaiService ? '✅ Available' : '❌ Not configured'}`);
    console.log(`🔶 Gemini: ${this.geminiService ? '✅ Available' : '❌ Not configured'}`);
    console.log(`🧠 Knowledge Base: ✅ Always available`);
    
    // Try OpenAI first
    if (this.openaiService) {
      console.log('\n🚀 ATTEMPTING OPENAI PROCESSING...');
      console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY ? 'SET' : 'MISSING'}`);
      
      try {
        const openaiStartTime = Date.now();
        console.log('📤 Sending request to OpenAI...');
        
        const aiResponse = await this.openaiService.processTallyQuery(
          request.query,
          { 
            isConnected: this.tallyService?.isConnected() || false,
            companyName: this.tallyService?.getCompanyName?.() || 'Unknown'
          },
          { clientId: request.clientId }
        );
        
        const openaiTime = Date.now() - openaiStartTime;
        console.log(`📥 OpenAI Response received in ${openaiTime}ms`);
        console.log('🎯 OpenAI Response:', {
          type: aiResponse.type,
          hasSQL: !!aiResponse.sql,
          explanation: aiResponse.explanation?.substring(0, 100) + '...',
          requiresExecution: aiResponse.requiresExecution,
          hasBusinessInsights: !!aiResponse.businessInsights
        });
        
        if (aiResponse && aiResponse.type !== 'explanation') {
          console.log('✅ OpenAI processing successful - handling response');
          const result = await this.handleAIResponse(aiResponse, request);
          console.log(`🎉 AI Processing completed in ${Date.now() - aiStartTime}ms via OpenAI`);
          return result;
        } else {
          console.log('⚠️ OpenAI returned explanation only - trying next service');
        }
      } catch (error) {
        console.error('❌ OpenAI processing failed:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.substring(0, 200) : 'N/A'
        });
        console.log('🔄 Falling back to Gemini...');
      }
    } else {
      console.log('⏭️ OpenAI not available, skipping to Gemini');
    }
    
    // Try Gemini as fallback
    if (this.geminiService) {
      console.log('\n🔶 ATTEMPTING GEMINI PROCESSING...');
      console.log(`🔑 API Key: ${process.env.GOOGLE_AI_API_KEY ? 'SET' : 'MISSING'}`);
      
      try {
        const geminiStartTime = Date.now();
        console.log('📤 Sending request to Gemini...');
        
        const aiResponse = await this.geminiService.processTallyQuery(
          request.query,
          { 
            isConnected: this.tallyService?.isConnected() || false,
            companyName: this.tallyService?.getCompanyName?.() || 'Unknown'
          },
          { clientId: request.clientId }
        );
        
        const geminiTime = Date.now() - geminiStartTime;
        console.log(`📥 Gemini Response received in ${geminiTime}ms`);
        console.log('🎯 Gemini Response:', {
          type: aiResponse.type,
          hasSQL: !!aiResponse.sql,
          explanation: aiResponse.explanation?.substring(0, 100) + '...',
          requiresExecution: aiResponse.requiresExecution,
          hasBusinessInsights: !!aiResponse.businessInsights,
          searchTerm: aiResponse.searchTerm || 'N/A'
        });
        
        if (aiResponse && aiResponse.type !== 'explanation') {
          console.log('✅ Gemini processing successful - handling response');
          const result = await this.handleAIResponse(aiResponse, request);
          console.log(`🎉 AI Processing completed in ${Date.now() - aiStartTime}ms via Gemini`);
          return result;
        } else {
          console.log('⚠️ Gemini returned explanation only - trying knowledge base');
        }
      } catch (error) {
        console.error('❌ Gemini processing failed:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.substring(0, 200) : 'N/A'
        });
        console.log('🔄 Falling back to Knowledge Base...');
      }
    } else {
      console.log('⏭️ Gemini not available, skipping to Knowledge Base');
    }
    
    // Use TallyKaro Knowledge Base as final fallback
    console.log('\n🧠 USING TALLYKARO KNOWLEDGE BASE FALLBACK...');
    console.log('📚 This is our rule-based AI system for Tally queries');
    
    try {
      const kbStartTime = Date.now();
      const result = await this.processWithKnowledgeBase(request);
      const kbTime = Date.now() - kbStartTime;
      
      if (result) {
        console.log(`✅ Knowledge Base processing successful in ${kbTime}ms`);
        console.log('🎯 KB Result:', {
          type: result.type,
          success: result.success,
          hasData: !!result.data
        });
      } else {
        console.log('❌ Knowledge Base processing failed');
      }
      
      console.log(`🏁 Total AI processing time: ${Date.now() - aiStartTime}ms`);
      console.log('=== 🤖 AI QUERY PROCESSING END ===\n');
      
      return result;
    } catch (error) {
      console.error('❌ Knowledge Base processing failed:', error);
      console.log(`🏁 Total AI processing time: ${Date.now() - aiStartTime}ms (FAILED)`);
      console.log('=== 🤖 AI QUERY PROCESSING END ===\n');
      return null;
    }
  }
  
  /**
   * Process query using TallyKaro Knowledge Base (rule-based AI fallback)
   */
  private async processWithKnowledgeBase(request: QueryRequest): Promise<QueryResponse | null> {
    console.log('🧠 Processing query with TallyKaro Knowledge Base...');
    console.log(`🔍 Analyzing query: "${request.query}"`);
    
    const tallyQuery = tallyKnowledgeBase.processQuery(request.query);
    
    if (!tallyQuery) {
      console.log('❌ No suitable pattern found in knowledge base');
      console.log('📋 Available categories:', tallyKnowledgeBase.getCategories());
      console.log('💡 Suggestions:', tallyKnowledgeBase.getSuggestions().slice(0, 3));
      return null;
    }
    
    console.log(`✅ Knowledge base pattern matched!`);
    console.log('🎯 Match details:', {
      description: tallyQuery.description,
      category: tallyQuery.category,
      confidence: tallyQuery.confidence,
      sql: tallyQuery.sql.substring(0, 100) + '...'
    });
    
    // Execute the generated Tally query
    if (this.tallyService && this.tallyService.isConnected()) {
      console.log('🔌 Tally service is connected - executing query...');
      
      try {
        console.log(`📦 Executing Tally ODBC query:`);
        console.log(`   Category: ${tallyQuery.category}`);
        console.log(`   SQL: ${tallyQuery.sql}`);
        
        const queryStartTime = Date.now();
        const result = await this.tallyService.executeQuery(tallyQuery.sql);
        const queryTime = Date.now() - queryStartTime;
        
        console.log(`📊 Query execution completed in ${queryTime}ms`);
        console.log('🎯 Query result:', {
          success: result.success,
          dataCount: result.data?.length || 0,
          errorMessage: result.error || 'None'
        });
        
        if (result.success && result.data) {
          console.log('✅ Query successful - formatting knowledge base response...');
          const formattedResult = await this.formatKnowledgeBaseResponse(tallyQuery, result, request);
          console.log('🎉 Knowledge base response formatted successfully');
          return formattedResult;
        } else {
          console.log('❌ Query failed or returned no data');
          console.log('Error details:', result.error);
        }
      } catch (error) {
        console.error('❌ Knowledge base query execution failed:', {
          message: error instanceof Error ? error.message : String(error),
          querySQL: tallyQuery.sql,
          category: tallyQuery.category
        });
      }
    } else {
      console.log('⚠️ Tally service not connected - returning explanation only');
      console.log(`🔌 Service state: ${this.tallyService ? 'exists but not connected' : 'not initialized'}`);
    }
    
    // Return explanation if query couldn't be executed
    console.log('📝 Returning explanation response (no execution)');
    return {
      success: true,
      type: 'general',
      data: null,
      response: `🧠 **AI Understanding:** ${tallyQuery.description}\n\n💡 **Note:** Connect to Tally to execute this query and get real data.\n\n**Query would execute:** ${tallyQuery.category} analysis\n\n**Try these examples:**\n${tallyKnowledgeBase.getSuggestions().slice(0, 5).join('\n')}`,
      executionTime: 0,
      cacheHit: false,
      suggestions: tallyKnowledgeBase.getSuggestions()
    };
  }
  
  /**
   * Handle AI service responses (OpenAI/Gemini)
   */
  private async handleAIResponse(aiResponse: any, request: QueryRequest): Promise<QueryResponse | null> {
    // Handle different AI response types
    switch (aiResponse.type) {
      case 'smart_query':
        if (aiResponse.searchTerm) {
          // Use AI-extracted search term for ledger query
          const enhancedRequest = { ...request, query: aiResponse.searchTerm };
          const ledgerResult = await this.processLedgerQuery(enhancedRequest);
          
          // Enhance response with AI insights
          if (ledgerResult.success && aiResponse.businessInsights) {
            ledgerResult.response += `\n\n🤖 **AI Insights:** ${aiResponse.businessInsights}`;
          }
          return ledgerResult;
        }
        break;
        
      case 'analysis':
        return {
          success: true,
          type: 'analytical',
          data: null,
          response: `🤖 **AI Analysis:** ${aiResponse.explanation}\n\n${aiResponse.businessInsights || ''}`,
          executionTime: 0,
          cacheHit: false,
          suggestions: aiResponse.followUpQuestions || []
        };
        
      case 'sql':
        // EXECUTE THE AI-GENERATED SQL DIRECTLY IN TALLY!
        if (aiResponse.sql && aiResponse.requiresExecution) {
          console.log('🚀 Executing AI-generated SQL:', aiResponse.sql);
          try {
            const sqlResult = await this.tallyService.executeQuery(aiResponse.sql);
            console.log('✅ AI SQL executed successfully:', sqlResult);
            
            if (sqlResult.success && sqlResult.data && sqlResult.data.length > 0) {
              // Format the results nicely
              let formattedResponse = `🤖 **AI Query Result:** ${aiResponse.explanation}\n\n`;
              
              // Show top 10 results
              const displayData = sqlResult.data.slice(0, 10);
              displayData.forEach((row: any, index: number) => {
                const name = row.LEDGER_NAME || row.STOCK_ITEM_NAME || row.name || row.$Name || 'Unknown';
                const balance = row.BALANCE || row.STOCK_AMOUNT || row.balance || row.$ClosingBalance || 0;
                const formattedBalance = typeof balance === 'number' ? 
                  `Rs.${balance.toLocaleString('en-IN')}` : balance;
                formattedResponse += `${index + 1}. **${name}**: ${formattedBalance}\n`;
              });
              
              if (sqlResult.data.length > 10) {
                formattedResponse += `\n... and ${sqlResult.data.length - 10} more records.`;
              }
              
              if (aiResponse.businessInsights) {
                formattedResponse += `\n\n💡 **Business Insights:** ${aiResponse.businessInsights}`;
              }
              
              return {
                success: true,
                type: 'analytical',
                data: sqlResult.data,
                response: formattedResponse,
                executionTime: sqlResult.executionTime || 0,
                cacheHit: false,
                suggestions: aiResponse.followUpQuestions || []
              };
            } else {
              return {
                success: true,
                type: 'general',
                data: null,
                response: `🤖 Query executed but no data found. ${aiResponse.explanation}`,
                executionTime: 0,
                cacheHit: false
              };
            }
          } catch (error) {
            console.error('❌ Failed to execute AI SQL:', error);
            return {
              success: false,
              type: 'general',
              data: null,
              response: `❌ Failed to execute query: ${aiResponse.explanation}`,
              executionTime: 0,
              cacheHit: false
            };
          }
        }
        break;

      case 'explanation':
        return {
          success: true,
          type: 'general',
          data: null,
          response: `💡 **AI Assistant:** ${aiResponse.explanation}`,
          executionTime: 0,
          cacheHit: false,
          suggestions: aiResponse.followUpQuestions || []
        };
    }
    
    return null;
  }
  
  /**
   * Format response from knowledge base query execution
   */
  private async formatKnowledgeBaseResponse(tallyQuery: TallyQuery, result: any, request: QueryRequest): Promise<QueryResponse> {
    let response = `🧠 **AI Analysis:** ${tallyQuery.description}\n\n`;
    
    // Format response based on query category
    switch (tallyQuery.category) {
      case 'company':
        if (result.data && result.data.length > 0) {
          const company = result.data[0];
          response += `🏢 **${company.company_name || company.$Name || 'Company'}**\n\n`;
          response += `📍 **Address:** ${company.address || company.$Address || 'Not available'}\n`;
          if (company.phone || company.$Phone) {
            response += `📞 **Phone:** ${company.phone || company.$Phone}\n`;
          }
        }
        break;
        
      case 'sales':
        // Delegate to existing sales processing
        return await this.processAnalyticalQuery(request);
        
      case 'analytical':
        if (request.query.toLowerCase().includes('bank')) {
          return this.formatBankBalanceKB(result, request);
        } else if (request.query.toLowerCase().includes('highest')) {
          return this.formatHighestBalanceKB(result, request);
        } else if (request.query.toLowerCase().includes('count') || request.query.toLowerCase().includes('how many')) {
          response += `📆 **Total Count:** ${result.data.length}\n\n`;
          response += `This includes all ledger accounts in your Tally database.`;
        }
        break;
        
      case 'ledger':
        if (result.data && result.data.length > 0) {
          response += `📊 **Account Information:**\n\n`;
          result.data.slice(0, 10).forEach((acc: any, i: number) => {
            const balance = Math.abs(parseFloat(acc.balance || acc.$ClosingBalance || 0));
            const type = (parseFloat(acc.balance || acc.$ClosingBalance || 0)) >= 0 ? 'Dr' : 'Cr';
            response += `${i + 1}. **${acc.name || acc.$Name}** (${acc.parent || acc.$Parent}) - ₹${balance.toLocaleString('en-IN')} ${type}\n`;
          });
          if (result.data.length > 10) {
            response += `\n... and ${result.data.length - 10} more accounts`;
          }
        }
        break;
    }
    
    return {
      success: true,
      type: tallyQuery.category,
      data: result.data,
      response: response,
      executionTime: result.executionTime || 0,
      cacheHit: false,
      suggestions: tallyKnowledgeBase.getSuggestions(tallyQuery.category)
    };
  }
  
  private formatBankBalanceKB(result: any, request: QueryRequest): QueryResponse {
    // Use existing bank balance formatting from main.ts
    let totalBalance = 0;
    let positiveBalance = 0;
    let negativeBalance = 0;
    
    result.data.forEach((acc: any) => {
      const balance = parseFloat(acc.balance || acc.$ClosingBalance || 0);
      totalBalance += balance;
      if (balance > 0) positiveBalance += balance;
      if (balance < 0) negativeBalance += Math.abs(balance);
    });
    
    let response = `🧠 **AI Analysis:** Bank account balance analysis\n\n`;
    response += `🏦 **Total Bank Balance:** ₹${Math.abs(totalBalance).toLocaleString('en-IN')} ${totalBalance >= 0 ? 'Dr' : 'Cr'}\n\n`;
    
    if (positiveBalance > 0) {
      response += `💰 **Available Funds:** ₹${positiveBalance.toLocaleString('en-IN')}\n`;
    }
    if (negativeBalance > 0) {
      response += `💳 **Overdraft/Loans:** ₹${negativeBalance.toLocaleString('en-IN')}\n`;
    }
    
    return {
      success: true,
      type: 'analytical',
      data: { totalBalance, accounts: result.data },
      response: response,
      executionTime: result.executionTime || 0,
      cacheHit: false
    };
  }
  
  private formatHighestBalanceKB(result: any, request: QueryRequest): QueryResponse {
    // Sort by absolute balance and take top 10
    const sorted = result.data
      .map((acc: any) => ({
        ...acc,
        absBalance: Math.abs(parseFloat(acc.balance || acc.$ClosingBalance || 0))
      }))
      .sort((a: any, b: any) => b.absBalance - a.absBalance)
      .slice(0, 10);
    
    let response = `🧠 **AI Analysis:** Accounts with highest closing balances\n\n`;
    response += `📈 **Top 10 Highest Balances:**\n\n`;
    
    sorted.forEach((acc: any, i: number) => {
      const balance = Math.abs(parseFloat(acc.balance || acc.$ClosingBalance || 0));
      const type = (parseFloat(acc.balance || acc.$ClosingBalance || 0)) >= 0 ? 'Dr' : 'Cr';
      response += `${i + 1}. **${acc.name || acc.$Name}** (${acc.parent || acc.$Parent})\n   ₹${balance.toLocaleString('en-IN')} ${type}\n\n`;
    });
    
    return {
      success: true,
      type: 'analytical',
      data: sorted,
      response: response,
      executionTime: result.executionTime || 0,
      cacheHit: false
    };
  }

  /**
   * Record query analytics
   */
  private async recordQueryAnalytics(request: QueryRequest, result: QueryResponse, startTime: number): Promise<void> {
    try {
      const supabase = this.getSupabaseService();
      await supabase.recordQueryAnalytics({
        client_id: request.clientId,
        query_type: result.type,
        query_text: request.query,
        response_time_ms: Date.now() - startTime,
        cache_hit: result.cacheHit,
        whatsapp_number: request.whatsappNumber || null
      });
      console.log(`📊 Query: ${request.query} | Type: ${result.type} | Time: ${Date.now() - startTime}ms | Cache: ${result.cacheHit}`);
    } catch (error) {
      console.error('Analytics recording error:', error);
    }
  }

  /**
   * Sync data from S3 to Supabase
   */
  async syncFromS3(clientId: string): Promise<boolean> {
    try {
      console.log(`🔄 Syncing S3 data to Supabase for client: ${clientId}`);

      // Get data from S3
      const [ledgerData, companyData] = await Promise.all([
        this.s3Service.getTallyData(clientId, 'LEDGER'),
        this.s3Service.getTallyData(clientId, 'COMPANY')
      ]);

      // Sync to Supabase
      const supabase = this.getSupabaseService();
      const [ledgerSync, companySync] = await Promise.all([
        supabase.syncLedgers(clientId, ledgerData),
        supabase.syncCompany(clientId, companyData)
      ]);

      if (ledgerSync && companySync) {
        console.log(`✅ S3 to Supabase sync completed for ${clientId}`);
        return true;
      } else {
        console.error(`❌ S3 to Supabase sync failed for ${clientId}`);
        return false;
      }

    } catch (error) {
      console.error('S3 to Supabase sync error:', error);
      return false;
    }
  }

  /**
   * Test connection to Supabase
   */
  async testConnection(): Promise<boolean> {
    const supabase = this.getSupabaseService();
    return await supabase.testConnection();
  }

  /**
   * Check if query is a numeric selection (e.g., "1", "2", "3")
   */
  private isNumericSelection(query: string): number {
    const trimmed = query.trim();
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0 && num <= 20 && trimmed === num.toString()) {
      return num;
    }
    return 0;
  }

  /**
   * Extract stock item name from query for PDF generation
   */
  private extractStockItemFromQuery(query: string): string | null {
    const q = query.toLowerCase();
    
    // Common patterns for stock item PDF requests
    const patterns = [
      /pdf\s+of\s+([\w\s]+?)(?:\s+stock|$)/i,
      /pdf\s+for\s+([\w\s]+?)(?:\s+stock|$)/i,
      /([\w\s]+?)\s+pdf/i,
      /send\s+me\s+pdf\s+of\s+([\w\s]+)/i,
      /generate\s+pdf\s+for\s+([\w\s]+)/i,
      /([\w\s]+?)\s+stock\s+pdf/i
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        let itemName = match[1].trim();
        // Clean up common words
        itemName = itemName.replace(/\b(stock|item|items|the|of|for)\b/gi, '').trim();
        if (itemName.length > 0) {
          return itemName;
        }
      }
    }
    
    return null;
  }

  /**
   * Handle numeric selection from previous results
   */
  private async handleNumericSelection(request: QueryRequest, selection: number): Promise<QueryResponse | null> {
    try {
      const context = await conversationService.getContext(request.clientId, 'ledger_selection');
      
      if (!context || !context.context_data?.data?.ledgers) {
        return null;
      }

      const ledgers: LedgerRecord[] = context.context_data.data.ledgers;
      
      if (selection > ledgers.length) {
        return {
          success: false,
          type: 'ledger',
          data: null,
          response: `❌ Invalid selection. Please choose a number between 1 and ${ledgers.length}.`,
          executionTime: 0,
          cacheHit: false
        };
      }

      const selectedLedger = ledgers[selection - 1];
      const balance = Math.abs(selectedLedger.closing_balance);
      const type = selectedLedger.closing_balance >= 0 ? 'Dr' : 'Cr';

      // Clear the context after selection
      await conversationService.clearContext(request.clientId, 'ledger_selection');

      // Track this ledger as recently used
      clientPreferences.addToLastUsed(request.clientId, selectedLedger.name);

      return {
        success: true,
        type: 'ledger',
        data: selectedLedger,
        response: `✅ **${selectedLedger.name}** (${selectedLedger.parent})\nClosing Balance: ₹${balance.toLocaleString('en-IN')} ${type}\n\n💡 Say "generate pdf" or "send invoice" to create an e-invoice for this account.`,
        executionTime: 0,
        cacheHit: false
      };

    } catch (error) {
      console.error('Error handling numeric selection:', error);
      return null;
    }
  }

  /**
   * Process reminder and to-do queries
   */
  private async processReminderQuery(request: QueryRequest): Promise<QueryResponse> {
    const query = request.query.toLowerCase();
    
    // Check what type of reminder this is
    if (query.includes('remind me') || query.includes('set reminder')) {
      return {
        success: true,
        type: 'reminders',
        data: null,
        response: `📝 **Reminder Feature Coming Soon!**\n\n🔧 **Planned Features:**\n• Set payment collection reminders\n• Bank transfer notifications\n• Due bill alerts\n• Follow-up reminders\n\n💡 For now, you can:\n• Check outstanding receivables with "show outstanding"\n• View pending bills with "pending bills"\n• Get customer balances for follow-up`,
        executionTime: 0,
        cacheHit: false,
        suggestions: [
          'Try: "show outstanding receivables"',
          'Try: "pending bills"', 
          'Try: "who has not paid me yet"'
        ]
      };
    }
    
    if (query.includes('today\'s reminders') || query.includes('pending tasks')) {
      return {
        success: true,
        type: 'reminders',
        data: null,
        response: `📅 **Today's Business Tasks**\n\n✅ **Available Now:**\n• Check outstanding payments: "show outstanding"\n• Review due bills: "overdue bills"\n• Bank balance check: "bank balance"\n• Today's sales: "today's sales"\n\n🔜 **Coming Soon:**\n• Custom reminder system\n• Automated follow-ups\n• Task management`,
        executionTime: 0,
        cacheHit: false,
        suggestions: [
          'Check: "show outstanding receivables"',
          'Review: "overdue bills"',
          'Monitor: "today\'s sales"'
        ]
      };
    }
    
    return {
      success: true,
      type: 'reminders',
      data: null,
      response: `📋 **Task & Reminder Management**\n\n🔧 **Available Commands:**\n• "show outstanding" - See pending payments\n• "overdue bills" - Check overdue invoices\n• "pending bills" - View unpaid bills\n• "who has not paid" - Customer follow-ups\n\n💡 **Quick Actions:**\n• Generate customer statements for follow-up\n• Check cash flow for payment planning\n• Review trial balance for account reconciliation`,
      executionTime: 0,
      cacheHit: false,
      suggestions: [
        'Try: "show outstanding receivables"',
        'Try: "overdue bills"',
        'Try: "pending invoices"'
      ]
    };
  }

  /**
   * Map comprehensive query handler categories to our response types
   */
  private mapCategoryToType(category: string): 'company' | 'ledger' | 'analytical' | 'inventory' | 'reminders' | 'cached' | 'error' | 'general' {
    const categoryLower = category.toLowerCase();

    switch (categoryLower) {
      case 'company information':
      case 'company':
        return 'company';
      case 'sales':
      case 'purchase':
      case 'outstanding':
      case 'cash & bank':
      case 'ledger':
        return 'ledger';
      case 'analytical':
        return 'analytical';
      case 'inventory':
        return 'inventory';
      case 'reminder':
        return 'reminders';
      case 'invoices':
      case 'miscellaneous':
      default:
        return 'general';
    }
  }

  /**
   * Check if query is asking about sales
   */
  private isSalesQuery(query: string): boolean {
    const salesKeywords = [
      'sales', 'sale', 'bechna', 'becha', 'bechne',
      'total sales', 'sales for', 'sales in', 'sales during',
      'today sales', 'this month sales', 'last week sales',
      'yesterday sales', 'monthly sales', 'yearly sales',
      'sales summary', 'sales report', 'sales data',
      'how much did i sell', 'what are my sales',
      'kitna becha', 'kitni sales', 'sales kitni',
      'what is my sales', 'show sales', 'show me sales',
      'sales for august', 'august sales', 'sales this year'
    ];

    return salesKeywords.some(keyword => query.includes(keyword)) &&
           !query.includes('purchase') && // Exclude if also contains purchase
           !query.includes('order'); // Exclude sales orders for now
  }

  /**
   * Check if query is asking about purchases
   */
  private isPurchaseQuery(query: string): boolean {
    const purchaseKeywords = [
      'purchase', 'purchases', 'kharida', 'kharide', 'kharidar',
      'total purchase', 'purchase for', 'purchase in', 'purchase during',
      'today purchase', 'this month purchase', 'last week purchase',
      'yesterday purchase', 'monthly purchase', 'yearly purchase',
      'purchase summary', 'purchase report', 'purchase data',
      'how much did i buy', 'what are my purchase',
      'kitna kharida', 'kitni purchase', 'purchase kitni',
      'what is my purchase', 'show purchase', 'show me purchase',
      'purchase for august', 'august purchase', 'purchase this year',
      'what are my purchases', 'total purchases'
    ];

    return purchaseKeywords.some(keyword => query.includes(keyword)) &&
           !query.includes('order'); // Exclude purchase orders (handled separately)
  }

  /**
   * Check if query is asking about purchase orders
   */
  private isPurchaseOrderQuery(query: string): boolean {
    const purchaseOrderKeywords = [
      'purchase order', 'purchase orders', 'po for', 'purchase order for',
      'show purchase order', 'pending purchase order', 'open purchase order',
      'purchase order status', 'po status', 'purchase order july',
      'purchase order august', 'purchase order this month'
    ];

    return purchaseOrderKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * Format sales/purchase response
   */
  private formatSalesPurchaseResponse(result: any, isSales: boolean): string {
    const type = isSales ? 'Sales' : 'Purchases';
    const emoji = isSales ? '💰' : '🛒';

    if (!result.summary) {
      return `${emoji} **${type} Data**\n\nNo summary available.`;
    }

    const summary = result.summary;
    const period = result.period || 'the specified period';

    let response = `${emoji} **${type} Summary**\n`;
    response += `📅 **Period:** ${period}\n\n`;

    if (isSales) {
      response += `💵 **Total Sales:** ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `📊 **Transactions:** ${summary.transactionCount}\n`;
      response += `📈 **Average Sale:** ₹${summary.averageSale.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `🧾 **Tax Amount:** ₹${summary.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `👥 **Unique Customers:** ${summary.uniqueCustomers}\n`;
    } else {
      response += `💵 **Total Purchases:** ₹${summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `📊 **Transactions:** ${summary.transactionCount}\n`;
      response += `📈 **Average Purchase:** ₹${summary.averagePurchase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `🧾 **Tax Amount:** ₹${summary.taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      response += `🏭 **Unique Suppliers:** ${summary.uniqueSuppliers}\n`;
    }

    // Add top 5 transactions if available
    if (result.data && result.data.length > 0) {
      response += `\n📋 **Top Transactions:**\n`;
      const topTransactions = result.data.slice(0, 5);
      topTransactions.forEach((txn: any, index: number) => {
        const date = new Date(txn.voucher_date).toLocaleDateString('en-IN');
        const amount = parseFloat(txn.net_amount || 0);
        response += `${index + 1}. ${txn.party_name} - ₹${amount.toLocaleString('en-IN')} (${date})\n`;
      });

      if (result.data.length > 5) {
        response += `\n_...and ${result.data.length - 5} more transactions_\n`;
      }
    }

    return response;
  }

}