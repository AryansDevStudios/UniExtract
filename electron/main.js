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
let updaterPolicy = {
  channel: 'stable', // 'stable' | 'beta'
  autoDownload: false, // background download without asking
  checkCadence: 'startup_and_interval', // 'startup_and_interval', 'daily', 'manual'
  customFeedUrl: ''
};

let updateState = {
  status: 'idle', // idle, checking, available, not-available, downloading, downloaded, waiting_for_idle, applying, error
  version: null,
  percent: 0,
  speed: 0,
  error: null,
  activeJobs: 0,
  channel: 'stable',
  policy: updaterPolicy,
  releaseNotes: null,
  lastCheck: null
};

let updaterCadenceTimer = null;

function sendUpdateEvent(data) {
  updateState = { ...updateState, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:event', updateState);
  }
}

function getCookiesPath() {
  const rootDir = path.join(__dirname, '..');
  const appData = app.getPath('userData');
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  
  if (portableDir) {
    const pCookies = path.join(portableDir, 'cookies.txt');
    if (fs.existsSync(pCookies)) return pCookies;
  }
  
  const userCookies = path.join(appData, 'cookies.txt');
  if (fs.existsSync(userCookies)) return userCookies;
  
  return path.join(rootDir, 'cookies.txt');
}

function startServer() {
  const rootDir = path.join(__dirname, '..');
  const serverScript = path.join(rootDir, 'server.js');
  const isProd = app.isPackaged;
  const cookiesPath = getCookiesPath();

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.PORT || '3000',
    TEMP_DIR: path.join(app.getPath('temp'), 'ume-temp'),
    CACHE_DIR: path.join(app.getPath('userData'), 'cache'),
    COOKIES_PATH: cookiesPath,
    IS_ELECTRON: 'true',
    ELECTRON_IS_PACKAGED: isProd ? 'true' : 'false',
    ELECTRON_PORTABLE: process.env.PORTABLE_EXECUTABLE_DIR ? 'true' : 'false',
    ELECTRON_APP_VERSION: app.getVersion()
  };

  try {
    if (isProd) {
      serverProcess = spawn(process.execPath, [serverScript], {
        cwd: rootDir,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'ignore',
        detached: false
      });
    } else {
      serverProcess = spawn('node', [serverScript], {
        cwd: rootDir,
        env,
        stdio: 'ignore',
        detached: false
      });
    }

    serverProcess.on('error', (err) => {
      console.error('[ELECTRON] Failed to start bundled server:', err);
    });
  } catch (err) {
    console.error('[ELECTRON] Error spawning server process:', err);
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

function getUpdaterPolicyPath() {
  return path.join(app.getPath('userData'), 'updater-policy.json');
}

function loadUpdaterPolicy() {
  try {
    const policyFile = getUpdaterPolicyPath();
    if (fs.existsSync(policyFile)) {
      const data = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
      updaterPolicy = { ...updaterPolicy, ...data };
    }
  } catch (e) {
    console.warn('[UPDATER] Failed to read updater policy, using defaults:', e.message);
  }
  updateState.channel = updaterPolicy.channel;
  updateState.policy = updaterPolicy;
  return updaterPolicy;
}

function saveUpdaterPolicy(newPolicy) {
  try {
    updaterPolicy = { ...updaterPolicy, ...newPolicy };
    updateState.channel = updaterPolicy.channel;
    updateState.policy = updaterPolicy;
    const policyFile = getUpdaterPolicyPath();
    fs.writeFileSync(policyFile, JSON.stringify(updaterPolicy, null, 2), 'utf8');
  } catch (e) {
    console.error('[UPDATER] Failed to write updater policy:', e.message);
  }
}

function applyUpdaterPolicy(policy) {
  const isBeta = policy.channel === 'beta';
  autoUpdater.channel = isBeta ? 'beta' : 'latest';
  autoUpdater.allowPrerelease = isBeta;
  autoUpdater.autoDownload = !!policy.autoDownload;

  if (policy.customFeedUrl && policy.customFeedUrl.trim().startsWith('http')) {
    try {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: policy.customFeedUrl.trim()
      });
      console.log('[UPDATER] Using custom enterprise feed URL:', policy.customFeedUrl.trim());
    } catch (err) {
      console.warn('[UPDATER] Invalid custom feed URL, falling back to official GitHub feed:', err.message);
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'AryansDevStudios',
        repo: 'UniExtract'
      });
    }
  } else {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'AryansDevStudios',
      repo: 'UniExtract'
    });
  }

  // Setup periodic cadence timer
  if (updaterCadenceTimer) {
    clearInterval(updaterCadenceTimer);
    updaterCadenceTimer = null;
  }

  if (policy.checkCadence === 'startup_and_interval') {
    // Check every 4 hours
    updaterCadenceTimer = setInterval(() => {
      if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
        console.log('[UPDATER] Running scheduled update check (cadence: 4h)...');
        autoUpdater.checkForUpdates().catch(() => {});
      }
    }, 4 * 60 * 60 * 1000);
  } else if (policy.checkCadence === 'daily') {
    // Check every 24 hours
    updaterCadenceTimer = setInterval(() => {
      if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
        console.log('[UPDATER] Running scheduled update check (cadence: daily)...');
        autoUpdater.checkForUpdates().catch(() => {});
      }
    }, 24 * 60 * 60 * 1000);
  }
}

