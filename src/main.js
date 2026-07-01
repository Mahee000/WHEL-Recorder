const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, shell, globalShortcut, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');

function finalizeVideoContainer(rawFilePath, finalFilePath) {
  return new Promise((resolve, reject) => {
    logDebug(`Finalizing video via FFmpeg: ${rawFilePath} -> ${finalFilePath}`);
    const args = ['-i', rawFilePath, '-c', 'copy', '-y', finalFilePath];
    child_process.execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        logDebug(`FFmpeg finalize failed: ${error.message}\n${stderr}`);
        resolve(false);
      } else {
        logDebug(`FFmpeg finalize success.`);
        resolve(true);
      }
    });
  });
}
const os = require('os');
const { startAudioCapture, stopAudioCapture, getActiveWindowProcessIds, setExecutablesRoot } = require('application-loopback');

process.on('uncaughtException', (error) => {
  fs.appendFileSync(path.join(app.getPath('userData'), 'whel-debug.log'), `\n[FATAL] Uncaught Exception: ${error.stack}\n`);
  dialog.showErrorBox('Fatal Error', `An unexpected error occurred. Please check the logs at ${app.getPath('userData')}\\whel-debug.log`);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  fs.appendFileSync(path.join(app.getPath('userData'), 'whel-debug.log'), `\n[FATAL] Unhandled Rejection: ${reason}\n`);
});

if (app.isPackaged) {
  const unpackedBinPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'application-loopback', 'bin');
  setExecutablesRoot(unpackedBinPath);
}

// Global state variables
let mainWindow = null;
let tray = null;
let isQuitting = false;
let config = {};
let activeAudioPids = new Set();
let recordingWriteStream = null;
let replayWriteStream = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  // Allow Web Audio API and media playback without user interaction
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}


const scenePath = path.join(app.getPath('userData'), 'whel-scene.json');

ipcMain.handle('save-scene', async (event, sceneData) => {
  try {
    fs.writeFileSync(scenePath, JSON.stringify(sceneData, null, 2), 'utf8');
    return true;
  } catch (e) {
    logDebug(`Failed to save scene: ${e.message}`);
    return false;
  }
});

ipcMain.handle('load-scene', async (event) => {
  try {
    if (fs.existsSync(scenePath)) {
      const data = fs.readFileSync(scenePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    logDebug(`Failed to load scene: ${e.message}`);
  }
  return null;
});

// Paths
app.setAppUserModelId('WHEL.Recorder');

let recordingDir = path.join(app.getPath('videos'), 'WHEL Recorder');

function updateRecordingDir() {
  if (config.recordingDir) {
    recordingDir = config.recordingDir;
  }
  if (!fs.existsSync(recordingDir)) {
    fs.mkdirSync(recordingDir, { recursive: true });
    logDebug(`Created recording directory: ${recordingDir}`);
  }
}
const configPath = path.join(app.getPath('userData'), 'whel-config.json');
const logPath = path.join(app.getPath('userData'), 'whel-debug.log');

// Log debug messages
function logDebug(message) {
  try {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logPath, logLine, 'utf8');
    console.log(message);
  } catch (e) {
    console.error('Failed to write debug log:', e);
  }
}

// Initial directory check
try {
  if (!fs.existsSync(recordingDir)) {
    fs.mkdirSync(recordingDir, { recursive: true });
    logDebug(`Created recording directory: ${recordingDir}`);
  }
} catch (e) {
  logDebug(`Failed to create recording directory (might be blocked by Windows Defender): ${e.message}`);
}

// Load configurations
function loadConfig() {
  const defaults = {
    // Hotkeys
    hotkeyReplay: 'F8',
    hotkeyRecord: 'F9',
    hotkeyPause: 'Shift+F9',
    hotkeyToggleReplay: 'Shift+F8',
    hotkeyMuteMic: 'F7',
    hotkeyMuteDesktop: 'F6',
    hotkeyBookmark: 'F10',
    // Output
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
    micVolume: 1.0,
    systemVolume: 1.0,
    isolatedAudio: false,
    isolatedProcessName: '',
    isolatedProcessPid: null,
    // Replay Buffer
    replayLength: 30,
    replayRam: 512,
    autoReplay: false,
    replayNotify: true,
    replaySound: true,
    // General
    appTheme: 'classic-obsidian',
    minimizeToTray: true,
    startMinimized: false,
    startWithWindows: false,
    processPriority: 'above-normal',
    notifyRecord: true,
    notifyReplay: true
  };

  try {
    if (fs.existsSync(configPath)) {
      const rawContent = fs.readFileSync(configPath, 'utf8');
      logDebug(`Config Path: ${configPath}`);
      logDebug(`Config Content: ${rawContent}`);
      config = { ...defaults, ...JSON.parse(rawContent) };
      logDebug('Configurations loaded.');
      applyProcessPriority();
      applyAutoLaunch();
      updateRecordingDir();
    } else {
      config = defaults;
      saveConfig(config);
      logDebug('Default configurations created.');
    }
  } catch (e) {
    logDebug(`Error loading configurations, using defaults: ${e.message}`);
    config = defaults;
  }
  return config;
}

function applyAutoLaunch() {
  try {
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: !!config.startWithWindows,
        path: app.getPath('exe')
      });
      logDebug(`Auto-launch status set to: ${config.startWithWindows}`);
    }
  } catch (err) {
    logDebug(`Failed to apply auto-launch: ${err.message}`);
  }
}

