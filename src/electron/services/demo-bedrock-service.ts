/**
 * Demo Bedrock Service - For Hackathon Submission
 *
 * Simulates AWS Bedrock responses without requiring real credentials
 * Uses pattern matching and rule-based logic to mimic AI behavior
 */

export interface BedrockResponse {
  response: string;
  requiresExecution: boolean;
  type: 'smart_query' | 'general' | 'sql';
  sql?: string;
  data?: any;
}

export class DemoBedrockService {
  private isDemo: boolean;

  constructor() {
    this.isDemo = process.env.DEMO_MODE === 'true' || !process.env.AWS_ACCESS_KEY_ID;
    if (this.isDemo) {
      console.log('🎬 DEMO MODE: Using simulated Bedrock responses (no AWS credentials required)');
    }
  }

  /**
   * Process query using simulated Bedrock agent
   * In production, this would call actual AWS Bedrock
   */
  async processQuery(userQuery: string, context?: any): Promise<BedrockResponse> {
    if (this.isDemo) {
      return this.simulateBedrockResponse(userQuery);
    }

    // In production, call real Bedrock
    return this.callRealBedrock(userQuery, context);
  }

  /**
   * Simulate Bedrock responses using pattern matching
   * This demonstrates the AI agent behavior without requiring AWS credentials
   */
  private simulateBedrockResponse(query: string): BedrockResponse {
    const queryLower = query.toLowerCase();

    // Company queries
    if (this.matchesPattern(queryLower, ['company', 'address', 'detail'])) {
      return {
        response: 'Here are the company details from the demo database.',
        requiresExecution: true,
        type: 'smart_query',
        data: 'company_info'
      };
    }

    // Sales queries
    if (this.matchesPattern(queryLower, ['sales', 'sell', 'revenue']) ||
        this.matchesPattern(queryLower, ['बिक्री', 'sale'])) {

      // Check for date-specific queries
      let dateContext = '';
      if (queryLower.includes('july') || queryLower.includes('जुलाई')) {
        dateContext = ' for July 2024';
      } else if (queryLower.includes('august') || queryLower.includes('अगस्त')) {
        dateContext = ' for August 2024';
      } else if (queryLower.includes('this month')) {
        dateContext = ' for the current month';
      }

      // Check for filters
      if (queryLower.includes('negative') || queryLower.includes('credit note')) {
        return {
          response: `Showing credit notes/negative sales${dateContext}.`,
          requiresExecution: true,
          type: 'smart_query',
          data: 'sales_negative'
        };
      } else if (queryLower.includes('positive')) {
        return {
          response: `Showing positive sales${dateContext}.`,
          requiresExecution: true,
          type: 'smart_query',
          data: 'sales_positive'
        };
      } else if (queryLower.includes('highest') || queryLower.includes('maximum') || queryLower.includes('sabse zyada')) {
        return {
          response: `Finding the highest sale${dateContext}.`,
          requiresExecution: true,
          type: 'smart_query',
          data: 'sales_highest'
        };
      } else if (queryLower.includes('lowest') || queryLower.includes('minimum') || queryLower.includes('sabse kam')) {
        return {
          response: `Finding the lowest sale${dateContext}.`,
          requiresExecution: true,
          type: 'smart_query',
          data: 'sales_lowest'
        };
      }

      return {
        response: `Here are your sales vouchers${dateContext}.`,
        requiresExecution: true,
        type: 'smart_query',
        data: 'sales_all'
      };
    }

    // Purchase queries
    if (this.matchesPattern(queryLower, ['purchase', 'buy', 'procurement']) ||
        this.matchesPattern(queryLower, ['खरीद', 'purchase'])) {

      let dateContext = '';
      if (queryLower.includes('july')) dateContext = ' for July 2024';
      else if (queryLower.includes('august')) dateContext = ' for August 2024';

      if (queryLower.includes('negative') || queryLower.includes('debit note')) {
        return {
          response: `Showing debit notes/negative purchases${dateContext}.`,
          requiresExecution: true,
          type: 'smart_query',
          data: 'purchase_negative'
        };
      }

      return {
        response: `Here are your purchase vouchers${dateContext}.`,
        requiresExecution: true,
        type: 'smart_query',
        data: 'purchase_all'
      };
    }

    // Stock queries
    if (this.matchesPattern(queryLower, ['stock', 'inventory', 'item']) ||
        this.matchesPattern(queryLower, ['स्टॉक', 'माल'])) {

      if (queryLower.includes('negative') || queryLower.includes('out of stock')) {
        return {
          response: 'Showing items that are out of stock (negative quantities).',
          requiresExecution: true,
          type: 'smart_query',
          data: 'stock_negative'
        };
      } else if (queryLower.includes('positive') || queryLower.includes('available')) {
        return {
          response: 'Showing items in stock (positive quantities).',
          requiresExecution: true,
          type: 'smart_query',
          data: 'stock_positive'
        };
      }

      return {
        response: 'Here are your stock items.',
        requiresExecution: true,
        type: 'smart_query',
        data: 'stock_all'
      };
    }

    // Ledger queries
    if (this.matchesPattern(queryLower, ['ledger', 'account', 'balance']) ||
        this.matchesPattern(queryLower, ['खाता', 'बैलेंस', 'balance kitna'])) {

      // Check for specific ledger name
      const ledgerPatterns = [
        'hdfc', 'icici', 'axis', 'bank', 'cash',
        'tech solutions', 'digital innovations', 'cloud services',
        'enterprise systems', 'smart tech'
      ];

      for (const pattern of ledgerPatterns) {
        if (queryLower.includes(pattern)) {
          return {
            response: `Searching for ledger containing "${pattern}"...`,
            requiresExecution: true,
            type: 'smart_query',
            data: `ledger_search:${pattern}`
          };
        }
      }

      return {
        response: 'Here are all ledgers.',
        requiresExecution: true,
        type: 'smart_query',
        data: 'ledger_all'
      };
    }

    // Outstanding queries
    if (this.matchesPattern(queryLower, ['outstanding', 'receivable', 'payable', 'owe']) ||
        this.matchesPattern(queryLower, ['बकाया', 'outstanding'])) {
      return {
        response: 'Here are the top outstanding balances (debtors and creditors).',
        requiresExecution: true,
        type: 'smart_query',
        data: 'outstanding_all'
      };
    }

    // Default response for unrecognized queries
    return {
      response: `I understand you're asking: "${query}"\n\nIn demo mode, I can help with:\n• Sales queries (e.g., "what are my sales?")\n• Stock queries (e.g., "show me stock levels")\n• Ledger queries (e.g., "HDFC Bank balance")\n• Outstanding queries (e.g., "what are my outstandings?")\n\nPlease try one of these query types.`,
      requiresExecution: false,
      type: 'general'
    };
  }

