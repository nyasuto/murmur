const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // File operations
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),

  // Audio recording
  saveAudioRecording: (audioBuffer, fileName) =>
    ipcRenderer.invoke('save-audio-recording', audioBuffer, fileName),
  getAudioRecordingPath: () => ipcRenderer.invoke('get-audio-recording-path'),
  cleanupAudioRecording: () => ipcRenderer.invoke('cleanup-audio-recording'),

  // OpenAI API calls
  transcribeAudio: options => ipcRenderer.invoke('transcribe-audio', options),
  formatText: (text, options) => ipcRenderer.invoke('format-text', text, options),
  testOpenAIConnection: () => ipcRenderer.invoke('test-openai-connection'),
  updateOpenAIKey: apiKey => ipcRenderer.invoke('update-openai-key', apiKey),

  // Obsidian operations
  saveToObsidian: (content, options) => ipcRenderer.invoke('save-to-obsidian', content, options),
  listVoiceMemos: options => ipcRenderer.invoke('list-voice-memos', options),
  deleteVoiceMemo: (fileName, options) => ipcRenderer.invoke('delete-voice-memo', fileName, options),

  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  validateObsidianVault: vaultPath => ipcRenderer.invoke('validate-obsidian-vault', vaultPath),
  
  // Environment file management
  createEnvFile: settings => ipcRenderer.invoke('create-env-file', settings),
  checkEnvFile: () => ipcRenderer.invoke('check-env-file'),
  
  // Logging
  logInfo: (message, data) => ipcRenderer.invoke('log-info', message, data),
  logWarn: (message, data) => ipcRenderer.invoke('log-warn', message, data),
  logError: (message, error, data) => ipcRenderer.invoke('log-error', message, error, data),
  logAction: (action, details) => ipcRenderer.invoke('log-action', action, details),
});
