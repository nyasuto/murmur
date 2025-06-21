import { FullConfig } from '@playwright/test';
import * as fs from 'fs-extra';
import * as path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('Cleaning up E2E test environment...');

  // Clean up test data directory
  const testDataDir = path.join(__dirname, '../../test-data');
  if (await fs.pathExists(testDataDir)) {
    await fs.remove(testDataDir);
  }

  // Clean up environment variables
  delete process.env.E2E_TEST_VAULT_PATH;
  delete process.env.E2E_TEST_AUDIO_PATH;

  console.log('E2E test environment cleanup complete');
}

export default globalTeardown;
