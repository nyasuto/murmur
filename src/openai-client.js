const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

class OpenAIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.openai.com/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'Murmur/1.0.0'
            },
            timeout: 60000 // 60 seconds timeout
        });
    }

    /**
     * Transcribe audio using Whisper API
     * @param {string} audioFilePath - Path to the audio file
     * @param {Object} options - Transcription options
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeAudio(audioFilePath, options = {}) {
        try {
            if (!await fs.pathExists(audioFilePath)) {
                throw new Error(`Audio file not found: ${audioFilePath}`);
            }

            const formData = new FormData();
            formData.append('file', fs.createReadStream(audioFilePath));
            formData.append('model', options.model || 'whisper-1');
            
            if (options.language) {
                formData.append('language', options.language);
            }
            
            if (options.prompt) {
                formData.append('prompt', options.prompt);
            }
            
            if (options.response_format) {
                formData.append('response_format', options.response_format);
            } else {
                formData.append('response_format', 'json');
            }
            
            if (options.temperature !== undefined) {
                formData.append('temperature', options.temperature.toString());
            }

            const response = await this.client.post('/audio/transcriptions', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Content-Type': 'multipart/form-data'
                }
            });

            return {
                success: true,
                text: response.data.text,
                language: response.data.language,
                duration: response.data.duration,
                raw: response.data
            };

        } catch (error) {
            console.error('Whisper API transcription failed:', error);
            
            let errorMessage = 'Unknown error occurred';
            if (error.response) {
                errorMessage = error.response.data?.error?.message || `HTTP ${error.response.status}`;
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
                details: error.response?.data
            };
        }
    }

    /**
     * Format text using GPT API
     * @param {string} text - Text to format
     * @param {Object} options - Formatting options
     * @returns {Promise<Object>} Formatted text result
     */
    async formatText(text, options = {}) {
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

            const response = await this.client.post('/chat/completions', {
                model: options.model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 2000
            });

            const formattedText = response.data.choices[0].message.content;

            return {
                success: true,
                formatted_text: formattedText,
                usage: response.data.usage,
                model: response.data.model
            };

        } catch (error) {
            console.error('GPT API formatting failed:', error);
            
            let errorMessage = 'Unknown error occurred';
            if (error.response) {
                errorMessage = error.response.data?.error?.message || `HTTP ${error.response.status}`;
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
                details: error.response?.data
            };
        }
    }

    /**
     * Test API connection
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        try {
            const response = await this.client.get('/models');
            return response.status === 200;
        } catch (error) {
            console.error('OpenAI API connection test failed:', error);
            return false;
        }
    }
}

module.exports = OpenAIClient;