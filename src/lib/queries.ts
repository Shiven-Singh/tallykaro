// src/lib/queries.ts - Fixed Tally ODBC Query Library with proper $Method syntax

export interface QueryDefinition {
  id: string;
  name: string;
  description: string;
  sql: string;
  category: 'financial' | 'operational' | 'compliance' | 'diagnostic';
  difficulty: 'safe' | 'moderate' | 'advanced';
  expectedColumns?: string[];
}

export const tallyQueries: QueryDefinition[] = [
  // DIAGNOSTIC QUERIES (Always work)
  {
    id: 'connection_test',
    name: 'Connection Test',
    description: 'Test basic database connectivity',
    sql: 'SELECT 1 as CONNECTION_STATUS',
    category: 'diagnostic',
    difficulty: 'safe'
  },
  
  // COMPANY INFORMATION (Using Tally $Method syntax)
  {
    id: 'company_info',
    name: 'Company Information',
    description: 'Basic company details',
    sql: 'SELECT $Name as COMPANY_NAME, $Address as COMPANY_ADDRESS FROM Company',
    category: 'operational',
    difficulty: 'safe',
    expectedColumns: ['COMPANY_NAME', 'COMPANY_ADDRESS']
  },

  // LEDGER QUERIES (Core accounting data - using $Method syntax)
  {
    id: 'ledger_count',
    name: 'Total Accounts',
    description: 'Count of all ledger accounts',
    sql: 'SELECT COUNT($Name) as TOTAL_ACCOUNTS FROM Ledger',
    category: 'operational',
    difficulty: 'safe',
    expectedColumns: ['TOTAL_ACCOUNTS']
  },

  {
    id: 'all_ledgers',
    name: 'All Ledger Accounts',
    description: 'Complete chart of accounts',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as ACCOUNT_GROUP, $ClosingBalance as BALANCE FROM Ledger ORDER BY $Name',
    category: 'operational',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'ACCOUNT_GROUP', 'BALANCE']
  },

  {
    id: 'account_groups',
    name: 'Account Groups',
    description: 'All account categories',
    sql: 'SELECT DISTINCT $Parent as ACCOUNT_GROUP FROM Ledger WHERE $Parent IS NOT NULL ORDER BY $Parent',
    category: 'operational',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_GROUP']
  },

  {
    id: 'debit_balances',
    name: 'Debit Balances',
    description: 'Accounts with debit balances',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as ACCOUNT_GROUP, $ClosingBalance as BALANCE FROM Ledger WHERE $$IsDr:$ClosingBalance ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'ACCOUNT_GROUP', 'BALANCE']
  },

  {
    id: 'credit_balances',
    name: 'Credit Balances',
    description: 'Accounts with credit balances',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as ACCOUNT_GROUP, $ClosingBalance as BALANCE FROM Ledger WHERE $$IsCr:$ClosingBalance ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'ACCOUNT_GROUP', 'BALANCE']
  },

  {
    id: 'cash_accounts',
    name: 'Cash and Bank Accounts',
    description: 'All cash and bank account balances',
    sql: 'SELECT $Name as ACCOUNT_NAME, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent = \'Cash-in-Hand\' OR $Parent = \'Bank Accounts\' ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'BALANCE']
  },

  // BALANCE SHEET QUERIES (Using Tally syntax)
  {
    id: 'assets_accounts',
    name: 'Asset Accounts',
    description: 'All asset accounts',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as ASSET_TYPE, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent IN (\'Current Assets\', \'Fixed Assets\', \'Investments\') ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'ASSET_TYPE', 'BALANCE']
  },

  {
    id: 'liability_accounts',
    name: 'Liability Accounts',
    description: 'All liability accounts',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as LIABILITY_TYPE, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent IN (\'Current Liabilities\', \'Capital Account\', \'Loans (Liability)\') ORDER BY $ClosingBalance',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'LIABILITY_TYPE', 'BALANCE']
  },

  // PROFIT & LOSS QUERIES (Using Tally syntax)
  {
    id: 'income_accounts',
    name: 'Income Accounts',
    description: 'All income accounts',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as INCOME_TYPE, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent IN (\'Sales Accounts\', \'Direct Incomes\', \'Indirect Incomes\') ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'INCOME_TYPE', 'BALANCE']
  },

  {
    id: 'expense_accounts',
    name: 'Expense Accounts',
    description: 'All expense accounts',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as EXPENSE_TYPE, $ClosingBalance as BALANCE FROM Ledger WHERE $Parent IN (\'Purchase Accounts\', \'Direct Expenses\', \'Indirect Expenses\') ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'EXPENSE_TYPE', 'BALANCE']
  },

  // RECEIVABLES & PAYABLES (Using Tally syntax)
  {
    id: 'receivables',
    name: 'Accounts Receivable',
    description: 'Money owed to the company',
    sql: 'SELECT $Name as CUSTOMER_NAME, $ClosingBalance as AMOUNT_DUE FROM Ledger WHERE $Parent = \'Sundry Debtors\' AND $$IsDr:$ClosingBalance ORDER BY $ClosingBalance DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['CUSTOMER_NAME', 'AMOUNT_DUE']
  },

  {
    id: 'payables',
    name: 'Accounts Payable',
    description: 'Money owed by the company',
    sql: 'SELECT $Name as SUPPLIER_NAME, $ClosingBalance as AMOUNT_OWED FROM Ledger WHERE $Parent = \'Sundry Creditors\' AND $$IsCr:$ClosingBalance ORDER BY $ClosingBalance',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['SUPPLIER_NAME', 'AMOUNT_OWED']
  },

  // DISCOVERY QUERIES (Essential for understanding Tally structure)
  {
    id: 'discover_methods',
    name: 'Discover Available Methods',
    description: 'See all available methods/fields for Ledger',
    sql: 'SELECT * FROM Ledger',
    category: 'diagnostic',
    difficulty: 'safe'
  },

  {
    id: 'available_tables',
    name: 'Available Tables',
    description: 'List all available ODBC tables',
    sql: 'SELECT $Name FROM ODBCTables ORDER BY $Name',
    category: 'diagnostic',
    difficulty: 'moderate',
    expectedColumns: ['Name']
  },

  // SAFE TEST QUERIES (Start with these)
  {
    id: 'ledger_sample',
    name: 'Sample Ledger Data',
    description: 'First 10 ledger entries to test data access',
    sql: 'SELECT TOP 10 $Name as ACCOUNT_NAME, $Parent as GROUP_NAME FROM Ledger',
    category: 'diagnostic',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'GROUP_NAME']
  },

  {
    id: 'company_sample',
    name: 'Company Details',
    description: 'Basic company information',
    sql: 'SELECT $Name as COMPANY_NAME FROM Company',
    category: 'diagnostic',
    difficulty: 'safe',
    expectedColumns: ['COMPANY_NAME']
  },

  // ADVANCED QUERIES (May not work in all versions - avoided VOUCHERHEAD)
  {
    id: 'ledger_with_balances',
    name: 'Accounts with Non-Zero Balances',
    description: 'All accounts that have balances',
    sql: 'SELECT $Name as ACCOUNT_NAME, $Parent as ACCOUNT_GROUP, $ClosingBalance as BALANCE FROM Ledger WHERE $ClosingBalance <> 0 ORDER BY ABS($ClosingBalance) DESC',
    category: 'financial',
    difficulty: 'safe',
    expectedColumns: ['ACCOUNT_NAME', 'ACCOUNT_GROUP', 'BALANCE']
  },

  // STOCK QUERIES (Use with caution - may not work in educational versions)
  {
    id: 'stock_items',
    name: 'Stock Items',
    description: 'Inventory items (may not work in all versions)',
    sql: 'SELECT $Name as ITEM_NAME, $Parent as ITEM_GROUP FROM StockItem',
    category: 'operational',
    difficulty: 'advanced',
    expectedColumns: ['ITEM_NAME', 'ITEM_GROUP']
  }
];

// Quick access to queries by category
export const getQueriesByCategory = (category: QueryDefinition['category']) => {
  return tallyQueries.filter(query => query.category === category);
};

// Quick access to queries by difficulty
export const getQueriesByDifficulty = (difficulty: QueryDefinition['difficulty']) => {
  return tallyQueries.filter(query => query.difficulty === difficulty);
};

// Get safe queries only (most likely to work)
export const getSafeQueries = () => {
  return tallyQueries.filter(query => query.difficulty === 'safe');
};

// Get query by ID
export const getQueryById = (id: string) => {
  return tallyQueries.find(query => query.id === id);
};

// UPDATED: Suggested query order for first-time users (start with these!)
export const getRecommendedQueries = () => {
  return [
    'connection_test',        // Always works
    'company_sample',         // Test basic Tally access
    'ledger_sample',         // Test ledger access
    'company_info',          // Full company info
    'ledger_count',          // Count of accounts
    'all_ledgers'            // Full chart of accounts
  ].map(id => getQueryById(id)).filter(Boolean);
};

// Common business intelligence queries (use after recommended queries work)
export const getBusinessQueries = () => {
  return [
    'debit_balances',
    'credit_balances',
    'cash_accounts',
    'assets_accounts',
    'liability_accounts',
    'income_accounts',
    'expense_accounts',
    'receivables',
    'payables'
  ].map(id => getQueryById(id)).filter(Boolean);
};

// Discovery queries to understand Tally structure
export const getDiscoveryQueries = () => {
  return [
    'discover_methods',
    'available_tables',
    'account_groups'
  ].map(id => getQueryById(id)).filter(Boolean);
};