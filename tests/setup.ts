import '@testing-library/jest-dom';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { mkdtemp } from 'node:fs/promises';

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
  // Use mkdtemp to create a unique temporary directory for each test
  // This prevents race conditions when multiple Jest workers run in parallel
  try {
    // Try to use home directory for test temp files to avoid /var restrictions
    const baseTmpDir = path.join(os.homedir(), '.tmp');
    await fs.ensureDir(baseTmpDir);
    return await mkdtemp(path.join(baseTmpDir, 'murmur-test-'));
  } catch (error) {
    // If home directory .tmp fails, fall back to OS temp directory
    console.warn('Failed to create temp dir in home, using OS temp:', error);
    return await mkdtemp(path.join(os.tmpdir(), 'murmur-test-'));
  }
};

export const cleanupTempDir = async (tempDir: string): Promise<void> => {
  if (await fs.pathExists(tempDir)) {
    try {
      await fs.remove(tempDir);
    } catch (error) {
      // On some systems, removal might fail due to timing or permissions
      // Log the error but don't fail the test
      console.warn('Failed to cleanup temp directory:', tempDir, error);
    }
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
