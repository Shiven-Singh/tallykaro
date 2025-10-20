"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";

// Interface Definitions
interface TallyConfig {
  serverPath?: string;
  companyName?: string;
  odbcDriver?: string;
  port?: number;
  whatsappNumber?: string;
  mobileNumber?: string;
  password?: string;
}

interface TallyConnectionStatus {
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

interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system" | "error" | "warning" | "pdf" | "ledger_pdf";
  content: string;
  timestamp: Date;
  data?: any;
  query?: string;
  executionTime?: number;
  aiProcessingTime?: number;
  queryType?: 'smart' | 'sql' | 'general';
}

// Sample queries for demonstration and testing
const QUERY_CATEGORIES = {
  'Basic Queries': [
    'What is my company address?',
    'Show company details',
    'How many ledgers do I have?'
  ],
  'Account Balances': [
    'What is bank balance?',
    'List all account balances'
  ],
  'AI Understanding': [
    'Mere paas kitna cash hai?',
    'Company ka address kya hai?',
    'Sabse zyada balance kiska hai?',
    'Bank accounts dikhao'
  ],
  'Analysis Queries': [
    'Which account has highest balance?',
    'Show me all customers',
    'What are my sales this month?',
    'Total bank balance?'
  ],
  'Stock & Inventory': [
    'Stock status kya hai?'
  ]
};

const EXAMPLE_QUERIES: string[] = [
  'What is my company address?',
  'What is bank balance?',
  'How many ledgers do I have?',
  'Which account has highest balance?',
  'Show me all customers',
  'Mere paas kitna cash hai?'
];

