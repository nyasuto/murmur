import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { Settings, ValidationResult } from './types';
import {
  validateFilePath,
  validateApiKey,
  sanitizeApiKeyForLogging,
  sanitizePathForLogging,
} from './security-utils';

interface LegacyConfig {
  obsidian_vault_path?: string;
  openai_api_key?: string;
  file_naming_pattern?: string;
  whisper_language?: string;
  primary_language?: string;
  openai_model?: string;
  openai_temperature?: number;
  auto_save_enabled?: boolean;
}

interface FilenameOptions {
  format?: string;
  title?: string;
}

class SettingsManager {
  private readonly settingsDir: string;
  private readonly settingsFile: string;
  private readonly defaultSettings: Settings;

  constructor() {
    this.settingsDir = path.join(os.homedir(), '.murmur');
    this.settingsFile = path.join(this.settingsDir, 'settings.json');
    this.defaultSettings = {
      obsidianVaultPath: '',
      openaiApiKey: '',
      fileNameFormat: 'voice-memo-{timestamp}',
      autoSave: true,
      language: 'ja',
      gptModel: 'gpt-3.5-turbo',
      temperature: 0.7,
    };
  }

  /**
   * Initialize settings directory
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing settings manager...');
      await fs.ensureDir(this.settingsDir);

      // Check for legacy config.json file and migrate first
      const legacyConfigPath = path.join(this.settingsDir, 'config.json');
      const hasLegacyConfig = await fs.pathExists(legacyConfigPath);
      const hasSettings = await fs.pathExists(this.settingsFile);

      console.log('Settings initialization check:', {
        settingsDir: this.settingsDir,
        settingsFile: this.settingsFile,
        hasLegacyConfig,
        hasSettings,
      });

      if (hasLegacyConfig && !hasSettings) {
        console.log('Found legacy config.json, migrating during initialization...');
        await this.migrateLegacyConfig();
      } else if (!hasSettings) {
        console.log('No settings found, creating default settings...');
        await this.saveSettings(this.defaultSettings);
      } else {
        console.log('Settings file already exists, skipping initialization');
      }
    } catch (error) {
      console.error('Failed to initialize settings:', error);
      throw error;
    }
  }

  /**
   * Migrate legacy config.json to new settings.json format
   */
  async migrateLegacyConfig(): Promise<Settings> {
    try {
      const legacyConfigPath = path.join(this.settingsDir, 'config.json');
      console.log('Reading legacy config from:', legacyConfigPath);

      const legacyData: LegacyConfig = await fs.readJson(legacyConfigPath);
      console.log('Legacy config loaded:', {
        hasApiKey: !!legacyData.openai_api_key,
        hasVaultPath: !!legacyData.obsidian_vault_path,
        apiKeyPrefix: sanitizeApiKeyForLogging(legacyData.openai_api_key || ''),
        apiKeyLength: legacyData.openai_api_key?.length || 0,
      });

      // Map legacy fields to new settings format
      const migratedSettings: Settings = {
        ...this.defaultSettings,
        obsidianVaultPath: legacyData.obsidian_vault_path || '',
        openaiApiKey: legacyData.openai_api_key || '',
        fileNameFormat: legacyData.file_naming_pattern || this.defaultSettings.fileNameFormat,
        language: (legacyData.whisper_language || legacyData.primary_language || 'ja') as
          | 'ja'
          | 'en',
        gptModel: legacyData.openai_model || 'gpt-3.5-turbo',
        temperature: legacyData.openai_temperature || 0.7,
        autoSave: legacyData.auto_save_enabled !== undefined ? legacyData.auto_save_enabled : true,
      };

      console.log('Migrated settings:', {
        hasApiKey: !!migratedSettings.openaiApiKey,
        hasVaultPath: !!migratedSettings.obsidianVaultPath,
        vaultPath: sanitizePathForLogging(migratedSettings.obsidianVaultPath),
        model: migratedSettings.gptModel,
      });

      // Save migrated settings
      await fs.writeJson(this.settingsFile, migratedSettings, { spaces: 2 });
      console.log('Migrated settings saved to:', this.settingsFile);

      // Backup legacy file
      const backupPath = path.join(this.settingsDir, 'config.json.backup');
      await fs.move(legacyConfigPath, backupPath);
      console.log('Legacy config backed up to:', backupPath);

      return migratedSettings;
    } catch (error) {
      console.error('Failed to migrate legacy config:', error);
      throw error;
    }
  }

