// Common type definitions for Murmur application

export interface Settings {
  obsidianVaultPath: string;
  openaiApiKey: string;
  fileNameFormat: string;
  autoSave: boolean;
  language: 'ja' | 'en';
  gptModel: string;
  temperature: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  path?: string;
}

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  duration?: number;
}

export interface TranscriptionOptions {
  language?: 'ja' | 'en' | 'zh';
  temperature?: number;
  response_format?: 'json' | 'text';
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LogInfo {
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
  timestamp?: string;
}
