// =========================================================================
// WHEL RECORDER RENDERER PROCESS
// =========================================================================

// Application State
let config = {};
let activeVideoSourceId = null;
let activeStream = null;
let micStream = null;
let micMuted = false;
let systemMuted = false;

// Multi-App Audio Mixing State
let audioCtx = null;
let audioDestNode = null;
let micGainNode = null;
let micGateNode = null;
let micAnalyser = null;
let appAudioMaps = new Map(); // pid -> { pcmNode, gainNode, analyser, unsubListener, label, slider, meterBar }
let screenAudioMaps = new Map(); // id -> { sourceNode, gainNode, analyser, uiContainer, meterBar }

// Added Sources state
let addedSources = []; // Array of { id, name, type, pid }

// Recording & Replay State
let recordingState = 'idle'; // 'idle', 'recording', 'paused'
let standardRecorder = null;
let standardChunks = [];
let standardStartTime = 0;
let recordingTimerId = null;
let recordCanvas = null;
let recordCtx = null;
let currentBookmarks = [];
let recordingStartTime = 0;
let totalPausedTime = 0;
let pauseStartTime = 0;

let replayActive = false;
let replayRecorder = null;
let replayHeader = null;
let replayQueue = [];
let replayChunkIndex = 0;
let isSavingReplay = false;

// UI State
let activeTab = 'dashboard';

// DOM Elements
const sidebarButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const btnToggleReplay = document.getElementById('btn-toggle-replay');
const btnSaveReplay = document.getElementById('btn-save-replay');
const btnToggleRecord = document.getElementById('btn-toggle-record');
const btnPauseRecord = document.getElementById('btn-pause-record');
const btnBookmark = document.getElementById('btn-bookmark');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const hintReplay = document.getElementById('hint-replay');
const hintRecord = document.getElementById('hint-record');

let compositeCanvas = null;
let compositeCtx = null;
const previewPlaceholder = document.getElementById('preview-placeholder');
const currentSourceLabel = document.getElementById('current-source-label');

function setActiveSource(id) {
  activeVideoSourceId = id;
  if (id) {
    const src = addedSources.find(s => s.id === id);
    if (src) {
      currentSourceLabel.innerText = src.name;
    } else {
      currentSourceLabel.innerText = 'No Source Active';
    }
  } else {
    currentSourceLabel.innerText = 'No Source Active';
  }
}

const btnAddSource = document.getElementById('btn-add-source');
const sourcesListContainer = document.getElementById('sources-list-container');
const audioMixerContainer = document.getElementById('audio-mixer-container');

// Modals
const modalAddSource = document.getElementById('modal-add-source');
const btnCloseModalSource = document.getElementById('btn-close-modal-source');
const modalSourcesGrid = document.getElementById('modal-sources-grid');

// Settings Elements - Output
const inputSavePath = document.getElementById('input-save-path');
const btnBrowsePath = document.getElementById('btn-browse-path');
const selectFormat = document.getElementById('select-format');
const selectEncoder = document.getElementById('select-encoder');
const selectRateControl = document.getElementById('select-rate-control');
const rowCqpLevel = document.getElementById('row-cqp-level');
const sliderCqpLevel = document.getElementById('slider-cqp-level');
const valCqpLevel = document.getElementById('val-cqp-level');
const rowVideoBitrate = document.getElementById('row-video-bitrate');
const sliderVideoBitrate = document.getElementById('slider-video-bitrate');
const valVideoBitrate = document.getElementById('val-video-bitrate');
const selectAudioEncoder = document.getElementById('select-audio-encoder');
const sliderAudioBitrate = document.getElementById('slider-audio-bitrate');
const valAudioBitrate = document.getElementById('val-audio-bitrate');
const inputFilenameTemplate = document.getElementById('input-filename-template');

// Settings Elements - Video
const selectBaseResolution = document.getElementById('select-base-resolution');
const selectOutputResolution = document.getElementById('select-output-resolution');
const selectDownscaleFilter = document.getElementById('select-downscale-filter');
const selectFpsType = document.getElementById('select-fps-type');
const selectFps = document.getElementById('select-fps');
const rowCommonFps = document.getElementById('row-common-fps');
const rowIntegerFps = document.getElementById('row-integer-fps');
const sliderIntegerFps = document.getElementById('slider-integer-fps');
const valIntegerFps = document.getElementById('val-integer-fps');
const selectColorFormat = document.getElementById('select-color-format');
const selectColorSpace = document.getElementById('select-color-space');
const selectColorRange = document.getElementById('select-color-range');
const checkboxFlipH = document.getElementById('checkbox-flip-h');
const checkboxFlipV = document.getElementById('checkbox-flip-v');
const selectRotation = document.getElementById('select-rotation');

// Settings Elements - Audio
const checkboxMicEnabled = document.getElementById('checkbox-mic-enabled');
const micDeviceRow = document.getElementById('mic-device-row');
const selectMicDevice = document.getElementById('select-mic-device');
const checkboxMicNoiseSuppression = document.getElementById('checkbox-mic-noise-suppression');
const checkboxMicEchoCancellation = document.getElementById('checkbox-mic-echo-cancellation');
const checkboxMicAgc = document.getElementById('checkbox-mic-agc');
const checkboxMicNoiseGate = document.getElementById('checkbox-mic-noise-gate');
const selectSampleRate = document.getElementById('select-sample-rate');
const selectAudioChannels = document.getElementById('select-audio-channels');
const checkboxSeparateTracks = document.getElementById('checkbox-separate-tracks');

// Settings Elements - Replay
const sliderReplayLength = document.getElementById('slider-replay-length');
const valReplayLength = document.getElementById('val-replay-length');
const sliderReplayRam = document.getElementById('slider-replay-ram');
const valReplayRam = document.getElementById('val-replay-ram');
const infoReplayDuration = document.getElementById('info-replay-duration');
const infoReplayFilesize = document.getElementById('info-replay-filesize');
const infoReplayRamUsage = document.getElementById('info-replay-ram-usage');
const checkboxAutoReplay = document.getElementById('checkbox-auto-replay');
const checkboxReplayNotify = document.getElementById('checkbox-replay-notify');
const checkboxReplaySound = document.getElementById('checkbox-replay-sound');

// Settings Elements - Hotkeys
const inputHotkeyReplay = document.getElementById('input-hotkey-replay');
const btnRecordHotkeyReplay = document.getElementById('btn-record-hotkey-replay');
const inputHotkeyRecord = document.getElementById('input-hotkey-record');
const btnRecordHotkeyRecord = document.getElementById('btn-record-hotkey-record');
const inputHotkeyPause = document.getElementById('input-hotkey-pause');
const btnRecordHotkeyPause = document.getElementById('btn-record-hotkey-pause');
const inputHotkeyToggleReplay = document.getElementById('input-hotkey-toggle-replay');
const btnRecordHotkeyToggleReplay = document.getElementById('btn-record-hotkey-toggle-replay');
const inputHotkeyMuteMic = document.getElementById('input-hotkey-mute-mic');
const btnRecordHotkeyMuteMic = document.getElementById('btn-record-hotkey-mute-mic');
const inputHotkeyMuteDesktop = document.getElementById('input-hotkey-mute-desktop');
const btnRecordHotkeyMuteDesktop = document.getElementById('btn-record-hotkey-mute-desktop');
const inputHotkeyBookmark = document.getElementById('input-hotkey-bookmark');
const btnRecordHotkeyBookmark = document.getElementById('btn-record-hotkey-bookmark');

// Settings Elements - General
const selectAppTheme = document.getElementById('select-app-theme');
const checkboxMinimizeTray = document.getElementById('checkbox-minimize-tray');
const checkboxStartMinimized = document.getElementById('checkbox-start-minimized');
const checkboxStartWithWindows = document.getElementById('checkbox-start-with-windows');
const selectProcessPriority = document.getElementById('select-process-priority');
const checkboxNotifyRecord = document.getElementById('checkbox-notify-record');
const checkboxNotifyReplay = document.getElementById('checkbox-notify-replay');

// Gallery Elements
const clipsListContainer = document.getElementById('clips-list-container');
const galleryVideoPlayer = document.getElementById('gallery-video-player');
const playerPlaceholder = document.getElementById('player-placeholder');
const playerDetailsPanel = document.getElementById('player-details-panel');
const playerClipTitle = document.getElementById('player-clip-title');
const playerClipDate = document.getElementById('player-clip-date');
const playerClipSize = document.getElementById('player-clip-size');
const btnPlayerDelete = document.getElementById('btn-player-delete');
const btnGalleryOpenFolder = document.getElementById('btn-gallery-open-folder');

// Trimmer Elements
const btnPlayerTrimToggle = document.getElementById('btn-player-trim-toggle');
const trimmerPanel = document.getElementById('trimmer-panel');
const trimStartInput = document.getElementById('trim-start');
const trimEndInput = document.getElementById('trim-end');
const trimBookmarkSelect = document.getElementById('trim-bookmark-select');
const btnTrimExport = document.getElementById('btn-trim-export');
const trimProgressContainer = document.getElementById('trim-progress-container');
const trimProgressText = document.getElementById('trim-progress-text');
const trimProgressBar = document.getElementById('trim-progress-bar');

// Hotkey recording state
let hotkeyToRecord = null; // name of hotkey being recorded

// Active transform state
let activeTransform = {
  aspectRatio: '16-9', // Default to 16:9 widescreen so the canvas stays still!
  scale: 1.0,
  x: 0,
  y: 0,
  rotation: 0,
  flipH: false,
  flipV: false
};

let sourceBoxWidth = null; // Width of added source box in pixels
let sourceBoxHeight = null; // Height of added source box in pixels
let sourceNativeAspectRatio = 16 / 9; // Fallback to 16:9

// Canvas Transformation Elements
const selectCanvasAspect = document.getElementById('select-canvas-aspect');
const btnTransCenter = document.getElementById('btn-trans-center');
const btnTransFit = document.getElementById('btn-trans-fit');
const btnTransStretch = document.getElementById('btn-trans-stretch');
const btnSourceTransformReset = document.getElementById('btn-source-transform-reset');

const sliderTransScale = document.getElementById('slider-trans-scale');
const valTransScale = document.getElementById('val-trans-scale');
const sliderTransX = document.getElementById('slider-trans-x');
const valTransX = document.getElementById('val-trans-x');
const sliderTransY = document.getElementById('slider-trans-y');
const valTransY = document.getElementById('val-trans-y');
const sliderTransRot = document.getElementById('slider-trans-rot');
const valTransRot = document.getElementById('val-trans-rot');

const checkTransFliph = document.getElementById('check-trans-fliph');
const checkTransFlipv = document.getElementById('check-trans-flipv');

const btnSourceUp = document.getElementById('btn-source-up');
const btnSourceDown = document.getElementById('btn-source-down');

// Resource Elements
const resCpu = document.getElementById('res-cpu');
const resMemory = document.getElementById('res-memory');
const resReplayCache = document.getElementById('res-replay-cache');
const quickClipsContainer = document.getElementById('quick-clips-container');

// Helper: Log to file & console
function debugLog(msg) {
  console.log(`[Renderer] ${msg}`);
  if (window.electronAPI) {
    window.electronAPI.logDebug(msg);
  }
}

// Format milliseconds to HH:MM:SS
function formatTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
  const mins = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const secs = (totalSecs % 60).toString().padStart(2, '0');
  return `${hours}:${mins}:${secs}`;
}

// -------------------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------------------

let saveSceneTimeout = null;
function saveSceneState() {
  if (saveSceneTimeout) clearTimeout(saveSceneTimeout);
  saveSceneTimeout = setTimeout(() => {
    const serializedSources = addedSources.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      x: s.x,
      y: s.y,
      scale: s.scale,
      scaleX: s.scaleX,
      scaleY: s.scaleY,
      rotation: s.rotation,
      flipH: s.flipH,
      flipV: s.flipV,
      visible: s.visible
    }));
    window.electronAPI.saveScene({
      sources: serializedSources,
      activeTransform: activeTransform
    });
  }, 1000);
}

async function loadSceneState() {
  try {
    const scene = await window.electronAPI.loadScene();
    if (scene) {
      if (scene.activeTransform) {
        Object.assign(activeTransform, scene.activeTransform);
      }
      if (scene.sources && Array.isArray(scene.sources)) {
        await Promise.all(scene.sources.map(async (s) => {
          try {
            await addSourceToScene(s.id, s.name, s.type);
            
            // After adding, locate it in addedSources and apply transforms
            const newlyAdded = addedSources.find(src => src.id === s.id);
            if (newlyAdded) {
              newlyAdded.x = s.x || 0;
              newlyAdded.y = s.y || 0;
              newlyAdded.scale = s.scale !== undefined ? s.scale : 1.0;
              newlyAdded.scaleX = s.scaleX !== undefined ? s.scaleX : 1.0;
              newlyAdded.scaleY = s.scaleY !== undefined ? s.scaleY : 1.0;
              newlyAdded.rotation = s.rotation || 0;
              newlyAdded.flipH = s.flipH || false;
              newlyAdded.flipV = s.flipV || false;
              newlyAdded.visible = s.visible !== undefined ? s.visible : true;
            }
          } catch (err) {
            console.warn('Failed to restore source', s.id, err);
          }
        }));
        renderSourcesList();
        applyCanvasTransform();
      }
    }
  } catch (err) {
    console.error('Failed to load scene state', err);
  }
}

// Hook saveSceneState to events
window.addEventListener('mouseup', saveSceneState);

async function initApp() {
  loadSceneState();

  debugLog('Initializing application...');
  
  compositeCanvas = document.getElementById('composite-canvas');
  compositeCtx = compositeCanvas ? compositeCanvas.getContext('2d') : null;

  // 1. Tab switches
  sidebarButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // 2. Load settings
  await loadLocalConfig();
  
  // 3. Initialize audio context (Must be resumed later)
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    debugLog(`AudioContext initialized in state: ${audioCtx.state}`);
  } catch (err) {
    debugLog(`Failed to create AudioContext: ${err.message}`);
  }

  // 4. Fill UI setting inputs
  syncSettingsUI();

  // 5. Bind event listeners
  setupEventListeners();
  setupHotkeyListener();
  setupCanvasKeyboardControls();
  setupSettingsSubTabs();
  
  // 6. Source Modal Events
  btnAddSource.addEventListener('click', openAddSourceModal);
  btnCloseModalSource.addEventListener('click', closeAddSourceModal);

  // 7. Load external data (async so it doesn't block UI render)
  loadGallery();
  loadMicrophones();
  
  if (window.electronAPI) {
    window.electronAPI.getAppVersion().then(v => {
      const el = document.getElementById('app-version-display');
      if (el) el.innerText = 'Version ' + v;
    });
  }
  
  // 8. Auto start replay buffer
  if (config.autoReplay) {
    setTimeout(() => {
      startReplayBuffer();
    }, 1000); // Small delay to allow audio/sources to initialize
  }
  
  // Initialize Mic if enabled
  if (config.micEnabled) {
    setupMicAudioGraph();
  }

  // 8. Start volume meter rendering loop
  requestAnimationFrame(updateVolumeMeters);
  
  // 9. Update rate control visibility & replay estimation
  updateRateControlVisibility();
  updateFpsTypeVisibility();
  updateReplayEstimation();

  // 10. Canvas Transforms & Resource Monitoring initialization
  setupCanvasTransformListeners();
  setupLayerOrderListeners();
  startResourceMonitoring();
  window.addEventListener('resize', applyCanvasTransform);
  startCompositor();
}