function applyProcessPriority() {
  try {
    const priorityMap = {
      'high': os.constants.priority.PRIORITY_HIGH,
      'above-normal': os.constants.priority.PRIORITY_ABOVE_NORMAL,
      'normal': os.constants.priority.PRIORITY_NORMAL,
      'below-normal': os.constants.priority.PRIORITY_BELOW_NORMAL,
      'idle': os.constants.priority.PRIORITY_LOWEST
    };
    const priority = priorityMap[config.processPriority] || os.constants.priority.PRIORITY_NORMAL;
    os.setPriority(priority);
    logDebug(`Process priority configured as: ${config.processPriority}`);
  } catch (err) {
    logDebug(`Failed to set process priority: ${err.message}`);
  }
}

// Save configurations
function saveConfig(newConfig) {
  try {
    config = { ...config, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    logDebug('Configurations saved.');
    applyProcessPriority();
    applyAutoLaunch();
    updateRecordingDir();
    registerGlobalHotkeys();
  } catch (e) {
    logDebug(`Failed to save configurations: ${e.message}`);
  }
}

function registerShortcut(hotkeyStr, actionName) {
  if (!hotkeyStr) return;
  try {
    const ok = globalShortcut.register(hotkeyStr, () => {
      logDebug(`Hotkey triggered: ${actionName} (${hotkeyStr})`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hotkey-trigger', { action: actionName });
      }
    });
    if (ok) {
      logDebug(`Registered ${actionName} hotkey: ${hotkeyStr}`);
    } else {
      logDebug(`Failed to register ${actionName} hotkey: ${hotkeyStr}`);
    }
  } catch (err) {
    logDebug(`Error registering hotkey ${hotkeyStr} for ${actionName}: ${err.message}`);
  }
}

// Register hotkeys
function registerGlobalHotkeys() {
  globalShortcut.unregisterAll();
  registerShortcut(config.hotkeyReplay, 'save-replay');
  registerShortcut(config.hotkeyRecord, 'toggle-record');
  registerShortcut(config.hotkeyPause, 'pause-record');
  registerShortcut(config.hotkeyToggleReplay, 'toggle-replay');
  registerShortcut(config.hotkeyMuteMic, 'mute-mic');
  registerShortcut(config.hotkeyMuteDesktop, 'mute-desktop');
  registerShortcut(config.hotkeyBookmark, 'bookmark-moment');
}

// Create System Tray Icon
function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  // Check if icon exists, fallback if not
  const finalIconPath = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, '..', 'package.json'); // Dummy fallback

  try {
    tray = new Tray(finalIconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open WHEL Recorder',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('WHEL Recorder');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    logDebug('System tray created successfully.');
  } catch (err) {
    logDebug(`Failed to create system tray: ${err.message}`);
  }
}

