const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Desktop Capturer Sources
  getSources: () => ipcRenderer.invoke('get-sources'),

  // Active Windows for Audio Loopback
  getActiveWindows: () => ipcRenderer.invoke('get-active-windows'),
  startAppAudio: (pid) => ipcRenderer.invoke('start-app-audio', pid),
  stopAppAudio: (pid) => ipcRenderer.invoke('stop-app-audio', pid),
  onAppAudioData: (pid, callback) => {
    const listener = (event, chunk) => callback(chunk);
    ipcRenderer.on(`audio-data-${pid}`, listener);
    return () => ipcRenderer.removeListener(`audio-data-${pid}`, listener);
  },

  // File Management
  saveRecording: (arrayBuffer, filename) => ipcRenderer.invoke('save-recording', arrayBuffer, filename),
  startRecordingStream: (filename) => ipcRenderer.invoke('start-recording-stream', filename),
  writeRecordingChunk: (arrayBuffer) => ipcRenderer.invoke('write-recording-chunk', arrayBuffer),
  stopRecordingStream: () => ipcRenderer.invoke('stop-recording-stream'),
  saveReplay: (arrayBuffer, filename) => ipcRenderer.invoke('save-replay', arrayBuffer, filename),
  saveBookmarks: (filename, content) => ipcRenderer.invoke('save-bookmarks', filename, content),
  readBookmarks: (videoFilename) => ipcRenderer.invoke('read-bookmarks', videoFilename),
  getGalleryFiles: () => ipcRenderer.invoke('get-gallery-files'),
  openGalleryFolder: () => ipcRenderer.invoke('open-gallery-folder'),
  deleteGalleryFile: (filename) => ipcRenderer.invoke('delete-gallery-file', filename),
  getVideosPath: () => ipcRenderer.invoke('get-videos-path'),

  // Hotkeys
  registerHotkey: (action, hotkeyStr) => ipcRenderer.invoke('register-hotkey', action, hotkeyStr),
  onHotkeyTrigger: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('hotkey-trigger', listener);
    return () => ipcRenderer.removeListener('hotkey-trigger', listener);
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (newConfig) => ipcRenderer.invoke('update-config', newConfig),

  // Window & System
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  showNotification: (title, body) => ipcRenderer.send('show-notification', title, body),
  logDebug: (msg) => ipcRenderer.send('log-debug', msg),
  getPerformanceStats: () => ipcRenderer.invoke('get-performance-stats'),
  onWindowMaximizedStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('window-maximized-status', listener);
    return () => ipcRenderer.removeListener('window-maximized-status', listener);
  }
});

