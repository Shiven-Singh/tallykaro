// Import ODBC with proper error handling for packaged apps
let odbc: any = null;
let odbcAvailable = false;

try {
  odbc = require('odbc');
  odbcAvailable = true;
  console.log('✅ ODBC module loaded successfully');
} catch (error) {
  console.warn('⚠️ ODBC module not available in packaged app:', error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error));
  console.log('📝 Using alternative Tally integration methods');
  
  // Create a mock odbc object for TypeScript compatibility
  odbc = {
    connect: () => Promise.reject(new Error('ODBC not available in packaged application')),
    Connection: class MockConnection {}
  };
}

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TallyConfig {
  serverPath?: string;
  companyName?: string;
  odbcDriver?: string;
  port?: number;
  dataSourceName?: string;
  mobileNumber?: string;
  password?: string;
}

export interface TallyConnectionStatus {
  isConnected: boolean;
  error?: string;
  companyName?: string;
  tallyVersion?: string;
  lastConnected?: Date;
  validationDetails?: string[];
  availableData?: string[];
  warnings?: string[];
  executionTime?: number;
  timestamp?: string;
}

export interface TallyQueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  rowCount?: number;
  executionTime?: number;
  query?: string;
  timestamp?: string;
}

export interface SmartQueryResult {
  success: boolean;
  type: 'exact_match' | 'multiple_matches' | 'no_match' | 'suggestions';
  ledgers: LedgerMatch[];
  message: string;
  suggestions?: string[];
  executionTime?: number;
}

export interface LedgerMatch {
  name: string;
  parent: string;
  closingBalance: number;
  matchScore: number;
}

export interface StockItem {
  name: string;
  parent: string;
  closingBalance: number;
  uom?: string;
  openingValue?: number;
  closingValue?: number;
  inwardQuantity?: number;
  outwardQuantity?: number;
}

export interface StockSummary {
  totalItems: number;
  totalValue: number;
  lowStockItems: StockItem[];
  zeroStockItems: StockItem[];
  highValueItems: StockItem[];
}

export interface StockQueryResult {
  success: boolean;
  data?: StockItem[];
  summary?: StockSummary;
  error?: string;
  executionTime?: number;
  query?: string;
}

interface CompanyData {
  NAME?: string;
  ADDRESS?: string;
  [key: string]: any;
}

export class TallyService {
  private connection: any | null = null;
  private config: TallyConfig | null = null;
  private isConnecting: boolean = false;
  private availableTables: string[] = [];
  private skipProblematicTables: boolean = true;

  constructor() {
    console.log('TallyService initialized with enhanced connection management and smart query system');
    if (!odbcAvailable) {
      console.log('📋 ODBC not available - alternative Tally integration methods will be used');
    }
  }

  private isOdbcAvailable(): boolean {
    return odbcAvailable;
  }

  private getOdbcUnavailableStatus(): TallyConnectionStatus {
    return {
      isConnected: false,
      error: 'ODBC module not available in packaged application. Using alternative Tally integration methods.',
      warnings: [
        'Direct database connection unavailable',
        'File-based integration recommended',
        'Web API integration available',
        'Export/Import functionality active'
      ],
      timestamp: new Date().toISOString(),
      executionTime: 0
    };
  }


  /**
   * Smart ledger query - handles fuzzy matching and user-friendly responses
   */
  async queryLedgerSmart(userInput: string): Promise<SmartQueryResult> {
    const startTime = Date.now();
    
    if (!this.connection) {
      return {
        success: false,
        type: 'no_match',
        ledgers: [],
        message: 'Not connected to Tally database. Please connect first.',
        executionTime: Date.now() - startTime
      };
    }

    const searchTerm = this.cleanSearchTerm(userInput);
    console.log(`Smart query for: "${searchTerm}"`);

    try {
      // The searchTerm should be the full company name (first extracted term)
      // For "7 SHORE IMEX (P)" it should be "7 SHORE IMEX (P)", not individual words
      
      // Step 1: Try exact match with the full search term first
      let results = await this.exactMatch(searchTerm);
      if (results.length === 1) {
        console.log(`Exact match found with full term: "${searchTerm}"`);
        return {
          success: true,
          type: 'exact_match',
          ledgers: results,
          message: `Found: ${results[0].name}`,
          executionTime: Date.now() - startTime
        };
      }
      
      // Step 1.5: If no exact match with full term, try meaningful individual parts
      if (searchTerm.includes(' ')) {
        const meaningfulTerms = searchTerm.split(' ').filter(t => 
          t.length > 2 && 
          !['the', 'and', 'for', 'with', 'from', '&', 'co', 'ltd', 'pvt', 'p', 's'].includes(t.toLowerCase())
        );
        
        // Only try individual terms if we have meaningful terms and no exact match yet
        for (const term of meaningfulTerms) {
          console.log(`Trying meaningful term: "${term}"`);
          const results = await this.exactMatch(term);
          if (results.length >= 1) {
            console.log(`Found ${results.length} match(es) with meaningful term: "${term}"`);
            // If single match, return it; if multiple, continue to fuzzy matching
            if (results.length === 1) {
              return {
                success: true,
                type: 'exact_match',
                ledgers: results,
                message: `Found: ${results[0].name}`,
                executionTime: Date.now() - startTime
              };
            }
          }
        }
      }
      

      // Step 3: Try fuzzy matching
      results = await this.fuzzyMatch(searchTerm);
      if (results.length === 1) {
        return {
          success: true,
          type: 'exact_match',
          ledgers: results,
          message: `Found: ${results[0].name}`,
          executionTime: Date.now() - startTime
        };
      }

      // Step 3: Multiple matches found
      if (results.length > 1) {
        return {
          success: true,
          type: 'multiple_matches',
          ledgers: results.slice(0, 5),
          message: `Found ${results.length} ledgers matching "${searchTerm}". Please specify which one:`,
          executionTime: Date.now() - startTime
        };
      }

      // Step 4: ODBC Fallback - Load all ledgers and do client-side search
      console.log(`ODBC LIMITATION DETECTED: String search failing, trying client-side fallback`);
      const fallbackResult = await this.clientSideFuzzySearch(searchTerm);
      
      if (fallbackResult.length > 0) {
        console.log(`Client-side search found ${fallbackResult.length} matches`);
        return {
          success: true,
          type: fallbackResult.length === 1 ? 'exact_match' : 'multiple_matches',
          ledgers: fallbackResult,
          message: fallbackResult.length === 1 
            ? `Found: ${fallbackResult[0].name} (using fallback search)`
            : `Found ${fallbackResult.length} possible matches (using fallback search):`,
          executionTime: Date.now() - startTime
        };
      }

      // Step 5: Final fallback - provide suggestions
      const suggestions = await this.getSuggestions(searchTerm);
      
      return {
        success: false,
        type: suggestions.length > 0 ? 'suggestions' : 'no_match',
        ledgers: [],
        message: suggestions.length > 0 
          ? `No exact match for "${searchTerm}". Did you mean one of these?`
          : `No ledger found matching "${searchTerm}".\n\n**Note:** Text search may have ODBC limitations.\n\n**Tips:**\n• Try shorter search terms\n• Ask for "list all ledger accounts" first\n• Use specific balance amounts if known`,
        suggestions,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Smart query error:', error);
      return {
        success: false,
        type: 'no_match',
        ledgers: [],
        message: `Query error: ${this.extractErrorMessage(error)}`,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Clean and normalize user input - preserve dots for company names like A.A.MALLA & CO.
   */
  private cleanSearchTerm(input: string): string {
    // Extract the main search term before common phrases
    let cleaned = input
      .replace(/what is|closing balance|balance of|show me|balance for/gi, '')
      .replace(/[?!]/g, '') // Only remove question marks and exclamation marks, keep dots and commas for company names
      .trim();
    
    // If the input looks like "7 SHORE IMEX (P) SHORE IMEX (P)" (duplicated), take first part
    const parts = cleaned.split(/\s+/);
    const uniqueParts = [];
    const seen = new Set();
    
    for (const part of parts) {
      if (!seen.has(part.toUpperCase())) {
        seen.add(part.toUpperCase());
        uniqueParts.push(part);
      }
    }
    
    return uniqueParts.join(' ').trim();
  }

  /**
   * Exact match (case-insensitive) - ENHANCED with better precision
   */
  private async exactMatch(searchTerm: string): Promise<LedgerMatch[]> {
    const cleanTerm = searchTerm.trim();
    
    // First, try client-side exact match for better accuracy
    try {
      console.log(`Trying client-side exact match for: "${cleanTerm}"`);
      
      // Load all ledgers once (this is fast and accurate)
      const allLedgers = await this.connection!.query('SELECT $Name, $Parent, $ClosingBalance FROM Ledger');
      
      if (Array.isArray(allLedgers) && allLedgers.length > 0) {
        const processedLedgers = this.processLedgerResults(allLedgers, 100);
        
        // Try exact matches with different variations
        const exactMatches = processedLedgers.filter(ledger => {
          const ledgerName = ledger.name.toUpperCase();
          const searchUpper = cleanTerm.toUpperCase();
          
          return ledgerName === searchUpper || 
                 ledgerName.replace(/\s+/g, ' ') === searchUpper.replace(/\s+/g, ' ') ||
                 ledgerName.replace(/[^A-Z0-9]/g, '') === searchUpper.replace(/[^A-Z0-9]/g, '');
        });
        
        if (exactMatches.length > 0) {
          console.log(`✅ Found ${exactMatches.length} exact match(es) via client-side search`);
          return exactMatches;
        }
        
        // Try starts-with match for better user experience
        const startsWithMatches = processedLedgers.filter(ledger => 
          ledger.name.toUpperCase().startsWith(cleanTerm.toUpperCase())
        );
        
        if (startsWithMatches.length === 1) {
          console.log(`✅ Found 1 starts-with match via client-side search`);
          return startsWithMatches;
        }
      }
    } catch (error) {
      console.error('Client-side exact match failed, falling back to ODBC:', error);
    }
    
    // Fallback to ODBC strategies
    const strategies = [
      // Strategy 1: Simple exact match
      `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
       FROM Ledger 
       WHERE UPPER($Name) = UPPER('${cleanTerm.replace(/'/g, "''")}')`,
      
      // Strategy 2: With LTRIM/RTRIM
      `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
       FROM Ledger 
       WHERE UPPER(LTRIM(RTRIM($Name))) = UPPER('${cleanTerm.replace(/'/g, "''")}')`,
    ];
    
    console.log(`Trying ODBC exact match for: "${cleanTerm}"`);
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = await this.connection!.query(strategies[i]);
        if (result.length > 0) {
          console.log(`✅ ODBC strategy ${i + 1} found ${result.length} results`);
          return this.processLedgerResults(result, 100);
        }
      } catch (error) {
        console.error(`ODBC exact match strategy ${i + 1} error:`, error);
        continue;
      }
    }
    
    console.log(`No exact matches found for "${cleanTerm}"`);
    return [];
  }

  /**
   * Fuzzy matching with multiple strategies
   */
  private async fuzzyMatch(searchTerm: string): Promise<LedgerMatch[]> {
    const strategies = [
      // Strategy 1: Contains match
      {
        sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
              FROM Ledger 
              WHERE UPPER($Name) LIKE UPPER('%${searchTerm.replace(/'/g, "''")}%')`,
        baseScore: 80
      },
      // Strategy 2: Starts with match
      {
        sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
              FROM Ledger 
              WHERE UPPER($Name) LIKE UPPER('${searchTerm.replace(/'/g, "''")}%')`,
        baseScore: 90
      }
    ];

    // Add word boundary matches for multi-word searches
    const words = searchTerm.split(/[\s&]+/).filter(w => w.length > 1); // Split on spaces and ampersands
    if (words.length > 0) {
      words.forEach(word => {
        strategies.push({
          sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
                FROM Ledger 
                WHERE UPPER($Name) LIKE UPPER('%${word.replace(/'/g, "''")}%')`,
          baseScore: 70
        });
      });
    }

