import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import OpenAIClient from './src/openai-client';
import SettingsManager from './src/settings-manager';
import ObsidianSaver from './src/obsidian-saver';
import logger from './src/logger';
import { Settings, TranscriptionOptions, APIResponse } from './src/types';

require('dotenv').config();

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Audio recording state
let currentRecordingPath: string | null = null;
const tempDir = path.join(os.tmpdir(), 'murmur-recordings');

// OpenAI client instance
let openaiClient: OpenAIClient | null = null;

// Settings and Obsidian instances
let settingsManager: SettingsManager | null = null;
let obsidianSaver: ObsidianSaver | null = null;

interface SaveAudioResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

interface CreateEnvOptions {
  openaiApiKey?: string;
  obsidianVaultPath?: string;
}

interface EnvFileResult {
  success: boolean;
  exists?: boolean;
  path?: string;
  error?: string;
}

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'assets/icon.png'), // Add icon later
    title: 'Murmur - 音声ライフログ',
  });

  // Load the app
  mainWindow.loadFile('renderer/index.html');

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize temp directory
async function initializeTempDir(): Promise<void> {
  try {
    await fs.ensureDir(tempDir);
  } catch (error) {
    console.error('Failed to create temp directory:', error);
  }
}

// Initialize OpenAI client
function initializeOpenAIClient(): void {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    openaiClient = new OpenAIClient(apiKey);
    console.log('OpenAI client initialized');
  } else {
    console.warn('OpenAI API key not found in environment variables');
  }
}

// Initialize settings and Obsidian
async function initializeSettings(): Promise<void> {
  try {
    settingsManager = new SettingsManager();
    await settingsManager.initialize();
    
    obsidianSaver = new ObsidianSaver(settingsManager);
    
    console.log('Settings and Obsidian saver initialized');
  } catch (error) {
    console.error('Failed to initialize settings:', error);
  }
}

// App event handlers
app.whenReady().then(async () => {
  // Initialize logger first
  await logger.initialize();
  await logger.info('Application starting', { 
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node
  });

  await initializeTempDir();
  await initializeSettings();
  initializeOpenAIClient();
  createWindow();
  
  await logger.info('Application startup completed');
});

app.on('window-all-closed', async () => {
  await logger.info('All windows closed', { platform: process.platform });
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    await logger.info('Application quitting');
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for renderer communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Obsidian Vaultのパスを選択',
    properties: ['openDirectory'],
  });
  return result;
});

