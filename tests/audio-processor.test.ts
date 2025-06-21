import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AudioProcessor, AudioProcessingProgress } from '../src/audio-processor';
import { createTempDir, cleanupTempDir, createMockApiKey } from './setup';

// Mock OpenAI client
jest.mock('../src/openai-client', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      transcribeAudio: jest.fn(),
      getCacheStats: jest.fn(),
      clearCaches: jest.fn(),
    })),
  };
});

jest.mock('../src/logger', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  };
});

describe('AudioProcessor', () => {
  let audioProcessor: AudioProcessor;
  let tempDir: string;
  let mockApiKey: string;
  let progressEvents: Array<{ jobId: string; progress: AudioProcessingProgress }> = [];

  beforeEach(async () => {
    tempDir = await createTempDir();
    mockApiKey = createMockApiKey();
    progressEvents = [];

    audioProcessor = new AudioProcessor(mockApiKey, {
      tempDirectory: tempDir,
      chunkSizeBytes: 1024 * 1024, // 1MB for testing
      maxConcurrentJobs: 2,
    });

    // Listen to progress events
    audioProcessor.on('progress', (jobId: string, progress: AudioProcessingProgress) => {
      progressEvents.push({ jobId, progress });
    });
  });

  afterEach(async () => {
    await audioProcessor.cleanup();
    await cleanupTempDir(tempDir);
    jest.clearAllMocks();
  });

  describe('constructor and initialization', () => {
    test('should create instance with default options', () => {
      const processor = new AudioProcessor(mockApiKey);
      expect(processor).toBeInstanceOf(AudioProcessor);
      expect(processor.getCurrentJobs()).toEqual([]);
    });

    test('should create instance with custom options', () => {
      const customOptions = {
        chunkSizeBytes: 5 * 1024 * 1024,
        maxConcurrentJobs: 5,
        tempDirectory: tempDir,
      };

      const processor = new AudioProcessor(mockApiKey, customOptions);
      expect(processor).toBeInstanceOf(AudioProcessor);
      expect(processor.getCurrentJobs()).toEqual([]);
    });

    test('should ensure temp directory exists', async () => {
      new AudioProcessor(mockApiKey, { tempDirectory: tempDir });
      expect(await fs.pathExists(tempDir)).toBe(true);
    });
  });

  describe('processAudioFile', () => {
    let mockAudioFile: string;

    beforeEach(async () => {
      mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));
    });

    test('should process audio file successfully', async () => {
      // Mock successful transcription
      const mockTranscriptionResult = {
        success: true,
        text: 'Hello, this is a test transcription.',
        duration: 5.2,
      };

      // Mock the transcription method on the processor's internal client
      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue(mockTranscriptionResult);

      const result = await audioProcessor.processAudioFile(mockAudioFile);

      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello, this is a test transcription.');
      expect(result.duration).toBe(5.2);
    });

    test('should emit progress events during processing', async () => {
      const mockTranscriptionResult = {
        success: true,
        text: 'Test transcription',
        duration: 3.0,
      };

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue(mockTranscriptionResult);

      await audioProcessor.processAudioFile(mockAudioFile, {}, 'test-job-1');

      // Check that progress events were emitted
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].jobId).toBe('test-job-1');
      expect(progressEvents[0].progress.stage).toBe('preparing');

      // Check final progress event
      const finalEvent = progressEvents[progressEvents.length - 1];
      expect(finalEvent.progress.stage).toBe('complete');
      expect(finalEvent.progress.progress).toBe(100);
    });

    test('should handle file not found error', async () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.webm');

      const result = await audioProcessor.processAudioFile(nonExistentFile, {}, 'test-job-error');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audio file not found');

      // Check error progress event
      const errorEvent = progressEvents.find(e => e.progress.stage === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.jobId).toBe('test-job-error');
    });

    test('should handle transcription API errors', async () => {
      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue({
        success: false,
        error: 'API rate limit exceeded',
      });

      const result = await audioProcessor.processAudioFile(mockAudioFile, {}, 'test-job-api-error');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit exceeded');
    });

    test('should provide estimated processing time', async () => {
      const mockTranscriptionResult = {
        success: true,
        text: 'Test transcription',
        duration: 3.0,
      };

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue(mockTranscriptionResult);

      await audioProcessor.processAudioFile(mockAudioFile, {}, 'test-job-timing');

      // Check that progress events include timing estimates
      const preparingEvent = progressEvents.find(e => e.progress.stage === 'transcribing');
      expect(preparingEvent?.progress.details?.estimatedTime).toBeGreaterThan(0);
    });
  });

  describe('processAudioBlob', () => {
    test('should process audio blob successfully', async () => {
      const mockAudioData = Buffer.from('fake audio data');
      const audioBlob = new Blob([mockAudioData], { type: 'audio/webm' });

      const mockTranscriptionResult = {
        success: true,
        text: 'Blob transcription result',
        duration: 2.5,
      };

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue(mockTranscriptionResult);

      const result = await audioProcessor.processAudioBlob(audioBlob, {}, 'blob-job-1');

      expect(result.success).toBe(true);
      expect(result.text).toBe('Blob transcription result');
      expect(mockClient.transcribeAudio).toHaveBeenCalled();
    });

    test('should clean up temporary files after blob processing', async () => {
      const mockAudioData = Buffer.from('fake audio data');
      const audioBlob = new Blob([mockAudioData], { type: 'audio/webm' });

      const mockTranscriptionResult = {
        success: true,
        text: 'Test result',
        duration: 1.0,
      };

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockResolvedValue(mockTranscriptionResult);

      await audioProcessor.processAudioBlob(audioBlob, {}, 'blob-cleanup-test');

      // Check that no temp files are left behind
      const tempFiles = await fs.readdir(tempDir);
      const tempAudioFiles = tempFiles.filter(
        file => file.startsWith('temp-') && file.endsWith('.webm')
      );
      expect(tempAudioFiles.length).toBe(0);
    });
  });

  describe('job management', () => {
    test('should track current processing jobs', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve({ success: true, text: 'test' }), 100))
      );

      // Start processing without awaiting
      const processingPromise = audioProcessor.processAudioFile(mockAudioFile, {}, 'tracking-job');

      // Check that job is tracked
      expect(audioProcessor.getCurrentJobs()).toContain('tracking-job');

      // Wait for completion
      await processingPromise;

      // Check that job is removed after completion
      expect(audioProcessor.getCurrentJobs()).not.toContain('tracking-job');
    });

    test('should cancel processing jobs', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve({ success: true, text: 'test' }), 1000))
      );

      // Start processing
      const processingPromise = audioProcessor.processAudioFile(mockAudioFile, {}, 'cancel-job');

      // Cancel after a short delay
      setTimeout(() => {
        audioProcessor.cancelJob('cancel-job');
      }, 50);

      const result = await processingPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
      expect(audioProcessor.getCurrentJobs()).not.toContain('cancel-job');
    });
  });

  describe('cache management', () => {
    test('should expose cache statistics', () => {
      const mockCacheStats = {
        transcription: { size: 5, maxSize: 100, hitRate: 0.8, entries: [] },
        formatting: { size: 3, maxSize: 50, hitRate: 0.6, entries: [] },
      };

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.getCacheStats.mockReturnValue(mockCacheStats);

      const stats = audioProcessor.getCacheStats();
      expect(stats).toEqual(mockCacheStats);
    });

    test('should clear caches', () => {
      const mockClient = (audioProcessor as any).openaiClient;
      mockClient.clearCaches = jest.fn();

      audioProcessor.clearCaches();
      expect(mockClient.clearCaches).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    test('should cancel all jobs and cleanup temp directory', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve({ success: true, text: 'test' }), 1000))
      );

      // Start multiple processing jobs
      audioProcessor.processAudioFile(mockAudioFile, {}, 'cleanup-job-1');
      audioProcessor.processAudioFile(mockAudioFile, {}, 'cleanup-job-2');

      expect(audioProcessor.getCurrentJobs().length).toBe(2);

      // Cleanup
      await audioProcessor.cleanup();

      expect(audioProcessor.getCurrentJobs().length).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle blob conversion errors gracefully', async () => {
      // Create a mock blob that will fail to convert
      const badBlob = {
        // @ts-ignore - Mock typing issue
        arrayBuffer: jest.fn().mockRejectedValue(new Error('Blob conversion failed')),
      } as any;

      const result = await audioProcessor.processAudioBlob(badBlob, {}, 'error-job');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blob conversion failed');
    });

    test('should emit error progress events for failures', async () => {
      const mockAudioFile = path.join(tempDir, 'test-audio.webm');
      await fs.writeFile(mockAudioFile, Buffer.from('fake audio data'));

      const mockClient = (audioProcessor as any).openaiClient;
      // @ts-ignore - Mock typing issue
      mockClient.transcribeAudio.mockRejectedValue(new Error('API failure'));

      await audioProcessor.processAudioFile(mockAudioFile, {}, 'error-progress-job');

      const errorEvent = progressEvents.find(e => e.progress.stage === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.progress.message).toContain('API failure');
      expect(errorEvent?.jobId).toBe('error-progress-job');
    });
  });
});
