// DOM elements
const recordButton = document.getElementById('recordButton');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
const volumeMeter = document.getElementById('volumeMeter');
const volumeLevel = document.getElementById('volumeLevel');
const audioPreview = document.getElementById('audioPreview');
const processingStatus = document.getElementById('processingStatus');
const processingText = document.getElementById('processingText');
const transcriptionResult = document.getElementById('transcriptionResult');
const transcriptionText = document.getElementById('transcriptionText');
const formattedResult = document.getElementById('formattedResult');
const formattedText = document.getElementById('formattedText');
const saveButton = document.getElementById('saveButton');
const clearButton = document.getElementById('clearButton');
const settingsButton = document.getElementById('settingsButton');
const settingsModal = document.getElementById('settingsModal');
const versionInfo = document.getElementById('versionInfo');

// Settings elements
const openaiKeyInput = document.getElementById('openaiKey');
const testApiKeyButton = document.getElementById('testApiKey');
const apiKeyStatus = document.getElementById('apiKeyStatus');

// State variables
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let volumeTimer = null;
let audioContext = null;
let analyser = null;
let microphone = null;
let currentAudioBlob = null;
let transcribedText = '';
let formattedContent = '';

// Initialize app
async function initializeApp() {
  try {
    await window.electronAPI.logInfo('Renderer process initializing');
    
    // Get app version
    const version = await window.electronAPI.getAppVersion();
    versionInfo.textContent = `Version: ${version}`;

    // Check if first-time setup is needed
    await checkFirstTimeSetup();

    // Check and enable record button after initialization
    await checkRecordButtonState();

    await window.electronAPI.logInfo('Renderer process initialized successfully', { version });
  } catch (error) {
    await window.electronAPI.logError('Failed to initialize renderer process', error);
  }
}

// Check if first-time setup is needed
async function checkFirstTimeSetup() {
  try {
    await window.electronAPI.logInfo('Checking first-time setup');
    const result = await window.electronAPI.getSettings();
    
    if (result.success) {
      const settings = result.settings;
      
      // Check if essential settings are missing
      const hasApiKey = settings.openaiApiKey && settings.openaiApiKey.trim() !== '';
      const hasVaultPath = settings.obsidianVaultPath && settings.obsidianVaultPath.trim() !== '';
      
      await window.electronAPI.logInfo('Settings check result', { 
        hasApiKey, 
        hasVaultPath,
        apiKeyLength: settings.openaiApiKey?.length,
        vaultPath: settings.obsidianVaultPath 
      });
      
      if (!hasApiKey || !hasVaultPath) {
        await window.electronAPI.logWarn('Essential settings missing, showing setup wizard');
        showSetupWizard();
        return;
      }
      
      // Test OpenAI connection if API key exists
      if (hasApiKey) {
        await window.electronAPI.logInfo('Testing OpenAI connection');
        const connectionTest = await window.electronAPI.testOpenAIConnection();
        if (!connectionTest.success) {
          await window.electronAPI.logWarn('OpenAI connection test failed', { error: connectionTest.error });
          showSetupWizard('OpenAI APIキーの接続に問題があります。設定を確認してください。');
          return;
        } else {
          await window.electronAPI.logInfo('OpenAI connection test passed');
        }
      }
      
      // Validate Obsidian vault if path exists
      if (hasVaultPath) {
        await window.electronAPI.logInfo('Validating Obsidian vault path');
        const validation = await window.electronAPI.validateObsidianVault(hasVaultPath);
        if (validation.success && !validation.validation.valid) {
          await window.electronAPI.logWarn('Obsidian vault validation failed', { 
            error: validation.validation.error 
          });
          showSetupWizard('Obsidian Vaultパスに問題があります。設定を確認してください。');
          return;
        } else {
          await window.electronAPI.logInfo('Obsidian vault validation passed');
        }
      }
      
      // All checks passed, enable recording
      await window.electronAPI.logInfo('All setup checks passed, enabling recording');
      
    } else {
      // Settings couldn't be loaded, show setup wizard
      await window.electronAPI.logWarn('Settings could not be loaded', { error: result.error });
      showSetupWizard();
    }
  } catch (error) {
    await window.electronAPI.logError('Failed to check first-time setup', error);
    showSetupWizard('設定の確認中にエラーが発生しました。設定を確認してください。');
  }
}

