import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI } from './src/types/ipc';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Obsidian integration
  validateObsidianVault: (path) => ipcRenderer.invoke('validate-obsidian-vault', path),
  saveToObsidian: (content, settings) => ipcRenderer.invoke('save-to-obsidian', content, settings),
  selectObsidianVault: () => ipcRenderer.invoke('show-save-dialog'),
  
  // OpenAI integration
  testOpenAIConnection: () => ipcRenderer.invoke('test-openai-connection'),
  transcribeAudio: (options) => ipcRenderer.invoke('transcribe-audio', options),
  formatText: (text, options) => ipcRenderer.invoke('format-text', text, options),
  
  // File operations
  selectAudioFile: () => ipcRenderer.invoke('show-save-dialog'),
  saveAudioRecording: (audioBuffer, fileName) => ipcRenderer.invoke('save-audio-recording', audioBuffer, fileName),
  cleanupAudioRecording: () => ipcRenderer.invoke('cleanup-audio-recording'),
  
  // Logging
  logInfo: (message, details) => ipcRenderer.invoke('log-info', message, details),
  logWarn: (message, details) => ipcRenderer.invoke('log-warn', message, details),
  logError: (message, details) => ipcRenderer.invoke('log-error', message, details),
  logAction: (action, details) => ipcRenderer.invoke('log-action', action, details),
  
  // Recording
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);