// Create Main Application Window
function createWindow() {
  loadConfig();

  const showWindow = !(config.startMinimized && config.minimizeToTray);

  mainWindow = new BrowserWindow({
    width: 1250,
    height: 780,
    minWidth: 1000,
    minHeight: 650,
    frame: false, // frameless window for OBS/Medal modern styling
    title: 'WHEL Recorder',
    show: showWindow,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0a0a0c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false // keep running in background smoothly
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting && config.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      logDebug('Window minimized to system tray.');
      showToastNotification('WHEL Recorder', 'Running in background. Press hotkey to clip!');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-status', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximized-status', false);
    }
  });

  // Register hotkeys on start
  registerGlobalHotkeys();
  
  // Create system tray
  createTray();
}

// Helper to show native windows notification
function showToastNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: title,
        body: body,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        silent: false
      }).show();
    }
  } catch (e) {
    logDebug(`Failed to show notification: ${e.message}`);
  }
}

// Electron lifecycle events
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Clean up global shortcuts and active loopback processes
  globalShortcut.unregisterAll();
  for (const pid of activeAudioPids) {
    try {
      stopAudioCapture(pid);
      logDebug(`Stopped active audio loopback on PID ${pid} during shutdown.`);
    } catch (e) {}
  }
});

// IPC Handler Registrations
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null
    }));
  } catch (e) {
    logDebug(`Failed to fetch screen capture sources: ${e.message}`);
    return [];
  }
});

ipcMain.handle('get-active-windows', async () => {
  try {
    const list = await getActiveWindowProcessIds();
    // Return filtered valid windows
    return (list || []).filter(w => w && w.processId && w.title);
  } catch (e) {
    logDebug(`Failed to fetch active windows list: ${e.message}`);
    return [];
  }
});

