/**
 * AWS Bedrock Service - Production Version
 *
 * Uses Amazon Bedrock with Claude 3.5 Sonnet for query understanding
 * Replaces OpenAI and Google Gemini services
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockResponse {
  response: string;
  confidence: number;
  queryType: 'company' | 'ledger' | 'stock' | 'sales' | 'purchase' | 'outstanding' | 'general';
  requiresData: boolean;
  context?: string;
}

export class BedrockService {
  private client: BedrockRuntimeClient;
  private modelId: string;
  private isConfigured: boolean = false;

  constructor() {
    const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    const region = process.env.AWS_REGION || 'us-east-1';
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

    if (!bearerToken || bearerToken.includes('PLACEHOLDER')) {
      console.log('🔄 Bedrock not configured - using fallback query processing');
      this.isConfigured = false;
      return;
    }

    try {
      this.client = new BedrockRuntimeClient({
        region,
        credentials: {
          accessKeyId: 'unused', // Bearer token doesn't use access keys
          secretAccessKey: 'unused',
          sessionToken: bearerToken
        }
      });
      this.isConfigured = true;
      console.log('✅ AWS Bedrock initialized with Claude 3.5 Sonnet');
    } catch (error) {
      console.error('❌ Failed to initialize Bedrock:', error);
      this.isConfigured = false;
    }
  }

  async processQuery(userQuery: string): Promise<BedrockResponse> {
    if (!this.isConfigured) {
      return this.fallbackProcessing(userQuery);
    }

    try {
      const prompt = this.buildPrompt(userQuery);

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return this.parseBedrockResponse(responseBody.content[0].text, userQuery);
    } catch (error) {
      console.error('Bedrock query error:', error);
      return this.fallbackProcessing(userQuery);
    }
  }

  private buildPrompt(userQuery: string): string {
    return `You are TallyKaro, an AI assistant for Tally accounting software. Analyze this user query and classify it.

User Query: "${userQuery}"

Classify the query into ONE of these types:
- company: Questions about company name, address, details
- ledger: Questions about account balances, ledgers, parties
- stock: Questions about inventory, stock items, products
- sales: Questions about sales, revenue, customers
- purchase: Questions about purchases, vendors, expenses
- outstanding: Questions about receivables, payables, pending payments
- general: General conversation or unclear queries

Respond in this EXACT JSON format:
{
  "queryType": "type_here",
  "confidence": 0.95,
  "requiresData": true,
  "response": "Brief explanation of what data is needed"
}

Think carefully about the user's intent. Be precise.`;
  }

  private parseBedrockResponse(text: string, originalQuery: string): BedrockResponse {
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          response: parsed.response || 'Processing your query...',
          confidence: parsed.confidence || 0.8,
          queryType: parsed.queryType || 'general',
          requiresData: parsed.requiresData !== false,
          context: originalQuery
        };
      }
    } catch (error) {
      console.error('Failed to parse Bedrock response:', error);
    }

    // Fallback if parsing fails
    return this.fallbackProcessing(originalQuery);
  }

  private fallbackProcessing(query: string): BedrockResponse {
    const lowerQuery = query.toLowerCase();

    // Pattern matching fallback
    if (lowerQuery.includes('company') || lowerQuery.includes('address')) {
      return {
        response: 'Fetching company information...',
        confidence: 0.9,
        queryType: 'company',
        requiresData: true
      };
    }

    if (lowerQuery.includes('stock') || lowerQuery.includes('inventory') || lowerQuery.includes('item')) {
      return {
        response: 'Fetching stock data...',
        confidence: 0.9,
        queryType: 'stock',
        requiresData: true
      };
    }

    if (lowerQuery.includes('sales') || lowerQuery.includes('sell') || lowerQuery.includes('revenue')) {
      return {
        response: 'Fetching sales data...',
        confidence: 0.9,
        queryType: 'sales',
        requiresData: true
      };
    }

    if (lowerQuery.includes('purchase') || lowerQuery.includes('buy') || lowerQuery.includes('vendor')) {
      return {
        response: 'Fetching purchase data...',
        confidence: 0.9,
        queryType: 'purchase',
        requiresData: true
      };
    }

    if (lowerQuery.includes('ledger') || lowerQuery.includes('account') || lowerQuery.includes('balance')) {
      return {
        response: 'Fetching ledger data...',
        confidence: 0.9,
        queryType: 'ledger',
        requiresData: true
      };
    }

    if (lowerQuery.includes('outstanding') || lowerQuery.includes('pending') || lowerQuery.includes('due')) {
      return {
        response: 'Fetching outstanding data...',
        confidence: 0.9,
        queryType: 'outstanding',
        requiresData: true
      };
    }

    return {
      response: 'Processing your query...',
      confidence: 0.5,
      queryType: 'general',
      requiresData: true
    };
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}

// Singleton instance
let bedrockServiceInstance: BedrockService | null = null;

export function getBedrockService(): BedrockService {
  if (!bedrockServiceInstance) {
    bedrockServiceInstance = new BedrockService();
  }
  return bedrockServiceInstance;
}
