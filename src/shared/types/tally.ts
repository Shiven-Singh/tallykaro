// src/shared/types/tally.ts

export interface TallyConfig {
  serverPath?: string;
  companyName?: string;
  odbcDriver?: string;
  port?: number;
  dataSourceName?: string;
}

export interface TallyConnectionStatus {
  isConnected: boolean;
  error?: string;
  companyName?: string;
  tallyVersion?: string;
  lastConnected?: Date;
  validationDetails?: string[];
  
  // Enhanced status information
  availableData?: string[];      // List of available data sources
  warnings?: string[];           // Non-fatal issues or limitations
  successRate?: number;          // Percentage of successful data validations
  partialConnection?: boolean;   // True if some data is available but not all
  executionTime?: number;        // Connection test execution time
  timestamp?: string;            // ISO timestamp
}

export interface TallyQueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  rowCount?: number;
  
  // Enhanced query result information
  executionTime?: number;        // Query execution time in milliseconds
  dataSource?: string;          // Which table/source was queried
  isPartialResult?: boolean;    // True if result might be incomplete
  suggestion?: string;          // Helpful suggestion if query failed
  query?: string;               // The executed query (sanitized)
  timestamp?: string;           // ISO timestamp
}

// Enhanced business data structure with metadata
export interface BusinessData {
  // Data summaries
  _summary?: {
    successfulQueries: number;
    totalQueries: number;
    successRate: number;
    availableTables: string[];
    skippedTables?: string[];
    note?: string;
    lastUpdated?: Date;
  };
  
  // Metadata about the request
  _metadata?: {
    executionTime: number;
    timestamp: string;
    totalDataSources: number;
    hasError?: boolean;
  };
  
  // Core business data (may or may not be available)
  ledgerSummary?: BusinessDataResult;
  ledgers?: BusinessDataResult;
  allLedgers?: BusinessDataResult;
  ledgerGroups?: BusinessDataResult;
  companyInfo?: BusinessDataResult;
  voucherCount?: BusinessDataResult;
  recentVouchers?: BusinessDataResult;
  
  // Allow for dynamic data sources
  [key: string]: BusinessDataResult | any;
}

export interface BusinessDataResult {
  success: boolean;
  data?: any[];
  error?: string;
  description: string;
  hasRealData: boolean;
  isOptional?: boolean;           // Indicates if this data is optional
  warning?: string;               // Non-fatal warnings about the data
  tableAccess?: 'full' | 'partial' | 'restricted'; // Level of table access
  lastAttempted?: Date;           // When this query was last attempted
  rowCount?: number;
}

// Detailed validation result for connection testing
export interface ValidationResult {
  step: string;
  success: boolean;
  message: string;
  details?: string;
  dataFound?: boolean;
  errorType?: 'connection' | 'authentication' | 'permission' | 'tdl' | 'data';
  suggestion?: string;
}

// Available data source information
export interface DataSourceInfo {
  name: string;
  tableName: string;
  accessible: boolean;
  hasData: boolean;
  recordCount?: number;
  lastChecked: Date;
  restrictions?: string[];        // Any known limitations
  essential: boolean;            // Whether this is essential for basic functionality
}

// Tally database table definitions for better type safety
export interface TallyLedger {
  NAME: string;
  PARENT?: string;
  OPENINGBALANCE?: number;
  CLOSINGBALANCE?: number;
  ADDRESS?: string;
  PHONE?: string;
  EMAIL?: string;
  GSTREGISTRATION?: string;
}

export interface TallyVoucher {
  VOUCHERID?: string;
  DATE?: Date;
  VOUCHERTYPE?: string;
  VOUCHERNUMBER?: string;
  PARTYLEDGERNAME?: string;
  AMOUNT?: number;
  NARRATION?: string;
}

export interface TallyCompany {
  NAME?: string;
  ADDRESS?: string;
  PHONE?: string;
  EMAIL?: string;
  WEBSITE?: string;
  GSTREGISTRATION?: string;
  FINANCIALYEARFROM?: Date;
  FINANCIALYEARTO?: Date;
}

// Enhanced error information for better user experience
export interface TallyError {
  code: string;
  message: string;
  technicalDetails?: string;
  userFriendlyMessage: string;
  suggestions: string[];
  category: 'connection' | 'authentication' | 'permission' | 'data' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  canRetry: boolean;
  helpUrl?: string;
}

