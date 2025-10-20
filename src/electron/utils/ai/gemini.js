"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiService = exports.GeminiService = void 0;
const genai_1 = require("@google/genai");
const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY;
if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is required");
}
const ai = new genai_1.GoogleGenAI({ apiKey: GEMINI_API_KEY });
class GeminiService {
    async processTallyQuery(userQuery, connectionStatus, businessContext) {
        try {
            const prompt = this.buildTallyQueryPrompt(userQuery, connectionStatus, businessContext);
            console.log("🤖 Sending Tally query to Gemini...");
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash-thinking-exp",
                contents: [{ text: prompt }],
            });
            const aiResponse = response.text || "Unable to process query";
            return this.parseAIResponse(aiResponse, userQuery);
        }
        catch (error) {
            console.error("Gemini Tally query error:", error);
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
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash-thinking-exp",
                contents: [{ text: prompt }],
            });
            return response.text || "Query executed successfully.";
        }
        catch (error) {
            console.error("Result analysis error:", error);
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
1. Use $Method syntax: SELECT $Name, $ClosingBalance FROM Ledger
2. NEVER use VOUCHERHEAD or VOUCHERITEM tables (causes TDL errors)
3. Safe tables: Ledger, Company, StockItem
4. Indian currency format: ₹
5. Common patterns:
   - Cash accounts: WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts'
   - Debit balances: WHERE $$IsDr:$ClosingBalance
   - Credit balances: WHERE $$IsCr:$ClosingBalance
   - Non-zero balances: WHERE $ClosingBalance <> 0

AVAILABLE TALLY TABLES & METHODS:
- Ledger: $Name, $Parent, $ClosingBalance, $OpeningBalance, $Address
- Company: $Name, $Address, $Phone, $Email
- StockItem: $Name, $Parent, $ClosingBalance (if available)

USER QUERY: "${userQuery}"

RESPONSE FORMAT (JSON):
{
  "type": "sql|analysis|explanation",
  "sql": "SELECT $Name, $ClosingBalance FROM Ledger WHERE...",
  "explanation": "Business explanation of what this query does",
  "requiresExecution": true/false,
  "businessInsights": "What this data tells us about the business",
  "followUpQuestions": ["What other questions the user might ask"]
}

EXAMPLES:
Query: "What's my cash balance?"
Response: {
  "type": "sql",
  "sql": "SELECT $Name as ACCOUNT_NAME, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent = 'Cash-in-Hand' OR $Parent = 'Bank Accounts' ORDER BY $ClosingBalance DESC",
  "explanation": "This query retrieves all cash and bank account balances from your chart of accounts.",
  "requiresExecution": true,
  "businessInsights": "Cash position analysis helps understand liquidity and working capital management.",
  "followUpQuestions": ["Which account has the highest balance?", "What's my total liquid funds?"]
}

Query: "How is my business doing?"
Response: {
  "type": "analysis",
  "explanation": "To analyze your business performance, I need to look at your financial data. Let me check your account balances and key financial metrics.",
  "requiresExecution": false,
  "businessInsights": "Business performance analysis requires reviewing cash position, receivables, payables, and profitability trends.",
  "followUpQuestions": ["What's my cash position?", "Show me account balances", "What are my receivables?"]
}

Generate your response now:`;
    }
    buildResultAnalysisPrompt(originalQuery, sqlQuery, results, executionTime) {
        const dataPreview = results.slice(0, 5).map(row => Object.entries(row).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(' | ')).join('\n');
        return `Analyze these Tally query results and provide business intelligence insights:

ORIGINAL QUESTION: "${originalQuery}"
SQL EXECUTED: ${sqlQuery}
EXECUTION TIME: ${executionTime}ms
TOTAL RECORDS: ${results.length}

SAMPLE DATA:
${dataPreview}

INSTRUCTIONS:
1. Provide specific business insights based on the actual data
2. Use Indian business context (₹ currency, Tally practices)
3. Include actionable recommendations
4. Highlight key financial indicators
5. Suggest follow-up analyses
6. Keep response professional and concise
7. Format currency amounts properly

RESPONSE STRUCTURE:
Analysis: [Direct answer to the user's question]
Key Insights: [2-3 important findings from the data]
Recommendations: [Actionable business advice]
Follow-up: [Suggested next questions]

Generate business intelligence response:`;
    }
    parseAIResponse(aiResponse, originalQuery) {
        try {
            // Try to parse JSON response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    type: parsed.type || 'explanation',
                    sql: parsed.sql,
                    explanation: parsed.explanation || 'Query processed.',
                    requiresExecution: parsed.requiresExecution || false,
                    businessInsights: parsed.businessInsights,
                    followUpQuestions: parsed.followUpQuestions || []
                };
            }
        }
        catch (parseError) {
            console.log("Could not parse JSON, treating as explanation");
        }
        // Fallback: treat as explanation
        return {
            type: 'explanation',
            explanation: aiResponse,
            requiresExecution: false
        };
    }
    generateFallbackAnalysis(originalQuery, results) {
        if (!results || results.length === 0) {
            return `Your query "${originalQuery}" returned no data. This could mean:
      
Analysis: No matching records found in your Tally database.
Recommendations: 
- Check if the query targets the correct accounts or categories
- Verify that your company has data for the requested period
- Try a broader query to see available data

Follow-up: You might ask "Show me all accounts" or "What data is available?"`;
        }
        const recordCount = results.length;
        const sampleData = results[0];
        const columns = Object.keys(sampleData);
        return `Query Results Analysis:

Analysis: Found ${recordCount} records with ${columns.length} data fields.
Key Data Fields: ${columns.slice(0, 4).join(', ')}

Insights: 
- Your Tally database contains ${recordCount} matching records
- Data includes: ${columns.includes('BALANCE') || columns.includes('$ClosingBalance') ? 'account balances' : 'business information'}

Recommendations: Use this data for further analysis and business planning.

Follow-up: Ask specific questions about the data you see, such as totals or trends.`;
    }
    // Legacy methods for backward compatibility
    async generateBusinessResponse(userQuery, businessContext, companyInfo, filesData) {
        const response = await this.processTallyQuery(userQuery, { isConnected: true }, businessContext);
        return response.explanation;
    }
    async analyzeFileData(fileData, fileType, fileName) {
        try {
            const prompt = `Analyze this ${fileType} business file: "${fileName}"

File Data Preview:
${JSON.stringify(fileData, null, 2).substring(0, 1000)}

Provide a brief analysis focusing on:
1. Type of business data identified
2. Key metrics and structure  
3. Potential for business intelligence

Keep response concise:`;
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash-thinking-exp",
                contents: [{ text: prompt }],
            });
            return response.text || "File analyzed successfully";
        }
        catch (error) {
            console.error("File analysis error:", error);
            return `File ${fileName} processed and ready for analysis.`;
        }
    }
}
exports.GeminiService = GeminiService;
exports.geminiService = new GeminiService();