// Request microphone permission and setup MediaRecorder
async function setupMediaRecorder() {
  try {
    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('このブラウザは音声録音をサポートしていません。');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100,
        channelCount: 1,
      },
    });

    // Check MediaRecorder support and find best format
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ''; // Use default
        }
      }
    }

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    // Setup audio analysis for volume meter
    setupVolumeAnalysis(stream);

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      currentAudioBlob = audioBlob;

      // Show audio preview
      const audioUrl = URL.createObjectURL(audioBlob);
      audioPreview.src = audioUrl;
      audioPreview.style.display = 'block';

      // Save audio file to temp directory
      await saveAudioRecording(audioBlob);

      // Reset recording state
      audioChunks = [];
      updateRecordingUI(false);

      // Start processing
      processAudio();
    };

    mediaRecorder.onerror = event => {
      console.error('MediaRecorder error:', event.error);
      alert('録音中にエラーが発生しました: ' + event.error.message);
      updateRecordingUI(false);
      stopRecordingTimer();
    };

    return true;
  } catch (error) {
    console.error('Failed to setup media recorder:', error);
    alert('マイクへのアクセスが必要です。ブラウザの設定を確認してください。');
    return false;
  }
}

// Setup volume analysis for visual feedback
function setupVolumeAnalysis(stream) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    microphone.connect(analyser);

    console.log('Volume analysis setup complete');
  } catch (error) {
    console.error('Failed to setup volume analysis:', error);
  }
}

// Start volume monitoring
function startVolumeMonitoring() {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  volumeTimer = setInterval(() => {
    analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength;

    // Update volume meter (0-100%)
    const volumePercent = Math.min((average / 128) * 100, 100);
    volumeLevel.style.width = volumePercent + '%';
  }, 100);
}

// Stop volume monitoring
function stopVolumeMonitoring() {
  if (volumeTimer) {
    clearInterval(volumeTimer);
    volumeTimer = null;
  }

  // Reset volume meter
  volumeLevel.style.width = '0%';
}

// Start recording
async function startRecording() {
  try {
    await window.electronAPI.logAction('Recording started');
    
    if (!mediaRecorder) {
      const success = await setupMediaRecorder();
      if (!success) {
        await window.electronAPI.logWarn('Failed to setup media recorder for recording');
        return;
      }
    }

    // Clear previous results
    hideResults();

    audioChunks = [];
    recordingStartTime = Date.now();

    mediaRecorder.start();
    isRecording = true;
    updateRecordingUI(true);
    startRecordingTimer();
    
    await window.electronAPI.logInfo('Audio recording started successfully');
  } catch (error) {
    await window.electronAPI.logError('Failed to start recording', error);
  }
}

// Stop recording
async function stopRecording() {
  try {
    if (mediaRecorder && isRecording) {
      await window.electronAPI.logAction('Recording stopped');
      
      const duration = recordingStartTime ? Date.now() - recordingStartTime : 0;
      mediaRecorder.stop();
      isRecording = false;
      stopRecordingTimer();
      
      await window.electronAPI.logInfo('Audio recording stopped successfully', { 
        duration: Math.round(duration / 1000) + 's' 
      });
    }
  } catch (error) {
    await window.electronAPI.logError('Failed to stop recording', error);
  }
}

// Update recording UI
function updateRecordingUI(recording) {
  if (recording) {
    recordButton.classList.add('recording');
    recordButton.innerHTML =
      '<span class="record-icon">⏹️</span><span class="record-text">録音停止</span>';
    recordingIndicator.classList.remove('hidden');
    recordingTime.classList.remove('hidden');
    volumeMeter.classList.remove('hidden');
    startVolumeMonitoring();
  } else {
    recordButton.classList.remove('recording');
    recordButton.innerHTML =
      '<span class="record-icon">🎙️</span><span class="record-text">録音開始</span>';
    recordingIndicator.classList.add('hidden');
    recordingTime.classList.add('hidden');
    volumeMeter.classList.add('hidden');
    stopVolumeMonitoring();
  }
}

