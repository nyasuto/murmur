import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import OpenAIClient from './openai-client';
import { TranscriptionOptions, TranscriptionResult } from './types';
import logger from './logger';

export interface AudioProcessingProgress {
  stage: 'preparing' | 'transcribing' | 'formatting' | 'saving' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  details?: any;
}

export interface AudioProcessorOptions {
  chunkSizeBytes?: number;
  maxConcurrentJobs?: number;
  tempDirectory?: string;
}

export class AudioProcessor extends EventEmitter {
  private readonly openaiClient: OpenAIClient;
  private readonly options: Required<AudioProcessorOptions>;
  private currentJobs = new Map<string, AbortController>();

  constructor(apiKey: string, options: AudioProcessorOptions = {}) {
    super();
    this.openaiClient = new OpenAIClient(apiKey);
    this.options = {
      chunkSizeBytes: options.chunkSizeBytes || 25 * 1024 * 1024, // 25MB chunks
      maxConcurrentJobs: options.maxConcurrentJobs || 3,
      tempDirectory: options.tempDirectory || path.join(os.tmpdir(), 'murmur-audio-processor'),
    };

    // Ensure temp directory exists
    fs.ensureDirSync(this.options.tempDirectory);
  }

  /**
   * Process audio file with background processing and progress updates
   */
  async processAudioFile(
    audioFilePath: string,
    transcriptionOptions: TranscriptionOptions = {},
    jobId: string = `job-${Date.now()}`
  ): Promise<TranscriptionResult> {
    const abortController = new AbortController();
    this.currentJobs.set(jobId, abortController);

    try {
      await logger.info('Starting background audio processing', {
        jobId,
        audioFilePath,
        options: transcriptionOptions,
      });

      // Stage 1: Preparing (0-10%)
      this.emitProgress(jobId, {
        stage: 'preparing',
        progress: 5,
        message: 'ファイルを準備中...',
        details: { jobId, filePath: audioFilePath },
      });

      // Check if file exists and get info
      if (!(await fs.pathExists(audioFilePath))) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const fileStats = await fs.stat(audioFilePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);

      this.emitProgress(jobId, {
        stage: 'preparing',
        progress: 10,
        message: `ファイル準備完了 (${fileSizeMB.toFixed(1)}MB)`,
        details: { jobId, fileSize: fileStats.size },
      });

      // Check if we need to abort
      if (abortController.signal.aborted) {
        throw new Error('Processing aborted by user');
      }

      // Stage 2: Transcribing (10-80%)
      this.emitProgress(jobId, {
        stage: 'transcribing',
        progress: 15,
        message: '音声をテキストに変換中...',
        details: { jobId, estimatedTime: this.estimateTranscriptionTime(fileStats.size) },
      });

      // For large files, we could implement chunking here
      // For now, process as single file with progress simulation
      const transcriptionResult = await this.transcribeWithProgress(
        audioFilePath,
        transcriptionOptions,
        jobId,
        abortController
      );

      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error || 'Transcription failed');
      }

      // Stage 3: Complete (100%)
      this.emitProgress(jobId, {
        stage: 'complete',
        progress: 100,
        message: '処理完了',
        details: {
          jobId,
          textLength: transcriptionResult.text?.length || 0,
          duration: transcriptionResult.duration,
        },
      });

      await logger.info('Audio processing completed successfully', {
        jobId,
        textLength: transcriptionResult.text?.length,
      });

