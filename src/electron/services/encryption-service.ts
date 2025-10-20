import crypto from 'crypto';

export interface EncryptionConfig {
  masterKey: string;
  algorithm: 'aes256';
  keyDerivationRounds: number;
}

export interface EncryptedData {
  encrypted: string;
  clientId: string; // For key derivation
}

export class EncryptionService {
  private config: EncryptionConfig;
  private clientKeys: Map<string, Buffer> = new Map();

  constructor() {
    this.config = {
      masterKey: process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey(),
      algorithm: 'aes256',
      keyDerivationRounds: 100000
    };

    if (!process.env.ENCRYPTION_MASTER_KEY) {
      console.warn('⚠️ No ENCRYPTION_MASTER_KEY found in environment. Generated temporary key.');
      console.warn('⚠️ Set ENCRYPTION_MASTER_KEY in production for data persistence.');
    }
  }

  /**
   * Generate a secure master key
   */
  private generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Derive client-specific encryption key
   */
  private deriveClientKey(clientId: string): Buffer {
    if (this.clientKeys.has(clientId)) {
      return this.clientKeys.get(clientId)!;
    }

    // Derive unique key for each client using PBKDF2
    const salt = crypto.createHash('sha256').update(clientId).digest();
    const key = crypto.pbkdf2Sync(
      this.config.masterKey,
      salt,
      this.config.keyDerivationRounds,
      32, // 256 bits
      'sha256'
    );

    this.clientKeys.set(clientId, key);
    return key;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string, clientId: string): EncryptedData {
    try {
      const key = this.deriveClientKey(clientId);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted: iv.toString('hex') + ':' + encrypted,
        clientId
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedData): string {
    try {
      const key = this.deriveClientKey(encryptedData.clientId);
      
      const parts = encryptedData.encrypted.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data - possibly corrupted or wrong key');
    }
  }

  /**
   * Encrypt a number (for balances, amounts)
   */
  encryptNumber(value: number, clientId: string): EncryptedData {
    return this.encrypt(value.toString(), clientId);
  }

  /**
   * Decrypt a number (for balances, amounts)
   */
  decryptNumber(encryptedData: EncryptedData): number {
    const decryptedStr = this.decrypt(encryptedData);
    const number = parseFloat(decryptedStr);
    if (isNaN(number)) {
      throw new Error('Decrypted data is not a valid number');
    }
    return number;
  }

  /**
   * Create searchable hash (for finding records without decryption)
   * Uses HMAC so it's deterministic but secure
   */
  createSearchableHash(value: string, clientId: string): string {
    const key = this.deriveClientKey(clientId);
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(value.toLowerCase()); // Case insensitive search
    return hmac.digest('hex');
  }

  /**
   * Encrypt ledger record for database storage
   */
  encryptLedgerRecord(ledger: any, clientId: string): any {
    return {
      ...ledger,
      // Encrypt sensitive fields
      name_encrypted: this.encrypt(ledger.name, clientId),
      name_hash: this.createSearchableHash(ledger.name, clientId), // For searching
      closing_balance_encrypted: ledger.closing_balance ? this.encryptNumber(ledger.closing_balance, clientId) : null,
      address_encrypted: ledger.address ? this.encrypt(ledger.address, clientId) : null,
      phone_encrypted: ledger.phone ? this.encrypt(ledger.phone, clientId) : null,
      
      // Remove plaintext fields
      name: null,
      closing_balance: null,
      address: null,
      phone: null,
      
      // Keep non-sensitive fields as-is
      parent: ledger.parent, // Group names are usually not sensitive
      client_id: clientId,
      created_at: ledger.created_at,
      updated_at: ledger.updated_at
    };
  }

  /**
   * Decrypt ledger record from database
   */
  decryptLedgerRecord(encryptedLedger: any): any {
    return {
      ...encryptedLedger,
      // Decrypt sensitive fields
      name: encryptedLedger.name_encrypted ? this.decrypt(encryptedLedger.name_encrypted) : null,
      closing_balance: encryptedLedger.closing_balance_encrypted ? this.decryptNumber(encryptedLedger.closing_balance_encrypted) : null,
      address: encryptedLedger.address_encrypted ? this.decrypt(encryptedLedger.address_encrypted) : null,
      phone: encryptedLedger.phone_encrypted ? this.decrypt(encryptedLedger.phone_encrypted) : null,
      
      // Remove encrypted fields from response
      name_encrypted: undefined,
      closing_balance_encrypted: undefined,
      address_encrypted: undefined,
      phone_encrypted: undefined,
      name_hash: undefined
    };
  }

  /**
   * Encrypt company record for database storage
   */
  encryptCompanyRecord(company: any, clientId: string): any {
    return {
      ...company,
      // Encrypt sensitive fields
      name_encrypted: this.encrypt(company.name, clientId),
      name_hash: this.createSearchableHash(company.name, clientId),
      address_encrypted: company.address ? this.encrypt(company.address, clientId) : null,
      phone_encrypted: company.phone ? this.encrypt(company.phone, clientId) : null,
      email_encrypted: company.email ? this.encrypt(company.email, clientId) : null,
      gst_registration_encrypted: company.gst_registration ? this.encrypt(company.gst_registration, clientId) : null,
      
      // Remove plaintext fields
      name: null,
      address: null,
      phone: null,
      email: null,
      gst_registration: null,
      
      client_id: clientId,
      created_at: company.created_at,
      updated_at: company.updated_at
    };
  }

  /**
   * Decrypt company record from database
   */
  decryptCompanyRecord(encryptedCompany: any): any {
    return {
      ...encryptedCompany,
      // Decrypt sensitive fields
      name: encryptedCompany.name_encrypted ? this.decrypt(encryptedCompany.name_encrypted) : null,
      address: encryptedCompany.address_encrypted ? this.decrypt(encryptedCompany.address_encrypted) : null,
      phone: encryptedCompany.phone_encrypted ? this.decrypt(encryptedCompany.phone_encrypted) : null,
      email: encryptedCompany.email_encrypted ? this.decrypt(encryptedCompany.email_encrypted) : null,
      gst_registration: encryptedCompany.gst_registration_encrypted ? this.decrypt(encryptedCompany.gst_registration_encrypted) : null,
      
      // Remove encrypted fields from response
      name_encrypted: undefined,
      address_encrypted: undefined,
      phone_encrypted: undefined,
      email_encrypted: undefined,
      gst_registration_encrypted: undefined,
      name_hash: undefined
    };
  }

  /**
   * Search encrypted records by name (uses searchable hash)
   */
  createSearchQuery(searchTerm: string, clientId: string): string {
    return this.createSearchableHash(searchTerm, clientId);
  }

  /**
   * Validate encryption configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.masterKey || this.config.masterKey.length < 32) {
      errors.push('Master key must be at least 32 characters');
    }

    if (this.config.keyDerivationRounds < 10000) {
      errors.push('Key derivation rounds should be at least 10,000');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear client keys from memory (for security)
   */
  clearClientKeys(): void {
    this.clientKeys.clear();
  }

  /**
   * Get encryption status
   */
  getStatus(): {
    algorithm: string;
    masterKeySet: boolean;
    activeClientKeys: number;
    keyDerivationRounds: number;
  } {
    return {
      algorithm: this.config.algorithm,
      masterKeySet: !!this.config.masterKey,
      activeClientKeys: this.clientKeys.size,
      keyDerivationRounds: this.config.keyDerivationRounds
    };
  }
}

export const encryptionService = new EncryptionService();