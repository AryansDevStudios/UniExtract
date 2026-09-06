const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess = null;
let deferredUpdateInterval = null;

// Updater State
let updateState = {
  status: 'idle', // idle, checking, available, not-available, downloading, downloaded, waiting_for_idle, applying, error
  version: null,
  percent: 0,
  speed: 0,
  error: null,
  activeJobs: 0
};

function sendUpdateEvent(data) {
  updateState = { ...updateState, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:event', updateState);
  }
}

function getCookiesPath() {
  const rootDir = path.join(__dirname, '..');
  const rootCookie = path.join(rootDir, 'cookies.txt');

  // 1. Portable mode: Check PORTABLE_EXECUTABLE_DIR (directory where portable .exe is located)
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const portableCookie = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'cookies.txt');
    try {
      fs.accessSync(process.env.PORTABLE_EXECUTABLE_DIR, fs.constants.W_OK);
      if (!fs.existsSync(portableCookie) && fs.existsSync(rootCookie)) {
        try {
          fs.copyFileSync(rootCookie, portableCookie);
        } catch (e) {}
      }
      return portableCookie;
    } catch (e) {
      // Portable directory is read-only; fallback to userData
    }
  }

  // 2. Persistent mode: Store in userData (%APPDATA%\Uni Extract\cookies.txt)
  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (e) {}
  }
  const userCookie = path.join(userDataDir, 'cookies.txt');

  // Migrate legacy cookie from Universal Media Extractor if present
  const legacyUserDataDir = path.join(app.getPath('appData'), 'Universal Media Extractor');
  const legacyCookie = path.join(legacyUserDataDir, 'cookies.txt');
  if (!fs.existsSync(userCookie) && fs.existsSync(legacyCookie)) {
    try {
      fs.copyFileSync(legacyCookie, userCookie);
    } catch (e) {}
  }

  if (!fs.existsSync(userCookie) && fs.existsSync(rootCookie)) {
    try {
      fs.copyFileSync(rootCookie, userCookie);
    } catch (e) {}
  }
  return userCookie;
}

function startServer() {
  if (process.env.ELECTRON_START_URL) {
    console.log('[ELECTRON] Development mode: using external dev server at', process.env.ELECTRON_START_URL);
    return;
  }

  const isProd = app.isPackaged;
  const cookiesPath = getCookiesPath();

  process.env.NODE_ENV = 'production';
  process.env.TEMP_DIR = path.join(app.getPath('temp'), 'uniextract-temp');
  process.env.CACHE_DIR = path.join(app.getPath('userData'), 'cache');
  process.env.COOKIES_PATH = cookiesPath;
  process.env.IS_ELECTRON = 'true';
  process.env.ELECTRON_IS_PACKAGED = isProd ? 'true' : 'false';
  process.env.ELECTRON_PORTABLE = process.env.PORTABLE_EXECUTABLE_DIR ? 'true' : 'false';
  process.env.ELECTRON_APP_VERSION = app.getVersion();

  try {
    const rootDir = path.join(__dirname, '..');
    const serverScript = path.join(rootDir, 'server.js');
    console.log('[ELECTRON] Starting embedded backend server from:', serverScript);
    require(serverScript);
    console.log('[ELECTRON] Embedded backend server initialized.');
  } catch (err) {
    console.error('[ELECTRON] Failed to start embedded backend server:', err);
  }
}

// Query local server to inspect active in-flight downloads / transcoding
function queryActiveJobs() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/updates/active-jobs', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.activeJobsCount || 0);
        } catch (e) {
          resolve(0);
        }
      });
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

function setupAutoUpdater() {
  // Disable auto download by default so active media downloads are not bandwidth-starved
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateEvent({ status: 'checking', error: null });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateEvent({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      error: null
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateEvent({ status: 'not-available', error: null });
  });

  autoUpdater.on('download-progress', (p) => {
    sendUpdateEvent({
      status: 'downloading',
      percent: Math.round(p.percent || 0),
      speed: p.bytesPerSecond || 0
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateEvent({
      status: 'downloaded',
      version: info.version,
      percent: 100,
      error: null
    });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateEvent({ status: 'error', error: err ? err.message : 'Update check failed' });
  });

  // IPC Handlers for Renderer
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { status: 'dev_mode', message: 'Auto-update is only active in packaged desktop builds' };
    }
    try {
      sendUpdateEvent({ status: 'checking' });
      await autoUpdater.checkForUpdates();
      return updateState;
    } catch (e) {
      sendUpdateEvent({ status: 'error', error: e.message });
      return { status: 'error', error: e.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) {
      return { status: 'dev_mode', message: 'Auto-update is only active in packaged desktop builds' };
    }
    try {
      sendUpdateEvent({ status: 'downloading', percent: 0 });
      await autoUpdater.downloadUpdate();
      return { status: 'downloading' };
    } catch (e) {
      sendUpdateEvent({ status: 'error', error: e.message });
      return { status: 'error', error: e.message };
    }
  });

  ipcMain.handle('updater:get-state', () => {
    return updateState;
  });

  // Zero-disruption updater application under load
  ipcMain.handle('updater:apply', async (_event, { force = false } = {}) => {
    if (!app.isPackaged) {
      return { status: 'dev_mode', message: 'Auto-update is only active in packaged desktop builds' };
    }

    const activeCount = await queryActiveJobs();

    if (activeCount === 0 || force) {
      // Zero active jobs (or force confirmed by user) -> Apply immediately
      if (deferredUpdateInterval) {
        clearInterval(deferredUpdateInterval);
        deferredUpdateInterval = null;
      }
      sendUpdateEvent({ status: 'applying' });
      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
      return { status: 'applying' };
    }

    // Active jobs in flight -> Enter deferred waiting state
    sendUpdateEvent({ status: 'waiting_for_idle', activeJobs: activeCount });

    if (!deferredUpdateInterval) {
      deferredUpdateInterval = setInterval(async () => {
        const count = await queryActiveJobs();
        if (count === 0) {
          clearInterval(deferredUpdateInterval);
          deferredUpdateInterval = null;
          sendUpdateEvent({ status: 'applying' });
          setTimeout(() => {
            autoUpdater.quitAndInstall(false, true);
          }, 3500); // 3.5s cooldown grace window
        } else {
          sendUpdateEvent({ status: 'waiting_for_idle', activeJobs: count });
        }
      }, 3000);
    }

    return { status: 'waiting_for_idle', activeJobs: activeCount };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 780,
    title: 'Uni Extract',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '..', 'favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  const startUrl = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3000';
  
  let retryCount = 0;
  const maxRetries = 60;
  const tryLoad = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(startUrl).catch(() => {});
    }
  };

  mainWindow.webContents.on('did-fail-load', () => {
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(tryLoad, 300);
    }
  });

  tryLoad();

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.setName('Uni Extract');

app.whenReady().then(() => {
  startServer();
  setupAutoUpdater();
  createWindow();

  // Background check for updates 10 seconds after launch
  if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 10000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (deferredUpdateInterval) {
    clearInterval(deferredUpdateInterval);
  }
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
