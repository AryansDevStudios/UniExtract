# Uni Extract - Electron Desktop Application

This document covers running, debugging, and packaging Uni Extract as a native desktop app using Electron across Windows, Linux, and macOS.

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

## 📦 Production Builds (Multi-Platform)

To bundle the application into production executables:

### 1. Windows (x64 & ARM64)
```bash
# Build both x64 and ARM64 (default):
npm run dist:win

# Or build a specific architecture:
npm run dist:win:x64     # Standard Intel/AMD PCs
npm run dist:win:arm64   # Native Windows on ARM (Snapdragon X Elite / Surface Copilot+)
```

The compiled executables will be generated in `dist-electron/`:
- **x64 (Intel/AMD)**:
  - `UniExtract-2.0.0-x64-Setup.exe` (NSIS Installer)
  - `UniExtract-Portable-2.0.0-x64.exe` (Standalone Portable)
- **ARM64 (Snapdragon / Copilot+ PCs)**:
  - `UniExtract-2.0.0-arm64-Setup.exe` (Native ARM64 NSIS Installer)
  - `UniExtract-Portable-2.0.0-arm64.exe` (Native ARM64 Portable)

### 2. Linux & macOS
```bash
npm run dist:linux   # Builds Linux .AppImage and .deb packages
npm run dist:mac     # Builds macOS .dmg and .zip archives
npm run dist:all     # Builds all supported targets
```

---

### 🤖 Automated GitHub Release Workflow

You do not need to build binaries locally on your personal machine to publish updates. When you are ready to publish a new release:

```bash
git tag v2.0.0
git push origin v2.0.0
```

GitHub Actions (`.github/workflows/release.yml`) will automatically:
1. Spin up a multi-platform runner matrix (`windows-latest`, `ubuntu-latest`, `macos-latest`).
2. Fetch dependencies, bundle `ffmpeg-static` and `yt-dlp`.
3. Package **Windows** (x64 & ARM64 NSIS + Portable), **Linux** (.AppImage & .deb), and **macOS** (.dmg & .zip).
4. Calculate SHA-256 checksums (`checksums.txt`) for all release binaries.
5. Publish an official **GitHub Release** with all installers and checksums attached.

You can also trigger builds manually anytime from the GitHub repository by going to **Actions** → **Build & Release Desktop Apps** → **Run workflow**.

---

## 🍪 Cookie Persistence in Desktop Mode

- **Installed Mode (NSIS)**: Cookies are automatically persisted in `%APPDATA%\Uni Extract\cookies.txt`, meaning updates and reinstalls preserve your session tokens. Legacy tokens from `%APPDATA%\Universal Media Extractor\` are migrated automatically.
- **Portable Mode**: Placing a `cookies.txt` in the same directory as the portable executable keeps your authentication persistent on USB flash drives or across multiple machines.
- **In-App Manager**: You can also use the in-app Cookies modal to paste or upload cookies at any time.

---

## ⚙️ Architecture Notes

- The Electron main process (`electron/main.js`) starts the bundled Node.js server automatically upon launch.
- Child processes are automatically terminated when the application window is closed.
- Both **FFmpeg** (`ffmpeg-static`) and **yt-dlp** binaries are automatically bundled and unpacked via `asarUnpack`, making the desktop application 100% self-contained with zero external software or PATH requirements on the end user's machine.
- Temporary files and yt-dlp binary caches are isolated into system temp and app data directories (`uniextract-temp`).
