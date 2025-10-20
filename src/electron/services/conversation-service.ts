import { SupabaseService } from './supabase-service';

export interface ConversationContext {
  id?: string;
  whatsapp_number?: string;
  client_id: string;
  session_id?: string;
  context_data: any;
  expires_at: string;
  created_at?: string;
  updated_at?: string;
}

export class ConversationService {
  private supabase: SupabaseService | null = null;

  constructor() {
    // Don't create SupabaseService in constructor to avoid env var errors
    // Will be created lazily when needed
  }

  private getSupabaseService(): SupabaseService {
    if (!this.supabase) {
      this.supabase = new SupabaseService();
    }
    return this.supabase;
  }

  /**
   * Store conversation context for multi-turn queries
   */
  async storeContext(
    clientId: string,
    contextType: string,
    contextData: any,
    whatsappNumber?: string,
    sessionId?: string,
    expiryMinutes: number = 10
  ): Promise<boolean> {
    try {
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

      const contextRecord: ConversationContext = {
        whatsapp_number: whatsappNumber || 'desktop',
        client_id: clientId,
        session_id: sessionId || `desktop_${Date.now()}`,
        context_data: {
          type: contextType,
          data: contextData,
          timestamp: new Date().toISOString()
        },
        expires_at: expiresAt
      };

      // For now, store in memory since conversation_context table might not exist
      // TODO: Implement proper Supabase storage when table is available
      this.memoryContext.set(`${clientId}_${contextType}`, contextRecord);

      console.log(`✅ Stored conversation context: ${contextType} for ${clientId}`);
      return true;
    } catch (error) {
      console.error('Error storing conversation context:', error);
      return false;
    }
  }

  /**
   * Retrieve conversation context
   */
  async getContext(
    clientId: string,
    contextType: string,
    whatsappNumber?: string,
    sessionId?: string
  ): Promise<ConversationContext | null> {
    try {
      // For now, get from memory
      const key = `${clientId}_${contextType}`;
      const context = this.memoryContext.get(key);

      if (!context) {
        return null;
      }

      // Check if expired
      if (new Date(context.expires_at) < new Date()) {
        this.memoryContext.delete(key);
        return null;
      }

      return context;
    } catch (error) {
      console.error('Error retrieving conversation context:', error);
      return null;
    }
  }

  /**
   * Clear conversation context
   */
  async clearContext(
    clientId: string,
    contextType?: string
  ): Promise<boolean> {
    try {
      if (contextType) {
        const key = `${clientId}_${contextType}`;
        this.memoryContext.delete(key);
      } else {
        // Clear all contexts for client
        const keysToDelete = Array.from(this.memoryContext.keys()).filter(key => 
          key.startsWith(`${clientId}_`)
        );
        keysToDelete.forEach(key => this.memoryContext.delete(key));
      }

      return true;
    } catch (error) {
      console.error('Error clearing conversation context:', error);
      return false;
    }
  }

  /**
   * Clean expired contexts
   */
  async cleanExpiredContexts(): Promise<void> {
    try {
      const now = new Date();
      const keysToDelete: string[] = [];

      for (const [key, context] of this.memoryContext.entries()) {
        if (new Date(context.expires_at) < now) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.memoryContext.delete(key));

      if (keysToDelete.length > 0) {
        console.log(`🧹 Cleaned ${keysToDelete.length} expired conversation contexts`);
      }
    } catch (error) {
      console.error('Error cleaning expired contexts:', error);
    }
  }

  // Temporary in-memory storage for conversation contexts
  private memoryContext = new Map<string, ConversationContext>();
}

// Export singleton instance
export const conversationService = new ConversationService();