// Professional Setup View
const SetupView = memo(({ config, setConfig, isConnecting, isElectron, onConnect }: {
    config: TallyConfig;
    setConfig: React.Dispatch<React.SetStateAction<TallyConfig>>;
    isConnecting: boolean;
    isElectron: boolean;
    onConnect: () => void;
}) => {
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const loadAvailableCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setCompanyError(null);
    
    try {
      console.log('Loading companies from registered records and Tally...');
      const result = await (window as any).electronAPI.tallyGetCompanies();
      console.log('Company detection result:', result);
      
      if (result.success && result.companies && result.companies.length > 0) {
        setAvailableCompanies(result.companies);
        // Auto-select first company if none selected
        if (!config.companyName && result.companies.length > 0) {
          setConfig(prev => ({ ...prev, companyName: result.companies[0] }));
        }
        setCompanyError(null);
      } else {
        setAvailableCompanies([]);
        setCompanyError(result.error || 'No companies found in registered records or Tally');
      }
    } catch (error) {
      console.error('Error loading companies:', error);
      setAvailableCompanies([]);
      setCompanyError('Failed to load companies from registered records');
    } finally {
      setLoadingCompanies(false);
    }
  }, [config.companyName, setConfig]);

  // Load available companies when mobile number and password are provided
  useEffect(() => {
    if (isElectron && config.mobileNumber && config.password) {
      loadAvailableCompanies();
    }
  }, [isElectron, config.mobileNumber, config.password, loadAvailableCompanies]);


  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{backgroundColor: '#fff7ed'}}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <div className="text-center">
              <div className="text-2xl font-black text-white">TK</div>
              <div className="text-xs font-bold text-white opacity-90">AI</div>
            </div>
          </div>
          <h1 className="text-4xl font-black text-gray-900">
            TallyKaro
          </h1>
          <p className="text-lg font-semibold text-gray-800 mt-1">Professional Desktop Connector</p>
          <p className="text-gray-700 mt-2">Intelligent integration with your Tally ERP system</p>
        </div>
        
        <div className="space-y-6">

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Step 1: Mobile Number */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="Enter your mobile number"
                className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                style={{borderColor: '#0ea5e9'}}
                value={config.mobileNumber || ""}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setConfig(prev => ({ ...prev, mobileNumber: value }));
                }}
                maxLength={10}
                required
              />
              <p className="text-xs text-slate-500">
                Used for authentication and data sync
              </p>
            </div>

            {/* Step 2: Password */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                placeholder="Enter your TallyKaro password"
                className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                style={{borderColor: '#0ea5e9'}}
                value={config.password || ""}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 50);
                  setConfig(prev => ({ ...prev, password: value }));
                }}
                maxLength={50}
                required
              />
              <p className="text-xs text-slate-500">
                Your TallyKaro account password (used to fetch your registered companies)
              </p>
            </div>

            {/* Step 3: Company Selection (only show after mobile/password) */}
            {config.mobileNumber && config.password && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Company Name <span className="text-red-500">*</span>
                </label>
                {availableCompanies.length > 0 ? (
                <div className="space-y-2">
                  <select
                    className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                    style={{borderColor: '#0ea5e9'}}
                    value={config.companyName || ""}
                    onChange={(e) => setConfig(prev => ({ ...prev, companyName: e.target.value }))}
                    required
                  >
                    <option value="">Select a company</option>
                    {availableCompanies.map((company, index) => (
                      <option key={index} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={loadAvailableCompanies}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    🔄 Refresh company list
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder={loadingCompanies ? "Loading companies..." : "Enter your company name"}
                    className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                    style={{borderColor: '#0ea5e9'}}
                    value={config.companyName || ""}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, 100);
                      setConfig(prev => ({ ...prev, companyName: value }));
                    }}
                    maxLength={100}
                    required
                    disabled={loadingCompanies}
                  />
                  {loadingCompanies && (
                    <div className="flex items-center text-blue-600 text-xs">
                      <svg className="animate-spin h-3 w-3 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading companies from registered records...
                    </div>
                  )}
                  {!loadingCompanies && (
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={loadAvailableCompanies}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        🔍 Fetch companies from registered records
                      </button>
                      {companyError && (
                        <span className="text-xs text-gray-500">
                          {companyError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
                <p className="text-xs text-slate-500">
                  {availableCompanies.length > 0 ? "Select from your registered companies" : "Companies will be fetched from your registered records"}
                </p>
              </div>
            )}


            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                ODBC Port
              </label>
              <input
                type="number"
                placeholder="9000"
                className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-800"
                style={{borderColor: '#0ea5e9'}}
                value={config.port || 9000}
                onChange={(e) => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 9000 }))}
              />
              <p className="text-xs text-slate-500">Tally ODBC server port</p>
            </div>
          </div>

          <div className="flex justify-center mt-6">
            <button
              onClick={onConnect}
              disabled={isConnecting || !isElectron || !config.mobileNumber?.trim() || !config.password?.trim() || !config.companyName?.trim()}
              className="w-full bg-gray-800 text-white py-3 px-6 rounded-xl hover:bg-gray-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl border-2"
              style={{borderColor: '#0ea5e9'}}
            >
              {isConnecting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </span>
              ) : !config.mobileNumber?.trim() ? "Enter Mobile Number" : !config.password?.trim() ? "Enter Password" : !config.companyName?.trim() ? "Select Company" : "Connect to Tally"}
            </button>
          </div>

          {!isElectron && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="font-medium text-red-800">Desktop Application Required</p>
                  <p className="text-red-700 text-sm">Please run the Electron desktop app to connect to Tally.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
SetupView.displayName = 'SetupView';

// Professional Data Table Component with Pagination
const DataTable = memo(({ data, messageId, title }: {
  data: any[],
  messageId: string,
  title?: string
}) => {
  const [showAll, setShowAll] = useState(false);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'desc' });
  const itemsPerPage = 10; // Show 10 items per page for stock/inventory

  // Sort data based on current sort config
  const getSortedData = (dataToSort: any[]) => {
    if (!sortConfig.key) return dataToSort;

    return [...dataToSort].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      // Handle null/undefined
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Parse numeric values (including currency strings)
      let aNum = aValue;
      let bNum = bValue;

      if (typeof aValue === 'string') {
        const cleanStr = aValue.replace(/[₹,\s]/g, '');
        const match = cleanStr.match(/[\d.-]+/);
        if (match) aNum = parseFloat(match[0]);
      }

      if (typeof bValue === 'string') {
        const cleanStr = bValue.replace(/[₹,\s]/g, '');
        const match = cleanStr.match(/[\d.-]+/);
        if (match) bNum = parseFloat(match[0]);
      }

      // Compare
      if (typeof aNum === 'number' && typeof bNum === 'number') {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // String comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      if (sortConfig.direction === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
      }
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="mt-3 bg-slate-50 rounded-lg p-4 text-center">
        <div className="text-slate-400 text-sm">No data available</div>
      </div>
    );
  }

  const firstItem = data[0];
  if (!firstItem || typeof firstItem !== 'object') {
    return (
      <div className="mt-3 bg-slate-50 rounded-lg p-3">
        <div className="text-sm text-slate-600">
          {data.map((item, index) => (
            <div key={index} className="py-1">
              {String(item)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns = Object.keys(firstItem);

  // Sort data first
  const sortedData = getSortedData(data);

  // Apply pagination to ALL tables with more than 10 items (as per requirement)
  const shouldPaginate = sortedData.length > 10 && !expandedTable;

  let itemsToShow: any[];
  let totalPages = 1;

  if (shouldPaginate) {
    // Paginate: show 10 items per page
    totalPages = Math.ceil(sortedData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    itemsToShow = sortedData.slice(startIndex, endIndex);
  } else if (expandedTable === messageId) {
    // Expanded: show all items
    itemsToShow = sortedData;
  } else {
    // Small dataset: show all items
    itemsToShow = sortedData;
  }

  return (
    <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
          <h4 className="font-semibold text-slate-900 flex items-center">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            {title}
          </h4>
        </div>
      )}

      <div className="overflow-hidden">
        <div className={`overflow-x-auto ${expandedTable === messageId ? 'max-h-96 overflow-y-auto' : ''}`}>
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-12">
                  #
                </th>
                {columns.map(column => (
                  <th
                    key={column}
                    onClick={() => handleSort(column)}
                    className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                    title={`Click to sort by ${column.replace(/^\$/, '').replace(/([A-Z])/g, ' $1').trim()}`}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{column.replace(/^\$/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
                      {sortConfig.key === column && (
                        <span className="text-emerald-600 font-bold">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {itemsToShow.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors duration-200 border-l-2 border-transparent hover:border-emerald-400">
                  <td className="px-3 py-3 text-xs font-medium text-slate-500 bg-slate-50">
                    {index + 1}
                  </td>
                  {columns.map(column => {
                    const cellValue = item[column];
                    let displayValue: string;
                    
                    if (cellValue === null || cellValue === undefined || cellValue === '—') {
                      displayValue = '—';
                    } else if (column.toLowerCase().includes('balance') && typeof cellValue === 'number') {
                      if (cellValue === 0) {
                        displayValue = '—';
                      } else {
                        displayValue = `₹${Math.abs(cellValue).toLocaleString('en-IN')}${cellValue < 0 ? ' Cr' : ' Dr'}`;
                      }
                    } else if (typeof cellValue === 'object' && cellValue !== null) {
                      // Handle object values properly
                      if (Array.isArray(cellValue)) {
                        displayValue = cellValue.map(item => 
                          typeof item === 'object' ? (item.name || item.$Name || 'Data available') : String(item)
                        ).join(', ');
                      } else {
                        // For objects, try to extract meaningful data
                        if (cellValue.name || cellValue.$Name) {
                          displayValue = cellValue.name || cellValue.$Name;
                        } else if (cellValue.balance !== undefined || cellValue.$ClosingBalance !== undefined) {
                          const balance = cellValue.balance || cellValue.$ClosingBalance;
                          displayValue = `₹${Math.abs(parseFloat(balance)).toLocaleString('en-IN')}${balance < 0 ? ' Cr' : ' Dr'}`;
                        } else {
                          displayValue = 'Data available';
                        }
                      }
                    } else {
                      displayValue = String(cellValue);
                    }
                    
                    return (
                      <td key={column} className="px-4 py-3 text-sm text-slate-900 max-w-xs">
                        <div className="truncate">
                          <span 
                            className={column.toLowerCase().includes('balance') && typeof cellValue === 'number' && cellValue !== 0 ? 
                              'font-semibold' : 
                              'text-slate-900'
                            }
                            style={column.toLowerCase().includes('balance') && typeof cellValue === 'number' && cellValue !== 0 ? 
                              (cellValue < 0 ? {color: '#dc2626'} : {color: '#16a34a'}) : 
                              {}
                            }>
                            {displayValue}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-t border-slate-200 flex justify-between items-center text-sm">
        <div className="flex items-center space-x-4">
          <span className="text-slate-700 font-medium">
            📊 {shouldPaginate
                ? `${itemsToShow.length} of ${data.length} records (Page ${currentPage}/${totalPages})`
                : `${itemsToShow.length} of ${data.length} records`}
          </span>
          {data.length > itemsToShow.length && !shouldPaginate && !expandedTable && (
            <span className="text-emerald-700 text-xs bg-emerald-100 px-2 py-1 rounded-full">
              +{data.length - itemsToShow.length} more
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Pagination controls for all tables with more than 10 items */}
          {shouldPaginate && totalPages > 1 && (
            <>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium px-3 py-1 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed text-xs"
              >
                ← Previous
              </button>
              <span className="text-slate-600 font-medium text-xs">
                Page {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 text-white font-medium px-3 py-1 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed text-xs"
              >
                Next →
              </button>
            </>
          )}

          {/* Show All button for paginated tables */}
          {data.length > itemsPerPage && (
            <button
              onClick={() => {
                setExpandedTable(expandedTable ? null : messageId);
                setCurrentPage(1); // Reset to first page when toggling
              }}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-medium px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg text-xs"
            >
              {expandedTable === messageId ? '📤 Show Paginated' : `📋 Show All ${data.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
DataTable.displayName = 'DataTable';

// Professional Message Component
const MessageRenderer = memo(({ message, syncStatus, formatISTTime }: { message: ChatMessage; syncStatus?: any; formatISTTime?: (timestamp: string | Date) => string }) => {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';
  const isError = message.type === 'error';
  const isWarning = message.type === 'warning';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div className={`max-w-4xl ${
        isUser
          ? 'text-black ml-12 rounded-2xl rounded-br-md shadow-md border-2'
          : isError
          ? 'bg-red-50 text-red-900 border border-red-200 mr-12 rounded-2xl rounded-bl-md'
          : isWarning
          ? 'bg-amber-50 text-amber-900 border border-amber-200 mr-12 rounded-2xl rounded-bl-md'
          : isSystem
          ? 'bg-white text-gray-900 border border-gray-200 mr-12 rounded-2xl rounded-bl-md'
          : 'bg-white border border-slate-300 mr-12 rounded-2xl rounded-bl-md shadow-sm'
      } px-4 py-3`}
      style={isUser ? {borderColor: '#ea580c', backgroundColor: '#fafafa'} : {}}>
        
        {!isUser && (
          <div className="flex items-center mb-2">
            <div className="w-7 h-7 bg-gray-800 rounded-lg flex items-center justify-center mr-3 shadow-md">
              <span className="text-xs text-white font-black">TK</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900">TallyKaro AI</span>
              <span className="text-xs text-slate-700">Professional Assistant</span>
            </div>
          </div>
        )}
        
        <div
          className={`text-sm leading-relaxed whitespace-pre-wrap font-medium ${
            isUser ? 'text-black' : 'text-slate-900'
          }`}
          dangerouslySetInnerHTML={{
            __html: message.content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/^## (.*$)/gim, `<h2 style="font-size: 1.2em; font-weight: bold; margin: 12px 0 8px 0; color: #000000;">$1</h2>`)
              .replace(/^### (.*$)/gim, `<h3 style="font-size: 1.1em; font-weight: bold; margin: 10px 0 6px 0; color: #000000;">$1</h3>`)
              .replace(/^• (.*$)/gim, `<div style="margin: 4px 0; padding-left: 16px; color: #000000;">• $1</div>`)
              .replace(/^- (.*$)/gim, `<div style="margin: 4px 0; padding-left: 16px; color: #000000;">• $1</div>`)
              .replace(/\n/g, '<br/>')
          }}
        />
        
        {/* Last Synced timestamp for crucial data */}
        {!isUser && syncStatus?.lastSync && (
          message.content.toLowerCase().includes('balance') || 
          message.content.toLowerCase().includes('cash') || 
          message.content.toLowerCase().includes('bank') || 
          message.content.toLowerCase().includes('profit') || 
          message.content.toLowerCase().includes('loss') || 
          message.content.toLowerCase().includes('revenue') || 
          message.content.toLowerCase().includes('sales') ||
          message.type === 'pdf' ||
          message.type === 'ledger_pdf'
        ) && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-center">
              <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium flex items-center">
                <span className="mr-2">🕐</span>
                <span>Data Last Synced: {formatISTTime && syncStatus?.lastSync ? formatISTTime(syncStatus.lastSync) : 'Unknown'}</span>
              </div>
            </div>
          </div>
        )}
        
        {message.data && Array.isArray(message.data) && message.data.length > 0 && !isUser && (
          <DataTable 
            data={message.data} 
            messageId={message.id} 
          />
        )}
        
        {/* PDF Viewer for PDF messages */}
        {message.type === 'pdf' && message.data?.pdfPath && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <h4 className="font-semibold text-gray-800">📄 PDF Report</h4>
              {syncStatus?.lastSync && (
                <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                  🕐 Last Synced: {formatISTTime && syncStatus?.lastSync ? formatISTTime(syncStatus.lastSync) : 'Unknown'}
                </div>
              )}
            </div>
            <div className="h-96">
              <iframe
                src={message.data.pdfPath}
                className="w-full h-full border-0"
                title="PDF Report"
                onError={() => {
                  console.log('PDF iframe failed to load, showing fallback');
                }}
              />
            </div>
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                📁 File: {message.data.pdfPath.split('/').pop() || message.data.pdfPath.split('\\').pop()}
              </p>
            </div>
          </div>
        )}
        
        {/* Ledger PDF Viewer */}
        {message.type === 'ledger_pdf' && message.data?.pdfPath && (
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <h4 className="font-semibold text-gray-800">📄 Ledger Report</h4>
              {syncStatus?.lastSync && (
                <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-medium">
                  🕐 Last Synced: {formatISTTime && syncStatus?.lastSync ? formatISTTime(syncStatus.lastSync) : 'Unknown'}
                </div>
              )}
            </div>
            <div className="h-96">
              <iframe
                src={message.data.pdfPath}
                className="w-full h-full border-0"
                title="Ledger PDF Report"
                onError={() => {
                  console.log('Ledger PDF iframe failed to load, showing fallback');
                }}
              />
            </div>
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                📁 File: {message.data.pdfPath.split('/').pop() || message.data.pdfPath.split('\\').pop()}
              </p>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mt-3 text-xs opacity-60">
          <span>{message.timestamp.toLocaleTimeString()}</span>
          <div className="flex space-x-3">
            {message.executionTime && <span>⏱ {message.executionTime}ms</span>}
          </div>
        </div>
      </div>
    </div>
  );
});
MessageRenderer.displayName = 'MessageRenderer';

// Professional Sidebar Component
const Sidebar = memo(({ executeQuickQuery, isProcessing, setInputMessage }: {
  executeQuickQuery: (query: string) => Promise<void>;
  isProcessing: boolean;
  setInputMessage: (msg: string) => void;
}) => (
  <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full">
    <div className="p-4 border-b border-slate-200">
      <h3 className="font-semibold text-slate-900 text-lg">Quick Commands</h3>
      <p className="text-sm text-slate-500 mt-1">Click to run or use as examples</p>
    </div>
    
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {Object.entries(QUERY_CATEGORIES).map(([category, queries]) => (
        <div key={category} className="space-y-2">
          <h4 className="font-medium text-slate-700 text-sm uppercase tracking-wide">{category}</h4>
          <div className="space-y-1">
            {queries.map((query, index) => (
              <button
                key={index}
                onClick={() => setInputMessage(query)}
                disabled={isProcessing}
                className="w-full text-left p-3 text-sm bg-gray-800 hover:bg-gray-700 border-2 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group shadow-md hover:shadow-lg text-white" style={{borderColor: '#10b981'}}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{query}</span>
                  <svg 
                    className="w-4 h-4 text-white opacity-60 group-hover:opacity-100 transition-opacity" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      
      <div className="border-t border-slate-200 pt-4 mt-6">
        <div className="text-center py-4 text-slate-500">
          <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg border-2" style={{borderColor: '#10b981'}}>
            <span className="text-sm font-black text-white">TK</span>
          </div>
          <div className="text-sm font-bold text-slate-700 mb-1">TallyKaro AI Assistant</div>
          <div className="text-xs text-slate-500">English • Hindi • Hinglish Support</div>
        </div>
      </div>
    </div>
  </div>
));
Sidebar.displayName = 'Sidebar';

// Main Professional Chat View
const ChatView = memo(({
  sidebarOpen,
  setSidebarOpen,
  isProcessing,
  chatContainerRef,
  messages,
  messagesEndRef,
  inputRef,
  inputMessage,
  setInputMessage,
  executeUserQuery,
  executeQuickQuery,
  syncStatus,
  formatISTTime
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isProcessing: boolean;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputMessage: string;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  executeUserQuery: () => Promise<void>;
  executeQuickQuery: (query: string) => Promise<void>;
  syncStatus?: any;
  formatISTTime?: (timestamp: string | Date) => string;
}) => {
  return (
    <div className="h-full flex" style={{backgroundColor: '#fff7ed'}}>
      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar 
          executeQuickQuery={executeQuickQuery}
          isProcessing={isProcessing}
          setInputMessage={setInputMessage}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Messages */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-6 py-6"
          style={{ backgroundColor: '#fff7ed' }}
        >
          {messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                <span className="text-3xl text-white font-bold">AI</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Welcome to TallyKaro AI</h3>
              <p className="text-slate-700 mb-8 max-w-md mx-auto font-medium">
                Ask questions about your Tally data using natural language. Professional AI assistance for your business needs.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-3">Quick Commands</h4>
                  <div className="space-y-2 text-sm">
                    <div className="text-slate-600">• List all customers</div>
                    <div className="text-slate-600">• Show bank accounts</div>
                    <div className="text-slate-600">• Company details</div>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-3">Natural Language</h4>
                  <div className="space-y-2 text-sm">
                    <div className="text-slate-600">• "Bank balance?"</div>
                    <div className="text-slate-600">• "What is cash balance?"</div>
                    <div className="text-slate-600">• "Show supplier accounts"</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageRenderer key={message.id} message={message} syncStatus={syncStatus} formatISTTime={formatISTTime} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>


        {/* Input Area */}
        <div className="border-t border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    executeUserQuery();
                  }
                }}
                placeholder="Ask about your Tally data... e.g., 'What is my bank balance?'"
                className="w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-gray-500 resize-none transition-all duration-200 bg-slate-50 focus:bg-white font-medium text-slate-900 placeholder-slate-500"
                style={{borderColor: '#0ea5e9'}}
                disabled={isProcessing}
              />
              
              {isProcessing && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </div>
            
            <button
              onClick={executeUserQuery}
              disabled={!inputMessage.trim() || isProcessing}
              className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-lg hover:shadow-xl border-2"
              style={{borderColor: '#0ea5e9'}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          
          <div className="mt-2 text-xs text-slate-500 text-center">
            Try: "What is [account name] balance?" or use Quick Commands from the sidebar
          </div>
        </div>
      </div>
    </div>
  );
});
ChatView.displayName = 'ChatView';

// Main Component
export default function TallyKaro() {
  const [isElectron, setIsElectron] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<TallyConnectionStatus>({ isConnected: false });
  const [isConnecting, setIsConnecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'setup' | 'chat'>('setup');
  
  // Auto-sync states
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isSyncInitialized, setIsSyncInitialized] = useState(false);
  const [clientId, setClientId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Utility function to format timestamp in IST
  const formatISTTime = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  };
  const [conversationContext, setConversationContext] = useState<{
    lastSuggestions?: string[];
    lastQuery?: string;
  }>({});
  const [config, setConfig] = useState<TallyConfig>({
    serverPath: "localhost",
    companyName: "",
    port: 9000,
    odbcDriver: "Tally ODBC Driver",
    whatsappNumber: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Format smart query response for user
  const formatSmartQueryResponse = useCallback((result: any): string => {
    if (result.response && result.response.includes("Did you mean one of these?") && (!result.ledgers || result.ledgers.length === 0)) {
      const lines = result.response.split('\n');
      const suggestions: string[] = [];
      
      for (const line of lines) {
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match) {
          suggestions.push(match[1].trim());
        }
      }
      
      if (suggestions.length > 0) {
        setConversationContext({
          lastSuggestions: suggestions,
          lastQuery: 'suggestions'
        });
        return result.response;
      }
    }
    
    switch (result.type) {
      case 'exact_match':
        const ledger = result.ledgers[0];
        setConversationContext({});
        return `${ledger.name} (${ledger.parent})\nClosing Balance: Rs.${Math.abs(ledger.closingBalance || 0).toLocaleString('en-IN')}${(ledger.closingBalance || 0) < 0 ? ' Cr' : ' Dr'}`;
      
      case 'multiple_matches':
        let response = result.message + '\n\n';
        result.ledgers.forEach((l: any, i: number) => {
          const balance = l.closingBalance || 0;
          response += `${i + 1}. ${l.name} (${l.parent}) - Rs.${Math.abs(balance).toLocaleString('en-IN')}${balance < 0 ? ' Cr' : ' Dr'}\n`;
        });
        response += '\nPlease type the exact name or number of the ledger you want.';
        
        setConversationContext({
          lastSuggestions: result.ledgers.map((l: any) => l.name),
          lastQuery: 'multiple_matches'
        });
        return response;
      
      case 'suggestions':
        let sugResponse = result.message + '\n\n';
        result.suggestions?.forEach((s: string, i: number) => {
          sugResponse += `${i + 1}. ${s}\n`;
        });
        
        setConversationContext({
          lastSuggestions: result.suggestions,
          lastQuery: 'suggestions'
        });
        return sugResponse;
      
      case 'no_match':
        if (result.suggestions && result.suggestions.length > 0) {
          setConversationContext({
            lastSuggestions: result.suggestions,
            lastQuery: 'suggestions'
          });
        } else {
          setConversationContext({});
        }
        return result.message || result.response || "No matches found";
      
      default:
        setConversationContext({});
        return result.message || result.response || "No response available";
    }
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && chatContainerRef.current) {
      const container = chatContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timeoutId);
  }, [messages, scrollToBottom]);

  // Focus input when in chat view
  useEffect(() => {
    if (currentView === 'chat' && !isProcessing) {
      const timeoutId = setTimeout(() => {
        if (inputRef.current && 
            document.activeElement !== inputRef.current && 
            inputMessage === ""
        ) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [currentView, isProcessing]);

  // Add message utility
  const addMessage = useCallback((
    type: ChatMessage['type'], 
    content: string, 
    data?: any, 
    query?: string, 
    executionTime?: number, 
    aiProcessingTime?: number,
    queryType?: 'smart' | 'sql' | 'general'
  ) => {
    setMessages(prev => [...prev, { 
      id: `${Date.now()}-${Math.random()}`, 
      type, 
      content, 
      timestamp: new Date(), 
      data: Array.isArray(data) ? data : (data ? [data] : undefined),
      query, 
      executionTime,
      aiProcessingTime,
      queryType
    }]);
  }, []);

  // Check if running in Electron
  useEffect(() => {
    const electron = typeof window !== "undefined" && (window as any).electronAPI !== undefined;
    setIsElectron(electron);
    
    // Removed automatic status check to prevent error messages
  }, []);

  // Auto-switch views based on connection status
  useEffect(() => {
    if (connectionStatus.isConnected && currentView === 'setup') {
      setCurrentView('chat');
      // Removed dummy welcome message - user will see empty chat
      
      // Auto-initialize sync when connected
      initializeAutoSync();
    } else if (!connectionStatus.isConnected && currentView === 'chat') {
      setCurrentView('setup');
    }
  }, [connectionStatus.isConnected, currentView, addMessage]);

  // Initialize auto-sync
  const initializeAutoSync = useCallback(async () => {
    if (!isElectron || !config.companyName?.trim()) return;
    
    try {
      // Use the user-provided company name (more reliable than connection status)
      const companyName = config.companyName.trim();
      const normalizedClientId = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      setClientId(normalizedClientId);
      
      const result = await (window as any).electronAPI.syncInitialize(normalizedClientId);
      if (result.success) {
        setIsSyncInitialized(true);
        // Removed auto-sync initialization messages - silent background operation
        
        // Start auto-sync
        const startResult = await (window as any).electronAPI.syncStart();
        if (startResult.success) {
          setSyncStatus(startResult.status);
          // Removed auto-sync start messages - silent background operation
        } else {
          addMessage("error", `❌ Failed to start auto-sync: ${startResult.error}\n\n💡 You can still trigger manual sync using the "Sync Now" button.`);
        }
      } else {
        addMessage("error", `❌ Failed to initialize auto-sync: ${result.error}\n\n💡 Please check your connection and try again.`);
      }
    } catch (error) {
      addMessage("error", `Auto-sync initialization error: ${error}`);
    }
  }, [isElectron, config.companyName, addMessage]);

  // Get sync status
  const updateSyncStatus = useCallback(async () => {
    if (!isElectron || !isSyncInitialized) return;
    
    try {
      const result = await (window as any).electronAPI.syncStatus();
      if (result.success) {
        setSyncStatus(result.status);
      }
    } catch (error) {
      console.error('Error getting sync status:', error);
    }
  }, [isElectron, isSyncInitialized]);

  // Trigger manual sync with enhanced feedback
  const triggerManualSync = useCallback(async () => {
    if (!isElectron || !isSyncInitialized) return;
    
    try {
      addMessage("system", "🚀 Starting enhanced manual sync with progress tracking...\n\n⏱️ This may take a few minutes for large datasets.\n📊 Progress will be shown in the header.");
      
      const result = await (window as any).electronAPI.syncManual();
      
      if (result.success) {
        setSyncStatus(result.result);
        const recordsCount = result.result.totalRecords || 0;
        const filesCount = result.result.uploadedFiles?.length || 0;
        const errorsCount = result.result.errors?.length || 0;
        
        let message = `✅ **Manual sync completed successfully!**\n\n`;
        message += `📊 **Records synced:** ${recordsCount.toLocaleString()}\n`;
        message += `📁 **Files uploaded:** ${filesCount}\n`;
        
        if (errorsCount > 0) {
          message += `⚠️ **Errors encountered:** ${errorsCount}\n`;
          message += `\nError details: ${result.result.errors.slice(0, 2).join(', ')}${result.result.errors.length > 2 ? '...' : ''}`;
        }
        
        if (result.result.lastSync) {
          message += `\n🕐 **Completed at:** ${new Date(result.result.lastSync).toLocaleString()}`;
        }
        
        addMessage("system", message);
      } else {
        addMessage("error", `❌ Manual sync failed: ${result.error}\n\n💡 **Troubleshooting:**\n• Check if Tally is still connected\n• Ensure sufficient disk space\n• Try again in a few moments`);
      }
    } catch (error) {
      addMessage("error", `❌ Manual sync error: ${error}\n\n🔄 Please check your connection and try again.`);
    }
  }, [isElectron, isSyncInitialized, addMessage]);

  // Poll sync status every 30 seconds
  useEffect(() => {
    if (isSyncInitialized) {
      const interval = setInterval(updateSyncStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isSyncInitialized, updateSyncStatus]);


  // Connect to Tally
  const connectToTally = useCallback(async () => {
    if (!isElectron) return addMessage("error", "Desktop application required for Tally connectivity.");
    
    setIsConnecting(true);
    // Removed connection status messages - silent connection
    
    try {
      const result = await (window as any).electronAPI.tallyConnect(config);
      setConnectionStatus(result);
      
      if (result.isConnected) {
        // Removed success message - silent connection
        // Removed TDL warnings - silent operation
      } else {
        addMessage("error", result.error || "❌ Connection failed");
      }
    } catch (error: any) {
      addMessage("error", `❌ Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  }, [isElectron, config, addMessage]);

  // Execute user query with smart system and context
  const executeUserQuery = useCallback(async () => {
    if (!inputMessage.trim() || isProcessing) return;
    if (!isElectron || !connectionStatus.isConnected) {
      return addMessage("error", "Not connected to Tally database. Please connect first.");
    }

    const userQuery = inputMessage.trim();
    setInputMessage("");
    setIsProcessing(true);
    
    addMessage("user", userQuery);
    
    try {
      // Check if user is responding to previous suggestions
      if (conversationContext.lastSuggestions && conversationContext.lastSuggestions.length > 0) {
        const suggestionIndex = parseInt(userQuery) - 1;
        if (!isNaN(suggestionIndex) && suggestionIndex >= 0 && suggestionIndex < conversationContext.lastSuggestions.length) {
          const selectedLedger = conversationContext.lastSuggestions[suggestionIndex];
          
          const smartResult = await (window as any).electronAPI.tallyQueryLedgerSmart(selectedLedger + " closing balance");
          
          if (smartResult.success && smartResult.ledgers && smartResult.ledgers.length > 0) {
            const ledger = smartResult.ledgers[0];
            const response = `**${ledger.name}** (${ledger.parent})\nClosing Balance: ₹${Math.abs(ledger.closingBalance || 0).toLocaleString('en-IN')}${(ledger.closingBalance || 0) < 0 ? ' Cr' : ' Dr'}`;
            addMessage("assistant", response, [ledger], undefined, smartResult.executionTime, undefined, 'smart');
            setConversationContext({});
            return;
          }
        } else {
          const normalizedQuery = userQuery.toLowerCase().trim();
          const exactMatch = conversationContext.lastSuggestions.find(s => 
            s.toLowerCase().trim() === normalizedQuery
          );
          
          if (exactMatch) {
            const smartResult = await (window as any).electronAPI.tallyQueryLedgerSmart(exactMatch + " closing balance");
            
            if (smartResult.success && smartResult.ledgers && smartResult.ledgers.length > 0) {
              const ledger = smartResult.ledgers[0];
              const response = `**${ledger.name}** (${ledger.parent})\nClosing Balance: ₹${Math.abs(ledger.closingBalance || 0).toLocaleString('en-IN')}${(ledger.closingBalance || 0) < 0 ? ' Cr' : ' Dr'}`;
              addMessage("assistant", response, [ledger], undefined, smartResult.executionTime, undefined, 'smart');
              setConversationContext({});
              return;
            }
          }
        }
      }
      
      // Use the AI query processor
      const result = await (window as any).electronAPI.tallyProcessAiQuery(userQuery);
      console.log('🚀 Query result received:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        if (result.type === 'smart_query') {
          const smartResult = result.data || result;
          const response = formatSmartQueryResponse(smartResult);
          
          addMessage(
            "assistant", 
            response, 
            smartResult.ledgers, 
            undefined, 
            result.executionTime, 
            undefined, 
            'smart'
          );
        } else if (result.type === 'multiple_matches' || result.type === 'exact_match') {
          // Handle direct Tally query results
          console.log('🔍 Direct Tally result:', result);
          const response = formatSmartQueryResponse(result);
          console.log('📝 Formatted response:', response);
          addMessage(
            "assistant", 
            response, 
            result.ledgers || [], 
            undefined, 
            result.executionTime, 
            undefined, 
            'smart'
          );
          setConversationContext({});
        } else if (result.type === 'general' && result.requiresExecution && result.sql) {
          const sqlResult = await (window as any).electronAPI.tallyExecuteQuery(result.sql);
          
          if (sqlResult.success && sqlResult.data && sqlResult.data.length > 0) {
            addMessage(
              "assistant", 
              result.response, 
              sqlResult.data, 
              result.sql, 
              sqlResult.executionTime, 
              result.executionTime, 
              'general'
            );
          } else {
            addMessage("assistant", "No data found for your query.", undefined, result.sql, sqlResult.executionTime);
          }
          setConversationContext({});
        } else if (result.response || result.message) {
          // Handle any result that has a response or message
          const responseText = result.response || result.message || "Query completed";
          addMessage("assistant", responseText, result.data || result.ledgers, undefined, result.executionTime, undefined, 'general');
          setConversationContext({});
        } else {
          console.warn('⚠️ Unhandled result type:', result.type);
          addMessage("assistant", "Query completed but response format not recognized", undefined, undefined, result.executionTime, undefined, 'general');
          setConversationContext({});
        }
      } else {
        console.error('❌ Query processing failed:', result);
        const errorMessage = result?.response || result?.message || result?.error || 
          (typeof result === 'object' && Object.keys(result).length === 0 ? 
            "No response received from server. Please check your connection and try again." : 
            "Query processing failed");
        addMessage("error", `❌ ${errorMessage}`);
        setConversationContext({});
      }
    } catch (error: any) {
      console.error("Query execution error:", error);
      addMessage("error", `Query failed: ${error.message}`);
      setConversationContext({});
    } finally {
      setIsProcessing(false);
    }
  }, [inputMessage, isProcessing, isElectron, connectionStatus.isConnected, conversationContext, addMessage, formatSmartQueryResponse]);

  // Execute quick queries
  const executeQuickQuery = useCallback(async (query: string) => {
    if (isProcessing) return;
    if (!isElectron || !connectionStatus.isConnected) {
      return addMessage("error", "Not connected to Tally database. Please connect first.");
    }

    setIsProcessing(true);
    addMessage("user", query);
    
    try {
      const result = await (window as any).electronAPI.tallyProcessAiQuery(query);
      
      if (result.success && result.type === 'general' && result.requiresExecution && result.sql) {
        const sqlResult = await (window as any).electronAPI.tallyExecuteQuery(result.sql);
        
        if (sqlResult.success && sqlResult.data && sqlResult.data.length > 0) {
          addMessage("assistant", result.response, sqlResult.data, result.sql, sqlResult.executionTime, undefined, 'sql');
        } else {
          addMessage("assistant", "No data found.", undefined, result.sql, sqlResult.executionTime);
        }
      } else if (result.success) {
        addMessage("assistant", result.response, result.data, undefined, result.executionTime);
      } else {
        addMessage("error", result.response || "Query processing failed");
      }
    } catch (error: any) {
      console.error("Quick query error:", error);
      addMessage("error", `Query failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, isElectron, connectionStatus.isConnected, addMessage]);

  return (
    <div className="h-screen flex flex-col" style={{backgroundColor: '#fff7ed'}}>
      {/* Professional Header - Only show on chat view */}
      {currentView === 'chat' && (
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-black text-sm">TK</span>
              </div>
              <div>
                <h1 className="text-xl font-black text-gray-900">
                  TallyKaro AI
                </h1>
                <div className="text-xs text-slate-600 font-medium">Professional Desktop Assistant</div>
                <div className="text-xs text-gray-700 font-medium">📱 Support: +91 70214 58147</div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Company Selector */}
            {currentView === 'chat' && connectionStatus.isConnected && connectionStatus.companyName && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600 font-medium">Company:</span>
                <select
                  value={connectionStatus.companyName}
                  onChange={(e) => {
                    // TODO: Implement company switching
                    console.log('Company switch requested:', e.target.value);
                  }}
                  className="text-sm font-medium bg-white border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={connectionStatus.companyName}>{connectionStatus.companyName}</option>
                  {/* TODO: Add other available companies */}
                </select>
              </div>
            )}

            {currentView === 'chat' && (
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)} 
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100"
                title="Toggle Sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </button>
            )}

            <div className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium ${
              connectionStatus.isConnected 
                ? 'bg-green-100 text-green-800' 
                : isConnecting 
                ? 'bg-yellow-100 text-yellow-800' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus.isConnected 
                  ? 'bg-green-500' 
                  : isConnecting 
                  ? 'bg-yellow-500 animate-pulse' 
                  : 'bg-slate-400'
              }`}></div>
              <span>
                {connectionStatus.isConnected 
                  ? connectionStatus.companyName || 'Tally'
                  : isConnecting 
                  ? 'Connecting...' 
                  : 'Disconnected'
                }
              </span>
            </div>

            {/* Enhanced Sync Status with Progress */}
            {connectionStatus.isConnected && isSyncInitialized && (
              <div className="flex items-center space-x-3">
                {/* Sync Status Indicator */}
                <div className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm font-medium ${
                  syncStatus?.isRunning 
                    ? 'bg-gray-100 text-gray-800' 
                    : syncStatus?.errors && syncStatus.errors.length > 0
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    syncStatus?.isRunning 
                      ? 'bg-gray-500 animate-pulse' 
                      : syncStatus?.errors && syncStatus.errors.length > 0
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                  }`}></div>
                  <span>
                    {syncStatus?.currentTable
                      ? `Syncing ${syncStatus.currentTable}...`
                      : syncStatus?.isRunning 
                      ? 'Auto-Sync ON' 
                      : syncStatus?.errors && syncStatus.errors.length > 0
                      ? 'Sync Error'
                      : 'Auto-Sync OFF'
                    }
                  </span>
                </div>

                {/* Progress Bar for Active Sync */}
                {syncStatus?.progress && syncStatus.currentTable && (
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-gray-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${syncStatus.progress.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600 font-medium">
                      {syncStatus.progress.current}/{syncStatus.progress.total}
                    </span>
                    {syncStatus.estimatedTimeRemaining && syncStatus.estimatedTimeRemaining > 0 && (
                      <span className="text-xs text-slate-500">
                        ~{Math.ceil(syncStatus.estimatedTimeRemaining)}s
                      </span>
                    )}
                  </div>
                )}
                
                {/* Last Sync Time */}
                {syncStatus?.lastSync && !syncStatus.currentTable && (
                  <span className="text-xs text-slate-500">
                    Last: {new Date(syncStatus.lastSync).toLocaleTimeString()}
                  </span>
                )}
                
                {/* Manual Sync Button */}
                <button 
                  onClick={triggerManualSync}
                  disabled={syncStatus?.currentTable ? true : false}
                  className={`text-xs px-3 py-1 rounded-md transition-colors font-semibold border-2 ${
                    syncStatus?.currentTable 
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
                      : 'bg-gray-800 hover:bg-gray-700 text-white hover:shadow-sm'
                  }`}
                  style={{borderColor: '#0ea5e9'}}
                  title={syncStatus?.currentTable ? 'Sync in progress...' : 'Trigger manual sync'}
                >
                  {syncStatus?.currentTable ? 'Syncing...' : 'Sync Now'}
                </button>

                {/* Error Details (if any) */}
                {syncStatus?.errors && syncStatus.errors.length > 0 && (
                  <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-md max-w-xs truncate" title={syncStatus.errors.join(', ')}>
                    {syncStatus.errors.length} error{syncStatus.errors.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </header>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {currentView === 'setup' ? (
          <SetupView 
            config={config} 
            setConfig={setConfig} 
            isConnecting={isConnecting} 
            isElectron={isElectron} 
            onConnect={connectToTally}
          />
        ) : (
          <ChatView
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            isProcessing={isProcessing}
            chatContainerRef={chatContainerRef}
            messages={messages}
            messagesEndRef={messagesEndRef}
            inputRef={inputRef}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            executeUserQuery={executeUserQuery}
            executeQuickQuery={executeQuickQuery}
            syncStatus={syncStatus}
            formatISTTime={formatISTTime}
          />
        )}
      </main>
    </div>
  );
}