export interface ConversationContext {
  sessionId: string;
  whatsappNumber: string;
  clientId: string;
  lastQuery: string;
  lastResponse: string;
  lastQueryType: string;
  lastData: any;
  timestamp: Date;
  expiresAt: Date;
}

export class ConversationContextService {
  private contexts: Map<string, ConversationContext> = new Map();
  private readonly CONTEXT_EXPIRY_MINUTES = 10;

  /**
   * Get or create conversation context
   */
  getContext(whatsappNumber: string, clientId: string): ConversationContext {
    const contextKey = `${whatsappNumber}-${clientId}`;
    let context = this.contexts.get(contextKey);

    // Create new context if doesn't exist or expired
    if (!context || context.expiresAt < new Date()) {
      context = {
        sessionId: this.generateSessionId(),
        whatsappNumber,
        clientId,
        lastQuery: '',
        lastResponse: '',
        lastQueryType: '',
        lastData: null,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + this.CONTEXT_EXPIRY_MINUTES * 60 * 1000)
      };
      this.contexts.set(contextKey, context);
    }

    return context;
  }

  /**
   * Update context with new query and response
   */
  updateContext(
    whatsappNumber: string, 
    clientId: string, 
    query: string, 
    response: string, 
    queryType: string, 
    data: any
  ): void {
    const context = this.getContext(whatsappNumber, clientId);
    context.lastQuery = query;
    context.lastResponse = response;
    context.lastQueryType = queryType;
    context.lastData = data;
    context.timestamp = new Date();
    context.expiresAt = new Date(Date.now() + this.CONTEXT_EXPIRY_MINUTES * 60 * 1000);
  }

  /**
   * Check if user is continuing a previous conversation
   */
  isContinuation(whatsappNumber: string, clientId: string, currentQuery: string): boolean {
    const context = this.getContext(whatsappNumber, clientId);
    
    // Check for continuation patterns
    const continuationPatterns = [
      /^(1|2|3|4|5|6|7|8|9|10)$/, // Number selection
      /^(first|second|third|fourth|fifth)$/i,
      /^(show\s+me\s+)?more$/i,
      /^(tell\s+me\s+)?details$/i,
      /^yes$/i,
      /^ok$/i,
      /^continue$/i
    ];

    const isNumberPattern = continuationPatterns.some(pattern => pattern.test(currentQuery.trim()));
    const hasMultipleResults = context.lastData && Array.isArray(context.lastData) && context.lastData.length > 1;
    const isLedgerType = context.lastQueryType === 'ledger' || context.lastQueryType === 'cached';
    
    console.log('🔄 Checking continuation:', {
      isNumberPattern,
      hasMultipleResults,
      isLedgerType,
      lastQueryType: context.lastQueryType,
      dataLength: context.lastData ? (Array.isArray(context.lastData) ? context.lastData.length : 'not array') : 'no data'
    });
    
    return isNumberPattern && hasMultipleResults && isLedgerType;
  }

  /**
   * Process continuation query
   */
  processContinuation(whatsappNumber: string, clientId: string, selection: string): any {
    const context = this.getContext(whatsappNumber, clientId);
    
    if (!context.lastData || !Array.isArray(context.lastData)) {
      return null;
    }

    // Parse selection
    let index = -1;
    if (/^\d+$/.test(selection)) {
      index = parseInt(selection) - 1; // Convert to 0-based index
    } else if (selection.toLowerCase() === 'first') {
      index = 0;
    } else if (selection.toLowerCase() === 'second') {
      index = 1;
    }
    // Add more word-to-number mappings as needed

    if (index >= 0 && index < context.lastData.length) {
      return context.lastData[index];
    }

    return null;
  }

  /**
   * Clean expired contexts
   */
  cleanExpiredContexts(): void {
    const now = new Date();
    for (const [key, context] of this.contexts.entries()) {
      if (context.expiresAt < now) {
        this.contexts.delete(key);
      }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get conversation history for debugging
   */
  getHistory(whatsappNumber: string, clientId: string): ConversationContext | null {
    const contextKey = `${whatsappNumber}-${clientId}`;
    return this.contexts.get(contextKey) || null;
  }
}

// Global instance
export const conversationContext = new ConversationContextService();

// Clean expired contexts every 5 minutes
setInterval(() => {
  conversationContext.cleanExpiredContexts();
}, 5 * 60 * 1000);