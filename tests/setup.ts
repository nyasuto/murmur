import '@testing-library/jest-dom';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Global test setup
beforeAll(() => {
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MURMUR_TEST_MODE = 'true';
});

afterAll(() => {
  // Clean up test environment
  delete process.env.MURMUR_TEST_MODE;
});

// Helper functions for tests
export const createTempDir = async (): Promise<string> => {
  const tempDir = path.join(os.tmpdir(), 'murmur-test', Date.now().toString());
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