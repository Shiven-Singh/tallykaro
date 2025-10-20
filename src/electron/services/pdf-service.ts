import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface PDFReportData {
  title: string;
  companyName: string;
  reportDate: string;
  data: any[];
  type: 'sales' | 'balance-sheet' | 'ledger' | 'stock' | 'custom';
  headers?: string[];
  totals?: any;
  ledgerInfo?: {
    name: string;
    parent: string;
    closingBalance: number;
  };
}

export class PDFService {
  private _outputDir: string | null = null;

  constructor() {
    // Don't access app.getPath() in constructor - it may not be ready yet
  }

  private get outputDir(): string {
    if (!this._outputDir) {
      // Lazy initialize output directory when first needed
      const userDocuments = app.getPath('documents');
      this._outputDir = path.join(userDocuments, 'TallyKaro Reports');

      if (!fs.existsSync(this._outputDir)) {
        fs.mkdirSync(this._outputDir, { recursive: true });
      }
    }
    return this._outputDir;
  }

  /**
   * Generate a PDF report in Tally format
   */
  async generateTallyFormatPDF(reportData: PDFReportData): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const fileName = `${reportData.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}`;
      const pdfFilePath = path.join(this.outputDir, `${fileName}.pdf`);
      const htmlFilePath = path.join(this.outputDir, `${fileName}.html`);

      // Generate professional Tally-format HTML
      const htmlContent = this.generateTallyFormatHTML(reportData);
      
      // Always save HTML as backup
      fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');

