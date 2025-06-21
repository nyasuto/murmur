import axios, { AxiosInstance, AxiosResponse } from 'axios';
const FormData = require('form-data');
import * as fs from 'fs-extra';
import { TranscriptionOptions, TranscriptionResult } from './types';

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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Murmur/1.0.0',
      },
      timeout: 60000, // 60 seconds timeout
    });
  }

  /**
   * Transcribe audio using Whisper API
   */
  async transcribeAudio(audioFilePath: string, options: TranscriptionOptions = {}): Promise<TranscriptionResult> {
    try {
      if (!(await fs.pathExists(audioFilePath))) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
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

      return {
        success: true,
        text: response.data.text,
        duration: response.data.duration,
      };
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
   * Format text using GPT API
   */
  async formatText(text: string, options: FormatTextOptions = {}): Promise<FormatTextResult> {
    try {
      const prompt = options.prompt || `
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

      const response: AxiosResponse<OpenAICompletionResponse> = await this.client.post('/chat/completions', {
        model: options.model || 'gpt-3.5-turbo',
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 2000,
      });

      const formattedText = response.data.choices[0].message.content;

      return {
        success: true,
        formatted_text: formattedText,
        usage: response.data.usage,
        model: response.data.model,
      };
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
}

export default OpenAIClient;