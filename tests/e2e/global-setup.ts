import { FullConfig } from '@playwright/test';
import * as fs from 'fs-extra';
import * as path from 'path';

async function globalSetup(config: FullConfig) {
  console.log('Setting up E2E test environment...');

  // Create test data directory
  const testDataDir = path.join(__dirname, '../../test-data');
  await fs.ensureDir(testDataDir);

  // Create mock Obsidian vault for testing
  const mockVaultPath = path.join(testDataDir, 'mock-vault');
  await fs.ensureDir(mockVaultPath);
  await fs.ensureDir(path.join(mockVaultPath, '.obsidian'));

  // Create test audio file
  const testAudioPath = path.join(testDataDir, 'test-audio.webm');
  await fs.writeFile(testAudioPath, Buffer.from('fake-audio-data'));

  // Store paths in environment for tests
  process.env.E2E_TEST_VAULT_PATH = mockVaultPath;
  process.env.E2E_TEST_AUDIO_PATH = testAudioPath;

  console.log('E2E test environment setup complete');
}

export default globalSetup;
