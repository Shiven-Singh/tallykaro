// TypeScript declarations for Electron API

export interface TallyConfig {
  serverPath?: string;
  companyName?: string;
  port?: number;
  odbcDriver?: string;
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

export interface LoginCredentials {
  mobileNumber: string;
  password: string;
}

export interface UserRegistration {
  mobileNumber: string;
  password: string;
  companyName?: string;
  businessType?: string;
}

export interface UserSession {
  userId: string;
  mobileNumber: string;
  clientId: string;
  isAuthenticated: boolean;
  loginMode: 'tally' | 'mobile';
  accessToken?: string;
  expiresAt?: Date;
}

export interface ElectronAPI {
  // Connection Management
  tallyConnect: (config: TallyConfig) => Promise<TallyConnectionStatus>;
  tallyDisconnect: () => Promise<{ success: boolean }>;
  tallyGetStatus: () => Promise<TallyConnectionStatus>;
  tallyGetCompanies: () => Promise<{ success: boolean; companies?: string[]; error?: string }>;

  // Query Execution
  tallyExecuteQuery: (sql: string) => Promise<TallyQueryResult>;
  tallyQueryLedgerSmart: (userInput: string) => Promise<SmartQueryResult>;
  tallyProcessAiQuery: (userQuery: string) => Promise<any>;

  // Data Retrieval
  tallyGetBusinessData: () => Promise<any>;

  // Diagnostics & Debug
  tallyDebugConnectionState: () => Promise<any>;
  tallyDiagnosticOdbcDrivers: () => Promise<any>;
  tallyDiagnosticOdbcConnection: () => Promise<any>;
  tallyDiagnosticProcesses: () => Promise<any>;
  tallyDiagnosticDataSources: () => Promise<any>;

  // Auto-Sync
  syncInitialize: (clientId: string) => Promise<any>;
  syncStart: () => Promise<any>;
  syncStop: () => Promise<any>;
  syncStatus: () => Promise<any>;
  syncManual: () => Promise<any>;
  syncUpdateConfig: (config: any) => Promise<any>;

  // Utilities
  getSystemInfo: () => Promise<any>;

  // Authentication
  authLoginMobile: (credentials: LoginCredentials) => Promise<{ success: boolean; message: string; session?: UserSession }>;
  authLoginTally: (companyName: string) => Promise<{ success: boolean; message: string; session?: UserSession }>;
  authRegister: (registrationData: UserRegistration) => Promise<{ success: boolean; message: string; userId?: string }>;
  authLogout: () => Promise<{ success: boolean; message: string }>;
  authGetCurrentSession: () => Promise<{ success: boolean; session?: UserSession }>;
  authGetLoginRecommendations: () => Promise<{ success: boolean; recommendedMode: 'tally' | 'mobile'; tallyAvailable: boolean; message: string }>;
  checkTallyConnection: () => Promise<{ connected: boolean; companyName?: string }>;

  // Event Handling
  onMainProcessEvent: (eventName: string, callback: (data: any) => void) => void;
  removeEventListener: (eventName: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}



