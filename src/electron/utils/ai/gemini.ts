import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

// Initialize Gemini client lazily with better error handling
function getGeminiClient(): GoogleGenAI | null {
  const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.warn('🔑 GOOGLE_AI_API_KEY not found - Gemini service unavailable');
    console.log('💡 Tip: Set GOOGLE_AI_API_KEY environment variable to enable Gemini features');
    return null;
  }
  
  if (!ai) {
    try {
      ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      console.log('✅ Gemini service initialized successfully');
    } catch (error) {
      console.error('❌ Gemini initialization failed:', error);
      return null;
    }
  }
  
  return ai;
}

export interface TallyAIResponse {
  type: 'sql' | 'analysis' | 'explanation' | 'smart_query';
  sql?: string;
  explanation: string;
  requiresExecution: boolean;
  businessInsights?: string;
  followUpQuestions?: string[];
  confidence?: number;
  searchTerm?: string; // For smart ledger queries
}

export interface SmartQueryContext {
  isLedgerQuery: boolean;
  extractedTerms: string[];
  queryType: 'balance' | 'list' | 'analysis' | 'general';
}

export class GeminiService {
  
  /**
   * Enhanced Tally query processing with smart detection
   */
  async processTallyQuery(
    userQuery: string,
    connectionStatus: any,
    businessContext?: any
  ): Promise<TallyAIResponse> {
    console.log('\n🔶 === GEMINI TALLY QUERY PROCESSING ===');
    console.log(`📝 User Query: "${userQuery}"`);
    console.log('🔍 Connection Status:', {
      isConnected: connectionStatus?.isConnected || false,
      companyName: connectionStatus?.companyName || 'Unknown'
    });
    console.log('🏢 Business Context:', businessContext ? 'Provided' : 'None');
    console.log('🔑 API Key status:', process.env.GOOGLE_AI_API_KEY ? 'SET' : 'MISSING');
    
    try {
      // Detect if this is a smart ledger query
      const smartContext = this.analyzeQueryIntent(userQuery);
      console.log('🧠 Query analysis:', {
        isLedgerQuery: smartContext.isLedgerQuery,
        queryType: smartContext.queryType,
        extractedTerms: smartContext.extractedTerms
      });
      
      if (smartContext.isLedgerQuery) {
        console.log('🎯 Processing as smart ledger query...');
        return this.processSmartLedgerQuery(userQuery, smartContext, connectionStatus);
      }

      // Process as general query
      console.log('🔄 Processing as general query...');
      const promptStartTime = Date.now();
      const prompt = this.buildTallyQueryPrompt(userQuery, connectionStatus, businessContext);
      console.log(`📋 Prompt built in ${Date.now() - promptStartTime}ms`);
      console.log('📝 Prompt preview (first 300 chars):', prompt.substring(0, 300) + '...');
      console.log('📊 Prompt length:', prompt.length, 'characters');

      const geminiClient = getGeminiClient();
      if (!geminiClient) {
        console.error('❌ Gemini client unavailable - using fallback');
        return {
          type: 'explanation',
          explanation: 'Service temporarily unavailable.',
          requiresExecution: false
        };
      }
      
      console.log('✅ Gemini client initialized successfully');
      console.log("📤 Sending request to Gemini Flash Thinking...");
      const apiStartTime = Date.now();
      
      const response = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash-thinking-exp",
        contents: [{ text: prompt }],
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`📥 Gemini response received in ${apiTime}ms`);
      
      const aiResponse = response.text || "Unable to process query";
      console.log('📊 Response details:', {
        length: aiResponse.length,
        preview: aiResponse.substring(0, 200) + '...',
        hasContent: !!aiResponse
      });
      
      console.log('🔄 Parsing AI response...');
      const parsedResponse = this.parseAIResponse(aiResponse, userQuery);
      console.log('✅ Gemini processing completed successfully');
      return parsedResponse;

    } catch (error) {
      console.error("❌ Gemini Tally query error:", error);
      console.error('📊 Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.substring(0, 300) : 'No stack'
      });
      return this.generateFallbackResponse(userQuery, error);
    }
  }

  /**
   * Enhanced result analysis with concise business insights
   */
  async analyzeQueryResults(
    originalQuery: string,
    sqlQuery: string,
    results: any[],
    executionTime: number
  ): Promise<string> {
    try {
      // Quick response for simple balance queries
      if (this.isSimpleBalanceQuery(originalQuery) && results.length === 1) {
        return this.formatSimpleBalanceResponse(results[0], originalQuery);
      }

      // Detailed analysis for complex queries
      const prompt = this.buildResultAnalysisPrompt(originalQuery, sqlQuery, results, executionTime);

      const geminiClient = getGeminiClient();
    if (!geminiClient) {
      console.warn('⚠️ Gemini client unavailable - using fallback');
      return this.generateFallbackAnalysis(originalQuery, results);
    }
      const response = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash-thinking-exp",
        contents: [{ text: prompt }],
      });

      return this.formatAnalysisResponse(response.text || "Query executed successfully.", results);

    } catch (error) {
      console.error("Result analysis error:", error);
      return this.generateFallbackAnalysis(originalQuery, results);
    }
  }

  /**
   * Analyze user query intent and extract key information
   */
  private analyzeQueryIntent(userQuery: string): SmartQueryContext {
    const query = userQuery.toLowerCase();
    
    // First check for company-specific queries (English + Hinglish)
    const companyKeywords = [
      'my address', 'company address', 'company name', 'company details',
      'what is my', 'show company', 'our address', 'my company',
      'mera address', 'company ka address', 'humara address'
    ];
    
    const isCompanyQuery = companyKeywords.some(keyword => query.includes(keyword));
    
    // Check for analytical queries (highest, lowest, summary) with Hinglish
    const analyticalKeywords = [
      'highest', 'lowest', 'maximum', 'minimum', 'top', 'bottom',
      'largest', 'smallest', 'most', 'least', 'total', 'sum',
      'which has', 'who has', 'best', 'worst',
      'sabse zyada', 'sabse kam', 'sabse bada', 'sabse chota',
      'kitna total', 'total kitna', 'kaun sa', 'kon sa'
    ];
    
    const isAnalyticalQuery = analyticalKeywords.some(keyword => query.includes(keyword));
    
    // Only then check for specific ledger balance queries (English + Hinglish)
    const specificLedgerKeywords = [
      'balance of', 'balance for', 'account balance',
      'how much in', 'amount in', 'ka balance', 'kitna hai',
      'closing balance', 'balance kitna', 'kitna balance'
    ];
    
    const hasSpecificLedger = specificLedgerKeywords.some(keyword => query.includes(keyword)) ||
                            (query.includes('balance') && !query.includes('highest') && !query.includes('which') && !query.includes('sabse'));
    
    // NOT a ledger query if it's company or analytical
    const isLedgerQuery = hasSpecificLedger && !isCompanyQuery && !isAnalyticalQuery;
    
    // Extract potential ledger names
    const extractedTerms = this.extractLedgerTerms(userQuery);
    
    // Determine query type
    let queryType: 'balance' | 'list' | 'analysis' | 'general' = 'general';
    if (isCompanyQuery) queryType = 'general';
    else if (isAnalyticalQuery) queryType = 'analysis';
    else if (query.includes('balance')) queryType = 'balance';
    else if (query.includes('list') || query.includes('all') || query.includes('show')) queryType = 'list';
    
    return {
      isLedgerQuery,
      extractedTerms,
      queryType
    };
  }

  /**
   * Extract potential ledger names from user query
   */
  private extractLedgerTerms(userQuery: string): string[] {
    // Enhanced Hinglish-aware term extraction
    const cleaned = userQuery
      .replace(/what\s+is\s+(?:the\s+)?/gi, '')
      .replace(/show\s+me\s+(?:the\s+)?/gi, '')
      .replace(/(?:closing\s*)?balance\s+(?:of|for)\s+/gi, '')
      .replace(/(?:closing\s*)?balance\s*$/gi, '')
      .replace(/\s+(?:closing\s*)?balance\s*$/gi, '') // Remove trailing balance
      .replace(/\s+ka\s+balance\s*$/gi, '') // Remove Hinglish "ka balance"
      .replace(/\s+kitna\s+hai\s*$/gi, '') // Remove Hinglish "kitna hai"
      .replace(/\s+balance\s+kitna\s*$/gi, '') // Remove Hinglish "balance kitna"
      .replace(/[?!]/g, '') // Only remove question marks and exclamation marks
      .trim();
    
    const terms: string[] = [];
    
    // Add the main cleaned term first (highest priority)
    if (cleaned.length > 0) {
      terms.push(cleaned);
    }
    
    // For company names, extract meaningful parts
    if (cleaned.includes(' ')) {
      // Split by spaces and filter meaningful terms
      const spaceSeparated = cleaned.split(/\s+/).filter(term => 
        term.length > 2 && 
        !['the', 'and', 'for', 'with', 'from', 'has', 'are', 'was', 'were'].includes(term.toLowerCase())
      );
      
      // Add combinations of 2+ words for company names like "gangotri steel"
      if (spaceSeparated.length >= 2) {
        for (let i = 0; i < spaceSeparated.length - 1; i++) {
          terms.push(`${spaceSeparated[i]} ${spaceSeparated[i + 1]}`);
        }
      }
      
      // Add individual meaningful words
      terms.push(...spaceSeparated);
    }
    
    // Remove duplicates and return, prioritizing longer terms first
    const uniqueTerms = [...new Set(terms)];
    return uniqueTerms.sort((a, b) => b.length - a.length);
  }

  /**
   * Process smart ledger queries with fuzzy matching hints
   */
  private processSmartLedgerQuery(
    userQuery: string,
    context: SmartQueryContext,
    connectionStatus: any
  ): TallyAIResponse {
    // Use the first (most complete) extracted term, not joining all terms
    const searchTerm = context.extractedTerms[0] || '';
    
    if (!searchTerm) {
      return {
        type: 'explanation',
        explanation: 'Please specify which ledger account you want to check. For example: "What is Cash balance?" or "Show me HDFC Bank balance"',
        requiresExecution: false,
        followUpQuestions: [
          'Try: "What is Cash closing balance?"',
          'Or: "Show me Bank account balance"',
          'Or: "What is [account name] balance?"'
        ]
      };
    }

    // Use the smart ledger query system instead of generating SQL directly
    return {
      type: 'smart_query',
      sql: 'USE_SMART_LEDGER_QUERY', // Special marker to use smart query system
      explanation: `Searching for ledger account "${searchTerm}" using smart matching...`,
      requiresExecution: true,
      businessInsights: `Smart search will find "${searchTerm}" even with partial names, typos, or case differences.`,
      followUpQuestions: [
        'If multiple accounts found, I\'ll show options to choose from',
        'Ask about other account balances',
        'Check account details and parent group'
      ],
      confidence: 90,
      searchTerm: searchTerm // Pass the search term for the smart query
    } as TallyAIResponse & { searchTerm: string };
  }

  /**
   * Check if query is asking for simple balance
   */
  private isSimpleBalanceQuery(query: string): boolean {
    const simple = query.toLowerCase();
    return (simple.includes('balance') || simple.includes('amount')) && 
           !simple.includes('all') && 
           !simple.includes('list') &&
           !simple.includes('analysis');
  }

  /**
   * Format simple balance response - concise and direct
   */
  private formatSimpleBalanceResponse(result: any, originalQuery: string): string {
    const name = result.$Name || result.name || result.NAME;
    const balance = result.$ClosingBalance || result.ClosingBalance || result.BALANCE || 0;
    const parent = result.$Parent || result.parent || result.PARENT || '';
    
    const formattedBalance = this.formatCurrency(balance);
    
    return `**${name}**${parent ? ` (${parent})` : ''}\nBalance: ${formattedBalance}`;
  }

  /**
   * Format analysis response with key points only
   */
  private formatAnalysisResponse(aiResponse: string, results: any[]): string {
    // Extract key points and make more concise
    let response = aiResponse;
    
    // Add summary if multiple records
    if (results.length > 1) {
      const totalRecords = results.length;
      const hasBalances = results.some(r => 
        (r.$ClosingBalance && r.$ClosingBalance !== 0) || 
        (r.ClosingBalance && r.ClosingBalance !== 0)
      );
      
      response = `Found ${totalRecords} records${hasBalances ? ' with balances' : ''}.\n\n${response}`;
    }
    
    return response;
  }

  /**
   * Enhanced Tally query prompt with smart query context
   */
  private buildTallyQueryPrompt(
    userQuery: string,
    connectionStatus: any,
    businessContext?: any
  ): string {
    return `You are TallyKaro AI, an expert in Tally ERP and Indian business data.

CONNECTION STATUS:
- Connected: ${connectionStatus.isConnected}
- Company: ${connectionStatus.companyName || 'Current Company'}
- Available: ${connectionStatus.availableData?.join(', ') || 'Ledger, Company'}

LANGUAGE SUPPORT:
- User may ask in English, Hindi, or Hinglish (mixed)
- Common Hinglish terms: "kitna hai" = "how much", "ka balance" = "'s balance", "dikhao" = "show", "sabse zyada" = "highest"
- Always respond in English with Indian business context

QUERY ROUTING:
- Company questions (address, name, details) → Query "Company" table
- Account/Ledger questions (balance, customer, supplier) → Query "Ledger" table  
- Analytical questions (highest, lowest, summary) → Use ORDER BY and LIMIT

CRITICAL RULES:
1. Use $Name, $ClosingBalance, $Parent syntax (Tally ODBC format)
2. NEVER use VOUCHERHEAD or VOUCHERITEM tables (causes errors)
3. Safe tables: Ledger, Company, StockItem
4. For fuzzy matching: UPPER($Name) LIKE UPPER('%search%')
5. Currency format: ₹
6. Keep responses concise and actionable

TALLY PATTERNS:
- Cash/Bank: WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts'
- Customers: WHERE $Parent = 'Sundry Debtors'
- Suppliers: WHERE $Parent = 'Sundry Creditors'
- Non-zero: WHERE $ClosingBalance <> 0

USER QUERY: "${userQuery}"

RESPONSE FORMAT (JSON):
{
  "type": "sql|analysis|explanation",
  "sql": "SELECT $Name, $ClosingBalance FROM...",
  "explanation": "Brief explanation",
  "requiresExecution": true/false,
  "businessInsights": "Key business insight",
  "followUpQuestions": ["Next questions"]
}

EXAMPLES:

Query: "cash balance"
{
  "type": "sql",
  "sql": "SELECT $Name, $ClosingBalance FROM Ledger WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts'",
  "explanation": "Getting all cash and bank account balances",
  "requiresExecution": true,
  "businessInsights": "Cash position shows business liquidity",
  "followUpQuestions": ["Which account has highest balance?", "Total liquid funds?"]
}

Query: "all customers"
{
  "type": "sql", 
  "sql": "SELECT $Name, $ClosingBalance FROM Ledger WHERE $Parent = 'Sundry Debtors' ORDER BY $ClosingBalance DESC",
  "explanation": "Getting all customer account balances",
  "requiresExecution": true,
  "businessInsights": "Customer balances show receivables position",
  "followUpQuestions": ["Who owes the most?", "Overdue amounts?"]
}

Generate response:`;
  }

  /**
   * Enhanced result analysis prompt for concise insights
   */
  private buildResultAnalysisPrompt(
    originalQuery: string,
    sqlQuery: string,
    results: any[],
    executionTime: number
  ): string {
    const sampleData = results.slice(0, 3);
    const hasBalances = results.some(r => 
      (r.$ClosingBalance && r.$ClosingBalance !== 0) || 
      (r.ClosingBalance && r.ClosingBalance !== 0)
    );

    return `Analyze these Tally results - provide CONCISE business insights:

QUERY: "${originalQuery}"
RECORDS: ${results.length}
TIME: ${executionTime}ms

SAMPLE DATA:
${sampleData.map(row => 
  Object.entries(row).slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ')
).join('\n')}

ANALYSIS RULES:
1. Be concise and direct
2. Focus on key business insights
3. Use ₹ for currency
4. Provide actionable points
5. Highlight important patterns
6. Max 3-4 sentences total

FORMAT:
**Key Finding:** [Main insight]
**Business Impact:** [What this means]
**Action:** [Next steps]

${hasBalances ? 'Include balance totals where relevant.' : ''}

Generate analysis:`;
  }

  /**
   * Parse AI response with better error handling
   */
  private parseAIResponse(aiResponse: string, originalQuery: string): TallyAIResponse {
    try {
      // Try to extract JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type || 'explanation',
          sql: parsed.sql,
          explanation: parsed.explanation || aiResponse,
          requiresExecution: parsed.requiresExecution || false,
          businessInsights: parsed.businessInsights,
          followUpQuestions: parsed.followUpQuestions || [],
          confidence: 80
        };
      }
    } catch (parseError) {
      console.log("JSON parse failed, using text response");
    }

    // Fallback: treat as explanation
    return {
      type: 'explanation',
      explanation: aiResponse,
      requiresExecution: false,
      confidence: 60
    };
  }

  /**
   * Generate fallback response for errors
   */
  private generateFallbackResponse(userQuery: string, error: any): TallyAIResponse {
    console.error("Gemini error:", error);
    
    // Provide helpful fallback based on query type
    if (userQuery.toLowerCase().includes('balance')) {
      return {
        type: 'sql',
        sql: 'SELECT $Name, $ClosingBalance FROM Ledger WHERE $ClosingBalance <> 0 ORDER BY $ClosingBalance DESC',
        explanation: 'Getting all accounts with non-zero balances',
        requiresExecution: true,
        businessInsights: 'Shows all active accounts with balances',
        followUpQuestions: ['Ask about specific account names', 'Filter by account type'],
        confidence: 70
      };
    }

    return {
      type: 'explanation',
      explanation: 'I can help you query your Tally data. Try asking about account balances, customer lists, or supplier information.',
      requiresExecution: false,
      followUpQuestions: [
        'What is my cash balance?',
        'Show me all customers',
        'List supplier accounts'
      ],
      confidence: 50
    };
  }

  /**
   * Generate fallback analysis for query results
   */
  private generateFallbackAnalysis(originalQuery: string, results: any[]): string {
    if (!results || results.length === 0) {
      return `**No Data Found**\nYour query "${originalQuery}" returned no results.\n\n**Check:** Account names, spelling, or try broader search terms.`;
    }

    const recordCount = results.length;
    const hasBalances = results.some(r => 
      (r.$ClosingBalance && r.$ClosingBalance !== 0) || 
      (r.ClosingBalance && r.ClosingBalance !== 0)
    );

    if (recordCount === 1) {
      const record = results[0];
      const name = record.$Name || record.name || 'Account';
      const balance = record.$ClosingBalance || record.ClosingBalance || 0;
      return `**${name}**\nBalance: ${this.formatCurrency(balance)}`;
    }

    return `**Found ${recordCount} Records**\n${hasBalances ? 'Includes accounts with balances' : 'Account information retrieved'}\n\n**Next:** Ask about specific accounts or totals.`;
  }

  /**
   * Format currency in Indian format
   */
  private formatCurrency(amount: any): string {
    if (amount === null || amount === undefined || amount === '') {
      return '₹0';
    }
    
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[₹,\s]/g, ''));
    
    if (isNaN(num)) {
      return '₹0';
    }
    
    const formatted = Math.abs(num).toLocaleString('en-IN');
    const sign = num < 0 ? '-' : '';
    return `${sign}₹${formatted}`;
  }

  /**
   * Quick insight generation for business data
   */
  async generateQuickInsight(query: string, context: string): Promise<string> {
    try {
      const prompt = `Generate a quick business insight for this query:

QUERY: "${query}"
CONTEXT: ${context.substring(0, 500)}

Provide a 1-2 sentence insight focusing on key business implications.
Use Indian business context and ₹ currency format.

Response:`;

      const geminiClient = getGeminiClient();
    if (!geminiClient) {
      console.warn('⚠️ Gemini client unavailable - using fallback');
      return 'Service temporarily unavailable.';
    }
      const response = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash-thinking-exp",
        contents: [{ text: prompt }],
      });

      return response.text || "Data analyzed successfully.";
    } catch (error) {
      console.error("Quick insight error:", error);
      return "Business data processed and ready for analysis.";
    }
  }

  /**
   * Analyze file data for business intelligence
   */
  async analyzeFileData(
    fileData: any,
    fileType: string,
    fileName: string
  ): Promise<string> {
    try {
      const prompt = `Analyze this ${fileType} business file: "${fileName}"

File Data Sample:
${JSON.stringify(fileData, null, 2).substring(0, 800)}

Provide brief analysis:
1. Business data type identified
2. Key metrics found
3. Potential insights

Response (2-3 sentences):`;

      const geminiClient = getGeminiClient();
    if (!geminiClient) {
      console.warn('⚠️ Gemini client unavailable - using fallback');
      return 'Service temporarily unavailable.';
    }
      const response = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash-thinking-exp",
        contents: [{ text: prompt }],
      });

      return response.text || `File ${fileName} processed successfully.`;
    } catch (error) {
      console.error("File analysis error:", error);
      return `${fileName} analyzed and ready for business intelligence queries.`;
    }
  }

  /**
   * Generate comprehensive business response (legacy support)
   */
  async generateBusinessResponse(
    userQuery: string,
    businessContext: string,
    companyInfo: any,
    filesData: any[]
  ): Promise<string> {
    try {
      const response = await this.processTallyQuery(
        userQuery, 
        { isConnected: true, companyName: companyInfo?.name },
        businessContext
      );
      
      return response.explanation + (response.businessInsights ? `\n\n${response.businessInsights}` : '');
    } catch (error) {
      console.error("Business response error:", error);
      return "I can help analyze your business data. Please try a specific question about your accounts or financial information.";
    }
  }

  /**
   * Test connection to Gemini service
   */
  async testConnection(): Promise<boolean> {
    try {
      const geminiClient = getGeminiClient();
    if (!geminiClient) {
      console.warn('⚠️ Gemini client unavailable - using fallback');
      return false;
    }
      const response = await geminiClient.models.generateContent({
        model: "gemini-2.0-flash-thinking-exp",
        contents: [{ text: "Respond with 'OK' if you can process this message." }],
      });

      return response.text?.includes('OK') || false;
    } catch (error) {
      console.error("Gemini connection test failed:", error);
      return false;
    }
  }
}

export const geminiService = new GeminiService();