// Renderer process type declarations
import { ElectronAPI } from '../src/types/ipc';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};