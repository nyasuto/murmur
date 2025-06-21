// IPC channel type definitions for Electron communication

import {
  Settings,
  ValidationResult,
  TranscriptionResult,
  TranscriptionOptions,
  APIResponse,
} from './index';

interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface ElectronAPI {
  // App info
  getAppVersion(): Promise<string>;

  // Settings management
  getSettings(): Promise<APIResponse<Settings>>;
  saveSettings(settings: Partial<Settings>): Promise<APIResponse>;

  // Obsidian integration
  validateObsidianVault(
    path: string
  ): Promise<{ success: boolean; validation?: ValidationResult; error?: string }>;
  saveToObsidian(content: string, options?: any): Promise<APIResponse & { fileName?: string }>;
  selectObsidianVault(): Promise<FileDialogResult>;

  // OpenAI integration
  testOpenAIConnection(): Promise<APIResponse>;
  transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult>;
  formatText(text: string, options?: any): Promise<APIResponse & { formatted_text?: string }>;

  // File operations
  selectAudioFile(): Promise<APIResponse<string>>;
  saveAudioRecording(
    audioBuffer: Uint8Array,
    fileName: string
  ): Promise<APIResponse & { filePath?: string }>;
  cleanupAudioRecording(): Promise<APIResponse>;

  // Logging
  logInfo(message: string, details?: any): Promise<void>;
  logWarn(message: string, details?: any): Promise<void>;
  logError(message: string, details?: any): Promise<void>;
  logAction(action: string, details?: any): Promise<void>;

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
