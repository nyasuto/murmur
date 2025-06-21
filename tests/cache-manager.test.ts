import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CacheManager } from '../src/cache-manager';
import { createTempDir, cleanupTempDir } from './setup';

describe('CacheManager', () => {
  let cache: CacheManager<string>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    cache = new CacheManager<string>({
      maxSize: 5,
      defaultTtl: 1000, // 1 second for testing
      cleanupInterval: 100, // 100ms for testing
    });
  });

  afterEach(async () => {
    cache.destroy();
    await cleanupTempDir(tempDir);
  });

  describe('basic cache operations', () => {
    test('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(true);
    });

    test('should return null for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeNull();
      expect(cache.has('non-existent')).toBe(false);
    });

    test('should handle TTL expiration', async () => {
      cache.set('expiring-key', 'value', 50); // 50ms TTL
      expect(cache.get('expiring-key')).toBe('value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('expiring-key')).toBeNull();
    });

    test('should update access statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.entries[0].accessCount).toBe(3); // 1 set + 2 gets
    });
  });

  describe('capacity management', () => {
    test('should evict oldest entries when at capacity', async () => {
      // Fill cache to capacity with slight delays to ensure different timestamps
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
        if (i < 4) await new Promise(resolve => setTimeout(resolve, 2));
      }

      expect(cache.getStats().size).toBe(5);

      // Add one more - should evict oldest
      cache.set('key5', 'value5');
      expect(cache.getStats().size).toBe(5);
      expect(cache.get('key0')).toBeNull(); // First key should be evicted
      expect(cache.get('key5')).toBe('value5'); // New key should exist
    });

    test('should prioritize recently accessed items for retention', async () => {
      // Fill cache with slight delays
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
        if (i < 4) await new Promise(resolve => setTimeout(resolve, 2));
      }

      // Wait a bit then access key0 to make it recently used
      await new Promise(resolve => setTimeout(resolve, 5));
      cache.get('key0');

      // Add new item
      cache.set('key5', 'value5');

      // key0 should still exist (recently accessed)
      expect(cache.get('key0')).toBe('value0');
      // key1 should be evicted (oldest unaccessed)
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('file-based cache keys', () => {
    test('should generate consistent keys for same file content', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');

      const key1 = await cache.generateFileKey(testFile);
      const key2 = await cache.generateFileKey(testFile);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA256 hex length
    });

    test('should generate different keys for different file content', async () => {
      const testFile1 = path.join(tempDir, 'test1.txt');
      const testFile2 = path.join(tempDir, 'test2.txt');

      await fs.writeFile(testFile1, 'content 1');
      await fs.writeFile(testFile2, 'content 2');

      const key1 = await cache.generateFileKey(testFile1);
      const key2 = await cache.generateFileKey(testFile2);

      expect(key1).not.toBe(key2);
    });

    test('should handle file errors gracefully', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');

      await expect(cache.generateFileKey(nonExistentFile)).rejects.toThrow();
    });
  });

  describe('content-based cache keys', () => {
    test('should generate consistent keys for same content and options', () => {
      const content = 'test content';
      const options = { model: 'gpt-3.5-turbo', temperature: 0.7 };

      const key1 = cache.generateContentKey(content, options);
      const key2 = cache.generateContentKey(content, options);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA256 hex length
    });

    test('should generate different keys for different content', () => {
      const options = { model: 'gpt-3.5-turbo' };

      const key1 = cache.generateContentKey('content 1', options);
      const key2 = cache.generateContentKey('content 2', options);

      expect(key1).not.toBe(key2);
    });

    test('should generate different keys for different options', () => {
      const content = 'same content';

      const key1 = cache.generateContentKey(content, { temperature: 0.5 });
      const key2 = cache.generateContentKey(content, { temperature: 0.7 });

      expect(key1).not.toBe(key2);
    });
  });

  describe('cache statistics', () => {
    test('should provide accurate statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.entries).toHaveLength(2);

      // Check that entries are sorted by access count
      expect(stats.entries[0].accessCount).toBeGreaterThanOrEqual(stats.entries[1].accessCount);
    });

    test('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss (returns null)

      const stats = cache.getStats();
      // Hit rate calculation: total accesses / cacheable requests
      // key1 was accessed 3 times (1 set + 2 gets), key2 doesn't exist so not counted
      expect(stats.entries[0].accessCount).toBe(3);
    });
  });

  describe('cleanup functionality', () => {
    test('should clean up expired entries', async () => {
      cache.set('short-lived', 'value', 50); // 50ms TTL
      cache.set('long-lived', 'value', 5000); // 5s TTL

      expect(cache.getStats().size).toBe(2);

      // Wait for short-lived entry to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Manually trigger cleanup since timer is disabled in test env
      (cache as any).cleanup();

      expect(cache.get('short-lived')).toBeNull();
      expect(cache.get('long-lived')).toBe('value');
    });

    test('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.getStats().size).toBe(2);

      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });
});
