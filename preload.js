const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // File operations
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  
  // Audio recording
  saveAudioRecording: (audioBuffer, fileName) => ipcRenderer.invoke('save-audio-recording', audioBuffer, fileName),
  getAudioRecordingPath: () => ipcRenderer.invoke('get-audio-recording-path'),
  cleanupAudioRecording: () => ipcRenderer.invoke('cleanup-audio-recording'),
  
  // OpenAI API calls
  transcribeAudio: (options) => ipcRenderer.invoke('transcribe-audio', options),
  formatText: (text, options) => ipcRenderer.invoke('format-text', text, options),
  testOpenAIConnection: () => ipcRenderer.invoke('test-openai-connection'),
  updateOpenAIKey: (apiKey) => ipcRenderer.invoke('update-openai-key', apiKey),
  
  // File saving (to be implemented)
  saveToObsidian: (content, fileName) => ipcRenderer.invoke('save-to-obsidian', content, fileName),
  
  // Settings (to be implemented)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});