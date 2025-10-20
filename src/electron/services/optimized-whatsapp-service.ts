import { Client } from 'pg';
import { S3Service } from './s3-service';
import * as crypto from 'crypto';

export interface WhatsAppQueryRequest {
  whatsappNumber: string;
  message: string;
  sessionId?: string;
  timestamp: Date;
}

export interface WhatsAppQueryResponse {
  success: boolean;
  response: string;
  responseType: 'text' | 'multiple_choice' | 'context_continuation';
  contextData?: any;
  processingTimeMs: number;
  cacheHit: boolean;
  metadata?: {
    exactMatch?: boolean;
    resultCount?: number;
    searchTerms?: string[];
  };
}

export interface ConversationContext {
  sessionId: string;
  contextType: 'ledger_search' | 'multi_match' | 'report_filter';
  data: any;
  expiresAt: Date;
}

export class OptimizedWhatsAppService {
  private pgClient: Client;
  private s3Service: S3Service;
  private responseCache: Map<string, any> = new Map();
  
  constructor() {
    this.pgClient = new Client({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'tallykaro',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    this.s3Service = new S3Service();
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      await this.pgClient.connect();
      console.log('✅ PostgreSQL connected for optimized WhatsApp service');
      
      // Clean expired data on startup
      await this.cleanExpiredData();
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
    }
  }

  /**
   * Main query processing function with optimization layers
   */
  async processQuery(request: WhatsAppQueryRequest): Promise<WhatsAppQueryResponse> {
    const startTime = Date.now();
    let cacheHit = false;
    
    try {
      // Step 1: Get client info
      const client = await this.getClientByWhatsApp(request.whatsappNumber);
      if (!client) {
        return this.createErrorResponse('User not registered. Please contact support.', startTime);
      }

      // Step 2: Normalize query for caching
      const normalizedQuery = this.normalizeQuery(request.message);
      const queryHash = this.generateQueryHash(client.client_id, normalizedQuery);

      // Step 3: Check cache first
      const cachedResponse = await this.getCachedResponse(queryHash);
      if (cachedResponse) {
        cacheHit = true;
        await this.updateCacheStats(queryHash);
        
        return {
          success: true,
          response: cachedResponse.response_text,
          responseType: cachedResponse.response_data.type || 'text',
          contextData: cachedResponse.response_data.context,
          processingTimeMs: Date.now() - startTime,
          cacheHit: true,
          metadata: cachedResponse.response_data.metadata
        };
      }

      // Step 4: Check conversation context
      const context = await this.getConversationContext(client.whatsapp_registration_id, request.sessionId || 'default');
      
      // Step 5: Process based on context or new query
      let response: WhatsAppQueryResponse;
      
      if (context && this.isContextualResponse(request.message)) {
        response = await this.processContextualQuery(request, client, context);
      } else {
        response = await this.processNewQuery(request, client);
      }

      // Step 6: Cache successful responses
      if (response.success && !response.contextData) {
        await this.cacheResponse(queryHash, client.client_id, normalizedQuery, response);
      }

      // Step 7: Update analytics
      await this.logQueryAnalytics(client, request, response, startTime);

      response.processingTimeMs = Date.now() - startTime;
      response.cacheHit = cacheHit;
      
      return response;
      
    } catch (error) {
      console.error('WhatsApp query processing error:', error);
      return this.createErrorResponse('Sorry, something went wrong. Please try again.', startTime);
    }
  }

  /**
   * Process new queries with intelligent routing
   */
  private async processNewQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    const queryType = this.classifyQuery(request.message);
    
    switch (queryType) {
      case 'ledger_balance':
        return await this.handleLedgerBalanceQuery(request, client);
      
      case 'ledger_list':
        return await this.handleLedgerListQuery(request, client);
      
      case 'customer_list':
        return await this.handleCustomerListQuery(request, client);
      
      case 'bank_accounts':
        return await this.handleBankAccountsQuery(request, client);
      
      case 'help':
        return await this.handleHelpQuery(request, client);
      
      default:
        return await this.handleGeneralQuery(request, client);
    }
  }

  /**
   * Lightning-fast ledger balance search using PostgreSQL full-text search
   */
  private async handleLedgerBalanceQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    const searchTerm = this.extractLedgerName(request.message);
    
    if (!searchTerm) {
      return {
        success: false,
        response: "Please specify a ledger name. Example: 'What is HDFC Bank balance?'",
        responseType: 'text',
        processingTimeMs: 0,
        cacheHit: false
      };
    }