      // Try to generate actual PDF using puppeteer (if available)
      try {
        // Check if puppeteer is available
        let puppeteer;
        try {
          puppeteer = require('puppeteer');
        } catch (e) {
          throw new Error('Puppeteer not installed');
        }
        
        const browser = await puppeteer.launch({ 
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        
        // Set content and wait for it to load completely
        await page.setContent(htmlContent, { 
          waitUntil: ['networkidle0', 'domcontentloaded'] 
        });
        
        // Generate PDF with professional Tally-like formatting
        await page.pdf({
          path: pdfFilePath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
          margin: {
            top: '15mm',
            bottom: '15mm',
            left: '10mm',
            right: '10mm'
          },
          displayHeaderFooter: true,
          headerTemplate: `
            <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
              ${reportData.companyName} - ${reportData.title}
            </div>
          `,
          footerTemplate: `
            <div style="font-size: 9px; width: 100%; text-align: center; color: #666;">
              Generated on ${new Date().toLocaleDateString('en-IN')} | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
          `
        });
        
        await browser.close();
        
        // Verify PDF was created
        if (fs.existsSync(pdfFilePath)) {
          return {
            success: true,
            filePath: pdfFilePath
          };
        } else {
          throw new Error('PDF generation failed - file not created');
        }
        
      } catch (puppeteerError) {
        const errorMessage = puppeteerError instanceof Error ? puppeteerError.message : String(puppeteerError);
        console.log('PDF generation not available, providing professional HTML:', errorMessage);
        
        // Create a professional HTML with print-ready styling
        const printReadyHtml = this.generatePrintReadyHTML(reportData);
        fs.writeFileSync(htmlFilePath, printReadyHtml, 'utf8');
        
        // Return HTML with clear instructions for PDF conversion
        return {
          success: true,
          filePath: htmlFilePath,
          error: `PDF generation requires additional setup. Professional HTML report created.\n\n📄 **To get PDF:** Open ${htmlFilePath} in Chrome/Edge → Press Ctrl+P → Save as PDF\n\n💡 **Tip:** This creates a professional PDF identical to Tally format`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Generate print-ready HTML with enhanced styling
   */
  private generatePrintReadyHTML(reportData: PDFReportData): string {
    const html = this.generateTallyFormatHTML(reportData);
    
    // Add print-specific enhancements
    return html.replace(
      '<style>',
      `<style>
        @media print {
          body { 
            margin: 0 !important; 
            padding: 10px !important;
            font-size: 12px !important;
          }
          .header { 
            border: 2px solid #000 !important; 
            background-color: #f8f9fa !important; 
            -webkit-print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .table { page-break-inside: avoid !important; }
          .table th, .table td { 
            border: 1px solid #000 !important; 
            padding: 6px !important;
          }
        }
        .print-instruction {
          background: #e8f4fd;
          border: 2px solid #2196F3;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
          text-align: center;
        }
        .print-button {
          background: #2196F3;
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 5px;
          font-size: 16px;
          cursor: pointer;
          margin: 10px;
        }
        .print-button:hover {
          background: #1976D2;
        }
      `
    ).replace(
      '<div class="no-print" style="margin-top: 20px; text-align: center;">',
      `<div class="print-instruction">
        <h3>📄 Convert to PDF</h3>
        <p><strong>Step 1:</strong> Press <kbd>Ctrl+P</kbd> (or Cmd+P on Mac)</p>
        <p><strong>Step 2:</strong> Select "Save as PDF" as destination</p>
        <p><strong>Step 3:</strong> Click "Save" to get your professional Tally-format PDF</p>
      </div>
      <div class="no-print" style="margin-top: 20px; text-align: center;">`
    ).replace(
      '<button onclick="window.print()">Print Report</button>',
      '<button class="print-button" onclick="window.print()">🖨️ Generate PDF (Ctrl+P)</button>'
    );
  }

  /**
   * Generate HTML content in professional Tally format
   */
  private generateTallyFormatHTML(reportData: PDFReportData): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportData.title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Times New Roman', Times, serif;
            margin: 0;
            padding: 10px;
            background: white;
            color: black;
            line-height: 1.1;
            font-size: 12px;
        }
        .page-header {
            text-align: center;
            margin-bottom: 5px;
            padding-bottom: 10px;
            border-bottom: 1px solid #000;
        }
        .company-name {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .company-address {
            font-size: 10px;
            margin-bottom: 3px;
            color: #333;
        }
        .account-title {
            font-size: 14px;
            font-weight: bold;
            margin: 8px 0 3px 0;
            text-align: center;
        }
        .account-subtitle {
            font-size: 11px;
            text-align: center;
            margin-bottom: 3px;
            color: #555;
        }
        .period-line {
            font-size: 11px;
            text-align: center;
            margin-bottom: 15px;
            font-weight: bold;
        }
        .page-number {
            font-size: 10px;
            text-align: right;
            margin-bottom: 10px;
        }
        .ledger-table {
            width: 100%;
            border-collapse: collapse;
            margin: 0;
            font-size: 11px;
        }
        .ledger-table th {
            border: 1px solid #000;
            padding: 4px 6px;
            text-align: center;
            font-weight: bold;
            background-color: white;
            font-size: 10px;
        }
        .ledger-table td {
            border: 1px solid #000;
            padding: 3px 6px;
            vertical-align: top;
            font-size: 10px;
        }
        .date-col { width: 10%; text-align: center; }
        .particulars-col { width: 35%; }
        .vch-type-col { width: 15%; text-align: center; }
        .vch-no-col { width: 10%; text-align: center; }
        .debit-col { width: 15%; text-align: right; }
        .credit-col { width: 15%; text-align: right; }
        .amount-right { text-align: right; }
        .amount-bold { font-weight: bold; }
        .opening-balance { font-weight: bold; }
        .closing-balance { 
            font-weight: bold; 
            border-top: 2px solid #000;
            background-color: #f9f9f9;
        }
        .total-line {
            border-top: 1px solid #000;
            border-bottom: 2px solid #000;
            font-weight: bold;
        }
        .footer-spacing {
            margin-top: 20px;
        }
        @media print {
            body { 
                margin: 0 !important; 
                padding: 5px !important;
                font-size: 11px !important;
            }
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
        }
        .no-print {
            margin-top: 20px;
            text-align: center;
            background: #f0f0f0;
            padding: 10px;
            border: 1px solid #ccc;
        }
        .print-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 5px;
            cursor: pointer;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="page-header">
        <div class="company-name">${reportData.companyName || 'COMPANY NAME'}</div>
        <div class="company-address">172,4TH LANE,DARUKHANA.REAY ROAD<br>MUMBAI-400010</div>
    </div>

    ${this.generateReportContent(reportData)}

    <div class="no-print">
        <button class="print-btn" onclick="window.print()">🖨️ Print/Save as PDF</button>
        <button class="print-btn" onclick="window.close()" style="background: #6c757d;">❌ Close</button>
        <p style="font-size: 12px; margin-top: 10px; color: #666;">
            📄 To save as PDF: Press Ctrl+P → Choose "Save as PDF" → Click Save
        </p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generate report-specific content
   */
  private generateReportContent(reportData: PDFReportData): string {
    switch (reportData.type) {
      case 'sales':
        return this.generateSalesReportContent(reportData);
      case 'balance-sheet':
        return this.generateBalanceSheetContent(reportData);
      case 'ledger':
        return this.generateLedgerReportContent(reportData);
      case 'stock':
        return this.generateStockReportContent(reportData);
      default:
        return this.generateCustomReportContent(reportData);
    }
  }

  /**
   * Generate sales report content
   */
  private generateSalesReportContent(reportData: PDFReportData): string {
    let content = '<h3>Sales Report</h3>';
    
    if (reportData.data && reportData.data.length > 0) {
      content += `
        <table class="table">
            <thead>
                <tr>
                    <th>Sr. No.</th>
                    <th>Account Name</th>
                    <th>Amount (₹)</th>
                </tr>
            </thead>
            <tbody>`;
      
      let totalAmount = 0;
      reportData.data.forEach((item: any, index: number) => {
        const balanceValue = item.balance || item.$ClosingBalance || 0;
        const amount = Math.abs(parseFloat(balanceValue) || 0);
        totalAmount += amount;
        
        content += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.name || item.$Name || 'Unknown'}</td>
                <td class="amount">₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            </tr>`;
      });
      
      content += `
            <tr class="total-row">
                <td colspan="2"><strong>TOTAL</strong></td>
                <td class="amount"><strong>₹${totalAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}</strong></td>
            </tr>
        </tbody>
        </table>`;
    } else {
      content += '<p>No sales data available.</p>';
    }
    
    return content;
  }

  /**
   * Generate balance sheet content
   */
  private generateBalanceSheetContent(reportData: PDFReportData): string {
    let content = '<h3>Balance Sheet</h3>';
    
    if (reportData.data && reportData.data.length > 0) {
      const assets = reportData.data.filter((item: any) => 
        item.type === 'asset' || (parseFloat(item.balance || 0) || 0) > 0
      );
      const liabilities = reportData.data.filter((item: any) => 
        item.type === 'liability' || (parseFloat(item.balance || 0) || 0) < 0
      );
      
      // Assets
      if (assets.length > 0) {
        content += '<h4>ASSETS</h4>';
        content += `
          <table class="table">
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Asset Name</th>
                <th>Group</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>`;
        
        let totalAssets = 0;
        assets.forEach((item: any, index: number) => {
          const amount = Math.abs(parseFloat(item.balance || 0) || 0);
          totalAssets += amount;
          content += `
            <tr>
              <td>${index + 1}</td>
              <td>${item.name || 'Unknown'}</td>
              <td>${item.group || 'Unknown'}</td>
              <td class="amount">${amount.toLocaleString('en-IN')}</td>
            </tr>`;
        });
        
        content += `
            <tr class="total-row">
              <td colspan="3"><strong>TOTAL ASSETS</strong></td>
              <td class="amount"><strong>₹${totalAssets.toLocaleString('en-IN')}</strong></td>
            </tr>
          </tbody>
          </table>`;
      }
      
      // Liabilities
      if (liabilities.length > 0) {
        content += '<h4>LIABILITIES</h4>';
        content += `
          <table class="table">
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Liability Name</th>
                <th>Group</th>
                <th>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>`;
        
        let totalLiabilities = 0;
        liabilities.forEach((item: any, index: number) => {
          const amount = Math.abs(parseFloat(item.balance || 0) || 0);
          totalLiabilities += amount;
          content += `
            <tr>
              <td>${index + 1}</td>
              <td>${item.name || 'Unknown'}</td>
              <td>${item.group || 'Unknown'}</td>
              <td class="amount">${amount.toLocaleString('en-IN')}</td>
            </tr>`;
        });
        
        content += `
            <tr class="total-row">
              <td colspan="3"><strong>TOTAL LIABILITIES</strong></td>
              <td class="amount"><strong>₹${totalLiabilities.toLocaleString('en-IN')}</strong></td>
            </tr>
          </tbody>
          </table>`;
      }
      
      // Net Worth
      if (reportData.totals?.netWorth !== undefined) {
        content += `
          <div style="margin-top: 20px; text-align: center; font-weight: bold; font-size: 16px;">
            <p>Net Worth: ₹${reportData.totals.netWorth.toLocaleString('en-IN')}</p>
          </div>`;
      }
    }
    
    return content;
  }

  /**
   * Generate ledger report content in professional Tally format
   */
  private generateLedgerReportContent(reportData: PDFReportData): string {
    const ledgerName = reportData.ledgerInfo?.name || reportData.title || 'Ledger Report';
    const parentGroup = reportData.ledgerInfo?.parent || '';
    const currentDate = new Date();
    const fromDate = '1-Apr-2024';
    const toDate = currentDate.toLocaleDateString('en-GB');
    
    let content = `
    <div class="page-number">Page No.: 1</div>
    
    <div class="account-title">${ledgerName}</div>
    ${parentGroup ? `<div class="account-subtitle">(Under ${parentGroup})</div>` : ''}
    <div class="period-line">From ${fromDate} To ${toDate}</div>
    
    <table class="ledger-table">
        <thead>
            <tr>
                <th class="date-col">Date</th>
                <th class="particulars-col">Particulars</th>
                <th class="vch-type-col">Vch Type</th>
                <th class="vch-no-col">Vch No.</th>
                <th class="debit-col">Debit</th>
                <th class="credit-col">Credit</th>
            </tr>
        </thead>
        <tbody>`;
    
    // Opening Balance
    const openingBalance = reportData.ledgerInfo?.closingBalance || 0;
    if (openingBalance !== 0) {
        const openingDr = openingBalance >= 0 ? openingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '';
        const openingCr = openingBalance < 0 ? Math.abs(openingBalance).toLocaleString('en-IN', {minimumFractionDigits: 2}) : '';
        
        content += `
            <tr class="opening-balance">
                <td class="date-col">1-Apr-24</td>
                <td class="particulars-col">Opening Balance</td>
                <td class="vch-type-col"></td>
                <td class="vch-no-col"></td>
                <td class="debit-col amount-right">${openingDr}</td>
                <td class="credit-col amount-right">${openingCr}</td>
            </tr>`;
    }
    
    let totalDebit = Math.max(0, openingBalance);
    let totalCredit = Math.max(0, -openingBalance);
    
    if (reportData.data && reportData.data.length > 0) {
        // Check if this is transaction data (has date, particulars) or balance data
        const isTransactionData = reportData.data[0]?.date || reportData.data[0]?.particulars;
        
        if (isTransactionData) {
            // Transaction-based ledger report
            reportData.data.forEach((item: any) => {
                const date = item.date ? new Date(item.date).toLocaleDateString('en-GB').replace(/\//g, '-') : '';
                const particulars = item.particulars || item.account_name || '';
                const vchType = item.voucherType || item.vch_type || '';
                const vchNo = item.voucherNumber || item.vch_no || '';
                const amount = parseFloat(item.amount || item.debit || item.credit || 0) || 0;
                
                let debitAmount = '';
                let creditAmount = '';
                
                if (amount > 0) {
                    debitAmount = amount.toLocaleString('en-IN', {minimumFractionDigits: 2});
                    totalDebit += amount;
                } else if (amount < 0) {
                    creditAmount = Math.abs(amount).toLocaleString('en-IN', {minimumFractionDigits: 2});
                    totalCredit += Math.abs(amount);
                }
                
                content += `
                    <tr>
                        <td class="date-col">${date}</td>
                        <td class="particulars-col">${particulars}</td>
                        <td class="vch-type-col">${vchType}</td>
                        <td class="vch-no-col">${vchNo}</td>
                        <td class="debit-col amount-right">${debitAmount}</td>
                        <td class="credit-col amount-right">${creditAmount}</td>
                    </tr>`;
            });
        } else {
            // Multiple accounts ledger summary
            reportData.data.forEach((item: any) => {
                const balance = parseFloat(item.balance || item.$ClosingBalance || 0) || 0;
                const accountName = item.name || item.$Name || 'Unknown';
                
                let debitAmount = '';
                let creditAmount = '';
                
                if (balance > 0) {
                    debitAmount = balance.toLocaleString('en-IN', {minimumFractionDigits: 2});
                    totalDebit += balance;
                } else if (balance < 0) {
                    creditAmount = Math.abs(balance).toLocaleString('en-IN', {minimumFractionDigits: 2});
                    totalCredit += Math.abs(balance);
                }
                
                content += `
                    <tr>
                        <td class="date-col">${toDate}</td>
                        <td class="particulars-col">${accountName}</td>
                        <td class="vch-type-col">Summary</td>
                        <td class="vch-no-col"></td>
                        <td class="debit-col amount-right">${debitAmount}</td>
                        <td class="credit-col amount-right">${creditAmount}</td>
                    </tr>`;
            });
        }
    }
    
    // Closing Balance
    const closingBalance = totalDebit - totalCredit;
    const closingDr = closingBalance >= 0 ? closingBalance.toLocaleString('en-IN', {minimumFractionDigits: 2}) : '';
    const closingCr = closingBalance < 0 ? Math.abs(closingBalance).toLocaleString('en-IN', {minimumFractionDigits: 2}) : '';
    
    if (closingBalance !== 0) {
        if (closingBalance > 0) {
            totalCredit += closingBalance;
        } else {
            totalDebit += Math.abs(closingBalance);
        }
        
        content += `
            <tr class="closing-balance">
                <td class="date-col">${toDate}</td>
                <td class="particulars-col">Closing Balance</td>
                <td class="vch-type-col"></td>
                <td class="vch-no-col"></td>
                <td class="debit-col amount-right">${closingCr}</td>
                <td class="credit-col amount-right">${closingDr}</td>
            </tr>`;
    }
    
    // Total Line
    content += `
            <tr class="total-line">
                <td class="date-col"></td>
                <td class="particulars-col amount-bold">Total</td>
                <td class="vch-type-col"></td>
                <td class="vch-no-col"></td>
                <td class="debit-col amount-right amount-bold">${totalDebit.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td class="credit-col amount-right amount-bold">${totalCredit.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
            </tr>
        </tbody>
    </table>`;
    
    return content;
  }

  /**
   * Generate stock report content
   */
  private generateStockReportContent(reportData: PDFReportData): string {
    let content = '<h3>Stock Report</h3>';
    
    if (reportData.data && reportData.data.length > 0) {
      content += `
        <table class="table">
          <thead>
            <tr>
              <th>Sr. No.</th>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Rate (₹)</th>
              <th>Value (₹)</th>
            </tr>
          </thead>
          <tbody>`;
      
      let totalValue = 0;
      reportData.data.forEach((item: any, index: number) => {
        const quantity = parseFloat(item.quantity || 0) || 0;
        const rate = parseFloat(item.rate || 0) || 0;
        const value = quantity * rate;
        totalValue += value;
        
        content += `
          <tr>
            <td>${index + 1}</td>
            <td>${item.name || item.$Name || 'Unknown'}</td>
            <td>${quantity.toLocaleString('en-IN')}</td>
            <td class="amount">${rate.toLocaleString('en-IN')}</td>
            <td class="amount">${value.toLocaleString('en-IN')}</td>
          </tr>`;
      });
      
      content += `
          <tr class="total-row">
            <td colspan="4"><strong>TOTAL STOCK VALUE</strong></td>
            <td class="amount"><strong>₹${totalValue.toLocaleString('en-IN')}</strong></td>
          </tr>
        </tbody>
        </table>`;
    } else {
      content += '<p>No stock data available.</p>';
    }
    
    return content;
  }

  /**
   * Generate custom report content
   */
  private generateCustomReportContent(reportData: PDFReportData): string {
    let content = `<h3>${reportData.title}</h3>`;
    
    if (reportData.data && reportData.data.length > 0) {
      content += `
        <table class="table">
          <thead>
            <tr>`;
      
      // Generate headers dynamically
      if (reportData.headers && reportData.headers.length > 0) {
        reportData.headers.forEach(header => {
          content += `<th>${header}</th>`;
        });
      } else {
        // Use object keys as headers
        const firstItem = reportData.data[0];
        if (firstItem) {
          Object.keys(firstItem).forEach(key => {
            content += `<th>${key}</th>`;
          });
        }
      }
      
      content += `</tr></thead><tbody>`;
      
      // Generate data rows
      reportData.data.forEach((item: any, index: number) => {
        content += '<tr>';
        if (reportData.headers && reportData.headers.length > 0) {
          reportData.headers.forEach(header => {
            const value = item[header] || '';
            content += `<td>${value}</td>`;
          });
        } else {
          Object.values(item).forEach(value => {
            content += `<td>${value || ''}</td>`;
          });
        }
        content += '</tr>';
      });
      
      content += '</tbody></table>';
    } else {
      content += '<p>No data available.</p>';
    }
    
    return content;
  }

  /**
   * Get the output directory path
   */
  getOutputDirectory(): string {
    return this.outputDir;
  }

  /**
   * List all generated reports
   */
  listReports(): string[] {
    try {
      if (fs.existsSync(this.outputDir)) {
        return fs.readdirSync(this.outputDir)
          .filter(file => file.endsWith('.html') || file.endsWith('.pdf'))
          .map(file => path.join(this.outputDir, file));
      }
      return [];
    } catch (error) {
      console.error('Error listing reports:', error);
      return [];
    }
  }

  /**
   * Delete a specific report
   */
  deleteReport(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
    }
  }
}
