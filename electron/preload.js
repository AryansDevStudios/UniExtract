const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, isolated Electron API to renderer (React UI)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  applyUpdate: (options = {}) => ipcRenderer.invoke('updater:apply', options),
  getUpdateState: () => ipcRenderer.invoke('updater:get-state'),
  setChannel: (channel) => ipcRenderer.invoke('updater:set-channel', channel),
  setPolicy: (policy) => ipcRenderer.invoke('updater:set-policy', policy),
  setCustomFeed: (url) => ipcRenderer.invoke('updater:set-feed', url),
  clearUpdateCache: () => ipcRenderer.invoke('updater:clear-cache'),
  onUpdateEvent: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('updater:event', subscription);
    return () => ipcRenderer.removeListener('updater:event', subscription);
  }
});
