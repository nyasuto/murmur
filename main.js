const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
require('dotenv').config();

// Keep a global reference of the window object
let mainWindow;

// Audio recording state
let currentRecordingPath = null;
const tempDir = path.join(os.tmpdir(), 'murmur-recordings');

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

// App event handlers
app.whenReady().then(async () => {
  await initializeTempDir();
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

// Prevent navigation away from the app
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
});