  /**
   * Load settings from file
   */
  async loadSettings(): Promise<Settings> {
    try {
      await this.initialize();

      if (await fs.pathExists(this.settingsFile)) {
        console.log('Loading settings from:', this.settingsFile);
        const settingsData = await fs.readJson(this.settingsFile);
        const mergedSettings: Settings = { ...this.defaultSettings, ...settingsData };

        console.log('Settings loaded successfully:', {
          hasApiKey: !!mergedSettings.openaiApiKey,
          hasVaultPath: !!mergedSettings.obsidianVaultPath,
          vaultPath: sanitizePathForLogging(mergedSettings.obsidianVaultPath),
          model: mergedSettings.gptModel,
        });

        return mergedSettings;
      }

      console.log('No settings file found, returning defaults');
      return this.defaultSettings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Save settings to file
   */
  async saveSettings(settings: Partial<Settings>): Promise<boolean> {
    try {
      await fs.ensureDir(this.settingsDir);

      // Validate API key if provided
      if (settings.openaiApiKey && !validateApiKey(settings.openaiApiKey)) {
        console.warn('Invalid API key format detected');
        return false;
      }

      // Validate vault path if provided
      if (settings.obsidianVaultPath) {
        try {
          validateFilePath(settings.obsidianVaultPath);
        } catch (error) {
          console.error('Invalid vault path:', (error as Error).message);
          return false;
        }
      }

      // Merge with existing settings (avoid recursive call)
      let currentSettings = this.defaultSettings;
      if (await fs.pathExists(this.settingsFile)) {
        try {
          const existingData = await fs.readJson(this.settingsFile);
          currentSettings = { ...this.defaultSettings, ...existingData };
        } catch (error) {
          console.warn('Failed to read existing settings, using defaults:', error);
        }
      }

      const newSettings: Settings = { ...currentSettings, ...settings };

      // Don't save empty API keys to file for security
      if (newSettings.openaiApiKey && newSettings.openaiApiKey.trim() === '') {
        delete (newSettings as any).openaiApiKey;
      }

      await fs.writeJson(this.settingsFile, newSettings, { spaces: 2 });
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  /**
   * Validate Obsidian vault path
   */
  async validateObsidianVault(vaultPath: string): Promise<ValidationResult> {
    try {
      if (!vaultPath || vaultPath.trim() === '') {
        return { valid: false, error: 'Vault path is required' };
      }

      // Validate path for security
      let normalizedPath: string;
      try {
        normalizedPath = validateFilePath(vaultPath);
        normalizedPath = path.resolve(normalizedPath);
      } catch (error) {
        return { valid: false, error: `Security error: ${(error as Error).message}` };
      }

      // Check if directory exists
      if (!(await fs.pathExists(normalizedPath))) {
        return { valid: false, error: 'Directory does not exist' };
      }

      // Check if it's a directory
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return { valid: false, error: 'Path is not a directory' };
      }

      // Check if we can write to it
      try {
        const testFile = path.join(normalizedPath, '.murmur-test');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
      } catch (error) {
        return { valid: false, error: 'No write permission to directory' };
      }

      // Check if it looks like an Obsidian vault (has .obsidian folder)
      const obsidianDir = path.join(normalizedPath, '.obsidian');
      const hasObsidianConfig = await fs.pathExists(obsidianDir);

      return {
        valid: true,
        path: normalizedPath,
        warning: hasObsidianConfig
          ? undefined
          : 'Directory does not appear to be an Obsidian vault',
      };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  /**
   * Generate filename for voice memo
   */
  generateFileName(options: FilenameOptions = {}): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const date = new Date().toISOString().split('T')[0];
    const time = new Date()
      .toLocaleTimeString('ja-JP', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })
      .replace(':', '-');

    let fileName = options.format || this.defaultSettings.fileNameFormat;

    // Replace placeholders
    fileName = fileName
      .replace('{timestamp}', timestamp)
      .replace('{date}', date)
      .replace('{time}', time)
      .replace('{title}', options.title || 'voice-memo');

    // Ensure .md extension
    if (!fileName.endsWith('.md')) {
      fileName += '.md';
    }

    return fileName;
  }

  /**
   * Get settings file path for debugging
   */
  getSettingsPath(): string {
    return this.settingsFile;
  }
}

export default SettingsManager;
