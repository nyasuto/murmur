import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import { TranscriptionResult } from './types';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTtl?: number;
  cleanupInterval?: number;
}

export class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.defaultTtl = options.defaultTtl || 24 * 60 * 60 * 1000; // 24 hours

    // Start cleanup interval only if not in test environment
    const cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1 hour
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
    }
  }

  /**
   * Generate cache key from file path using file hash
   */
  async generateFileKey(filePath: string): Promise<string> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      throw new Error(`Failed to generate file hash: ${error}`);
    }
  }

  /**
   * Generate cache key from string content
   */
  generateContentKey(content: string, options?: Record<string, any>): string {
    const combined = JSON.stringify({ content, options });
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Get item from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    return entry.data;
  }

  /**
   * Set item in cache
   */
  set(key: string, data: T, ttl?: number): void {
    // If updating existing key, just update the entry
    if (this.cache.has(key)) {
      const existingEntry = this.cache.get(key)!;
      existingEntry.data = data;
      existingEntry.timestamp = Date.now();
      existingEntry.ttl = ttl || this.defaultTtl;
      existingEntry.accessCount++;
      existingEntry.lastAccessed = Date.now();
      return;
    }

    // Remove oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      key: string;
      accessCount: number;
      age: number;
      lastAccessed: number;
    }>;
    } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key: key.substring(0, 16) + '...', // Truncate for readability
      accessCount: entry.accessCount,
      age: Date.now() - entry.timestamp,
      lastAccessed: entry.lastAccessed,
    }));

    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheableRequests = entries.length;
    const hitRate = cacheableRequests > 0 ? totalAccesses / cacheableRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate,
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Evict oldest entry (LRU strategy)
   */
  private evictOldest(): void {
    if (this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Cleanup timer on destruction
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

// Specific cache configurations for different data types
export const transcriptionCache = new CacheManager<TranscriptionResult>({
  maxSize: 100,
  defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
  cleanupInterval: 60 * 60 * 1000, // 1 hour
});

interface FormatTextResult {
  success: boolean;
  formatted_text?: string;
  usage?: any;
  model?: string;
  error?: string;
  details?: any;
}

export const formattingCache = new CacheManager<FormatTextResult>({
  maxSize: 50,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  cleanupInterval: 30 * 60 * 1000, // 30 minutes
});
