import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import OpenAIClient from '../src/openai-client';
import { createTempDir, cleanupTempDir, createMockApiKey } from './setup';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAIClient Caching', () => {
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
        timeout: 60000,
      },
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new OpenAIClient(mockApiKey);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    jest.clearAllMocks();
    client.clearCaches();
  });

  describe('transcription caching', () => {
    test('should cache transcription results for identical files', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockResponse = {
        data: {
          text: 'Hello, this is a test transcription.',
          duration: 5.2,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      // First call should hit the API
      const result1 = await client.transcribeAudio(mockAudioFile, { language: 'en' });
      expect(result1.success).toBe(true);
      expect(result1.text).toBe('Hello, this is a test transcription.');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Second call with same file and options should use cache
      const result2 = await client.transcribeAudio(mockAudioFile, { language: 'en' });
      expect(result2.success).toBe(true);
      expect(result2.text).toBe('Hello, this is a test transcription.');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    test('should not cache different options for same file', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockResponse = {
        data: {
          text: 'Test transcription',
          duration: 3.0,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      // First call with language: 'en'
      await client.transcribeAudio(mockAudioFile, { language: 'en' });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Second call with language: 'ja' should hit API again
      await client.transcribeAudio(mockAudioFile, { language: 'ja' });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    test('should not cache different files with same content', async () => {
      const mockAudioFile1 = path.join(tempDir, 'test-audio1.webm');
      const mockAudioFile2 = path.join(tempDir, 'test-audio2.webm');

      // Different content
      await fs.writeFile(mockAudioFile1, Buffer.from('audio content 1'));
      await fs.writeFile(mockAudioFile2, Buffer.from('audio content 2'));

      const mockResponse = {
        data: {
          text: 'Test transcription',
          duration: 3.0,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      // First file
      await client.transcribeAudio(mockAudioFile1);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Different file should hit API again
      await client.transcribeAudio(mockAudioFile2);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('formatting caching', () => {
    test('should cache formatting results for identical text and options', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: '# Formatted Text\n\nThis is formatted content.',
              },
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 30,
            total_tokens: 80,
          },
          model: 'gpt-3.5-turbo',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const testText = 'This is test text to format';
      const options = { model: 'gpt-3.5-turbo', temperature: 0.7 };

      // First call should hit the API
      const result1 = await client.formatText(testText, options);
      expect(result1.success).toBe(true);
      expect(result1.formatted_text).toBe('# Formatted Text\n\nThis is formatted content.');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Second call with same text and options should use cache
      const result2 = await client.formatText(testText, options);
      expect(result2.success).toBe(true);
      expect(result2.formatted_text).toBe('# Formatted Text\n\nThis is formatted content.');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    test('should not cache different text content', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Formatted content' } }],
          usage: { total_tokens: 50 },
          model: 'gpt-3.5-turbo',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      // First text
      await client.formatText('Text 1');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Different text should hit API again
      await client.formatText('Text 2');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    test('should not cache different options for same text', async () => {
      const mockResponse = {
        data: {
          choices: [{ message: { content: 'Formatted content' } }],
          usage: { total_tokens: 50 },
          model: 'gpt-3.5-turbo',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const testText = 'Same text content';

      // First call with temperature 0.5
      await client.formatText(testText, { temperature: 0.5 });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);

      // Second call with temperature 0.7 should hit API again
      await client.formatText(testText, { temperature: 0.7 });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache statistics', () => {
    test('should provide cache statistics', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const transcriptionResponse = {
        data: { text: 'Test transcription', duration: 3.0 },
      };

      const formattingResponse = {
        data: {
          choices: [{ message: { content: 'Formatted text' } }],
          usage: { total_tokens: 50 },
          model: 'gpt-3.5-turbo',
        },
      };

      mockAxiosInstance.post
        .mockResolvedValueOnce(transcriptionResponse)
        .mockResolvedValueOnce(formattingResponse);

      // Make some API calls
      await client.transcribeAudio(mockAudioFile);
      await client.formatText('Test text');

      // Get cache stats
      const stats = client.getCacheStats();

      expect(stats.transcription.size).toBe(1);
      expect(stats.formatting.size).toBe(1);
      expect(stats.transcription.entries[0].accessCount).toBe(1);
      expect(stats.formatting.entries[0].accessCount).toBe(1);
    });

    test('should track cache hits correctly', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockResponse = {
        data: { text: 'Test transcription', duration: 3.0 },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      // First call - cache miss
      await client.transcribeAudio(mockAudioFile);

      // Second call - cache hit
      await client.transcribeAudio(mockAudioFile);

      // Third call - cache hit
      await client.transcribeAudio(mockAudioFile);

      const stats = client.getCacheStats();

      expect(stats.transcription.size).toBe(1);
      expect(stats.transcription.entries[0].accessCount).toBe(3); // 1 set + 2 gets
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1); // Only 1 API call
    });

    test('should clear caches correctly', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const transcriptionResponse = {
        data: { text: 'Test transcription', duration: 3.0 },
      };

      const formattingResponse = {
        data: {
          choices: [{ message: { content: 'Formatted text' } }],
          usage: { total_tokens: 50 },
          model: 'gpt-3.5-turbo',
        },
      };

      mockAxiosInstance.post
        .mockResolvedValueOnce(transcriptionResponse)
        .mockResolvedValueOnce(formattingResponse);

      // Make API calls to populate cache
      await client.transcribeAudio(mockAudioFile);
      await client.formatText('Test text');

      let stats = client.getCacheStats();
      expect(stats.transcription.size).toBe(1);
      expect(stats.formatting.size).toBe(1);

      // Clear caches
      client.clearCaches();

      stats = client.getCacheStats();
      expect(stats.transcription.size).toBe(0);
      expect(stats.formatting.size).toBe(0);
    });
  });
});
