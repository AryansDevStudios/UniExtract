# Universal Media Extractor - Electron Desktop Application

This document covers running, debugging, and packaging Universal Media Extractor as a native Windows desktop app using Electron.

---

## 💻 Running in Development

Ensure both server and client dev servers run alongside Electron:

```bash
npm install
npm run electron:dev
```

This command:
1. Starts the Node.js Express backend (`server.js`).
2. Starts the Vite client development server on port `5173`.
3. Waits for the Vite server to be reachable, then launches the Electron desktop shell with Chrome DevTools.

---

## 📦 Production Builds (Installer & Portable)

To bundle the application into production Windows executables:

```bash
npm run dist:win
```

This will:
1. Compile the React client into static production assets (`client/dist`).
2. Package the app via `electron-builder` into `dist-electron/`:
   - **NSIS Setup Installer**: `UniversalMediaExtractor-2.0.0-x64.exe`
   - **Standalone Portable Executable**: `UniversalMediaExtractor-Portable-2.0.0.exe`

---

## 🍪 Cookie Persistence in Desktop Mode

- **Installed Mode (NSIS)**: Cookies are automatically persisted in `%APPDATA%\Universal Media Extractor\cookies.txt`, meaning updates and reinstalls preserve your session tokens.
- **Portable Mode**: Placing a `cookies.txt` in the same directory as the portable executable keeps your authentication persistent on USB flash drives or across multiple machines.
- **In-App Manager**: You can also use the in-app Cookies modal to paste or upload cookies at any time.

---

## ⚙️ Architecture Notes

- The Electron main process (`electron/main.js`) starts the bundled Node.js server automatically upon launch.
- Child processes are automatically terminated when the application window is closed.
- Temporary files and yt-dlp binary caches are isolated into system temp and app data directories.
