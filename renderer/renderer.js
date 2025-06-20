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
        // Get app version
        const version = await window.electronAPI.getAppVersion();
        versionInfo.textContent = `Version: ${version}`;
        
        // Enable record button after initialization
        recordButton.disabled = false;
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
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
                channelCount: 1
            } 
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
        
        mediaRecorder.ondataavailable = (event) => {
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
            processAudio(audioBlob);
        };
        
        mediaRecorder.onerror = (event) => {
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
    if (!mediaRecorder) {
        const success = await setupMediaRecorder();
        if (!success) return;
    }
    
    // Clear previous results
    hideResults();
    
    audioChunks = [];
    recordingStartTime = Date.now();
    
    mediaRecorder.start();
    isRecording = true;
    updateRecordingUI(true);
    startRecordingTimer();
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        stopRecordingTimer();
    }
}

// Update recording UI
function updateRecordingUI(recording) {
    if (recording) {
        recordButton.classList.add('recording');
        recordButton.innerHTML = '<span class="record-icon">⏹️</span><span class="record-text">録音停止</span>';
        recordingIndicator.classList.remove('hidden');
        recordingTime.classList.remove('hidden');
        volumeMeter.classList.remove('hidden');
        startVolumeMonitoring();
    } else {
        recordButton.classList.remove('recording');
        recordButton.innerHTML = '<span class="record-icon">🎙️</span><span class="record-text">録音開始</span>';
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
async function processAudio(audioBlob) {
    try {
        showProcessing('音声をテキストに変換中...');
        
        // Convert blob to buffer for API call
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = new Uint8Array(arrayBuffer);
        
        // Transcribe audio using Whisper API
        const transcription = await window.electronAPI.transcribeAudio(audioData);
        transcribedText = transcription;
        
        // Show transcription result
        transcriptionText.textContent = transcribedText;
        transcriptionResult.classList.remove('hidden');
        
        // Format text using GPT API
        showProcessing('テキストを整形中...');
        const formatted = await window.electronAPI.formatText(transcribedText);
        formattedContent = formatted;
        
        // Show formatted result
        formattedText.textContent = formattedContent;
        formattedResult.classList.remove('hidden');
        
        // Enable save button
        saveButton.disabled = false;
        
        hideProcessing();
        
    } catch (error) {
        console.error('Audio processing failed:', error);
        hideProcessing();
        alert('音声処理中にエラーが発生しました。設定を確認してください。');
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
        const fileName = `voice-memo-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
        const success = await window.electronAPI.saveToObsidian(formattedContent, fileName);
        
        if (success) {
            alert('Obsidianに保存しました。');
        } else {
            alert('保存に失敗しました。Obsidian Vaultのパスを確認してください。');
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

// Hide settings modal
function hideSettings() {
    settingsModal.classList.add('hidden');
}

// Load settings
async function loadSettings() {
    try {
        const settings = await window.electronAPI.getSettings();
        document.getElementById('obsidianPath').value = settings.obsidianPath || '';
        document.getElementById('openaiKey').value = settings.openaiKey || '';
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Save settings
async function saveSettings() {
    try {
        const settings = {
            obsidianPath: document.getElementById('obsidianPath').value,
            openaiKey: document.getElementById('openaiKey').value
        };
        
        await window.electronAPI.saveSettings(settings);
        alert('設定を保存しました。');
        hideSettings();
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('設定の保存に失敗しました。');
    }
}

// Browse for Obsidian vault
async function browseVault() {
    try {
        const result = await window.electronAPI.showSaveDialog();
        if (!result.canceled && result.filePath) {
            document.getElementById('obsidianPath').value = result.filePath;
        }
    } catch (error) {
        console.error('Failed to browse vault:', error);
    }
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

// Close modal when clicking outside
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        hideSettings();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
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