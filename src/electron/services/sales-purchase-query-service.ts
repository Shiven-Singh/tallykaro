/**
 * Sales & Purchase Query Service
 * Queries synced transaction data from Supabase
 */

import { SupabaseService } from './supabase-service';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface SalesQueryResult {
  success: boolean;
  data?: any[];
  summary?: {
    totalSales: number;
    transactionCount: number;
    averageSale: number;
    taxAmount: number;
    uniqueCustomers: number;
  };
  error?: string;
  period?: string;
}

export interface PurchaseQueryResult {
  success: boolean;
  data?: any[];
  summary?: {
    totalPurchases: number;
    transactionCount: number;
    averagePurchase: number;
    taxAmount: number;
    uniqueSuppliers: number;
  };
  error?: string;
  period?: string;
}

export class SalesPurchaseQueryService {
  private supabaseService: SupabaseService;
  private openAIService: any;
  private geminiService: any;

  constructor(supabaseService: SupabaseService) {
    this.supabaseService = supabaseService;

    // Initialize AI services for insights
    try {
      const { OpenAIService } = require('../utils/ai/openai');
      const { GeminiService } = require('../utils/ai/gemini');
      this.openAIService = new OpenAIService();
      this.geminiService = new GeminiService();
      console.log('✅ AI services initialized for sales insights');
    } catch (error) {
      console.warn('⚠️ AI services not available:', error);
    }
  }

  /**
   * Detect if query is asking for superlatives (highest, lowest, best, worst)
   */
  private isSuperlativeQuery(query: string): { isSuperlative: boolean; type: 'highest' | 'lowest' | null } {
    const queryLower = query.toLowerCase();

    // English superlatives
    const highestPatterns = ['highest', 'maximum', 'max', 'best', 'most', 'top', 'greatest', 'largest'];
    const lowestPatterns = ['lowest', 'minimum', 'min', 'worst', 'least', 'bottom', 'smallest'];

    // Hindi superlatives
    const hindiHighestPatterns = ['sabse zyada', 'sabse jyada', 'sabse bada', 'sabse ucha', 'maximum'];
    const hindiLowestPatterns = ['sabse kam', 'sabse chota', 'sabse neeche', 'minimum'];

    // Check highest
    for (const pattern of [...highestPatterns, ...hindiHighestPatterns]) {
      if (queryLower.includes(pattern)) {
        return { isSuperlative: true, type: 'highest' };
      }
    }

    // Check lowest
    for (const pattern of [...lowestPatterns, ...hindiLowestPatterns]) {
      if (queryLower.includes(pattern)) {
        return { isSuperlative: true, type: 'lowest' };
      }
    }

    return { isSuperlative: false, type: null };
  }

  /**
   * Parse natural language date queries with week support
   */
  private parseDateQuery(query: string): DateRange | null {
    const today = new Date();
    const queryLower = query.toLowerCase();

    // Check for week-based queries (e.g., "sales for july 1st week", "1st week of july")
    const weekPatterns = [
      /(\w+)\s+(\d+)(?:st|nd|rd|th)\s+week/i,         // "july 1st week"
      /(\d+)(?:st|nd|rd|th)\s+week\s+of\s+(\w+)/i,   // "1st week of july"
      /week\s+(\d+)\s+of\s+(\w+)/i                   // "week 1 of july"
    ];

    for (const pattern of weekPatterns) {
      const match = query.match(pattern);
      if (match) {
        const monthName = match[1] || match[2];
        const weekNumber = parseInt(match[2] || match[1]);

        // Find the month
        const monthMap: { [key: string]: number } = {
          'january': 0, 'jan': 0,
          'february': 1, 'feb': 1,
          'march': 2, 'mar': 2,
          'april': 3, 'apr': 3,
          'may': 4,
          'june': 5, 'jun': 5,
          'july': 6, 'jul': 6,
          'august': 7, 'aug': 7,
          'september': 8, 'sep': 8, 'sept': 8,
          'october': 9, 'oct': 9,
          'november': 10, 'nov': 10,
          'december': 11, 'dec': 11
        };

        const monthIndex = monthMap[monthName.toLowerCase()];
        if (monthIndex !== undefined && weekNumber >= 1 && weekNumber <= 5) {
          // Extract year from query (4-digit years like 2023, 2024, etc.)
          const yearMatch = query.match(/\b(20\d{2})\b/);
          const year = yearMatch ? parseInt(yearMatch[1]) : today.getFullYear();

          // Calculate week dates
          const startOfMonth = new Date(year, monthIndex, 1);
          const startDay = (weekNumber - 1) * 7 + 1;
          const endDay = Math.min(startDay + 6, new Date(year, monthIndex + 1, 0).getDate());

          const startDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
          const endDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

          console.log(`📅 Matched week query: Week ${weekNumber} of ${monthName} ${year}`);

          return {
            startDate,
            endDate
          };
        }
      }
    }


    // Check for "till now" / "till date" / "so far" / "ab tak" patterns
    const tillNowPatterns = ['till now', 'till date', 'till today', 'so far', 'ab tak', 'ab tak ka', 'until now'];
    for (const pattern of tillNowPatterns) {
      if (queryLower.includes(pattern)) {
        // Return from beginning of time to today
        return {
          startDate: '1970-01-01',
          endDate: today.toISOString().split('T')[0]
        };
      }
    }

    // Today
    if (queryLower.includes('today') || queryLower.includes('aaj')) {
      const todayStr = today.toISOString().split('T')[0];
      return { startDate: todayStr, endDate: todayStr };
    }

    // Yesterday
    if (queryLower.includes('yesterday') || queryLower.includes('kal')) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      return { startDate: yesterdayStr, endDate: yesterdayStr };
    }

