const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, isolated Electron API to renderer (React UI)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  applyUpdate: (options = {}) => ipcRenderer.invoke('updater:apply', options),
  getUpdateState: () => ipcRenderer.invoke('updater:get-state'),
  onUpdateEvent: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('updater:event', subscription);
    return () => ipcRenderer.removeListener('updater:event', subscription);
  }
});
