import { S3Service, ClientMapping } from './s3-service';
import { TallyService } from './tally-services';
import { BillService } from './bill-service';
import jsPDF from 'jspdf';

export interface WhatsAppMessage {
  from: string;
  body: string;
  timestamp: string;
}

export interface WhatsAppResponse {
  to: string;
  body?: string;
  media?: {
    type: 'document' | 'image';
    url: string;
    filename: string;
  };
}

export class WhatsAppService {
  private s3Service: S3Service;
  private tallyService: TallyService;
  private billService: BillService;

  constructor() {
    this.s3Service = new S3Service();
    this.tallyService = new TallyService();
    this.billService = new BillService(this.tallyService);
  }

  async processIncomingMessage(message: WhatsAppMessage): Promise<WhatsAppResponse> {
    const clientMapping = await this.s3Service.getClientByWhatsApp(message.from);
    
    if (!clientMapping) {
      return {
        to: message.from,
        body: "Sorry, your WhatsApp number is not registered with our system. Please contact support."
      };
    }

    return this.handleClientMessage(message, clientMapping);
  }

  private async handleClientMessage(message: WhatsAppMessage, client: ClientMapping): Promise<WhatsAppResponse> {
    const query = message.body.toLowerCase().trim();

    if (query.includes('balance') || query.includes('ledger')) {
      return this.handleLedgerRequest(message, client);
    }
    
    if (query.includes('bill') || query.includes('invoice')) {
      return this.handleBillRequest(message, client);
    }
    
    if (query.includes('report') || query.includes('statement')) {
      return this.handleReportRequest(message, client);
    }

    if (query.includes('help')) {
      return this.handleHelpRequest(message);
    }

    return {
      to: message.from,
      body: `Hello ${client.clientName}! 

Available commands:
• "balance" - Get account balance
• "bill" - Generate recent bill
• "report" - Get financial report
• "help" - Show this help

What would you like to do?`
    };
  }

  private async handleLedgerRequest(message: WhatsAppMessage, client: ClientMapping): Promise<WhatsAppResponse> {
    try {
      const ledgerData = await this.tallyService.getAllLedgers();
      const summary = this.formatLedgerSummary(ledgerData);
      
      return {
        to: message.from,
        body: `Account Summary for ${client.clientName}:\n\n${summary}`
      };
    } catch (error) {
      return {
        to: message.from,
        body: "Unable to fetch account balance. Please try again later."
      };
    }
  }

  private async handleBillRequest(message: WhatsAppMessage, client: ClientMapping): Promise<WhatsAppResponse> {
    try {
      const pdfBuffer = await this.generateBillPDF(client);
      const reportKey = await this.s3Service.storeTallyReport(client.clientId, 'bill', pdfBuffer);
      const reportUrl = await this.s3Service.getReportUrl(reportKey);

      return {
        to: message.from,
        body: "Here's your latest bill:",
        media: {
          type: 'document',
          url: reportUrl,
          filename: `bill-${client.clientName}-${new Date().toISOString().split('T')[0]}.pdf`
        }
      };
    } catch (error) {
      return {
        to: message.from,
        body: "Unable to generate bill. Please try again later."
      };
    }
  }

  private async handleReportRequest(message: WhatsAppMessage, client: ClientMapping): Promise<WhatsAppResponse> {
    try {
      const pdfBuffer = await this.generateFinancialReport(client);
      const reportKey = await this.s3Service.storeTallyReport(client.clientId, 'financial-report', pdfBuffer);
      const reportUrl = await this.s3Service.getReportUrl(reportKey);

      return {
        to: message.from,
        body: "Here's your financial report:",
        media: {
          type: 'document',
          url: reportUrl,
          filename: `report-${client.clientName}-${new Date().toISOString().split('T')[0]}.pdf`
        }
      };
    } catch (error) {
      return {
        to: message.from,
        body: "Unable to generate report. Please try again later."
      };
    }
  }

  private handleHelpRequest(message: WhatsAppMessage): WhatsAppResponse {
    return {
      to: message.from,
      body: `TallyKaro WhatsApp Assistant

Available commands:
• "balance" or "ledger" - Get account balance summary
• "bill" or "invoice" - Generate and send your latest bill as PDF
• "report" or "statement" - Get comprehensive financial report
• "help" - Show this help message

Just type any of these keywords and I'll help you right away!`
    };
  }

  private formatLedgerSummary(ledgers: any[]): string {
    if (!ledgers || ledgers.length === 0) {
      return "No ledger data available.";
    }

    let summary = "";
    ledgers.slice(0, 5).forEach(ledger => {
      summary += `• ${ledger.name}: ₹${ledger.balance || '0'}\n`;
    });

    if (ledgers.length > 5) {
      summary += `... and ${ledgers.length - 5} more accounts`;
    }

    return summary;
  }

  private async generateBillPDF(client: ClientMapping): Promise<Buffer> {
    const pdf = new jsPDF();
    
    pdf.setFontSize(20);
    pdf.text(`Bill for ${client.clientName}`, 20, 20);
    
    pdf.setFontSize(12);
    pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 40);
    
    const ledgers = await this.tallyService.getAllLedgers();
    let yPos = 60;
    
    ledgers.slice(0, 10).forEach((ledger: any) => {
      pdf.text(`${ledger.name}: ₹${ledger.balance || '0'}`, 20, yPos);
      yPos += 10;
    });

    return Buffer.from(pdf.output('arraybuffer'));
  }

  private async generateFinancialReport(client: ClientMapping): Promise<Buffer> {
    const pdf = new jsPDF();
    
    pdf.setFontSize(20);
    pdf.text(`Financial Report - ${client.clientName}`, 20, 20);
    
    pdf.setFontSize(12);
    pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 40);
    
    const ledgers = await this.tallyService.getAllLedgers();
    let yPos = 60;
    
    pdf.setFontSize(14);
    pdf.text('Account Summary:', 20, yPos);
    yPos += 15;
    
    pdf.setFontSize(10);
    ledgers.forEach((ledger: any) => {
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.text(`${ledger.name}: ₹${ledger.balance || '0'}`, 20, yPos);
      yPos += 8;
    });

    return Buffer.from(pdf.output('arraybuffer'));
  }

  async registerClient(whatsappNumber: string, clientData: Omit<ClientMapping, 'whatsappNumber'>): Promise<void> {
    const mapping: ClientMapping = {
      whatsappNumber,
      ...clientData,
      registeredAt: new Date().toISOString()
    };
    
    await this.s3Service.storeClientMapping(mapping);
  }
}