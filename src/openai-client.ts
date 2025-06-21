import axios, { AxiosInstance, AxiosResponse } from 'axios';
const FormData = require('form-data');
import * as fs from 'fs-extra';
import { TranscriptionOptions, TranscriptionResult } from './types';
import { RateLimiter, validateApiKey } from './security-utils';
import { transcriptionCache, formattingCache } from './cache-manager';

interface OpenAITranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
}

interface OpenAIError {
  error?: {
    message: string;
  };
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenAICompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: OpenAIUsage;
  model: string;
}

interface FormatTextOptions {
  prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface FormatTextResult {
  success: boolean;
  formatted_text?: string;
  usage?: OpenAIUsage;
  model?: string;
  error?: string;
  details?: any;
}

class OpenAIClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly client: AxiosInstance;
  private readonly rateLimiter: RateLimiter;

  constructor(apiKey: string) {
    // Validate API key format
    if (!validateApiKey(apiKey)) {
      throw new Error('Invalid OpenAI API key format');
    }

    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
    this.rateLimiter = new RateLimiter(10, 60000); // 10 calls per minute

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': 'Murmur/1.0.0',
      },
      timeout: 60000, // 60 seconds timeout
    });
  }

  /**
   * Transcribe audio using Whisper API with caching
   */
  async transcribeAudio(
    audioFilePath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    try {
      if (!(await fs.pathExists(audioFilePath))) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      // Generate cache key based on file content and options
      const fileHash = await transcriptionCache.generateFileKey(audioFilePath);
      const optionsHash = transcriptionCache.generateContentKey('', options);
      const cacheKey = `${fileHash}_${optionsHash}`;

      // Check cache first
      const cachedResult = transcriptionCache.get(cacheKey);
      if (cachedResult) {
        console.log('🎯 Cache hit for transcription:', cacheKey.substring(0, 16) + '...');
        return cachedResult;
      }

      console.log('📡 Cache miss, calling OpenAI API for transcription...');

      // Check rate limit
      if (!this.rateLimiter.isAllowed()) {
        const waitTime = this.rateLimiter.getTimeUntilReset();
        return {
          success: false,
          error: `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`,
        };
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model', 'whisper-1');

      if (options.language) {
        formData.append('language', options.language);
      }

      if (options.response_format) {
        formData.append('response_format', options.response_format);
      } else {
        formData.append('response_format', 'json');
      }

      if (options.temperature !== undefined) {
        formData.append('temperature', options.temperature.toString());
      }

      const response: AxiosResponse<OpenAITranscriptionResponse> = await this.client.post(
        '/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const result: TranscriptionResult = {
        success: true,
        text: response.data.text,
        duration: response.data.duration,
      };

      // Cache the successful result
      transcriptionCache.set(cacheKey, result);
      console.log('💾 Cached transcription result:', cacheKey.substring(0, 16) + '...');

      return result;
    } catch (error: any) {
      console.error('Whisper API transcription failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.response) {
        const errorData = error.response.data as OpenAIError;
        errorMessage = errorData.error?.message || `HTTP ${error.response.status}`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Network connection failed';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timed out';
      } else {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Format text using GPT API with caching
   */
  async formatText(text: string, options: FormatTextOptions = {}): Promise<FormatTextResult> {
    try {
      // Generate cache key based on text content and options
      const cacheKey = formattingCache.generateContentKey(text, {
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2000,
        hasCustomPrompt: !!options.prompt,
      });

      // Check cache first
      const cachedResult = formattingCache.get(cacheKey);
      if (cachedResult) {
        console.log('🎯 Cache hit for text formatting:', cacheKey.substring(0, 16) + '...');
        return cachedResult;
      }

      console.log('📡 Cache miss, calling OpenAI API for text formatting...');

      // Check rate limit
      if (!this.rateLimiter.isAllowed()) {
        const waitTime = this.rateLimiter.getTimeUntilReset();
        return {
          success: false,
          error: `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`,
        };
      }
      const prompt =
        options.prompt ||
        `
以下の音声テキストを読みやすく整形し、構造化してください。
要約、メインポイント、関連タグを含めてMarkdown形式で出力してください。

音声テキスト:
${text}

出力形式:
# タイトル（内容に基づいた適切なタイトル）

## 要約
（簡潔な要約）

## 内容
（整形された内容）

## メインポイント
- ポイント1
- ポイント2

## タグ
#タグ1 #タグ2 #タグ3

記録日時: ${new Date().toLocaleString('ja-JP')}
`;

      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: prompt,
        },
      ];

      const response: AxiosResponse<OpenAICompletionResponse> = await this.client.post(
        '/chat/completions',
        {
          model: options.model || 'gpt-3.5-turbo',
          messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 2000,
        }
      );

      const formattedText = response.data.choices[0].message.content;

      const result: FormatTextResult = {
        success: true,
        formatted_text: formattedText,
        usage: response.data.usage,
        model: response.data.model,
      };

      // Cache the successful result
      formattingCache.set(cacheKey, result);
      console.log('💾 Cached formatting result:', cacheKey.substring(0, 16) + '...');

      return result;
    } catch (error: any) {
      console.error('GPT API formatting failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.response) {
        const errorData = error.response.data as OpenAIError;
        errorMessage = errorData.error?.message || `HTTP ${error.response.status}`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Network connection failed';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timed out';
      } else {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        details: error.response?.data,
      };
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      console.error('OpenAI API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get cache statistics for monitoring performance
   */
  getCacheStats(): {
    transcription: ReturnType<typeof transcriptionCache.getStats>;
    formatting: ReturnType<typeof formattingCache.getStats>;
    } {
    return {
      transcription: transcriptionCache.getStats(),
      formatting: formattingCache.getStats(),
    };
  }

  /**
   * Clear caches (useful for testing or memory management)
   */
  clearCaches(): void {
    transcriptionCache.clear();
    formattingCache.clear();
    console.log('🧹 All caches cleared');
  }
}

export default OpenAIClient;
