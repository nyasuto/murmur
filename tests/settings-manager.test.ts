import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import SettingsManager from '../src/settings-manager';
import { Settings } from '../src/types';
import { createTempDir, cleanupTempDir, createMockApiKey, createMockVaultPath } from './setup';

describe('SettingsManager', () => {
  let settingsManager: SettingsManager;
  let tempDir: string;
  let mockVaultPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    mockVaultPath = await createMockVaultPath();
    
    // Mock os.homedir to use our temp directory
    jest.spyOn(require('os'), 'homedir').mockReturnValue(tempDir);
    
    settingsManager = new SettingsManager();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    await cleanupTempDir(mockVaultPath);
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    test('should create settings directory if it does not exist', async () => {
      await settingsManager.initialize();
      
      const settingsDir = path.join(tempDir, '.murmur');
      expect(await fs.pathExists(settingsDir)).toBe(true);
    });

    test('should create default settings file if none exists', async () => {
      await settingsManager.initialize();
      
      const settingsFile = path.join(tempDir, '.murmur', 'settings.json');
      expect(await fs.pathExists(settingsFile)).toBe(true);
      
      const settings = await fs.readJson(settingsFile);
      expect(settings).toHaveProperty('obsidianVaultPath', '');
      expect(settings).toHaveProperty('openaiApiKey', '');
      expect(settings).toHaveProperty('language', 'ja');
    });
  });

  describe('legacy config migration', () => {
    test('should migrate legacy config.json to new settings.json format', async () => {
      const legacyConfig = {
        obsidian_vault_path: mockVaultPath,
        openai_api_key: createMockApiKey(),
        whisper_language: 'ja',
        openai_model: 'gpt-4o',
        openai_temperature: 0.5,
        auto_save_enabled: true
      };

      // Create legacy config file
      const legacyConfigPath = path.join(tempDir, '.murmur', 'config.json');
      await fs.ensureDir(path.dirname(legacyConfigPath));
      await fs.writeJson(legacyConfigPath, legacyConfig);

      const migratedSettings = await settingsManager.migrateLegacyConfig();

      expect(migratedSettings.obsidianVaultPath).toBe(mockVaultPath);
      expect(migratedSettings.openaiApiKey).toBe(legacyConfig.openai_api_key);
      expect(migratedSettings.language).toBe('ja');
      expect(migratedSettings.gptModel).toBe('gpt-4o');
      expect(migratedSettings.temperature).toBe(0.5);
      expect(migratedSettings.autoSave).toBe(true);

      // Check that legacy file is backed up
      const backupPath = path.join(tempDir, '.murmur', 'config.json.backup');
      expect(await fs.pathExists(backupPath)).toBe(true);
    });

    test('should handle missing legacy config gracefully', async () => {
      await expect(settingsManager.migrateLegacyConfig()).rejects.toThrow();
    });
  });

  describe('settings management', () => {
    test('should load and save settings correctly', async () => {
      const testSettings: Partial<Settings> = {
        obsidianVaultPath: mockVaultPath,
        openaiApiKey: createMockApiKey(),
        gptModel: 'gpt-4o',
        temperature: 0.8
      };

      const success = await settingsManager.saveSettings(testSettings);
      expect(success).toBe(true);

      const loadedSettings = await settingsManager.loadSettings();
      expect(loadedSettings.obsidianVaultPath).toBe(mockVaultPath);
      expect(loadedSettings.openaiApiKey).toBe(testSettings.openaiApiKey);
      expect(loadedSettings.gptModel).toBe('gpt-4o');
      expect(loadedSettings.temperature).toBe(0.8);
    });

    test('should reject invalid API keys', async () => {
      const invalidSettings: Partial<Settings> = {
        openaiApiKey: 'invalid-key'
      };

      const success = await settingsManager.saveSettings(invalidSettings);
      expect(success).toBe(false);
    });

    test('should reject invalid vault paths', async () => {
      const invalidSettings: Partial<Settings> = {
        obsidianVaultPath: '../../../etc/passwd'
      };

      const success = await settingsManager.saveSettings(invalidSettings);
      expect(success).toBe(false);
    });
  });

  describe('Obsidian vault validation', () => {
    test('should validate correct vault path', async () => {
      const result = await settingsManager.validateObsidianVault(mockVaultPath);
      
      expect(result.valid).toBe(true);
      expect(result.path).toBe(path.resolve(mockVaultPath));
      expect(result.warning).toBeUndefined();
    });

    test('should reject non-existent paths', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent');
      const result = await settingsManager.validateObsidianVault(nonExistentPath);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    test('should reject path traversal attempts', async () => {
      const maliciousPath = '../../../etc';
      const result = await settingsManager.validateObsidianVault(maliciousPath);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Security error');
    });

    test('should warn if directory is not an Obsidian vault', async () => {
      const regularDir = await createTempDir();
      const result = await settingsManager.validateObsidianVault(regularDir);
      
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('does not appear to be an Obsidian vault');
      
      await cleanupTempDir(regularDir);
    });

    test('should reject empty or null paths', async () => {
      const result1 = await settingsManager.validateObsidianVault('');
      const result2 = await settingsManager.validateObsidianVault('   ');
      
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result1.error).toContain('required');
      expect(result2.error).toContain('required');
    });
  });

  describe('filename generation', () => {
    test('should generate filename with timestamp', () => {
      const filename = settingsManager.generateFileName();
      
      expect(filename).toMatch(/voice-memo-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md$/);
    });

    test('should use custom title and format', () => {
      const filename = settingsManager.generateFileName({
        format: 'daily-{date}-{title}',
        title: 'meeting-notes'
      });
      
      expect(filename).toMatch(/daily-\d{4}-\d{2}-\d{2}-meeting-notes\.md$/);
    });

    test('should ensure .md extension', () => {
      const filename = settingsManager.generateFileName({
        format: 'test-file'
      });
      
      expect(filename).toBe('test-file.md');
    });
  });
});