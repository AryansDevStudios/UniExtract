const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let serverProcess = null;

function startServer() {
  const rootDir = path.join(__dirname, '..');
  const serverScript = path.join(rootDir, 'server.js');
  const isProd = app.isPackaged;

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    TEMP_DIR: path.join(app.getPath('temp'), 'ume-temp'),
    CACHE_DIR: path.join(app.getPath('userData'), 'cache')
  };

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
    console.error('Failed to start bundled server:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 780,
    title: 'Universal Media Extractor',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, '..', 'favicon.ico'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  
  let retryCount = 0;
  const maxRetries = 30;
  const tryLoad = () => {
    mainWindow.loadURL(startUrl).catch(() => {});
  };

  mainWindow.webContents.on('did-fail-load', () => {
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(tryLoad, 500);
    }
  });

  tryLoad();

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.setName('Universal Media Extractor');

app.whenReady().then(() => {
  startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
