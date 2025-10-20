/**
 * ODBC Query Lock Manager
 * Prevents concurrent ODBC queries that cause driver crashes
 */

class ODBCLockManager {
  private static instance: ODBCLockManager;
  private isLocked: boolean = false;
  private queue: Array<() => void> = [];
  private currentOperation: string = '';

  private constructor() {}

  static getInstance(): ODBCLockManager {
    if (!ODBCLockManager.instance) {
      ODBCLockManager.instance = new ODBCLockManager();
    }
    return ODBCLockManager.instance;
  }

  /**
   * Acquire lock for ODBC operation
   * Returns immediately if lock is available, otherwise waits in queue
   */
  async acquire(operationName: string): Promise<void> {
    if (this.isLocked) {
      console.log(`⏳ ODBC locked by "${this.currentOperation}", queuing "${operationName}"...`);

      return new Promise((resolve) => {
        this.queue.push(() => {
          this.isLocked = true;
          this.currentOperation = operationName;
          console.log(`🔓 ODBC lock acquired by "${operationName}"`);
          resolve();
        });
      });
    }

    this.isLocked = true;
    this.currentOperation = operationName;
    console.log(`🔒 ODBC lock acquired by "${operationName}"`);
  }

  /**
   * Release lock and process next queued operation
   */
  release(): void {
    console.log(`🔓 ODBC lock released by "${this.currentOperation}"`);
    this.isLocked = false;
    this.currentOperation = '';

    // Process next queued operation
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Check if ODBC is currently locked
   */
  isODBCLocked(): boolean {
    return this.isLocked;
  }

  /**
   * Get current operation holding the lock
   */
  getCurrentOperation(): string {
    return this.currentOperation;
  }

  /**
   * Get number of queued operations
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Force release (use with caution - only if operation crashes)
   */
  forceRelease(): void {
    console.warn(`⚠️ Force releasing ODBC lock from "${this.currentOperation}"`);
    this.isLocked = false;
    this.currentOperation = '';
    this.queue = [];
  }
}

export const odbcLock = ODBCLockManager.getInstance();

/**
 * Decorator to wrap async function with ODBC lock
 */
export function withODBCLock(operationName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      await odbcLock.acquire(operationName);
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        odbcLock.release();
      }
    };

    return descriptor;
  };
}
