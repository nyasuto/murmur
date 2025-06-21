import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs-extra';
import axios from 'axios';
import OpenAIClient from '../src/openai-client';
import { createTempDir, cleanupTempDir, createMockApiKey } from './setup';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAIClient', () => {
  let client: OpenAIClient;
  let tempDir: string;
  let mockApiKey: string;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    tempDir = await createTempDir();
    mockApiKey = createMockApiKey();
    
    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      defaults: {
        headers: {},
        timeout: 60000
      }
    };
    
    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new OpenAIClient(mockApiKey);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should accept valid API key', () => {
      expect(() => new OpenAIClient(mockApiKey)).not.toThrow();
    });

    test('should reject invalid API key', () => {
      expect(() => new OpenAIClient('invalid-key')).toThrow('Invalid OpenAI API key format');
    });

    test('should configure axios client correctly', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.openai.com/v1',
        headers: {
          Authorization: `Bearer ${mockApiKey}`,
          'User-Agent': 'Murmur/1.0.0',
        },
        timeout: 60000,
      });
    });
  });

  describe('transcribeAudio', () => {
    let mockAudioFile: string;

    beforeEach(async () => {
      mockAudioFile = `${tempDir}/test-audio.webm`;
      await fs.writeFile(mockAudioFile, 'fake audio data');
    });

    test('should transcribe audio successfully', async () => {
      const mockResponse = {
        data: {
          text: 'Hello, this is a test transcription.',
          duration: 5.2
        }
      };
      
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.transcribeAudio(mockAudioFile, {
        language: 'en',
        temperature: 0
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(result.duration).toBe(5.2);
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/audio/transcriptions',
        expect.any(Object), // FormData
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data'
          })
        })
      );
    });

    test('should handle missing audio file', async () => {
      // Ensure temp directory exists
      await fs.ensureDir(tempDir);
      const nonExistentFile = `${tempDir}/nonexistent.webm`;
      
      const result = await client.transcribeAudio(nonExistentFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio file not found');
    });

    test('should handle API errors gracefully', async () => {
      const mockError = {
        response: {
          status: 400,
          data: {
            error: {
              message: 'Invalid audio format'
            }
          }
        }
      };
      
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const result = await client.transcribeAudio(mockAudioFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid audio format');
    });

    test('should handle network errors', async () => {
      const networkError = {
        code: 'ENOTFOUND',
        message: 'Network error'
      };
      
      mockAxiosInstance.post.mockRejectedValue(networkError);

      const result = await client.transcribeAudio(mockAudioFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection failed');
    });

    test('should handle timeout errors', async () => {
      const timeoutError = {
        code: 'ETIMEDOUT',
        message: 'Timeout'
      };
      
      mockAxiosInstance.post.mockRejectedValue(timeoutError);

      const result = await client.transcribeAudio(mockAudioFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Request timed out');
    });

    test('should respect rate limiting', async () => {
      // Create a client and exhaust the rate limit
      const rateLimitedClient = new OpenAIClient(mockApiKey);
      
      // Mock the rate limiter to return false
      const rateLimiter = (rateLimitedClient as any).rateLimiter;
      jest.spyOn(rateLimiter, 'isAllowed').mockReturnValue(false);
      jest.spyOn(rateLimiter, 'getTimeUntilReset').mockReturnValue(30000);

      const result = await rateLimitedClient.transcribeAudio(mockAudioFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.error).toContain('30 seconds');
    });
  });

  describe('formatText', () => {
    let mockAxiosInstance: any;

    beforeEach(() => {
      mockAxiosInstance = mockedAxios.create.mock.results[0].value;
    });

    test('should format text successfully', async () => {
      const mockResponse = {
        data: {
          choices: [{
            message: {
              content: '# Meeting Notes\n\n## Summary\nDiscussed project timeline.\n\n## Tags\n#meeting #project'
            }
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 30,
            total_tokens: 80
          },
          model: 'gpt-3.5-turbo'
        }
      };
      
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.formatText('We discussed the project timeline today.', {
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      });

      expect(result.success).toBe(true);
      expect(result.formatted_text).toContain('# Meeting Notes');
      expect(result.usage?.total_tokens).toBe(80);
      expect(result.model).toBe('gpt-3.5-turbo');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('We discussed the project timeline today.')
          })
        ]),
        temperature: 0.7,
        max_tokens: 2000
      });
    });

    test('should use default options when none provided', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Formatted text' } }],
          usage: { total_tokens: 50 },
          model: 'gpt-3.5-turbo'
        }
      };
      
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await client.formatText('Test input');
      
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', 
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 2000
        })
      );
    });

    test('should handle API errors gracefully', async () => {
      const mockError = {
        response: {
          status: 429,
          data: {
            error: {
              message: 'Rate limit exceeded'
            }
          }
        }
      };
      
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const result = await client.formatText('Test input');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    test('should respect rate limiting', async () => {
      const rateLimitedClient = new OpenAIClient(mockApiKey);
      
      const rateLimiter = (rateLimitedClient as any).rateLimiter;
      jest.spyOn(rateLimiter, 'isAllowed').mockReturnValue(false);
      jest.spyOn(rateLimiter, 'getTimeUntilReset').mockReturnValue(45000);

      const result = await rateLimitedClient.formatText('Test input');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.error).toContain('45 seconds');
    });
  });

  describe('testConnection', () => {
    let mockAxiosInstance: any;

    beforeEach(() => {
      mockAxiosInstance = mockedAxios.create.mock.results[0].value;
    });

    test('should return true for successful connection', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const result = await client.testConnection();
      
      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models');
    });

    test('should return false for failed connection', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

      const result = await client.testConnection();
      
      expect(result).toBe(false);
    });
  });
});