// DOM elements
const recordButton = document.getElementById('recordButton');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            } 
        });
        
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            currentAudioBlob = audioBlob;
            
            // Show audio preview
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPreview.src = audioUrl;
            audioPreview.style.display = 'block';
            
            // Reset recording state
            audioChunks = [];
            updateRecordingUI(false);
            
            // Start processing
            processAudio(audioBlob);
        };
        
        return true;
    } catch (error) {
        console.error('Failed to setup media recorder:', error);
        alert('マイクへのアクセスが必要です。ブラウザの設定を確認してください。');
        return false;
    }
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
    } else {
        recordButton.classList.remove('recording');
        recordButton.innerHTML = '<span class="record-icon">🎙️</span><span class="record-text">録音開始</span>';
        recordingIndicator.classList.add('hidden');
        recordingTime.classList.add('hidden');
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
function clearContent() {
    hideResults();
    transcribedText = '';
    formattedContent = '';
    currentAudioBlob = null;
    
    // Stop any ongoing recording
    if (isRecording) {
        stopRecording();
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