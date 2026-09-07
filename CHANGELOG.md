# Changelog 📋

All notable changes to **Uni Extract (UniExtract)** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.2] - 2026-09-07

### 🚀 Highlights & Critical Improvements
- **Direct Cloud Render Routing for Netlify & Web Deployments**:
  - Completely resolved `POST /api/analyze 500 (Internal Server Error)` on Netlify (`https://uniextract.netlify.app`).
  - Netlify and static web deployments (`*.web.app`, etc.) now communicate directly with the dedicated Render cloud backend (`https://universal-media-extractor-vav8.onrender.com`), eliminating proxy timeout and payload buffering limits.
  - Takes full advantage of backend CORS (`access-control-allow-origin: *`) for streaming and asynchronous conversions.

- **Unified Multi-Environment Runtime Detection (`environment.js`)**:
  - Single codebase dynamically detects whether the application is running on:
    - **Netlify Edge CDN** (`*.netlify.app`)
    - **Render Direct Cloud** (`*.onrender.com`)
    - **Installed Progressive Web App** (`display-mode: standalone`)
    - **Static Cloud Web Hosts** (`*.web.app`, Firebase, Pages)
    - **Localhost Development / Desktop Engine** (`localhost`, `127.0.0.1`, Electron)
    - **Custom Remote VPS / Private Cloud** (User configured endpoint)

- **Accurate Server Architecture Messaging**:
  - Replaced misleading hardcoded `localhost:3000` text in the Server Architecture modal with dynamic, contextual information explaining the active cloud routing and assuring users that no local software is required.
  - Added an interactive **Server Status Banner** in `ServerModal.jsx` showing the exact active deployment, backend server, and connection latency.
  - Added an interactive **Server Environment Status Pill** directly beneath the Search Box on the main dashboard for instant visibility.
  - Added dynamic environment pills (`Netlify Cloud`, `Render Cloud`, `PWA Cloud`, `Localhost`, `Custom`) and connection tooltips in the Header.

### 🛠️ Fixes & Improvements
- **Netlify SPA Routing**: Added clean SPA redirect fallback in `netlify.toml` (`/* -> /index.html 200`).
- **Target Endpoint Display**: Accurately displays the target backend (`https://universal-media-extractor-vav8.onrender.com` vs `http://localhost:3000`) across all modal views.
- **Latency Testing**: Enhanced `testServerConnection()` to test the environment-specific default backend directly when testing default mode.

---

## [2.6.1] - 2026-09-06

### ✨ New Features
- **In-App Settings & Preferences Modal**: Added persistent media defaults, appearance controls, and open-source credits.
- **Dynamic Server Architecture Selector**: Introduced in-app server modal allowing seamless switching between local machine and custom remote backends.
- **Zero-Interruption Safe Update Engine**: Auto-update manager ensures desktop app updates only install when media transcoding is idle.
- **Authenticode Code Signing**: Added code signing workflow for Windows installers and portable executables.

---

## [2.6.0] - 2026-09-05

### 🚀 Major Release
- **Unified Decoupled Architecture**: Modular design supporting Full-Stack, Backend-Only, Frontend-Only, PWA, and Desktop flavors.
- **Multi-Platform Native Desktop Builds**: Support for Windows (x64 & ARM64), Linux (AppImage & deb), and macOS (dmg & zip).
- **yt-dlp & FFmpeg 7.x Engine**: High-performance stream extraction, multi-track audio selection, subtitle embedding, and chapter splitting.
