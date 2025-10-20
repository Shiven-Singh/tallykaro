/**
 * Production Logger Utility
 * Controls logging based on environment
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_PACKAGED = process.env.IS_PACKAGED === 'true';

export class Logger {
  /**
   * Only log errors in production
   */
  static error(...args: any[]) {
    console.error(...args);
  }

  /**
   * Log warnings only in development
   */
  static warn(...args: any[]) {
    if (!IS_PRODUCTION) {
      console.warn(...args);
    }
  }

  /**
   * Log info only in development
   */
  static info(...args: any[]) {
    if (!IS_PRODUCTION) {
      console.log(...args);
    }
  }

  /**
   * Log debug only in development with DEBUG flag
   */
  static debug(...args: any[]) {
    if (!IS_PRODUCTION && process.env.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * Log queries only if SQL_DEBUG is enabled
   */
  static query(...args: any[]) {
    if (process.env.SQL_DEBUG === 'true') {
      console.log('[SQL]', ...args);
    }
  }

  /**
   * Silent logger for production - catches all logs
   */
  static silent(...args: any[]) {
    // Do nothing - used to suppress logs in production
  }
}

/**
 * Suppress console logs in production build
 */
export function setupProductionLogging() {
  if (IS_PRODUCTION || IS_PACKAGED) {
    // Override console methods to suppress logs
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = () => {}; // Suppress all logs
    console.info = () => {}; // Suppress all info
    console.warn = () => {}; // Suppress all warnings

    // Keep errors visible
    console.error = (...args) => {
      // Only log critical errors in production
      if (args[0] && typeof args[0] === 'string') {
        const message = args[0].toLowerCase();
        // Suppress non-critical errors
        if (
          message.includes('permanentredirect') ||
          message.includes('fetch failed') ||
          message.includes('s3 error') ||
          message.includes('supabase not configured')
        ) {
          return; // Suppress these errors
        }
      }
      // Log critical errors only
      originalLog('[ERROR]', ...args);
    };
  }
}
