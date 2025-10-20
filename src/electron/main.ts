import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { join } from 'path';
import { TallyService, TallyConfig } from '../electron/services/tally-services';
import { BillService } from '../electron/services/bill-service';
import { CloudSyncService } from '../electron/services/cloud-sync';
import { EnhancedCloudSyncService } from '../electron/services/enhanced-cloud-sync';
import { OptimizedQueryService } from '../electron/services/optimized-query-service';
import { conversationContext } from '../electron/services/conversation-context';
import { settingsService } from '../electron/services/settings-service';
import { PDFService } from '../electron/services/pdf-service';
import { authService } from '../electron/services/auth-service';
import { ComprehensiveQueryHandler } from '../electron/services/comprehensive-query-handler';
import { tallyFixer } from '../electron/services/tally-connection-fixer';
import { SalesPurchaseSyncService } from '../electron/services/sales-purchase-sync-service';
import { SupabaseService } from '../electron/services/supabase-service';
import { writeFileSync } from 'fs';
import { createLocalServer } from './server';

// Load environment variables
const path = require('path');
const fs = require('fs');

// Try to load .env file first (development)
try {
  require('dotenv').config();
  console.log('Loaded .env file for development');
} catch (error) {
  console.log('No .env file found, trying embedded config');
}

// Always load embedded config as fallback (production)
try {
  // Try different possible paths for the config file
  let embeddedConfig;
  const possiblePaths = [
    './config/environment.js',
    '../config/environment.js', 
    '../../config/environment.js',
    path.join(__dirname, 'config', 'environment.js'),
    path.join(__dirname, '..', 'config', 'environment.js')
  ];
  
  for (const configPath of possiblePaths) {
    try {
      embeddedConfig = require(configPath);
      console.log(`Loaded embedded config from: ${configPath}`);
      break;
    } catch (err) {
      // Try next path
    }
  }
  
  if (!embeddedConfig) {
    // If all paths fail, use placeholders (real credentials should be in .env or config file)
    console.log('Using placeholder configuration - set real credentials in .env file');
    embeddedConfig = {
      NODE_ENV: 'production',
      GOOGLE_AI_API_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      OPENAI_API_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      AWS_ACCESS_KEY_ID: 'PLACEHOLDER_SET_IN_ENV_FILE',
      AWS_SECRET_ACCESS_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      AWS_REGION: 'ap-south-1',
      S3_BUCKET_NAME: 'tallykaro-client-data',
      S3_ENCRYPTION_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      ENCRYPTION_MASTER_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      SUPABASE_URL: 'https://your-project.supabase.co',
      SUPABASE_ANON_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      SUPABASE_SERVICE_ROLE_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
      POSTGRES_HOST: 'db.your-project.supabase.co',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'postgres',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'PLACEHOLDER_SET_IN_ENV_FILE',
      CACHE_EXPIRY_MINUTES: '30',
      CONTEXT_EXPIRY_MINUTES: '10',
      MAX_SEARCH_RESULTS: '10'
    };
  }
  
  Object.keys(embeddedConfig).forEach(key => {
    if (!process.env[key] || process.env[key] === '' || process.env[key] === 'undefined') {
      process.env[key] = embeddedConfig[key];
      console.log(`Set ${key} from embedded config`);
    }
  });
  console.log('✅ Loaded embedded environment configuration');
} catch (configError) {
  console.error('❌ Failed to load embedded config:', configError);
}

// Verify critical environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'OPENAI_API_KEY'];
console.log('=== Environment Variables Status ===');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  console.log(`${envVar}: ${value ? 'SET' : 'MISSING'} ${value ? `(${value.substring(0, 10)}...)` : ''}`);
});
console.log('===================================');

const tallyService = new TallyService();
const billService = new BillService(tallyService);
const optimizedQueryService = new OptimizedQueryService(tallyService);
const supabaseService = new SupabaseService();
const salesPurchaseSyncService = new SalesPurchaseSyncService(tallyService, supabaseService);
const pdfService = new PDFService();
const comprehensiveQueryHandler = new ComprehensiveQueryHandler(tallyService, pdfService);

// Auto-sync service instance
let cloudSyncService: EnhancedCloudSyncService | null = null;

// Single instance lock - CRITICAL FIX for multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('Second instance attempted, focusing existing window...');
    // Someone tried to run a second instance, we should focus our window instead.
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

// Enhanced logging for main process
console.log('=== TALLYKARO DESKTOP CONNECTOR ===');
console.log('Main process starting with enhanced smart query system');
console.log('Node version:', process.version);
console.log('Electron version:', process.versions.electron);

