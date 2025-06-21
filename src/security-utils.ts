import * as path from 'path';

/**
 * Security utility functions for input validation and sanitization
 */

/**
 * Validate and sanitize file paths to prevent path traversal attacks
 */
export function validateFilePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  // Normalize the path to resolve any relative components
  const normalized = path.normalize(inputPath);

  // Check for path traversal attempts
  if (normalized.includes('../') || normalized.includes('..\\')) {
    throw new Error('Invalid path: path traversal detected');
  }

  // Check for absolute paths that could access system directories
  if (path.isAbsolute(normalized)) {
    // Allow absolute paths but validate they're not accessing sensitive system directories
    const forbiddenPaths = ['/etc', '/usr', '/var', '/sys', '/proc', '/boot', '/dev'];
    const lowerPath = normalized.toLowerCase();

    // Allow /var/folders (macOS temp directories) and /tmp for testing
    const allowedVarPaths = ['/var/folders/', '/var/tmp/'];
    const isAllowedVarPath = allowedVarPaths.some(allowed =>
      lowerPath.startsWith(allowed.toLowerCase())
    );

    for (const forbidden of forbiddenPaths) {
      if (
        lowerPath.startsWith(forbidden.toLowerCase() + path.sep) ||
        lowerPath === forbidden.toLowerCase()
      ) {
        // Special handling for /var directory
        if (forbidden === '/var') {
          // Only allow specific temp directories in /var
          if (isAllowedVarPath) {
            continue;
          }
          // Allow /tmp directory
          if (lowerPath.startsWith('/tmp/')) {
            continue;
          }
        }
        throw new Error(`Invalid path: access to system directory ${forbidden} is not allowed`);
      }
    }
  }

  return normalized;
}

/**
 * Validate OpenAI API key format
 */
export function validateApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // OpenAI API keys should start with "sk-" and be at least 20 characters
  return apiKey.startsWith('sk-') && apiKey.length >= 20;
}

/**
 * Sanitize API key for logging (show only prefix)
 */
export function sanitizeApiKeyForLogging(apiKey: string): string {
  if (!apiKey || typeof apiKey !== 'string') {
    return 'none';
  }

  if (apiKey.length < 10) {
    return 'invalid';
  }

  return apiKey.substring(0, 7) + '...';
}

/**
 * Sanitize file path for logging (hide sensitive directories)
 */
export function sanitizePathForLogging(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    return 'none';
  }

  // Replace home directory with ~
  const homeDir = require('os').homedir();
  if (filePath.startsWith(homeDir)) {
    return filePath.replace(homeDir, '~');
  }

  return filePath;
}

/**
 * Rate limiter class for API calls
 */
export class RateLimiter {
  private calls: number[] = [];
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(maxCalls: number = 10, windowMs: number = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  /**
   * Check if call is allowed under rate limit
   */
  isAllowed(): boolean {
    const now = Date.now();

    // Remove calls outside the window
    this.calls = this.calls.filter(timestamp => now - timestamp < this.windowMs);

    // Check if we're under the limit
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get time until next call is allowed (in ms)
   */
  getTimeUntilReset(): number {
    if (this.calls.length === 0) {
      return 0;
    }

    const oldestCall = Math.min(...this.calls);
    const resetTime = oldestCall + this.windowMs;
    return Math.max(0, resetTime - Date.now());
  }
}
