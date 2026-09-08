# Uni Extract - Electron Desktop Application 💻

This document covers running, developing, and packaging Uni Extract as a native desktop application using Electron across Windows, Linux, and macOS.

---

## 🏗️ Desktop Architecture Overview

The desktop version of Uni Extract is **100% self-contained and offline-capable**. Unlike the web client, it does **not** depend on external cloud servers or Render:

```text
┌─────────────────────────────────────────────────────────────┐
│                 UNISEXTRACT DESKTOP RUNTIME                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               Electron Main Process                 │   │
│   │       (Window Manager, Auto-Updater, Menus)         │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │ spawns embedded server       │
│                              ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │           Embedded Node.js Express Engine           │   │
│   │         (localhost:3000 - server.js runtime)        │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│         ┌────────────────────┴────────────────────┐         │
│         ▼                                         ▼         │
│   [ Bundled yt-dlp ]                     [ Bundled FFmpeg ] │
│   (Stream Extraction)                    (GPU Transcoding)  │
└─────────────────────────────────────────────────────────────┘
```

- **Embedded Local Engine**: When the app launches, `electron/main.js` automatically starts `server.js` bound to `127.0.0.1:3000`.
- **Bundled Binaries**: Both `yt-dlp` and `ffmpeg` (or host native FFmpeg) are bundled and unpacked via `asarUnpack`.
- **Zero Configuration**: Users do not need Node.js, Python, or command-line tools installed.
- **Process Isolation**: When the window is closed, all child processes (active conversions, downloads, and the local server) are gracefully terminated.

---

## 💻 Running in Development

Run both server and client development servers alongside Electron:

```bash
# 1. Install dependencies
npm install

# 2. Start dev environment with hot-reloading
npm run electron:dev
```

This command:
1. Starts the Node.js Express backend (`server.js`).
2. Starts the Vite client dev server on port `5173`.
3. Waits for the Vite server to become reachable, then launches Electron with Chrome DevTools enabled.

---

## 📦 Production Builds (Multi-Platform)

Executables are generated in the `dist-electron/` directory:

### 1. Windows (x64 & ARM64)
```bash
# Build both x64 and ARM64 packages:
npm run dist:win

# Or target specific architectures:
npm run dist:win:x64     # Standard Intel / AMD 64-bit PCs
npm run dist:win:arm64   # Native Windows on ARM (Snapdragon X Elite / Surface Copilot+)
```

#### Generated Artifacts:
- **x64**:
  - `UniExtract-2.8.2-x64-Setup.exe` (NSIS Installer with desktop shortcut)
  - `UniExtract-Portable-2.8.2-x64.exe` (Self-contained single-file portable executable)
- **ARM64**:
  - `UniExtract-2.8.2-arm64-Setup.exe` (Native ARM64 NSIS Installer)
  - `UniExtract-Portable-2.8.2-arm64.exe` (Native ARM64 Portable)

---

### 2. Linux & macOS
```bash
# Linux: Builds .AppImage and .deb packages
npm run dist:linux

# macOS: Builds universal/x64 .dmg installer and .zip archive
npm run dist:mac

# Build all platforms simultaneously:
npm run dist:all
```

---

## 🔐 Windows Code Signing & Publisher Trust

UniExtract executables can be trusted locally on Windows without triggering Windows SmartScreen warnings using the included developer certificate scripts:

- **Certificate**: `AryansDevStudios.cer`
- **One-Click Trust Script (Batch)**:
  ```cmd
  scripts\trust-publisher.bat
  ```
- **PowerShell Script**:
  ```powershell
  scripts\trust-publisher.ps1
  ```

Running this script installs the `AryansDevStudios` root certificate into the local machine's `Trusted Root Certification Authorities` and `Trusted Publishers` certificate stores.

---

## 🔄 In-App Auto-Updater & Traffic Safety

The desktop app includes an enterprise-grade update system:

1. **Traffic-Safe Updates**: The updater probes `http://127.0.0.1:3000/api/updates/active-jobs`. If any download or transcode is currently in-flight, updates are deferred until all jobs complete to prevent data loss.
2. **Dual Release Channels**:
   - **Stable**: Recommended for everyday use.
   - **Pre-release (Beta)**: Early access to upcoming features.
3. **Channel Switching**: Users can toggle release channels at any time inside the app Settings or Release Center.

---

## 🍪 Cookie Persistence & Session Management

- **Installed Mode (NSIS)**: Cookies are stored in `%APPDATA%\Uni Extract\cookies.txt`. Reinstalling or updating the app preserves authentication and session tokens automatically.
- **Portable Mode**: Placing `cookies.txt` in the same directory as `UniExtract-Portable.exe` keeps your sessions persistent across USB drives or different computers.
- **In-App Manager**: Paste or upload cookies via the in-app Cookies modal to unlock restricted or member-only videos.

---

## 🎬 FFmpeg Hardware Acceleration

The desktop app automatically leverages host GPU acceleration:
- **Windows**: NVIDIA NVENC, Intel QuickSync, AMD AMF, and Windows Media Foundation (`h264_mf`).
- **macOS**: Apple VideoToolbox (M1/M2/M3/M4 Apple Silicon & Intel T2).
- **Linux**: Linux VA-API, NVIDIA NVENC, and Intel QuickSync.

If native FFmpeg is installed on your PC (via WinGet, Chocolatey, or Homebrew), the desktop app prioritizes your host FFmpeg to achieve maximum encoding speed and dynamic codec support.
