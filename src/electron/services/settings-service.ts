import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AppSettings {
  supabase?: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
  s3?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    bucketName: string;
  };
  tally?: {
    odbcConnectionString: string;
  };
  firstRun: boolean;
}

export class SettingsService {
  private settingsPath: string;
  private settings: AppSettings = { firstRun: true };

  constructor() {
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, 'settings.json');
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        this.settings = JSON.parse(data);
      } else {
        // Default settings for first run
        this.settings = {
          firstRun: true
        };
        this.saveSettings();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.settings = { firstRun: true };
    }
  }

  private saveSettings(): void {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
      console.log('Settings saved to:', this.settingsPath);
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  isFirstRun(): boolean {
    return this.settings.firstRun === true;
  }

  markSetupComplete(): void {
    this.settings.firstRun = false;
    this.saveSettings();
  }

  getSupabaseConfig(): { url: string; anonKey: string; serviceRoleKey?: string } | null {
    return this.settings.supabase || null;
  }

  setSupabaseConfig(url: string, anonKey: string, serviceRoleKey?: string): void {
    this.settings.supabase = { url, anonKey, serviceRoleKey };
    this.saveSettings();
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }
}

// Global instance
export const settingsService = new SettingsService();