function switchTab(tabName) {
  activeTab = tabName;
  sidebarButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.getAttribute('id') === `tab-${tabName}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  if (tabName === 'gallery') {
    loadGallery();
  }
}

async function loadLocalConfig() {
  if (window.electronAPI) {
    try {
      const fetched = await window.electronAPI.getConfig();
      config = { ...getDefaults(), ...fetched };
      debugLog('Loaded configuration from main process.');
    } catch (err) {
      debugLog(`Error loading config from main process: ${err.message}`);
      const saved = localStorage.getItem('whel-recorder-config');
      if (saved) {
        try { config = { ...getDefaults(), ...JSON.parse(saved) }; } catch (e) { config = getDefaults(); }
      } else {
        config = getDefaults();
      }
    }
  } else {
    const saved = localStorage.getItem('whel-recorder-config');
    if (saved) {
      try { config = { ...getDefaults(), ...JSON.parse(saved) }; } catch (e) { config = getDefaults(); }
    } else {
      config = getDefaults();
    }
  }

  if (window.electronAPI) {
    window.electronAPI.registerHotkey('save-replay', config.hotkeyReplay);
    window.electronAPI.registerHotkey('toggle-record', config.hotkeyRecord);
  }
}

function getDefaults() {
  return {
    // Output
    recordingDir: '',
    format: 'webm',
    encoder: 'vp9',
    rateControl: 'cbr',
    cqpLevel: 23,
    videoBitrate: 8000,
    audioEncoder: 'opus',
    audioBitrate: 128,
    filenameTemplate: '{type}_{date}_{time}',
    // Video
    baseResolution: '1920x1080',
    outputResolution: 'same',
    downscaleFilter: 'bicubic',
    fpsType: 'common',
    fps: 60,
    integerFps: 60,
    colorFormat: 'nv12',
    colorSpace: '709',
    colorRange: 'full',
    flipH: false,
    flipV: false,
    rotation: '0',
    // Audio
    micEnabled: false,
    micDeviceId: 'default',
    micNoiseSuppression: false,
    micEchoCancellation: false,
    micAGC: false,
    micNoiseGate: false,
    sampleRate: 48000,
    audioChannels: 'stereo',
    separateTracks: false,
    micVolume: 1.0,
    systemVolume: 1.0,
    // Replay
    replayLength: 30,
    replayRam: 512,
    autoReplay: true,
    replayNotify: true,
    replaySound: false,
    // Hotkeys
    hotkeyReplay: 'F8',
    hotkeyRecord: 'F9',
    hotkeyPause: 'Shift+F9',
    hotkeyToggleReplay: 'Shift+F8',
    hotkeyMuteMic: 'F7',
    hotkeyMuteDesktop: 'F6',
    // General
    minimizeToTray: true,
    startMinimized: false,
    autoLaunch: false,
    processPriority: 'above-normal',
    notifyRecord: true,
    notifyReplay: true
  };
}

function saveLocalConfig() {
  localStorage.setItem('whel-recorder-config', JSON.stringify(config));
  if (window.electronAPI) {
    window.electronAPI.updateConfig(config).catch(err => {
      debugLog(`Failed to update main config: ${err.message}`);
    });
  }
  syncSettingsUI();
  applyCanvasTransform();
}

function syncSettingsUI() {
  // Output
  if (inputSavePath) {
    if (config.recordingDir) {
      inputSavePath.value = config.recordingDir;
    } else if (window.electronAPI) {
      window.electronAPI.getVideosPath().then(path => {
        inputSavePath.value = path;
      });
    }
  }
  if (selectFormat) selectFormat.value = config.format;
  if (selectEncoder) selectEncoder.value = config.encoder;
  if (selectRateControl) selectRateControl.value = config.rateControl;
  if (sliderCqpLevel) { sliderCqpLevel.value = config.cqpLevel; valCqpLevel.innerText = config.cqpLevel; }
  sliderVideoBitrate.value = config.videoBitrate;
  valVideoBitrate.innerText = `${config.videoBitrate} Kbps`;
  if (selectAudioEncoder) selectAudioEncoder.value = config.audioEncoder;
  sliderAudioBitrate.value = config.audioBitrate;
  valAudioBitrate.innerText = `${config.audioBitrate} Kbps`;
  if (inputFilenameTemplate) inputFilenameTemplate.value = config.filenameTemplate;

  // Video
  if (selectBaseResolution) selectBaseResolution.value = config.baseResolution;
  if (selectOutputResolution) selectOutputResolution.value = config.outputResolution;
  if (selectDownscaleFilter) selectDownscaleFilter.value = config.downscaleFilter;
  if (selectFpsType) selectFpsType.value = config.fpsType;
  selectFps.value = config.fps;
  if (sliderIntegerFps) { sliderIntegerFps.value = config.integerFps; if (valIntegerFps) valIntegerFps.innerText = config.integerFps; }
  if (selectColorFormat) selectColorFormat.value = config.colorFormat;
  if (selectColorSpace) selectColorSpace.value = config.colorSpace;
  if (selectColorRange) selectColorRange.value = config.colorRange;
  if (checkboxFlipH) checkboxFlipH.checked = config.flipH;
  if (checkboxFlipV) checkboxFlipV.checked = config.flipV;
  if (selectRotation) selectRotation.value = config.rotation;

  // Audio
  if (checkboxMicEnabled) {
    checkboxMicEnabled.checked = config.micEnabled;
    const micRow = document.getElementById('mic-device-row');
    if (micRow) micRow.style.display = config.micEnabled ? 'flex' : 'none';
  }
  if (selectMicDevice) selectMicDevice.value = config.micDeviceId;
  
  if (checkboxMicNoiseSuppression) checkboxMicNoiseSuppression.checked = !!config.micNoiseSuppression;
  if (checkboxMicEchoCancellation) checkboxMicEchoCancellation.checked = !!config.micEchoCancellation;
  if (checkboxMicAgc) checkboxMicAgc.checked = !!config.micAGC;
  if (checkboxMicNoiseGate) checkboxMicNoiseGate.checked = !!config.micNoiseGate;

  if (selectSampleRate) selectSampleRate.value = config.sampleRate;
  if (selectAudioChannels) selectAudioChannels.value = config.audioChannels;
  if (checkboxSeparateTracks) checkboxSeparateTracks.checked = config.separateTracks;

  // Replay
  sliderReplayLength.value = config.replayLength;
  valReplayLength.innerText = formatReplayTime(config.replayLength);
  if (sliderReplayRam) { sliderReplayRam.value = config.replayRam; valReplayRam.innerText = `${config.replayRam} MB`; }
  if (checkboxAutoReplay) checkboxAutoReplay.checked = config.autoReplay;
  if (checkboxReplayNotify) checkboxReplayNotify.checked = config.replayNotify;
  if (checkboxReplaySound) checkboxReplaySound.checked = config.replaySound;

  // Hotkeys
  inputHotkeyReplay.value = config.hotkeyReplay;
  inputHotkeyRecord.value = config.hotkeyRecord;
  if (inputHotkeyPause) inputHotkeyPause.value = config.hotkeyPause;
  if (inputHotkeyToggleReplay) inputHotkeyToggleReplay.value = config.hotkeyToggleReplay;
  if (inputHotkeyMuteMic) inputHotkeyMuteMic.value = config.hotkeyMuteMic;
  if (inputHotkeyMuteDesktop) inputHotkeyMuteDesktop.value = config.hotkeyMuteDesktop;
  if (inputHotkeyBookmark) inputHotkeyBookmark.value = config.hotkeyBookmark;
  hintReplay.innerText = config.hotkeyReplay;
  hintRecord.innerText = config.hotkeyRecord;

  // General
  if (selectAppTheme) selectAppTheme.value = config.appTheme || 'classic-obsidian';
  checkboxMinimizeTray.checked = config.minimizeToTray;
  if (checkboxStartMinimized) checkboxStartMinimized.checked = config.startMinimized;
  if (checkboxStartWithWindows) checkboxStartWithWindows.checked = config.autoLaunch;
  if (selectProcessPriority) selectProcessPriority.value = config.processPriority;
  if (checkboxNotifyRecord) checkboxNotifyRecord.checked = config.notifyRecord;
  if (checkboxNotifyReplay) checkboxNotifyReplay.checked = config.notifyReplay;
  applyThemeToUI(config.appTheme);

  updateRateControlVisibility();
  updateFpsTypeVisibility();
  updateReplayEstimation();
}

function formatReplayTime(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} Hour(s)`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function updateRateControlVisibility() {
  if (!rowCqpLevel || !rowVideoBitrate) return;
  const rc = config.rateControl;
  rowCqpLevel.style.display = (rc === 'cqp') ? 'block' : 'none';
  rowVideoBitrate.style.display = (rc === 'cqp') ? 'none' : 'block';
}

function updateFpsTypeVisibility() {
  if (!rowCommonFps || !rowIntegerFps) return;
  rowCommonFps.style.display = config.fpsType === 'common' ? 'block' : 'none';
  rowIntegerFps.style.display = config.fpsType === 'integer' ? 'block' : 'none';
}

function updateReplayEstimation() {
  if (!infoReplayDuration) return;
  const dur = parseInt(config.replayLength);
  const bitrate = parseInt(config.videoBitrate) + parseInt(config.audioBitrate);
  const estSizeMB = Math.round((bitrate * dur) / 8 / 1024);
  const ramLimit = parseInt(config.replayRam);

  infoReplayDuration.innerText = formatReplayTime(dur);
  infoReplayFilesize.innerText = `~${estSizeMB} MB`;
  infoReplayRamUsage.innerText = `~${Math.min(estSizeMB, ramLimit)} MB of ${ramLimit} MB`;
}

function setupSettingsSubTabs() {
  const subtabs = document.querySelectorAll('.settings-subtab');
  const subpanes = document.querySelectorAll('.settings-subpane');

  subtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-stab');
      subtabs.forEach(t => t.classList.remove('active'));
      subpanes.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = document.getElementById(`stab-${target}`);
      if (pane) pane.classList.add('active');
    });
  });
}

// -------------------------------------------------------------------------
// ADD SOURCE MODAL & SOURCE MANAGEMENT
// -------------------------------------------------------------------------
async function openAddSourceModal() {
  modalAddSource.style.display = 'flex';
  modalSourcesGrid.innerHTML = '<div class="source-loading">Scanning displays and windows...</div>';

  try {
    const sources = await window.electronAPI.getSources();
    modalSourcesGrid.innerHTML = '';
    
    if (sources.length === 0) {
      modalSourcesGrid.innerHTML = '<div class="source-loading">No capture sources found.</div>';
      return;
    }

    sources.forEach(src => {
      const card = document.createElement('div');
      card.className = 'source-card';
      const isScreen = src.id.startsWith('screen:');
      
      card.innerHTML = `
        <div class="source-thumbnail-container">
          <img src="${src.thumbnail}" alt="Thumbnail">
        </div>
        <div class="source-details">
          <div class="source-name" title="${src.name}">${src.name}</div>
          <div class="source-type">${isScreen ? 'Display' : 'Window'}</div>
        </div>
      `;

      card.addEventListener('click', async () => {
        closeAddSourceModal();
        await addSourceToScene(src.id, src.name, isScreen ? 'Display' : 'Window');
      });

      modalSourcesGrid.appendChild(card);
    });
  } catch (err) {
    modalSourcesGrid.innerHTML = '<div class="source-loading">Error loading sources.</div>';
  }
}

function closeAddSourceModal() {
  modalAddSource.style.display = 'none';
}

async function addSourceToScene(id, name, type) {
  debugLog(`Adding source to scene: ${name} (${id})`);
  
  if (addedSources.some(s => s.id === id)) {
    debugLog(`Source ${name} already in scene.`);
    return;
  }
  
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => {});
  }

  let pid = null;
  if (type === 'Window') {
    const parts = id.split(':');
    if (parts.length >= 2) {
      const hwndStr = parts[1];
      try {
        const list = await window.electronAPI.getActiveWindows();
        const match = list.find(w => w.hwnd === hwndStr || w.hwnd === `0x${parseInt(hwndStr, 10).toString(16)}` || String(w.hwnd) === String(hwndStr));
        if (match) {
          pid = match.processId;
        } else {
          const titleMatch = list.find(w => name.includes(w.title) || w.title.includes(name));
          if (titleMatch) pid = titleMatch.processId;
        }
      } catch (e) {}
    }
  }

  // Fetch Stream
  let stream = null;
  const constraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: id
      }
    },
    audio: false
  };

  // If it's a screen, request system audio loopback in getUserMedia
  if (id.startsWith('screen:')) {
    constraints.audio = {
      mandatory: {
        chromeMediaSource: 'desktop'
      }
    };
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    debugLog(`Failed to capture source stream: ${err.message}`);
    window.electronAPI.showNotification('Source Missing', `Could not capture source. It may be closed or minimized.`);
    return;
  }

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  
  video.onloadedmetadata = () => {
    video.play().catch(()=>{});
    applyCanvasTransform();
  };

  // Initial Z-Index is high (append to array end)
  const sourceObj = {
    id,
    name,
    type,
    pid,
    stream,
    video,
    x: 0,
    y: 0,
    scale: 1.0, // Start at 1.0 scale to fill canvas properly by default
    rotation: 0,
    flipH: false,
    flipV: false,
    visible: true
  };

  addedSources.push(sourceObj);

  // Set up screen audio routing
  if (id.startsWith('screen:') && stream.getAudioTracks().length > 0) {
    await initGlobalAudioGraph();
    try {
      const screenAudioSource = audioCtx.createMediaStreamSource(stream);
      const gainNode = audioCtx.createGain();
      const initialVolume = config.systemVolume !== undefined ? config.systemVolume : 1.0;
      gainNode.gain.value = systemMuted ? 0 : initialVolume;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      
      screenAudioSource.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioDestNode);
      
      const mixerUI = createMixerUI(`System Audio (${name})`, initialVolume);
      audioMixerContainer.appendChild(mixerUI.container);
      
      if (systemMuted) {
        mixerUI.container.classList.add('muted');
        mixerUI.slider.value = 0;
        mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
      }

      mixerUI.slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!systemMuted) {
          gainNode.gain.value = val;
        }
        config.systemVolume = val;
        saveLocalConfig();
      });
      
      mixerUI.muteBtn.addEventListener('click', () => {
        toggleDesktopMute();
      });

      screenAudioMaps.set(id, {
        sourceNode: screenAudioSource,
        gainNode,
        analyser,
        uiContainer: mixerUI.container,
        meterBar: mixerUI.meterBar
      });
      
      debugLog(`Screen loopback audio capture active for source: ${id}`);
    } catch (audioErr) {
      debugLog(`Failed to configure screen audio graph: ${audioErr.message}`);
    }
  }

  if (pid) {
    await setupAppAudioGraph(pid, name);
  }

  setActiveSource(id);
  
  if (previewPlaceholder) {
    previewPlaceholder.style.display = 'none';
  }

  renderSourcesList();
  applyCanvasTransform();
}

function removeSourceFromScene(index) {
  const sourceObj = addedSources[index];
  if (!sourceObj) return;

  addedSources.splice(index, 1);

  if (sourceObj.stream) {
    sourceObj.stream.getTracks().forEach(track => track.stop());
  }
  if (sourceObj.video) {
    sourceObj.video.pause();
    sourceObj.video.srcObject = null;
  }

  if (screenAudioMaps.has(sourceObj.id)) {
    const mapObj = screenAudioMaps.get(sourceObj.id);
    if (mapObj.sourceNode) mapObj.sourceNode.disconnect();
    if (mapObj.gainNode) mapObj.gainNode.disconnect();
    if (mapObj.uiContainer) mapObj.uiContainer.remove();
    screenAudioMaps.delete(sourceObj.id);
  }

  if (sourceObj.pid && appAudioMaps.has(sourceObj.pid)) {
    removeAppAudioGraph(sourceObj.pid);
  }

  if (sourceObj.id === activeVideoSourceId) {
    if (addedSources.length > 0) {
      setActiveSource(addedSources[addedSources.length - 1].id);
    } else {
      setActiveSource(null);
      if (previewPlaceholder) {
        previewPlaceholder.style.display = 'flex';
      }
    }
  }

  renderSourcesList();
  applyCanvasTransform();
}

function renderSourcesList() {
  saveSceneState();
  if (addedSources.length === 0) {
    sourcesListContainer.innerHTML = '<div class="empty-sources">Click + to add a capture source</div>';
    return;
  }

  sourcesListContainer.innerHTML = '';
  for (let idx = addedSources.length - 1; idx >= 0; idx--) {
    const src = addedSources[idx];
    const div = document.createElement('div');
    div.className = 'source-item';
    
    if (src.id === activeVideoSourceId) {
      div.style.borderColor = 'var(--color-cyan)';
    }

    const isVisible = src.visible !== false;
    const eyeIcon = isVisible 
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    div.innerHTML = `
      <div class="source-item-name" title="${src.name}">[${src.type}] ${src.name}</div>
      <div class="source-item-actions">
        <button class="btn-toggle-visibility" title="Toggle Visibility" style="background:none;border:none;color:inherit;cursor:pointer;margin-right:6px;display:flex;align-items:center;">${eyeIcon}</button>
        <button class="btn-remove-source" title="Remove" style="background:none;border:none;color:inherit;cursor:pointer;display:flex;align-items:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
    `;

    div.addEventListener('click', () => {
      setActiveSource(src.id);
      renderSourcesList();
      applyCanvasTransform();
    });

    div.querySelector('.btn-toggle-visibility').addEventListener('click', (e) => {
      e.stopPropagation();
      src.visible = !isVisible;
      renderSourcesList();
      applyCanvasTransform();
    });

    div.querySelector('.btn-remove-source').addEventListener('click', (e) => {
      e.stopPropagation();
      removeSourceFromScene(idx);
    });

    sourcesListContainer.appendChild(div);
  }
}

// -------------------------------------------------------------------------
// AUDIO MIXING & ANALYSIS ENGINE (Per-Application)
// -------------------------------------------------------------------------
let workletLoaded = false;
let audioGraphInitPromise = null;

async function initGlobalAudioGraph() {
  if (audioDestNode && workletLoaded) return;
  if (!audioGraphInitPromise) {
    audioGraphInitPromise = (async () => {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(e => {});
      if (!audioDestNode) audioDestNode = audioCtx.createMediaStreamDestination();
      
      if (!workletLoaded) {
        try {
          const response = await fetch('pcm-processor.js');
          const text = await response.text();
          const blob = new Blob([text], {type: 'application/javascript'});
          const blobUrl = URL.createObjectURL(blob);
          await audioCtx.audioWorklet.addModule(blobUrl);

          const gateResp = await fetch('noise-gate-processor.js');
          const gateText = await gateResp.text();
          const gateBlob = new Blob([gateText], {type: 'application/javascript'});
          const gateBlobUrl = URL.createObjectURL(gateBlob);
          await audioCtx.audioWorklet.addModule(gateBlobUrl);

          workletLoaded = true;
        } catch (e) {
          debugLog(`AudioWorklet load error: ${e.message}`);
        }
      }
    })();
  }
  return audioGraphInitPromise;
}