      return transcriptionResult;
    } catch (error) {
      await logger.error('Audio processing failed', error as Error, { jobId });

      this.emitProgress(jobId, {
        stage: 'error',
        progress: 0,
        message: `処理エラー: ${(error as Error).message}`,
        details: { jobId, error: (error as Error).message },
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    } finally {
      this.currentJobs.delete(jobId);
    }
  }

  /**
   * Transcribe with simulated progress for better UX
   */
  private async transcribeWithProgress(
    audioFilePath: string,
    options: TranscriptionOptions,
    jobId: string,
    abortController: AbortController
  ): Promise<TranscriptionResult> {
    // Create progress interval for better UX during API call
    let progress = 15;
    const progressInterval = setInterval(() => {
      if (progress < 75) {
        progress += Math.random() * 5 + 2; // Increment by 2-7%
        this.emitProgress(jobId, {
          stage: 'transcribing',
          progress: Math.min(progress, 75),
          message: '音声解析中...',
          details: { jobId },
        });
      }
    }, 1000);

    try {
      // Actual API call with abort support
      const result = await Promise.race([
        this.openaiClient.transcribeAudio(audioFilePath, options),
        new Promise<TranscriptionResult>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Processing aborted by user'));
          });
        }),
      ]);

      clearInterval(progressInterval);

      // Final transcription progress
      this.emitProgress(jobId, {
        stage: 'transcribing',
        progress: 80,
        message: '音声変換完了',
        details: { jobId, textLength: result.text?.length || 0 },
      });

      return result;
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  /**
   * Estimate transcription time based on file size
   */
  private estimateTranscriptionTime(fileSizeBytes: number): number {
    // Rough estimate: ~2-4 seconds per MB for Whisper API
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    return Math.ceil(fileSizeMB * 3); // 3 seconds per MB average
  }

  /**
   * Emit progress update
   */
  private emitProgress(jobId: string, progress: AudioProcessingProgress): void {
    this.emit('progress', jobId, progress);
  }

  /**
   * Cancel a processing job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const abortController = this.currentJobs.get(jobId);
    if (abortController) {
      abortController.abort();
      this.currentJobs.delete(jobId);

      this.emitProgress(jobId, {
        stage: 'error',
        progress: 0,
        message: 'ユーザーによりキャンセルされました',
        details: { jobId, cancelled: true },
      });

      await logger.info('Audio processing job cancelled', { jobId });
      return true;
    }
    return false;
  }

  /**
   * Get current processing jobs
   */
  getCurrentJobs(): string[] {
    return Array.from(this.currentJobs.keys());
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.openaiClient.getCacheStats();
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.openaiClient.clearCaches();
  }

  /**
   * Process audio blob from memory (for real-time processing)
   */
  async processAudioBlob(
    audioBlob: Blob,
    transcriptionOptions: TranscriptionOptions = {},
    jobId: string = `blob-${Date.now()}`
  ): Promise<TranscriptionResult> {
    const tempFilePath = path.join(this.options.tempDirectory, `temp-${jobId}.webm`);

    try {
      // Save blob to temp file
      const arrayBuffer = await audioBlob.arrayBuffer();
      await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));

      // Process the temp file
      const result = await this.processAudioFile(tempFilePath, transcriptionOptions, jobId);

      return result;
    } finally {
      // Clean up temp file
      if (await fs.pathExists(tempFilePath)) {
        await fs
          .remove(tempFilePath)
          .catch(err =>
            logger.warn('Failed to cleanup temp audio file', { tempFilePath, error: err.message })
          );
      }
    }
  }

  /**
   * Stream-based processing for large files (future enhancement)
   */
  async processAudioStream(
    _audioStream: ReadableStream,
    _transcriptionOptions: TranscriptionOptions = {},
    _jobId: string = `stream-${Date.now()}`
  ): Promise<TranscriptionResult> {
    // Placeholder for future streaming implementation
    // This would chunk large audio files and process them in segments
    throw new Error('Stream processing not yet implemented');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cancel all running jobs
    for (const [jobId, controller] of this.currentJobs) {
      controller.abort();
      await logger.info('Cancelled job during cleanup', { jobId });
    }

    this.currentJobs.clear();

    // Clean up temp directory
    try {
      if (await fs.pathExists(this.options.tempDirectory)) {
        await fs.remove(this.options.tempDirectory);
      }
    } catch (error) {
      await logger.warn('Failed to cleanup temp directory', {
        tempDir: this.options.tempDirectory,
        error: (error as Error).message,
      });
    }
  }
}

export default AudioProcessor;
