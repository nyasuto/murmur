const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const OpenAIClient = require('./src/openai-client');
require('dotenv').config();

// Keep a global reference of the window object
let mainWindow;

// Audio recording state
let currentRecordingPath = null;
const tempDir = path.join(os.tmpdir(), 'murmur-recordings');

// OpenAI client instance
let openaiClient = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'), // Add icon later
    title: 'Murmur - 音声ライフログ'
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
async function initializeTempDir() {
  try {
    await fs.ensureDir(tempDir);
  } catch (error) {
    console.error('Failed to create temp directory:', error);
  }
}

// Initialize OpenAI client
function initializeOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    openaiClient = new OpenAIClient(apiKey);
    console.log('OpenAI client initialized');
  } else {
    console.warn('OpenAI API key not found in environment variables');
  }
}

// App event handlers
app.whenReady().then(async () => {
  await initializeTempDir();
  initializeOpenAIClient();
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
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
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Obsidian Vaultのパスを選択',
    defaultPath: 'vault',
    properties: ['openDirectory']
  });
  return result;
});

// Audio recording handlers
ipcMain.handle('save-audio-recording', async (event, audioBuffer, fileName) => {
  try {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, Buffer.from(audioBuffer));
    currentRecordingPath = filePath;
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save audio recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-audio-recording-path', () => {
  return currentRecordingPath;
});

ipcMain.handle('cleanup-audio-recording', async () => {
  try {
    if (currentRecordingPath && await fs.pathExists(currentRecordingPath)) {
      await fs.remove(currentRecordingPath);
    }
    currentRecordingPath = null;
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup audio recording:', error);
    return { success: false, error: error.message };
  }
});

// OpenAI API handlers
ipcMain.handle('transcribe-audio', async (event, options = {}) => {
  try {
    if (!openaiClient) {
      return { success: false, error: 'OpenAI client not initialized. Please check your API key.' };
    }

    if (!currentRecordingPath || !await fs.pathExists(currentRecordingPath)) {
      return { success: false, error: 'No audio recording found' };
    }

    console.log('Transcribing audio:', currentRecordingPath);
    const result = await openaiClient.transcribeAudio(currentRecordingPath, {
      language: options.language || 'ja', // Default to Japanese
      temperature: options.temperature || 0,
      response_format: 'json'
    });

    return result;
  } catch (error) {
    console.error('Audio transcription failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('format-text', async (event, text, options = {}) => {
  try {
    if (!openaiClient) {
      return { success: false, error: 'OpenAI client not initialized. Please check your API key.' };
    }

    if (!text || text.trim() === '') {
      return { success: false, error: 'No text to format' };
    }

    console.log('Formatting text with GPT');
    const result = await openaiClient.formatText(text, {
      model: options.model || 'gpt-3.5-turbo',
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000
    });

    return result;
  } catch (error) {
    console.error('Text formatting failed:', error);
    return { success: false, error: error.message };
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
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-openai-key', async (event, apiKey) => {
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
    return { success: false, error: error.message };
  }
});

// Prevent navigation away from the app
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});