// Audio recording handlers
ipcMain.handle('save-audio-recording', async (_event: IpcMainInvokeEvent, audioBuffer: ArrayBuffer, fileName: string): Promise<SaveAudioResult> => {
  try {
    await logger.info('Saving audio recording', { fileName, size: audioBuffer.byteLength });
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, Buffer.from(audioBuffer));
    currentRecordingPath = filePath;
    await logger.info('Audio recording saved successfully', { filePath });
    return { success: true, filePath };
  } catch (error) {
    await logger.error('Failed to save audio recording', error as Error, { fileName });
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('get-audio-recording-path', () => {
  return currentRecordingPath;
});

ipcMain.handle('cleanup-audio-recording', async (): Promise<SaveAudioResult> => {
  try {
    if (currentRecordingPath && (await fs.pathExists(currentRecordingPath))) {
      await fs.remove(currentRecordingPath);
    }
    currentRecordingPath = null;
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup audio recording:', error);
    return { success: false, error: (error as Error).message };
  }
});

// OpenAI API handlers
ipcMain.handle('transcribe-audio', async (_event: IpcMainInvokeEvent, options: TranscriptionOptions = {}) => {
  const startTime = Date.now();
  try {
    await logger.info('Starting audio transcription', { options, audioPath: currentRecordingPath });
    
    if (!openaiClient) {
      await logger.warn('OpenAI client not initialized for transcription');
      return { success: false, error: 'OpenAI client not initialized. Please check your API key.' };
    }

    if (!currentRecordingPath || !(await fs.pathExists(currentRecordingPath))) {
      await logger.warn('No audio recording found for transcription');
      return { success: false, error: 'No audio recording found' };
    }

    const result = await openaiClient.transcribeAudio(currentRecordingPath, {
      language: options.language || 'ja', // Default to Japanese
      temperature: options.temperature || 0,
      response_format: 'json',
    });

    const duration = Date.now() - startTime;
    await logger.apiCall('OpenAI', 'transcribeAudio', duration, result.success);
    
    if (result.success) {
      await logger.info('Audio transcription completed', { 
        textLength: result.text?.length,
        duration 
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    await logger.apiCall('OpenAI', 'transcribeAudio', duration, false, error as Error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('format-text', async (_event: IpcMainInvokeEvent, text: string, options: any = {}) => {
  const startTime = Date.now();
  try {
    await logger.info('Starting text formatting', { 
      textLength: text?.length,
      model: options.model || 'gpt-3.5-turbo',
      options 
    });
    
    if (!openaiClient) {
      await logger.warn('OpenAI client not initialized for text formatting');
      return { success: false, error: 'OpenAI client not initialized. Please check your API key.' };
    }

    if (!text || text.trim() === '') {
      await logger.warn('No text provided for formatting');
      return { success: false, error: 'No text to format' };
    }

    const result = await openaiClient.formatText(text, {
      model: options.model || 'gpt-3.5-turbo',
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
    });

    const duration = Date.now() - startTime;
    await logger.apiCall('OpenAI', 'formatText', duration, result.success);
    
    if (result.success) {
      await logger.info('Text formatting completed', { 
        inputLength: text.length,
        outputLength: result.formatted_text?.length,
        duration 
      });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    await logger.apiCall('OpenAI', 'formatText', duration, false, error as Error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('test-openai-connection', async () => {
  try {
    if (!openaiClient) {
      return { success: false, error: 'OpenAI client not initialized' };
    }

    const isConnected = await openaiClient.testConnection();
    return { success: isConnected, connected: isConnected };
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('update-openai-key', async (_event: IpcMainInvokeEvent, apiKey: string) => {
  try {
    if (!apiKey || apiKey.trim() === '') {
      openaiClient = null;
      return { success: false, error: 'API key is required' };
    }

    openaiClient = new OpenAIClient(apiKey.trim());

    // Test the connection
    const isConnected = await openaiClient.testConnection();
    if (isConnected) {
      return { success: true, message: 'OpenAI client updated successfully' };
    } else {
      openaiClient = null;
      return { success: false, error: 'Invalid API key or connection failed' };
    }
  } catch (error) {
    console.error('Failed to update OpenAI key:', error);
    openaiClient = null;
    return { success: false, error: (error as Error).message };
  }
});

// Settings handlers
ipcMain.handle('get-settings', async (): Promise<APIResponse<Settings>> => {
  try {
    await logger.info('Loading settings');
    
    if (!settingsManager) {
      await logger.error('Settings manager not initialized');
      return { success: false, error: 'Settings manager not initialized' };
    }
    
    const settings = await settingsManager.loadSettings();
    await logger.info('Settings loaded successfully', { 
      hasApiKey: !!settings.openaiApiKey,
      hasVaultPath: !!settings.obsidianVaultPath 
    });
    return { success: true, data: settings };
  } catch (error) {
    await logger.error('Failed to get settings', error as Error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('save-settings', async (_event: IpcMainInvokeEvent, newSettings: Partial<Settings>): Promise<APIResponse> => {
  try {
    await logger.info('Saving settings', { 
      hasApiKey: !!newSettings.openaiApiKey,
      hasVaultPath: !!newSettings.obsidianVaultPath 
    });
    
    if (!settingsManager) {
      await logger.error('Settings manager not initialized for save');
      return { success: false, error: 'Settings manager not initialized' };
    }
    
    const success = await settingsManager.saveSettings(newSettings);
    
    if (success) {
      await logger.info('Settings saved successfully');
      
      // Update OpenAI client if API key changed
      if (newSettings.openaiApiKey && newSettings.openaiApiKey.trim() !== '') {
        openaiClient = new OpenAIClient(newSettings.openaiApiKey.trim());
        await logger.info('OpenAI client updated with new API key');
      }
    } else {
      await logger.warn('Settings save operation returned false');
    }
    
    return { success, message: success ? 'Settings saved successfully' : 'Failed to save settings' };
  } catch (error) {
    await logger.error('Failed to save settings', error as Error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('validate-obsidian-vault', async (_event: IpcMainInvokeEvent, vaultPath: string) => {
  try {
    if (!settingsManager) {
      return { success: false, error: 'Settings manager not initialized' };
    }
    
    const validation = await settingsManager.validateObsidianVault(vaultPath);
    return { success: true, validation };
  } catch (error) {
    console.error('Failed to validate vault:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Obsidian save handlers
ipcMain.handle('save-to-obsidian', async (_event: IpcMainInvokeEvent, content: string, options: any = {}) => {
  try {
    if (!obsidianSaver) {
      return { success: false, error: 'Obsidian saver not initialized' };
    }
    
    const result = await obsidianSaver.saveToVault(content, options);
    return result;
  } catch (error) {
    console.error('Failed to save to Obsidian:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('list-voice-memos', async (_event: IpcMainInvokeEvent, options: any = {}) => {
  try {
    if (!obsidianSaver) {
      return { success: false, error: 'Obsidian saver not initialized' };
    }
    
    const result = await obsidianSaver.listVoiceMemos(options);
    return result;
  } catch (error) {
    console.error('Failed to list voice memos:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('delete-voice-memo', async (_event: IpcMainInvokeEvent, fileName: string, options: any = {}) => {
  try {
    if (!obsidianSaver) {
      return { success: false, error: 'Obsidian saver not initialized' };
    }
    
    const result = await obsidianSaver.deleteVoiceMemo(fileName, options);
    return result;
  } catch (error) {
    console.error('Failed to delete voice memo:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Environment file management
ipcMain.handle('create-env-file', async (_event: IpcMainInvokeEvent, settings: CreateEnvOptions): Promise<EnvFileResult> => {
  try {
    const envPath = path.join(__dirname, '.env');
    const examplePath = path.join(__dirname, '.env.example');
    
    // Check if .env already exists
    if (await fs.pathExists(envPath)) {
      return { success: false, error: '.env file already exists' };
    }
    
    // Read the example file as template
    let envContent = '';
    if (await fs.pathExists(examplePath)) {
      envContent = await fs.readFile(examplePath, 'utf8');
      
      // Replace placeholder values with actual settings
      if (settings.openaiApiKey) {
        envContent = envContent.replace('your_openai_api_key_here', settings.openaiApiKey);
      }
      if (settings.obsidianVaultPath) {
        envContent = envContent.replace('/path/to/your/obsidian/vault', settings.obsidianVaultPath);
      }
    } else {
      // Create basic .env content if no example exists
      envContent = `# OpenAI API Configuration
OPENAI_API_KEY=${settings.openaiApiKey || 'your_openai_api_key_here'}

# Obsidian Configuration  
OBSIDIAN_VAULT_PATH=${settings.obsidianVaultPath || '/path/to/your/obsidian/vault'}

# App Configuration
NODE_ENV=development
`;
    }
    
    await fs.writeFile(envPath, envContent, 'utf8');
    return { success: true, path: envPath };
  } catch (error) {
    console.error('Failed to create .env file:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('check-env-file', async (): Promise<EnvFileResult> => {
  try {
    const envPath = path.join(__dirname, '.env');
    const exists = await fs.pathExists(envPath);
    await logger.info('Checking .env file', { envPath, exists });
    return { success: true, exists, path: envPath };
  } catch (error) {
    await logger.error('Failed to check .env file', error as Error);
    return { success: false, error: (error as Error).message };
  }
});

// Logger handlers for renderer process
ipcMain.handle('log-info', async (_event: IpcMainInvokeEvent, message: string, data?: any) => {
  await logger.info(`[Renderer] ${message}`, data);
});

ipcMain.handle('log-warn', async (_event: IpcMainInvokeEvent, message: string, data?: any) => {
  await logger.warn(`[Renderer] ${message}`, data);
});

ipcMain.handle('log-error', async (_event: IpcMainInvokeEvent, message: string, error?: any, data?: any) => {
  await logger.error(`[Renderer] ${message}`, error, data);
});

ipcMain.handle('log-action', async (_event: IpcMainInvokeEvent, action: string, details?: any) => {
  await logger.action(action, details);
});

// Prevent navigation away from the app
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});