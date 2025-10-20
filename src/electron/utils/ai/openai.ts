import OpenAI from "openai";

let openai: OpenAI | null = null;

// Initialize OpenAI client lazily
function getOpenAIClient(): OpenAI {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  
  if (!openai) {
    openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }
  
  return openai;
}

export interface TallyAIResponse {
  type: 'sql' | 'analysis' | 'explanation' | 'smart_query';
  sql?: string;
  explanation: string;
  requiresExecution: boolean;
  businessInsights?: string;
  followUpQuestions?: string[];
  searchTerm?: string; // For smart ledger queries
}

export class OpenAIService {
  generateQuickInsight(context: string, arg1: string): any {
    throw new Error("Method not implemented.");
  }
  
  async processTallyQuery(
    userQuery: string,
    connectionStatus: any,
    businessContext?: any
  ): Promise<TallyAIResponse> {
    console.log('\n🚀 === OPENAI TALLY QUERY PROCESSING ===');
    console.log(`📝 User Query: "${userQuery}"`);
    console.log('🔍 Connection Status:', {
      isConnected: connectionStatus?.isConnected || false,
      companyName: connectionStatus?.companyName || 'Unknown'
    });
    console.log('🏢 Business Context:', businessContext ? 'Provided' : 'None');
    
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
      console.log('❌ OpenAI client unavailable');
      console.log('🔑 API Key status:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
      return {
        type: 'explanation',
        explanation: 'AI processing is currently unavailable. Please try a more specific query or check your API configuration.',
        requiresExecution: false
      };
    }
    
    console.log('✅ OpenAI client initialized successfully');
    
    try {
      const promptStartTime = Date.now();
      const prompt = this.buildTallyQueryPrompt(userQuery, connectionStatus, businessContext);
      console.log(`📋 Prompt built in ${Date.now() - promptStartTime}ms`);
      console.log('📝 Prompt preview (first 300 chars):', prompt.substring(0, 300) + '...');
      console.log('📊 Prompt length:', prompt.length, 'characters');

      console.log("📤 Sending request to OpenAI GPT-4o-mini...");
      const apiStartTime = Date.now();
      
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are TallyKaro AI, an expert in Tally ERP ODBC queries and Indian business intelligence. Always respond with valid JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.3, // Lower temperature for more consistent SQL generation
        response_format: { type: "json_object" }
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`📥 OpenAI response received in ${apiTime}ms`);
      
      const aiResponse = completion.choices[0]?.message?.content || "{}";
      console.log('📊 Response details:', {
        length: aiResponse.length,
        preview: aiResponse.substring(0, 200) + '...',
        hasContent: !!aiResponse,
        tokensUsed: completion.usage?.total_tokens || 'Unknown'
      });

      console.log('🔄 Parsing AI response...');
      const parseStartTime = Date.now();
      const parsedResponse = this.parseAIResponse(aiResponse, userQuery);
      console.log(`✅ Response parsed in ${Date.now() - parseStartTime}ms`);
      
      console.log('🎯 Final OpenAI result:', {
        type: parsedResponse.type,
        hasSQL: !!parsedResponse.sql,
        requiresExecution: parsedResponse.requiresExecution,
        hasBusinessInsights: !!parsedResponse.businessInsights,
        hasFollowUpQuestions: !!parsedResponse.followUpQuestions?.length
      });

      console.log('=== ✅ OPENAI PROCESSING COMPLETE ===\n');
      return parsedResponse;

    } catch (error: any) {
      console.error('\n❌ === OPENAI PROCESSING FAILED ===');
      console.error("OpenAI API Error Details:", {
        message: error?.message || 'Unknown error',
        code: error?.code || 'Unknown code',
        type: error?.type || 'Unknown type',
        status: error?.status || 'Unknown status',
        stack: error?.stack?.substring(0, 300) || 'No stack trace'
      });
      
      let fallbackExplanation = `I encountered an issue processing your query. Please try a simpler question about your Tally data.`;
      
      // Handle different types of OpenAI errors
      if (error?.code === 'rate_limit_exceeded' || error?.status === 429) {
        console.log('⚠️ Rate limit exceeded - will retry with backoff');
        fallbackExplanation = "I'm currently experiencing high demand. Please try again in a moment.";
      } else if (error?.code === 'insufficient_quota') {
        console.log('💳 Quota exceeded - suggest upgrading plan');
        fallbackExplanation = "AI service quota exceeded. Using fallback processing.";
      } else if (error?.code === 'invalid_api_key') {
        console.log('🔑 Invalid API key - check configuration');
        fallbackExplanation = "AI service configuration issue. Using fallback processing.";
      } else if (error?.message?.includes('network') || error?.message?.includes('timeout')) {
        console.log('🌐 Network issue - temporary connectivity problem');
        fallbackExplanation = "Network connectivity issue. Please try again in a moment.";
      }

      console.log('🔄 Returning fallback explanation response');
      console.log('=== ❌ OPENAI PROCESSING FAILED ===\n');

      return {
        type: 'explanation',
        explanation: fallbackExplanation,
        requiresExecution: false
      };
    }
  }

  async analyzeQueryResults(
    originalQuery: string,
    sqlQuery: string,
    results: any[],
    executionTime: number
  ): Promise<string> {
    try {
      const prompt = this.buildResultAnalysisPrompt(originalQuery, sqlQuery, results, executionTime);

      const openaiClient = getOpenAIClient();
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are TallyKaro AI providing business intelligence analysis. Be specific, actionable, and use Indian business context."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.5
      });

      return completion.choices[0]?.message?.content || "Query executed successfully.";

    } catch (error) {
      console.error("OpenAI result analysis error:", error);
      return this.generateFallbackAnalysis(originalQuery, results);
    }
  }

  private buildTallyQueryPrompt(
    userQuery: string,
    connectionStatus: any,
    businessContext?: any
  ): string {
    return `You are TallyKaro AI, an expert in Tally ERP ODBC queries and Indian business intelligence.

CONNECTION STATUS:
- Connected: ${connectionStatus.isConnected}
- Company: ${connectionStatus.companyName || 'Unknown'}
- Available Data: ${connectionStatus.availableData?.join(', ') || 'Basic tables'}

TALLY ODBC QUERY RULES:
1. CRITICAL: Use $Method syntax only: SELECT $Name, $ClosingBalance FROM Ledger
2. NEVER use VOUCHERHEAD or VOUCHERITEM tables (causes TDL errors in educational Tally)
3. Safe tables: Ledger, Company, StockItem
4. Indian currency format: ₹
5. QUERY ROUTING:
   - Company questions (address, name, details) → Query "Company" table
   - Account/Ledger questions (balance, customer, supplier) → Query "Ledger" table
   - Analytical questions (highest, lowest, summary) → Use ORDER BY and LIMIT
6. Common patterns:
   - Cash accounts: WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts'
   - Debit balances: WHERE $$IsDr:$ClosingBalance
   - Credit balances: WHERE $$IsCr:$ClosingBalance
   - Non-zero balances: WHERE $ClosingBalance <> 0 (use only when specifically requested)
   - Account groups: WHERE $Parent = 'Sundry Debtors' (for receivables)
   - Sorting by amount: ORDER BY ABS($ClosingBalance) DESC (for highest absolute values)
   - Include zero balances by default unless user specifically asks to exclude them

AVAILABLE TALLY TABLES & METHODS:
- Ledger: $Name, $Parent, $ClosingBalance, $OpeningBalance, $Address, $Phone, $Email
- Company: $Name, $Address, $Phone, $Email, $GSTRegistration
- StockItem: $Name, $Parent, $ClosingBalance (if available)

USER QUERY: "${userQuery}"

You must respond with valid JSON in this exact format:
{
  "type": "sql|analysis|explanation",
  "sql": "SELECT $Name, $ClosingBalance FROM Ledger WHERE...",
  "explanation": "Business explanation of what this query does",
  "requiresExecution": true,
  "businessInsights": "What this data tells us about the business",
  "followUpQuestions": ["What other questions the user might ask"]
}

EXAMPLE RESPONSES:

For "What's my cash balance?":
{
  "type": "sql",
  "sql": "SELECT $Name as ACCOUNT_NAME, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts' ORDER BY $ClosingBalance DESC",
  "explanation": "This query retrieves all cash and bank account balances from your chart of accounts to show your liquid funds position.",
  "requiresExecution": true,
  "businessInsights": "Cash position analysis helps understand liquidity, working capital management, and ability to meet short-term obligations.",
  "followUpQuestions": ["Which bank account has the highest balance?", "What's my total liquid funds?", "Show me all account balances"]
}

For "Show me my customers":
{
  "type": "sql", 
  "sql": "SELECT $Name as CUSTOMER_NAME, $ClosingBalance as OUTSTANDING_AMOUNT FROM Ledger WHERE $Parent = 'Sundry Debtors' ORDER BY $ClosingBalance DESC",
  "explanation": "This query shows all customers and their outstanding amounts from your accounts receivable.",
  "requiresExecution": true,
  "businessInsights": "Customer outstanding analysis helps with cash flow planning and credit management.",
  "followUpQuestions": ["Which customer owes the most?", "What's my total receivables?", "Show me overdue accounts"]
}

For "What is my address?" or "company address":
{
  "type": "sql",
  "sql": "SELECT $Name as COMPANY_NAME, $Address as COMPANY_ADDRESS FROM Company",
  "explanation": "This query retrieves your company's registered address from the company master data.",
  "requiresExecution": true,
  "businessInsights": "Company address is used for official correspondence, compliance, and business registration purposes.",
  "followUpQuestions": ["What's my company name?", "Show company details", "What's my GST registration?"]
}

For "highest closing balance" or "top balance":
{
  "type": "sql",
  "sql": "SELECT $Name as LEDGER_NAME, $Parent as GROUP_NAME, $ClosingBalance as BALANCE FROM Ledger ORDER BY ABS($ClosingBalance) DESC LIMIT 10",
  "explanation": "This query finds accounts with the highest closing balances sorted by amount.",
  "requiresExecution": true,
  "businessInsights": "Highest balances indicate your major assets, liabilities, or key business relationships that need attention.",
  "followUpQuestions": ["Show me top 5 customers", "What are my largest suppliers?", "Show all cash accounts"]
}

For "How is my business doing?":
{
  "type": "analysis",
  "sql": "",
  "explanation": "To analyze your business performance, I need to examine key financial indicators. Let me start by checking your cash position, account balances, and receivables/payables.",
  "requiresExecution": false,
  "businessInsights": "Business performance analysis typically includes liquidity (cash position), profitability trends, receivables management, and overall financial health indicators.",
  "followUpQuestions": ["What's my cash position?", "Show me all account balances", "What are my receivables and payables?", "Show me income vs expenses"]
}

For "closing balance kitna hai" or "clsing balane kitna hai":
{
  "type": "sql",
  "sql": "SELECT $Name as LEDGER_NAME, $ClosingBalance as BALANCE FROM Ledger ORDER BY ABS($ClosingBalance) DESC LIMIT 20",
  "explanation": "This query shows all accounts with their closing balances, including zero balances, sorted by absolute amount.",
  "requiresExecution": true,
  "businessInsights": "Closing balances show your current financial position across all accounts, including accounts with zero balance.",
  "followUpQuestions": ["Which account has the highest balance?", "Show me only cash accounts", "What's my total balance?"]
}

For "total sales kitna hai" or "sales kitna hua":
{
  "type": "sql",
  "sql": "SELECT $Name as SALES_ACCOUNT, $ClosingBalance as SALES_AMOUNT FROM Ledger WHERE $Parent LIKE '%Sales%' OR $Parent LIKE '%Income%' ORDER BY $ClosingBalance DESC",
  "explanation": "This query retrieves all sales and income accounts to show your revenue.",
  "requiresExecution": true,
  "businessInsights": "Sales analysis helps track revenue performance and identify top-performing income sources.",
  "followUpQuestions": ["Which product/service sold the most?", "Monthly sales trend?", "Compare with last year"]
}

For "Ramniklal K Doshi balance" or "[Account Name] balance kitna hai":
{
  "type": "sql",
  "sql": "SELECT $Name as ACCOUNT_NAME, $ClosingBalance as BALANCE, $Parent as GROUP_NAME FROM Ledger WHERE UPPER($Name) LIKE UPPER('%Ramniklal%') AND UPPER($Name) LIKE UPPER('%Doshi%') AND UPPER($Name) LIKE UPPER('%Capital%')",
  "explanation": "This query searches for the specific account by name to get its closing balance.",
  "requiresExecution": true,
  "businessInsights": "Account-specific balance helps track individual ledger performance.",
  "followUpQuestions": ["Show me transaction details", "Generate ledger report", "Compare with last month"]
}

Generate your JSON response now:`;
  }

  private buildResultAnalysisPrompt(
    originalQuery: string,
    sqlQuery: string,
    results: any[],
    executionTime: number
  ): string {
    // Create a concise data preview
    const dataPreview = results.slice(0, 5).map((row, index) => {
      const entries = Object.entries(row).slice(0, 4);
      return `Row ${index + 1}: ${entries.map(([key, value]) => `${key}: ${this.formatValue(value)}`).join(' | ')}`;
    }).join('\n');

    return `Analyze these Tally query results and provide business intelligence insights:

ORIGINAL QUESTION: "${originalQuery}"
SQL EXECUTED: ${sqlQuery}
EXECUTION TIME: ${executionTime}ms
TOTAL RECORDS: ${results.length}

SAMPLE DATA:
${dataPreview}

INSTRUCTIONS:
1. Provide specific business insights based on the actual data shown
2. Use Indian business context (₹ currency, GST considerations, Tally ERP practices)
3. Include actionable recommendations for business improvement
4. Highlight key financial indicators and patterns
5. Suggest logical follow-up analyses
6. Format currency amounts as ₹X,XXX
7. Keep response professional but conversational
8. Focus on business value, not just data description

RESPONSE STRUCTURE:
**Analysis:** [Direct answer to the user's question with specific numbers]

**Key Insights:**
- [2-3 important business findings from the data]
- [Include totals, trends, or notable patterns]

**Recommendations:**
- [Actionable business advice based on the findings]
- [Suggestions for financial management or operations]

**Follow-up Questions:**
- [2-3 logical next questions the user might want to ask]

Generate your business intelligence response:`;
  }

  private formatValue(value: any): string {
    if (typeof value === 'number' && Math.abs(value) > 0.01) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
      }).format(value);
    }
    return String(value || '—');
  }

  private parseAIResponse(aiResponse: string, originalQuery: string): TallyAIResponse {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        type: parsed.type || 'explanation',
        sql: parsed.sql,
        explanation: parsed.explanation || 'Query processed.',
        requiresExecution: parsed.requiresExecution || false,
        businessInsights: parsed.businessInsights,
        followUpQuestions: parsed.followUpQuestions || []
      };
    } catch (parseError) {
      console.error("Could not parse OpenAI JSON response:", parseError);
      
      // Fallback parsing for non-JSON responses
      return {
        type: 'explanation',
        explanation: aiResponse || 'I apologize, but I had trouble processing your query. Please try asking a more specific question about your Tally data.',
        requiresExecution: false
      };
    }
  }

  private generateFallbackAnalysis(originalQuery: string, results: any[]): string {
    if (!results || results.length === 0) {
      return `**Analysis:** Your query "${originalQuery}" returned no data.

**Key Insights:**
- No matching records found in your Tally database
- This could indicate empty tables or incorrect query criteria

**Recommendations:**
- Verify that your company has data for the requested information
- Try a broader query to see what data is available
- Check if the account names or categories match your Tally setup

**Follow-up Questions:**
- "Show me all accounts" to see available data
- "What data is available in my Tally?" for an overview
- "Show me company information" to verify connection`;
    }

    const recordCount = results.length;
    const sampleData = results[0];
    const columns = Object.keys(sampleData);
    const hasBalances = columns.some(col => 
      col.toLowerCase().includes('balance') || 
      col.toLowerCase().includes('amount')
    );

    let totalAmount = 0;
    if (hasBalances) {
      totalAmount = results.reduce((sum, row) => {
        const balanceField = Object.keys(row).find(key => 
          key.toLowerCase().includes('balance') || 
          key.toLowerCase().includes('amount')
        );
        const value = balanceField ? parseFloat(row[balanceField]) || 0 : 0;
        return sum + value;
      }, 0);
    }

    return `**Analysis:** Found ${recordCount} records matching your query.

**Key Insights:**
- Your Tally database contains ${recordCount} relevant records
- Data fields available: ${columns.slice(0, 4).join(', ')}${hasBalances ? `\n- Total amount: ${this.formatValue(totalAmount)}` : ''}

**Recommendations:**
- Use this data for detailed business analysis and planning
- Consider segmenting the data by categories or date ranges for deeper insights

**Follow-up Questions:**
- "What's the breakdown by category?" for detailed analysis
- "Show me the top 10 by amount" for priority focus
- "What trends do you see?" for pattern analysis`;
  }

  // Legacy methods for backward compatibility
  async generateBusinessResponse(
    userQuery: string,
    businessContext: string,
    companyInfo: any,
    filesData: any[]
  ): Promise<string> {
    const response = await this.processTallyQuery(userQuery, { isConnected: true }, businessContext);
    return response.explanation;
  }

  async analyzeFileData(
    fileData: any,
    fileType: string,
    fileName: string
  ): Promise<string> {
    try {
      const prompt = this.buildFileAnalysisPrompt(fileData, fileType, fileName);

      const openaiClient = getOpenAIClient();
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a business data analysis expert. Analyze file data and provide concise insights."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.5
      });

      return completion.choices[0]?.message?.content || `File ${fileName} processed successfully.`;
    } catch (error) {
      console.error("File analysis error:", error);
      return `File ${fileName} analyzed and ready for business queries.`;
    }
  }

  private buildFileAnalysisPrompt(fileData: any, fileType: string, fileName: string): string {
    return `Analyze this business file: ${fileName} (${fileType})

File Data Summary:
${JSON.stringify(fileData, null, 2).substring(0, 800)}...

Provide a brief 2-3 sentence analysis focusing on:
1. What type of business data this appears to be
2. Key structure or patterns noticed  
3. How this data could be useful for business analysis

Keep response concise and business-focused.`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const openaiClient = getOpenAIClient();
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: 'Test connection. Respond with exactly "Connection successful".'
          }
        ],
        max_tokens: 10
      });

      const response = completion.choices[0]?.message?.content || "";
      return response.includes("Connection successful");
    } catch (error) {
      console.error("OpenAI connection test failed:", error);
      return false;
    }
  }
}

export const openaiService = new OpenAIService();