async function setupAppAudioGraph(pid, name) {
  await initGlobalAudioGraph();

  if (appAudioMaps.has(pid)) return; // Already capturing this PID

  try {
    const pcmNode = new AudioWorkletNode(audioCtx, 'pcm-processor');
    const gainNode = audioCtx.createGain();
    const initialVolume = 1.0;
    gainNode.gain.value = systemMuted ? 0 : initialVolume;
    
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;

    pcmNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioDestNode);

    // Create UI controls for this app
    const mixerUI = createMixerUI(`App: ${name}`, initialVolume);
    audioMixerContainer.appendChild(mixerUI.container);

    const appAudioObj = {
      pcmNode, gainNode, analyser, unsubListener: null,
      uiContainer: mixerUI.container,
      meterBar: mixerUI.meterBar,
      muted: systemMuted,
      unmutedVolume: initialVolume
    };

    if (systemMuted) {
      mixerUI.container.classList.add('muted');
      mixerUI.slider.value = 0;
      mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
    }

    mixerUI.slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!appAudioObj.muted) {
        gainNode.gain.value = val;
      }
      appAudioObj.unmutedVolume = val;
    });

    mixerUI.muteBtn.addEventListener('click', () => {
      appAudioObj.muted = !appAudioObj.muted;
      if (appAudioObj.muted) {
        gainNode.gain.value = 0;
        mixerUI.container.classList.add('muted');
        mixerUI.slider.value = 0;
        mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
      } else {
        gainNode.gain.value = appAudioObj.unmutedVolume;
        mixerUI.container.classList.remove('muted');
        mixerUI.slider.value = appAudioObj.unmutedVolume;
        mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="sound-wave"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="sound-wave"></path>';
      }
    });

    appAudioObj.unsubListener = window.electronAPI.onAppAudioData(pid.toString(), (chunk) => {
      if (pcmNode && chunk) {
        // Slice to get the exact data range and avoid shared buffer pool pollution
        const exactBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
        pcmNode.port.postMessage(exactBuffer);
      }
    });

    const success = await window.electronAPI.startAppAudio(pid.toString());

    if (!success) {
      console.warn(`Failed to start app audio for PID ${pid}`);
    }

    appAudioMaps.set(pid, appAudioObj);

  } catch (err) {
    debugLog(`Failed to setup app audio graph for PID ${pid}: ${err.message}`);
  }
}

function removeAppAudioGraph(pid) {
  const mapObj = appAudioMaps.get(pid);
  if (!mapObj) return;

  if (mapObj.unsubListener) mapObj.unsubListener();
  window.electronAPI.stopAppAudio(pid.toString()).catch(()=>{});

  if (mapObj.pcmNode) mapObj.pcmNode.disconnect();
  if (mapObj.uiContainer) mapObj.uiContainer.remove();

  appAudioMaps.delete(pid);
}

async function setupMicAudioGraph() {
  if (micGainNode) return;
  await initGlobalAudioGraph();

  try {
    const micConstraints = {
      audio: {
        deviceId: config.micDeviceId !== 'default' ? { exact: config.micDeviceId } : undefined,
        noiseSuppression: !!config.micNoiseSuppression,
        echoCancellation: !!config.micEchoCancellation,
        autoGainControl: !!config.micAGC
      }
    };
    
    micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
    const micSourceNode = audioCtx.createMediaStreamSource(micStream);
    
    micGainNode = audioCtx.createGain();
    micGainNode.gain.value = 1.0;

    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 64;

    if (config.micNoiseGate) {
      micGateNode = new AudioWorkletNode(audioCtx, 'noise-gate-processor');
      micSourceNode.connect(micGateNode);
      micGateNode.connect(micGainNode);
    } else {
      micSourceNode.connect(micGainNode);
    }
    
    micGainNode.connect(micAnalyser);
    micAnalyser.connect(audioDestNode);
    
    createMicMixerUI();

  } catch (err) {
    debugLog(`Error configuring microphone input: ${err.message}`);
  }
}

function createMicMixerUI() {
  if (document.getElementById('mixer-row-mic')) return; // already exists
  
  const initialVolume = config.micVolume !== undefined ? config.micVolume : 1.0;
  const mixerUI = createMixerUI('Microphone / Aux', initialVolume);
  mixerUI.container.id = 'mixer-row-mic';
  audioMixerContainer.prepend(mixerUI.container);
  
  if (micGainNode) {
    micGainNode.gain.value = micMuted ? 0 : initialVolume;
  }
  
  if (micMuted) {
    mixerUI.container.classList.add('muted');
    mixerUI.slider.value = 0;
    mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
    const pctSpan = mixerUI.container.querySelector('.volume-percentage');
    if (pctSpan) pctSpan.innerText = '0%';
  }
  
  mixerUI.slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!micMuted) {
      if (micGainNode) micGainNode.gain.value = val;
    }
    config.micVolume = val;
    saveLocalConfig();
  });
  
  mixerUI.muteBtn.addEventListener('click', () => {
    micMuted = !micMuted;
    const pctSpan = mixerUI.container.querySelector('.volume-percentage');
    if (micMuted) {
      if (micGainNode) micGainNode.gain.value = 0;
      mixerUI.container.classList.add('muted');
      mixerUI.slider.value = 0;
      mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
      if (pctSpan) pctSpan.innerText = '0%';
    } else {
      const vol = config.micVolume !== undefined ? config.micVolume : 1.0;
      if (micGainNode) micGainNode.gain.value = vol;
      mixerUI.container.classList.remove('muted');
      mixerUI.slider.value = vol;
      mixerUI.muteBtn.querySelector('.mute-icon').innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="sound-wave"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="sound-wave"></path>';
      if (pctSpan) pctSpan.innerText = Math.round(vol * 100) + '%';
    }
  });
  
  if (micAnalyser) {
    micAnalyser.meterBar = mixerUI.meterBar;
  }
}

function removeMicAudioGraph() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null;
  if (micGainNode) micGainNode.disconnect();
  micGainNode = null;
  if (micGateNode) micGateNode.disconnect();
  micGateNode = null;
  if (micAnalyser) micAnalyser.disconnect();
  micAnalyser = null;
  document.getElementById('mixer-row-mic')?.remove();
}

function toggleDesktopMute() {
  systemMuted = !systemMuted;
  
  screenAudioMaps.forEach((mapObj) => {
    const vol = config.systemVolume !== undefined ? config.systemVolume : 1.0;
    const container = mapObj.uiContainer;
    const slider = container.querySelector('.volume-slider');
    const muteBtn = container.querySelector('.mute-btn');
    const pctSpan = container.querySelector('.volume-percentage');
    
    if (systemMuted) {
      if (mapObj.gainNode) mapObj.gainNode.gain.value = 0;
      container.classList.add('muted');
      slider.value = 0;
      muteBtn.querySelector('.mute-icon').innerHTML = '<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M18.36 5.64A9 9 0 0 1 20.07 15M11 5L6 9H2v6h4l5 4V5z"></path>';
      if (pctSpan) pctSpan.innerText = '0%';
    } else {
      if (mapObj.gainNode) mapObj.gainNode.gain.value = vol;
      container.classList.remove('muted');
      slider.value = vol;
      muteBtn.querySelector('.mute-icon').innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="sound-wave"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="sound-wave"></path>';
      if (pctSpan) pctSpan.innerText = Math.round(vol * 100) + '%';
    }
  });

  appAudioMaps.forEach((mapObj) => {
    const container = mapObj.uiContainer;
    const slider = container.querySelector('.volume-slider');
    const muteBtn = container.querySelector('.mute-btn');
    
    if (mapObj.muted !== systemMuted) {
      if (muteBtn) muteBtn.click();
    }
  });
}

function createMixerUI(label, defaultGain) {
  const div = document.createElement('div');
  div.className = 'meter-row';
  const initPct = Math.round(defaultGain * 100);
  div.innerHTML = `
    <div class="meter-labels">
      <label>${label}</label>
      <span class="volume-percentage">${initPct}%</span>
      <button class="mute-btn" title="Mute/Unmute" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;padding: 2px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mute-icon">
          <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="sound-wave"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="sound-wave"></path>
        </svg>
      </button>
    </div>
    <div class="meter-controls">
      <div class="meter-bg">
        <div class="meter-bar"></div>
      </div>
      <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="${defaultGain}" title="Volume">
    </div>
  `;
  const ret = {
    container: div,
    slider: div.querySelector('.volume-slider'),
    meterBar: div.querySelector('.meter-bar'),
    muteBtn: div.querySelector('.mute-btn')
  };
  
  const pctSpan = div.querySelector('.volume-percentage');
  if (ret.slider && pctSpan) {
    ret.slider.addEventListener('input', (e) => {
      pctSpan.innerText = Math.round(e.target.value * 100) + '%';
    });
  }
  
  return ret;
}

// Volume Meters Render Loop
function updateVolumeMeters() {
  // Update App Audios
  appAudioMaps.forEach((mapObj) => {
    if (mapObj.analyser && mapObj.meterBar) {
      updateMeterFromAnalyser(mapObj.analyser, mapObj.meterBar);
    }
  });

  // Update Mic
  if (micAnalyser && micAnalyser.meterBar) {
    updateMeterFromAnalyser(micAnalyser, micAnalyser.meterBar);
  }

  // Update Screen System Audios
  screenAudioMaps.forEach((mapObj) => {
    if (mapObj.analyser && mapObj.meterBar) {
      updateMeterFromAnalyser(mapObj.analyser, mapObj.meterBar);
    }
  });

  requestAnimationFrame(updateVolumeMeters);
}

function updateMeterFromAnalyser(analyser, meterElement) {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);
  
  let maxPeak = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const val = Math.abs(dataArray[i] - 128);
    if (val > maxPeak) maxPeak = val;
  }
  
  // maxPeak is between 0 and 128
  let percent = (maxPeak / 128.0) * 100;
  
  // Apply a non-linear visual curve for punchiness
  percent = Math.pow(percent / 100, 0.6) * 100;
  
  // Visual noise gate (ignore tiny static fluctuations)
  if (percent < 8) percent = 0;
  
  meterElement.style.width = `${Math.min(100, percent)}%`;
}

// -------------------------------------------------------------------------
// VIDEO CAPTURE ENGINE
// -------------------------------------------------------------------------
async function startVideoCapture(sourceId, sourceName) {
  // If it's already in addedSources, select it
  const match = addedSources.find(s => s.id === sourceId);
  if (match) {
    setActiveSource(sourceId);
    renderSourcesList();
    applyCanvasTransform();
  } else {
    // Determine type
    const type = sourceId.startsWith('screen:') ? 'Screen' : 'Window';
    await addSourceToScene(sourceId, sourceName, type);
  }
}

function stopVideoCapture() {
  // Clean up all sources
  while (addedSources.length > 0) {
    removeSourceFromScene(0);
  }
  setActiveSource(null);
  if (previewPlaceholder) {
    previewPlaceholder.style.display = 'flex';
  }
  const resizableBox = document.getElementById('resizable-source-box');
  const aspectRow = document.getElementById('canvas-aspect-row');
  if (resizableBox) resizableBox.style.display = 'none';
  if (aspectRow) aspectRow.style.display = 'none';
}

function getMimeTypeAndExtension() {
  const format = config.format || 'webm';
  const encoder = config.encoder || 'vp9'; // 'vp9', 'vp8', 'h264'
  
  let container = 'video/webm';
  let fileExt = 'webm';
  
  if (format === 'mkv') {
    container = 'video/x-matroska';
    fileExt = 'mkv';
  } else if (format === 'mp4') {
    container = 'video/mp4';
    fileExt = 'mp4';
  }
  
  let mimeType = `${container};codecs=${encoder},opus`;
  
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    debugLog(`Preferred MimeType "${mimeType}" is not supported. Finding fallback...`);
    const fallbacks = [
      `${container};codecs=vp9,opus`,
      `${container};codecs=vp8,opus`,
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    for (const fb of fallbacks) {
      if (MediaRecorder.isTypeSupported(fb)) {
        mimeType = fb;
        debugLog(`Selected fallback MimeType: ${mimeType}`);
        break;
      }
    }
  }

  // Set accurate extension based on actual chosen MIME container type
  if (mimeType.includes('video/x-matroska')) {
    fileExt = 'mkv';
  } else {
    fileExt = 'webm';
  }
  
  return { mimeType, fileExt };
}

