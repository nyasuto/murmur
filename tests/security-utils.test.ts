import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { 
  validateFilePath, 
  validateApiKey, 
  sanitizeApiKeyForLogging, 
  sanitizePathForLogging,
  RateLimiter 
} from '../src/security-utils';

describe('Security Utils', () => {
  describe('validateFilePath', () => {
    test('should accept valid relative paths', () => {
      const validPaths = ['./folder', 'folder/subfolder', 'file.txt'];
      
      for (const path of validPaths) {
        expect(() => validateFilePath(path)).not.toThrow();
      }
    });

    test('should accept valid absolute paths', () => {
      const validPaths = ['/Users/test/folder', '/home/user/documents'];
      
      for (const path of validPaths) {
        expect(() => validateFilePath(path)).not.toThrow();
      }
    });

    test('should reject path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        'folder/../../../etc',
        'test/../../..',
        '..\\..\\windows\\system32'
      ];
      
      for (const path of maliciousPaths) {
        expect(() => validateFilePath(path)).toThrow('path traversal detected');
      }
    });

    test('should reject access to system directories', () => {
      const systemPaths = ['/etc/passwd', '/usr/bin', '/sys/kernel', '/proc/version'];
      
      for (const path of systemPaths) {
        expect(() => validateFilePath(path)).toThrow('access to system directory');
      }
    });
    
    test('should reject unsafe /var directories but allow temp directories', () => {
      // Should reject unsafe /var paths
      expect(() => validateFilePath('/var/log')).toThrow('access to system directory');
      expect(() => validateFilePath('/var/lib')).toThrow('access to system directory');
      
      // Should allow temp directories
      expect(() => validateFilePath('/var/folders/temp')).not.toThrow();
      expect(() => validateFilePath('/tmp/test')).not.toThrow();
    });

    test('should reject empty or invalid inputs', () => {
      const invalidInputs = ['', null, undefined, 123];
      
      for (const input of invalidInputs) {
        expect(() => validateFilePath(input as any)).toThrow('must be a non-empty string');
      }
    });
  });

  describe('validateApiKey', () => {
    test('should accept valid OpenAI API keys', () => {
      const validKeys = [
        'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        'sk-proj-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'sk-test1234567890abcdefghijklmnopqrstuvwxyz'
      ];
      
      for (const key of validKeys) {
        expect(validateApiKey(key)).toBe(true);
      }
    });

    test('should reject invalid API key formats', () => {
      const invalidKeys = [
        '', // empty
        'invalid-key',
        'ak-1234567890abcdef', // wrong prefix
        'sk-short', // too short
        'sk-', // just prefix
        null,
        undefined,
        123
      ];
      
      for (const key of invalidKeys) {
        expect(validateApiKey(key as any)).toBe(false);
      }
    });
  });

  describe('sanitizeApiKeyForLogging', () => {
    test('should sanitize valid API keys', () => {
      const apiKey = 'sk-1234567890abcdef1234567890abcdef';
      const sanitized = sanitizeApiKeyForLogging(apiKey);
      
      expect(sanitized).toBe('sk-1234...');
      expect(sanitized).not.toContain('7890abcdef');
    });

    test('should handle invalid inputs gracefully', () => {
      expect(sanitizeApiKeyForLogging('')).toBe('none');
      expect(sanitizeApiKeyForLogging(null as any)).toBe('none');
      expect(sanitizeApiKeyForLogging(undefined as any)).toBe('none');
      expect(sanitizeApiKeyForLogging('short')).toBe('invalid');
    });
  });

  describe('sanitizePathForLogging', () => {
    test('should replace home directory with ~', () => {
      jest.spyOn(require('os'), 'homedir').mockReturnValue('/Users/testuser');
      
      const path = '/Users/testuser/Documents/vault';
      const sanitized = sanitizePathForLogging(path);
      
      expect(sanitized).toBe('~/Documents/vault');
      
      jest.restoreAllMocks();
    });

    test('should leave other paths unchanged', () => {
      const path = '/opt/applications/vault';
      const sanitized = sanitizePathForLogging(path);
      
      expect(sanitized).toBe(path);
    });

    test('should handle invalid inputs gracefully', () => {
      expect(sanitizePathForLogging('')).toBe('none');
      expect(sanitizePathForLogging(null as any)).toBe('none');
      expect(sanitizePathForLogging(undefined as any)).toBe('none');
    });
  });

  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter(3, 1000); // 3 calls per second for testing
    });

    test('should allow calls within limit', () => {
      expect(rateLimiter.isAllowed()).toBe(true);
      expect(rateLimiter.isAllowed()).toBe(true);
      expect(rateLimiter.isAllowed()).toBe(true);
    });

    test('should reject calls exceeding limit', () => {
      // Use up the limit
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      
      // This should be rejected
      expect(rateLimiter.isAllowed()).toBe(false);
    });

    test('should reset after time window', async () => {
      // Use up the limit
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      
      expect(rateLimiter.isAllowed()).toBe(false);
      
      // Wait for reset
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(rateLimiter.isAllowed()).toBe(true);
    });

    test('should calculate correct reset time', () => {
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      rateLimiter.isAllowed();
      rateLimiter.isAllowed(); // This fails
      
      const resetTime = rateLimiter.getTimeUntilReset();
      expect(resetTime).toBeGreaterThan(0);
      expect(resetTime).toBeLessThanOrEqual(1000);
    });

    test('should return 0 reset time when no calls made', () => {
      const resetTime = rateLimiter.getTimeUntilReset();
      expect(resetTime).toBe(0);
    });

    test('should handle custom limits', () => {
      const customLimiter = new RateLimiter(1, 500);
      
      expect(customLimiter.isAllowed()).toBe(true);
      expect(customLimiter.isAllowed()).toBe(false);
    });
  });
});