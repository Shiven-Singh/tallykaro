/**
 * Tally XML API Service
 * Direct HTTP/XML communication with Tally for transaction-level data
 */

import axios from 'axios';
import { parseStringPromise } from 'xml2js';

export interface TallyXMLConfig {
  host: string;
  port: number;
}

export interface VoucherData {
  voucherNumber: string;
  voucherDate: string;
  voucherType: string;
  partyName: string;
  amount: number;
  reference?: string;
  narration?: string;
}

export class TallyXMLAPIService {
  private config: TallyXMLConfig;
  private baseUrl: string;

  constructor(config: TallyXMLConfig = { host: 'localhost', port: 9000 }) {
    this.config = config;
    this.baseUrl = `http://${config.host}:${config.port}`;
  }

  /**
   * Execute XML request to Tally
   */
  private async executeXMLRequest(xmlRequest: string): Promise<any> {
    try {
      console.log('🔄 Sending XML request to Tally:', this.baseUrl);
      console.log('📤 Request XML:', xmlRequest.substring(0, 500) + '...');

      const response = await axios.post(this.baseUrl, xmlRequest, {
        headers: {
          'Content-Type': 'application/xml',
          'Accept': 'application/xml'
        },
        timeout: 30000
      });

      console.log('📥 Response status:', response.status);
      console.log('📥 Response data (first 1000 chars):', String(response.data).substring(0, 1000));

      // Parse XML response
      const result = await parseStringPromise(response.data, {
        explicitArray: false,
        mergeAttrs: true,
        normalize: true,
        normalizeTags: true,
        trim: true
      });

      console.log('📊 Parsed result structure:', JSON.stringify(result, null, 2).substring(0, 1000));

      return result;
    } catch (error) {
      console.error('❌ Tally XML API error:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      throw error;
    }
  }

  /**
   * Get sales vouchers from Tally
   */
  async getSalesVouchers(fromDate?: string, toDate?: string): Promise<VoucherData[]> {
    // Request voucher objects directly from Tally
    const xmlRequest = `
      <ENVELOPE>
        <HEADER>
          <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>
        <BODY>
          <EXPORTDATA>
            <REQUESTDESC>
              <REPORTNAME>Voucher Register</REPORTNAME>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <SVFROMDATE>1-Apr-2025</SVFROMDATE>
                <SVTODATE>31-Mar-2026</SVTODATE>
              </STATICVARIABLES>
            </REQUESTDESC>
          </EXPORTDATA>
        </BODY>
      </ENVELOPE>
    `;

    try {
      const result = await this.executeXMLRequest(xmlRequest);
      const allVouchers = this.parseVoucherResponse(result);
      // Filter only sales vouchers
      return allVouchers.filter(v =>
        v.voucherType && v.voucherType.toLowerCase().includes('sales')
      );
    } catch (error) {
      console.error('Failed to get sales vouchers:', error);
      throw error;
    }
  }

  /**
   * Get purchase vouchers from Tally
   */
  async getPurchaseVouchers(fromDate?: string, toDate?: string): Promise<VoucherData[]> {
    // Request voucher objects directly from Tally
    const xmlRequest = `
      <ENVELOPE>
        <HEADER>
          <TALLYREQUEST>Export Data</TALLYREQUEST>
        </HEADER>
        <BODY>
          <EXPORTDATA>
            <REQUESTDESC>
              <REPORTNAME>Voucher Register</REPORTNAME>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <SVFROMDATE>1-Apr-2025</SVFROMDATE>
                <SVTODATE>31-Mar-2026</SVTODATE>
              </STATICVARIABLES>
            </REQUESTDESC>
          </EXPORTDATA>
        </BODY>
      </ENVELOPE>
    `;

    try {
      const result = await this.executeXMLRequest(xmlRequest);
      const allVouchers = this.parseVoucherResponse(result);
      // Filter only purchase vouchers
      return allVouchers.filter(v =>
        v.voucherType && v.voucherType.toLowerCase().includes('purchase')
      );
    } catch (error) {
      console.error('Failed to get purchase vouchers:', error);
      throw error;
    }
  }

  /**
   * Parse voucher response from XML
   */
  private parseVoucherResponse(xmlResult: any): VoucherData[] {
    try {
      const vouchers: VoucherData[] = [];

      console.log('🔍 Parsing XML result...');

      const envelope = xmlResult?.envelope;
      if (!envelope) {
        console.log('⚠️ No envelope found in XML result');
        return vouchers;
      }

      // Check for Collection format (voucher objects)
      const voucherData = envelope.voucher;
      if (voucherData) {
        const voucherList = Array.isArray(voucherData) ? voucherData : [voucherData];
        console.log(`📊 Found ${voucherList.length} vouchers in Collection format`);

        for (const v of voucherList) {
          if (!v) continue;

          // Extract party ledger name from ledger entries
          let partyName = 'Unknown';
          let amount = 0;

          if (v.allledgerentries && v.allledgerentries.ledgerentries) {
            const ledgerEntries = Array.isArray(v.allledgerentries.ledgerentries.list)
              ? v.allledgerentries.ledgerentries.list
              : [v.allledgerentries.ledgerentries.list];

            // Find the party ledger (usually the one that's not a default ledger)
            for (const entry of ledgerEntries) {
              if (entry && entry.ledgername) {
                const ledgerName = entry.ledgername;
                // Skip common sales/purchase ledgers
                if (!ledgerName.toLowerCase().includes('sales') &&
                    !ledgerName.toLowerCase().includes('purchase') &&
                    !ledgerName.toLowerCase().includes('cash') &&
                    !ledgerName.toLowerCase().includes('bank')) {
                  partyName = ledgerName;
                  amount = this.parseAmount(entry.amount || 0);
                  break;
                }
              }
            }
          }

          vouchers.push({
            voucherNumber: v.vouchernumber || v.mastername || 'N/A',
            voucherDate: v.date || '',
            voucherType: v.vouchertypename || '',
            partyName,
            amount: Math.abs(amount),
            reference: v.reference || undefined,
            narration: v.narration || undefined
          });
        }

        console.log(`✅ Parsed ${vouchers.length} vouchers with complete data`);
        return vouchers;
      }

      console.log('⚠️ Unknown XML structure');
      return vouchers;
    } catch (error) {
      console.error('❌ Error parsing voucher response:', error);
      return [];
    }
  }

  /**
   * Build date filter for XML query
   */
  private buildDateFilter(fromDate?: string, toDate?: string): string {
    if (!fromDate && !toDate) {
      // Default: Last 90 days
      const date90DaysAgo = new Date();
      date90DaysAgo.setDate(date90DaysAgo.getDate() - 90);
      fromDate = this.formatDateForTally(date90DaysAgo);
      toDate = this.formatDateForTally(new Date());
    }

    return `
      <FILTER>DateFilter</FILTER>
      <SYSTEM TYPE="Formulae" NAME="DateFilter">
        AND:$$IsBetween:$$Date:${fromDate}:${toDate}
      </SYSTEM>
    `;
  }

  /**
   * Format date for Tally (YYYYMMDD)
   */
  private formatDateForTally(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(amountValue: any): number {
    if (typeof amountValue === 'number') return amountValue;

    try {
      const cleaned = String(amountValue)
        .replace(/[₹$,\s]/g, '')
        .replace(/Dr|Cr/gi, '')
        .trim();

      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Test connection to Tally XML API
   */
  async testConnection(): Promise<boolean> {
    const xmlRequest = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Data</TYPE>
          <ID>CompanyInfo</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <REPORT NAME="CompanyInfo">
                  <FORMS>CompanyInfo</FORMS>
                </REPORT>
                <FORM NAME="CompanyInfo">
                  <PARTS>CompanyInfoPart</PARTS>
                </FORM>
                <PART NAME="CompanyInfoPart">
                  <LINES>CompanyInfoLine</LINES>
                  <REPEAT>CompanyInfoLine : Company</REPEAT>
                  <SCROLLED>Vertical</SCROLLED>
                </PART>
                <LINE NAME="CompanyInfoLine">
                  <FIELD>CompanyName</FIELD>
                </LINE>
                <FIELD NAME="CompanyName">
                  <SET>$$Name</SET>
                </FIELD>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    try {
      await this.executeXMLRequest(xmlRequest);
      console.log('✅ Tally XML API connection successful');
      return true;
    } catch (error) {
      console.error('❌ Tally XML API connection failed:', error);
      return false;
    }
  }
}