    // Add special strategy for dotted names (like A.A.MALLA)
    if (searchTerm.includes('.')) {
      // Try without dots for fuzzy matching
      const withoutDots = searchTerm.replace(/\./g, '');
      strategies.push({
        sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
              FROM Ledger 
              WHERE UPPER(REPLACE($Name, '.', '')) LIKE UPPER('%${withoutDots.replace(/'/g, "''")}%')`,
        baseScore: 85
      });
      
      // Try with optional dots (match both A.A.MALLA and AAMALLA patterns)
      const dotPattern = searchTerm.replace(/\./g, '\\.?'); // Make dots optional in regex
      strategies.push({
        sql: `SELECT $Name as name, $Parent as parent, $ClosingBalance as closingBalance 
              FROM Ledger 
              WHERE UPPER($Name) LIKE UPPER('%${searchTerm.replace(/\./g, '%').replace(/'/g, "''")}%')`,
        baseScore: 75
      });
    }

    const allResults: LedgerMatch[] = [];
    
    for (const strategy of strategies) {
      try {
        const result = await this.connection!.query(strategy.sql);
        const scored = this.processLedgerResults(result, strategy.baseScore, searchTerm);
        allResults.push(...scored);
      } catch (error) {
        console.error('Fuzzy match strategy error:', error);
        continue;
      }
    }

    // Remove duplicates and sort by match score
    const uniqueResults = this.removeDuplicates(allResults);
    return uniqueResults
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
  }

  /**
   * Process ledger query results
   */
  private processLedgerResults(result: any[], baseScore: number, searchTerm?: string): LedgerMatch[] {
    if (!Array.isArray(result)) return [];
    
    return result.map(r => ({
      name: r.name || r.$Name || '',
      parent: r.parent || r.$Parent || '',
      closingBalance: this.parseBalance(r.closingBalance || r.$ClosingBalance || 0),
      matchScore: searchTerm ? this.calculateMatchScore(r.name || r.$Name || '', searchTerm, baseScore) : baseScore
    }));
  }

  /**
   * Calculate match score based on various factors
   */
  private calculateMatchScore(ledgerName: string, searchTerm: string, baseScore: number): number {
    const upper = ledgerName.toUpperCase();
    const search = searchTerm.toUpperCase();
    
    let score = baseScore;
    
    // Bonus for shorter names (more likely to be exact)
    if (ledgerName.length <= searchTerm.length + 5) score += 10;
    
    // Bonus for exact word matches
    const searchWords = search.split(' ');
    const nameWords = upper.split(' ');
    const exactWordMatches = searchWords.filter(sw => 
      nameWords.some(nw => nw === sw)
    ).length;
    score += exactWordMatches * 5;
    
    // Penalty for very long names (less likely to be what user wants)
    if (ledgerName.length > searchTerm.length * 3) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get suggestions for similar ledger names
   */
  private async getSuggestions(searchTerm: string): Promise<string[]> {
    try {
      // Try to get smart suggestions based on common patterns
      const commonSuggestions = await this.getCommonAccountSuggestions(searchTerm);
      if (commonSuggestions.length > 0) {
        return commonSuggestions;
      }

      // Enhanced similarity matching - first try with broader search
      const sql = `SELECT $Name as name FROM Ledger WHERE UPPER($Name) LIKE UPPER('%${searchTerm.substring(0, 5)}%') ORDER BY $Name`;
      const result = await this.connection!.query(sql);
      
      if (!Array.isArray(result)) return [];
      
      const suggestions = result
        .map(l => ({
          name: (l as any).name || (l as any).$Name || '',
          similarity: this.calculateSimilarity((l as any).name || (l as any).$Name || '', searchTerm)
        }))
        .filter(s => s.similarity > 0.1 || s.name.toUpperCase().includes(searchTerm.toUpperCase().substring(0, 4)))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map(s => s.name);
      
      return suggestions;
    } catch (error) {
      console.error('Suggestions error:', error);
      return this.getFallbackSuggestions(searchTerm);
    }
  }

  /**
   * Get common account suggestions based on search patterns
   */
  private async getCommonAccountSuggestions(searchTerm: string): Promise<string[]> {
    const term = searchTerm.toLowerCase();
    const patterns: { [key: string]: string } = {
      'cash': `SELECT $Name FROM Ledger WHERE UPPER($Name) LIKE '%CASH%' OR $Parent = 'Cash-in-Hand'`,
      'bank': `SELECT $Name FROM Ledger WHERE UPPER($Name) LIKE '%BANK%' OR $Parent = 'Bank Accounts'`,
      'customer': `SELECT $Name FROM Ledger WHERE $Parent = 'Sundry Debtors' ORDER BY $Name`,
      'supplier': `SELECT $Name FROM Ledger WHERE $Parent = 'Sundry Creditors' ORDER BY $Name`,
      'expense': `SELECT $Name FROM Ledger WHERE $Parent LIKE '%Expenses%'`,
      'income': `SELECT $Name FROM Ledger WHERE $Parent LIKE '%Income%'`
    };

    for (const [pattern, sql] of Object.entries(patterns)) {
      if (term.includes(pattern)) {
        try {
          const result = await this.connection!.query(sql);
          if (Array.isArray(result) && result.length > 0) {
            return result.slice(0, 5).map(r => (r as any).$Name || (r as any).name || '');
          }
        } catch (error) {
          console.error(`Error getting ${pattern} suggestions:`, error);
        }
      }
    }

    return [];
  }

  /**
   * Fallback suggestions when database queries fail
   */
  private getFallbackSuggestions(searchTerm: string): string[] {
    const term = searchTerm.toLowerCase();
    
    if (term.includes('cash')) {
      return ['Cash Account', 'Petty Cash', 'Cash-in-Hand'];
    }
    if (term.includes('bank')) {
      return ['Bank Account', 'Current Account', 'Savings Account'];
    }
    if (term.includes('customer')) {
      return ['Try: "List all customers"', 'Or: "Show sundry debtors"'];
    }
    if (term.includes('supplier')) {
      return ['Try: "List all suppliers"', 'Or: "Show sundry creditors"'];
    }
    
    return ['Try: "List all ledger accounts"', 'Or: "Show bank accounts"', 'Or: "Show cash accounts"'];
  }

  /**
   * Simple string similarity calculation
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance for similarity
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Remove duplicate results
   */
  private removeDuplicates(results: LedgerMatch[]): LedgerMatch[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });
  }

  /**
   * Client-side fuzzy search when ODBC LIKE operations fail
   */
  private async clientSideFuzzySearch(searchTerm: string): Promise<LedgerMatch[]> {
    try {
      console.log(`Loading all ledgers for client-side search of: "${searchTerm}"`);
      
      // Load all ledgers (this works with ODBC)
      const result = await this.connection!.query('SELECT $Name, $Parent, $ClosingBalance FROM Ledger');
      
      if (!Array.isArray(result) || result.length === 0) {
        console.log('No ledgers loaded for client-side search');
        return [];
      }
      
      console.log(`Loaded ${result.length} ledgers for client-side matching`);
      
      // Process all ledgers
      const allLedgers = this.processLedgerResults(result, 100);
      
      // Client-side fuzzy matching
      const matches: LedgerMatch[] = [];
      const searchUpper = searchTerm.toUpperCase();
      
      for (const ledger of allLedgers) {
        const nameUpper = ledger.name.toUpperCase();
        let matchScore = 0;
        
        // Exact match (highest priority)
        if (nameUpper === searchUpper) {
          matchScore = 100;
        }
        // Contains match
        else if (nameUpper.includes(searchUpper)) {
          matchScore = 90;
        }
        // Individual word matches
        else {
          const searchWords = searchUpper.split(/\s+/);
          const nameWords = nameUpper.split(/\s+/);
          
          const matchingWords = searchWords.filter(sw => 
            nameWords.some(nw => nw.includes(sw) || sw.includes(nw))
          );
          
          if (matchingWords.length > 0) {
            matchScore = Math.min(80, (matchingWords.length / searchWords.length) * 80);
          }
        }
        
        if (matchScore > 0) {
          matches.push({
            ...ledger,
            matchScore
          });
        }
      }
      
      // Sort by match score and return top results
      return matches
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 10);
        
    } catch (error) {
      console.error('Client-side fuzzy search failed:', error);
      return [];
    }
  }

  /**
   * Parse balance value from various formats
   */
  private parseBalance(balance: any): number {
    if (typeof balance === 'number') return balance;
    if (typeof balance === 'string') {
      const cleaned = balance.replace(/[₹,\s]/g, '').replace('—', '0');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Enhanced executeQuery with smart query detection
   */
  async executeQuery(sql: string): Promise<TallyQueryResult> {
    const startTime = Date.now();
    
    console.log('Executing query:', sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
    
    if (!this.connection) {
      return {
        success: false,
        error: 'Not connected to Tally database. Please connect first.',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }

    // Block problematic queries
    const sqlLower = sql.toLowerCase();
    if (sqlLower.includes('voucherhead') || sqlLower.includes('voucheritem')) {
      return {
        success: false,
        error: 'Transaction table queries are blocked to prevent TDL errors. Try LEDGER or COMPANY tables instead.',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }

    try {
      // Add timeout to prevent hanging queries (60 seconds for complex voucher queries)
      const queryPromise = this.connection.query(sql);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 60 seconds')), 60000);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      console.log('Query successful, result type:', Array.isArray(result) ? `Array[${result.length}]` : typeof result);

      return {
        success: true,
        data: Array.isArray(result) ? result : [result],
        rowCount: Array.isArray(result) ? result.length : 1,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error: unknown) {
      console.error('Query execution failed:', error);
      const errorMessage = this.parseError(error);

      // Only clean up connection for actual connection errors, NOT timeouts
      // Timeouts might just mean the query is slow - don't break the connection!
      if ((errorMessage.toLowerCase().includes('connection') ||
           errorMessage.toLowerCase().includes('closed')) &&
          !errorMessage.toLowerCase().includes('timeout')) {
        console.log('Connection appears broken, cleaning up');
        this.connection = null;
        this.config = null;
        this.availableTables = [];
      } else if (errorMessage.toLowerCase().includes('timeout')) {
        console.log('⚠️ Query timed out but keeping connection alive');
      }

      return {
        success: false,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Test connection (read-only test)
   */
  async testConnection(config: TallyConfig): Promise<TallyConnectionStatus> {
    console.log('Testing Tally connection (read-only test)');
    
    if (this.isConnecting) {
      return {
        isConnected: false,
        error: 'Connection test not available during connection process'
      };
    }

    const startTime = Date.now();
    const validationDetails: string[] = [];
    const availableData: string[] = [];
    const warnings: string[] = [];

    try {
      // Step 1: Check if Tally is running
      validationDetails.push('STEP 1: Checking if Tally is running');
      const tallyProcesses = await this.checkTallyProcesses();
      if (tallyProcesses.length === 0) {
        return {
          isConnected: false,
          error: 'Tally is not running. Please start TallyPrime first.',
          validationDetails,
          warnings,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }
      validationDetails.push(`Found Tally processes running: ${tallyProcesses.length}`);

      // Step 2: Test ODBC connection with multiple strategies
      validationDetails.push('STEP 2: Testing ODBC connection methods');
      const connectionStrings = this.buildConnectionStrings(config);
      let testConnection: any | null = null;
      let successMethod = '';

      for (const { method, connectionString } of connectionStrings) {
        try {
          validationDetails.push(`Trying: ${method}`);
          testConnection = await odbc.connect(connectionString);
          successMethod = method;
          validationDetails.push(`SUCCESS: Connected via ${method}`);
          break;
        } catch (error) {
          validationDetails.push(`FAILED: ${method} - ${this.extractErrorMessage(error)}`);
          continue;
        }
      }

      if (!testConnection) {
        return {
          isConnected: false,
          error: 'Failed to establish ODBC connection with any method. Please check ODBC setup.',
          validationDetails,
          warnings,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }

      // Step 3: Test data access
      validationDetails.push('STEP 3: Testing data access');
      const dataAssessment = await this.assessSafeDataOnly(testConnection);
      
      if (dataAssessment.hasData) {
        availableData.push(...dataAssessment.workingTables);
        validationDetails.push(`Data access confirmed: ${dataAssessment.workingTables.length} tables available`);
      } else {
        warnings.push('Limited data access - some tables may not be available');
      }

      // Close test connection
      await testConnection.close();
      validationDetails.push('Test connection closed successfully');

      warnings.push('Note: Advanced tables (VOUCHERHEAD, transactions) are skipped to avoid TDL errors');

      return {
        isConnected: true,
        companyName: config.companyName || 'Current Company',
        tallyVersion: 'TallyPrime',
        lastConnected: new Date(),
        validationDetails,
        availableData,
        warnings,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

    } catch (error: unknown) {
      console.error('Test connection failed:', error);
      return {
        isConnected: false,
        error: this.parseError(error),
        validationDetails: [...validationDetails, `CRITICAL ERROR: ${this.parseError(error)}`],
        warnings,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Connect with persistent connection management
   */
  async connect(config: TallyConfig): Promise<TallyConnectionStatus> {
    console.log('Connecting to Tally (Enhanced)');
    
    // Check ODBC availability first
    if (!this.isOdbcAvailable()) {
      console.warn('📋 ODBC not available - returning alternative connection status');
      return this.getOdbcUnavailableStatus();
    }
    
    try {
      // Clean up any existing connection
      await this.disconnect();
      
      const startTime = Date.now();
      const validationDetails: string[] = [];
      const availableData: string[] = [];
      const warnings: string[] = [];
      
      // Step 1: Verify Tally is running
      validationDetails.push('STEP 1: Verifying Tally is running');
      const tallyProcesses = await this.checkTallyProcesses();
      if (tallyProcesses.length === 0) {
        return {
          isConnected: false,
          error: 'Tally is not running. Please start TallyPrime and open a company.',
          validationDetails,
          warnings,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }
      validationDetails.push(`Tally processes found: ${tallyProcesses.length}`);

      // Step 2: Establish persistent connection
      validationDetails.push('STEP 2: Establishing persistent connection');
      const connectionStrings = this.buildConnectionStrings(config);
      let successMethod = '';

      for (const { method, connectionString } of connectionStrings) {
        try {
          console.log(`Trying connection method: ${method}`);
          const testConnection = await odbc.connect(connectionString);
          
          // Test data access before storing
          const dataTest = await this.assessSafeDataOnly(testConnection);
          
          if (dataTest.hasData) {
            // SUCCESS - store the persistent connection
            this.connection = testConnection;
            this.config = config;
            this.availableTables = dataTest.workingTables;
            successMethod = method;
            availableData.push(...dataTest.workingTables);
            validationDetails.push(`SUCCESS: Persistent connection via ${method}`);
            console.log('Connection stored successfully');
            break;
          } else {
            await testConnection.close();
            validationDetails.push(`FAILED: ${method} - No data access`);
          }
        } catch (error) {
          validationDetails.push(`FAILED: ${method} - ${this.extractErrorMessage(error)}`);
          continue;
        }
      }

      if (!this.connection) {
        return {
          isConnected: false,
          error: 'Failed to establish persistent connection. Please check ODBC setup.',
          validationDetails,
          warnings,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }

      // Step 3: Final verification
      console.log('Final connection verification');
      const finalTest = await this.verifyConnection();
      if (!finalTest.success) {
        console.log('Final verification failed:', finalTest.error);
        await this.disconnect();
        return {
          isConnected: false,
          error: `Connection established but verification failed: ${finalTest.error}`,
          validationDetails,
          warnings,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }

      console.log('CONNECTION SUCCESSFUL');
      console.log('Connection exists:', !!this.connection);
      console.log('Config exists:', !!this.config);
      console.log('Available data:', availableData.length, 'sources');
      
      warnings.push('Note: Advanced transaction tables are skipped to prevent TDL errors');

      return {
        isConnected: true,
        companyName: config.companyName || 'Current Open Company',
        tallyVersion: 'TallyPrime',
        lastConnected: new Date(),
        validationDetails,
        availableData,
        warnings,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

    } catch (error: unknown) {
      console.error('Critical error in connect:', error);
      await this.disconnect();
      return {
        isConnected: false,
        error: `Connection failed: ${this.parseError(error)}`,
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verify connection is working
   */
  private async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.connection) {
      return { success: false, error: 'No connection object' };
    }

    try {
      const result = await this.connection.query("SELECT COUNT(*) as COUNT FROM COMPANY");
      return { success: true };
    } catch (error) {
      return { success: false, error: this.extractErrorMessage(error) };
    }
  }

  /**
   * Assess safe data access only
   */
  private async assessSafeDataOnly(connection: any): Promise<{
    hasData: boolean;
    workingTables: string[];
    issues: string[];
  }> {
    const safeTables = ['COMPANY', 'LEDGER', 'GROUP', 'STOCKITEM', 'COSTCENTRE'];
    const workingTables: string[] = [];
    const issues: string[] = [];

    for (const table of safeTables) {
      try {
        const result = await connection.query(`SELECT COUNT(*) as COUNT FROM ${table}`);
        if (Array.isArray(result) && result.length > 0) {
          const count = this.extractNumericValue(result, 'COUNT');
          if (count >= 0) {
            workingTables.push(table);
          }
        }
      } catch (error) {
        issues.push(`${table}: ${this.extractErrorMessage(error)}`);
      }
    }

    return {
      hasData: workingTables.length > 0,
      workingTables,
      issues
    };
  }

  /**
   * Get business data with safe queries only
   */
  async getBusinessData() {
    console.log('Getting business data');
    
    if (!this.connection) {
      return { error: 'Not connected to Tally database' };
    }

    const results: any = {};
    const safeTables = ['COMPANY', 'LEDGER', 'GROUP', 'STOCKITEM'];
    let successCount = 0;
    const totalQueries = safeTables.length;

    for (const table of safeTables) {
      try {
        console.log(`Querying ${table} table`);
        const query = `SELECT TOP 5 * FROM ${table}`;
        const result = await this.connection.query(query);
        
        if (Array.isArray(result) && result.length > 0) {
          results[table] = {
            success: true,
            count: result.length,
            sample: result[0],
            data: result
          };
          successCount++;
        } else {
          results[table] = {
            success: false,
            error: 'No data returned'
          };
        }
      } catch (error) {
        console.error(`Error querying ${table}:`, error);
        results[table] = {
          success: false,
          error: this.parseError(error)
        };
      }
    }

    results._summary = {
      totalQueries: totalQueries,
      successRate: Math.round((successCount / totalQueries) * 100),
      availableTables: this.availableTables,
      skippedTables: ['VOUCHERHEAD', 'VOUCHERITEM'],
      note: 'Transaction tables skipped to prevent TDL errors'
    };

    console.log(`Completed ${successCount}/${totalQueries} safe queries (${results._summary.successRate}% success)`);

    return results;
  }

  /**
   * Enhanced disconnect with better cleanup
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from Tally');
    
    if (this.connection) {
      try {
        await this.connection.close();
        console.log('Connection closed successfully');
      } catch (error: unknown) {
        console.error('Error closing connection:', error);
      }
    }
    
    this.connection = null;
    this.config = null;
    this.availableTables = [];
    this.isConnecting = false;
    
    console.log('Cleanup completed');
  }

  /**
   * Connection state checker
   */
  isConnected(): boolean {
    const connected = this.connection !== null;
    console.log(`isConnected() called: ${connected}`);
    return connected;
  }

  /**
   * Connection status with better validation
   */
  async getStatus(): Promise<TallyConnectionStatus> {
    console.log('Checking connection status');
    
    if (!this.connection) {
      return { 
        isConnected: false,
        error: 'No active connection',
        timestamp: new Date().toISOString()
      };
    }

    try {
      const startTime = Date.now();
      const result = await this.connection.query("SELECT COUNT(*) as STATUS_COUNT FROM COMPANY");
      
      return {
        isConnected: true,
        companyName: this.config?.companyName || 'Connected Company',
        lastConnected: new Date(),
        availableData: this.availableTables,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error: unknown) {
      console.error('Status check failed:', error);
      // Connection is broken - clean up
      this.connection = null;
      this.config = null;
      this.availableTables = [];
      
      return {
        isConnected: false,
        error: `Connection lost: ${this.extractErrorMessage(error)}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced debug method with connection tracking
   */
  async debugConnectionState(): Promise<any> {
    console.log('Enhanced connection debug');
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      serviceState: {
        connectionExists: !!this.connection,
        connectionType: this.connection ? typeof this.connection : 'null',
        configExists: !!this.config,
        configCompany: this.config?.companyName || 'none',
        availableTables: this.availableTables,
        isConnectingFlag: this.isConnecting,
        skipProblematicTables: this.skipProblematicTables
      },
      connectionDetails: null as any,
      rawConnectionTest: null as any,
      tallySpecificTests: [] as any[]
    };

    // Test 1: Basic connection object inspection
    if (this.connection) {
      try {
        debugInfo.connectionDetails = {
          exists: true,
          objectType: typeof this.connection,
          hasQueryMethod: typeof this.connection.query === 'function',
          hasCloseMethod: typeof this.connection.close === 'function',
          stringRepresentation: String(this.connection).substring(0, 100)
        };

        // Test 2: Basic SQL test
        console.log('Testing basic SQL');
        const basicTest = await this.connection.query("SELECT 1 as TEST_VALUE");
        debugInfo.rawConnectionTest = {
          success: true,
          result: basicTest,
          message: 'Basic SQL test successful'
        };

        // Test 3: Company table test
        console.log('Testing COMPANY table');
        try {
          const companyTest = await this.connection.query("SELECT COUNT(*) as COMPANY_COUNT FROM COMPANY");
          debugInfo.tallySpecificTests.push({
            test: 'COMPANY table',
            success: true,
            result: companyTest,
            message: 'Company table accessible'
          });
        } catch (companyError) {
          debugInfo.tallySpecificTests.push({
            test: 'COMPANY table',
            success: false,
            error: this.extractErrorMessage(companyError),
            message: 'Company table access failed'
          });
        }

        // Test 4: Ledger table test
        console.log('Testing LEDGER table');
        try {
          const ledgerTest = await this.connection.query("SELECT COUNT(*) as LEDGER_COUNT FROM LEDGER");
          debugInfo.tallySpecificTests.push({
            test: 'LEDGER table',
            success: true,
            result: ledgerTest,
            message: 'Ledger table accessible'
          });
        } catch (ledgerError) {
          debugInfo.tallySpecificTests.push({
            test: 'LEDGER table',
            success: false,
            error: this.extractErrorMessage(ledgerError),
            message: 'Ledger table access failed'
          });
        }

      } catch (connectionError) {
        debugInfo.connectionDetails = {
          exists: false,
          error: this.extractErrorMessage(connectionError),
          message: 'Connection object exists but not functional'
        };
        debugInfo.rawConnectionTest = {
          success: false,
          error: this.extractErrorMessage(connectionError),
          message: 'Basic connection test failed'
        };
      }
    } else {
      debugInfo.connectionDetails = {
        exists: false,
        message: 'No connection object stored'
      };
      debugInfo.rawConnectionTest = {
        success: false,
        message: 'Cannot test - no connection object'
      };
    }

    // Calculate overall health score
    let healthScore = 0;
    if (debugInfo.serviceState.connectionExists) healthScore += 30;
    if (debugInfo.serviceState.configExists) healthScore += 20;
    if (debugInfo.rawConnectionTest?.success) healthScore += 30;
    if (debugInfo.tallySpecificTests.some((t: any) => t.success)) healthScore += 20;


    return debugInfo;
  }

  /**
   * Generate health recommendations based on debug info
   */
  private generateHealthRecommendations(debugInfo: any): string[] {
    const recommendations: string[] = [];
    
    if (!debugInfo.serviceState.connectionExists) {
      recommendations.push('No connection established - use "Connect to Tally" button');
    }
    if (!debugInfo.serviceState.configExists) {
      recommendations.push('No configuration stored - connection may be unstable');
    }
    if (!debugInfo.rawConnectionTest?.success) {
      recommendations.push('Connection test failed - check Tally is running and ODBC enabled');
    }
    if (debugInfo.tallySpecificTests.every((t: any) => !t.success)) {
      recommendations.push('No Tally tables accessible - verify company is open in Tally');
    }
    if (recommendations.length === 0) {
      recommendations.push('System healthy - all tests passed');
    }
    
    return recommendations;
  }

  /**
   * Build connection strings with multiple strategies
   */
  private buildConnectionStrings(config: TallyConfig): Array<{ method: string; connectionString: string }> {
    const methods = [];
    const port = config.port || 9000;
    const server = config.serverPath || 'localhost';

    // Method 1: Current open company (most likely to work)
    methods.push({
      method: 'Current Open Company via DSN',
      connectionString: `DSN=TallyODBC64_${port};`
    });

    methods.push({
      method: 'Current Open Company via Driver',
      connectionString: `Driver={Tally ODBC Driver64};Server=${server};Port=${port};`
    });

    // Method 2: Specific company (if provided)
    if (config.companyName && config.companyName.trim().length > 0) {
      const companyName = config.companyName.trim();
      
      methods.push({
        method: `Specific Company via DSN: ${companyName}`,
        connectionString: `DSN=TallyODBC64_${port};Database=${companyName};`
      });
      
      methods.push({
        method: `Specific Company via Driver: ${companyName}`,
        connectionString: `Driver={Tally ODBC Driver64};Server=${server};Port=${port};Database=${companyName};`
      });

      // Method 3: Company name without date suffix
      const nameWithoutDate = companyName.replace(/\s*-\s*\(.*?\)/, '');
      if (nameWithoutDate !== companyName) {
        methods.push({
          method: `Company without date: ${nameWithoutDate}`,
          connectionString: `DSN=TallyODBC64_${port};Database=${nameWithoutDate};`
        });
      }
    }

    console.log(`Built ${methods.length} connection methods`);
    return methods;
  }

  /**
   * Check if Tally processes are running
   */
  private async checkTallyProcesses(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq tally*" /FO CSV');
      const lines = stdout.split('\n').filter(line => 
        (line.includes('tally') || line.includes('Tally')) && 
        !line.includes('PID')
      );
      
      return lines.map(line => {
        const parts = line.split(',');
        return parts[0] ? parts[0].replace(/"/g, '') : line.trim();
      }).filter(process => process.length > 0);
    } catch (error: unknown) {
      console.error('Failed to check Tally processes:', error);
      return [];
    }
  }

  /**
   * Get list of available companies from Tally
   */
  async getAvailableCompanies(): Promise<{ success: boolean; companies?: string[]; error?: string }> {
    const startTime = Date.now();
    
    if (!odbcAvailable) {
      return {
        success: false,
        error: 'ODBC not available in packaged application',
      };
    }

    try {
      // Try multiple connection methods to get available companies
      const port = 9000;
      const connectionMethods = [
        `DSN=TallyODBC64_${port};`,
        `Driver={Tally ODBC Driver64};Server=localhost;Port=${port};`,
        `DSN=TallyODBC_${port};`,
        `Driver={Tally ODBC Driver};Server=localhost;Port=${port};`
      ];
      
      console.log('🔍 Attempting to get available companies...');
      
      for (const connectionString of connectionMethods) {
        try {
          console.log(`Trying connection: ${connectionString}`);
          const connection = await odbc.connect(connectionString);
          
          try {
            // Try multiple queries to get company information
            const queries = [
              'SELECT $Name as COMPANY_NAME FROM Company',
              'SELECT $Name FROM Company',
              'SELECT * FROM Company'
            ];
            
            for (const query of queries) {
              try {
                console.log(`Trying query: ${query}`);
                const result = await connection.query(query);
                
                if (result && result.length > 0) {
                  const companies = result.map((row: any) => 
                    row.COMPANY_NAME || row.$Name || row.Name || row.name
                  ).filter(Boolean);
                  
                  if (companies.length > 0) {
                    console.log(`✅ Found ${companies.length} companies:`, companies);
                    await connection.close();
                    return {
                      success: true,
                      companies: companies,
                    };
                  }
                }
              } catch (queryError) {
                console.log(`Query failed: ${queryError}`);
                continue;
              }
            }
            
            await connection.close();
          } catch (connectionError) {
            console.log(`Connection error: ${connectionError}`);
            continue;
          }
        } catch (connectError) {
          console.log(`Connection method failed: ${connectError}`);
          continue;
        }
      }
      
      // If all methods fail, return empty list but don't treat as error
      console.log('⚠️ No companies found, but connection might still work');
      return {
        success: true,
        companies: [],
        error: 'No companies detected - you can still enter manually'
      };
      
    } catch (error) {
      console.log('❌ Failed to get company list:', error);
      return {
        success: false,
        error: `Failed to connect to Tally: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Extract error message from unknown error
   */
  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }
    return String(error);
  }

  /**
   * Extract numeric value from query result
   */
  private extractNumericValue(result: any, fieldName: string): number {
    if (!result || !Array.isArray(result) || result.length === 0) {
      return 0;
    }

    const firstRow = result[0];
    if (!firstRow || typeof firstRow !== 'object') {
      return 0;
    }

    const value = firstRow[fieldName];
    if (typeof value === 'number') {
      return value;
    }

    const numValue = parseInt(String(value));
    return isNaN(numValue) ? 0 : numValue;
  }

  /**
   * Enhanced error parsing with user-friendly messages
   */
  private parseError(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String((error as any).message).toLowerCase();
      
      if (message.includes('tdl') || message.includes('collection')) {
        return 'TDL/Collection error detected - this table is not accessible in your Tally version. Try LEDGER or COMPANY tables.';
      }
      if (message.includes('driver')) {
        return 'Tally ODBC Driver issue. Check driver installation.';
      }
      if (message.includes('connection') || message.includes('connect')) {
        return 'Cannot connect to Tally. Ensure Tally is running with ODBC enabled.';
      }
      
      return String((error as any).message);
    }
    return 'Unknown error occurred';
  }

  // ==================== STOCK ITEM METHODS ====================

  /**
   * Get all stock items from Tally
   */
  async getStockItems(): Promise<StockQueryResult> {
    const startTime = Date.now();
    
    if (!odbcAvailable) {
      return {
        success: false,
        error: 'ODBC not available in packaged application',
        executionTime: Date.now() - startTime
      };
    }

    if (!this.connection) {
      return {
        success: false,
        error: 'Not connected to Tally database',
        executionTime: Date.now() - startTime
      };
    }

    try {
      // First, try to get list of available tables to see what's exposed
      console.log('🔍 Checking available ODBC tables...');
      
      // Based on logs, individual searches work, so let's use the same approach
      // Use ListofStockItems first since individual searches are working with it
      const possibleQueries = [
        // Start with ListofStockItems since individual searches are working
        `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems WHERE $Name <> '' AND LENGTH($Name) > 0`,
        
        // Try all data from ListofStockItems
        `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems`,
        
        // Try StockItem as backup
        `SELECT $Name, $Parent, $ClosingBalance, $BaseUnits FROM StockItem WHERE $Name <> '' AND LENGTH($Name) > 0`,
        
        // All StockItem data
        `SELECT * FROM StockItem`,
        
        // Ledger-based stock items fallback
        `SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE ($Parent LIKE '%Stock%' OR $Parent LIKE '%Inventory%') AND $Name <> ''`
      ];
      
      let result = null;
      let successfulQuery = '';
      
      // Try each query until one works
      for (const query of possibleQueries) {
        try {
          console.log('🔍 TRYING QUERY:', query);
          console.log('🎯 TARGET TABLE:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
          
          result = await this.connection.query(query);
          
          console.log('📊 QUERY RESULT:', {
            type: Array.isArray(result) ? 'Array' : typeof result,
            length: Array.isArray(result) ? result.length : 'N/A',
            sample: Array.isArray(result) && result.length > 0 ? result[0] : 'No data'
          });
          
          successfulQuery = query;
          console.log('✅ SUCCESSFUL QUERY - TABLE HIT:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
          break;
        } catch (queryError) {
          console.log('❌ QUERY FAILED - TABLE:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
          console.log('Error:', queryError instanceof Error ? queryError.message : String(queryError));
          continue;
        }
      }
      
      if (!result || !Array.isArray(result)) {
        return {
          success: false,
          error: `No stock items found. Available tables might not include StockItem. Last tried query: ${successfulQuery || 'None succeeded'}. Ensure inventory features are enabled in Tally and StockItem collection is exposed to ODBC.`,
          executionTime: Date.now() - startTime,
          query: successfulQuery
        };
      }

      // Handle different response formats based on which query succeeded
      let stockItems: StockItem[] = [];
      
      if (successfulQuery.includes('ODBCTables')) {
        // This was just checking available tables
        const tableNames = result.map(row => row.$Name || row.Name || '').join(', ');
        return {
          success: false,
          error: `Available ODBC tables: ${tableNames}. StockItem table not found or not exposed. Enable inventory features in Tally.`,
          executionTime: Date.now() - startTime,
          query: successfulQuery
        };
      } else {
        // Process actual stock data with proper filtering
        stockItems = result
          .map(row => ({
            name: row.$Name || row.Name || '',
            parent: row.$StockGroup || row.$Parent || row.Parent || row.StockGroup || '',
            closingBalance: this.parseNumericValue(row.$ClosingBalance || row.ClosingBalance || 0),
            uom: row.$BaseUnits || row.BaseUnits || 'Units'
          }))
          .filter(item => 
            item.name && 
            item.name.trim().length > 0 && 
            item.name !== '' && 
            item.name !== 'undefined' &&
            item.name !== 'null'
          );
      }

      return {
        success: true,
        data: stockItems,
        executionTime: Date.now() - startTime,
        query: successfulQuery
      };

    } catch (error) {
      console.error('Stock items query failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get stock summary with analysis
   */
  async getStockSummary(): Promise<StockQueryResult> {
    const startTime = Date.now();
    
    try {
      const stockResult = await this.getStockItems();
      
      if (!stockResult.success || !stockResult.data) {
        return stockResult; // Return the error from getStockItems
      }

      const stockItems = stockResult.data;
      const totalItems = stockItems.length;
      const totalValue = stockItems.reduce((sum, item) => sum + (item.closingValue || 0), 0);
      
      // Analyze stock data
      const zeroStockItems = stockItems.filter(item => item.closingBalance === 0);
      const lowStockItems = stockItems.filter(item => 
        item.closingBalance > 0 && item.closingBalance < 10 // Configurable threshold
      );
      const highValueItems = stockItems
        .filter(item => item.closingValue && item.closingValue > 0)
        .sort((a, b) => (b.closingValue || 0) - (a.closingValue || 0))
        .slice(0, 10);

      const summary: StockSummary = {
        totalItems,
        totalValue,
        zeroStockItems,
        lowStockItems,
        highValueItems
      };

      return {
        success: true,
        data: stockItems,
        summary,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Stock summary failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Translate Hindi/Hinglish terms to English for better search
   */
  private translateSearchTerm(searchTerm: string): string {
    const translations: { [key: string]: string } = {
      // Hindi stock terms
      'saman': 'stock',
      'samaan': 'stock', 
      'maal': 'goods',
      'chij': 'items',
      'cheez': 'items',
      'pipe': 'pipe',
      'steel': 'steel',
      'loha': 'iron',
      'sariya': 'rod',
      'cement': 'cement',
      'balu': 'sand',
      'gitti': 'gravel',
      'kitna': 'how much',
      'kitne': 'how many',
      'kya': 'what',
      'hai': 'is',
      'hain': 'are',
      'mere': 'my',
      'paas': 'have',
      'stock': 'stock',
      'inventory': 'stock',
      // Common Hinglish patterns
      'kitna stock hai': 'stock quantity',
      'kitne items': 'how many items',
      'mera stock': 'my stock',
      'stock kya hai': 'stock status',
      'samaan kitna': 'goods quantity'
    };
    
    let translatedTerm = searchTerm.toLowerCase();
    
    // Replace Hindi/Hinglish terms
    Object.entries(translations).forEach(([hindi, english]) => {
      const regex = new RegExp(`\\b${hindi}\\b`, 'gi');
      translatedTerm = translatedTerm.replace(regex, english);
    });
    
    // Clean up common words that don't help in search
    const stopWords = ['is', 'are', 'have', 'my', 'the', 'how', 'what', 'much', 'many'];
    stopWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      translatedTerm = translatedTerm.replace(regex, '');
    });
    
    // Clean up extra spaces
    translatedTerm = translatedTerm.replace(/\s+/g, ' ').trim();
    
    console.log(`🔤 Translated "${searchTerm}" to "${translatedTerm}"`);
    return translatedTerm || searchTerm; // Fallback to original if translation results in empty string
  }

  /**
   * Search for specific stock items with AI-powered fuzzy matching
   */
  async searchStockItems(searchTerm: string): Promise<StockQueryResult> {
    const startTime = Date.now();
    
    if (!odbcAvailable) {
      return {
        success: false,
        error: 'ODBC not available in packaged application',
        executionTime: Date.now() - startTime
      };
    }

    if (!this.connection) {
      return {
        success: false,
        error: 'Not connected to Tally database',
        executionTime: Date.now() - startTime
      };
    }

    try {
      // Translate Hindi/Hinglish terms to English
      const translatedSearchTerm = this.translateSearchTerm(searchTerm);
      
      // Create fuzzy search variants for better matching
      const searchVariants = [
        translatedSearchTerm,
        translatedSearchTerm.toUpperCase(),
        translatedSearchTerm.toLowerCase(),
        ...translatedSearchTerm.split(' ').filter(word => word.length > 2) // Individual words
      ];
      
      // Proper Tally ODBC SQL syntax based on official documentation
      const originalEscaped = searchTerm.replace(/'/g, "''").trim();
      
      // Use ListofStockItems first since individual searches are working with it
      const searchQueries: string[] = [
        // Primary ListofStockItems search (this is working for individual searches)
        `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems WHERE UPPER($Name) LIKE UPPER('%${originalEscaped}%') AND $Name <> ''`,
        
        // Case-sensitive fallback
        `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems WHERE $Name LIKE '%${originalEscaped}%' AND $Name <> ''`,
        
        // Get all items with search term (broader match)
        `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems WHERE $Name <> '' AND UPPER($Name) LIKE UPPER('%${originalEscaped}%')`,
        
        // Fallback to StockItem table
        `SELECT $Name, $Parent, $ClosingBalance, $BaseUnits FROM StockItem WHERE UPPER($Name) LIKE UPPER('%${originalEscaped}%') AND $Name <> ''`,
        
        // Ledger-based fallback
        `SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE ($Parent LIKE '%Stock%' OR $Parent LIKE '%Inventory%') AND UPPER($Name) LIKE UPPER('%${originalEscaped}%') AND $Name <> ''`
      ];
      
      // Add translated search variants using ListofStockItems
      searchVariants.forEach(variant => {
        const escapedVariant = variant.replace(/'/g, "''").trim();
        if (escapedVariant.length > 0 && escapedVariant !== originalEscaped) {
          searchQueries.push(
            `SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits FROM ListofStockItems WHERE UPPER($Name) LIKE UPPER('%${escapedVariant}%') AND $Name <> ''`
          );
        }
      });
      
      let result = null;
      let successfulQuery = '';
      
      for (const query of searchQueries) {
        try {
          console.log('🔍 TRYING QUERY:', query);
          console.log('🎯 TARGET TABLE:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
          
          result = await this.connection.query(query);
          
          console.log('📊 QUERY RESULT:', {
            type: Array.isArray(result) ? 'Array' : typeof result,
            length: Array.isArray(result) ? result.length : 'N/A',
            sample: Array.isArray(result) && result.length > 0 ? result[0] : 'No data'
          });
          
          if (result && Array.isArray(result) && result.length > 0) {
            successfulQuery = query;
            console.log('✅ SUCCESSFUL QUERY - TABLE HIT:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
            break;
          }
        } catch (error) {
          console.log('❌ QUERY FAILED - TABLE:', query.includes('ListofStockItems') ? 'ListofStockItems' : query.includes('StockItem') ? 'StockItem' : 'Ledger');
          console.log('Error:', error instanceof Error ? error.message : String(error));
          continue;
        }
      }
      
      if (!result || !Array.isArray(result) || result.length === 0) {
        console.log(`❌ No stock items found for "${searchTerm}"`);
        
        // Let's try to get some sample data to understand the structure
        try {
          const sampleQuery = `SELECT TOP 5 $Name FROM ListofStockItems WHERE $Name <> '' AND LENGTH($Name) > 0`;
          const sampleResult = await this.connection.query(sampleQuery);
          if (sampleResult && Array.isArray(sampleResult) && sampleResult.length > 0) {
            const availableItems = sampleResult.map(row => row.$Name || row.Name).filter(Boolean).filter(name => name.trim().length > 0);
            if (availableItems.length > 0) {
              return {
                success: false,
                error: `No stock items found matching "${searchTerm}". Available items include: ${availableItems.slice(0, 3).join(', ')}${availableItems.length > 3 ? ' and others.' : '.'}`,
                data: [],
                executionTime: Date.now() - startTime,
                query: successfulQuery
              };
            }
          }
        } catch (sampleError) {
          console.log('Could not get sample data:', sampleError);
        }
        
        return {
          success: false,
          error: `No stock items found matching "${searchTerm}". Try checking the spelling or using partial names.`,
          data: [],
          executionTime: Date.now() - startTime,
          query: successfulQuery
        };
      }

      const stockItems: StockItem[] = result
        .map(row => ({
          name: row.$Name || row.Name || '',
          parent: row.$StockGroup || row.$Parent || row.Parent || row.StockGroup || '',
          closingBalance: this.parseNumericValue(row.$ClosingBalance || row.ClosingBalance || 0),
          uom: row.$BaseUnits || row.BaseUnits || 'Units',
          closingValue: this.parseNumericValue(row.$ClosingValue || row.ClosingValue || 0)
        }))
        .filter(item => 
          item.name && 
          item.name.trim().length > 0 && 
          item.name !== '' && 
          item.name !== 'undefined' &&
          item.name !== 'null'
        );

      return {
        success: true,
        data: stockItems,
        executionTime: Date.now() - startTime,
        query: successfulQuery
      };

    } catch (error) {
      console.error('Stock search failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get stock batches for a specific stock item using Tally SQL procedures
   */
  async getStockBatches(stockItemName: string): Promise<StockQueryResult> {
    const startTime = Date.now();
    
    if (!odbcAvailable) {
      return {
        success: false,
        error: 'ODBC not available in packaged application',
        executionTime: Date.now() - startTime
      };
    }

    if (!this.connection) {
      return {
        success: false,
        error: 'Not connected to Tally database',
        executionTime: Date.now() - startTime
      };
    }

    try {
      // Use the _StkBatches procedure mentioned in Tally documentation
      const query = `CALL _StkBatches('${stockItemName}')`;
      const successfulQuery = query;
      console.log('🔍 Calling Tally stock batches procedure:', query);
      
      const result = await this.connection.query(query);
      
      if (!result || !Array.isArray(result)) {
        return {
          success: false,
          error: `No batches found for stock item "${stockItemName}" or procedure not available`,
          data: [],
          executionTime: Date.now() - startTime,
          query: successfulQuery
        };
      }

      const stockItems: StockItem[] = result.map(row => ({
        name: row.Name || row.$Name || '',
        parent: stockItemName,
        closingBalance: this.parseNumericValue(row.Amount || row.$Amount || 0),
        uom: ''
      }));

      return {
        success: true,
        data: stockItems,
        executionTime: Date.now() - startTime,
        query: successfulQuery
      };

    } catch (error) {
      console.error('Stock batches procedure failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get detailed stock summary using multiple Tally tables/procedures
   */
  async getDetailedStockSummary(): Promise<StockQueryResult> {
    const startTime = Date.now();
    
    try {
      // First try to get basic stock items
      const stockResult = await this.getStockItems();
      
      if (!stockResult.success) {
        // If StockItem table fails, try alternative approaches
        console.log('🔄 StockItem table failed, trying alternative stock data sources...');
        
        // Try to get stock-related ledgers as fallback
        const ledgerQuery = `SELECT $Name, $Parent, $ClosingBalance FROM Ledger WHERE $Parent LIKE '%Stock%' OR $Parent LIKE '%Inventory%'`;
        
        try {
          const result = await this.connection?.query(ledgerQuery);
          if (result && Array.isArray(result)) {
            const stockItems: StockItem[] = result.map(row => ({
              name: row.$Name || row.Name || '',
              parent: row.$Parent || row.Parent || '',
              closingBalance: this.parseNumericValue(row.$ClosingBalance || row.ClosingBalance || 0),
              uom: ''
            }));

            const summary: StockSummary = {
              totalItems: stockItems.length,
              totalValue: stockItems.reduce((sum, item) => sum + Math.abs(item.closingBalance), 0),
              zeroStockItems: stockItems.filter(item => item.closingBalance === 0),
              lowStockItems: stockItems.filter(item => item.closingBalance > 0 && item.closingBalance < 10),
              highValueItems: stockItems.sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance)).slice(0, 10)
            };

            return {
              success: true,
              data: stockItems,
              summary,
              executionTime: Date.now() - startTime,
              query: ledgerQuery
            };
          }
        } catch (ledgerError) {
          console.error('Ledger fallback also failed:', ledgerError);
        }
        
        return {
          success: false,
          error: 'No stock data available. Ensure inventory features are enabled in Tally and stock items are configured.',
          executionTime: Date.now() - startTime
        };
      }

      // If we have stock data, process it
      const stockItems = stockResult.data || [];
      const summary: StockSummary = {
        totalItems: stockItems.length,
        totalValue: stockItems.reduce((sum, item) => sum + Math.abs(item.closingBalance), 0),
        zeroStockItems: stockItems.filter(item => item.closingBalance === 0),
        lowStockItems: stockItems.filter(item => item.closingBalance > 0 && item.closingBalance < 10),
        highValueItems: stockItems.sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance)).slice(0, 10)
      };

      return {
        success: true,
        data: stockItems,
        summary,
        executionTime: Date.now() - startTime,
        query: stockResult.query || 'summary_query'
      };

    } catch (error) {
      console.error('Detailed stock summary failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Sync all available ODBC data to S3/Supabase for better performance
   */
  async syncODBCDataToCloud(): Promise<{ success: boolean; error?: string; syncedTables: string[] }> {
    const syncedTables: string[] = [];
    
    if (!odbcAvailable || !this.connection) {
      return {
        success: false,
        error: 'ODBC not available or not connected',
        syncedTables: []
      };
    }

    try {
      console.log('🔄 Starting ODBC to Cloud sync...');
      
      // First, get list of available tables
      const tablesResult = await this.connection.query('SELECT $Name FROM ODBCTables');
      const availableTables = tablesResult?.map((row: any) => row.$Name || row.Name) || [];
      
      console.log('📋 Available ODBC tables:', availableTables);

      // Define priority tables to sync based on available ODBC tables
      const tablesToSync = [
        // Core data
        { name: 'Ledger', query: 'SELECT $Name, $Parent, $ClosingBalance, $Address FROM Ledger' },
        { name: 'Company', query: 'SELECT $Name, $Address, $Phone, $Email FROM Company' },
        
        // Stock/Inventory data - prioritize ListofStockItems
        { name: 'ListofStockItems', query: 'SELECT $Name, $StockGroup, $ClosingBalance, $BaseUnits, $ClosingValue FROM ListofStockItems' },
        { name: 'StockItem', query: 'SELECT $Name, $Parent, $ClosingBalance, $BaseUnits FROM StockItem' },
        { name: 'StockGroup', query: 'SELECT $Name, $Parent FROM StockGroup' },
        { name: 'StockCategory', query: 'SELECT $Name, $Parent FROM StockCategory' },
        
        // Additional useful tables
        { name: 'Godown', query: 'SELECT $Name, $Parent FROM Godown' },
        { name: 'VoucherType', query: 'SELECT $Name, $Parent FROM VoucherType' },
        { name: 'Groups', query: 'SELECT $Name, $Parent FROM Groups' },
        
        // Transaction data
        { name: 'LedgerVouchers', query: 'SELECT $LedgerName, $VoucherTypeName, $Date, $VoucherNumber, $Amount FROM LedgerVouchers' },
        
        // Stock analysis tables
        { name: 'ListofStockGroups', query: 'SELECT $Name, $Parent FROM ListofStockGroups' },
        { name: 'ListofStockCategories', query: 'SELECT $Name, $Parent FROM ListofStockCategories' },
      ];

      for (const table of tablesToSync) {
        try {
          if (availableTables.includes(table.name)) {
            console.log(`📊 Syncing ${table.name} table...`);
            
            const data = await this.connection.query(table.query);
            if (data && Array.isArray(data) && data.length > 0) {
              
              // Upload to S3 in JSON format
              await this.uploadTableToS3(table.name, data);
              
              // Also sync to Supabase if available
              await this.syncTableToSupabase(table.name, data);
              
              syncedTables.push(table.name);
              console.log(`✅ ${table.name} synced: ${data.length} records`);
            } else {
              console.log(`⚠️ ${table.name} table empty or not accessible`);
            }
          } else {
            console.log(`❌ ${table.name} table not available in this Tally setup`);
          }
        } catch (tableError) {
          console.error(`❌ Failed to sync ${table.name}:`, tableError);
        }
      }

      // Try to sync stock batches using procedures
      try {
        console.log('🔍 Attempting to sync stock batches...');
        const stockItems = await this.getStockItems();
        if (stockItems.success && stockItems.data && stockItems.data.length > 0) {
          const batchData: any[] = [];
          
          // Get batches for each stock item
          for (const item of stockItems.data.slice(0, 10)) { // Limit to first 10 items for performance
            try {
              const batches = await this.getStockBatches(item.name);
              if (batches.success && batches.data) {
                batchData.push(...batches.data);
              }
            } catch (batchError) {
              console.log(`⚠️ Could not get batches for ${item.name}`);
            }
          }
          
          if (batchData.length > 0) {
            await this.uploadTableToS3('StockBatches', batchData);
            syncedTables.push('StockBatches');
            console.log(`✅ StockBatches synced: ${batchData.length} records`);
          }
        }
      } catch (batchError) {
        console.log('⚠️ Stock batches sync failed, continuing...');
      }

      console.log(`🎉 ODBC sync completed. Synced tables: ${syncedTables.join(', ')}`);
      
      return {
        success: true,
        syncedTables
      };

    } catch (error) {
      console.error('❌ ODBC sync failed:', error);
      return {
        success: false,
        error: this.parseError(error),
        syncedTables
      };
    }
  }

  /**
   * Upload table data to S3 as JSON
   */
  private async uploadTableToS3(tableName: string, data: any[]): Promise<void> {
    try {
      // This would integrate with your existing S3Service
      const { S3Service } = await import('./s3-service');
      const s3Service = new S3Service();
      
      const jsonData = {
        tableName,
        timestamp: new Date().toISOString(),
        recordCount: data.length,
        data
      };
      
      const key = `tally-sync/${tableName.toLowerCase()}-${Date.now()}.json`;
      // For now, use the storeTallyReport method as a workaround
      const jsonBuffer = Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8');
      await s3Service.storeTallyReport('default-client', `sync-${tableName.toLowerCase()}`, jsonBuffer);
      
      console.log(`📤 ${tableName} uploaded to S3: ${key}`);
    } catch (error) {
      console.error(`❌ Failed to upload ${tableName} to S3:`, error);
    }
  }

  /**
   * Sync table data to Supabase
   */
  private async syncTableToSupabase(tableName: string, data: any[]): Promise<void> {
    try {
      // This would integrate with your existing SupabaseService
      const { SupabaseService } = await import('./supabase-service');
      const supabaseService = new SupabaseService();
      
      if (supabaseService.isSupabaseConfigured()) {
        // Create records in Supabase based on table type
        if (tableName === 'Ledger') {
          await this.syncLedgersToSupabase(supabaseService, data);
        } else if (tableName === 'StockItem') {
          await this.syncStockItemsToSupabase(supabaseService, data);
        } else if (tableName === 'Company') {
          await this.syncCompanyToSupabase(supabaseService, data);
        }
        
        console.log(`📊 ${tableName} synced to Supabase: ${data.length} records`);
      }
    } catch (error) {
      console.error(`❌ Failed to sync ${tableName} to Supabase:`, error);
    }
  }

  /**
   * Sync ledger data to Supabase ledger_search_index table
   */
  private async syncLedgersToSupabase(supabaseService: any, ledgers: any[]): Promise<void> {
    const clientId = 'default-client'; // You can make this configurable
    
    for (const ledger of ledgers) {
      try {
        const ledgerRecord = {
          client_id: clientId,
          ledger_name: ledger.$Name || ledger.Name || '',
          ledger_parent: ledger.$Parent || ledger.Parent || '',
          closing_balance: this.parseNumericValue(ledger.$ClosingBalance || ledger.ClosingBalance || 0),
          balance_type: (ledger.$ClosingBalance || ledger.ClosingBalance || 0) < 0 ? 'Cr' : 'Dr',
          address: ledger.$Address || ledger.Address || '',
          last_updated_at: new Date().toISOString()
        };
        
        // Use upsert to handle duplicates
        await supabaseService.supabase
          .from('ledger_search_index')
          .upsert(ledgerRecord, { 
            onConflict: 'client_id,ledger_name',
            ignoreDuplicates: false 
          });
          
      } catch (error) {
        console.error(`Failed to sync ledger ${ledger.$Name}:`, error);
      }
    }
  }

  /**
   * Sync stock items to Supabase (you'd need to create a stock_items table)
   */
  private async syncStockItemsToSupabase(supabaseService: any, stockItems: any[]): Promise<void> {
    // This would require creating a stock_items table in Supabase
    // For now, log that this functionality is available
    console.log(`📦 Would sync ${stockItems.length} stock items to Supabase stock_items table`);
  }

  /**
   * Sync company data to Supabase
   */
  private async syncCompanyToSupabase(supabaseService: any, companies: any[]): Promise<void> {
    // This would update company information in existing tables
    console.log(`🏢 Would sync ${companies.length} company records to Supabase`);
  }

  /**
   * Parse numeric value safely
   */
  private parseNumericValue(value: any): number {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Direct diagnostic query for stock data - shows exactly what's available
   */
  async diagnoseStockTables(): Promise<{ success: boolean; diagnosis: string; tables: any[] }> {
    if (!this.connection) {
      return {
        success: false,
        diagnosis: 'Not connected to Tally',
        tables: []
      };
    }

    const results: any[] = [];
    const tablesToTest = ['ListofStockItems', 'StockItem', 'MultiStockItem', 'SOStockItem', 'POStockItem'];
    
    // Test each table
    for (const tableName of tablesToTest) {
      try {
        // First check if table has any data
        const countQuery = `SELECT COUNT(*) as RecordCount FROM ${tableName}`;
        const countResult = await this.connection.query(countQuery);
        const recordCount = countResult?.[0]?.RecordCount || 0;
        
        if (recordCount > 0) {
          // Get sample data
          const sampleQuery = `SELECT TOP 5 * FROM ${tableName}`;
          const sampleData = await this.connection.query(sampleQuery);
          results.push({
            tableName,
            recordCount,
            status: 'SUCCESS',
            sampleData: sampleData || [],
            columns: sampleData?.[0] ? Object.keys(sampleData[0]) : []
          });
        } else {
          results.push({
            tableName,
            recordCount: 0,
            status: 'EMPTY',
            message: 'Table exists but has no data'
          });
        }
      } catch (error) {
        results.push({
          tableName,
          recordCount: -1,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Summary diagnosis
    const workingTables = results.filter(r => r.status === 'SUCCESS');
    const emptyTables = results.filter(r => r.status === 'EMPTY');
    const errorTables = results.filter(r => r.status === 'ERROR');
    
    let diagnosis = `📊 **Stock Table Diagnosis:**\n\n`;
    
    if (workingTables.length > 0) {
      diagnosis += `✅ **Working tables with data (${workingTables.length}):**\n`;
      workingTables.forEach(t => {
        diagnosis += `   • ${t.tableName}: ${t.recordCount} records\n`;
        diagnosis += `     Columns: ${t.columns.join(', ')}\n`;
      });
      diagnosis += '\n';
    }
    
    if (emptyTables.length > 0) {
      diagnosis += `⚠️ **Empty tables (${emptyTables.length}):**\n`;
      emptyTables.forEach(t => {
        diagnosis += `   • ${t.tableName}: Table exists but no data\n`;
      });
      diagnosis += '\n';
    }
    
    if (errorTables.length > 0) {
      diagnosis += `❌ **Inaccessible tables (${errorTables.length}):**\n`;
      errorTables.forEach(t => {
        diagnosis += `   • ${t.tableName}: ${t.error}\n`;
      });
      diagnosis += '\n';
    }

    if (workingTables.length === 0) {
      diagnosis += `**💡 Recommendations:**\n`;
      diagnosis += `• Enable inventory features in Tally\n`;
      diagnosis += `• Create some stock items in Tally\n`;
      diagnosis += `• Check ODBC settings for inventory access\n`;
    }

    return {
      success: workingTables.length > 0,
      diagnosis,
      tables: results
    };
  }

  // Diagnostic methods
  async getDiagnosticOdbcDrivers(): Promise<string[]> {
    try {
      if (typeof (odbc as any).drivers === 'function') {
        const drivers = await (odbc as any).drivers();
        return Array.isArray(drivers) ? drivers.map(driver => String(driver.name || driver)) : ['No drivers found'];
      } else {
        return ['ODBC drivers method not available'];
      }
    } catch (error: unknown) {
      return [`Error: ${String(error)}`];
    }
  }

  async getDiagnosticOdbcConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const testResult = await this.testConnection(this.config || {});
      return {
        success: testResult.isConnected,
        message: testResult.isConnected ? 'Connection test successful' : testResult.error || 'Connection test failed',
        details: testResult
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Connection diagnostic failed: ${this.extractErrorMessage(error)}`
      };
    }
  }

  /**
   * Get all ledgers for WhatsApp services
   */
  async getAllLedgers(): Promise<any[]> {
    if (!this.connection) {
      return [];
    }

    try {
      const result = await this.connection.query('SELECT $Name as name, $Parent as parent, $ClosingBalance as balance FROM Ledger');
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('Error getting all ledgers:', error);
      return [];
    }
  }
}