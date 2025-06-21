import '@testing-library/jest-dom';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Global test setup
beforeAll(() => {
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MURMUR_TEST_MODE = 'true';
  
  // Override console methods in test to reduce noise
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Clean up test environment
  delete process.env.MURMUR_TEST_MODE;
  
  // Restore console methods
  jest.restoreAllMocks();
});

// Helper functions for tests
export const createTempDir = async (): Promise<string> => {
  // Use home directory for test temp files to avoid /var restrictions
  const baseTmpDir = path.join(os.homedir(), '.tmp');
  await fs.ensureDir(baseTmpDir); // Ensure base temp directory exists
  
  const tempDir = path.join(baseTmpDir, 'murmur-test', Date.now().toString());
  await fs.ensureDir(tempDir);
  return tempDir;
};

export const cleanupTempDir = async (tempDir: string): Promise<void> => {
  if (await fs.pathExists(tempDir)) {
    await fs.remove(tempDir);
  }
};

export const createMockApiKey = (): string => {
  return 'sk-test1234567890abcdef1234567890abcdef1234567890abcdef';
};

export const createMockVaultPath = async (): Promise<string> => {
  const vaultPath = await createTempDir();
  // Create .obsidian directory to make it look like a real vault
  await fs.ensureDir(path.join(vaultPath, '.obsidian'));
  return vaultPath;
};