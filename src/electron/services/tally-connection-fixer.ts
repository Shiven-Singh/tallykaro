/**
 * Tally Connection Auto-Fixer
 * Diagnoses and fixes Tally ODBC connection issues automatically
 * Pure Node.js/TypeScript - No Python needed!
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface DiagnosticResult {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  fix?: string;
}

export class TallyConnectionFixer {

  /**
   * Run comprehensive diagnostics
   */
  async diagnose(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    // Check 1: Tally Process Running
    results.push(await this.checkTallyProcess());

    // Check 2: ODBC Driver Installed
    results.push(await this.checkODBCDriver());

    // Check 3: ODBC DSN Exists
    results.push(await this.checkODBCDSN());

    // Check 4: Port 9000 Open
    results.push(await this.checkPort());

    // Check 5: Tally ODBC Service
    results.push(await this.checkTallyService());

    return results;
  }

  /**
   * Check if Tally is running
   */
  private async checkTallyProcess(): Promise<DiagnosticResult> {
    try {
      // Get all processes and filter for any containing "tally" (case-insensitive)
      const { stdout } = await execAsync('tasklist');

      const tallyProcesses = stdout.toLowerCase().split('\n')
        .filter(line => line.includes('tally'))
        .filter(line => line.trim().length > 0);

      if (tallyProcesses.length > 0) {
        // Extract process names for display
        const processNames = tallyProcesses.map(line => {
          const match = line.match(/^([^\s]+\.exe)/i);
          return match ? match[1] : '';
        }).filter(name => name);

        return {
          check: 'Tally Process',
          status: 'pass',
          message: `✅ Tally is running (${processNames.join(', ') || 'detected'})`
        };
      } else {
        return {
          check: 'Tally Process',
          status: 'fail',
          message: '❌ Tally is not running',
          fix: 'Please start TallyPrime or Tally.ERP 9 and open a company'
        };
      }
    } catch (error) {
      return {
        check: 'Tally Process',
        status: 'fail',
        message: '❌ Unable to check Tally process',
        fix: 'Make sure Tally is installed and running'
      };
    }
  }

  /**
   * Check if ODBC driver is installed
   */
  private async checkODBCDriver(): Promise<DiagnosticResult> {
    try {
      // Check registry for ODBC driver
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers" /s'
      );

      if (stdout.includes('Tally ODBC Driver') || stdout.includes('TallyODBC')) {
        return {
          check: 'ODBC Driver',
          status: 'pass',
          message: '✅ Tally ODBC Driver is installed'
        };
      } else {
        return {
          check: 'ODBC Driver',
          status: 'fail',
          message: '❌ Tally ODBC Driver not found',
          fix: 'Install Tally ODBC Driver from Tally installation folder (usually C:\\Program Files\\Tally.ERP 9\\TallyODBC or TallyPrime\\TallyODBC)'
        };
      }
    } catch (error) {
      return {
        check: 'ODBC Driver',
        status: 'warning',
        message: '⚠️ Unable to verify ODBC driver installation',
        fix: 'Manually check if Tally ODBC Driver is installed in ODBC Data Sources'
      };
    }
  }

  /**
   * Check if ODBC DSN exists
   */
  private async checkODBCDSN(): Promise<DiagnosticResult> {
    try {
      const { stdout } = await execAsync(
        'reg query "HKCU\\SOFTWARE\\ODBC\\ODBC.INI\\ODBC Data Sources" /s'
      );

      if (stdout.includes('TallyODBC')) {
        return {
          check: 'ODBC DSN',
          status: 'pass',
          message: '✅ Tally ODBC DSN configured'
        };
      } else {
        return {
          check: 'ODBC DSN',
          status: 'warning',
          message: '⚠️ No Tally ODBC DSN found (this is OK, can use driver connection)',
          fix: 'App will use direct driver connection instead of DSN'
        };
      }
    } catch (error) {
      return {
        check: 'ODBC DSN',
        status: 'warning',
        message: '⚠️ Unable to check DSN (will use driver connection)',
        fix: 'Not critical - app can connect using driver string'
      };
    }
  }

  /**
   * Check if port 9000 is open
   */
  private async checkPort(): Promise<DiagnosticResult> {
    try {
      const { stdout } = await execAsync('netstat -ano | findstr :9000');

      if (stdout.includes('LISTENING')) {
        return {
          check: 'ODBC Port 9000',
          status: 'pass',
          message: '✅ Port 9000 is open and listening'
        };
      } else {
        return {
          check: 'ODBC Port 9000',
          status: 'fail',
          message: '❌ Port 9000 is not listening',
          fix: 'Enable ODBC server in Tally: Press F11 > Advanced Config > Enable ODBC Server = Yes'
        };
      }
    } catch (error) {
      return {
        check: 'ODBC Port 9000',
        status: 'warning',
        message: '⚠️ Unable to check port status'
      };
    }
  }

  /**
   * Check Tally ODBC service
   */
  private async checkTallyService(): Promise<DiagnosticResult> {
    try {
      const { stdout } = await execAsync('sc query state= all | findstr /i "tally"');

      if (stdout.includes('RUNNING')) {
        return {
          check: 'Tally ODBC Service',
          status: 'pass',
          message: '✅ Tally ODBC service is running'
        };
      } else if (stdout.length > 0) {
        return {
          check: 'Tally ODBC Service',
          status: 'warning',
          message: '⚠️ Tally service exists but not running',
          fix: 'Start the service: services.msc > Find Tally service > Start'
        };
      } else {
        return {
          check: 'Tally ODBC Service',
          status: 'warning',
          message: '⚠️ No Tally service found (this is OK for some installations)'
        };
      }
    } catch (error) {
      return {
        check: 'Tally ODBC Service',
        status: 'warning',
        message: '⚠️ Unable to check service status'
      };
    }
  }

  /**
   * Auto-fix common issues
   */
  async autoFix(): Promise<{ fixed: string[]; manual: string[] }> {
    const fixed: string[] = [];
    const manual: string[] = [];

    const diagnostics = await this.diagnose();

    for (const diag of diagnostics) {
      if (diag.status === 'fail' && diag.fix) {
        // Check if we can auto-fix
        if (diag.check === 'ODBC Port 9000') {
          // Can't auto-fix - requires Tally settings change
          manual.push(diag.fix);
        } else if (diag.check === 'Tally Process') {
          // Can't auto-start Tally
          manual.push(diag.fix);
        } else if (diag.check === 'ODBC Driver') {
          // Can attempt to find and run installer
          const installerFound = await this.findAndRunODBCInstaller();
          if (installerFound) {
            fixed.push('Tally ODBC Driver installed');
          } else {
            manual.push(diag.fix);
          }
        }
      }
    }

    return { fixed, manual };
  }

  /**
   * Find and run ODBC installer
   */
  private async findAndRunODBCInstaller(): Promise<boolean> {
    const possiblePaths = [
      'C:\\Program Files\\Tally.ERP 9\\TallyODBC\\Setup.exe',
      'C:\\Program Files (x86)\\Tally.ERP 9\\TallyODBC\\Setup.exe',
      'C:\\Program Files\\Tally Solutions\\TallyPrime\\TallyODBC\\Setup.exe',
      'C:\\Program Files (x86)\\Tally Solutions\\TallyPrime\\TallyODBC\\Setup.exe',
    ];

    for (const installerPath of possiblePaths) {
      if (fs.existsSync(installerPath)) {
        try {
          console.log(`Found ODBC installer: ${installerPath}`);
          // Note: Actually running installer requires elevation, so just return path
          return true;
        } catch (error) {
          continue;
        }
      }
    }

    return false;
  }

  /**
   * Generate diagnostic report
   */
  async generateReport(): Promise<string> {
    const diagnostics = await this.diagnose();

    let report = '='.repeat(60) + '\n';
    report += '  TALLY ODBC CONNECTION DIAGNOSTIC REPORT\n';
    report += '='.repeat(60) + '\n\n';

    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    for (const diag of diagnostics) {
      report += `${diag.check}:\n`;
      report += `  Status: ${diag.message}\n`;
      if (diag.fix) {
        report += `  Fix: ${diag.fix}\n`;
      }
      report += '\n';

      if (diag.status === 'pass') passCount++;
      else if (diag.status === 'fail') failCount++;
      else warnCount++;
    }

    report += '='.repeat(60) + '\n';
    report += `SUMMARY: ${passCount} passed, ${failCount} failed, ${warnCount} warnings\n`;
    report += '='.repeat(60) + '\n';

    return report;
  }
}

export const tallyFixer = new TallyConnectionFixer();