async function createWindow(): Promise<void> {
  console.log('Creating main application window');
  
  const preloadPath = join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('__dirname:', __dirname);
  
  // Check if preload file exists
  const fs = require('fs');
  const preloadExists = fs.existsSync(preloadPath);
  console.log('Preload file exists:', preloadExists);
  
  if (!preloadExists) {
    console.error('❌ Preload script not found at:', preloadPath);
    console.log('📁 Available files in __dirname:', fs.readdirSync(__dirname));
  }
  
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      preload: preloadPath,
    },
    titleBarStyle: 'default',
    show: false,
    icon: join(__dirname, '../../build-assets/icon.ico')
  });

  // Remove menu bar
  Menu.setApplicationMenu(null);

  // More reliable development mode detection
  const isDevelopment = !app.isPackaged;
  
  console.log('Environment detection:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- app.isPackaged:', app.isPackaged);
  console.log('- process.argv:', process.argv.slice(-3));
  console.log('- isDevelopment:', isDevelopment);

  if (isDevelopment) {
    // Detect available Next.js port
    const devPort = process.env.PORT || '3000';
    const ports = [devPort, '3000', '3001', '3002', '3003', '3004', '3005', '3006', '3007', '3008'];
    
    console.log('Development mode: Attempting to connect to Next.js server');
    
    const tryLoadURL = async (port: string): Promise<boolean> => {
      try {
        const url = `http://localhost:${port}`;
        console.log(`Trying to load ${url}`);
        await mainWindow.loadURL(url);
        mainWindow.webContents.openDevTools();
        console.log(`Successfully loaded development URL: ${url}`);
        return true;
      } catch (error) {
        console.log(`Failed to connect to port ${port}`);
        return false;
      }
    };
    
    // Wait a bit for Next.js to be ready, then try ports
    setTimeout(async () => {
      for (const port of ports) {
        if (await tryLoadURL(port)) {
          break;
        }
      }
    }, 3000);
  } else {
    console.log('Production mode: Starting local server for Next.js files');
    console.log('__dirname:', __dirname);
    console.log('process.resourcesPath:', process.resourcesPath);
    
    try {
      // Start a local server to serve the Next.js static files
      const serverUrl = await createLocalServer(3001);
      console.log('Local server started:', serverUrl);
      
      // Load from the local server
      await mainWindow.loadURL(serverUrl);
      console.log('✅ Successfully loaded from local server');
    } catch (error) {
      console.error('❌ Failed to start local server or load app:', error);
      
      // Fallback: show error page
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head><title>TallyKaro Desktop Connector</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1>TallyKaro Desktop Connector</h1>
          <p style="color: red;"> Application failed to start</p>
          <p>Failed to start the local server for the Next.js frontend.</p>
          <p>Error: ${String(error)}</p>
        </body>
        </html>
      `));
    }
  }

  mainWindow.once('ready-to-show', () => {
    console.log('Main window ready to show');
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.isMinimized()) mainWindow.restore();
  });

  // Handle navigation errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });
}

app.whenReady().then(async () => {
  console.log('Electron app ready, creating window');

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('Activating app, creating new window');
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    console.log('Quitting application');
    app.quit();
  }
});

// ==================== ENHANCED IPC HANDLERS ====================

/**
 * ENHANCED: Connect to Tally with comprehensive logging
 */
ipcMain.handle("tally-connect", async (event, config: TallyConfig) => {
  console.log("\n=== IPC: TALLY CONNECT REQUEST ===");
  console.log("Config received:", {
    company: config.companyName || "[NOT SET]",
    server: config.serverPath || "localhost",
    port: config.port || 9000,
    driver: config.odbcDriver || "default",
    mobileNumber: config.mobileNumber || "[NOT SET]",
    hasPassword: !!config.password
  });

  try {
    const startTime = Date.now();

    console.log("BEFORE CONNECT - Service state:");
    console.log("- Service connection exists:", tallyService.isConnected());
    console.log("- Is connecting flag:", (tallyService as any).isConnecting);

    console.log("Starting connection attempt...");
    const result = await tallyService.connect(config);
    const executionTime = Date.now() - startTime;

    // If Tally connection failed but we have mobile/password, enable offline mode
    if (!result.isConnected && config.mobileNumber && config.password && config.companyName) {
      console.log("⚠️ Tally connection failed, enabling OFFLINE MODE with Supabase");
      console.log("📱 Authenticating with mobile:", config.mobileNumber);

      try {
        // Authenticate with Supabase
        const { AuthService } = await import('./services/auth-service');
        const authService = new AuthService();
        const authResult = await authService.loginWithMobile({
          mobileNumber: config.mobileNumber!,
          password: config.password!
        });

        if (authResult.success) {
          console.log("✅ Supabase authentication successful - OFFLINE MODE enabled");
          console.log("📊 User will query synced data from Supabase");

          return {
            isConnected: true,
            offlineMode: true,
            companyName: config.companyName,
            warnings: [
              '⚠️ Tally is not accessible - Running in OFFLINE MODE',
              '✅ Authenticated with Supabase successfully',
              '📊 You can query synced data from Supabase',
              '💡 Start Tally to enable real-time queries and syncing'
            ],
            availableData: ['Supabase (synced data)'],
            executionTime,
            timestamp: new Date().toISOString()
          };
        } else {
          console.log("❌ Supabase authentication failed:", authResult.message);
        }
      } catch (authError) {
        console.error("❌ Offline mode authentication error:", authError);
      }
    }
    
    console.log("AFTER CONNECT - Service state:");
    console.log("- Service connection exists:", tallyService.isConnected());
    console.log("- Result isConnected:", result.isConnected);
    console.log("- Available data sources:", result.availableData?.length || 0);
    console.log("- Warnings count:", result.warnings?.length || 0);
    
    if (result.isConnected) {
      console.log("CONNECTION SUCCESS: Running immediate debug check...");
      
      try {
        const immediateDebug = await tallyService.debugConnectionState();
        console.log("IMMEDIATE DEBUG RESULTS:");
        console.log("- Connection object exists:", immediateDebug.connectionObject?.exists);
        console.log("- Config object exists:", immediateDebug.configObject?.exists);
        console.log("- Connection test success:", immediateDebug.connectionTest?.success);
        console.log("- Tally access success:", immediateDebug.connectionTest?.tallySpecific?.success);
        
        (result as any).debugInfo = immediateDebug;
        
        if (!immediateDebug.connectionObject?.exists) {
          console.log("CRITICAL BUG DETECTED: Connection shows success but no connection object stored!");
          console.log("This indicates the connection storage mechanism failed");
        }
        
      } catch (debugError) {
        console.error("Immediate debug check failed:", debugError);
        (result as any).debugInfo = { error: String(debugError) };
      }
      
      console.log("Testing connection with immediate query...");
      try {
        const quickTestResult = await tallyService.executeQuery("SELECT COUNT(*) as IMMEDIATE_TEST FROM COMPANY");
        console.log("Immediate query test:", quickTestResult.success ? "SUCCESS" : "FAILED");
        console.log("Query result:", quickTestResult);
        (result as any).immediateQueryTest = quickTestResult;
      } catch (queryError) {
        console.error("Immediate query test failed:", queryError);
        (result as any).immediateQueryTest = { success: false, error: String(queryError) };
      }
      
    } else {
      console.log("CONNECTION FAILED:", result.error);
    }

    console.log(`IPC Connect completed in ${executionTime}ms`);
    
    return {
      ...result,
      executionTime: result.executionTime || executionTime,
      timestamp: result.timestamp || new Date().toISOString()
    };
    
  } catch (error) {
    console.error("IPC: Connect critical error:", error);
    return {
      isConnected: false,
      error: `Connection failed: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * ENHANCED: Disconnect with cleanup verification
 */
ipcMain.handle("tally-disconnect", async () => {
  console.log("\n=== IPC: TALLY DISCONNECT REQUEST ===");
  
  try {
    const startTime = Date.now();
    
    console.log("BEFORE disconnect - Service state:", tallyService.isConnected());
    await tallyService.disconnect();
    console.log("AFTER disconnect - Service state:", tallyService.isConnected());
    
    const executionTime = Date.now() - startTime;
    console.log(`IPC: Disconnect successful in ${executionTime}ms`);
    
    return { 
      success: true,
      executionTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("IPC: Disconnect error:", error);
    return { 
      success: false, 
      error: String(error),
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * ENHANCED: Get status with validation details
 */
ipcMain.handle("tally-get-status", async () => {
  console.log("\n=== IPC: GET STATUS REQUEST ===");
  
  try {
    const startTime = Date.now();
    const result = await tallyService.getStatus();
    const executionTime = Date.now() - startTime;
    
    console.log(`IPC: Status check completed in ${executionTime}ms:`, {
      connected: result.isConnected,
      company: result.companyName || 'none',
      error: !!result.error
    });

    return {
      ...result,
      executionTime: result.executionTime || executionTime,
      timestamp: result.timestamp || new Date().toISOString()
    };
  } catch (error) {
    console.error("IPC: Get status error:", error);
    return {
      isConnected: false,
      error: `Status check failed: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Get available companies from Tally
 */
ipcMain.handle("tally-get-companies", async () => {
  console.log("\n=== IPC: GET AVAILABLE COMPANIES REQUEST ===");
  
  try {
    const startTime = Date.now();
    const result = await tallyService.getAvailableCompanies();
    const executionTime = Date.now() - startTime;
    
    console.log("IPC: Companies retrieved:", {
      success: result.success,
      count: result.companies?.length || 0,
      executionTime
    });
    
    return {
      ...result,
      executionTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("IPC: Get companies error:", error);
    return {
      success: false,
      error: String(error),
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * ENHANCED: Execute query with smart query detection
 */
ipcMain.handle("tally-execute-query", async (event, sql: string) => {
  const sanitizedSQL = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;
  console.log("\n=== IPC: EXECUTE QUERY REQUEST ===");
  console.log("SQL:", sanitizedSQL);
  console.log("Service connected:", tallyService.isConnected());
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      console.log("Query rejected: Service reports not connected");
      return {
        success: false,
        error: 'Not connected to Tally database. Please connect first.',
        query: sanitizedSQL,
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime
      };
    }
    
    console.log("Executing query via service...");
    const result = await tallyService.executeQuery(sql);
    const executionTime = Date.now() - startTime;
    
    console.log(`Query completed in ${executionTime}ms:`, {
      success: result.success,
      rows: result.rowCount || 0,
      hasError: !!result.error
    });

    return {
      ...result,
      query: sanitizedSQL,
      executionTime: result.executionTime || executionTime,
      timestamp: result.timestamp || new Date().toISOString()
    };
    
  } catch (error) {
    console.error("IPC: Execute query error:", error);
    return {
      success: false,
      error: `Query execution failed: ${error}`,
      query: sanitizedSQL,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * NEW: Smart ledger query handler
 */
ipcMain.handle("tally-query-ledger-smart", async (event, userInput: string) => {
  console.log("\n=== IPC: SMART LEDGER QUERY REQUEST ===");
  console.log("User input:", userInput);
  console.log("Service connected:", tallyService.isConnected());
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      console.log("Smart query rejected: Service not connected");
      return {
        success: false,
        type: 'no_match',
        ledgers: [],
        message: 'Not connected to Tally database. Please connect first.',
        executionTime: Date.now() - startTime
      };
    }
    
    console.log("Executing smart ledger query...");
    const result = await tallyService.queryLedgerSmart(userInput);
    const executionTime = Date.now() - startTime;
    
    console.log(`Smart query completed in ${executionTime}ms:`, {
      success: result.success,
      type: result.type,
      matchCount: result.ledgers.length,
      hasSuggestions: !!result.suggestions?.length
    });

    return {
      ...result,
      userInput,
      executionTime: result.executionTime || executionTime,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("IPC: Smart query error:", error);
    return {
      success: false,
      type: 'no_match',
      ledgers: [],
      message: `Smart query failed: ${error}`,
      userInput,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Get business data with enhanced error handling
 */
ipcMain.handle("tally-get-business-data", async () => {
  console.log("\n=== IPC: GET BUSINESS DATA REQUEST ===");
  console.log("Service connected:", tallyService.isConnected());
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      console.log("Business data request rejected: Not connected");
      return {
        error: 'Not connected to Tally database. Please connect first.',
        success: false,
        _metadata: {
          timestamp: new Date().toISOString(),
          hasError: true,
          connectionState: 'disconnected'
        }
      };
    }
    
    console.log("Fetching business data...");
    const result = await tallyService.getBusinessData();
    const executionTime = Date.now() - startTime;
    
    console.log(`Business data fetch completed in ${executionTime}ms:`, {
      hasError: !!result.error,
      successRate: result._summary?.successRate || 0,
      tablesCount: result._summary?.availableTables?.length || 0
    });

    return {
      ...result,
      success: !result.error,
      _metadata: {
        executionTime,
        timestamp: new Date().toISOString(),
        hasError: !!result.error,
        connectionState: tallyService.isConnected() ? 'connected' : 'disconnected'
      }
    };
  } catch (error) {
    console.error("IPC: Get business data error:", error);
    return {
      error: `Business data retrieval failed: ${error}`,
      success: false,
      _metadata: {
        timestamp: new Date().toISOString(),
        hasError: true,
        connectionState: tallyService.isConnected() ? 'connected' : 'disconnected'
      }
    };
  }
});

// ==================== STOCK ITEM HANDLERS ====================

/**
 * Get all stock items from Tally
 */
ipcMain.handle("tally-get-stock-items", async () => {
  console.log("\n=== IPC: GET STOCK ITEMS REQUEST ===");
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        executionTime: Date.now() - startTime
      };
    }
    
    const result = await tallyService.getStockItems();
    
    console.log(`Stock items query completed in ${result.executionTime}ms:`, {
      success: result.success,
      itemCount: result.data?.length || 0,
      error: result.error || 'none'
    });
    
    return result;
    
  } catch (error) {
    console.error("Stock items query error:", error);
    return {
      success: false,
      error: `Failed to get stock items: ${error}`,
      executionTime: Date.now() - Date.now()
    };
  }
});

/**
 * Get stock summary with analysis
 */
ipcMain.handle("tally-get-stock-summary", async () => {
  console.log("\n=== IPC: GET STOCK SUMMARY REQUEST ===");
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        executionTime: Date.now() - startTime
      };
    }
    
    const result = await tallyService.getStockSummary();
    
    console.log(`Stock summary completed in ${result.executionTime}ms:`, {
      success: result.success,
      totalItems: result.summary?.totalItems || 0,
      totalValue: result.summary?.totalValue || 0,
      error: result.error || 'none'
    });
    
    return result;
    
  } catch (error) {
    console.error("Stock summary error:", error);
    return {
      success: false,
      error: `Failed to get stock summary: ${error}`,
      executionTime: Date.now() - Date.now()
    };
  }
});

/**
 * Search stock items
 */
ipcMain.handle("tally-search-stock-items", async (event, searchTerm: string) => {
  console.log("\n=== IPC: SEARCH STOCK ITEMS REQUEST ===");
  console.log("Search term:", searchTerm);
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        executionTime: Date.now() - startTime
      };
    }
    
    const result = await tallyService.searchStockItems(searchTerm);
    
    console.log(`Stock search completed in ${result.executionTime}ms:`, {
      success: result.success,
      itemCount: result.data?.length || 0,
      searchTerm: searchTerm,
      error: result.error || 'none'
    });
    
    return result;
    
  } catch (error) {
    console.error("Stock search error:", error);
    return {
      success: false,
      error: `Failed to search stock items: ${error}`,
      executionTime: Date.now() - Date.now()
    };
  }
});

/**
 * Sync ODBC data to S3/Supabase for better performance
 */
ipcMain.handle("tally-sync-odbc-to-cloud", async () => {
  console.log("\n=== IPC: SYNC ODBC TO CLOUD REQUEST ===");
  
  try {
    const startTime = Date.now();
    
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        syncedTables: [],
        executionTime: Date.now() - startTime
      };
    }
    
    const result = await tallyService.syncODBCDataToCloud();
    
    console.log(`ODBC sync completed in ${Date.now() - startTime}ms:`, {
      success: result.success,
      syncedTables: result.syncedTables,
      error: result.error || 'none'
    });
    
    return {
      ...result,
      executionTime: Date.now() - startTime
    };
    
  } catch (error) {
    console.error("ODBC sync error:", error);
    return {
      success: false,
      error: `Failed to sync ODBC data: ${error}`,
      syncedTables: [],
      executionTime: Date.now() - Date.now()
    };
  }
});

/**
 * Diagnose stock table availability and data
 */
ipcMain.handle("tally-diagnose-stock-tables", async () => {
  console.log("\n=== IPC: DIAGNOSE STOCK TABLES REQUEST ===");
  
  try {
    const startTime = Date.now();
    const result = await tallyService.diagnoseStockTables();
    
    console.log("✅ Stock table diagnosis completed");
    console.log("Working tables:", result.tables.filter(t => t.status === 'SUCCESS').length);
    
    return {
      ...result,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Stock table diagnosis failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      diagnosis: `Failed to diagnose stock tables: ${errorMessage}`,
      tables: [],
      executionTime: Date.now() - Date.now(),
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Debug connection state with comprehensive analysis
 */
ipcMain.handle("tally-debug-connection-state", async () => {
  console.log("\n=== IPC: DEBUG CONNECTION STATE REQUEST ===");
  
  try {
    const startTime = Date.now();
    const debugResult = await tallyService.debugConnectionState();
    const executionTime = Date.now() - startTime;
    
    console.log(`Debug completed in ${executionTime}ms:`, {
      healthScore: debugResult.overallHealth?.healthScore || 0,
      connectionExists: debugResult.serviceState?.connectionExists || false,
      testsCount: debugResult.tallySpecificTests?.length || 0
    });

    return {
      ...debugResult,
      _metadata: {
        executionTime,
        timestamp: new Date().toISOString(),
        ipcHandler: 'tally-debug-connection-state'
      }
    };
  } catch (error) {
    console.error("IPC: Debug connection state error:", error);
    return {
      error: `Debug failed: ${error}`,
      _metadata: {
        timestamp: new Date().toISOString(),
        hasError: true,
        ipcHandler: 'tally-debug-connection-state'
      }
    };
  }
});

// ==================== VOUCHER TABLE DISCOVERY ====================

/**
 * Test Tally ODBC for Vouchers table
 */
ipcMain.handle("tally-test-vouchers", async () => {
  console.log("\n=== IPC: TEST TALLY VOUCHERS TABLE ===");

  try {
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Not connected to Tally"
      };
    }

    const results = {
      tables: [] as any[],
      vouchersExists: false,
      sampleVoucher: null as any,
      salesVouchers: [] as any[],
      errors: [] as string[]
    };

    // Test 1: Try to query Vouchers table
    console.log("Testing Vouchers table...");
    try {
      const voucherTest = await tallyService.executeQuery("SELECT TOP 5 * FROM Vouchers WHERE VoucherTypeName = 'Sales'");
      if (voucherTest.success) {
        results.vouchersExists = true;
        results.salesVouchers = voucherTest.data || [];
        console.log(`✅ Found ${results.salesVouchers.length} sales vouchers`);
      }
    } catch (err: any) {
      results.errors.push(`Vouchers table test: ${err.message}`);
      console.log("❌ Vouchers table test failed:", err.message);
    }

    // Test 2: Try alternative table names
    const tablesToTry = ['Voucher', 'VoucherEntries', 'LedgerEntries', 'ALLVOUCHERS'];
    for (const table of tablesToTry) {
      try {
        const test = await tallyService.executeQuery(`SELECT TOP 1 * FROM ${table}`);
        if (test.success && test.data) {
          results.tables.push({
            name: table,
            exists: true,
            columns: test.data.length > 0 ? Object.keys(test.data[0]) : []
          });
        }
      } catch (err: any) {
        results.tables.push({
          name: table,
          exists: false,
          error: err.message
        });
      }
    }

    return {
      success: true,
      ...results
    };

  } catch (error) {
    console.error("Voucher test error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Diagnostic handlers removed - not needed in production

/**
 * DIRECT TALLY QUERY PROCESSOR - Bypasses Supabase completely
 * Now uses Comprehensive Query Handler for all query categories
 */
async function processDirectTallyQuery(userQuery: string): Promise<any> {
  const query = userQuery.toLowerCase().trim();
  
  console.log("🔄 Processing query with Comprehensive Query Handler...");
  
  // Use the comprehensive query handler for all queries
  try {
    const result = await comprehensiveQueryHandler.processQuery(userQuery);
    
    if (result.success) {
      console.log(`✅ Query processed successfully by ${result.category} handler`);
      return {
        success: true,
        type: result.category.toLowerCase(),
        response: result.response,
        data: result.data,
        executionTime: result.executionTime,
        cacheHit: false,
        timestamp: new Date().toISOString()
      };
    } else {
      console.log(`❌ Query processing failed: ${result.response}`);
      return {
        success: false,
        type: 'error',
        response: result.response,
        data: null,
        executionTime: result.executionTime,
        cacheHit: false,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    console.error("Comprehensive query handler error:", error);
    return {
      success: false,
      type: 'error',
      response: `Error processing query: ${error}`,
      data: null,
      executionTime: 0,
      cacheHit: false,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Process AI query with direct Tally as primary, Supabase as fallback
 */
ipcMain.handle("tally-process-ai-query", async (event, userQuery: string) => {
  console.log("\n=== IPC: PROCESS AI QUERY REQUEST (SUPABASE) ===");
  console.log("User query:", userQuery);
  
  try {
    const startTime = Date.now();
    
    // First sync data from S3 to Supabase if needed
    // Get the real client ID from the auto-sync service instead of hardcoded default
    const clientId = cloudSyncService?.getConfig?.()?.clientId || 'rohit-steels-from-1-apr-23';
    
    // Check if we should sync (only sync once on startup or if data is stale)
    const shouldSync = await shouldSyncData(clientId);
    if (shouldSync) {
      console.log("🔄 Syncing S3 data to Supabase for fresh results...");
      await optimizedQueryService.syncFromS3(clientId);
    }

    // Check for bill generation requests (only for customer invoices, not stock PDFs)
    const isBillRequest = (
      (userQuery.toLowerCase().includes('bill') || userQuery.toLowerCase().includes('invoice')) && 
      !userQuery.toLowerCase().includes('stock') && 
      !userQuery.toLowerCase().includes('pipe') && 
      !userQuery.toLowerCase().includes('item') && 
      !userQuery.toLowerCase().includes('inventory')
    );
    
    if (isBillRequest) {
      // Extract party name if provided
      const partyMatch = userQuery.match(/(?:for|of|to)\s+([^.]+)/i);
      const partyName = partyMatch ? partyMatch[1].trim() : 'Sample Customer';
      
      console.log("Bill generation request detected for party:", partyName);
      
      try {
        // Actually generate the PDF
        const { BillService } = await import('./services/bill-service');
        const billService = new BillService(tallyService);
        const result = await billService.generateBillPDF(partyName);
        
        if (result.success && result.pdf) {
          const downloadsPath = require('os').homedir() + '\\Downloads';
          const fileName = `Bill_${partyName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
          const fullPath = require('path').join(downloadsPath, fileName);
          
          return {
            success: true,
            type: 'bill_generation',
            response: `PDF bill generated successfully for ${partyName}\n\nFile: ${fileName}\nLocation: ${downloadsPath}\nSize: ${(result.pdf.length / 1024).toFixed(1)} KB\n\nOpen File Explorer and check your Downloads folder.`,
            partyName: partyName,
            filePath: fullPath,
            timestamp: new Date().toISOString()
          };
        } else {
          return {
            success: false,
            type: 'bill_generation',
            response: `Failed to generate PDF for ${partyName}: ${result.error || 'Unknown error'}`,
            partyName: partyName,
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        console.error("Bill generation failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          type: 'bill_generation',
          response: `Failed to generate PDF for ${partyName}: ${errorMessage}`,
          partyName: partyName,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Mock WhatsApp number for context (in production, get from WhatsApp integration)
    const whatsappNumber = '+919876543210'; // This would come from WhatsApp
    
    // Check for conversation continuation
    const isContinuation = conversationContext.isContinuation(whatsappNumber, clientId, userQuery);
    
    if (isContinuation) {
      console.log("🔄 Processing conversation continuation...");
      const selectedItem = conversationContext.processContinuation(whatsappNumber, clientId, userQuery);
      
      if (selectedItem) {
        const balance = Math.abs(selectedItem.closing_balance);
        const type = selectedItem.closing_balance >= 0 ? 'Dr' : 'Cr';
        const response = `**${selectedItem.name}** (${selectedItem.parent})\nClosing Balance: Rs.${balance.toLocaleString('en-IN')} ${type}`;
        
        // Update context
        conversationContext.updateContext(whatsappNumber, clientId, userQuery, response, 'ledger_details', selectedItem);
        
        return {
          success: true,
          type: 'ledger_continuation',
          response: response,
          data: selectedItem,
          executionTime: Date.now() - startTime,
          cacheHit: false,
          timestamp: new Date().toISOString()
        };
      }
    }

    // Check for stock/inventory queries that need direct Tally access (including Hindi/Hinglish)
    // BUT exclude ledger counting and company queries
    const userQueryLower = userQuery.toLowerCase();
    
    // First check if this is NOT a stock query (exclude these)
    // Enhanced detection to prevent cash/balance queries from being routed to stock
    const cashBalancePatterns = [
      'cash', 'paisa', 'balance', 'bank', 'ledger', 'account',
      'mere paas kitna cash', 'mere paas kitna paisa', 'kitna cash hai', 'kitna balance hai',
      'cash balance', 'bank balance', 'balance kitna'
    ];
    
    const nonStockPatterns = [
      'company', 'sales', 'revenue', 'profit', 'loss', 'customer', 'supplier',
      'highest', 'lowest', 'sabse zyada', 'sabse kam'
    ];
    
    // First check if it's clearly a cash/balance query
    const isCashBalanceQuery = cashBalancePatterns.some(pattern => 
      userQueryLower.includes(pattern)
    );
    
    const isNonStockQuery = isCashBalanceQuery || nonStockPatterns.some(pattern => 
      userQueryLower.includes(pattern)
    );
    
    if (!isNonStockQuery) {
      const stockKeywords = [
        // Very specific stock terms only
        'stock item', 'stock items', 'inventory item', 'inventory items',
        'stock summary', 'inventory summary', 'list all stock', 'show stock',
        'pipe', 'pipes', 'steel', 'iron', 'cement', 'rod', 'wire', 
        'sheet', 'plate', 'tube', 'bar', 'angle', 'goods', 'material',
        // Hindi/Hinglish terms - but be careful
        'saman', 'samaan', 'maal kitna', 'stock kya hai', 'inventory kya'
      ];
      
      // More specific "how many" detection - must be very specific
      const isStockHowMany = userQueryLower.includes('how many') && 
        (userQueryLower.includes('items') || userQueryLower.includes('stock') || 
         userQueryLower.includes('inventory') || userQueryLower.includes('pipe') ||
         userQueryLower.includes('material'));
      
      // Or direct stock keywords
      const isDirectStockQuery = stockKeywords.some(keyword => 
        userQueryLower.includes(keyword)
      );
      
      var isStockQuery = isStockHowMany || isDirectStockQuery;
    } else {
      var isStockQuery = false; // Explicitly not a stock query
    }

    if (isStockQuery && tallyService.isConnected()) {
      console.log(" Stock query detected, querying Tally directly...");
      
      try {
        const query = userQuery.toLowerCase();
        let stockResult;
        
        if (query.includes('summary') || query.includes('status') || query.includes('how is') || query.includes('looking')) {
          // Stock summary request - use Stock Summary from Inventory Books (per Tally navigation guide)
          // First try Stock Summary table (correct Tally path: Gateway → Display More Reports → Inventory Books → Stock Summary)
          try {
            // StockSummary table doesn't exist in Tally ODBC, use STOCKITEM table instead
            const stockSummaryResult = await tallyService.executeQuery(`
              SELECT $Name as name, $ClosingBalance as quantity, $ClosingRate as rate, ($ClosingBalance * $ClosingRate) as amount, 'NOS' as unit
              FROM STOCKITEM 
              ORDER BY $Name
            `);
            
            if (stockSummaryResult.success && stockSummaryResult.data && stockSummaryResult.data.length > 0) {
              console.log(` Found ${stockSummaryResult.data.length} stock items from STOCKITEM table`);
              
              // Process Stock Summary data
              const totalItems = stockSummaryResult.data.length;
              const totalValue = stockSummaryResult.data.reduce((sum: number, item: any) => {
                return sum + Math.abs(parseFloat(item.amount || item.$Amount || 0));
              }, 0);
              
              const zeroStockItems = stockSummaryResult.data.filter((item: any) => {
                const quantity = parseFloat(item.quantity || item.$Quantity || 0);
                return quantity === 0;
              });
              
              const lowStockItems = stockSummaryResult.data.filter((item: any) => {
                const quantity = parseFloat(item.quantity || item.$Quantity || 0);
                return quantity > 0 && quantity < 10; // Define low stock threshold
              });
              
              const summary = {
                totalItems,
                totalValue,
                zeroStockItems,
                lowStockItems
              };
              
              stockResult = {
                success: true,
                summary,
                data: stockSummaryResult.data
              };
            } else {
              throw new Error('STOCKITEM table not available');
            }
          } catch (stockSummaryError) {
            console.log(' Stock Summary table not available, using detailed method...');
            // Fallback: use detailed method with fallbacks
          stockResult = await tallyService.getDetailedStockSummary();
          }
          
          if (stockResult.success && stockResult.summary) {
            const summary = stockResult.summary;
            const response = ` **Stock Summary**\n\n` +
              ` **Total Items:** ${summary.totalItems}\n` +
              `💰 **Total Value:** Rs.${summary.totalValue.toLocaleString('en-IN')}\n` +
              ` **Zero Stock Items:** ${summary.zeroStockItems.length}\n` +
              `📉 **Low Stock Items:** ${summary.lowStockItems.length}\n\n`;
            
            return {
              success: true,
              type: 'inventory',
              response: response,
              data: stockResult.data,
              executionTime: Date.now() - startTime,
              cacheHit: false,
              timestamp: new Date().toISOString()
            };
          }
        } else if (query.includes('list all') || query.includes('show all')) {
          // List all stock items
          stockResult = await tallyService.getStockItems();
          
          if (stockResult.success && stockResult.data) {
            const items = stockResult.data.slice(0, 10); // Show first 10
            let response = ` **Stock Items (Showing ${items.length} of ${stockResult.data.length}):**\n\n`;
            
            items.forEach((item, i) => {
              response += `${i + 1}. **${item.name}** - ${item.closingBalance} ${item.uom || 'Units'}\n`;
            });
            
            if (stockResult.data.length > 10) {
              response += `\n... and ${stockResult.data.length - 10} more items.`;
            }
            
            return {
              success: true,
              type: 'inventory',
              response: response,
              data: stockResult.data,
              executionTime: Date.now() - startTime,
              cacheHit: false,
              timestamp: new Date().toISOString()
            };
          }
        } else if (query.includes('pipe') || query.includes('pipes')) {
          // Search for pipe items
          stockResult = await tallyService.searchStockItems('pipe');
          
          if (stockResult.success && stockResult.data && stockResult.data.length > 0) {
            let response = `🔧 **Pipe Stock Items:**\n\n`;
            
            stockResult.data.forEach((item, i) => {
              response += `${i + 1}. **${item.name}** - ${item.closingBalance} ${item.uom || 'Units'}\n`;
            });
            
            return {
              success: true,
              type: 'inventory',
              response: response,
              data: stockResult.data,
              executionTime: Date.now() - startTime,
              cacheHit: false,
              timestamp: new Date().toISOString()
            };
          }
        } else if (query.includes('how many') || query.includes('quantity')) {
          // Generic "how many [item]" handler - extract item name and search
          const itemMatch = query.match(/how many\s+(.+?)\s+(?:do i have|i have)/i) || 
                           query.match(/quantity\s+of\s+(.+)/i) ||
                           query.match(/how many\s+(.+)/i);
          
          if (itemMatch && itemMatch[1]) {
            const itemName = itemMatch[1].trim();
            console.log(` Searching for stock item: "${itemName}"`);
            
            stockResult = await tallyService.searchStockItems(itemName);
            
            if (stockResult.success && stockResult.data && stockResult.data.length > 0) {
              let response = ` **${itemName.toUpperCase()} Stock Items:**\n\n`;
              
              stockResult.data.forEach((item, i) => {
                response += `${i + 1}. **${item.name}** - ${item.closingBalance} ${item.uom || 'Units'}\n`;
              });
              
              return {
                success: true,
                type: 'inventory',
                response: response,
                data: stockResult.data,
                executionTime: Date.now() - startTime,
                cacheHit: false,
                timestamp: new Date().toISOString()
              };
            } else {
              // No exact match found, try to show available items
              const allStockResult = await tallyService.getStockItems();
              if (allStockResult.success && allStockResult.data) {
                const similarItems = allStockResult.data.filter(item => 
                  item.name.toLowerCase().includes(itemName.toLowerCase())
                );
                
                if (similarItems.length > 0) {
                  let response = ` **Found similar items for "${itemName}":**\n\n`;
                  similarItems.forEach((item, i) => {
                    response += `${i + 1}. **${item.name}** - ${item.closingBalance} ${item.uom || 'Units'}\n`;
                  });
                  return {
                    success: true,
                    type: 'inventory',
                    response: response,
                    data: similarItems,
                    executionTime: Date.now() - startTime,
                    cacheHit: false,
                    timestamp: new Date().toISOString()
                  };
                }
              }
              
              return {
                success: false,
                type: 'inventory',
                response: `❌ **No stock found for "${itemName}"**\n\n${stockResult?.error || 'Item not found in inventory'}\n\n **Try:**\n• Check spelling and try partial names\n• Use "list all stock items" to see what's available\n• Ask "show stock summary" for overview`,
                executionTime: Date.now() - startTime,
                cacheHit: false,
                timestamp: new Date().toISOString()
              };
            }
          }
        } else {
          // Generic stock query (Hindi/Hinglish like "kitna maal hai?", "stock kya hai", etc.)
          console.log(` Generic stock query detected: "${query}"`);
          stockResult = await tallyService.getDetailedStockSummary();
          
          if (stockResult.success && stockResult.summary) {
            const summary = stockResult.summary;
            const response = ` **Stock Overview**\n\n` +
              ` **Total Items:** ${summary.totalItems}\n` +
              `💰 **Total Value:** Rs.${summary.totalValue.toLocaleString('en-IN')}\n` +
              ` **Zero Stock Items:** ${summary.zeroStockItems.length}\n` +
              `📉 **Low Stock Items:** ${summary.lowStockItems.length}\n\n` +
              ` **Try specific queries like:**\n• "show stock summary"\n• "how many pipes do I have?"\n• "list all stock items"`;
            
            return {
              success: true,
              type: 'inventory',
              response: response,
              data: stockResult.data,
              executionTime: Date.now() - startTime,
              cacheHit: false,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        // If we reach here, the stock query didn't return data or failed
        if (stockResult && !stockResult.success) {
          return {
            success: false,
            type: 'inventory',
            response: ` **Stock Query Failed**\n\n❌ ${stockResult.error}\n\n **Possible solutions:**\n• Enable inventory features in Tally\n• Ensure stock items are configured\n• Check Tally connection`,
            executionTime: Date.now() - startTime,
            cacheHit: false,
            timestamp: new Date().toISOString()
          };
        }
        
      } catch (error) {
        console.error("Direct stock query failed:", error);
        // Fall through to optimized query service
      }
    }

    // Handle PDF generation requests
    if (userQuery.toLowerCase().includes('pdf') || userQuery.toLowerCase().includes('send me pdf') || 
        userQuery.toLowerCase().includes('generate pdf') || userQuery.toLowerCase().includes('export') || 
        userQuery.toLowerCase().includes('report')) {
      
      try {
        console.log(" PDF generation request detected:", userQuery);
        
        // Get company info for the report header
        const companyResult = await tallyService.executeQuery("SELECT $Name as company_name FROM Company LIMIT 1");
        const companyName = companyResult.success && companyResult.data && companyResult.data[0] ? 
          (companyResult.data[0].company_name || companyResult.data[0].$Name) : 'Your Company';
        
        let reportData: any = null;
        let reportType: 'sales' | 'balance-sheet' | 'ledger' | 'stock' | 'custom' = 'custom';
        let reportTitle = 'Financial Report';
        
        // Determine report type and get data
        if (userQuery.toLowerCase().includes('sales') || userQuery.toLowerCase().includes('revenue') || 
            userQuery.toLowerCase().includes('income')) {
          // Generate sales report
          const salesResult = await tallyService.executeQuery(`
            SELECT $Name as name, $Parent as parent, $ClosingBalance as balance
            FROM Ledger 
            WHERE ($Parent LIKE '%Sales%' OR $Parent LIKE '%Income%' OR $Parent LIKE '%Revenue%' OR $Parent LIKE '%Turnover%')
            AND $ClosingBalance != 0
            ORDER BY ABS($ClosingBalance) DESC
          `);
          
          if (salesResult.success && salesResult.data) {
            const totalSales = salesResult.data.reduce((sum: number, item: any) => 
              sum + Math.abs(parseFloat(item.balance || item.$ClosingBalance || 0)), 0
            );
            
            reportData = salesResult.data;
            reportType = 'sales';
            reportTitle = 'Sales & Revenue Report';
            
            // Generate PDF using the existing PDFService
            const pdfResult = await pdfService.generateTallyFormatPDF({
              title: reportTitle,
              companyName: companyName,
              reportDate: new Date().toLocaleDateString('en-IN'),
              data: reportData,
              type: reportType,
              totals: { totalSales }
            });
            
            if (pdfResult.success) {
              return {
                success: true,
                type: 'pdf',
                response: ` **${reportTitle} Generated Successfully!**\n\n✅ **Report saved to:** ${pdfResult.filePath}\n\n **Report includes:**\n• Sales account breakdown\n• Revenue analysis\n• Percentage distribution\n• Total sales amount\n\n **To view:** Open the HTML file in your browser and print to PDF`,
                data: { pdfPath: pdfResult.filePath, reportType: 'sales' },
                executionTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
              };
            }
          }
        } else if (userQuery.toLowerCase().includes('balance sheet') || userQuery.toLowerCase().includes('financial position')) {
          // Generate balance sheet report using Financial Statements path (per Tally navigation guide)
          // First try Balance Sheet table (correct Tally path: Gateway → Display More Reports → Financial Statements → Balance Sheet)
          let assetsResult, liabilitiesResult;
          
          try {
            // BalanceSheet table doesn't exist in Tally ODBC, use LEDGER table instead
            const balanceSheetResult = await tallyService.executeQuery(`
              SELECT $Name as name, $ClosingBalance as amount, $Parent as group, 'ledger' as type
              FROM LEDGER 
              WHERE $ClosingBalance != 0
              ORDER BY $Parent, $Name
            `);
            
            if (balanceSheetResult.success && balanceSheetResult.data && balanceSheetResult.data.length > 0) {
              console.log(` Found ${balanceSheetResult.data.length} balance sheet items from LEDGER table`);
              
              // Separate assets and liabilities from BalanceSheet data
              const assets = balanceSheetResult.data.filter((item: any) => {
                const itemType = (item.type || item.$Type || '').toLowerCase();
                const groupName = (item.group || item.$Group || '').toLowerCase();
                return itemType.includes('asset') || 
                       groupName.includes('asset') ||
                       groupName.includes('bank') ||
                       groupName.includes('cash') ||
                       groupName.includes('debtor') ||
                       groupName.includes('stock') ||
                       groupName.includes('investment');
              });
              
              const liabilities = balanceSheetResult.data.filter((item: any) => {
                const itemType = (item.type || item.$Type || '').toLowerCase();
                const groupName = (item.group || item.$Group || '').toLowerCase();
                return itemType.includes('liability') || 
                       groupName.includes('liability') ||
                       groupName.includes('loan') ||
                       groupName.includes('credit') ||
                       groupName.includes('payable') ||
                       groupName.includes('capital');
              });
              
              // Convert to expected format
              assetsResult = {
                success: true,
                data: assets.map((item: any) => ({
                  name: item.name || item.$Name,
                  group: item.group || item.$Group,
                  balance: Math.abs(parseFloat(item.amount || item.$Amount || 0))
                }))
              };
              
              liabilitiesResult = {
                success: true,
                data: liabilities.map((item: any) => ({
                  name: item.name || item.$Name,
                  group: item.group || item.$Group,
                  balance: Math.abs(parseFloat(item.amount || item.$Amount || 0))
                }))
              };
            } else {
              throw new Error('LEDGER table not available');
            }
          } catch (balanceSheetError) {
            console.log(' BalanceSheet table not available, using ledger data...');
            
            // Fallback: Use ledger data to create balance sheet
            assetsResult = await tallyService.executeQuery(`
              SELECT $Name as name, $Parent as group, $ClosingBalance as balance
              FROM Ledger 
              WHERE $ClosingBalance > 0 
              AND ($Parent LIKE '%Assets%' OR $Parent LIKE '%Bank%' OR $Parent LIKE '%Cash%' OR $Parent LIKE '%Fixed%' OR $Parent LIKE '%Investment%')
              ORDER BY $ClosingBalance DESC
            `);
            
            liabilitiesResult = await tallyService.executeQuery(`
              SELECT $Name as name, $Parent as group, $ClosingBalance as balance
              FROM Ledger 
              WHERE $ClosingBalance < 0 
              AND ($Parent LIKE '%Liabilities%' OR $Parent LIKE '%Loan%' OR $Parent LIKE '%Credit%' OR $Parent LIKE '%Payable%')
              ORDER BY ABS($ClosingBalance) DESC
            `);
          }
          
          if (assetsResult.success && liabilitiesResult.success) {
            const totalAssets = assetsResult.data ? 
              assetsResult.data.reduce((sum: number, asset: any) => sum + parseFloat(asset.balance || asset.$ClosingBalance || 0), 0) : 0;
            const totalLiabilities = liabilitiesResult.data ? 
              liabilitiesResult.data.reduce((sum: number, liability: any) => sum + Math.abs(parseFloat(liability.balance || liability.$ClosingBalance || 0)), 0) : 0;
            const netWorth = totalAssets - totalLiabilities;
            
            // Combine assets and liabilities with type indicators
            const combinedData = [
              ...(assetsResult.data || []).map((item: any) => ({ ...item, type: 'asset' })),
              ...(liabilitiesResult.data || []).map((item: any) => ({ ...item, type: 'liability' }))
            ];
            
            reportData = combinedData;
            reportType = 'balance-sheet';
            reportTitle = 'Balance Sheet Report';
            
            // Generate PDF using the existing PDFService
            const pdfResult = await pdfService.generateTallyFormatPDF({
              title: reportTitle,
              companyName: companyName,
              reportDate: new Date().toLocaleDateString('en-IN'),
              data: reportData,
              type: reportType,
              totals: { netWorth }
            });
            
            if (pdfResult.success) {
              return {
                success: true,
                type: 'pdf',
                response: ` **${reportTitle} Generated Successfully!**\n\n✅ **Report saved to:** ${pdfResult.filePath}\n\n **Report includes:**\n• Assets breakdown\n• Liabilities summary\n• Net worth calculation\n• Financial position overview\n\n **To view:** Open the HTML file in your browser and print to PDF`,
                data: { pdfPath: pdfResult.filePath, reportType: 'balance-sheet' },
                executionTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
              };
            }
          }
        } else {
          // General ledger report
          const ledgerResult = await tallyService.executeQuery(`
            SELECT $Name as name, $Parent as parent, $ClosingBalance as balance
            FROM Ledger 
            WHERE $ClosingBalance != 0
            ORDER BY ABS($ClosingBalance) DESC
            LIMIT 100
          `);
          
          if (ledgerResult.success && ledgerResult.data) {
            reportData = ledgerResult.data;
            reportType = 'ledger';
            reportTitle = 'Ledger Report';
            
            // Generate PDF using the existing PDFService
            const pdfResult = await pdfService.generateTallyFormatPDF({
              title: reportTitle,
              companyName: companyName,
              reportDate: new Date().toLocaleDateString('en-IN'),
              data: reportData,
              type: reportType
            });
            
            if (pdfResult.success) {
              return {
                success: true,
                type: 'pdf',
                response: ` **${reportTitle} Generated Successfully!**\n\n✅ **Report saved to:** ${pdfResult.filePath}\n\n **Report includes:**\n• Top 100 ledger accounts\n• Account balances\n• Group classifications\n• Balance types (Dr/Cr)\n\n **To view:** Open the HTML file in your browser and print to PDF`,
                data: { pdfPath: pdfResult.filePath, reportType: 'ledger' },
                executionTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
              };
            }
          }
        }
        
        // If we reach here, PDF generation failed
        return {
          success: false,
          type: 'pdf',
          response: `❌ **PDF Generation Failed**\n\n **Suggestions:**\n• Ensure Tally is connected and accessible\n• Check if you have data in the requested category\n• Try a more specific request like "send me pdf of sales"`,
          data: null,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          type: 'pdf',
          response: `❌ **PDF Generation Error**\n\n**Error:** ${errorMessage}\n\n **Troubleshooting:**\n• Check Tally connection\n• Ensure data is available\n• Try a different report type`,
          data: null,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        };
      }
    }

    // CHECK FOR SALES/PURCHASE QUERIES FIRST - Route to Supabase instead of Tally ODBC
    const queryLower = userQuery.toLowerCase();
    const isSalesQuery = queryLower.includes('sales') || queryLower.includes('sale') ||
                         queryLower.includes('bechna') || queryLower.includes('becha');
    const isPurchaseQuery = queryLower.includes('purchase') || queryLower.includes('kharida') ||
                            queryLower.includes('buy') || queryLower.includes('bought');

    if (isSalesQuery || isPurchaseQuery) {
      console.log(`📊 SALES/PURCHASE query detected - Routing to Supabase for transaction-level data...`);
      // Skip direct Tally ODBC and go straight to optimizedQueryService
      // which will query from sales_vouchers/purchase_vouchers tables
    } else {
      // ALWAYS try direct Tally ODBC first for ALL other queries (except bills)
      if (tallyService.isConnected()) {
        console.log(" Trying direct Tally ODBC query first...");

        try {
          // Try direct query processing based on query type
          const directResult = await processDirectTallyQuery(userQuery);

          if (directResult.success) {
            console.log("✅ Direct Tally query successful!");
            return {
              ...directResult,
              timestamp: new Date().toISOString()
            };
          }

          // Check if we should skip direct processing and go straight to optimizedQueryService
          if (directResult.skipDirectProcessing) {
            console.log(" Skipping direct processing - routing to analytical/smart processing...");
            // Fall through to optimizedQueryService
          } else {
            console.log(" Direct Tally query found no results, trying Supabase fallback...");
          }
        } catch (error) {
          console.error("Direct Tally query failed:", error);
          // Continue to Supabase fallback
        }
      }
    }

    // Use Supabase as fallback only
    console.log("🚀 Processing query with Supabase (lightning-fast)...");
    const queryRequest = {
      query: userQuery,
      clientId: clientId,
      whatsappNumber: whatsappNumber
    };
    
    const supabaseResult = await optimizedQueryService.processQuery(queryRequest);
    
    console.log("Supabase query result:", {
      success: supabaseResult.success,
      type: supabaseResult.type,
      executionTime: supabaseResult.executionTime,
      cacheHit: supabaseResult.cacheHit,
      hasAction: !!supabaseResult.data?.action
    });
    
    // Check if this is a PDF generation request
    if (supabaseResult.success && 
        supabaseResult.type === 'inventory' && 
        supabaseResult.data?.action === 'generate_pdf') {
      
      console.log(' Detected PDF generation request for stock item:', supabaseResult.data.stockItem);
      
      try {
        // Generate stock PDF directly using services
        console.log(`🔧 Generating stock PDF for: ${supabaseResult.data.stockItem}`);
        
        // Get stock data from TallyService
        let stockResult;
        if (supabaseResult.data.stockItem && supabaseResult.data.stockItem !== 'all') {
          stockResult = await tallyService.searchStockItems(supabaseResult.data.stockItem);
        } else {
          stockResult = await tallyService.getStockSummary();
        }
        
        if (!stockResult.success || !stockResult.data) {
          const errorResponse = `${supabaseResult.response}\n\n❌ **No Stock Data Found**\n\n**Error:** ${stockResult.error || 'No stock data available'}\n\n Please ensure:\n• Tally is connected\n• Stock items exist in Tally\n• ODBC access is enabled`;
          
          return {
            success: false,
            type: 'error',
            response: errorResponse,
            data: supabaseResult.data,
            executionTime: supabaseResult.executionTime,
            cacheHit: false
          };
        }
        
        // Generate PDF using BillService
        const pdfResult = await billService.generateStockPDF(stockResult.data, supabaseResult.data.stockItem);
        
        if (pdfResult.success && pdfResult.pdf) {
          // Save PDF to Downloads folder
          const os = require('os');
          const path = require('path');
          const fs = require('fs');
          const timestamp = Date.now();
          const safeItemName = supabaseResult.data.stockItem && supabaseResult.data.stockItem !== 'all' 
            ? supabaseResult.data.stockItem.replace(/[^a-zA-Z0-9]/g, '_') 
            : 'stock_summary';
          const fileName = `${safeItemName}_${timestamp}.pdf`;
          const downloadsPath = path.join(os.homedir(), 'Downloads');
          const filePath = path.join(downloadsPath, fileName);
          
          fs.writeFileSync(filePath, pdfResult.pdf);
          
          console.log(`✅ Stock PDF saved to: ${filePath}`);
          
          // Update response with PDF generation success
          const enhancedResponse = `${supabaseResult.response}\n\n✅ **PDF Generated Successfully!**\n\n**File:** ${fileName}\n**Items:** ${stockResult.data.length}\n**Location:** Downloads folder\n**Size:** ${(pdfResult.pdf.length / 1024).toFixed(1)} KB\n\n Check your Downloads folder for the PDF.`;
          
          return {
            success: true,
            type: 'inventory',
            response: enhancedResponse,
            data: { ...supabaseResult.data, pdfGenerated: true, fileName: fileName, itemCount: stockResult.data.length },
            executionTime: supabaseResult.executionTime,
            cacheHit: false
          };
        } else {
          // PDF generation failed
          const errorResponse = `${supabaseResult.response}\n\n❌ **PDF Generation Failed**\n\n**Error:** ${pdfResult.error || 'Unknown error'}\n\n Please ensure:\n• Tally is connected\n• Stock data is available\n• Try connecting to Tally first`;
          
          return {
            success: false,
            type: 'error',
            response: errorResponse,
            data: supabaseResult.data,
            executionTime: supabaseResult.executionTime,
            cacheHit: false
          };
        }
      } catch (pdfError: unknown) {
        console.error('❌ PDF generation error:', pdfError);
        
        // Enhanced error handling with specific guidance
        let errorMessage = 'Unknown error occurred';
        let troubleshootingSteps: string[] = [];
        
        const errorText = pdfError instanceof Error ? pdfError.message : String(pdfError);
        
        if (errorText.includes('Not connected')) {
          errorMessage = 'Tally connection required';
          troubleshootingSteps = [
            'Connect to Tally using the "Connect" button',
            'Ensure Tally is running with ODBC enabled',
            'Verify company is open in Tally'
          ];
        } else if (errorText.includes('No stock')) {
          errorMessage = 'No stock items found';
          troubleshootingSteps = [
            'Enable inventory features in Tally',
            'Create stock items in Tally',
            'Check ODBC access to stock data'
          ];
        } else if (errorText.includes('ODBC')) {
          errorMessage = 'ODBC connection issue';
          troubleshootingSteps = [
            'Install Tally ODBC driver',
            'Enable ODBC in Tally configuration',
            'Restart Tally after enabling ODBC'
          ];
        } else {
          errorMessage = errorText;
          troubleshootingSteps = [
            'Try connecting to Tally first',
            'Ensure stock data is available',
            'Check console logs for details',
            'Restart the application if needed'
          ];
        }
        
        const troubleshootingText = troubleshootingSteps.map(step => `• ${step}`).join('\n');
        const errorResponse = `${supabaseResult.response}\n\n❌ **PDF Generation Error**\n\n**Issue:** ${errorMessage}\n\n🔧 **Try these steps:**\n${troubleshootingText}\n\n📞 **Still need help?** Contact support with error details.`;
        
        return {
          success: false,
          type: 'error', 
          response: errorResponse,
          data: { ...supabaseResult.data, errorDetails: { message: errorMessage, steps: troubleshootingSteps }},
          executionTime: supabaseResult.executionTime,
          cacheHit: false
        };
      }
    }

    // Save to conversation context (save array data for multi-choice scenarios)
    let contextData = supabaseResult.data;
    if (supabaseResult.type === 'ledger' && Array.isArray(supabaseResult.data) && supabaseResult.data.length > 1) {
      // For multiple ledger results, save the array for selection
      contextData = supabaseResult.data;
    }
    
    // If Supabase query failed and we haven't tried direct Tally yet, try as last resort
    if (!supabaseResult.success && tallyService.isConnected()) {
      console.log("🔄 Supabase failed, trying direct Tally as final fallback...");
      
      try {
        // Try the smart ledger query as a last resort
        const finalResult = await tallyService.queryLedgerSmart(userQuery);
        
        if (finalResult.success && finalResult.ledgers && finalResult.ledgers.length > 0) {
          console.log("✅ Final fallback successful!");
          
          let fallbackResponse = finalResult.message;
          if (finalResult.type === 'exact_match' && finalResult.ledgers[0]) {
            const ledger = finalResult.ledgers[0];
            const balance = Math.abs(ledger.closingBalance || 0);
            const type = (ledger.closingBalance || 0) >= 0 ? 'Dr' : 'Cr';
            fallbackResponse = `**${ledger.name}** (${ledger.parent})\nClosing Balance: Rs.${balance.toLocaleString('en-IN')} ${type}`;
          }
          
          return {
            success: true,
            type: 'fallback_query',
            response: fallbackResponse,
            data: finalResult.ledgers,
            executionTime: finalResult.executionTime,
            cacheHit: false,
            timestamp: new Date().toISOString()
          };
        }
      } catch (error) {
        console.error("Final direct Tally fallback failed:", error);
      }
    }

    conversationContext.updateContext(
      whatsappNumber, 
      clientId, 
      userQuery, 
      supabaseResult.response, 
      supabaseResult.type, 
      contextData
    );

    return {
      success: supabaseResult.success,
      type: supabaseResult.type,
      response: supabaseResult.response,
      data: supabaseResult.data,
      executionTime: supabaseResult.executionTime,
      cacheHit: supabaseResult.cacheHit,
      suggestions: supabaseResult.suggestions,
      sessionId: conversationContext.getContext(whatsappNumber, clientId).sessionId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("IPC: Process AI query error:", error);
    return {
      success: false,
      type: 'error',
      response: `Query processing failed: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Check if data should be synced from S3 to Supabase
 */
let lastSyncTime: number = 0;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Sync every 5 minutes max

async function shouldSyncData(clientId: string): Promise<boolean> {
  try {
    const now = Date.now();
    if (now - lastSyncTime > SYNC_INTERVAL_MS) {
      lastSyncTime = now;
      return true; // Sync if it's been more than 5 minutes
    }
    return false; // Skip sync, use cached data
  } catch (error) {
    console.error('Error checking sync status:', error);
    return false; // Don't sync on error to avoid delays
  }
}


/**
 * Get system information
 */
ipcMain.handle("get-system-info", async () => {
  console.log("\n=== IPC: GET SYSTEM INFO REQUEST ===");
  
  try {
    const os = require('os');
    const systemInfo = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      hostname: os.hostname(),
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
      cpus: os.cpus().length + ' cores',
      uptime: Math.round(os.uptime() / 3600) + ' hours'
    };
    
    console.log("System info retrieved:", Object.keys(systemInfo));
    return systemInfo;
  } catch (error) {
    console.error("IPC: Get system info error:", error);
    return {
      error: `System info retrieval failed: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

// ==================== BILL GENERATION ====================

/**
 * Generate PDF bill
 */
ipcMain.handle("generate-bill-pdf", async (event, partyName: string) => {
  console.log("\n=== IPC: GENERATE BILL PDF REQUEST ===");
  console.log("Party name:", partyName);
  
  try {
    const startTime = Date.now();
    const result = await billService.generateBillPDF(partyName);
    const executionTime = Date.now() - startTime;
    
    if (result.success && result.pdf) {
      // Save PDF to a temporary location for download
      const timestamp = Date.now();
      const fileName = `bill_${partyName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.pdf`;
      const filePath = join(require('os').tmpdir(), fileName);
      
      writeFileSync(filePath, result.pdf);
      
      console.log(`Bill PDF generated in ${executionTime}ms`);
      console.log("File saved to:", filePath);
      
      return {
        success: true,
        filePath: filePath,
        fileName: fileName,
        executionTime
      };
    } else {
      console.error("Bill generation failed:", result.error);
      return {
        success: false,
        error: result.error || 'Failed to generate PDF',
        executionTime
      };
    }
    
  } catch (error: any) {
    console.error("Bill generation IPC error:", error);
    return {
      success: false,
      error: error.message || 'Internal error generating bill PDF'
    };
  }
});

console.log("Bill generation handler registered");

// ==================== STOCK PDF GENERATION ====================

/**
 * Generate stock PDF report
 */
ipcMain.handle("generate-stock-pdf", async (event, stockItemName?: string) => {
  console.log("\n=== IPC: GENERATE STOCK PDF REQUEST ===");
  console.log("Stock item:", stockItemName || "ALL ITEMS");
  
  try {
    const startTime = Date.now();
    
    // Get stock data from TallyService
    let stockResult;
    if (stockItemName && stockItemName !== 'all') {
      console.log(` Searching for specific stock item: ${stockItemName}`);
      stockResult = await tallyService.searchStockItems(stockItemName);
    } else {
      console.log(` Getting all stock items`);
      stockResult = await tallyService.getStockSummary();
    }
    
    if (!stockResult.success || !stockResult.data) {
      console.error("Stock data retrieval failed:", stockResult.error);
      return {
        success: false,
        error: stockResult.error || 'Failed to get stock data from Tally'
      };
    }
    
    // Use the existing PDF service to generate stock PDF
    const result = await billService.generateStockPDF(stockResult.data, stockItemName);
    const executionTime = Date.now() - startTime;
    
    if (result.success && result.pdf) {
      // Save PDF to Downloads folder
      const os = require('os');
      const timestamp = Date.now();
      const safeItemName = stockItemName && stockItemName !== 'all' 
        ? stockItemName.replace(/[^a-zA-Z0-9]/g, '_') 
        : 'stock_summary';
      const fileName = `${safeItemName}_${timestamp}.pdf`;
      const downloadsPath = require('path').join(os.homedir(), 'Downloads');
      const filePath = require('path').join(downloadsPath, fileName);
      
      writeFileSync(filePath, result.pdf);
      
      console.log(`Stock PDF generated in ${executionTime}ms`);
      console.log("File saved to:", filePath);
      
      return {
        success: true,
        filePath: filePath,
        fileName: fileName,
        itemCount: stockResult.data.length,
        executionTime,
        type: 'stock_pdf',
        response: `Stock PDF generated successfully\n\nFile: ${fileName}\nLocation: ${downloadsPath}\nItems: ${stockResult.data.length}\n\nCheck your Downloads folder.`
      };
    } else {
      console.error("Stock PDF generation failed:", result.error);
      return {
        success: false,
        error: result.error || 'Failed to generate stock PDF'
      };
    }
    
  } catch (error: any) {
    console.error("Stock PDF generation IPC error:", error);
    return {
      success: false,
      error: error.message || 'Internal error generating stock PDF'
    };
  }
});

console.log("Stock PDF generation handler registered");

// ==================== AUTO-SYNC HANDLERS ====================

/**
 * Initialize auto-sync service
 */
ipcMain.handle("sync-initialize", async (event, clientId: string) => {
  console.log("\n=== IPC: INITIALIZE AUTO-SYNC ===");
  console.log("Client ID:", clientId);
  
  try {
    if (cloudSyncService) {
      console.log("Auto-sync already initialized, stopping existing service");
      cloudSyncService.stopAutoSync();
    }

    cloudSyncService = EnhancedCloudSyncService.create(clientId, tallyService, supabaseService);

    console.log("Auto-sync service initialized successfully");
    
    return {
      success: true,
      config: CloudSyncService.getDefaultConfig(clientId),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Auto-sync initialization error:", error);
    return {
      success: false,
      error: `Failed to initialize auto-sync: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Start auto-sync
 */
ipcMain.handle("sync-start", async () => {
  console.log("\n=== IPC: START AUTO-SYNC ===");
  
  try {
    if (!cloudSyncService) {
      return {
        success: false,
        error: "Auto-sync not initialized. Please initialize first.",
        timestamp: new Date().toISOString()
      };
    }
    
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        timestamp: new Date().toISOString()
      };
    }
    
    // Wait for initial sync to complete before running other queries
    await cloudSyncService.startAutoSync();
    const status = cloudSyncService.getSyncStatus();

    console.log("Auto-sync started successfully");

    // After initial sync completes, check what tables are available
    console.log("🔍 Checking available ODBC tables...");
    try {
      const odbcTablesQuery = await tallyService.executeQuery('SELECT $Name FROM ODBCTables');
      if (odbcTablesQuery.success && odbcTablesQuery.data) {
        console.log("📋 Available ODBC tables:", odbcTablesQuery.data.map((t: any) => t.$Name || t.Name || JSON.stringify(t)));
      } else {
        console.log("⚠️ Could not query ODBCTables:", odbcTablesQuery.error);
      }
    } catch (err) {
      console.log("❌ Error querying ODBCTables:", err);
    }

    // Sync sales and purchase vouchers + purchase orders
    // DISABLED: RTSAllVouchers causes ODBC crash when running concurrently with enhanced cloud sync
    // Need to integrate sales/purchase sync into enhanced-cloud-sync.ts to avoid ODBC conflicts
    console.log("⚠️ Sales/purchase sync disabled - RTSAllVouchers conflicts with cloud sync");

    /*
    console.log("📦 Syncing sales, purchase vouchers, and purchase orders...");
    try {
      const clientId = 'rohit-steels-from-1-apr-23'; // Use actual client ID
      const date90DaysAgo = new Date();
      date90DaysAgo.setDate(date90DaysAgo.getDate() - 365); // Last year of data
      const fromDate = date90DaysAgo.toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];

      // Sync sales
      const salesSync = await salesPurchaseSyncService.syncSalesVouchers(clientId, fromDate, toDate);
      if (salesSync.success) {
        console.log(`✅ Synced ${salesSync.recordsSynced} sales vouchers`);
      } else {
        console.log(`⚠️ Sales sync failed: ${salesSync.errors.join(', ')}`);
      }

      // Sync purchases
      const purchaseSync = await salesPurchaseSyncService.syncPurchaseVouchers(clientId, fromDate, toDate);
      if (purchaseSync.success) {
        console.log(`✅ Synced ${purchaseSync.recordsSynced} purchase vouchers`);
      } else {
        console.log(`⚠️ Purchase sync failed: ${purchaseSync.errors.join(', ')}`);
      }

      // Sync purchase orders
      const poSync = await salesPurchaseSyncService.syncPurchaseOrders(clientId);
      if (poSync.success) {
        console.log(`✅ Synced ${poSync.recordsSynced} purchase orders`);
      } else {
        console.log(`⚠️ PO sync failed: ${poSync.errors.join(', ')}`);
      }
    } catch (voucherError) {
      console.log('⚠️ Voucher/PO sync error:', voucherError);
    }
    */

    return {
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Auto-sync start error:", error);
    return {
      success: false,
      error: `Failed to start auto-sync: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Stop auto-sync
 */
ipcMain.handle("sync-stop", async () => {
  console.log("\n=== IPC: STOP AUTO-SYNC ===");
  
  try {
    if (!cloudSyncService) {
      return {
        success: false,
        error: "Auto-sync not initialized.",
        timestamp: new Date().toISOString()
      };
    }
    
    cloudSyncService.stopAutoSync();
    const status = cloudSyncService.getSyncStatus();
    
    console.log("Auto-sync stopped successfully");
    
    return {
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Auto-sync stop error:", error);
    return {
      success: false,
      error: `Failed to stop auto-sync: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Get sync status
 */
ipcMain.handle("sync-status", async () => {
  console.log("\n=== IPC: GET SYNC STATUS ===");
  
  try {
    if (!cloudSyncService) {
      return {
        success: false,
        error: "Auto-sync not initialized.",
        timestamp: new Date().toISOString()
      };
    }
    
    const status = cloudSyncService.getSyncStatus();
    
    return {
      success: true,
      status: status,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Sync status error:", error);
    return {
      success: false,
      error: `Failed to get sync status: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Trigger manual sync
 */
ipcMain.handle("sync-manual", async () => {
  console.log("\n=== IPC: MANUAL SYNC TRIGGER ===");

  try {
    if (!cloudSyncService) {
      return {
        success: false,
        error: "Auto-sync not initialized.",
        timestamp: new Date().toISOString()
      };
    }

    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally not connected. Please connect to Tally first.",
        timestamp: new Date().toISOString()
      };
    }

    console.log("Starting manual sync...");
    const result = await cloudSyncService.triggerManualSync();

    console.log("Manual sync completed:", {
      records: result.totalRecords || 0,
      files: result.uploadedFiles?.length || 0,
      errors: result.errors?.length || 0
    });

    // Also sync purchase orders if supabase is configured
    try {
      const supabaseService = cloudSyncService.getSupabaseService();
      if (supabaseService) {
        console.log("📦 Syncing purchase orders...");
        const salesPurchaseSyncService = new SalesPurchaseSyncService(tallyService, supabaseService);
        const session = authService.getCurrentSession();
        const clientId = (session as any)?.user?.clientId || (session as any)?.clientId || 'manan-enterprise';

        const poSync = await salesPurchaseSyncService.syncPurchaseOrders(clientId);
        if (poSync.success) {
          console.log(`✅ Synced ${poSync.recordsSynced} purchase orders`);
        } else {
          console.log(`⚠️ PO sync failed: ${poSync.errors.join(', ')}`);
        }
      }
    } catch (poError) {
      console.log("⚠️ Purchase order sync failed:", poError);
      // Don't fail the entire sync if PO sync fails
    }

    return {
      success: true,
      result: result,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Manual sync error:", error);
    return {
      success: false,
      error: `Manual sync failed: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

/**
 * Update sync configuration
 */
ipcMain.handle("sync-update-config", async (event, newConfig: any) => {
  console.log("\n=== IPC: UPDATE SYNC CONFIG ===");
  console.log("New config:", newConfig);
  
  try {
    if (!cloudSyncService) {
      return {
        success: false,
        error: "Auto-sync not initialized.",
        timestamp: new Date().toISOString()
      };
    }
    
    cloudSyncService.updateConfig(newConfig);
    
    console.log("Sync configuration updated successfully");
    
    return {
      success: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Update sync config error:", error);
    return {
      success: false,
      error: `Failed to update sync config: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
});

console.log("Auto-sync handlers registered");

// ==================== AUTHENTICATION HANDLERS ====================

/**
 * Get login recommendations based on Tally availability
 */
ipcMain.handle("auth-get-recommendations", async () => {
  try {
    const recommendations = await authService.getLoginRecommendations();
    return {
      success: true,
      ...recommendations,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Auth recommendations error:", error);
    return {
      success: false,
      recommendedMode: 'mobile' as const,
      tallyAvailable: false,
      message: 'Please login with your mobile number to continue.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Register new user
 */
ipcMain.handle("auth-register", async (event, registrationData) => {
  try {
    console.log("📱 Registration request:", registrationData.mobileNumber);
    const result = await authService.registerUser(registrationData);
    
    return {
      success: result.success,
      message: result.message,
      userId: result.userId,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      success: false,
      message: 'Registration failed due to server error. Please try again.',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Login with mobile number and password
 */
ipcMain.handle("auth-login-mobile", async (event, credentials) => {
  try {
    console.log("📱 Mobile login request:", credentials.mobileNumber);
    const result = await authService.loginWithMobile(credentials);
    
    if (result.success && result.session) {
      // Set the client ID for the query service
      const clientId = result.session.clientId;
      console.log(`🔑 Session created for client: ${clientId}`);
      
      // Initialize cloud sync service with user's client ID if available
      if (cloudSyncService) {
        try {
          await cloudSyncService.updateConfig({ clientId });
        } catch (syncError) {
          console.warn("Could not update sync config:", syncError);
        }
      }
    }
    
    return {
      success: result.success,
      message: result.message,
      session: result.session,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Mobile login error:", error);
    return {
      success: false,
      message: 'Login failed due to server error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Login with Tally (when Tally is active)
 */
ipcMain.handle("auth-login-tally", async (event, companyName) => {
  try {
    console.log("🏢 Tally login request:", companyName);
    const result = await authService.loginWithTally(companyName);
    
    if (result.success && result.session) {
      console.log(`🔑 Tally session created for: ${result.session.clientId}`);
      
      // For Tally sessions, ensure we can access real-time data
      const tallyConnected = await tallyService.isConnected();
      if (!tallyConnected) {
        console.warn("⚠️ Tally session created but no active connection detected");
      }
    }
    
    return {
      success: result.success,
      message: result.message,
      session: result.session,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Tally login error:", error);
    return {
      success: false,
      message: 'Tally connection failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Verify current session
 */
ipcMain.handle("auth-verify-session", async () => {
  try {
    const verification = await authService.verifySession();
    
    return {
      success: true,
      isValid: verification.isValid,
      session: verification.session,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Session verification error:", error);
    return {
      success: false,
      isValid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Logout current user
 */
ipcMain.handle("auth-logout", async () => {
  try {
    const result = await authService.logout();
    
    // Clear any sync service configuration
    if (cloudSyncService) {
      try {
        // CloudSyncService doesn't have a stop method, just clear the reference
        cloudSyncService = null;
      } catch (syncError) {
        console.warn("Could not clear sync service:", syncError);
      }
    }
    
    return {
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Logout error:", error);
    return {
      success: false,
      message: 'Logout failed',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Change password for mobile users
 */
ipcMain.handle("auth-change-password", async (event, { oldPassword, newPassword }) => {
  try {
    const result = await authService.changePassword(oldPassword, newPassword);
    
    return {
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Password change error:", error);
    return {
      success: false,
      message: 'Password change failed due to server error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Get current session info
 */
ipcMain.handle("auth-get-session", async () => {
  try {
    const session = authService.getCurrentSession();
    
    return {
      success: true,
      session: session,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Get session error:", error);
    return {
      success: false,
      session: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

/**
 * Check Tally connection status for auth
 */
ipcMain.handle("check-tally-connection", async () => {
  try {
    const connected = await tallyService.isConnected();
    let companyName = 'Unknown Company';
    
    if (connected) {
      try {
        // Try to get company name from Tally
        const companyResult = await tallyService.executeQuery("SELECT $Name FROM Company");
        if (companyResult.success && companyResult.data && companyResult.data[0]) {
          companyName = companyResult.data[0].$Name || companyResult.data[0].name || companyName;
        }
      } catch (error) {
        console.warn("Could not get company name:", error);
      }
    }
    
    return {
      success: true,
      connected,
      companyName,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Tally connection check error:", error);
    return {
      success: false,
      connected: false,
      companyName: 'Unknown Company',
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

console.log("Authentication handlers registered");

/**
 * Get current session
 */
ipcMain.handle("auth-get-current-session", async () => {
  try {
    const session = authService.getCurrentSession();
    return { success: true, session };
  } catch (error) {
    console.error("Get current session error:", error);
    return { success: false, session: null };
  }
});

/**
 * Get login recommendations
 */
ipcMain.handle("auth-get-login-recommendations", async () => {
  try {
    const recommendations = await authService.getLoginRecommendations();
    return { success: true, ...recommendations };
  } catch (error) {
    console.error("Get login recommendations error:", error);
    return {
      success: false,
      recommendedMode: 'mobile',
      tallyAvailable: false,
      message: 'Unable to determine login recommendations'
    };
  }
});

// ==================== SALES & PURCHASE SYNC ====================

/**
 * Sync sales data from Tally to Supabase
 */
ipcMain.handle("sync-sales", async (event, { clientId, fromDate, toDate }) => {
  console.log("\n=== IPC: SYNC SALES REQUEST ===");
  console.log("Client ID:", clientId);
  console.log("Date range:", fromDate, "to", toDate);

  try {
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally is not connected. Please connect to Tally first.",
        recordsSynced: 0
      };
    }

    const result = await salesPurchaseSyncService.syncSalesVouchers(clientId, fromDate, toDate);
    console.log(`Sales sync completed: ${result.recordsSynced} records`);

    return result;
  } catch (error) {
    console.error("Sales sync error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      recordsSynced: 0,
      errors: [String(error)]
    };
  }
});

/**
 * Sync purchase data from Tally to Supabase
 */
ipcMain.handle("sync-purchases", async (event, { clientId, fromDate, toDate }) => {
  console.log("\n=== IPC: SYNC PURCHASES REQUEST ===");
  console.log("Client ID:", clientId);
  console.log("Date range:", fromDate, "to", toDate);

  try {
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally is not connected. Please connect to Tally first.",
        recordsSynced: 0
      };
    }

    const result = await salesPurchaseSyncService.syncPurchaseVouchers(clientId, fromDate, toDate);
    console.log(`Purchase sync completed: ${result.recordsSynced} records`);

    return result;
  } catch (error) {
    console.error("Purchase sync error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      recordsSynced: 0,
      errors: [String(error)]
    };
  }
});

/**
 * Sync both sales and purchases
 */
ipcMain.handle("sync-all-transactions", async (event, { clientId, fromDate, toDate }) => {
  console.log("\n=== IPC: SYNC ALL TRANSACTIONS REQUEST ===");
  console.log("Client ID:", clientId);
  console.log("Date range:", fromDate, "to", toDate);

  try {
    if (!tallyService.isConnected()) {
      return {
        success: false,
        error: "Tally is not connected. Please connect to Tally first."
      };
    }

    const result = await salesPurchaseSyncService.syncAll(clientId, fromDate, toDate);
    console.log(`All transactions sync completed`);
    console.log(`  - Sales: ${result.sales.recordsSynced} records`);
    console.log(`  - Purchases: ${result.purchases.recordsSynced} records`);

    return {
      success: true,
      sales: result.sales,
      purchases: result.purchases
    };
  } catch (error) {
    console.error("All transactions sync error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// ==================== APPLICATION LIFECYCLE ====================

/**
 * Handle app termination
 */
app.on('before-quit', async () => {
  console.log('Application terminating, cleaning up connections...');
  try {
    await tallyService.disconnect();
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Main process initialization completed');
console.log('All IPC handlers registered successfully');
console.log('Smart query system ready');