  /**
   * Helper to match multiple patterns
   */
  private matchesPattern(query: string, patterns: string[]): boolean {
    return patterns.some(pattern => query.includes(pattern));
  }

  /**
   * Production method - calls real AWS Bedrock
   * This is what would be used with actual credentials
   */
  private async callRealBedrock(userQuery: string, context?: any): Promise<BedrockResponse> {
    // This would contain the actual AWS Bedrock SDK calls
    // For hackathon, keep this commented out or implement if you have AWS credits

    /*
    const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });

    const prompt = `You are an AI assistant for querying ERP/accounting data.

User Query: ${userQuery}

Context: ${JSON.stringify(context || {})}

Analyze this query and determine:
1. What data the user wants
2. Whether it needs database execution
3. What type of query it is (sales, purchase, stock, ledger, etc.)

Respond in JSON format:
{
  "response": "Natural language response",
  "requiresExecution": true/false,
  "type": "smart_query|general|sql",
  "data": "query_type"
}`;

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return JSON.parse(result.content[0].text);
    */

    throw new Error('Real Bedrock not configured. Set DEMO_MODE=false and provide AWS credentials.');
  }

  /**
   * Check if service is in demo mode
   */
  isDemoMode(): boolean {
    return this.isDemo;
  }
}

// Singleton instance
let demoBedrockInstance: DemoBedrockService | null = null;

export function getDemoBedrockService(): DemoBedrockService {
  if (!demoBedrockInstance) {
    demoBedrockInstance = new DemoBedrockService();
  }
  return demoBedrockInstance;
}