    // This week
    if (queryLower.includes('this week') || queryLower.includes('is week') || queryLower.includes('is hafte')) {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      return {
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      };
    }

    // Last week
    if (queryLower.includes('last week') || queryLower.includes('pichle week') || queryLower.includes('pichle hafte')) {
      const startOfLastWeek = new Date(today);
      startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
      return {
        startDate: startOfLastWeek.toISOString().split('T')[0],
        endDate: endOfLastWeek.toISOString().split('T')[0]
      };
    }

    // This month
    if (queryLower.includes('this month') || queryLower.includes('is month') || queryLower.includes('is mahine')) {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        startDate: startOfMonth.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      };
    }

    // Last month
    if (queryLower.includes('last month') || queryLower.includes('pichle month') || queryLower.includes('pichle mahine')) {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: lastMonth.toISOString().split('T')[0],
        endDate: endOfLastMonth.toISOString().split('T')[0]
      };
    }

    // Specific month with fuzzy matching (handles typos and abbreviations)
    const monthPatterns = [
      { full: 'january', patterns: ['jan', 'janu', 'jaunary', 'janury'] },
      { full: 'february', patterns: ['feb', 'febr', 'feburary', 'februry'] },
      { full: 'march', patterns: ['mar', 'marc'] },
      { full: 'april', patterns: ['apr', 'aprl'] },
      { full: 'may', patterns: ['may'] },
      { full: 'june', patterns: ['jun'] },
      { full: 'july', patterns: ['jul', 'jly'] },
      { full: 'august', patterns: ['aug', 'agust'] },
      { full: 'september', patterns: ['sep', 'sept', 'setember'] },
      { full: 'october', patterns: ['oct', 'octo', 'octber'] },
      { full: 'november', patterns: ['nov', 'novem', 'novmber'] },
      { full: 'december', patterns: ['dec', 'decem', 'decmber'] }
    ];

    for (let i = 0; i < monthPatterns.length; i++) {
      const { full, patterns } = monthPatterns[i];

      // Check if query contains full month name or any of its patterns
      if (queryLower.includes(full) || patterns.some(p => queryLower.includes(p))) {
        // Check if year is mentioned
        const yearMatch = query.match(/20\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : today.getFullYear();

        // Create dates in UTC to avoid timezone issues
        const startOfMonth = new Date(Date.UTC(year, i, 1));
        const endOfMonth = new Date(Date.UTC(year, i + 1, 0));

        const startDate = `${year}-${String(i + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, i + 1, 0).getDate();
        const endDate = `${year}-${String(i + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        console.log(`📅 Matched month: ${full} (year: ${year})`);

        return {
          startDate,
          endDate
        };
      }
    }

    // Last X days (e.g., "last 7 days", "last 30 days")
    const daysMatch = query.match(/last (\d+) days?/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - days);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      };
    }

    // This year
    if (queryLower.includes('this year') || queryLower.includes('is year') || queryLower.includes('is saal')) {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      return {
        startDate: startOfYear.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0]
      };
    }

    // Last year
    if (queryLower.includes('last year') || queryLower.includes('pichle year') || queryLower.includes('pichle saal')) {
      const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
      const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
      return {
        startDate: startOfLastYear.toISOString().split('T')[0],
        endDate: endOfLastYear.toISOString().split('T')[0]
      };
    }

    return null;
  }

  /**
   * Get formatted period string
   */
  private getPeriodString(dateRange: DateRange): string {
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    };

    if (dateRange.startDate === dateRange.endDate) {
      return formatDate(start);
    } else {
      return `${formatDate(start)} to ${formatDate(end)}`;
    }
  }

  /**
   * Query sales data with natural language support
   */
  async querySales(clientId: string, query: string): Promise<SalesQueryResult> {
    try {
      console.log(`📊 Processing sales query: "${query}"`);

      // Check if this is an insight/advisory query
      if (this.isInsightQuery(query)) {
        console.log(`🤖 Detected insight query, generating AI recommendations...`);
        const insightResult = await this.generateInsights(clientId, query);

        if (insightResult.success) {
          // Return insights as part of sales result
          return {
            success: true,
            data: [],
            summary: {
              totalSales: 0,
              transactionCount: 0,
              averageSale: 0,
              taxAmount: 0,
              uniqueCustomers: 0
            },
            error: insightResult.insights, // Use error field for insights
            period: 'AI Insights'
          };
        }
      }

      // Check if this is a superlative query (highest/lowest)
      const superlativeCheck = this.isSuperlativeQuery(query);

      // Parse date from query
      let dateRange = this.parseDateQuery(query);

      if (!dateRange) {
        // For superlative queries without date, use all-time
        if (superlativeCheck.isSuperlative) {
          const today = new Date();
          dateRange = {
            startDate: '1970-01-01',
            endDate: today.toISOString().split('T')[0]
          };
          console.log(`🔍 Superlative query detected, using all-time range`);
        } else {
          // Default to current year for non-superlative queries
          const today = new Date();
          const startOfYear = new Date(today.getFullYear(), 0, 1);
          dateRange = {
            startDate: startOfYear.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
          };
          console.log(`📅 No date specified, defaulting to current year: ${today.getFullYear()}`);
        }
      }

      console.log(`📅 Date range: ${dateRange.startDate} to ${dateRange.endDate}`);

      // Query Supabase - using the public method
      const supabaseClient = (this.supabaseService as any).supabase;
      if (!supabaseClient) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file.'
        };
      }

      const { data, error } = await supabaseClient
        .from('sales_vouchers')
        .select('*')
        .eq('client_id', clientId)
        .gte('voucher_date', dateRange.startDate)
        .lte('voucher_date', dateRange.endDate)
        .order('voucher_date', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        return {
          success: false,
          error: `Database query failed: ${error.message}`
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          data: [],
          summary: {
            totalSales: 0,
            transactionCount: 0,
            averageSale: 0,
            taxAmount: 0,
            uniqueCustomers: 0
          },
          error: `No sales data found for the specified period.`,
          period: this.getPeriodString(dateRange)
        };
      }

      // Handle superlative queries - find highest/lowest sale
      if (superlativeCheck.isSuperlative && superlativeCheck.type) {
        const sortedData = [...data].sort((a, b) => {
          const amountA = parseFloat(a.net_amount || 0);
          const amountB = parseFloat(b.net_amount || 0);
          return superlativeCheck.type === 'highest' ? amountB - amountA : amountA - amountB;
        });

        // Return top/bottom result
        const topResult = sortedData[0];
        const totalSales = parseFloat(topResult.net_amount || 0);
        const taxAmount = parseFloat(topResult.tax_amount || 0);

        console.log(`✅ ${superlativeCheck.type === 'highest' ? 'Highest' : 'Lowest'} sale found: ₹${totalSales.toLocaleString('en-IN')} on ${topResult.voucher_date}`);

        return {
          success: true,
          data: [topResult],
          summary: {
            totalSales,
            transactionCount: 1,
            averageSale: totalSales,
            taxAmount,
            uniqueCustomers: 1
          },
          period: this.getPeriodString(dateRange)
        };
      }

      // Calculate summary for regular queries
      const totalSales = data.reduce((sum: number, record: any) => sum + parseFloat(record.net_amount || 0), 0);
      const taxAmount = data.reduce((sum: number, record: any) => sum + parseFloat(record.tax_amount || 0), 0);
      const uniqueCustomers = new Set(data.map((record: any) => record.party_name)).size;

      const summary = {
        totalSales,
        transactionCount: data.length,
        averageSale: totalSales / data.length,
        taxAmount,
        uniqueCustomers
      };

      console.log(`✅ Sales query successful: ${data.length} records, ₹${totalSales.toLocaleString('en-IN')}`);

      return {
        success: true,
        data,
        summary,
        period: this.getPeriodString(dateRange)
      };

    } catch (error) {
      console.error('❌ Sales query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Query purchase data with natural language support
   */
  async queryPurchases(clientId: string, query: string): Promise<PurchaseQueryResult> {
    try {
      console.log(`📊 Processing purchase query: "${query}"`);

      // Check if this is a superlative query (highest/lowest)
      const superlativeCheck = this.isSuperlativeQuery(query);

      // Parse date from query
      let dateRange = this.parseDateQuery(query);

      if (!dateRange) {
        // For superlative queries without date, use all-time
        if (superlativeCheck.isSuperlative) {
          const today = new Date();
          dateRange = {
            startDate: '1970-01-01',
            endDate: today.toISOString().split('T')[0]
          };
          console.log(`🔍 Superlative query detected, using all-time range`);
        } else {
          // Default to current year for non-superlative queries
          const today = new Date();
          const startOfYear = new Date(today.getFullYear(), 0, 1);
          dateRange = {
            startDate: startOfYear.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
          };
          console.log(`📅 No date specified, defaulting to current year: ${today.getFullYear()}`);
        }
      }

      console.log(`📅 Date range: ${dateRange.startDate} to ${dateRange.endDate}`);

      // Query Supabase - using the public method
      const supabaseClient = (this.supabaseService as any).supabase;
      if (!supabaseClient) {
        return {
          success: false,
          error: 'Supabase not configured. Please check your .env file.'
        };
      }

      const { data, error } = await supabaseClient
        .from('purchase_vouchers')
        .select('*')
        .eq('client_id', clientId)
        .gte('voucher_date', dateRange.startDate)
        .lte('voucher_date', dateRange.endDate)
        .order('voucher_date', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        return {
          success: false,
          error: `Database query failed: ${error.message}`
        };
      }

      if (!data || data.length === 0) {
        return {
          success: true,
          data: [],
          summary: {
            totalPurchases: 0,
            transactionCount: 0,
            averagePurchase: 0,
            taxAmount: 0,
            uniqueSuppliers: 0
          },
          error: `No purchase data found for the specified period.`,
          period: this.getPeriodString(dateRange)
        };
      }

      // Handle superlative queries - find highest/lowest purchase
      if (superlativeCheck.isSuperlative && superlativeCheck.type) {
        const sortedData = [...data].sort((a, b) => {
          const amountA = parseFloat(a.net_amount || 0);
          const amountB = parseFloat(b.net_amount || 0);
          return superlativeCheck.type === 'highest' ? amountB - amountA : amountA - amountB;
        });

        // Return top/bottom result
        const topResult = sortedData[0];
        const totalPurchases = parseFloat(topResult.net_amount || 0);
        const taxAmount = parseFloat(topResult.tax_amount || 0);

        console.log(`✅ ${superlativeCheck.type === 'highest' ? 'Highest' : 'Lowest'} purchase found: ₹${totalPurchases.toLocaleString('en-IN')} on ${topResult.voucher_date}`);

        return {
          success: true,
          data: [topResult],
          summary: {
            totalPurchases,
            transactionCount: 1,
            averagePurchase: totalPurchases,
            taxAmount,
            uniqueSuppliers: 1
          },
          period: this.getPeriodString(dateRange)
        };
      }

      // Calculate summary for regular queries
      const totalPurchases = data.reduce((sum: number, record: any) => sum + parseFloat(record.net_amount || 0), 0);
      const taxAmount = data.reduce((sum: number, record: any) => sum + parseFloat(record.tax_amount || 0), 0);
      const uniqueSuppliers = new Set(data.map((record: any) => record.party_name)).size;

      const summary = {
        totalPurchases,
        transactionCount: data.length,
        averagePurchase: totalPurchases / data.length,
        taxAmount,
        uniqueSuppliers
      };

      console.log(`✅ Purchase query successful: ${data.length} records, ₹${totalPurchases.toLocaleString('en-IN')}`);

      return {
        success: true,
        data,
        summary,
        period: this.getPeriodString(dateRange)
      };

    } catch (error) {
      console.error('❌ Purchase query error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get top customers by sales
   */
  async getTopCustomers(clientId: string, limit: number = 10): Promise<any[]> {
    try {
      const supabaseClient = (this.supabaseService as any).supabase;
      if (!supabaseClient) {
        console.error('Supabase not configured');
        return [];
      }

      const { data, error } = await supabaseClient
        .from('sales_vouchers')
        .select('party_name, net_amount')
        .eq('client_id', clientId);

      if (error || !data) return [];

      // Aggregate by customer
      const customerMap = new Map<string, number>();
      data.forEach((record: any) => {
        const current = customerMap.get(record.party_name) || 0;
        customerMap.set(record.party_name, current + parseFloat(record.net_amount || 0));
      });

      // Sort and return top N
      return Array.from(customerMap.entries())
        .map(([name, amount]) => ({ party_name: name, total_sales: amount }))
        .sort((a, b) => b.total_sales - a.total_sales)
        .slice(0, limit);

    } catch (error) {
      console.error('Error getting top customers:', error);
      return [];
    }
  }

  /**
   * Get top suppliers by purchase
   */
  async getTopSuppliers(clientId: string, limit: number = 10): Promise<any[]> {
    try {
      const supabaseClient = (this.supabaseService as any).supabase;
      if (!supabaseClient) {
        console.error('Supabase not configured');
        return [];
      }

      const { data, error } = await supabaseClient
        .from('purchase_vouchers')
        .select('party_name, net_amount')
        .eq('client_id', clientId);

      if (error || !data) return [];

      // Aggregate by supplier
      const supplierMap = new Map<string, number>();
      data.forEach((record: any) => {
        const current = supplierMap.get(record.party_name) || 0;
        supplierMap.set(record.party_name, current + parseFloat(record.net_amount || 0));
      });

      // Sort and return top N
      return Array.from(supplierMap.entries())
        .map(([name, amount]) => ({ party_name: name, total_purchases: amount }))
        .sort((a, b) => b.total_purchases - a.total_purchases)
        .slice(0, limit);

    } catch (error) {
      console.error('Error getting top suppliers:', error);
      return [];
    }
  }

  /**
   * Detect if query is asking for business insights/advice
   */
  private isInsightQuery(query: string): boolean {
    const queryLower = query.toLowerCase();
    const insightPatterns = [
      'how to increase', 'how to improve', 'how to optimize', 'how to grow',
      'suggest', 'recommendation', 'advice', 'what should i', 'how can i',
      'kaise badhayen', 'kaise improve', 'kya kare', 'kya suggestion',
      'pattern', 'trend', 'analysis', 'analyze', 'insights'
    ];

    return insightPatterns.some(pattern => queryLower.includes(pattern));
  }

  /**
   * Generate AI-powered business insights based on sales data
   */
  async generateInsights(clientId: string, query: string): Promise<{ success: boolean; insights: string; error?: string }> {
    try {
      console.log(`🤖 Generating AI insights for: "${query}"`);

      // Get sales data for the current year
      const today = new Date();
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      const salesResult = await this.querySales(clientId, 'this year');

      if (!salesResult.success || !salesResult.data) {
        return {
          success: false,
          insights: '',
          error: 'Unable to fetch sales data for insights'
        };
      }

      // Prepare data summary for AI
      const dataSummary = {
        totalSales: salesResult.summary?.totalSales || 0,
        transactionCount: salesResult.summary?.transactionCount || 0,
        averageSale: salesResult.summary?.averageSale || 0,
        uniqueCustomers: salesResult.summary?.uniqueCustomers || 0,
        topCustomers: await this.getTopCustomers(clientId, 5),
        period: salesResult.period
      };

      // Create prompt for AI
      const prompt = `You are a business advisor analyzing sales data for a company.

User Question: "${query}"

Sales Data Summary:
- Total Sales: ₹${dataSummary.totalSales.toLocaleString('en-IN')}
- Total Transactions: ${dataSummary.transactionCount}
- Average Sale: ₹${dataSummary.averageSale.toLocaleString('en-IN')}
- Unique Customers: ${dataSummary.uniqueCustomers}
- Period: ${dataSummary.period}

Top 5 Customers:
${dataSummary.topCustomers.map((c: any, i: number) =>
  `${i + 1}. ${c.party_name}: ₹${c.total_sales.toLocaleString('en-IN')}`
).join('\n')}

Based on this data, provide actionable business insights and recommendations to answer the user's question. Be specific and practical. Keep response under 200 words.`;

      // Try OpenAI first, fallback to Gemini
      let insights = '';

      if (this.openAIService) {
        try {
          insights = await this.openAIService.processQuery(prompt, 'You are a helpful business advisor.');
        } catch (error) {
          console.warn('OpenAI failed, trying Gemini:', error);
        }
      }

      if (!insights && this.geminiService) {
        try {
          insights = await this.geminiService.processQuery(prompt, 'You are a helpful business advisor.');
        } catch (error) {
          console.warn('Gemini also failed:', error);
        }
      }

      if (!insights) {
        return {
          success: false,
          insights: '',
          error: 'AI services unavailable. Please check your API keys.'
        };
      }

      console.log(`✅ AI insights generated successfully`);
      return {
        success: true,
        insights
      };

    } catch (error) {
      console.error('❌ Error generating insights:', error);
      return {
        success: false,
        insights: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get purchase orders with optional status filter
   */
  async getPurchaseOrders(clientId: string, status?: string): Promise<any[]> {
    try {
      console.log(`📦 Querying purchase orders for client: ${clientId}, status: ${status || 'all'}`);

      const supabaseClient = (this.supabaseService as any).supabase;
      if (!supabaseClient) {
        console.error('Supabase not configured');
        return [];
      }

      let query = supabaseClient
        .from('purchase_orders')
        .select('*')
        .eq('client_id', clientId);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('order_date', { ascending: false });

      if (error) {
        console.error('❌ Purchase orders query error:', error);
        return [];
      }

      console.log(`✅ Found ${data?.length || 0} purchase orders`);
      return data || [];

    } catch (error) {
      console.error('❌ Error getting purchase orders:', error);
      return [];
    }
  }

  /**
   * Query purchase orders with natural language support
   */
  async queryPurchaseOrders(clientId: string, query: string): Promise<{ success: boolean; data: any[]; summary?: any; error?: string; period?: string }> {
    try {
      console.log(`📦 Processing purchase order query: "${query}"`);

      const queryLower = query.toLowerCase();
      let status: string | undefined;

      // Detect status from query
      if (queryLower.includes('pending') || queryLower.includes('open') || queryLower.includes('due')) {
        status = 'pending';
      } else if (queryLower.includes('fulfilled') || queryLower.includes('completed') || queryLower.includes('closed')) {
        status = 'fulfilled';
      } else if (queryLower.includes('cancelled') || queryLower.includes('canceled')) {
        status = 'cancelled';
      }

      // Parse date range from query
      const dateRange = this.parseDateQuery(query);

      // Get purchase orders with optional date filtering
      let orders = await this.getPurchaseOrders(clientId, status);

      // Filter by date if date range is specified
      if (dateRange && orders.length > 0) {
        console.log(`📅 Filtering purchase orders by date: ${dateRange.startDate} to ${dateRange.endDate}`);
        orders = orders.filter((order: any) => {
          const orderDate = order.order_date || order.voucher_date || order.date;
          if (!orderDate) return false;

          const date = new Date(orderDate);
          const startDate = new Date(dateRange.startDate);
          const endDate = new Date(dateRange.endDate);

          return date >= startDate && date <= endDate;
        });
      }

      if (orders.length === 0) {
        const periodInfo = dateRange ? ` for ${this.getPeriodString(dateRange)}` : '';
        return {
          success: true,
          data: [],
          error: status
            ? `No ${status} purchase orders found${periodInfo}.`
            : `No purchase orders found${periodInfo}. Make sure purchase order data is synced from Tally.`,
          period: dateRange ? this.getPeriodString(dateRange) : undefined
        };
      }

      // Calculate summary
      const totalAmount = orders.reduce((sum, order) => sum + parseFloat(order.amount || 0), 0);
      const totalQuantity = orders.reduce((sum, order) => sum + parseFloat(order.quantity || 0), 0);
      const uniqueItems = new Set(orders.map(order => order.stock_item_name)).size;

      const summary = {
        totalOrders: orders.length,
        totalAmount,
        totalQuantity,
        uniqueItems,
        status: status || 'all'
      };

      console.log(`✅ Purchase order query successful: ${orders.length} orders, ₹${totalAmount.toLocaleString('en-IN')}`);

      return {
        success: true,
        data: orders,
        summary,
        period: dateRange ? this.getPeriodString(dateRange) : undefined
      };

    } catch (error) {
      console.error('❌ Purchase order query error:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}