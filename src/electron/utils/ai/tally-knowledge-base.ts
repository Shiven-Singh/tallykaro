/**
 * TallyKaro AI Knowledge Base
 * Comprehensive rule-based query understanding and Tally ODBC query generation
 * Used as fallback when OpenAI/Gemini are unavailable
 */

export interface TallyQuery {
  sql: string;
  description: string;
  category: 'company' | 'ledger' | 'sales' | 'inventory' | 'analytical';
  confidence: number;
}

export interface QueryPattern {
  patterns: RegExp[];
  intent: string;
  category: 'company' | 'ledger' | 'sales' | 'inventory' | 'analytical';
  queryGenerator: (match: RegExpMatchArray) => TallyQuery;
}

export class TallyKnowledgeBase {
  private queryPatterns: QueryPattern[] = [
    // Company Information Patterns
    {
      patterns: [
        /(?:company\s+)?(?:name|details|info|address|phone)/i,
        /(?:my\s+)?company/i,
        /(?:show|get|what\s+is)\s+(?:company|my)\s+(?:name|details|info|address|phone)/i
      ],
      intent: 'company_info',
      category: 'company',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as company_name, $Address as address, $Phone as phone FROM Company",
        description: "Get company information including name, address, and phone",
        category: 'company',
        confidence: 0.9
      })
    },

    // Sales Analysis Patterns  
    {
      patterns: [
        /(?:my\s+)?(?:sales|revenue|turnover|income)(?:\s+(?:for|of)\s+(?:this\s+month|august|month))?/i,
        /(?:what\s+(?:is|are)\s+)?(?:my\s+)?(?:this\s+month\s+)?(?:sales|revenue)/i,
        /(?:total\s+)?(?:sales|revenue|income)(?:\s+(?:analysis|summary))?/i,
        /(?:show|get)\s+(?:sales|revenue)/i
      ],
      intent: 'sales_analysis',
      category: 'sales',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM Ledger",
        description: "Analyze sales and revenue from ledger accounts with intelligent filtering",
        category: 'sales',
        confidence: 0.8
      })
    },

    // Bank Balance Patterns
    {
      patterns: [
        /(?:bank\s+)?balance/i,
        /(?:what\s+is\s+)?(?:my\s+)?bank\s+balance/i,
        /(?:total\s+)?bank(?:\s+account)?\s+balance/i,
        /(?:show|get)\s+bank\s+balance/i
      ],
      intent: 'bank_balance',
      category: 'analytical',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as name, $ClosingBalance as balance FROM Ledger WHERE $Parent = 'Bank Accounts' OR $Name LIKE '%BANK%'",
        description: "Get all bank account balances with totals",
        category: 'analytical',
        confidence: 0.9
      })
    },

    // Highest/Lowest Balance Patterns
    {
      patterns: [
        /(?:highest|maximum|biggest|top)\s+(?:closing\s+)?balance/i,
        /(?:which\s+(?:company|account))\s+has\s+(?:highest|maximum)\s+balance/i,
        /(?:sabse\s+(?:bada|zyada))\s+balance/i,
        /(?:who\s+has\s+the\s+)?(?:highest|maximum)\s+balance/i
      ],
      intent: 'highest_balance',
      category: 'analytical',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM Ledger",
        description: "Find accounts with highest closing balances with client-side sorting",
        category: 'analytical',
        confidence: 0.85
      })
    },

    // Ledger Count Patterns
    {
      patterns: [
        /(?:how\s+many)\s+(?:ledgers?|accounts?)/i,
        /(?:count|total)\s+(?:of\s+)?(?:ledgers?|accounts?)/i,
        /(?:number\s+of)\s+(?:ledgers?|accounts?)/i,
        /(?:ledger|account)\s+count/i
      ],
      intent: 'ledger_count',
      category: 'analytical',
      queryGenerator: (match) => ({
        sql: "SELECT $Name FROM Ledger",
        description: "Count total number of ledger accounts",
        category: 'analytical',
        confidence: 0.9
      })
    },

    // Specific Account Balance Patterns
    {
      patterns: [
        /(?:balance\s+of\s+)([a-zA-Z\s&\-\.]+)/i,
        /([a-zA-Z\s&\-\.]{3,})\s+balance/i,
        /(?:what\s+is\s+)?([a-zA-Z\s&\-\.]{3,})\s+(?:closing\s+)?balance/i,
        /(?:show|get)\s+balance\s+(?:of\s+)?([a-zA-Z\s&\-\.]+)/i
      ],
      intent: 'account_balance',
      category: 'ledger',
      queryGenerator: (match) => {
        const accountName = match[1]?.trim();
        return {
          sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM Ledger WHERE $Name LIKE '%${accountName}%'`,
          description: `Get balance for account containing "${accountName}"`,
          category: 'ledger',
          confidence: 0.75
        };
      }
    },

    // List All Accounts Patterns
    {
      patterns: [
        /(?:list|show)\s+(?:all\s+)?(?:ledgers?|accounts?)/i,
        /(?:all\s+)?(?:ledger|account)\s+(?:list|accounts?)/i,
        /(?:get|show)\s+(?:all\s+)?accounts?/i
      ],
      intent: 'list_accounts',
      category: 'ledger',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM Ledger ORDER BY $Name",
        description: "List all ledger accounts with their balances",
        category: 'ledger',
        confidence: 0.8
      })
    },

    // Stock/Inventory Patterns
    {
      patterns: [
        /(?:stock|inventory)\s+(?:items?|status|summary)/i,
        /(?:how\s+many)\s+(?:stock\s+items?|inventory)/i,
        /(?:show|list)\s+(?:stock|inventory)/i,
        /(?:stock|inventory)\s+(?:balance|quantity)/i
      ],
      intent: 'stock_inquiry',
      category: 'inventory',
      queryGenerator: (match) => ({
        sql: "SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM StockItem",
        description: "Get stock item information and quantities",
        category: 'inventory',
        confidence: 0.7
      })
    }
  ];

  /**
   * Process user query using knowledge base
   */
  processQuery(userQuery: string): TallyQuery | null {
    console.log('🧠 Processing query with TallyKaro Knowledge Base:', userQuery);
    
    // Clean and normalize query
    const cleanQuery = userQuery.trim().toLowerCase();
    
    let bestMatch: { query: TallyQuery, confidence: number } | null = null;
    
    // Test each pattern
    for (const pattern of this.queryPatterns) {
      for (const regex of pattern.patterns) {
        const match = cleanQuery.match(regex);
        if (match) {
          const query = pattern.queryGenerator(match);
          
          // Boost confidence for exact matches
          if (match[0].length / cleanQuery.length > 0.5) {
            query.confidence += 0.1;
          }
          
          console.log(`📝 Pattern matched: ${pattern.intent} (confidence: ${query.confidence})`);
          
          if (!bestMatch || query.confidence > bestMatch.confidence) {
            bestMatch = { query, confidence: query.confidence };
          }
        }
      }
    }
    
    if (bestMatch && bestMatch.confidence > 0.5) {
      console.log('✅ Best match found:', bestMatch.query);
      return bestMatch.query;
    }
    
    console.log('❌ No suitable pattern matched for query');
    return null;
  }

  /**
   * Get query suggestions based on intent
   */
  getSuggestions(intent?: string): string[] {
    const suggestions = [
      'Try: "my sales"',
      'Try: "bank balance"',
      'Try: "company details"',
      'Try: "highest balance"',
      'Try: "how many ledgers"',
      'Try: "[company name] balance"',
      'Try: "list all accounts"'
    ];
    
    // Add context-specific suggestions based on intent
    switch (intent) {
      case 'sales_analysis':
        return ['Try: "this month sales"', 'Try: "revenue analysis"', 'Try: "total income"'];
      case 'bank_balance':
        return ['Try: "total bank balance"', 'Try: "cash balance"', 'Try: "account balances"'];
      case 'company_info':
        return ['Try: "company address"', 'Try: "company phone"', 'Try: "my company details"'];
      default:
        return suggestions;
    }
  }

  /**
   * Get available query categories
   */
  getCategories(): string[] {
    return ['company', 'sales', 'ledger', 'inventory', 'analytical'];
  }

  /**
   * Get help text for users
   */
  getHelpText(): string {
    return `
🧠 **TallyKaro AI Knowledge Base**

**Supported Query Types:**
• **Company Info:** "company details", "my company", "address"
• **Sales Analysis:** "my sales", "this month revenue", "total income"  
• **Account Balances:** "bank balance", "[company] balance", "highest balance"
• **Account Management:** "list accounts", "how many ledgers", "account summary"
• **Inventory:** "stock items", "inventory status", "stock summary"

**Tips for Better Results:**
• Be specific: "HDFC Bank balance" vs "bank balance"
• Use common terms: "sales" instead of "turnover"
• Try variations: "company details" or "my company info"

**Examples:**
• "What is Reliance Industries balance?"
• "Show me this month sales"
• "How many bank accounts do I have?"
• "List all customer accounts"
`;
  }
}

// Export singleton instance
export const tallyKnowledgeBase = new TallyKnowledgeBase();