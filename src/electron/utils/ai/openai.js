"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiService = exports.OpenAIService = void 0;
const openai_1 = __importDefault(require("openai"));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
}
const openai = new openai_1.default({
    apiKey: OPENAI_API_KEY,
});
class OpenAIService {
    generateQuickInsight(context, arg1) {
        throw new Error("Method not implemented.");
    }
    async processTallyQuery(userQuery, connectionStatus, businessContext) {
        try {
            const prompt = this.buildTallyQueryPrompt(userQuery, connectionStatus, businessContext);
            console.log("🤖 Sending Tally query to OpenAI...");
            const completion = await openai.chat.completions.create({
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
            const aiResponse = completion.choices[0]?.message?.content || "{}";
            return this.parseAIResponse(aiResponse, userQuery);
        }
        catch (error) {
            console.error("OpenAI Tally query error:", error);
            if (error === "rate_limit_exceeded") {
                return {
                    type: 'explanation',
                    explanation: "I'm currently experiencing high demand. Please try again in a moment.",
                    requiresExecution: false
                };
            }
            return {
                type: 'explanation',
                explanation: `I encountered an issue processing your query. Please try a simpler question about your Tally data.`,
                requiresExecution: false
            };
        }
    }
    async analyzeQueryResults(originalQuery, sqlQuery, results, executionTime) {
        try {
            const prompt = this.buildResultAnalysisPrompt(originalQuery, sqlQuery, results, executionTime);
            const completion = await openai.chat.completions.create({
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
        }
        catch (error) {
            console.error("OpenAI result analysis error:", error);
            return this.generateFallbackAnalysis(originalQuery, results);
        }
    }
    buildTallyQueryPrompt(userQuery, connectionStatus, businessContext) {
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
5. Common patterns:
   - Cash accounts: WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts'
   - Debit balances: WHERE $$IsDr:$ClosingBalance
   - Credit balances: WHERE $$IsCr:$ClosingBalance
   - Non-zero balances: WHERE $ClosingBalance <> 0
   - Account groups: WHERE $Parent = 'Sundry Debtors' (for receivables)

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

For "How is my business doing?":
{
  "type": "analysis",
  "sql": "",
  "explanation": "To analyze your business performance, I need to examine key financial indicators. Let me start by checking your cash position, account balances, and receivables/payables.",
  "requiresExecution": false,
  "businessInsights": "Business performance analysis typically includes liquidity (cash position), profitability trends, receivables management, and overall financial health indicators.",
  "followUpQuestions": ["What's my cash position?", "Show me all account balances", "What are my receivables and payables?", "Show me income vs expenses"]
}

Generate your JSON response now:`;
    }
    buildResultAnalysisPrompt(originalQuery, sqlQuery, results, executionTime) {
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
    formatValue(value) {
        if (typeof value === 'number' && Math.abs(value) > 0.01) {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(value);
        }
        return String(value || '—');
    }
    parseAIResponse(aiResponse, originalQuery) {
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
        }
        catch (parseError) {
            console.error("Could not parse OpenAI JSON response:", parseError);
            // Fallback parsing for non-JSON responses
            return {
                type: 'explanation',
                explanation: aiResponse || 'I apologize, but I had trouble processing your query. Please try asking a more specific question about your Tally data.',
                requiresExecution: false
            };
        }
    }
    generateFallbackAnalysis(originalQuery, results) {
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
        const hasBalances = columns.some(col => col.toLowerCase().includes('balance') ||
            col.toLowerCase().includes('amount'));
        let totalAmount = 0;
        if (hasBalances) {
            totalAmount = results.reduce((sum, row) => {
                const balanceField = Object.keys(row).find(key => key.toLowerCase().includes('balance') ||
                    key.toLowerCase().includes('amount'));
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
    async generateBusinessResponse(userQuery, businessContext, companyInfo, filesData) {
        const response = await this.processTallyQuery(userQuery, { isConnected: true }, businessContext);
        return response.explanation;
    }
    async analyzeFileData(fileData, fileType, fileName) {
        try {
            const prompt = this.buildFileAnalysisPrompt(fileData, fileType, fileName);
            const completion = await openai.chat.completions.create({
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
        }
        catch (error) {
            console.error("File analysis error:", error);
            return `File ${fileName} analyzed and ready for business queries.`;
        }
    }
    buildFileAnalysisPrompt(fileData, fileType, fileName) {
        return `Analyze this business file: ${fileName} (${fileType})

File Data Summary:
${JSON.stringify(fileData, null, 2).substring(0, 800)}...

Provide a brief 2-3 sentence analysis focusing on:
1. What type of business data this appears to be
2. Key structure or patterns noticed  
3. How this data could be useful for business analysis

Keep response concise and business-focused.`;
    }
    async testConnection() {
        try {
            const completion = await openai.chat.completions.create({
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
        }
        catch (error) {
            console.error("OpenAI connection test failed:", error);
            return false;
        }
    }
}
exports.OpenAIService = OpenAIService;
exports.openaiService = new OpenAIService();