ipcMain.handle('start-app-audio', async (event, pid) => {
  try {
    const pidInt = parseInt(pid);
    if (isNaN(pidInt)) {
      logDebug(`Invalid PID passed to start-app-audio: ${pid}`);
      return false;
    }

    if (activeAudioPids.has(pidInt)) {
      logDebug(`Audio loopback already active for PID ${pidInt}`);
      return true;
    }

    const { MessageChannelMain } = require('electron');
    const { port1, port2 } = new MessageChannelMain();

    logDebug(`Starting audio capture for PID: ${pidInt}`);
    startAudioCapture(pidInt, {
      onData: (chunk) => {
        port1.postMessage(chunk);
      }
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.postMessage(`audio-port-${pidInt}`, null, [port2]);
    }

    activeAudioPids.add(pidInt);
    return true;
  } catch (err) {
    logDebug(`Failed to start application audio loopback: ${err.message || err}`);
    return false;
  }
});

ipcMain.handle('stop-app-audio', async (event, pid) => {
  try {
    const pidInt = parseInt(pid);
    if (isNaN(pidInt)) return false;

    if (activeAudioPids.has(pidInt)) {
      logDebug(`Stopping audio capture for PID: ${pidInt}`);
      stopAudioCapture(pidInt);
      activeAudioPids.delete(pidInt);
    }
    return true;
  } catch (err) {
    logDebug(`Failed to stop application audio loopback: ${err.message || err}`);
    return false;
  }
});

ipcMain.handle('save-recording', async (event, arrayBuffer, filename) => {
  try {
    const finalPath = path.join(recordingDir, filename);
    const rawPath = path.join(recordingDir, 'raw_' + filename);
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(rawPath, buffer);
    const success = await finalizeVideoContainer(rawPath, finalPath);
    if (success) {
      fs.unlink(rawPath, () => {});
    }
    logDebug(`Saved standard recording: ${finalPath}`);
    if (config.notifyRecord !== false) {
      showToastNotification('Recording Saved', `Recording saved as ${filename}`);
    }
    return finalPath;
  } catch (e) {
    logDebug(`Failed to save recording: ${e.message}`);
    throw e;
  }
});

ipcMain.handle('get-gallery-files', async () => {
  try {
    const files = await fs.promises.readdir(recordingDir);
    const list = [];
    for (const file of files) {
      if (file.endsWith('.webm') || file.endsWith('.mp4') || file.endsWith('.mkv')) {
        const filePath = path.join(recordingDir, file);
        const stat = await fs.promises.stat(filePath);
        list.push({
          name: file,
          sizeBytes: stat.size,
          createdAt: stat.birthtimeMs || stat.mtimeMs,
          path: filePath
        });
      }
    }
    // Sort newest first
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    logDebug(`Failed to load gallery files: ${e.message}`);
    return [];
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-gallery-folder', async () => {
  try {
    updateRecordingDir();
    await shell.openPath(recordingDir);
    return true;
  } catch (e) {
    logDebug(`Failed to open gallery folder: ${e.message}`);
    return false;
  }
});

ipcMain.handle('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('delete-gallery-file', async (event, filename) => {
  try {
    const filePath = path.join(recordingDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logDebug(`Deleted file: ${filePath}`);
      return true;
    }
    return false;
  } catch (e) {
    logDebug(`Failed to delete file ${filename}: ${e.message}`);
    return false;
  }
});

ipcMain.handle('get-videos-path', () => {
  return recordingDir;
});

ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('update-config', (event, newConfig) => {
  saveConfig(newConfig);
  registerGlobalHotkeys();
  return true;
});

ipcMain.handle('register-hotkey', (event, action, hotkeyStr) => {
  logDebug(`Updating config hotkey for ${action} to ${hotkeyStr}`);
  if (action === 'save-replay') {
    saveConfig({ hotkeyReplay: hotkeyStr });
  } else if (action === 'toggle-record') {
    saveConfig({ hotkeyRecord: hotkeyStr });
  } else if (action === 'pause') {
    saveConfig({ hotkeyPause: hotkeyStr });
  } else if (action === 'toggle-replay') {
    saveConfig({ hotkeyToggleReplay: hotkeyStr });
  } else if (action === 'mute-mic') {
    saveConfig({ hotkeyMuteMic: hotkeyStr });
  } else if (action === 'mute-desktop') {
    saveConfig({ hotkeyMuteDesktop: hotkeyStr });
  } else if (action === 'bookmark') {
    saveConfig({ hotkeyBookmark: hotkeyStr });
  }
  registerGlobalHotkeys();
  return true;
});

ipcMain.handle('save-bookmarks', async (event, filename, content) => {
  try {
    const filePath = path.join(recordingDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf8');
    logDebug(`Saved bookmarks to: ${filePath}`);
    return true;
  } catch (e) {
    logDebug(`Failed to save bookmarks file: ${e.message}`);
    return false;
  }
});

ipcMain.handle('read-bookmarks', async (event, videoFilename) => {
  try {
    const txtFilename = videoFilename.replace(/\.[^/.]+$/, "") + "_bookmarks.txt";
    const filePath = path.join(recordingDir, txtFilename);
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return content;
    }
    return null;
  } catch (e) {
    logDebug(`Failed to read bookmarks file for ${videoFilename}: ${e.message}`);
    return null;
  }
});

ipcMain.handle('start-recording-stream', async (event, filename) => {
  try {
    const finalPath = path.join(recordingDir, filename);
    const rawPath = path.join(recordingDir, 'raw_' + filename);
    recordingWriteStream = fs.createWriteStream(rawPath);
    recordingWriteStream.finalPath = finalPath;
    recordingWriteStream.rawPath = rawPath;
    logDebug(`Started recording stream to: ${rawPath}`);
    return true;
  } catch (e) {
    logDebug(`Failed to start recording stream: ${e.message}`);
    throw e;
  }
});

// Receive the recording MessagePort from the renderer and pipe chunks to the write stream
ipcMain.on('setup-recording-port', (event) => {
  const port = event.ports[0];
  if (!port) {
    logDebug('setup-recording-port called but no port was provided.');
    return;
  }
  port.on('message', (messageEvent) => {
    try {
      if (recordingWriteStream && !recordingWriteStream.destroyed) {
        const data = messageEvent.data;
        const buffer = Buffer.from(data);
        logDebug(`Received chunk. Type: ${typeof data}, IsBuffer: ${Buffer.isBuffer(data)}, ByteLength: ${data.byteLength}, BufferLength: ${buffer.length}`);
        
        const ok = recordingWriteStream.write(buffer);
        if (!ok) {
          recordingWriteStream.once('drain', () => {});
        }
      } else {
        logDebug('Received chunk but recordingWriteStream is null or destroyed.');
      }
    } catch (e) {
      logDebug(`Error in port.on('message'): ${e.message}`);
    }
  });
  port.start();
  logDebug('Recording MessagePort connected and listening for chunks.');
});

ipcMain.handle('write-recording-chunk', async (event, arrayBuffer) => {
  try {
    if (recordingWriteStream) {
      const buffer = Buffer.from(arrayBuffer);
      const ok = recordingWriteStream.write(buffer);
      if (!ok) {
        await new Promise(resolve => recordingWriteStream.once('drain', resolve));
      }
    }
    return true;
  } catch (e) {
    logDebug(`Failed to write recording chunk: ${e.message}`);
    return false;
  }
});

ipcMain.handle('stop-recording-stream', async () => {
  try {
    if (recordingWriteStream) {
      const rawPath = recordingWriteStream.rawPath;
      const finalPath = recordingWriteStream.finalPath;
      const filename = path.basename(finalPath);
      await new Promise((resolve, reject) => {
        recordingWriteStream.end(async () => {
          const success = await finalizeVideoContainer(rawPath, finalPath);
          if (success) fs.unlink(rawPath, () => {});
          resolve();
        });
      });
      recordingWriteStream = null;
      logDebug(`Closed recording stream.`);
      showToastNotification('Recording Saved', `Recording saved as ${filename}`);
    }
    return true;
  } catch (e) {
    logDebug(`Failed to close recording stream: ${e.message}`);
    return false;
  }
});

ipcMain.handle('start-replay-stream', async (event, filename) => {
  try {
    const finalPath = path.join(recordingDir, filename);
    const rawPath = path.join(recordingDir, 'raw_' + filename);
    replayWriteStream = fs.createWriteStream(rawPath);
    replayWriteStream.finalPath = finalPath;
    replayWriteStream.rawPath = rawPath;
    logDebug(`Started replay stream to: ${rawPath}`);
    return true;
  } catch (e) {
    logDebug(`Failed to start replay stream: ${e.message}`);
    throw e;
  }
});

ipcMain.handle('write-replay-chunk', async (event, arrayBuffer) => {
  try {
    if (replayWriteStream) {
      const buffer = Buffer.from(arrayBuffer);
      const ok = replayWriteStream.write(buffer);
      if (!ok) {
        await new Promise(resolve => replayWriteStream.once('drain', resolve));
      }
    }
    return true;
  } catch (e) {
    logDebug(`Failed to write replay chunk: ${e.message}`);
    return false;
  }
});

ipcMain.handle('stop-replay-stream', async () => {
  try {
    if (replayWriteStream) {
      const rawPath = replayWriteStream.rawPath;
      const finalPath = replayWriteStream.finalPath;
      const filename = path.basename(finalPath);
      await new Promise((resolve, reject) => {
        replayWriteStream.end(async (err) => {
          if (err) reject(err);
          else {
            const success = await finalizeVideoContainer(rawPath, finalPath);
            if (success) fs.unlink(rawPath, () => {});
            resolve();
          }
        });
      });
      replayWriteStream = null;
      logDebug(`Closed replay stream.`);
      showToastNotification('Replay Saved', `Replay saved as ${filename}`);
    }
    return true;
  } catch (e) {
    logDebug(`Failed to close replay stream: ${e.message}`);
    return false;
  }
});
ipcMain.handle('get-performance-stats', async () => {
  try {
    const cpuUsage = process.getCPUUsage();
    const memInfo = await process.getProcessMemoryInfo();
    return {
      cpu: (cpuUsage.percentCPUUsage).toFixed(1),
      memory: (memInfo.private / 1024).toFixed(1)
    };
  } catch (e) {
    return { cpu: '0.0', memory: '0.0' };
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) {
    if (config.minimizeToTray) {
      mainWindow.hide();
    } else {
      mainWindow.minimize();
    }
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('show-notification', (event, title, body) => {
  showToastNotification(title, body);
});

ipcMain.on('log-debug', (event, msg) => {
  logDebug(`[Renderer] ${msg}`);
});