// Connection diagnostic information
export interface ConnectionDiagnostic {
  timestamp: Date;
  tallyProcesses: string[];
  odbcDrivers: string[];
  connectionStrings: ConnectionStringTest[];
  systemInfo: { [key: string]: string };
  recommendations: string[];
}

export interface ConnectionStringTest {
  method: string;
  connectionString: string; // Sanitized version (no sensitive data)
  result: 'success' | 'failed' | 'partial';
  error?: string;
  dataSourcesFound: string[];
  responseTime?: number;
}

// Enhanced configuration with validation
export interface TallyConfigValidation {
  config: TallyConfig;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

// System requirements and compatibility
export interface SystemCompatibility {
  platform: string;
  nodeVersion: string;
  electronVersion?: string;
  odbcDriverVersion?: string;
  tallyVersion?: string;
  compatible: boolean;
  issues: string[];
  recommendations: string[];
}

// User preferences and settings
export interface TallyUserPreferences {
  autoConnect?: boolean;
  defaultQueries?: string[];
  dataRefreshInterval?: number; // in minutes
  showWarnings?: boolean;
  verboseLogging?: boolean;
  preferredDateFormat?: string;
  preferredCurrencyFormat?: string;
}

// Session information for multi-user scenarios
export interface TallySession {
  sessionId: string;
  userId?: string;
  companyId?: string;
  startTime: Date;
  lastActivity: Date;
  isActive: boolean;
  connectionStatus: TallyConnectionStatus;
  queryCount: number;
  dataAccessed: string[];
}

// Query history and performance tracking
export interface QueryHistory {
  queryId: string;
  query: string;
  timestamp: Date;
  executionTime: number;
  success: boolean;
  rowsReturned?: number;
  error?: string;
  dataSource?: string;
}

// Business intelligence insights
export interface BusinessInsight {
  id: string;
  title: string;
  description: string;
  category: 'financial' | 'operational' | 'compliance' | 'performance';
  priority: 'low' | 'medium' | 'high';
  data: any;
  generatedAt: Date;
  confidence: number; // 0-1 scale
  actionable: boolean;
  recommendations?: string[];
}

// Real-time data monitoring
export interface DataMonitor {
  source: string;
  lastCheck: Date;
  status: 'online' | 'offline' | 'degraded';
  responseTime?: number;
  errorCount: number;
  successCount: number;
  uptime: number; // percentage
}

// Export/Import capabilities
export interface DataExport {
  exportId: string;
  format: 'csv' | 'excel' | 'json' | 'pdf';
  tables: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  filters?: { [key: string]: any };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: Date;
}

// Advanced query builder types
export interface QueryBuilder {
  select: string[];
  from: string;
  where?: QueryCondition[];
  orderBy?: QuerySort[];
  limit?: number;
  offset?: number;
}

export interface QueryCondition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'BETWEEN';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

export interface QuerySort {
  field: string;
  direction: 'ASC' | 'DESC';
}

// API response wrapper for consistent error handling
export interface TallyAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: TallyError;
  warnings?: string[];
  metadata?: {
    timestamp: Date;
    executionTime: number;
    version: string;
    requestId?: string;
  };
}

// Legacy support - keep existing interfaces for backward compatibility
export interface LedgerData {
  NAME: string;
  PARENT?: string;
  CLOSINGBALANCE?: number;
}

export interface VoucherData {
  DATE?: string;
  VOUCHERNUMBER?: string;
  VOUCHERTYPE?: string;
  PARTYLEDGERNAME?: string;
  AMOUNT?: number;
}

export interface CompanyData {
  NAME?: string;
  ADDRESS?: string;
}

// Type guards for runtime type checking
export const isTallyLedger = (data: any): data is TallyLedger => {
  return data && typeof data.NAME === 'string';
};

export const isTallyVoucher = (data: any): data is TallyVoucher => {
  return data && (data.VOUCHERID || data.VOUCHERNUMBER);
};

export const isTallyCompany = (data: any): data is TallyCompany => {
  return data && typeof data.NAME === 'string' && data.ADDRESS;
};

