const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let serverProcess = null;

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

  // 2. Persistent mode: Store in userData (%APPDATA%\Universal Media Extractor\cookies.txt)
  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch (e) {}
  }
  const userCookie = path.join(userDataDir, 'cookies.txt');
  if (!fs.existsSync(userCookie) && fs.existsSync(rootCookie)) {
    try {
      fs.copyFileSync(rootCookie, userCookie);
    } catch (e) {}
  }
  return userCookie;
}

function startServer() {
  const rootDir = path.join(__dirname, '..');
  const serverScript = path.join(rootDir, 'server.js');
  const isProd = app.isPackaged;
  const cookiesPath = getCookiesPath();

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    TEMP_DIR: path.join(app.getPath('temp'), 'ume-temp'),
    CACHE_DIR: path.join(app.getPath('userData'), 'cache'),
    COOKIES_PATH: cookiesPath
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
