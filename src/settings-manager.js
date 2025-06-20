const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class SettingsManager {
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
      temperature: 0.7
    };
  }

  /**
   * Initialize settings directory
   */
  async initialize() {
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
        hasSettings
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
  async migrateLegacyConfig() {
    try {
      const legacyConfigPath = path.join(this.settingsDir, 'config.json');
      console.log('Reading legacy config from:', legacyConfigPath);
      
      const legacyData = await fs.readJson(legacyConfigPath);
      console.log('Legacy config loaded:', {
        hasApiKey: !!legacyData.openai_api_key,
        hasVaultPath: !!legacyData.obsidian_vault_path,
        apiKeyLength: legacyData.openai_api_key?.length || 0
      });
      
      // Map legacy fields to new settings format
      const migratedSettings = {
        ...this.defaultSettings,
        obsidianVaultPath: legacyData.obsidian_vault_path || '',
        openaiApiKey: legacyData.openai_api_key || '',
        fileNameFormat: legacyData.file_naming_pattern || this.defaultSettings.fileNameFormat,
        language: legacyData.whisper_language || legacyData.primary_language || 'ja',
        gptModel: legacyData.openai_model || 'gpt-3.5-turbo',
        temperature: legacyData.openai_temperature || 0.7,
        autoSave: legacyData.auto_save_enabled !== undefined ? legacyData.auto_save_enabled : true
      };
      
      console.log('Migrated settings:', {
        hasApiKey: !!migratedSettings.openaiApiKey,
        hasVaultPath: !!migratedSettings.obsidianVaultPath,
        vaultPath: migratedSettings.obsidianVaultPath,
        model: migratedSettings.gptModel
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
   * @returns {Promise<Object>} Settings object
   */
  async loadSettings() {
    try {
      await this.initialize();
      
      if (await fs.pathExists(this.settingsFile)) {
        console.log('Loading settings from:', this.settingsFile);
        const settingsData = await fs.readJson(this.settingsFile);
        const mergedSettings = { ...this.defaultSettings, ...settingsData };
        
        console.log('Settings loaded successfully:', {
          hasApiKey: !!mergedSettings.openaiApiKey,
          hasVaultPath: !!mergedSettings.obsidianVaultPath,
          vaultPath: mergedSettings.obsidianVaultPath,
          model: mergedSettings.gptModel
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
   * @param {Object} settings - Settings to save
   * @returns {Promise<boolean>} Success status
   */
  async saveSettings(settings) {
    try {
      await this.initialize();
      
      // Merge with existing settings
      const currentSettings = await this.loadSettings();
      const newSettings = { ...currentSettings, ...settings };
      
      // Don't save empty API keys to file for security
      if (newSettings.openaiApiKey && newSettings.openaiApiKey.trim() === '') {
        delete newSettings.openaiApiKey;
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
   * @param {string} vaultPath - Path to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateObsidianVault(vaultPath) {
    try {
      if (!vaultPath || vaultPath.trim() === '') {
        return { valid: false, error: 'Vault path is required' };
      }

      const normalizedPath = path.resolve(vaultPath);
      
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
        isObsidianVault: hasObsidianConfig,
        warning: hasObsidianConfig ? null : 'Directory does not appear to be an Obsidian vault'
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Generate filename for voice memo
   * @param {Object} options - Filename options
   * @returns {string} Generated filename
   */
  generateFileName(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('ja-JP', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    }).replace(':', '-');
    
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
   * @returns {string} Settings file path
   */
  getSettingsPath() {
    return this.settingsFile;
  }
}

module.exports = SettingsManager;