// Helper function types for data processing
export type DataProcessor<T> = (data: any[]) => T[];
export type DataValidator = (data: any) => boolean;
export type DataFormatter = (data: any) => string;
export type ErrorHandler = (error: any) => TallyError;

// Event types for real-time updates
export interface TallyEvent {
  type: 'connection' | 'data' | 'error' | 'warning';
  timestamp: Date;
  data: any;
  source: string;
}

export type TallyEventListener = (event: TallyEvent) => void;

// Plugin/Extension system types for future extensibility
export interface TallyPlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  initialize: (api: TallyPluginAPI) => Promise<void>;
  cleanup?: () => Promise<void>;
}

export interface TallyPluginAPI {
  executeQuery: (sql: string) => Promise<TallyQueryResult>;
  getConnectionStatus: () => Promise<TallyConnectionStatus>;
  subscribeToEvents: (listener: TallyEventListener) => void;
  unsubscribeFromEvents: (listener: TallyEventListener) => void;
}


// src/types/index.ts - Enhanced type definitions for professional UI

export interface TallyConfig {
  serverPath?: string;
  companyName?: string;
  odbcDriver?: string;
  port?: number;
  dataSourceName?: string;
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

export interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: Date;
  data?: any[];
  query?: string;
  executionTime?: number;
  category?: string;
}

export interface QueryDefinition {
  id: string;
  name: string;
  description: string;
  sql: string;
  category: 'financial' | 'operational' | 'compliance' | 'diagnostic';
  difficulty: 'safe' | 'moderate' | 'advanced';
  expectedColumns?: string[];
  tags?: string[];
}

export interface BusinessDataSummary {
  totalQueries: number;
  successfulQueries: number;
  successRate: number;
  availableTables: string[];
  skippedTables?: string[];
  executionTime: number;
  timestamp: string;
}

export interface SystemStatus {
  app: {
    version: string;
    uptime: number;
    platform: string;
  };
  tally: {
    connected: boolean;
    companyName?: string;
    processes: string[];
  };
  odbc: {
    available: boolean;
    drivers: string[];
  };
}

// Professional UI specific types
export interface UIState {
  view: 'setup' | 'chat';
  sidebarOpen: boolean;
  isProcessing: boolean;
  isConnecting: boolean;
}

export interface MessageOptions {
  showData?: boolean;
  dataLimit?: number;
  showExecutionTime?: boolean;
  category?: string;
}

// Query execution context
export interface QueryContext {
  userId?: string;
  sessionId?: string;
  companyId?: string;
  timestamp: Date;
  source: 'sidebar' | 'input' | 'system';
}

// Enhanced error handling
export interface TallyError {
  code: string;
  message: string;
  technicalDetails?: string;
  userFriendlyMessage: string;
  suggestions: string[];
  category: 'connection' | 'authentication' | 'permission' | 'data' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  canRetry: boolean;
}

// Professional theme configuration
export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
  typography: {
    fontFamily: string;
    sizes: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
    };
  };
}

// Default professional theme
export const professionalTheme: ThemeConfig = {
  colors: {
    primary: '#2563eb',      // blue-600
    secondary: '#6b7280',    // gray-500
    accent: '#3b82f6',       // blue-500
    background: '#f9fafb',   // gray-50
    surface: '#ffffff',      // white
    text: {
      primary: '#111827',    // gray-900
      secondary: '#6b7280',  // gray-500
      disabled: '#9ca3af'    // gray-400
    },
    status: {
      success: '#10b981',    // emerald-500
      warning: '#f59e0b',    // amber-500
      error: '#ef4444',      // red-500
      info: '#3b82f6'        // blue-500
    }
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem'
    }
  }
};

// Utility types for better type safety
export type QueryCategory = QueryDefinition['category'];
export type QueryDifficulty = QueryDefinition['difficulty'];
export type MessageType = ChatMessage['type'];
export type ViewType = UIState['view'];

// Form validation types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConnectionFormData {
  serverPath: string;
  port: number;
  companyName: string;
  autoConnect: boolean;
}

// API response wrapper for consistent error handling
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: TallyError;
  warnings?: string[];
  metadata?: {
    timestamp: Date;
    executionTime: number;
    version: string;
    requestId?: string;
  };
}