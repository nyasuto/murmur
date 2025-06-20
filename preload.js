const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // File operations
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  
  // Audio recording (to be implemented)
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  
  // OpenAI API calls (to be implemented)
  transcribeAudio: (audioData) => ipcRenderer.invoke('transcribe-audio', audioData),
  formatText: (text) => ipcRenderer.invoke('format-text', text),
  
  // File saving (to be implemented)
  saveToObsidian: (content, fileName) => ipcRenderer.invoke('save-to-obsidian', content, fileName),
  
  // Settings (to be implemented)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});