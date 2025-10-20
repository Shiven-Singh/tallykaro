/**
 * Centralized Client Context Manager
 * Single source of truth for client_id across the application
 */

class ClientContextManager {
  private static instance: ClientContextManager;
  private currentClientId: string | null = null;

  private constructor() {}

  static getInstance(): ClientContextManager {
    if (!ClientContextManager.instance) {
      ClientContextManager.instance = new ClientContextManager();
    }
    return ClientContextManager.instance;
  }

  /**
   * Set the current client ID (called after login/connection)
   */
  setClientId(clientId: string): void {
    if (!clientId || clientId.trim() === '') {
      throw new Error('Client ID cannot be empty');
    }

    console.log(`🔑 Setting client context to: "${clientId}"`);
    this.currentClientId = clientId;
  }

  /**
   * Get the current client ID
   * Throws error if not set (fail-fast instead of silent bugs)
   */
  getClientId(): string {
    if (!this.currentClientId) {
      throw new Error('Client ID not set. User must login first.');
    }
    return this.currentClientId;
  }

  /**
   * Get client ID with fallback (for backward compatibility)
   * @deprecated Use getClientId() instead - fail fast is better
   */
  getClientIdOrDefault(defaultValue: string): string {
    if (!this.currentClientId) {
      console.warn(`⚠️ Client ID not set, using fallback: "${defaultValue}"`);
      return defaultValue;
    }
    return this.currentClientId;
  }

  /**
   * Check if client ID is set
   */
  hasClientId(): boolean {
    return this.currentClientId !== null;
  }

  /**
   * Clear client ID (called on logout)
   */
  clearClientId(): void {
    console.log('🔓 Clearing client context');
    this.currentClientId = null;
  }
}

export const clientContext = ClientContextManager.getInstance();