function clearUpdaterCache() {
  try {
    const pendingDir = path.join(app.getPath('userData'), 'pending-updates');
    if (fs.existsSync(pendingDir)) {
      fs.rmSync(pendingDir, { recursive: true, force: true });
    }
    const tempDir = app.getPath('temp');
    try {
      const tempFiles = fs.readdirSync(tempDir);
      for (const f of tempFiles) {
        if (f.startsWith('UniExtract-') && (f.endsWith('.exe') || f.endsWith('.blockmap') || f.endsWith('.yml'))) {
          try { fs.unlinkSync(path.join(tempDir, f)); } catch (_) {}
        }
      }
    } catch (_) {}
    sendUpdateEvent({ status: 'idle', percent: 0, speed: 0, error: null });
    return { success: true, message: 'Update cache and pending installers wiped successfully' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function setupAutoUpdater() {
  const policy = loadUpdaterPolicy();
  applyUpdaterPolicy(policy);
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdateEvent({ status: 'checking', error: null, lastCheck: Date.now() });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateEvent({
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      channel: updaterPolicy.channel,
      error: null
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateEvent({ status: 'not-available', error: null, lastCheck: Date.now() });
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
      sendUpdateEvent({ status: 'checking', error: null });
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
    return { ...updateState, policy: updaterPolicy };
  });

  // Enterprise channel selector handler
  ipcMain.handle('updater:set-channel', async (_event, channel) => {
    const validChannel = channel === 'beta' ? 'beta' : 'stable';
    saveUpdaterPolicy({ channel: validChannel });
    applyUpdaterPolicy(updaterPolicy);
    sendUpdateEvent({ channel: validChannel, policy: updaterPolicy });

    if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR) {
      try {
        sendUpdateEvent({ status: 'checking', error: null });
        await autoUpdater.checkForUpdates();
      } catch (e) {
        sendUpdateEvent({ status: 'error', error: e.message });
      }
    }
    return { success: true, channel: validChannel, policy: updaterPolicy };
  });

  // Enterprise policy update handler
  ipcMain.handle('updater:set-policy', async (_event, newPolicy) => {
    saveUpdaterPolicy(newPolicy);
    applyUpdaterPolicy(updaterPolicy);
    sendUpdateEvent({ policy: updaterPolicy });
    return { success: true, policy: updaterPolicy };
  });

  // Enterprise custom mirror / feed handler
  ipcMain.handle('updater:set-feed', async (_event, feedUrl) => {
    saveUpdaterPolicy({ customFeedUrl: (feedUrl || '').trim() });
    applyUpdaterPolicy(updaterPolicy);
    sendUpdateEvent({ policy: updaterPolicy });
    return { success: true, customFeedUrl: updaterPolicy.customFeedUrl };
  });

  // Enterprise cache cleaner / self-healing
  ipcMain.handle('updater:clear-cache', async () => {
    return clearUpdaterCache();
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
  if (updaterCadenceTimer) {
    clearInterval(updaterCadenceTimer);
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