    try {
      // First try exact match from PostgreSQL index
      const exactMatch = await this.findExactLedgerMatch(client.client_id, searchTerm);
      
      if (exactMatch.length === 1) {
        const ledger = exactMatch[0];
        const response = this.formatLedgerResponse(ledger);
        
        // Update user activity
        await this.updateUserActivity(client.whatsapp_registration_id, ledger.ledger_name, 'ledger_balance');
        
        return {
          success: true,
          response,
          responseType: 'text',
          processingTimeMs: 0,
          cacheHit: false,
          metadata: {
            exactMatch: true,
            resultCount: 1,
            searchTerms: [searchTerm]
          }
        };
      }

      // If no exact match, try fuzzy search
      const fuzzyMatches = await this.findFuzzyLedgerMatches(client.client_id, searchTerm);
      
      if (fuzzyMatches.length === 0) {
        return {
          success: false,
          response: `❌ No ledger found matching "${searchTerm}"\n\n💡 Try:\n• Shorter search terms\n• Check spelling\n• Use "list all" to see all accounts`,
          responseType: 'text',
          processingTimeMs: 0,
          cacheHit: false,
          metadata: {
            exactMatch: false,
            resultCount: 0,
            searchTerms: [searchTerm]
          }
        };
      }

      if (fuzzyMatches.length === 1) {
        const ledger = fuzzyMatches[0];
        const response = this.formatLedgerResponse(ledger);
        
        await this.updateUserActivity(client.whatsapp_registration_id, ledger.ledger_name, 'ledger_balance');
        
        return {
          success: true,
          response,
          responseType: 'text',
          processingTimeMs: 0,
          cacheHit: false,
          metadata: {
            exactMatch: false,
            resultCount: 1,
            searchTerms: [searchTerm]
          }
        };
      }

      // Multiple matches - create context for user selection
      const sessionId = request.sessionId || this.generateSessionId();
      await this.saveConversationContext(client.whatsapp_registration_id, sessionId, {
        contextType: 'multi_match',
        data: {
          searchTerm,
          matches: fuzzyMatches.slice(0, 10),
          queryType: 'ledger_balance'
        },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      const response = this.formatMultipleMatchesResponse(fuzzyMatches.slice(0, 10), searchTerm);
      
      return {
        success: true,
        response,
        responseType: 'multiple_choice',
        contextData: {
          sessionId,
          contextType: 'multi_match',
          matches: fuzzyMatches.slice(0, 10)
        },
        processingTimeMs: 0,
        cacheHit: false,
        metadata: {
          exactMatch: false,
          resultCount: fuzzyMatches.length,
          searchTerms: [searchTerm]
        }
      };

    } catch (error) {
      console.error('Ledger balance query error:', error);
      return {
        success: false,
        response: 'Error searching ledgers. Please try again.',
        responseType: 'text',
        processingTimeMs: 0,
        cacheHit: false
      };
    }
  }

  /**
   * Handle contextual responses (when user selects from multiple matches)
   */
  private async processContextualQuery(request: WhatsAppQueryRequest, client: any, context: ConversationContext): Promise<WhatsAppQueryResponse> {
    if (context.contextType === 'multi_match') {
      const selection = this.parseUserSelection(request.message, context.data.matches);
      
      if (selection) {
        // Clear context after selection
        await this.clearConversationContext(client.whatsapp_registration_id, context.sessionId);
        
        const response = this.formatLedgerResponse(selection);
        await this.updateUserActivity(client.whatsapp_registration_id, selection.ledger_name, 'ledger_balance');
        
        return {
          success: true,
          response,
          responseType: 'text',
          processingTimeMs: 0,
          cacheHit: false,
          metadata: {
            exactMatch: true,
            resultCount: 1,
            searchTerms: [context.data.searchTerm]
          }
        };
      } else {
        return {
          success: false,
          response: '❌ Invalid selection. Please reply with the number (1-10) or exact ledger name.',
          responseType: 'text',
          processingTimeMs: 0,
          cacheHit: false
        };
      }
    }

    // Handle other context types...
    return {
      success: false,
      response: 'Context not recognized. Please start a new query.',
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  /**
   * Database query methods
   */
  private async getClientByWhatsApp(whatsappNumber: string): Promise<any> {
    const query = `
      SELECT c.id as client_id, c.client_name, w.id as whatsapp_registration_id, w.whatsapp_number
      FROM clients c
      JOIN whatsapp_registrations w ON c.id = w.client_id
      WHERE w.whatsapp_number = $1 AND w.is_active = true AND c.is_active = true
    `;
    
    const result = await this.pgClient.query(query, [whatsappNumber]);
    return result.rows[0] || null;
  }

  private async findExactLedgerMatch(clientId: string, searchTerm: string): Promise<any[]> {
    const query = `
      SELECT ledger_name, ledger_parent, closing_balance, balance_type
      FROM ledger_search_index
      WHERE client_id = $1 
        AND (
          UPPER(ledger_name) = UPPER($2)
          OR name_vector @@ plainto_tsquery('english', $2)
        )
      ORDER BY 
        CASE WHEN UPPER(ledger_name) = UPPER($2) THEN 1 ELSE 2 END,
        ts_rank(name_vector, plainto_tsquery('english', $2)) DESC
      LIMIT 5
    `;
    
    const result = await this.pgClient.query(query, [clientId, searchTerm]);
    return result.rows;
  }

  private async findFuzzyLedgerMatches(clientId: string, searchTerm: string): Promise<any[]> {
    const query = `
      SELECT ledger_name, ledger_parent, closing_balance, balance_type,
             ts_rank(full_search_vector, plainto_tsquery('english', $2)) as rank
      FROM ledger_search_index
      WHERE client_id = $1 
        AND full_search_vector @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC, 
               CASE WHEN closing_balance != 0 THEN 1 ELSE 2 END,
               ledger_name
      LIMIT 10
    `;
    
    const result = await this.pgClient.query(query, [clientId, searchTerm]);
    return result.rows;
  }

  /**
   * Caching methods
   */
  private async getCachedResponse(queryHash: string): Promise<any> {
    const query = `
      SELECT response_data, response_text
      FROM query_cache
      WHERE query_hash = $1 AND expires_at > CURRENT_TIMESTAMP
    `;
    
    const result = await this.pgClient.query(query, [queryHash]);
    return result.rows[0] || null;
  }

  private async cacheResponse(queryHash: string, clientId: string, normalizedQuery: string, response: WhatsAppQueryResponse): Promise<void> {
    const query = `
      INSERT INTO query_cache (client_id, query_hash, normalized_query, query_type, response_data, response_text, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '30 minutes')
      ON CONFLICT (query_hash) DO UPDATE SET
        hit_count = query_cache.hit_count + 1,
        last_accessed_at = CURRENT_TIMESTAMP,
        response_data = $5,
        response_text = $6
    `;
    
    await this.pgClient.query(query, [
      clientId,
      queryHash,
      normalizedQuery,
      'ledger_balance',
      JSON.stringify(response),
      response.response
    ]);
  }

  /**
   * Context management
   */
  private async getConversationContext(whatsappRegistrationId: string, sessionId: string): Promise<ConversationContext | null> {
    const query = `
      SELECT session_id, context_type, context_data, expires_at
      FROM conversation_context
      WHERE whatsapp_registration_id = $1 
        AND session_id = $2 
        AND expires_at > CURRENT_TIMESTAMP
    `;
    
    const result = await this.pgClient.query(query, [whatsappRegistrationId, sessionId]);
    return result.rows[0] || null;
  }

  private async saveConversationContext(whatsappRegistrationId: string, sessionId: string, context: any): Promise<void> {
    const query = `
      INSERT INTO conversation_context (whatsapp_registration_id, session_id, context_type, context_data, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (whatsapp_registration_id, session_id, context_type) 
      DO UPDATE SET
        context_data = $4,
        expires_at = $5,
        last_used_at = CURRENT_TIMESTAMP
    `;
    
    await this.pgClient.query(query, [
      whatsappRegistrationId,
      sessionId,
      context.contextType,
      JSON.stringify(context.data),
      context.expiresAt
    ]);
  }

  /**
   * Utility methods
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/what is|show me|tell me|get|fetch/gi, '')
      .replace(/[^a-zA-Z0-9\s\(\)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private generateQueryHash(clientId: string, normalizedQuery: string): string {
    return crypto.createHash('md5').update(`${clientId}:${normalizedQuery}`).digest('hex');
  }

  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private classifyQuery(message: string): string {
    const lower = message.toLowerCase();
    
    if (lower.includes('balance') || lower.includes('amount')) {
      return 'ledger_balance';
    }
    if (lower.includes('list all') || lower.includes('show all')) {
      return 'ledger_list';
    }
    if (lower.includes('customer') || lower.includes('debtor')) {
      return 'customer_list';
    }
    if (lower.includes('bank')) {
      return 'bank_accounts';
    }
    if (lower.includes('help') || lower.includes('command')) {
      return 'help';
    }
    
    return 'general';
  }

  private extractLedgerName(message: string): string {
    return message
      .replace(/what is|show me|balance of|closing balance|tell me/gi, '')
      .replace(/[?!]/g, '')
      .trim();
  }

  private formatLedgerResponse(ledger: any): string {
    const balance = Math.abs(ledger.closing_balance || 0);
    const formattedBalance = balance.toLocaleString('en-IN');
    const balanceType = ledger.balance_type || (ledger.closing_balance >= 0 ? 'Dr' : 'Cr');
    
    return `💰 *${ledger.ledger_name}*\n📊 Balance: ₹${formattedBalance} ${balanceType}\n📁 Group: ${ledger.ledger_parent || 'N/A'}`;
  }

  private formatMultipleMatchesResponse(matches: any[], searchTerm: string): string {
    let response = `🔍 Found ${matches.length} matches for "${searchTerm}":\n\n`;
    
    matches.forEach((match, index) => {
      const balance = Math.abs(match.closing_balance || 0);
      const formattedBalance = balance.toLocaleString('en-IN');
      const balanceType = match.balance_type || (match.closing_balance >= 0 ? 'Dr' : 'Cr');
      
      response += `${index + 1}. *${match.ledger_name}*\n`;
      response += `   ₹${formattedBalance} ${balanceType}\n\n`;
    });
    
    response += '💡 Reply with the number (1-10) or exact name';
    return response;
  }

  private parseUserSelection(message: string, matches: any[]): any | null {
    const trimmed = message.trim();
    
    // Check if it's a number
    const num = parseInt(trimmed);
    if (!isNaN(num) && num >= 1 && num <= matches.length) {
      return matches[num - 1];
    }
    
    // Check if it's an exact name match
    const exactMatch = matches.find(m => 
      m.ledger_name.toLowerCase() === trimmed.toLowerCase()
    );
    
    return exactMatch || null;
  }

  private isContextualResponse(message: string): boolean {
    const trimmed = message.trim();
    
    // Check if it's a number (1-10)
    const num = parseInt(trimmed);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      return true;
    }
    
    // Check if it's a short response (likely a selection)
    if (trimmed.length < 50 && !trimmed.includes(' ')) {
      return true;
    }
    
    return false;
  }

  private async updateUserActivity(whatsappRegistrationId: string, ledgerName?: string, queryType?: string): Promise<void> {
    const query = `SELECT update_user_activity($1, $2, $3)`;
    await this.pgClient.query(query, [whatsappRegistrationId, ledgerName, queryType]);
  }

  private async logQueryAnalytics(client: any, request: WhatsAppQueryRequest, response: WhatsAppQueryResponse, startTime: number): Promise<void> {
    const query = `
      INSERT INTO query_analytics (
        client_id, whatsapp_registration_id, original_query, 
        total_response_time_ms, cache_hit, result_count, exact_match
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    await this.pgClient.query(query, [
      client.client_id,
      client.whatsapp_registration_id,
      request.message,
      Date.now() - startTime,
      response.cacheHit,
      response.metadata?.resultCount || 0,
      response.metadata?.exactMatch || false
    ]);
  }

  private async updateCacheStats(queryHash: string): Promise<void> {
    const query = `
      UPDATE query_cache 
      SET hit_count = hit_count + 1, last_accessed_at = CURRENT_TIMESTAMP
      WHERE query_hash = $1
    `;
    await this.pgClient.query(query, [queryHash]);
  }

  private async cleanExpiredData(): Promise<void> {
    await this.pgClient.query('SELECT clean_expired_data()');
  }

  private createErrorResponse(message: string, startTime: number): WhatsAppQueryResponse {
    return {
      success: false,
      response: message,
      responseType: 'text',
      processingTimeMs: Date.now() - startTime,
      cacheHit: false
    };
  }

  // Additional handler methods would go here...
  private async handleLedgerListQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    // Implementation for listing all ledgers
    return {
      success: true,
      response: "Feature coming soon - list all ledgers",
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  private async handleCustomerListQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    // Implementation for customer list
    return {
      success: true,
      response: "Feature coming soon - customer list",
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  private async handleBankAccountsQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    // Implementation for bank accounts
    return {
      success: true,
      response: "Feature coming soon - bank accounts",
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  private async handleHelpQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    const helpText = `🤖 *TallyKaro Help*

📊 *Balance Queries:*
• "HDFC Bank balance"
• "What is Cash balance?"
• "Show Reliance Industries balance"

📋 *Lists:*
• "List all customers"
• "Show bank accounts"
• "List all suppliers"

💡 *Tips:*
• Use exact ledger names for faster results
• Type "help" anytime for assistance
• Reports and PDFs coming soon!`;

    return {
      success: true,
      response: helpText,
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  private async handleGeneralQuery(request: WhatsAppQueryRequest, client: any): Promise<WhatsAppQueryResponse> {
    // Fallback to AI processing or general help
    return {
      success: false,
      response: "I didn't understand that. Type 'help' for available commands.",
      responseType: 'text',
      processingTimeMs: 0,
      cacheHit: false
    };
  }

  private async clearConversationContext(whatsappRegistrationId: string, sessionId: string): Promise<void> {
    const query = `
      DELETE FROM conversation_context 
      WHERE whatsapp_registration_id = $1 AND session_id = $2
    `;
    await this.pgClient.query(query, [whatsappRegistrationId, sessionId]);
  }
}