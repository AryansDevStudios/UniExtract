# Changelog 📋

All notable changes to **Uni Extract (UniExtract)** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.6] - 2026-09-07 (DEV / Pre-release)

### 🐛 Critical Desktop Reliability Fixes
- **Embedded Server Initialization Fix**:
  - Replaced external process spawning of `server.js` with direct in-process `require('../server.js')`.
  - Completely resolved Windows `Error: spawn Uni Extract.exe ENOENT` caused by the OS kernel rejecting arguments pointing inside packaged `resources/app.asar` archives.
  - Eliminated `ERR_CONNECTION_REFUSED` on startup by guaranteeing the Express backend binds seamlessly in the primary Electron process.

---

## [2.6.5] - 2026-09-07 (DEV / Pre-release)

### 🐛 Critical Bug Fixes
- **Desktop Electron Server Startup Fix**:
  - Resolved fatal `ReferenceError: startServer is not defined` crash at launch on Windows desktop builds.
  - Restored `startServer()`, `sendUpdateEvent()`, `getCookiesPath()`, and `queryActiveJobs()` helpers in `electron/main.js`.
  - Ensured background Express server boots reliably when launched from Start Menu, Desktop shortcut, or terminal.

---

## [2.6.4] - 2026-09-07 (DEV / Pre-release)

### 🚀 Highlights & Enterprise Features
- **Enterprise Update System Architecture**:
  - **Multi-Track Release Channels**: Native support for `Production (Stable)` and `Developer / Beta (Early Access)` release tracks.
  - **Governance & Automation Policies**: Background automatic downloading, notification-only modes, and configurable check cadence (4 hours, daily, or manual).
  - **Disruption-Free 24-Hour Snooze**: 1-click update postponement during active screen sharing or video transcoding, with persistent policy management in `%APPDATA%\Uni Extract\updater-policy.json`.
  - **Cryptographic Verification**: Digital Authenticode validation card, SHA-512 checksum integrity checks, and self-healing update cache wiper.
  - **Categorized Release Notes**: Automatically parses and groups release changelogs into Features, Fixes, Security, and Performance sections with semver bump badges.
  - **Corporate Mirrors & Air-Gapped Networks**: Added custom update feed URL override support.

### 🔒 Security, HTTPS & Network Hardening
- **Native Optional HTTPS Support in Backend (`server.js`)**:
  - Configurable HTTPS listener via `HTTPS=true` and `SSL_CERT` / `SSL_KEY` environment variables or `certs/` folder.
  - Automatic graceful fallback to standard HTTP when SSL certificates are not provided.
- **Chromium Private Network Access (PNA) Preflight Support**:
  - Responds to `Access-Control-Request-Private-Network: true` preflight requests with `Access-Control-Allow-Private-Network: true`.
- **Browser Mixed Content Warning & Guidance (`ServerModal.jsx`)**:
  - Active detection of HTTPS page origin and unencrypted HTTP endpoints.
  - Clear user guidance explaining browser security blocks on HTTPS sites with direct paths forward (Desktop App, HTTPS Tunnel via localtunnel/cloudflared, or SSL proxy).
  - Presets badged with `HTTP` / `HTTPS` indicators.

### 🛠️ API & Runtime Refinements
- Added dedicated `GET /api/version` endpoint and `/api/cookies/status` alias.
- Added dynamic `__APP_VERSION__` injection at Vite build time linking React components directly to `package.json`.
- Removed search box status pill and modernized deployment labels to clean Cloud Web Platform branding.

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
