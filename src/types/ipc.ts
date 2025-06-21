// IPC channel type definitions for Electron communication

import { Settings, ValidationResult, TranscriptionResult, TranscriptionOptions, APIResponse } from './index';

export interface ElectronAPI {
  // Settings management
  getSettings(): Promise<APIResponse<Settings>>;
  saveSettings(settings: Settings): Promise<APIResponse>;
  
  // Obsidian integration
  validateObsidianVault(path: string): Promise<APIResponse<ValidationResult>>;
  saveToObsidian(content: string, settings: Settings): Promise<APIResponse>;
  selectObsidianVault(): Promise<APIResponse<string>>;
  
  // OpenAI integration
  testOpenAIConnection(): Promise<APIResponse>;
  transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult>;
  
  // File operations
  selectAudioFile(): Promise<APIResponse<string>>;
  
  // Logging
  logInfo(message: string, details?: any): Promise<void>;
  logWarn(message: string, details?: any): Promise<void>;
  logError(message: string, details?: any): Promise<void>;
  
  // Recording
  startRecording(): Promise<APIResponse>;
  stopRecording(): Promise<APIResponse<string>>;
}

// Global window interface extension
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};