import makeWASocket, { 
  ConnectionState, 
  DisconnectReason, 
  useMultiFileAuthState,
  WAMessage,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { S3Service, ClientMapping } from './s3-service';
import { TallyService } from './tally-services';
import jsPDF from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';

export interface WhatsAppBotConfig {
  authDir?: string;
  autoReconnect?: boolean;
  markMessagesRead?: boolean;
}

export class BaileysWhatsAppService {
  private socket: any;
  private s3Service: S3Service;
  private tallyService: TallyService;
  private config: WhatsAppBotConfig;
  private isConnected: boolean = false;
  private authDir: string;

  constructor(config: WhatsAppBotConfig = {}) {
    this.config = {
      authDir: './whatsapp-auth',
      autoReconnect: true,
      markMessagesRead: true,
      ...config
    };
    
    this.authDir = this.config.authDir!;
    this.s3Service = new S3Service();
    this.tallyService = new TallyService();

    // Ensure auth directory exists
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    try {
      console.log('Starting WhatsApp Bot...');
      
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: this.createLogger(),
        defaultQueryTimeoutMs: 60000,
      });

      // Handle connection updates
      this.socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        this.handleConnectionUpdate(update);
      });

      // Handle credential updates
      this.socket.ev.on('creds.update', saveCreds);

      // Handle incoming messages
      this.socket.ev.on('messages.upsert', async (m: any) => {
        await this.handleIncomingMessages(m);
      });

      console.log('WhatsApp Bot initialized. Waiting for QR code...');
      
    } catch (error) {
      console.error('Failed to start WhatsApp Bot:', error);
      throw error;
    }
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>) {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('QR Code received. Scan with WhatsApp to connect.');
    }
    
    if (connection === 'close') {
      this.isConnected = false;
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log('Connection closed due to:', lastDisconnect?.error);
      
      if (shouldReconnect && this.config.autoReconnect) {
        console.log('Reconnecting...');
        setTimeout(() => this.start(), 3000);
      }
    } else if (connection === 'open') {
      this.isConnected = true;
      console.log('WhatsApp Bot connected successfully!');
    }
  }

  private async handleIncomingMessages(messageUpdate: any) {
    const { messages, type } = messageUpdate;
    
    if (type !== 'notify') return;

    for (const message of messages) {
      // Skip if message is from ourselves
      if (message.key.fromMe) continue;
      
      // Skip status updates
      if (message.key.remoteJid === 'status@broadcast') continue;

      await this.processMessage(message);
    }
  }

  private async processMessage(message: WAMessage) {
    try {
      const from = message.key.remoteJid!;
      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || '';

      if (!messageText.trim()) return;

      console.log(`Message from ${from}: ${messageText}`);

      // Extract phone number (remove @s.whatsapp.net)
      const phoneNumber = from.replace('@s.whatsapp.net', '');
      
      // Get client mapping
      const clientMapping = await this.s3Service.getClientByWhatsApp(`+${phoneNumber}`);
      
      if (!clientMapping) {
        await this.sendTextMessage(from, 
          "❌ Your WhatsApp number is not registered with TallyKaro.\n\n" +
          "Please contact your accountant to register your number."
        );
        return;
      }

      // Mark message as read
      if (this.config.markMessagesRead) {
        await this.socket.readMessages([message.key]);
      }

      // Process the command
      await this.processClientCommand(from, messageText, clientMapping);

    } catch (error) {
      console.error('Error processing message:', error);
      const from = message.key.remoteJid!;
      await this.sendTextMessage(from, "❌ Sorry, there was an error processing your request. Please try again later.");
    }
  }

  private async processClientCommand(from: string, command: string, client: ClientMapping) {
    const cmd = command.toLowerCase().trim();

    try {
      if (cmd.includes('balance') || cmd.includes('ledger')) {
        await this.handleBalanceRequest(from, client);
      }
      else if (cmd.includes('bill') || cmd.includes('invoice')) {
        await this.handleBillRequest(from, client);
      }
      else if (cmd.includes('report') || cmd.includes('statement')) {
        await this.handleReportRequest(from, client);
      }
      else if (cmd.includes('help')) {
        await this.handleHelpRequest(from, client);
      }
      else {
        await this.handleDefaultResponse(from, client);
      }
    } catch (error) {
      console.error(`Error handling command for ${client.clientName}:`, error);
      await this.sendTextMessage(from, "❌ Unable to process your request. Please try again later.");
    }
  }

  private async handleBalanceRequest(from: string, client: ClientMapping) {
    await this.sendTextMessage(from, "📊 Fetching your account balance...");
    
    try {
      const ledgers = await this.tallyService.getAllLedgers();
      const summary = this.formatBalanceSummary(ledgers, client.clientName);
      
      await this.sendTextMessage(from, summary);
    } catch (error) {
      await this.sendTextMessage(from, "❌ Unable to fetch balance information. Please try again later.");
    }
  }

  private async handleBillRequest(from: string, client: ClientMapping) {
    await this.sendTextMessage(from, "📄 Generating your bill...");
    
    try {
      const pdfBuffer = await this.generateBillPDF(client);
      const filename = `Bill-${client.clientName}-${new Date().toISOString().split('T')[0]}.pdf`;
      
      // Store in S3
      const reportKey = await this.s3Service.storeTallyReport(client.clientId, 'bill', pdfBuffer);
      
      // Send PDF
      await this.sendDocumentMessage(from, pdfBuffer, filename, "📄 Here's your latest bill");
      
    } catch (error) {
      await this.sendTextMessage(from, "❌ Unable to generate bill. Please try again later.");
    }
  }

  private async handleReportRequest(from: string, client: ClientMapping) {
    await this.sendTextMessage(from, "📈 Generating your financial report...");
    
    try {
      const pdfBuffer = await this.generateFinancialReport(client);
      const filename = `Report-${client.clientName}-${new Date().toISOString().split('T')[0]}.pdf`;
      
      // Store in S3
      const reportKey = await this.s3Service.storeTallyReport(client.clientId, 'report', pdfBuffer);
      
      // Send PDF
      await this.sendDocumentMessage(from, pdfBuffer, filename, "📈 Here's your financial report");
      
    } catch (error) {
      await this.sendTextMessage(from, "❌ Unable to generate report. Please try again later.");
    }
  }

  private async handleHelpRequest(from: string, client: ClientMapping) {
    const helpMessage = `
🤖 *TallyKaro WhatsApp Assistant*

Hello ${client.clientName}! I can help you with:

📊 *"balance"* - Get your account balance summary
📄 *"bill"* - Generate and send your latest bill
📈 *"report"* - Get comprehensive financial report  
❓ *"help"* - Show this help message

Just type any command and I'll assist you right away!

_Powered by TallyKaro Desktop Connector_
    `.trim();

    await this.sendTextMessage(from, helpMessage);
  }

  private async handleDefaultResponse(from: string, client: ClientMapping) {
    const message = `
👋 Hello ${client.clientName}!

I didn't understand that command. Here's what I can help you with:

📊 Type *"balance"* - for account balance
📄 Type *"bill"* - for latest bill
📈 Type *"report"* - for financial report
❓ Type *"help"* - for detailed help

What would you like to do?
    `.trim();

    await this.sendTextMessage(from, message);
  }

  private async sendTextMessage(to: string, text: string) {
    if (!this.isConnected) {
      console.log('Not connected to WhatsApp. Message not sent.');
      return;
    }

    try {
      await this.socket.sendMessage(to, { text });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  private async sendDocumentMessage(to: string, buffer: Buffer, filename: string, caption?: string) {
    if (!this.isConnected) {
      console.log('Not connected to WhatsApp. Document not sent.');
      return;
    }

    try {
      await this.socket.sendMessage(to, {
        document: buffer,
        fileName: filename,
        mimetype: 'application/pdf',
        caption: caption
      });
    } catch (error) {
      console.error('Failed to send document:', error);
    }
  }

  private formatBalanceSummary(ledgers: any[], clientName: string): string {
    if (!ledgers || ledgers.length === 0) {
      return `📊 *Balance Summary - ${clientName}*\n\nNo ledger data available.`;
    }

    let summary = `📊 *Balance Summary - ${clientName}*\n\n`;
    
    ledgers.slice(0, 10).forEach((ledger: any, index: number) => {
      const balance = ledger.balance || 0;
      const emoji = balance >= 0 ? '💰' : '📉';
      summary += `${emoji} ${ledger.name}: ₹${balance.toLocaleString('en-IN')}\n`;
    });

    if (ledgers.length > 10) {
      summary += `\n... and ${ledgers.length - 10} more accounts`;
    }

    summary += `\n\n_Generated on ${new Date().toLocaleDateString('en-IN')}_`;
    
    return summary;
  }

  private async generateBillPDF(client: ClientMapping): Promise<Buffer> {
    const pdf = new jsPDF();
    
    // Header
    pdf.setFontSize(20);
    pdf.text(`Bill - ${client.clientName}`, 20, 20);
    
    pdf.setFontSize(12);
    pdf.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 20, 35);
    pdf.text(`Client ID: ${client.clientId}`, 20, 45);
    
    // Ledger data
    try {
      const ledgers = await this.tallyService.getAllLedgers();
      let yPos = 65;
      
      pdf.setFontSize(14);
      pdf.text('Account Summary:', 20, yPos);
      yPos += 10;
      
      pdf.setFontSize(10);
      ledgers.slice(0, 15).forEach((ledger: any) => {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }
        const balance = ledger.balance || 0;
        pdf.text(`${ledger.name}: ₹${balance.toLocaleString('en-IN')}`, 20, yPos);
        yPos += 8;
      });
      
    } catch (error) {
      pdf.text('Error fetching ledger data', 20, 65);
    }

    return Buffer.from(pdf.output('arraybuffer'));
  }

  private async generateFinancialReport(client: ClientMapping): Promise<Buffer> {
    const pdf = new jsPDF();
    
    // Header
    pdf.setFontSize(20);
    pdf.text(`Financial Report - ${client.clientName}`, 20, 20);
    
    pdf.setFontSize(12);
    pdf.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 20, 35);
    pdf.text(`Report Period: ${new Date().toLocaleDateString('en-IN')}`, 20, 45);
    
    // Comprehensive ledger data
    try {
      const ledgers = await this.tallyService.getAllLedgers();
      let yPos = 65;
      
      pdf.setFontSize(14);
      pdf.text('Complete Account Statement:', 20, yPos);
      yPos += 15;
      
      pdf.setFontSize(10);
      ledgers.forEach((ledger: any) => {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }
        const balance = ledger.balance || 0;
        pdf.text(`${ledger.name}: ₹${balance.toLocaleString('en-IN')}`, 20, yPos);
        yPos += 8;
      });
      
    } catch (error) {
      pdf.text('Error fetching comprehensive data', 20, 65);
    }

    return Buffer.from(pdf.output('arraybuffer'));
  }

  private createLogger() {
    return {
      level: 'silent' as any,
      fatal: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
      trace: () => {},
      child: () => this.createLogger()
    };
  }

  async stop() {
    if (this.socket) {
      await this.socket.logout();
      this.isConnected = false;
      console.log('WhatsApp Bot stopped.');
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}