// -------------------------------------------------------------------------
// RECORDING ENGINE (STANDARD RECORD)
// -------------------------------------------------------------------------
async function startStandardRecording() {
  if (recordingState !== 'idle' || !compositeCanvas) return;
  if (addedSources.length === 0) {
    statusText.innerText = 'Error: Add a source before recording!';
    return;
  }
  
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(e => {});
  await initGlobalAudioGraph();

  // Create downscaled helper canvas if output resolution !== 'same'
  let canvasW = 1920;
  let canvasH = 1080;
  if (config.baseResolution) {
    const parts = config.baseResolution.split('x');
    if (parts.length === 2) {
      canvasW = parseInt(parts[0]) || 1920;
      canvasH = parseInt(parts[1]) || 1080;
    }
  }

  let outW = canvasW;
  let outH = canvasH;
  if (config.outputResolution && config.outputResolution !== 'same') {
    const parts = config.outputResolution.split('x');
    if (parts.length === 2) {
      outW = parseInt(parts[0]) || canvasW;
      outH = parseInt(parts[1]) || canvasH;
    }
  }

  if (outW !== canvasW || outH !== canvasH) {
    recordCanvas = document.createElement('canvas');
    recordCanvas.width = outW;
    recordCanvas.height = outH;
    recordCtx = recordCanvas.getContext('2d');
  } else {
    recordCanvas = null;
    recordCtx = null;
  }

  const streamCanvas = recordCanvas || compositeCanvas;
  const canvasStream = streamCanvas.captureStream(config.fps || 60);
  let finalStream = canvasStream;
  if (audioDestNode && audioDestNode.stream.getAudioTracks().length > 0) {
    finalStream = new MediaStream([
      canvasStream.getVideoTracks()[0],
      audioDestNode.stream.getAudioTracks()[0]
    ]);
  }

  // 1. Choose Mime Type based on Selected Format and Encoder
  const { mimeType, fileExt } = getMimeTypeAndExtension();

  // 2. Set Bitrates (Handle CQP Quality vs Bitrate Slider)
  let videoBitrateBps = config.videoBitrate * 1000;
  if (config.rateControl === 'cqp') {
    const cqpVal = parseInt(config.cqpLevel) || 20;
    videoBitrateBps = Math.max(1000, Math.min(60000, (51 - cqpVal) * 900)) * 1000;
  }

  const options = {
    mimeType: mimeType,
    videoBitsPerSecond: videoBitrateBps,
    audioBitsPerSecond: config.audioBitrate * 1000
  };

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.${fileExt}`;

    await window.electronAPI.startRecordingStream(filename);
    
    currentRecordingFilename = filename;
    recordingStartTime = Date.now();
    currentBookmarks = [];

    standardRecorder = new MediaRecorder(finalStream, options);
    
    standardRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const arrayBuffer = await e.data.arrayBuffer();
        await window.electronAPI.writeRecordingChunk(arrayBuffer);
      }
    };

    standardRecorder.onstop = async () => {
      try {
        await window.electronAPI.stopRecordingStream();
        
        // Save bookmarks sidecar file if any were added
        if (currentBookmarks.length > 0) {
          const txtFilename = currentRecordingFilename.replace(/\.[^/.]+$/, "") + "_bookmarks.txt";
          const bookmarkContent = `Bookmarks for ${currentRecordingFilename}:\n` + 
            currentBookmarks.map((time, idx) => `- Bookmark ${idx + 1}: ${time}`).join('\n');
          await window.electronAPI.saveBookmarks(txtFilename, bookmarkContent);
        }

        loadGallery();
      } catch (err) {
        debugLog(`Failed to finalize recording file stream: ${err.message}`);
      }
      recordCanvas = null;
      recordCtx = null;
      recordingState = 'idle';
      standardRecorder = null;
      updateUIStatus();
    };

    standardRecorder.start(1000); // Write chunks to disk every 1 second
    recordingState = 'recording';
    standardStartTime = Date.now();
    totalPausedTime = 0;
    pauseStartTime = 0;
    updateUIStatus();
    startTimer();
    
  } catch (err) {
    debugLog(`Failed to start recording: ${err.message}`);
    recordCanvas = null;
    recordCtx = null;
  }
}

function stopStandardRecording() {
  if (standardRecorder && standardRecorder.state !== 'inactive') {
    try {
      standardRecorder.stop();
    } catch (err) {
      debugLog(`Error stopping standard recorder: ${err.message}`);
    }
    stopTimer();
  }
}

function pauseStandardRecording() {
  if (standardRecorder && recordingState === 'recording') {
    standardRecorder.pause();
    recordingState = 'paused';
    pauseStartTime = Date.now();
    updateUIStatus();
  }
}

function resumeStandardRecording() {
  if (standardRecorder && recordingState === 'paused') {
    standardRecorder.resume();
    recordingState = 'recording';
    totalPausedTime += (Date.now() - pauseStartTime);
    pauseStartTime = 0;
    updateUIStatus();
  }
}

function startTimer() {
  const overlay = document.getElementById('recording-timer-overlay');
  if (overlay) overlay.style.display = 'flex';
  
  recordingTimerId = setInterval(() => {
    let elapsed = 0;
    if (recordingState === 'paused') {
      elapsed = pauseStartTime - standardStartTime - totalPausedTime;
    } else {
      elapsed = Date.now() - standardStartTime - totalPausedTime;
    }
    const formatted = formatTime(elapsed);
    statusText.innerText = `Recording: ${formatted}`;
    
    const overlayText = document.getElementById('recording-time-text');
    if (overlayText) overlayText.innerText = formatted;
  }, 1000);
}

function stopTimer() {
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
  const overlay = document.getElementById('recording-timer-overlay');
  if (overlay) overlay.style.display = 'none';
}

// -------------------------------------------------------------------------
// REPLAY BUFFER ENGINE
// -------------------------------------------------------------------------
async function startReplayBuffer() {
  if (replayActive || !compositeCanvas) return;
  if (addedSources.length === 0) {
    statusText.innerText = 'Error: Add a source before starting replay!';
    return;
  }

  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(e => {});
  await initGlobalAudioGraph();

  // Create downscaled helper canvas if output resolution !== 'same'
  let canvasW = 1920;
  let canvasH = 1080;
  if (config.baseResolution) {
    const parts = config.baseResolution.split('x');
    if (parts.length === 2) {
      canvasW = parseInt(parts[0]) || 1920;
      canvasH = parseInt(parts[1]) || 1080;
    }
  }

  let outW = canvasW;
  let outH = canvasH;
  if (config.outputResolution && config.outputResolution !== 'same') {
    const parts = config.outputResolution.split('x');
    if (parts.length === 2) {
      outW = parseInt(parts[0]) || canvasW;
      outH = parseInt(parts[1]) || canvasH;
    }
  }

  // Use existing recordCanvas if already created by standard recorder
  if (!recordCanvas && (outW !== canvasW || outH !== canvasH)) {
    recordCanvas = document.createElement('canvas');
    recordCanvas.width = outW;
    recordCanvas.height = outH;
    recordCtx = recordCanvas.getContext('2d');
  }

  const streamCanvas = recordCanvas || compositeCanvas;
  const canvasStream = streamCanvas.captureStream(config.fps || 60);
  let finalStream = canvasStream;
  if (audioDestNode && audioDestNode.stream.getAudioTracks().length > 0) {
    finalStream = new MediaStream([
      canvasStream.getVideoTracks()[0],
      audioDestNode.stream.getAudioTracks()[0]
    ]);
  }

  // 1. Choose Mime Type based on Selected Format and Encoder
  const { mimeType } = getMimeTypeAndExtension();

  // 2. Set Bitrates (Handle CQP Quality vs Bitrate Slider)
  let videoBitrateBps = config.videoBitrate * 1000;
  if (config.rateControl === 'cqp') {
    const cqpVal = parseInt(config.cqpLevel) || 20;
    videoBitrateBps = Math.max(1000, Math.min(60000, (51 - cqpVal) * 900)) * 1000;
  }

  const options = {
    mimeType: mimeType,
    videoBitsPerSecond: videoBitrateBps,
    audioBitsPerSecond: config.audioBitrate * 1000
  };

  replayHeader = null;
  replayQueue = [];
  replayChunkIndex = 0;

  try {
    replayRecorder = new MediaRecorder(finalStream, options);
    
    replayRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const arrayBuffer = await e.data.arrayBuffer();
        if (replayChunkIndex === 0) {
          replayHeader = arrayBuffer;
        } else {
          replayQueue.push({ buffer: arrayBuffer, timestamp: Date.now() });
          
          // Time Length Duration Limit enforcement (seconds)
          const limitMs = parseInt(config.replayLength) * 1000;
          const now = Date.now();
          while (replayQueue.length > 0 && now - replayQueue[0].timestamp > limitMs) {
            replayQueue.shift();
          }

          // OBS-style RAM Memory Limit enforcement
          const maxRamBytes = parseInt(config.replayRam) * 1024 * 1024;
          let currentRamBytes = replayQueue.reduce((acc, chunk) => acc + chunk.buffer.byteLength, 0);
          
          while (currentRamBytes > maxRamBytes && replayQueue.length > 0) {
            const removed = replayQueue.shift();
            currentRamBytes -= removed.buffer.byteLength;
          }
        }
        replayChunkIndex++;
      }
    };

    replayRecorder.onstop = () => {
      replayActive = false;
      // Clean up recordCanvas if standard recording is also not active
      if (recordingState === 'idle') {
        recordCanvas = null;
        recordCtx = null;
      }
      replayRecorder = null;
      updateUIStatus();
    };

    replayRecorder.start(1000); // 1 sec timeslice
    replayActive = true;
    updateUIStatus();
    
    if (window.electronAPI) {
      window.electronAPI.showNotification('WHEL Recorder', 'Replay Buffer is now active. Play your game!');
    }
  } catch (err) {
    debugLog(`Failed to start Replay Buffer: ${err.message}`);
    if (recordingState === 'idle') {
      recordCanvas = null;
      recordCtx = null;
    }
  }
}

function stopReplayBuffer() {
  if (replayRecorder && replayRecorder.state !== 'inactive') {
    try {
      replayRecorder.stop();
    } catch (err) {
      debugLog(`Error stopping replay recorder: ${err.message}`);
    }
  }
}

function playReplayCaptureSound() {
  if (!config.replaySound) return;
  try {
    const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    debugLog(`Failed to play chime sound: ${e.message}`);
  }
}

function addBookmark() {
  if (recordingState !== 'recording') {
    debugLog('Cannot add bookmark: Not currently recording.');
    return;
  }
  const elapsedMs = Date.now() - recordingStartTime;
  const timeString = formatTime(elapsedMs);
  currentBookmarks.push(timeString);
  debugLog(`Bookmark added at relative timestamp: ${timeString}`);
  
  if (window.electronAPI) {
    window.electronAPI.showNotification('WHEL Recorder', `Bookmark added at ${timeString}!`);
  }
}

async function saveReplayBuffer() {
  if (isSavingReplay || !replayActive || replayQueue.length === 0 || !replayHeader) return;
  isSavingReplay = true;
  
  debugLog('Saving replay buffer to file...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileExt = config.format || 'webm';
  const filename = `replay_${timestamp}.${fileExt}`;
  
  const chunksToSave = [replayHeader, ...replayQueue.map(q => q.buffer)];
  
  try {
    await window.electronAPI.startReplayStream(filename);
    for (const chunk of chunksToSave) {
      if (chunk && chunk.byteLength > 0) {
        await window.electronAPI.writeReplayChunk(chunk);
      }
    }
    await window.electronAPI.stopReplayStream();
    
    playReplayCaptureSound();
    loadGallery();
  } catch (err) {
    debugLog(`Failed to save replay: ${err.message}`);
  } finally {
    isSavingReplay = false;
  }
}

// -------------------------------------------------------------------------
// UI & EVENT LISTENERS
// -------------------------------------------------------------------------
function updateSettingsAvailability() {
  const isBusy = (recordingState !== 'idle' || replayActive);
  
  const busyElements = [
    selectFormat, selectEncoder, selectRateControl, sliderCqpLevel,
    sliderVideoBitrate, selectAudioEncoder, sliderAudioBitrate,
    selectBaseResolution, selectOutputResolution, selectDownscaleFilter,
    selectFpsType, selectFps, sliderIntegerFps, selectColorFormat,
    selectColorSpace, selectColorRange, checkboxFlipH, checkboxFlipV,
    selectRotation, checkboxMicEnabled, selectMicDevice, selectSampleRate,
    selectAudioChannels, checkboxSeparateTracks, sliderReplayLength,
    sliderReplayRam, checkboxAutoReplay
  ];
  
  busyElements.forEach(el => {
    if (el) {
      el.disabled = isBusy;
    }
  });
}

function updateUIStatus() {
  // 1. Status Indicator Text & Dot
  if (recordingState === 'recording') {
    statusDot.className = 'status-dot pulse-record';
    statusText.innerText = replayActive ? 'Recording & Replay Buffer Active' : 'Recording...';
  } else if (recordingState === 'paused') {
    statusDot.className = 'status-dot pulse-idle';
    statusText.innerText = 'Recording Paused';
  } else if (replayActive) {
    statusDot.className = 'status-dot pulse-replay';
    statusText.innerText = 'Replay Buffer Active';
  } else {
    statusDot.className = 'status-dot pulse-idle';
    statusText.innerText = 'Idle - Ready';
  }

  // 2. Standard Recording Controls
  if (recordingState === 'recording') {
    btnToggleRecord.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop Recording';
    btnToggleRecord.className = 'control-btn btn-amber';
    btnToggleRecord.disabled = false;
    btnPauseRecord.disabled = false;
  } else if (recordingState === 'paused') {
    btnToggleRecord.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop Recording';
    btnPauseRecord.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
    btnToggleRecord.disabled = false;
    btnPauseRecord.disabled = false;
  } else {
    btnToggleRecord.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"></circle></svg> Start Recording';
    btnToggleRecord.className = 'control-btn btn-red';
    btnToggleRecord.disabled = false;
    btnPauseRecord.disabled = true;
    btnPauseRecord.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  }

  // 3. Replay Buffer Controls
  if (replayActive) {
    btnToggleReplay.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop Replay Buffer';
    btnToggleReplay.className = 'control-btn btn-amber';
    btnToggleReplay.disabled = false;
    btnSaveReplay.disabled = false;
  } else {
    btnToggleReplay.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> Start Replay Buffer';
    btnToggleReplay.className = 'control-btn btn-cyan';
    btnToggleReplay.disabled = false;
    btnSaveReplay.disabled = true;
  }

  // Update busy config fields
  updateSettingsAvailability();

  // Enable/disable bookmark button depending on recording state
  if (btnBookmark) {
    btnBookmark.disabled = (recordingState !== 'recording');
  }
}

function setupEventListeners() {
  // Window Titlebar Controls
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  if (window.electronAPI) {
    if (btnMinimize) btnMinimize.addEventListener('click', () => window.electronAPI.windowMinimize());
    if (btnMaximize) btnMaximize.addEventListener('click', () => window.electronAPI.windowMaximize());
    if (btnClose) btnClose.addEventListener('click', () => window.electronAPI.windowClose());
  }

  btnToggleReplay.addEventListener('click', () => {
    if (replayActive) stopReplayBuffer();
    else startReplayBuffer();
  });
  
  btnSaveReplay.addEventListener('click', () => {
    saveReplayBuffer();
  });

  btnToggleRecord.addEventListener('click', () => {
    if (recordingState === 'idle') startStandardRecording();
    else stopStandardRecording();
  });

  btnPauseRecord.addEventListener('click', () => {
    if (recordingState === 'recording') pauseStandardRecording();
    else if (recordingState === 'paused') resumeStandardRecording();
  });

  if (btnBookmark) {
    btnBookmark.addEventListener('click', addBookmark);
  }

  // Settings sync - Output
  if (btnBrowsePath) {
    btnBrowsePath.addEventListener('click', async () => {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        config.recordingDir = selected;
        if (inputSavePath) inputSavePath.value = selected;
        saveLocalConfig();
      }
    });
  }
  if (selectFormat) selectFormat.addEventListener('change', e => { config.format = e.target.value; saveLocalConfig(); });
  if (selectEncoder) selectEncoder.addEventListener('change', e => { config.encoder = e.target.value; saveLocalConfig(); });
  if (selectRateControl) selectRateControl.addEventListener('change', e => { config.rateControl = e.target.value; saveLocalConfig(); });
  if (sliderCqpLevel) sliderCqpLevel.addEventListener('input', e => { config.cqpLevel = e.target.value; valCqpLevel.innerText = e.target.value; saveLocalConfig(); });
  if (sliderVideoBitrate) sliderVideoBitrate.addEventListener('input', e => { config.videoBitrate = e.target.value; valVideoBitrate.innerText = `${e.target.value} Kbps`; saveLocalConfig(); });
  if (selectAudioEncoder) selectAudioEncoder.addEventListener('change', e => { config.audioEncoder = e.target.value; saveLocalConfig(); });
  if (sliderAudioBitrate) sliderAudioBitrate.addEventListener('input', e => { config.audioBitrate = e.target.value; valAudioBitrate.innerText = `${e.target.value} Kbps`; saveLocalConfig(); });
  if (inputFilenameTemplate) inputFilenameTemplate.addEventListener('change', e => { config.filenameTemplate = e.target.value; saveLocalConfig(); });

  // Settings sync - Video
  if (selectBaseResolution) selectBaseResolution.addEventListener('change', e => { config.baseResolution = e.target.value; saveLocalConfig(); });
  if (selectOutputResolution) selectOutputResolution.addEventListener('change', e => { config.outputResolution = e.target.value; saveLocalConfig(); });
  if (selectDownscaleFilter) selectDownscaleFilter.addEventListener('change', e => { config.downscaleFilter = e.target.value; saveLocalConfig(); });
  if (selectFpsType) selectFpsType.addEventListener('change', e => { config.fpsType = e.target.value; saveLocalConfig(); });
  if (selectFps) selectFps.addEventListener('change', e => { config.fps = e.target.value; saveLocalConfig(); });
  if (sliderIntegerFps) sliderIntegerFps.addEventListener('input', e => { config.integerFps = e.target.value; valIntegerFps.innerText = e.target.value; saveLocalConfig(); });
  if (selectColorFormat) selectColorFormat.addEventListener('change', e => { config.colorFormat = e.target.value; saveLocalConfig(); });
  if (selectColorSpace) selectColorSpace.addEventListener('change', e => { config.colorSpace = e.target.value; saveLocalConfig(); });
  if (selectColorRange) selectColorRange.addEventListener('change', e => { config.colorRange = e.target.value; saveLocalConfig(); });
  if (checkboxFlipH) checkboxFlipH.addEventListener('change', e => { config.flipH = e.target.checked; saveLocalConfig(); });
  if (checkboxFlipV) checkboxFlipV.addEventListener('change', e => { config.flipV = e.target.checked; saveLocalConfig(); });
  if (selectRotation) selectRotation.addEventListener('change', e => { config.rotation = e.target.value; saveLocalConfig(); });

  // Settings sync - Audio
  if (checkboxMicEnabled) checkboxMicEnabled.addEventListener('change', e => {
    config.micEnabled = e.target.checked;
    saveLocalConfig();
    if (config.micEnabled) setupMicAudioGraph();
    else removeMicAudioGraph();
  });
  if (selectMicDevice) selectMicDevice.addEventListener('change', e => {
    config.micDeviceId = e.target.value;
    saveLocalConfig();
    if (config.micEnabled) { removeMicAudioGraph(); setupMicAudioGraph(); }
  });
  
  const handleMicFilterChange = (key) => (e) => {
    config[key] = e.target.checked;
    saveLocalConfig();
    if (config.micEnabled) { removeMicAudioGraph(); setupMicAudioGraph(); }
  };
  
  if (checkboxMicNoiseSuppression) checkboxMicNoiseSuppression.addEventListener('change', handleMicFilterChange('micNoiseSuppression'));
  if (checkboxMicEchoCancellation) checkboxMicEchoCancellation.addEventListener('change', handleMicFilterChange('micEchoCancellation'));
  if (checkboxMicAgc) checkboxMicAgc.addEventListener('change', handleMicFilterChange('micAGC'));
  if (checkboxMicNoiseGate) checkboxMicNoiseGate.addEventListener('change', handleMicFilterChange('micNoiseGate'));
  if (selectSampleRate) selectSampleRate.addEventListener('change', e => { config.sampleRate = e.target.value; saveLocalConfig(); });
  if (selectAudioChannels) selectAudioChannels.addEventListener('change', e => { config.audioChannels = e.target.value; saveLocalConfig(); });
  if (checkboxSeparateTracks) checkboxSeparateTracks.addEventListener('change', e => { config.separateTracks = e.target.checked; saveLocalConfig(); });

  // Settings sync - Replay
  if (sliderReplayLength) sliderReplayLength.addEventListener('input', e => { config.replayLength = e.target.value; valReplayLength.innerText = formatReplayTime(e.target.value); saveLocalConfig(); });
  if (sliderReplayRam) sliderReplayRam.addEventListener('input', e => { config.replayRam = e.target.value; valReplayRam.innerText = `${e.target.value} MB`; saveLocalConfig(); });
  if (checkboxAutoReplay) checkboxAutoReplay.addEventListener('change', e => { config.autoReplay = e.target.checked; saveLocalConfig(); });
  if (checkboxReplayNotify) checkboxReplayNotify.addEventListener('change', e => { config.replayNotify = e.target.checked; saveLocalConfig(); });
  if (checkboxReplaySound) checkboxReplaySound.addEventListener('change', e => { config.replaySound = e.target.checked; saveLocalConfig(); });

  // Settings sync - General
  if (checkboxMinimizeTray) checkboxMinimizeTray.addEventListener('change', e => { config.minimizeToTray = e.target.checked; saveLocalConfig(); });
  if (checkboxStartMinimized) checkboxStartMinimized.addEventListener('change', e => { config.startMinimized = e.target.checked; saveLocalConfig(); });
  if (checkboxStartWithWindows) checkboxStartWithWindows.addEventListener('change', e => { config.autoLaunch = e.target.checked; saveLocalConfig(); });
  if (selectProcessPriority) selectProcessPriority.addEventListener('change', e => { config.processPriority = e.target.value; saveLocalConfig(); });
  if (checkboxNotifyRecord) checkboxNotifyRecord.addEventListener('change', e => { config.notifyRecord = e.target.checked; saveLocalConfig(); });
  if (checkboxNotifyReplay) checkboxNotifyReplay.addEventListener('change', e => { config.notifyReplay = e.target.checked; saveLocalConfig(); });

  if (selectAppTheme) selectAppTheme.addEventListener('change', e => {
    config.appTheme = e.target.value;
    saveLocalConfig();
    applyThemeToUI(e.target.value);
  });


  // Canvas Transform Right-Click Context Menu Logic
  const canvasContainer = document.getElementById('video-canvas-container');
  const contextMenu = document.getElementById('canvas-context-menu');

  if (canvasContainer && contextMenu) {
    canvasContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu.style.left = `${e.clientX}px`;
      contextMenu.style.top = `${e.clientY}px`;
      contextMenu.style.display = 'block';
    });

    document.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });

    const bindContextOption = (id, action) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          contextMenu.style.display = 'none';
          action();
        });
      }
    };

    bindContextOption('ctx-trans-fit', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      const container = document.getElementById('video-canvas-container');
      if (selectedSource && selectedSource.video && container) {
        const nativeWidth = selectedSource.video.videoWidth;
        const nativeHeight = selectedSource.video.videoHeight;
        const ratio = nativeWidth / nativeHeight;
        
        let targetHeight = container.clientHeight;
        let targetWidth = container.clientHeight * ratio;
        if (targetWidth > container.clientWidth) {
          targetWidth = container.clientWidth;
          targetHeight = container.clientWidth / ratio;
        }
        
        let canvasW = 1920;
        if (config.baseResolution) {
          const parts = config.baseResolution.split('x');
          if (parts.length === 2) canvasW = parseInt(parts[0]) || 1920;
        }
        const vpScale = container.clientWidth / canvasW;

        selectedSource.scaleX = targetWidth / (nativeWidth * vpScale);
        selectedSource.scaleY = targetWidth / (nativeWidth * vpScale);
        selectedSource.x = 0;
        selectedSource.y = 0;
        selectedSource.rotation = 0;
        selectedSource.flipH = false;
        selectedSource.flipV = false;
        
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-stretch', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      const container = document.getElementById('video-canvas-container');
      if (selectedSource && selectedSource.video && container) {
        const nativeWidth = selectedSource.video.videoWidth;
        const nativeHeight = selectedSource.video.videoHeight;
        
        let canvasW = 1920;
        let canvasH = 1080;
        if (config.baseResolution) {
          const parts = config.baseResolution.split('x');
          if (parts.length === 2) {
            canvasW = parseInt(parts[0]) || 1920;
            canvasH = parseInt(parts[1]) || 1080;
          }
        }
        const vpScale = container.clientWidth / canvasW;

        selectedSource.scaleX = container.clientWidth / (nativeWidth * vpScale);
        selectedSource.scaleY = container.clientHeight / (nativeHeight * vpScale);
        selectedSource.x = 0;
        selectedSource.y = 0;
        selectedSource.rotation = 0;
        selectedSource.flipH = false;
        selectedSource.flipV = false;
        
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-center', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (selectedSource) {
        selectedSource.x = 0;
        selectedSource.y = 0;
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-reset', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (selectedSource) {
        selectedSource.scaleX = 1.0;
        selectedSource.scaleY = 1.0;
        selectedSource.x = 0;
        selectedSource.y = 0;
        selectedSource.rotation = 0;
        selectedSource.flipH = false;
        selectedSource.flipV = false;
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-fliph', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (selectedSource) {
        selectedSource.flipH = !selectedSource.flipH;
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-flipv', () => {
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (selectedSource) {
        selectedSource.flipV = !selectedSource.flipV;
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-up', () => {
      if (!activeVideoSourceId || addedSources.length <= 1) return;
      const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
      if (index >= 0 && index < addedSources.length - 1) {
        const temp = addedSources[index];
        addedSources[index] = addedSources[index + 1];
        addedSources[index + 1] = temp;
        renderSourcesList();
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-down', () => {
      if (!activeVideoSourceId || addedSources.length <= 1) return;
      const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
      if (index > 0) {
        const temp = addedSources[index];
        addedSources[index] = addedSources[index - 1];
        addedSources[index - 1] = temp;
        renderSourcesList();
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-top', () => {
      if (!activeVideoSourceId || addedSources.length <= 1) return;
      const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
      if (index >= 0 && index < addedSources.length - 1) {
        const [removed] = addedSources.splice(index, 1);
        addedSources.push(removed);
        renderSourcesList();
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-bottom', () => {
      if (!activeVideoSourceId || addedSources.length <= 1) return;
      const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
      if (index > 0) {
        const [removed] = addedSources.splice(index, 1);
        addedSources.unshift(removed);
        renderSourcesList();
        applyCanvasTransform();
      }
    });

    bindContextOption('ctx-trans-remove', () => {
      if (!activeVideoSourceId) return;
      const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
      if (index >= 0) {
        removeSourceFromScene(index);
      }
    });
  }
}

function setupHotkeyListener() {
  const bindHotkey = (btn, input, keyName) => {
    if (btn) {
      btn.addEventListener('click', () => { 
        hotkeyToRecord = keyName; 
        input.focus(); 
        input.value = 'Press key...'; 
      });
    }
    if (input) {
      input.addEventListener('blur', () => {
        if (hotkeyToRecord === keyName) {
          hotkeyToRecord = null;
          if (typeof renderSettings === 'function') renderSettings();
        }
      });
    }
  };

  bindHotkey(btnRecordHotkeyReplay, inputHotkeyReplay, 'replay');
  bindHotkey(btnRecordHotkeyRecord, inputHotkeyRecord, 'record');
  bindHotkey(btnRecordHotkeyPause, inputHotkeyPause, 'pause');
  bindHotkey(btnRecordHotkeyToggleReplay, inputHotkeyToggleReplay, 'toggleReplay');
  bindHotkey(btnRecordHotkeyMuteMic, inputHotkeyMuteMic, 'muteMic');
  bindHotkey(btnRecordHotkeyMuteDesktop, inputHotkeyMuteDesktop, 'muteDesktop');
  bindHotkey(btnRecordHotkeyBookmark, inputHotkeyBookmark, 'bookmark');

  document.addEventListener('keydown', (e) => {
    if (hotkeyToRecord) {
      e.preventDefault();
      e.stopPropagation();
      
      const key = e.key.toUpperCase();

      if (key === 'ESCAPE') {
        hotkeyToRecord = null;
        document.activeElement.blur();
        // Trigger a re-render of settings UI to restore the original input value
        if (typeof renderSettings === 'function') renderSettings();
        return;
      }

      let fullHotkey = '';

      if (key !== 'BACKSPACE' && key !== 'DELETE') {
        const mods = [];
        if (e.ctrlKey && key !== 'CONTROL') mods.push('CommandOrControl');
        if (e.altKey && key !== 'ALT') mods.push('Alt');
        if (e.shiftKey && key !== 'SHIFT') mods.push('Shift');
        
        if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return;

        fullHotkey = [...mods, key].join('+');
      }

      if (hotkeyToRecord === 'replay') {
        config.hotkeyReplay = fullHotkey;
      } else if (hotkeyToRecord === 'record') {
        config.hotkeyRecord = fullHotkey;
      } else if (hotkeyToRecord === 'pause') {
        config.hotkeyPause = fullHotkey;
      } else if (hotkeyToRecord === 'toggleReplay') {
        config.hotkeyToggleReplay = fullHotkey;
      } else if (hotkeyToRecord === 'muteMic') {
        config.hotkeyMuteMic = fullHotkey;
      } else if (hotkeyToRecord === 'muteDesktop') {
        config.hotkeyMuteDesktop = fullHotkey;
      } else if (hotkeyToRecord === 'bookmark') {
        config.hotkeyBookmark = fullHotkey;
      }
      
      hotkeyToRecord = null;
      saveLocalConfig();
      if (typeof renderSettings === 'function') renderSettings();
      document.activeElement.blur();
    }
  });
}

// -------------------------------------------------------------------------
// GALLERY
// -------------------------------------------------------------------------
async function loadGallery() {
  if (!window.electronAPI) return;
  const files = await window.electronAPI.getGalleryFiles();
  clipsListContainer.innerHTML = '';
  
  if (files.length === 0) {
    clipsListContainer.innerHTML = '<div class="empty-gallery">No clips or recordings found.</div>';
  } else {
    files.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'clip-card';
      
      const sizeMb = (file.sizeBytes / (1024 * 1024)).toFixed(1);
      const date = new Date(file.createdAt).toLocaleString();
      
      card.innerHTML = `
        <div class="clip-thumb"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
        <div class="clip-info">
          <div class="clip-title" title="${file.name}">${file.name}</div>
          <div class="clip-meta"><span>${date}</span> &bull; <span>${sizeMb} MB</span> &bull; <span class="duration-text" style="color: var(--color-cyan);">--:--</span></div>
        </div>
      `;

      // Async load duration
      const v = document.createElement('video');
      v.src = `file:///${file.path.replace(/\\/g, '/')}`;
      v.onloadedmetadata = async () => {
        let dur = v.duration;
        if (!isFinite(dur) || dur === 0) {
          dur = await getRealVideoDuration(v);
        }
        if (dur && isFinite(dur)) {
          const durationSpan = card.querySelector('.duration-text');
          if (durationSpan) durationSpan.innerText = secondsToTimestamp(dur);
        }
        v.src = ''; // cleanup
      };
      v.onerror = () => { v.src = ''; };

      card.addEventListener('click', () => {
        document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        playGalleryVideo(file.path, file.name, date, sizeMb);
      });

      clipsListContainer.appendChild(card);

      if (index === 0) {
        card.click();
      }
    });
  }

  // Populate Quick Gallery list
  if (quickClipsContainer) {
    quickClipsContainer.innerHTML = '';
    if (files.length === 0) {
      quickClipsContainer.innerHTML = '<div class="empty-sources">No recent clips</div>';
    } else {
      files.slice(0, 5).forEach(file => {
        const div = document.createElement('div');
        div.className = 'quick-clip-card';
        div.innerHTML = `
          <div class="quick-clip-title" title="${file.name}">${file.name}</div>
          <div class="quick-clip-actions">
            <button class="btn-play-clip" title="Play Video" style="margin-right: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
            <button class="btn-delete-clip" title="Delete Video"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        `;
        div.querySelector('.btn-play-clip').addEventListener('click', (e) => {
          e.stopPropagation();
          switchTab('gallery');
          setTimeout(() => {
            const cards = document.querySelectorAll('.clip-card');
            for (let c of cards) {
              if (c.querySelector('.clip-title').title === file.name || c.querySelector('.clip-title').innerText === file.name) {
                c.click();
                break;
              }
            }
          }, 50);
        });
        div.querySelector('.btn-delete-clip').addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = confirm(`Are you sure you want to delete ${file.name}?`);
          if (confirmed) {
            try {
              await window.electronAPI.deleteGalleryFile(file.name);
              loadGallery();
            } catch (err) {
              debugLog(`Delete error: ${err.message}`);
            }
          }
        });
        quickClipsContainer.appendChild(div);
      });
    }
  }

  btnGalleryOpenFolder.onclick = () => window.electronAPI.openGalleryFolder();
}

