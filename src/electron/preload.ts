// File: preload.ts
// Description: Securely exposes main process APIs to the renderer process.
/// <reference lib="dom" />
import { contextBridge, ipcRenderer } from 'electron';

// =============================================================================
// == TYPE DEFINITIONS FOR API
// =============================================================================
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
  offlineMode?: boolean;
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

// =============================================================================
// == SECURE API EXPOSURE
// =============================================================================
console.log('TallyKaro preload script initializing...');

// This is the API object that will be exposed to the renderer process.
// Method names MUST match what page.tsx expects
const electronAPI = {
  // --- Connection Management ---
  tallyConnect: (config: TallyConfig): Promise<TallyConnectionStatus> => 
    ipcRenderer.invoke('tally-connect', config),
  
  
  tallyDisconnect: (): Promise<{ success: boolean }> => 
    ipcRenderer.invoke('tally-disconnect'),
  
  tallyGetStatus: (): Promise<TallyConnectionStatus> => 
    ipcRenderer.invoke('tally-get-status'),

  tallyGetCompanies: (): Promise<{ success: boolean; companies?: string[]; error?: string }> => 
    ipcRenderer.invoke('tally-get-companies'),

  // --- Query Execution ---
  tallyExecuteQuery: (sql: string): Promise<TallyQueryResult> => 
    ipcRenderer.invoke('tally-execute-query', sql),
  
  tallyQueryLedgerSmart: (userInput: string): Promise<SmartQueryResult> => 
    ipcRenderer.invoke('tally-query-ledger-smart', userInput),
  
  tallyProcessAiQuery: (userQuery: string): Promise<any> => 
    ipcRenderer.invoke('tally-process-ai-query', userQuery),

  // --- Data Retrieval ---
  tallyGetBusinessData: (): Promise<any> =>
    ipcRenderer.invoke('tally-get-business-data'),

  // --- Debug ---
  tallyDebugConnectionState: (): Promise<any> =>
    ipcRenderer.invoke('tally-debug-connection-state'),

  tallyTestVouchers: (): Promise<any> =>
    ipcRenderer.invoke('tally-test-vouchers'),

  // --- Auto-Sync ---
  syncInitialize: (clientId: string): Promise<any> => 
    ipcRenderer.invoke('sync-initialize', clientId),
  
  syncStart: (): Promise<any> => 
    ipcRenderer.invoke('sync-start'),
  
  syncStop: (): Promise<any> => 
    ipcRenderer.invoke('sync-stop'),
  
  syncStatus: (): Promise<any> => 
    ipcRenderer.invoke('sync-status'),
  
  syncManual: (): Promise<any> => 
    ipcRenderer.invoke('sync-manual'),
  
  syncUpdateConfig: (config: any): Promise<any> => 
    ipcRenderer.invoke('sync-update-config', config),

  // --- Utilities ---
  getSystemInfo: (): Promise<any> => 
    ipcRenderer.invoke('get-system-info'),

  // --- Authentication ---
  authLoginMobile: (credentials: any): Promise<any> => 
    ipcRenderer.invoke('auth-login-mobile', credentials),
  
  authLoginTally: (companyName: string): Promise<any> => 
    ipcRenderer.invoke('auth-login-tally', companyName),
  
  authRegister: (registrationData: any): Promise<any> => 
    ipcRenderer.invoke('auth-register', registrationData),
  
  authLogout: (): Promise<any> => 
    ipcRenderer.invoke('auth-logout'),
  
  authGetCurrentSession: (): Promise<any> => 
    ipcRenderer.invoke('auth-get-current-session'),
  
  authGetLoginRecommendations: (): Promise<any> => 
    ipcRenderer.invoke('auth-get-login-recommendations'),
  
  checkTallyConnection: (): Promise<any> => 
    ipcRenderer.invoke('check-tally-connection'),

  // --- Event Handling ---
  onMainProcessEvent: (eventName: string, callback: (data: any) => void): void => {
    ipcRenderer.on(eventName, (_, data) => callback(data));
  },
  
  removeEventListener: (eventName: string, callback: (...args: any[]) => void): void => {
    ipcRenderer.removeListener(eventName, callback);
  },
};

// Use contextBridge to expose the API in a secure way
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('TallyKaro preload script initialization complete.');
console.log('Available methods:', Object.keys(electronAPI));