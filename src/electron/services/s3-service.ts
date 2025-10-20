import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as crypto from 'crypto';

export interface ClientMapping {
  whatsappNumber: string;
  clientId: string;
  clientName: string;
  tallyDatabasePath: string;
  registeredAt: string;
}

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;
  private encryptionKey: string;

  constructor() {
    // Validate required environment variables
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    if (!process.env.S3_ENCRYPTION_KEY || process.env.S3_ENCRYPTION_KEY.length < 32) {
      throw new Error('S3_ENCRYPTION_KEY must be at least 32 characters');
    }

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1', // Fixed: Use correct region for Mumbai
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucketName = process.env.S3_BUCKET_NAME || 'tallykaro-client-data';
    this.encryptionKey = process.env.S3_ENCRYPTION_KEY!;
  }

  async storeClientMapping(mapping: ClientMapping): Promise<void> {
    const key = `client-mappings/${mapping.whatsappNumber}.json`;
    const encryptedData = this.encrypt(JSON.stringify(mapping));
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: encryptedData,
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'encrypted': 'true'
      }
    }));
  }

  async getClientByWhatsApp(whatsappNumber: string): Promise<ClientMapping | null> {
    try {
      const key = `client-mappings/${whatsappNumber}.json`;
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));

      if (response.Body) {
        const encryptedData = await this.streamToString(response.Body as Readable);
        const decryptedData = this.decrypt(encryptedData);
        return JSON.parse(decryptedData) as ClientMapping;
      }
      return null;
    } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async storeTallyReport(clientId: string, reportType: string, pdfBuffer: Buffer): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `reports/${clientId}/${reportType}-${timestamp}.pdf`;
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));

    return key;
  }

  async getReportUrl(key: string): Promise<string> {
    return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
  }

  async listClientReports(clientId: string): Promise<string[]> {
    const response = await this.s3Client.send(new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: `reports/${clientId}/`,
    }));

    return response.Contents?.map(obj => obj.Key!) || [];
  }

  async storeTallyData(clientId: string, tableName: string, dataBuffer: Buffer): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `tally-data/${clientId}/${tableName.toLowerCase()}-${timestamp}.json`;
    
    // Encrypt the data before uploading
    const encryptedData = this.encrypt(dataBuffer.toString());
    
    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: Buffer.from(encryptedData),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'encrypted': 'true',
        'table': tableName,
        'client': clientId
      }
    }));

    return key;
  }

  async getTallyData(clientId: string, tableName?: string): Promise<any[]> {
    try {
      let key: string;
      
      if (tableName) {
        // Try latest file first (new format)
        key = `tally-data/${clientId}/${tableName.toLowerCase()}-latest.json`;
      } else {
        // If no table name, get all available files
        const response = await this.s3Client.send(new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: `tally-data/${clientId}/`,
        }));
        
        if (!response.Contents || response.Contents.length === 0) {
          return [];
        }
        
        // Get the latest file
        const latestFile = response.Contents
          .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))[0];
        key = latestFile.Key!;
      }

      try {
        const getResponse = await this.s3Client.send(new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }));

        if (getResponse.Body) {
          const encryptedData = await this.streamToString(getResponse.Body as Readable);
          const decryptedData = this.decrypt(encryptedData);
          const parsedData = JSON.parse(decryptedData);
          return parsedData.data || [];
        }
      } catch (keyError) {
        // If latest file doesn't exist, try old timestamp format
        if (tableName) {
          console.log(`Latest file not found, searching for timestamped files for ${tableName}`);
          
          const response = await this.s3Client.send(new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: `tally-data/${clientId}/${tableName.toLowerCase()}-`,
          }));

          if (response.Contents && response.Contents.length > 0) {
            const latestFile = response.Contents
              .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))[0];

            const getResponse = await this.s3Client.send(new GetObjectCommand({
              Bucket: this.bucketName,
              Key: latestFile.Key!,
            }));

            if (getResponse.Body) {
              const encryptedData = await this.streamToString(getResponse.Body as Readable);
              const decryptedData = this.decrypt(encryptedData);
              const parsedData = JSON.parse(decryptedData);
              return parsedData.data || [];
            }
          }
        }
      }
      
      return [];
    } catch (error: any) {
      // Suppress S3 errors in production - they're not critical
      const isProduction = process.env.NODE_ENV === 'production';

      // Handle different types of network errors
      if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
        if (!isProduction) console.warn('🌐 S3 connection timeout - working in offline mode');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        if (!isProduction) console.warn('🌐 S3 network error - working in offline mode');
      } else if (error.Code === 'PermanentRedirect') {
        // S3 region mismatch - silently ignore, app works without S3
        if (!isProduction) console.log('ℹ️ S3 working in offline mode');
      } else {
        // Only log in development
        if (!isProduction) console.error('Error getting Tally data from S3:', error);
      }
      return [];
    }
  }

  private async streamToString(stream: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}