// Start recording timer
function startRecordingTimer() {
  recordingTimer = setInterval(() => {
    if (recordingStartTime) {
      const elapsed = Date.now() - recordingStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      recordingTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

// Stop recording timer
function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

// Save audio recording to temp directory
async function saveAudioRecording(audioBlob) {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = new Uint8Array(arrayBuffer);
    const fileName = `recording-${Date.now()}.webm`;

    const result = await window.electronAPI.saveAudioRecording(audioBuffer, fileName);
    if (result.success) {
      console.log('Audio saved to:', result.filePath);
    } else {
      console.error('Failed to save audio:', result.error);
    }
    return result;
  } catch (error) {
    console.error('Error saving audio recording:', error);
    return { success: false, error: error.message };
  }
}

// Process audio (transcribe and format)
async function processAudio() {
  const processStartTime = Date.now();
  try {
    await window.electronAPI.logInfo('Starting audio processing');
    showProcessing('音声をテキストに変換中...');

    // Transcribe audio using Whisper API
    const transcriptionResult = await window.electronAPI.transcribeAudio({
      language: 'ja', // Japanese
      temperature: 0,
    });

    if (!transcriptionResult.success) {
      throw new Error(transcriptionResult.error || 'Transcription failed');
    }

    transcribedText = transcriptionResult.text;
    await window.electronAPI.logInfo('Transcription completed', { 
      textLength: transcribedText.length 
    });

    // Show transcription result
    transcriptionText.textContent = transcribedText;
    transcriptionResult.classList.remove('hidden');

    // Format text using GPT API
    showProcessing('テキストを整形中...');
    const formattingResult = await window.electronAPI.formatText(transcribedText, {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 2000,
    });

    if (!formattingResult.success) {
      await window.electronAPI.logWarn('Text formatting failed, using transcribed text as fallback', 
        { error: formattingResult.error });
      // Use transcribed text as fallback
      formattedContent = transcribedText;
      alert('テキストの整形に失敗しましたが、音声認識は成功しました。');
    } else {
      formattedContent = formattingResult.formatted_text;
      await window.electronAPI.logInfo('Text formatting completed', { 
        outputLength: formattedContent.length 
      });
    }

    // Show formatted result
    formattedText.textContent = formattedContent;
    formattedResult.classList.remove('hidden');

    // Enable save button
    saveButton.disabled = false;

    const totalDuration = Date.now() - processStartTime;
    await window.electronAPI.logInfo('Audio processing completed', { 
      duration: Math.round(totalDuration / 1000) + 's' 
    });
    
    hideProcessing();
  } catch (error) {
    await window.electronAPI.logError('Audio processing failed', error);
    hideProcessing();

    let errorMessage = '音声処理中にエラーが発生しました。';
    if (error.message.includes('OpenAI client not initialized')) {
      errorMessage = 'OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。';
    } else if (error.message.includes('No audio recording found')) {
      errorMessage = '音声ファイルが見つかりません。もう一度録音してください。';
    } else if (error.message.includes('Network')) {
      errorMessage = 'ネットワーク接続エラーです。インターネット接続を確認してください。';
    }

    alert(errorMessage);
  }
}

// Show processing status
function showProcessing(message) {
  processingText.textContent = message;
  processingStatus.classList.remove('hidden');
}

// Hide processing status
function hideProcessing() {
  processingStatus.classList.add('hidden');
}

// Hide all results
function hideResults() {
  transcriptionResult.classList.add('hidden');
  formattedResult.classList.add('hidden');
  audioPreview.style.display = 'none';
  saveButton.disabled = true;
}

// Save to Obsidian
async function saveToObsidian() {
  if (!formattedContent) {
    alert('保存するコンテンツがありません。');
    return;
  }

  try {
    // Extract title from formatted content if possible
    const lines = formattedContent.split('\n');
    const titleLine = lines.find(line => line.startsWith('# '));
    const title = titleLine ? titleLine.replace('# ', '').trim() : null;

    const result = await window.electronAPI.saveToObsidian(formattedContent, {
      title,
      subfolder: 'voice-memos' // Save in a dedicated subfolder
    });

    if (result.success) {
      alert(`Obsidianに保存しました：${result.fileName}`);
      
      // Optionally clear content after successful save
      const shouldClear = confirm('保存が完了しました。内容をクリアしますか？');
      if (shouldClear) {
        clearContent();
      }
    } else {
      alert(`保存に失敗しました：${result.error}`);
    }
  } catch (error) {
    console.error('Save failed:', error);
    alert('保存中にエラーが発生しました。');
  }
}

// Clear all content
async function clearContent() {
  hideResults();
  transcribedText = '';
  formattedContent = '';
  currentAudioBlob = null;

  // Stop any ongoing recording
  if (isRecording) {
    stopRecording();
  }

  // Cleanup audio recording files
  try {
    await window.electronAPI.cleanupAudioRecording();
  } catch (error) {
    console.error('Failed to cleanup audio recordings:', error);
  }
}

// Show settings modal
function showSettings() {
  settingsModal.classList.remove('hidden');
  loadSettings();
}

// Show setup wizard (enhanced settings modal for first-time setup)
function showSetupWizard(message = null) {
  // Update modal title and content for setup wizard
  const modalContent = settingsModal.querySelector('.modal-content h2');
  modalContent.textContent = '🎉 Murmurへようこそ！初期設定を行います';
  
  // Add welcome message if provided
  if (message) {
    const existingMessage = settingsModal.querySelector('.setup-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'setup-message';
    messageDiv.style.cssText = 'background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 15px; border-radius: 4px; color: #856404;';
    messageDiv.textContent = message;
    modalContent.insertAdjacentElement('afterend', messageDiv);
  } else {
    // Add welcome instructions
    const existingMessage = settingsModal.querySelector('.setup-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'setup-message';
    messageDiv.style.cssText = 'background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; margin-bottom: 15px; border-radius: 4px; color: #0c5460;';
    messageDiv.innerHTML = `
      <strong>音声ライフログを始めるために、以下の設定が必要です：</strong><br>
      <br>
      <strong>1. OpenAI APIキー</strong> - 音声をテキストに変換するために必要<br>
      <strong>2. Obsidian Vaultパス</strong> - ライフログを保存する場所<br>
      <br>
      <em>どちらも後で変更できます。</em>
    `;
    modalContent.insertAdjacentElement('afterend', messageDiv);
  }
  
  // Change cancel button to "後で設定" for setup wizard
  const cancelButton = document.getElementById('cancelSettings');
  cancelButton.textContent = '後で設定';
  
  // Show modal
  settingsModal.classList.remove('hidden');
  loadSettings();
  
  // Disable record button until setup is complete
  if (recordButton) {
    recordButton.disabled = true;
    recordButton.title = '設定を完了してから録音を開始してください';
  }
}

// Hide settings modal
function hideSettings() {
  // Reset modal content
  const modalContent = settingsModal.querySelector('.modal-content h2');
  modalContent.textContent = '設定';
  
  // Remove any setup messages
  const existingMessage = settingsModal.querySelector('.setup-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // Reset cancel button text
  const cancelButton = document.getElementById('cancelSettings');
  cancelButton.textContent = 'キャンセル';
  
  // Re-enable record button if settings are complete
  checkRecordButtonState();
  
  settingsModal.classList.add('hidden');
}

// Check if record button should be enabled
async function checkRecordButtonState() {
  try {
    await window.electronAPI.logInfo('Checking record button state');
    const result = await window.electronAPI.getSettings();
    
    if (result.success) {
      const settings = result.settings;
      const hasApiKey = settings.openaiApiKey && settings.openaiApiKey.trim() !== '';
      const hasVaultPath = settings.obsidianVaultPath && settings.obsidianVaultPath.trim() !== '';
      
      await window.electronAPI.logInfo('Record button state check', { 
        hasApiKey, 
        hasVaultPath, 
        buttonExists: !!recordButton,
        currentlyDisabled: recordButton?.disabled 
      });
      
      if (hasApiKey && hasVaultPath && recordButton) {
        recordButton.disabled = false;
        recordButton.title = '';
        await window.electronAPI.logInfo('Record button enabled');
      } else {
        await window.electronAPI.logWarn('Record button not enabled', { 
          reason: !hasApiKey ? 'No API key' : !hasVaultPath ? 'No vault path' : 'Button not found' 
        });
      }
    } else {
      await window.electronAPI.logWarn('Failed to get settings for button state check', { error: result.error });
    }
  } catch (error) {
    await window.electronAPI.logError('Failed to check record button state', error);
  }
}

// Load settings
async function loadSettings() {
  try {
    const result = await window.electronAPI.getSettings();
    if (result.success) {
      const settings = result.settings;
      document.getElementById('obsidianPath').value = settings.obsidianVaultPath || '';
      document.getElementById('openaiKey').value = settings.openaiApiKey || '';
    } else {
      console.error('Failed to load settings:', result.error);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save settings
async function saveSettings() {
  try {
    await window.electronAPI.logAction('Settings save initiated');
    
    const obsidianPath = document.getElementById('obsidianPath').value;
    const openaiKey = document.getElementById('openaiKey').value;
    
    await window.electronAPI.logInfo('Validating settings before save', {
      hasVaultPath: !!obsidianPath,
      hasApiKey: !!openaiKey
    });

    // Validate Obsidian vault if path is provided
    if (obsidianPath) {
      const validation = await window.electronAPI.validateObsidianVault(obsidianPath);
      if (validation.success && !validation.validation.valid) {
        alert(`Obsidian Vault検証エラー: ${validation.validation.error}`);
        return;
      }
      
      if (validation.success && validation.validation.warning) {
        const proceed = confirm(`警告: ${validation.validation.warning}\n\n続行しますか？`);
        if (!proceed) return;
      }
    }

    const settings = {
      obsidianVaultPath: obsidianPath,
      openaiApiKey: openaiKey,
    };

    const result = await window.electronAPI.saveSettings(settings);
    
    if (result.success) {
      // Check if this was a first-time setup completion
      const isSetupWizard = settingsModal.querySelector('.setup-message') !== null;
      
      if (isSetupWizard) {
        // Offer to create .env file for easier configuration
        const envCheck = await window.electronAPI.checkEnvFile();
        if (envCheck.success && !envCheck.exists && (obsidianPath || openaiKey)) {
          const createEnv = confirm('設定をより簡単に管理するため、.envファイルを作成しますか？\n\n.envファイルを作成すると、次回から自動的に設定が読み込まれます。');
          if (createEnv) {
            const envResult = await window.electronAPI.createEnvFile(settings);
            if (envResult.success) {
              alert('🎉 初期設定が完了しました！\n\n.envファイルも作成されました。これで音声ライフログの記録を開始できます。');
            } else {
              alert('🎉 初期設定が完了しました！\n\n.envファイルの作成に失敗しましたが、アプリは正常に動作します。');
            }
          } else {
            alert('🎉 初期設定が完了しました！\n\nこれで音声ライフログの記録を開始できます。');
          }
        } else {
          alert('🎉 初期設定が完了しました！\n\nこれで音声ライフログの記録を開始できます。');
        }
      } else {
        alert('設定を保存しました。');
      }
      
      hideSettings();
    } else {
      alert(`設定の保存に失敗しました: ${result.error}`);
      // 失敗時もモーダルは開いたままにして、ユーザーが修正できるようにする
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('設定の保存に失敗しました。');
    // エラー時もモーダルは開いたままにして、ユーザーが修正できるようにする
  }
}

// Browse for Obsidian vault
async function browseVault() {
  try {
    const result = await window.electronAPI.showSaveDialog();
    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      document.getElementById('obsidianPath').value = selectedPath;
      
      // Automatically validate the selected path
      const validation = await window.electronAPI.validateObsidianVault(selectedPath);
      if (validation.success) {
        if (validation.validation.valid) {
          if (validation.validation.warning) {
            alert(`選択されたフォルダ: ${selectedPath}\n警告: ${validation.validation.warning}`);
          } else {
            alert(`有効なObsidian Vaultが選択されました: ${selectedPath}`);
          }
        } else {
          alert(`警告: ${validation.validation.error}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to browse vault:', error);
  }
}

// Test OpenAI API key
async function testApiKey() {
  const apiKey = openaiKeyInput.value.trim();
  if (!apiKey) {
    showApiKeyStatus('APIキーを入力してください', 'error');
    return;
  }

  testApiKeyButton.disabled = true;
  testApiKeyButton.textContent = 'テスト中...';
  showApiKeyStatus('接続をテストしています...', 'testing');

  try {
    // Update the OpenAI client with the new key
    const updateResult = await window.electronAPI.updateOpenAIKey(apiKey);

    if (updateResult.success) {
      showApiKeyStatus('✅ 接続成功！APIキーは有効です', 'success');
    } else {
      showApiKeyStatus('❌ ' + updateResult.error, 'error');
    }
  } catch (error) {
    console.error('API key test failed:', error);
    showApiKeyStatus('❌ 接続テストに失敗しました', 'error');
  } finally {
    testApiKeyButton.disabled = false;
    testApiKeyButton.textContent = '接続テスト';
  }
}

// Show API key status
function showApiKeyStatus(message, type) {
  apiKeyStatus.textContent = message;
  apiKeyStatus.className = `api-status ${type}`;
  apiKeyStatus.classList.remove('hidden');
}

// Hide API key status
function hideApiKeyStatus() {
  apiKeyStatus.classList.add('hidden');
}

// Event listeners
recordButton.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

saveButton.addEventListener('click', saveToObsidian);
clearButton.addEventListener('click', clearContent);
settingsButton.addEventListener('click', showSettings);

// Settings modal event listeners
document.getElementById('saveSettings').addEventListener('click', saveSettings);
document.getElementById('cancelSettings').addEventListener('click', hideSettings);
document.getElementById('browseVault').addEventListener('click', browseVault);
testApiKeyButton.addEventListener('click', testApiKey);

// Enable test button when API key is entered
openaiKeyInput.addEventListener('input', () => {
  const hasKey = openaiKeyInput.value.trim().length > 0;
  testApiKeyButton.disabled = !hasKey;
  if (!hasKey) {
    hideApiKeyStatus();
  }
});

// Close modal when clicking outside
settingsModal.addEventListener('click', e => {
  if (e.target === settingsModal) {
    hideSettings();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Space bar to toggle recording
  if (e.code === 'Space' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Escape to clear
  if (e.key === 'Escape') {
    if (!settingsModal.classList.contains('hidden')) {
      hideSettings();
    } else {
      clearContent();
    }
  }
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
