export interface ClientPreferences {
  clientId: string;
  companyName: string;
  defaultLedgers: string[];
  lastUsedLedgers: string[];
  quickAccessLedgers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class ClientPreferencesService {
  private preferences: Map<string, ClientPreferences> = new Map();

  /**
   * Get or create client preferences
   */
  getPreferences(clientId: string): ClientPreferences {
    let prefs = this.preferences.get(clientId);
    
    if (!prefs) {
      prefs = {
        clientId,
        companyName: 'Unknown Company',
        defaultLedgers: [],
        lastUsedLedgers: [],
        quickAccessLedgers: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.preferences.set(clientId, prefs);
    }
    
    return prefs;
  }

  /**
   * Update last used ledgers (for auto-prefetch)
   */
  addToLastUsed(clientId: string, ledgerName: string): void {
    const prefs = this.getPreferences(clientId);
    
    // Remove if already exists to avoid duplicates
    prefs.lastUsedLedgers = prefs.lastUsedLedgers.filter(l => l !== ledgerName);
    
    // Add to beginning
    prefs.lastUsedLedgers.unshift(ledgerName);
    
    // Keep only last 10
    prefs.lastUsedLedgers = prefs.lastUsedLedgers.slice(0, 10);
    
    prefs.updatedAt = new Date();
  }

  /**
   * Get last used ledgers
   */
  getLastUsed(clientId: string): string[] {
    const prefs = this.getPreferences(clientId);
    return prefs.lastUsedLedgers;
  }

  /**
   * Set quick access ledgers (frequently used)
   */
  setQuickAccess(clientId: string, ledgers: string[]): void {
    const prefs = this.getPreferences(clientId);
    prefs.quickAccessLedgers = ledgers;
    prefs.updatedAt = new Date();
  }

  /**
   * Set company name
   */
  setCompanyName(clientId: string, companyName: string): void {
    const prefs = this.getPreferences(clientId);
    prefs.companyName = companyName;
    prefs.updatedAt = new Date();
  }

  /**
   * Get quick suggestions for a client
   */
  getQuickSuggestions(clientId: string): string[] {
    const prefs = this.getPreferences(clientId);
    
    // Combine quick access and last used (prioritize quick access)
    const suggestions = [
      ...prefs.quickAccessLedgers,
      ...prefs.lastUsedLedgers.filter(l => !prefs.quickAccessLedgers.includes(l))
    ];
    
    return suggestions.slice(0, 5); // Return top 5
  }

  /**
   * Create auto-complete suggestions
   */
  createAutoCompleteResponse(clientId: string): string {
    const suggestions = this.getQuickSuggestions(clientId);
    
    if (suggestions.length === 0) {
      return '💡 Use "List all ledger accounts" to see available options.';
    }
    
    let response = '⚡ **Quick Access Accounts:**\n\n';
    suggestions.forEach((ledger, i) => {
      response += `${i + 1}. ${ledger}\n`;
    });
    
    response += '\n💡 Say the account name or number to get details instantly!';
    return response;
  }

  // Company name shortcuts to avoid repetitive typing
  private companyShortcuts: Record<string, string> = {
    'my company': 'company details',
    'company': 'company details', 
    'details': 'company details',
    'info': 'company details',
    'address': 'company address',
    'phone': 'company phone',
    'gst': 'company gst',
    'email': 'company email',
    'recent': 'quick access',
    'quick': 'quick access',
    'list': 'list all ledger accounts',
    'all': 'list all ledger accounts',
    'accounts': 'list all ledger accounts'
  };

  /**
   * Expand shortcuts in queries to avoid repetitive typing
   */
  expandQueryShortcuts(query: string): string {
    const lowerQuery = query.toLowerCase().trim();
    
    // Direct shortcuts
    if (this.companyShortcuts[lowerQuery]) {
      return this.companyShortcuts[lowerQuery];
    }

    // Pattern-based shortcuts for common queries
    if (lowerQuery.includes('highest') && !lowerQuery.includes('balance')) {
      return `${query} balance`;
    }

    if (lowerQuery.includes('sabse bada') && !lowerQuery.includes('balance')) {
      return `${query} closing balance`;
    }

    return query;
  }

  /**
   * Get available shortcuts help
   */
  getShortcutsHelp(): string {
    return `🚀 **Quick Shortcuts:**

**Company Info:**
• "details" → Company details
• "address" → Company address
• "phone" → Company phone

**Account Lists:**
• "list" → List all accounts
• "recent" → Recent accounts
• "quick" → Quick access

**Analysis:**
• "highest" → Highest balance
• "sabse bada" → Highest balance (Hindi)

💡 Type just the shortcut word to save time!`;
  }
}

// Global instance
export const clientPreferences = new ClientPreferencesService();