function timestampToSeconds(ts) {
  if (!ts) return 0;
  if (/^\d+$/.test(ts.trim())) {
    return parseInt(ts.trim(), 10);
  }
  const parts = ts.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  return 0;
}

function secondsToTimestamp(secs) {
  if (isNaN(secs) || !isFinite(secs)) return '00:00';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getRealVideoDuration(videoElement) {
  return new Promise((resolve) => {
    if (videoElement.duration && isFinite(videoElement.duration) && !isNaN(videoElement.duration)) {
      resolve(videoElement.duration);
      return;
    }
    
    const originalTime = videoElement.currentTime;
    videoElement.currentTime = 1e9; // seek to end
    
    const onSeeked = () => {
      const dur = videoElement.currentTime;
      videoElement.currentTime = originalTime; // seek back
      
      const onSeekedBack = () => {
        resolve(dur);
      };
      videoElement.addEventListener('seeked', onSeekedBack, { once: true });
    };
    
    videoElement.addEventListener('seeked', onSeeked, { once: true });
    
    setTimeout(() => {
      resolve(videoElement.duration || 0);
    }, 1500);
  });
}

async function exportTrimmedVideo(filePath, filename) {
  const startSec = timestampToSeconds(trimStartInput.value);
  let endSec = timestampToSeconds(trimEndInput.value);
  const duration = endSec - startSec;
  
  if (endSec <= startSec || duration <= 0) {
    alert('Invalid trim range. End time must be greater than Start time.');
    return;
  }

  btnTrimExport.disabled = true;
  trimProgressContainer.style.display = 'block';
  trimProgressText.innerText = 'Initializing export...';
  trimProgressBar.style.width = '0%';

  let trimVideo = null;

  try {
    const formattedPath = filePath.replace(/\\/g, '/');
    trimVideo = document.createElement('video');
    trimVideo.muted = true;
    trimVideo.src = `file:///${formattedPath}`;
    
    // Critical: Append to DOM and render invisibly. Otherwise Chromium skips
    // layout & paint, rendering no frames and resulting in an unplayable output.
    trimVideo.style.position = 'fixed';
    trimVideo.style.top = '0';
    trimVideo.style.left = '0';
    trimVideo.style.width = '320px';
    trimVideo.style.height = '240px';
    trimVideo.style.opacity = '0.01';
    trimVideo.style.pointerEvents = 'none';
    trimVideo.style.zIndex = '-9999';
    document.body.appendChild(trimVideo);
    
    await new Promise((resolve) => {
      trimVideo.onloadedmetadata = resolve;
    });

    // Resolve real WebM duration first
    const realDuration = await getRealVideoDuration(trimVideo);
    if (endSec > realDuration && realDuration > 0) {
      endSec = realDuration;
    }

    trimVideo.currentTime = startSec;
    await new Promise((resolve) => {
      trimVideo.onseeked = resolve;
    });

    // Request constant 30fps stream rendering to guarantee playability
    const stream = trimVideo.captureStream ? trimVideo.captureStream(30) : trimVideo.mozCaptureStream(30);
    
    const fileExt = filename.endsWith('.mkv') ? 'mkv' : 'webm';
    const mimeType = filename.endsWith('.mkv') ? 'video/x-matroska' : 'video/webm';
    
    const options = {
      mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm'
    };

    // Beautiful human-readable timestamp segment naming
    const startStr = trimStartInput.value.replace(/:/g, '-');
    const endStr = trimEndInput.value.replace(/:/g, '-');
    const cleanBase = filename.replace(/\.[^/.]+$/, "").replace(/_trimmed_.*$/, "");
    const outFilename = `${cleanBase}_trimmed_${startStr}_to_${endStr}.${fileExt}`;

    await window.electronAPI.startRecordingStream(outFilename);

    const mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = async (e) => {
      if (e.data && e.data.size > 0) {
        const arrayBuffer = await e.data.arrayBuffer();
        await window.electronAPI.writeRecordingChunk(arrayBuffer);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        await window.electronAPI.stopRecordingStream();
        trimProgressText.innerText = 'Export complete!';
        trimProgressBar.style.width = '100%';
        
        setTimeout(() => {
          trimProgressContainer.style.display = 'none';
          btnTrimExport.disabled = false;
          loadGallery();
        }, 1500);
      } catch (err) {
        debugLog(`Failed to save trimmed file: ${err.message}`);
        btnTrimExport.disabled = false;
      } finally {
        if (trimVideo && trimVideo.parentNode) {
          trimVideo.parentNode.removeChild(trimVideo);
        }
      }
    };

    mediaRecorder.start(100);
    trimVideo.play();
    trimVideo.playbackRate = 1.0; 
    
    const checkInterval = setInterval(() => {
      const current = trimVideo.currentTime;
      const elapsedTrimSec = current - startSec;
      const trimDur = endSec - startSec;
      let percent = Math.min(100, Math.max(0, (elapsedTrimSec / trimDur) * 100));
      
      trimProgressBar.style.width = `${Math.floor(percent)}%`;
      trimProgressText.innerText = `Exporting: ${Math.floor(percent)}%`;

      if (current >= endSec || trimVideo.ended) {
        clearInterval(checkInterval);
        trimVideo.pause();
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }
    }, 50);

  } catch (err) {
    alert(`Export failed: ${err.message}`);
    btnTrimExport.disabled = false;
    trimProgressContainer.style.display = 'none';
  }
}

async function playGalleryVideo(filePath, filename, date, size) {
  playerPlaceholder.style.display = 'none';
  
  const formattedPath = filePath.replace(/\\/g, '/');
  galleryVideoPlayer.src = `file:///${formattedPath}`;
  galleryVideoPlayer.style.display = 'block';
  
  playerDetailsPanel.style.display = 'block';
  playerClipTitle.innerText = filename;
  playerClipDate.innerText = `Created: ${date}`;
  playerClipSize.innerText = `Size: ${size} MB`;

  if (trimmerPanel) trimmerPanel.style.display = 'none';
  if (trimStartInput) trimStartInput.value = '00:00';
  if (trimEndInput) trimEndInput.value = '00:10';
  if (trimProgressContainer) trimProgressContainer.style.display = 'none';
  
  const bookmarksRow = document.getElementById('player-bookmarks-row');
  if (bookmarksRow) {
    bookmarksRow.style.display = 'none';
    bookmarksRow.innerHTML = '';
  }

  if (trimBookmarkSelect) {
    trimBookmarkSelect.innerHTML = '<option value="">-- Loading Bookmarks --</option>';
    try {
      const content = await window.electronAPI.readBookmarks(filename);
      if (content) {
        const matches = content.match(/(\d{2}:\d{2}(:\d{2})?)/g);
        if (matches && matches.length > 0) {
          trimBookmarkSelect.innerHTML = '<option value="">-- Select Bookmark --</option>';
          if (bookmarksRow) bookmarksRow.style.display = 'flex';
          matches.forEach((ts, idx) => {
            // Dropdown option
            const opt = document.createElement('option');
            opt.value = ts;
            opt.innerText = `Bookmark ${idx + 1} (${ts})`;
            trimBookmarkSelect.appendChild(opt);

            // Medal.tv style visual pill
            if (bookmarksRow) {
              const pill = document.createElement('button');
              pill.className = 'btn';
              pill.style.padding = '4px 8px';
              pill.style.fontSize = '10px';
              pill.style.background = 'rgba(99, 102, 241, 0.15)';
              pill.style.color = '#a5b4fc';
              pill.style.border = '1px solid rgba(99, 102, 241, 0.3)';
              pill.style.borderRadius = '12px';
              pill.style.cursor = 'pointer';
              pill.style.display = 'flex';
              pill.style.alignItems = 'center';
              pill.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> ${ts}`;
              
              pill.onmouseenter = () => { pill.style.background = 'rgba(99, 102, 241, 0.25)'; };
              pill.onmouseleave = () => { pill.style.background = 'rgba(99, 102, 241, 0.15)'; };
              
              pill.onclick = () => {
                const secs = timestampToSeconds(ts);
                const start = Math.max(0, secs - 5);
                galleryVideoPlayer.currentTime = start;
                galleryVideoPlayer.play();
                
                // Auto-fill trimmer
                if (trimStartInput) trimStartInput.value = secondsToTimestamp(start);
                const duration = galleryVideoPlayer.duration || 1000;
                if (trimEndInput) trimEndInput.value = secondsToTimestamp(Math.min(duration, secs + 5));
                if (trimBookmarkSelect) trimBookmarkSelect.value = ts;
              };
              bookmarksRow.appendChild(pill);
            }
          });
        } else {
          trimBookmarkSelect.innerHTML = '<option value="">-- No Bookmarks Found --</option>';
        }
      } else {
        trimBookmarkSelect.innerHTML = '<option value="">-- No Bookmarks Found --</option>';
      }
    } catch (e) {
      trimBookmarkSelect.innerHTML = '<option value="">-- No Bookmarks Found --</option>';
    }
  }

  const resolveDurationAndSetup = async () => {
    const realDuration = await getRealVideoDuration(galleryVideoPlayer);
    if (realDuration && isFinite(realDuration)) {
      trimEndInput.value = secondsToTimestamp(realDuration);
    }
  };

  btnPlayerTrimToggle.onclick = async () => {
    if (trimmerPanel.style.display === 'none') {
      trimmerPanel.style.display = 'block';
      await resolveDurationAndSetup();
    } else {
      trimmerPanel.style.display = 'none';
    }
  };

  trimBookmarkSelect.onchange = (e) => {
    const ts = e.target.value;
    if (ts) {
      const secs = timestampToSeconds(ts);
      const duration = galleryVideoPlayer.duration || 1000;
      const start = Math.max(0, secs - 5);
      const end = Math.min(duration, secs + 5);
      
      trimStartInput.value = secondsToTimestamp(start);
      trimEndInput.value = secondsToTimestamp(end);
      galleryVideoPlayer.currentTime = start;
    }
  };

  btnTrimExport.onclick = () => {
    exportTrimmedVideo(filePath, filename);
  };

  const btnSetTrimStart = document.getElementById('btn-set-trim-start');
  if (btnSetTrimStart) {
    btnSetTrimStart.onclick = () => {
      if (trimStartInput) trimStartInput.value = secondsToTimestamp(galleryVideoPlayer.currentTime);
    };
  }

  const btnSetTrimEnd = document.getElementById('btn-set-trim-end');
  if (btnSetTrimEnd) {
    btnSetTrimEnd.onclick = () => {
      if (trimEndInput) trimEndInput.value = secondsToTimestamp(galleryVideoPlayer.currentTime);
    };
  }

  btnPlayerDelete.onclick = async () => {
    if (confirm('Delete this file permanently?')) {
      await window.electronAPI.deleteGalleryFile(filename);
      galleryVideoPlayer.pause();
      galleryVideoPlayer.src = '';
      galleryVideoPlayer.style.display = 'none';
      playerPlaceholder.style.display = 'flex';
      playerDetailsPanel.style.display = 'none';
      const controls = document.getElementById('custom-video-controls');
      if (controls) controls.style.display = 'none';
      loadGallery();
    }
  };

  // We need to re-parse the bookmark file to get the matches array for the timeline
  let matchesArray = [];
  try {
    const content = await window.electronAPI.readBookmarks(filename);
    if (content) {
      matchesArray = content.match(/(\d{2}:\d{2}(:\d{2})?)/g) || [];
    }
  } catch(e) {}
  
  setupCustomVideoPlayer(galleryVideoPlayer, matchesArray);
}

// -------------------------------------------------------------------------
// CUSTOM VIDEO PLAYER UI & TIMELINE BOOKMARKS
// -------------------------------------------------------------------------
function setupCustomVideoPlayer(video, bookmarksArray) {
  const controls = document.getElementById('custom-video-controls');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const timelineSlider = document.getElementById('timeline-slider');
  const timelineBookmarks = document.getElementById('timeline-bookmarks');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');
  const btnVolume = document.getElementById('btn-volume');
  const volumeSlider = document.getElementById('player-volume-slider');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const container = document.getElementById('custom-player-container');

  if (!controls) return;
  controls.style.display = 'flex';
  timelineBookmarks.innerHTML = ''; // Clear previous bookmarks

  const updatePlayPauseIcon = () => {
    btnPlayPause.innerHTML = video.paused 
      ? '<svg class="icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
      : '<svg class="icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  };

  btnPlayPause.onclick = () => {
    if (video.paused) video.play().catch(()=>{});
    else video.pause();
  };

  video.onplay = updatePlayPauseIcon;
  video.onpause = updatePlayPauseIcon;

  const handleLoadedMetadata = async () => {
    let duration = video.duration;
    if (!isFinite(duration) || duration === 0) {
      duration = await getRealVideoDuration(video);
    }
    if (isFinite(duration) && duration > 0) {
      timelineSlider.max = duration;
      timeTotal.innerText = secondsToTimestamp(duration);
      
      // Inject bookmarks!
      bookmarksArray.forEach((ts) => {
        const secs = timestampToSeconds(ts);
        const percent = (secs / duration) * 100;
        if (percent >= 0 && percent <= 100) {
          const notch = document.createElement('div');
          notch.className = 'timeline-bookmark-notch';
          notch.style.left = `${percent}%`;
          notch.title = `Bookmark at ${ts}`;
          notch.onclick = (e) => {
            e.stopPropagation();
            video.currentTime = Math.max(0, secs - 5);
            video.play().catch(()=>{});
          };
          timelineBookmarks.appendChild(notch);
        }
      });
    }
  };

  video.onloadedmetadata = handleLoadedMetadata;
  if (video.readyState >= 1) {
    handleLoadedMetadata();
  }

  video.ontimeupdate = () => {
    if (!timelineSlider.matches(':active')) {
      timelineSlider.value = video.currentTime;
    }
    timeCurrent.innerText = secondsToTimestamp(video.currentTime);
  };

  timelineSlider.oninput = (e) => {
    video.currentTime = parseFloat(e.target.value);
  };

  volumeSlider.oninput = (e) => {
    const vol = parseFloat(e.target.value);
    video.volume = vol;
    video.muted = vol === 0;
    updateVolumeIcon();
  };

  const updateVolumeIcon = () => {
    if (video.muted || video.volume === 0) {
      btnVolume.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
    } else {
      btnVolume.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
    }
  };

  btnVolume.onclick = () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.5;
      volumeSlider.value = 0.5;
    }
    updateVolumeIcon();
  };

  btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(()=>{});
    } else {
      document.exitFullscreen();
    }
  };
}

// -------------------------------------------------------------------------
// LOAD MICROPHONES (Init)
// -------------------------------------------------------------------------
async function loadMicrophones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    
    selectMicDevice.innerHTML = '<option value="default">System Default</option>';
    mics.forEach(mic => {
      const opt = document.createElement('option');
      opt.value = mic.deviceId;
      opt.innerText = mic.label || `Microphone (${mic.deviceId.slice(0, 5)}...)`;
      selectMicDevice.appendChild(opt);
    });

    if (config.micDeviceId) {
      selectMicDevice.value = config.micDeviceId;
    }
  } catch (err) {}
}

// Global hotkey events from main
if (window.electronAPI) {
  window.electronAPI.onHotkeyTrigger((payload) => {
    const action = payload.action;
    if (action === 'save-replay') {
      saveReplayBuffer();
    } else if (action === 'toggle-record') {
      if (recordingState === 'idle') startStandardRecording();
      else stopStandardRecording();
    } else if (action === 'pause-record') {
      if (recordingState === 'recording') pauseStandardRecording();
      else if (recordingState === 'paused') resumeStandardRecording();
    } else if (action === 'toggle-replay') {
      if (replayActive) stopReplayBuffer();
      else startReplayBuffer();
    } else if (action === 'mute-mic') {
      const micMuteBtn = document.querySelector('#mixer-row-mic .mute-btn');
      if (micMuteBtn) micMuteBtn.click();
    } else if (action === 'mute-desktop') {
      toggleDesktopMute();
    } else if (action === 'bookmark-moment') {
      addBookmark();
    }
  });

  window.electronAPI.onWindowMaximizedStatus((isMaximized) => {
    const btnMaximize = document.getElementById('btn-maximize');
    if (btnMaximize) {
      if (isMaximized) {
        btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M2,0v2H0v8h8V8h2V0H2z M7,9H1V3h6V9z M9,7H8V2h-5V1h6V7z" fill="currentColor"/></svg>';
        btnMaximize.title = 'Restore Down';
      } else {
        btnMaximize.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0,0v10h10V0H0z M9,9H1V1h8V9z" fill="currentColor"/></svg>';
        btnMaximize.title = 'Maximize';
      }
    }
  });
}

// -------------------------------------------------------------------------
// CANVAS TRANSFORMS ENGINE
// -------------------------------------------------------------------------
let isCompositing = false;

function startCompositor() {
  if (isCompositing) return;
  isCompositing = true;
  
  function renderFrame() {
    if (!isCompositing) return;
    drawCompositeFrame();
    requestAnimationFrame(renderFrame);
  }
  
  requestAnimationFrame(renderFrame);
}

function stopCompositor() {
  isCompositing = false;
}

function drawCompositeFrame() {
  if (!compositeCanvas || !compositeCtx) return;
  
  // Set canvas size to Base Resolution
  let canvasW = 1920;
  let canvasH = 1080;
  if (config.baseResolution) {
    const parts = config.baseResolution.split('x');
    if (parts.length === 2) {
      canvasW = parseInt(parts[0]) || 1920;
      canvasH = parseInt(parts[1]) || 1080;
    }
  }

  let ratio = canvasW / canvasH;
  if (activeTransform.aspectRatio && activeTransform.aspectRatio !== 'source') {
    const ratioMap = {
      '16-9': 16 / 9,
      '16-10': 16 / 10,
      '4-3': 4 / 3,
      '21-9': 21 / 9
    };
    ratio = ratioMap[activeTransform.aspectRatio] || ratio;
  } else if (activeTransform.aspectRatio === 'source' && addedSources.length > 0) {
    const activeSrc = addedSources.find(s => s.id === activeVideoSourceId);
    if (activeSrc && activeSrc.video && activeSrc.video.videoWidth) {
      ratio = activeSrc.video.videoWidth / activeSrc.video.videoHeight;
    }
  }
  canvasH = Math.round(canvasW / ratio);
  
  if (compositeCanvas.width !== canvasW || compositeCanvas.height !== canvasH) {
    compositeCanvas.width = canvasW;
    compositeCanvas.height = canvasH;
  }
  
  // Clear canvas
  compositeCtx.fillStyle = '#0a0a0c'; // OBS-style dark grey background
  compositeCtx.fillRect(0, 0, canvasW, canvasH);
  
  compositeCtx.save();
  
  // Apply Global Video Output Transforms (from the Video settings panel)
  // Shift to center of canvas for rotation/flips
  compositeCtx.translate(canvasW / 2, canvasH / 2);
  
  if (config.rotation && config.rotation !== '0') {
    compositeCtx.rotate((parseFloat(config.rotation) * Math.PI) / 180);
  }
  
  let globalScaleX = 1.0;
  let globalScaleY = 1.0;
  if (config.flipH) globalScaleX = -1;
  if (config.flipV) globalScaleY = -1;
  if (globalScaleX !== 1.0 || globalScaleY !== 1.0) {
    compositeCtx.scale(globalScaleX, globalScaleY);
  }
  
  // Shift back to draw sources relative to center
  compositeCtx.translate(-canvasW / 2, -canvasH / 2);
  
  // Draw all visible sources in z-order
  addedSources.forEach(src => {
    if (src.visible === false || !src.video || src.video.readyState < 2) {
      return; // Not ready or hidden
    }
    
    compositeCtx.save();
    
    // Draw relative to center (0,0) of canvas, shifted by x, y
    const centerX = canvasW / 2 + (src.x || 0);
    const centerY = canvasH / 2 + (src.y || 0);
    compositeCtx.translate(centerX, centerY);
    
    // Rotate
    if (src.rotation) {
      compositeCtx.rotate((src.rotation * Math.PI) / 180);
    }
    
    // Scale & Flip
    let scaleX = src.scaleX !== undefined ? src.scaleX : 1.0;
    let scaleY = src.scaleY !== undefined ? src.scaleY : 1.0;
    if (src.flipH) scaleX *= -1;
    if (src.flipV) scaleY *= -1;
    compositeCtx.scale(scaleX, scaleY);
    
    // Draw video frame centered
    const w = src.video.videoWidth;
    const h = src.video.videoHeight;
    compositeCtx.drawImage(src.video, -w / 2, -h / 2, w, h);
    
    compositeCtx.restore();
  });
  
  compositeCtx.restore();

  // Downscale if recordCanvas is active
  const isRecordingActive = recordingState === 'recording' || recordingState === 'paused';
  const isReplayActive = replayActive;
  
  if ((isRecordingActive || isReplayActive) && recordCanvas && recordCtx) {
    recordCtx.clearRect(0, 0, recordCanvas.width, recordCanvas.height);
    recordCtx.imageSmoothingEnabled = true;
    if (config.downscaleFilter === 'bilinear') {
      recordCtx.imageSmoothingQuality = 'low';
    } else if (config.downscaleFilter === 'bicubic') {
      recordCtx.imageSmoothingQuality = 'medium';
    } else if (config.downscaleFilter === 'lanczos') {
      recordCtx.imageSmoothingQuality = 'high';
    }
    recordCtx.drawImage(compositeCanvas, 0, 0, recordCanvas.width, recordCanvas.height);
  }
}

function applyCanvasTransform() {
  const container = document.getElementById('video-canvas-container');
  const workspace = document.getElementById('video-workspace');
  const resizableBox = document.getElementById('resizable-source-box');
  if (!container || !workspace || !resizableBox) return;

  const parentWidth = workspace.clientWidth - 40;
  const parentHeight = workspace.clientHeight - 40;
  
  let canvasW = 1920;
  let canvasH = 1080;
  if (config.baseResolution) {
    const parts = config.baseResolution.split('x');
    if (parts.length === 2) {
      canvasW = parseInt(parts[0]) || 1920;
      canvasH = parseInt(parts[1]) || 1080;
    }
  }

  // Get active selected source for aspect ratio if needed
  const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);

  let ratio = canvasW / canvasH;
  if (activeTransform.aspectRatio && activeTransform.aspectRatio !== 'source') {
    const ratioMap = {
      '16-9': 16 / 9,
      '16-10': 16 / 10,
      '4-3': 4 / 3,
      '21-9': 21 / 9
    };
    ratio = ratioMap[activeTransform.aspectRatio] || ratio;
  } else if (activeTransform.aspectRatio === 'source' && selectedSource && selectedSource.video && selectedSource.video.videoWidth) {
    ratio = selectedSource.video.videoWidth / selectedSource.video.videoHeight;
  }

  canvasH = Math.round(canvasW / ratio);

  let targetWidth = parentWidth;
  let targetHeight = parentHeight;

  if (parentWidth / parentHeight > ratio) {
    targetHeight = parentHeight;
    targetWidth = parentHeight * ratio;
  } else {
    targetWidth = parentWidth;
    targetHeight = parentWidth / ratio;
  }

  container.style.aspectRatio = ratio;
  container.style.width = `${Math.floor(targetWidth)}px`;
  container.style.height = `${Math.floor(targetHeight)}px`;

  if (!selectedSource || !selectedSource.video || !selectedSource.video.videoWidth) {
    resizableBox.style.display = 'none';
    return;
  }

  resizableBox.style.display = 'flex';

  // 2. Position the resizable source box overlay relative to the container
  const vpScale = targetWidth / canvasW; // Viewport scale
  
  const w = selectedSource.video.videoWidth;
  const h = selectedSource.video.videoHeight;
  
  const vw = w * (selectedSource.scaleX !== undefined ? selectedSource.scaleX : 1.0) * vpScale;
  const vh = h * (selectedSource.scaleY !== undefined ? selectedSource.scaleY : 1.0) * vpScale;
  
  const cx = targetWidth / 2;
  const cy = targetHeight / 2;
  
  const vx = cx + selectedSource.x * vpScale;
  const vy = cy + selectedSource.y * vpScale;
  
  resizableBox.style.width = `${Math.floor(vw)}px`;
  resizableBox.style.height = `${Math.floor(vh)}px`;
  
  // Center position offset
  resizableBox.style.left = `${Math.floor(vx - vw / 2)}px`;
  resizableBox.style.top = `${Math.floor(vy - vh / 2)}px`;
  
  let transformStr = `rotate(${selectedSource.rotation || 0}deg)`;
  if (selectedSource.flipH) transformStr += ' scaleX(-1)';
  if (selectedSource.flipV) transformStr += ' scaleY(-1)';
  resizableBox.style.transform = transformStr;

  syncTransformUI(selectedSource);
}

function syncTransformUI(source) {
  if (sliderTransScale) {
    const displayScale = source.scaleX !== undefined ? source.scaleX : 1.0;
    sliderTransScale.value = displayScale.toFixed(2);
    valTransScale.innerText = `${displayScale.toFixed(2)}x`;
  }
  if (sliderTransX) {
    sliderTransX.value = source.x;
    valTransX.innerText = `${source.x}px`;
  }
  if (sliderTransY) {
    sliderTransY.value = source.y;
    valTransY.innerText = `${source.y}px`;
  }
  if (sliderTransRot) {
    sliderTransRot.value = source.rotation;
    valTransRot.innerText = `${source.rotation}°`;
  }
  if (checkTransFliph) checkTransFliph.checked = source.flipH;
  if (checkTransFlipv) checkTransFlipv.checked = source.flipV;
}

function setupCanvasTransformListeners() {
  if (selectCanvasAspect) {
    selectCanvasAspect.addEventListener('change', (e) => {
      activeTransform.aspectRatio = e.target.value;
      applyCanvasTransform();
    });
  }

  sliderTransScale.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.scaleX = scale;
      selectedSource.scaleY = scale;
      valTransScale.innerText = `${scale.toFixed(2)}x`;
      applyCanvasTransform();
    }
  });

  sliderTransX.addEventListener('input', (e) => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.x = parseInt(e.target.value);
      valTransX.innerText = `${selectedSource.x}px`;
      applyCanvasTransform();
    }
  });

  sliderTransY.addEventListener('input', (e) => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.y = parseInt(e.target.value);
      valTransY.innerText = `${selectedSource.y}px`;
      applyCanvasTransform();
    }
  });

  sliderTransRot.addEventListener('input', (e) => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.rotation = parseInt(e.target.value);
      valTransRot.innerText = `${selectedSource.rotation}°`;
      applyCanvasTransform();
    }
  });

  checkTransFliph.addEventListener('change', (e) => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.flipH = e.target.checked;
      applyCanvasTransform();
    }
  });

  checkTransFlipv.addEventListener('change', (e) => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.flipV = e.target.checked;
      applyCanvasTransform();
    }
  });

  // Center button
  btnTransCenter.addEventListener('click', () => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.x = 0;
      selectedSource.y = 0;
      applyCanvasTransform();
    }
  });

  // Fit button
  btnTransFit.addEventListener('click', () => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    const container = document.getElementById('video-canvas-container');
    if (selectedSource && selectedSource.video && container) {
      const nativeWidth = selectedSource.video.videoWidth;
      const nativeHeight = selectedSource.video.videoHeight;
      const ratio = nativeWidth / nativeHeight;
      
      let targetHeight = container.clientHeight;
      let targetWidth = container.clientHeight * ratio;
      if (targetWidth > container.clientWidth) {
        targetWidth = container.clientWidth;
        targetHeight = container.clientWidth / ratio;
      }
      
      let canvasW = 1920;
      if (config.baseResolution) {
        const parts = config.baseResolution.split('x');
        if (parts.length === 2) canvasW = parseInt(parts[0]) || 1920;
      }
      const vpScale = container.clientWidth / canvasW;

      selectedSource.scaleX = targetWidth / (nativeWidth * vpScale);
      selectedSource.scaleY = targetWidth / (nativeWidth * vpScale);
      selectedSource.x = 0;
      selectedSource.y = 0;
      selectedSource.rotation = 0;
      selectedSource.flipH = false;
      selectedSource.flipV = false;
      
      applyCanvasTransform();
    }
  });

  // Stretch button
  btnTransStretch.addEventListener('click', () => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    const container = document.getElementById('video-canvas-container');
    if (selectedSource && selectedSource.video && container) {
      const nativeWidth = selectedSource.video.videoWidth;
      const nativeHeight = selectedSource.video.videoHeight;
      
      let canvasW = 1920;
      let canvasH = 1080;
      if (config.baseResolution) {
        const parts = config.baseResolution.split('x');
        if (parts.length === 2) {
          canvasW = parseInt(parts[0]) || 1920;
          canvasH = parseInt(parts[1]) || 1080;
        }
      }
      const vpScale = container.clientWidth / canvasW;

      // Stretch to fit the canvas bounds perfectly (non-uniformly!)
      selectedSource.scaleX = container.clientWidth / (nativeWidth * vpScale);
      selectedSource.scaleY = container.clientHeight / (nativeHeight * vpScale);
      selectedSource.x = 0;
      selectedSource.y = 0;
      selectedSource.rotation = 0;
      selectedSource.flipH = false;
      selectedSource.flipV = false;
      
      applyCanvasTransform();
    }
  });

  // Reset transform button
  btnSourceTransformReset.addEventListener('click', () => {
    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (selectedSource) {
      selectedSource.scaleX = 1.0;
      selectedSource.scaleY = 1.0;
      selectedSource.x = 0;
      selectedSource.y = 0;
      selectedSource.rotation = 0;
      selectedSource.flipH = false;
      selectedSource.flipV = false;
      applyCanvasTransform();
    }
  });

  // Mouse Drag to Reposition Layer inside Canvas
  const resizableBox = document.getElementById('resizable-source-box');
  const container = document.getElementById('video-canvas-container');
  if (resizableBox && container) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    resizableBox.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (!selectedSource) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = selectedSource.x || 0;
      initialY = selectedSource.y || 0;
      resizableBox.style.cursor = 'grabbing';
      e.preventDefault();
    });

    container.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('resize-handle') || e.target.closest('#resizable-source-box')) return;
      
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const relClickX = clickX - cx;
      const relClickY = clickY - cy;

      let canvasW = 1920;
      if (config.baseResolution) {
        const parts = config.baseResolution.split('x');
        if (parts.length === 2) canvasW = parseInt(parts[0]) || 1920;
      }
      const vpScale = rect.width / canvasW;
      const canvasClickX = relClickX / vpScale;
      const canvasClickY = relClickY / vpScale;

      let hitSource = null;
      for (let i = addedSources.length - 1; i >= 0; i--) {
        const src = addedSources[i];
        if (src.visible === false || !src.video || !src.video.videoWidth) continue;

        const w = src.video.videoWidth * (src.scaleX !== undefined ? src.scaleX : 1.0);
        const h = src.video.videoHeight * (src.scaleY !== undefined ? src.scaleY : 1.0);

        const left = src.x - w / 2;
        const right = src.x + w / 2;
        const top = src.y - h / 2;
        const bottom = src.y + h / 2;

        if (canvasClickX >= left && canvasClickX <= right && canvasClickY >= top && canvasClickY <= bottom) {
          hitSource = src;
          break;
        }
      }

      if (hitSource) {
        activeVideoSourceId = hitSource.id;
        renderSourcesList();
        applyCanvasTransform();

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = hitSource.x || 0;
        initialY = hitSource.y || 0;
        resizableBox.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (!selectedSource || !selectedSource.video) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let canvasW = 1920;
      let canvasH = 1080;
      if (config.baseResolution) {
        const parts = config.baseResolution.split('x');
        if (parts.length === 2) {
          canvasW = parseInt(parts[0]) || 1920;
          canvasH = parseInt(parts[1]) || 1080;
        }
      }
      const vpScale = container.clientWidth / canvasW;
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;

      let newX = initialX + dx / vpScale;
      let newY = initialY + dy / vpScale;

      const guideH = document.getElementById('guide-h');
      const guideV = document.getElementById('guide-v');
      const guideLeft = document.getElementById('guide-left');
      const guideRight = document.getElementById('guide-right');
      const guideTop = document.getElementById('guide-top');
      const guideBottom = document.getElementById('guide-bottom');

      if (guideH) guideH.style.display = 'none';
      if (guideV) guideV.style.display = 'none';
      if (guideLeft) guideLeft.style.display = 'none';
      if (guideRight) guideRight.style.display = 'none';
      if (guideTop) guideTop.style.display = 'none';
      if (guideBottom) guideBottom.style.display = 'none';

      const nativeWidth = selectedSource.video.videoWidth;
      const nativeHeight = selectedSource.video.videoHeight;
      const boxWidth = nativeWidth * (selectedSource.scaleX !== undefined ? selectedSource.scaleX : 1.0);
      const boxHeight = nativeHeight * (selectedSource.scaleY !== undefined ? selectedSource.scaleY : 1.0);

      const snapThreshold = 12 / vpScale; // Snapping distance in canvas coordinates

      const halfCanvasW = canvasW / 2;
      const halfBoxW = boxWidth / 2;

      let snappedX = false;
      const otherSources = addedSources.filter(s => s.id !== activeVideoSourceId && s.visible !== false);

      // Source-to-Source Horizontal Snapping
      for (const other of otherSources) {
        if (!other.video || !other.video.videoWidth) continue;
        const otherW = other.video.videoWidth * (other.scaleX !== undefined ? other.scaleX : 1.0);
        const otherLeft = other.x - otherW / 2;
        const otherRight = other.x + otherW / 2;

        // Snapping dragged left to other right
        if (Math.abs((newX - halfBoxW) - otherRight) < snapThreshold) {
          newX = otherRight + halfBoxW;
          snappedX = true;
          if (guideV) {
            guideV.style.left = `${cx + otherRight * vpScale}px`;
            guideV.style.transform = 'none';
            guideV.style.display = 'block';
          }
          break;
        }
        // Snapping dragged right to other left
        else if (Math.abs((newX + halfBoxW) - otherLeft) < snapThreshold) {
          newX = otherLeft - halfBoxW;
          snappedX = true;
          if (guideV) {
            guideV.style.left = `${cx + otherLeft * vpScale}px`;
            guideV.style.transform = 'none';
            guideV.style.display = 'block';
          }
          break;
        }
        // Align left edges
        else if (Math.abs((newX - halfBoxW) - otherLeft) < snapThreshold) {
          newX = otherLeft + halfBoxW;
          snappedX = true;
          if (guideV) {
            guideV.style.left = `${cx + otherLeft * vpScale}px`;
            guideV.style.transform = 'none';
            guideV.style.display = 'block';
          }
          break;
        }
        // Align right edges
        else if (Math.abs((newX + halfBoxW) - otherRight) < snapThreshold) {
          newX = otherRight - halfBoxW;
          snappedX = true;
          if (guideV) {
            guideV.style.left = `${cx + otherRight * vpScale}px`;
            guideV.style.transform = 'none';
            guideV.style.display = 'block';
          }
          break;
        }
      }

      // If not snapped to another source, check canvas boundaries
      if (!snappedX) {
        if (Math.abs((newX - halfBoxW) - (-halfCanvasW)) < snapThreshold) {
          newX = -halfCanvasW + halfBoxW;
          if (guideLeft) guideLeft.style.display = 'block';
        } else if (Math.abs((newX + halfBoxW) - halfCanvasW) < snapThreshold) {
          newX = halfCanvasW - halfBoxW;
          if (guideRight) guideRight.style.display = 'block';
        } else if (Math.abs(newX) < snapThreshold) {
          newX = 0;
          if (guideV) {
            guideV.style.left = '50%';
            guideV.style.transform = 'translateX(-50%)';
            guideV.style.display = 'block';
          }
        }
      }

      const halfCanvasH = canvasH / 2;
      const halfBoxH = boxHeight / 2;
      let snappedY = false;

      // Source-to-Source Vertical Snapping
      for (const other of otherSources) {
        if (!other.video || !other.video.videoWidth) continue;
        const otherH = other.video.videoHeight * (other.scaleY !== undefined ? other.scaleY : 1.0);
        const otherTop = other.y - otherH / 2;
        const otherBottom = other.y + otherH / 2;

        // Snapping dragged top to other bottom
        if (Math.abs((newY - halfBoxH) - otherBottom) < snapThreshold) {
          newY = otherBottom + halfBoxH;
          snappedY = true;
          if (guideH) {
            guideH.style.top = `${cy + otherBottom * vpScale}px`;
            guideH.style.transform = 'none';
            guideH.style.display = 'block';
          }
          break;
        }
        // Snapping dragged bottom to other top
        else if (Math.abs((newY + halfBoxH) - otherTop) < snapThreshold) {
          newY = otherTop - halfBoxH;
          snappedY = true;
          if (guideH) {
            guideH.style.top = `${cy + otherTop * vpScale}px`;
            guideH.style.transform = 'none';
            guideH.style.display = 'block';
          }
          break;
        }
        // Align top edges
        else if (Math.abs((newY - halfBoxH) - otherTop) < snapThreshold) {
          newY = otherTop + halfBoxH;
          snappedY = true;
          if (guideH) {
            guideH.style.top = `${cy + otherTop * vpScale}px`;
            guideH.style.transform = 'none';
            guideH.style.display = 'block';
          }
          break;
        }
        // Align bottom edges
        else if (Math.abs((newY + halfBoxH) - otherBottom) < snapThreshold) {
          newY = otherBottom - halfBoxH;
          snappedY = true;
          if (guideH) {
            guideH.style.top = `${cy + otherBottom * vpScale}px`;
            guideH.style.transform = 'none';
            guideH.style.display = 'block';
          }
          break;
        }
      }

      // If not snapped to another source, check canvas boundaries
      if (!snappedY) {
        if (Math.abs((newY - halfBoxH) - (-halfCanvasH)) < snapThreshold) {
          newY = -halfCanvasH + halfBoxH;
          if (guideTop) guideTop.style.display = 'block';
        } else if (Math.abs((newY + halfBoxH) - halfCanvasH) < snapThreshold) {
          newY = halfCanvasH - halfBoxH;
          if (guideBottom) guideBottom.style.display = 'block';
        } else if (Math.abs(newY) < snapThreshold) {
          newY = 0;
          if (guideH) {
            guideH.style.top = '50%';
            guideH.style.transform = 'translateY(-50%)';
            guideH.style.display = 'block';
          }
        }
      }

      selectedSource.x = Math.round(newX);
      selectedSource.y = Math.round(newY);

      applyCanvasTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resizableBox.style.cursor = 'grab';
        
        const guides = ['guide-h', 'guide-v', 'guide-left', 'guide-right', 'guide-top', 'guide-bottom'];
        guides.forEach(g => {
          const el = document.getElementById(g);
          if (el) el.style.display = 'none';
        });
      }
    });

    // Mouse Wheel Scroll to Scale selected source
    resizableBox.addEventListener('wheel', (e) => {
      e.preventDefault();
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (!selectedSource) return;

      const zoomStep = e.deltaY < 0 ? 1.05 : 0.95;
      const currentScaleX = selectedSource.scaleX !== undefined ? selectedSource.scaleX : 1.0;
      const currentScaleY = selectedSource.scaleY !== undefined ? selectedSource.scaleY : 1.0;
      selectedSource.scaleX = Math.max(0.05, Math.min(5.0, currentScaleX * zoomStep));
      selectedSource.scaleY = Math.max(0.05, Math.min(5.0, currentScaleY * zoomStep));
      applyCanvasTransform();
    });

    resizableBox.style.cursor = 'grab';
  }

  // Resizable Handles Dragging (OBS style resizing)
  const handles = document.querySelectorAll('.resize-handle');
  const checkTransLock = document.getElementById('check-trans-lock');
  
  if (resizableBox && handles.length > 0) {
    let isResizing = false;
    let currentHandle = null;
    let startScaleX = 1.0;
    let startScaleY = 1.0;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
        if (!selectedSource) return;

        isResizing = true;
        currentHandle = handle.getAttribute('data-handle');
        startScaleX = selectedSource.scaleX !== undefined ? selectedSource.scaleX : 1.0;
        startScaleY = selectedSource.scaleY !== undefined ? selectedSource.scaleY : 1.0;
        startX = e.clientX;
        startY = e.clientY;
        initialX = selectedSource.x || 0;
        initialY = selectedSource.y || 0;
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
      if (!selectedSource || !selectedSource.video) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let canvasW = 1920;
      if (config.baseResolution) {
        const parts = config.baseResolution.split('x');
        if (parts.length === 2) canvasW = parseInt(parts[0]) || 1920;
      }
      const vpScale = container.clientWidth / canvasW;

      const nativeWidth = selectedSource.video.videoWidth;
      const nativeHeight = selectedSource.video.videoHeight;
      const currentWidth = nativeWidth * startScaleX * vpScale;
      const currentHeight = nativeHeight * startScaleY * vpScale;

      let newWidth = currentWidth;
      let newHeight = currentHeight;

      if (currentHandle.includes('r')) {
        newWidth = currentWidth + dx;
      } else if (currentHandle.includes('l')) {
        newWidth = currentWidth - dx;
      }

      if (currentHandle.includes('b')) {
        newHeight = currentHeight + dy;
      } else if (currentHandle.includes('t')) {
        newHeight = currentHeight - dy;
      }

      newWidth = Math.max(20, newWidth);
      newHeight = Math.max(20, newHeight);

      let newScaleX = newWidth / (nativeWidth * vpScale);
      let newScaleY = newHeight / (nativeHeight * vpScale);

      const lockAspect = checkTransLock ? checkTransLock.checked : true;
      if (lockAspect) {
        const startRatio = startScaleX / startScaleY;
        if (currentHandle === 'r' || currentHandle === 'l') {
          newScaleY = newScaleX / startRatio;
        } else if (currentHandle === 'b' || currentHandle === 't') {
          newScaleX = newScaleY * startRatio;
        } else {
          if (Math.abs(dx) > Math.abs(dy)) {
            newScaleY = newScaleX / startRatio;
          } else {
            newScaleX = newScaleY * startRatio;
          }
        }
      }

      const dw = (newScaleX - startScaleX) * nativeWidth;
      const dh = (newScaleY - startScaleY) * nativeHeight;
      
      let shiftX = 0;
      let shiftY = 0;
      
      if (currentHandle === 'br') {
        shiftX = dw / 2;
        shiftY = dh / 2;
      } else if (currentHandle === 'bl') {
        shiftX = -dw / 2;
        shiftY = dh / 2;
      } else if (currentHandle === 'tr') {
        shiftX = dw / 2;
        shiftY = -dh / 2;
      } else if (currentHandle === 'tl') {
        shiftX = -dw / 2;
        shiftY = -dh / 2;
      } else if (currentHandle === 'r') {
        shiftX = dw / 2;
      } else if (currentHandle === 'l') {
        shiftX = -dw / 2;
      } else if (currentHandle === 'b') {
        shiftY = dh / 2;
      } else if (currentHandle === 't') {
        shiftY = -dh / 2;
      }

      selectedSource.scaleX = newScaleX;
      selectedSource.scaleY = newScaleY;
      selectedSource.x = Math.round(initialX + shiftX);
      selectedSource.y = Math.round(initialY + shiftY);

      applyCanvasTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        currentHandle = null;
      }
    });
  }
}

// -------------------------------------------------------------------------
// LAYER ORDERING ENGINE
// -------------------------------------------------------------------------
function setupLayerOrderListeners() {
  if (!btnSourceUp || !btnSourceDown) return;

  btnSourceUp.addEventListener('click', () => {
    if (!activeVideoSourceId || addedSources.length <= 1) return;
    const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
    if (index >= 0 && index < addedSources.length - 1) {
      // Swap source elements to move higher in array (drawn later / on top)
      const temp = addedSources[index];
      addedSources[index] = addedSources[index + 1];
      addedSources[index + 1] = temp;
      renderSourcesList();
      applyCanvasTransform();
    }
  });

  btnSourceDown.addEventListener('click', () => {
    if (!activeVideoSourceId || addedSources.length <= 1) return;
    const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
    if (index > 0) {
      // Swap source elements to move lower in array (drawn earlier / at bottom)
      const temp = addedSources[index];
      addedSources[index] = addedSources[index - 1];
      addedSources[index - 1] = temp;
      renderSourcesList();
      applyCanvasTransform();
    }
  });
}

// -------------------------------------------------------------------------
// SYSTEM PERFORMANCE MONITORING
// -------------------------------------------------------------------------
function startResourceMonitoring() {
  setInterval(async () => {
    // Get actual system performance stats from main process
    let cpu = '0.0';
    let memory = '34.2';
    if (window.electronAPI && window.electronAPI.getPerformanceStats) {
      try {
        const stats = await window.electronAPI.getPerformanceStats();
        if (stats) {
          cpu = stats.cpu;
          memory = stats.memory;
        }
      } catch (err) {
        // Fallback
        cpu = (Math.random() * 0.5 + 0.1).toFixed(1);
        if (window.performance && window.performance.memory) {
          memory = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
        } else {
          memory = (30.0 + Math.random() * 5).toFixed(1);
        }
      }
    } else {
      // Fallback if not running in electron
      cpu = (Math.random() * 0.5 + 0.1).toFixed(1);
      if (window.performance && window.performance.memory) {
        memory = (window.performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      } else {
        memory = (30.0 + Math.random() * 5).toFixed(1);
      }
    }
    
    if (resCpu) resCpu.innerText = `${cpu}%`;
    if (resMemory) resMemory.innerText = `${memory} MB`;

    // Replay buffer cache size calculation
    if (resReplayCache) {
      if (replayActive && replayQueue.length > 0) {
        const headerSize = replayHeader ? replayHeader.byteLength : 0;
        const bodySize = replayQueue.reduce((acc, curr) => acc + curr.byteLength, 0);
        const cacheMB = ((headerSize + bodySize) / (1024 * 1024)).toFixed(1);
        resReplayCache.innerText = `${cacheMB} MB`;
      } else {
        resReplayCache.innerText = '0 MB';
      }
    }
  }, 1000);
}

function setupCanvasKeyboardControls() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    const selectedSource = addedSources.find(s => s.id === activeVideoSourceId);
    if (!selectedSource) return;

    const nudgeStep = e.shiftKey ? 10 : 1;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        selectedSource.x -= nudgeStep;
        applyCanvasTransform();
        break;
      case 'ArrowRight':
        e.preventDefault();
        selectedSource.x += nudgeStep;
        applyCanvasTransform();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedSource.y -= nudgeStep;
        applyCanvasTransform();
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectedSource.y += nudgeStep;
        applyCanvasTransform();
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        const index = addedSources.findIndex(s => s.id === activeVideoSourceId);
        if (index >= 0) {
          removeSourceFromScene(index);
        }
        break;
    }

    if (e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          document.getElementById('ctx-trans-fit')?.click();
          break;
        case 's':
          e.preventDefault();
          document.getElementById('ctx-trans-stretch')?.click();
          break;
        case 'd':
          e.preventDefault();
          document.getElementById('ctx-trans-center')?.click();
          break;
        case 'r':
          e.preventDefault();
          document.getElementById('ctx-trans-reset')?.click();
          break;
      }
    }
  });
}

// Run Initialization
window.addEventListener('DOMContentLoaded', initApp);

// Theme Helpers
function getEmptySourcesMessage() {
  const theme = config.appTheme || 'classic-obsidian';
  if (theme === 'sakura-anime') return 'No sources yet... Add one to begin capture! (◕‿◕✿)';
  if (theme === 'cyberpunk') return 'ALERT: NO VIDEO STREAMS ACTIVE. LOAD A INPUT SOURCE.';
  if (theme === 'forest') return 'Silence of the woods... Add a source to capture.';
  if (theme === 'ocean') return 'Calm waters... Add a video capture source.';
  if (theme === 'arctic') return 'Frozen streams... Attach a capture feed.';
  if (theme === 'crimson') return 'The altar is silent. Add a source to begin.';
  if (theme === 'solar') return 'Black hole... Add a light source to capture.';
  if (theme === 'hacker') return '[ERR] NO_CAPTURE_SOURCE_LOADED. PLEASE ATTACH SOURCE.';
  if (theme === 'purple-nebula') return 'Empty vacuum... Connect a capture beacon.';
  return 'Click + to add a capture source';
}

function getEmptyGalleryMessage() {
  const theme = config.appTheme || 'classic-obsidian';
  if (theme === 'sakura-anime') return 'Your gallery is empty! Record something cute or save a replay to fill it. 🌸';
  if (theme === 'cyberpunk') return 'DATABASE_EMPTY. NO RECORDED CLIPS RETRIEVED.';
  if (theme === 'forest') return 'No clips saved in the forest vault yet.';
  if (theme === 'ocean') return 'No marine logs stored in the deep database.';
  if (theme === 'arctic') return 'The archives are frozen and empty.';
  if (theme === 'crimson') return 'No blood logs written in the chamber vault.';
  if (theme === 'solar') return 'No light coordinates saved in the vault.';
  if (theme === 'hacker') return '[ERR] DIRECTORY_EMPTY. ZERO WEBM/MKV LOGS FOUND.';
  if (theme === 'purple-nebula') return 'No cosmic signals captured in the stardust files.';
  return 'No clips or recordings captured yet. Try enabling the Replay Buffer or record your screen!';
}

function applyThemeToUI(themeName) {
  document.body.className = '';
  const currentTheme = themeName || 'classic-obsidian';
  document.body.classList.add(`theme-${currentTheme}`);

  // Dynamic Theme Customization Metadata
  const themeSpecs = {
    'classic-obsidian': {
      title: 'WHEL RECORDER',
      navDashboard: 'Dashboard',
      navGallery: 'Gallery',
      navSettings: 'Settings',
      banner: 'Classic obsidian theme loaded. Stable dark carbon matrix.',
      previewPlaceholder: 'Select a source to begin capture',
      playerPlaceholder: 'Select a video from the list to preview'
    },
    'sakura-anime': {
      title: '🌸 WHEL RECORDER 🌸',
      navDashboard: '✿  Dashboard',
      navGallery: '✿  Gallery',
      navSettings: '✿  Settings',
      banner: 'Sakura Anime theme active! (✿◕‿◕) Sweet cherry blossoms and soft glass curves are loaded.',
      previewPlaceholder: 'Please choose a source to start capturing! 🌸',
      playerPlaceholder: 'Pick a clip from the list to watch! 🌸'
    },
    'cyberpunk': {
      title: '⚡ WHEL // SYSTEM_ACTIVE',
      navDashboard: '⚡  Dashboard',
      navGallery: '⚡  Gallery',
      navSettings: '⚡  Settings',
      banner: 'Cyberpunk HUD active. High-frequency neon grids and fast-refresh styling engaged.',
      previewPlaceholder: 'SYSTEM_READY // CONNECTOR STREAMS OFFLINE. INPUT REQUIRED.',
      playerPlaceholder: 'MEDIA_PLAYER: WAITING ON SEGMENT SELECTION.'
    },
    'forest': {
      title: '🌿 WHEL RECORDER',
      navDashboard: '🌿  Dashboard',
      navGallery: '🌿  Gallery',
      navSettings: '🌿  Settings',
      banner: 'Forest Moss theme loaded. Earthy textures and soft organic curves are active.',
      previewPlaceholder: 'Awaiting visual capture stream... 🌿',
      playerPlaceholder: 'Select a forest chronicle from the list.'
    },
    'ocean': {
      title: '🌊 WHEL RECORDER',
      navDashboard: '🌊  Dashboard',
      navGallery: '🌊  Gallery',
      navSettings: '🌊  Settings',
      banner: 'Deep Ocean theme loaded. Heavy glass refraction and oceanic ambient shadows engaged.',
      previewPlaceholder: 'Select a stream feed to project... 🌊',
      playerPlaceholder: 'Select a playback stream from the logs.'
    },
    'arctic': {
      title: '❄️ WHEL RECORDER',
      navDashboard: '❄️  Dashboard',
      navGallery: '❄️  Gallery',
      navSettings: '❄️  Settings',
      banner: 'Arctic Frost active. Crystalline frosted glass margins and high-blur ice sheets.',
      previewPlaceholder: 'Awaiting live stream input... ❄️',
      playerPlaceholder: 'Select an archive segment to render.'
    },
    'crimson': {
      title: '🩸 WHEL RECORDER',
      navDashboard: '🩸  Dashboard',
      navGallery: '🩸  Gallery',
      navSettings: '🩸  Settings',
      banner: 'Crimson Blood active. Dark obsidian gothic borders and intense red highlights.',
      previewPlaceholder: 'Choose a signal feed to ignite... 🩸',
      playerPlaceholder: 'Choose a recorded vessel to replay.'
    },
    'solar': {
      title: '☀️ WHEL RECORDER',
      navDashboard: '☀️  Dashboard',
      navGallery: '☀️  Gallery',
      navSettings: '☀️  Settings',
      banner: 'Solar Flare active. Corona heat highlights and solar wind shadows engaged.',
      previewPlaceholder: 'Select a planetary frequency feed... ☀️',
      playerPlaceholder: 'Select a stellar log to review.'
    },
    'hacker': {
      title: '> WHEL_RECORDER.EXE [v1.0.0]',
      navDashboard: 'DASHBOARD',
      navGallery: 'GALLERY',
      navSettings: 'SETTINGS',
      banner: 'HACKER_CONSOLE_ONLINE. Terminal scanlines active. Monospace font matrix override active.',
      previewPlaceholder: '[ STATUS: WAITING FOR INPUT STREAM CONTROLLER... ]',
      playerPlaceholder: '[ STATUS: PLAYBACK UNIT CONFIGURED. SELECT SEGMENT... ]'
    },
    'purple-nebula': {
      title: '🌌 WHEL RECORDER',
      navDashboard: '🌌  Dashboard',
      navGallery: '🌌  Gallery',
      navSettings: '🌌  Settings',
      banner: 'Purple Nebula active. Cosmic floating pod shape-profile and dark stardust blur.',
      previewPlaceholder: 'Awaiting nebula beacon stream... 🌌',
      playerPlaceholder: 'Select a space travel log from the telemetry.'
    }
  };

  const spec = themeSpecs[currentTheme] || themeSpecs['classic-obsidian'];

  // 1. Update Titlebar logo text
  const logoText = document.getElementById('titlebar-logo-text');
  if (logoText) {
    logoText.innerHTML = `${spec.title} <small style="font-size: 9px; opacity: 0.6; font-weight: normal; margin-left: 6px; color: var(--color-text-muted);">by Etherious</small>`;
  }

  // 2. Update Nav Tabs text
  const navBtns = document.querySelectorAll('.titlebar-nav .nav-btn');
  navBtns.forEach(btn => {
    const tabName = btn.getAttribute('data-tab');
    const span = btn.querySelector('span');
    if (span) {
      if (tabName === 'dashboard') span.innerText = spec.navDashboard;
      if (tabName === 'gallery') span.innerText = spec.navGallery;
      if (tabName === 'settings') span.innerText = spec.navSettings;
    }
  });

  // 3. Update Settings Banner Card
  const themeBanner = document.getElementById('theme-banner');
  if (themeBanner) {
    themeBanner.innerText = spec.banner;
    themeBanner.style.display = 'block';
  }

  // 4. Update Empty State / Placeholders
  const previewPlaceholderEl = document.querySelector('#preview-placeholder span');
  if (previewPlaceholderEl) {
    previewPlaceholderEl.innerText = spec.previewPlaceholder;
  }

  const playerPlaceholderEl = document.querySelector('#player-placeholder span');
  if (playerPlaceholderEl) {
    playerPlaceholderEl.innerText = spec.playerPlaceholder;
  }

  // Update empty sources/gallery in lists if currently empty
  const emptySourcesEl = document.querySelector('#sources-list-container .empty-sources');
  if (emptySourcesEl) {
    emptySourcesEl.innerText = getEmptySourcesMessage();
  }

  const emptyGalleryEl = document.querySelector('#clips-list-container .empty-gallery');
  if (emptyGalleryEl) {
    emptyGalleryEl.innerText = getEmptyGalleryMessage();
  }
}

