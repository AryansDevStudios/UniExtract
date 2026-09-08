# Changelog 📋

All notable changes to **Uni Extract (UniExtract)** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.8.8] - 2026-09-08

### 👤 Single-User Installer Enforcement
- **Removed Global Multi-User Option**: Completely removed the "Who should this application be installed for? (Anyone who uses this computer / Only for me)" prompt from the Windows Electron NSIS installer.
- **Dedicated Current-User Target**: Locked installation scope strictly to the current user profile (`%LocalAppData%\Programs\Uni Extract`), preventing file permission conflicts, updater lockouts, and administrative isolation issues seen with global machine-wide installs.
- **Zero-Elevation Seamless Setup**: Bypasses Windows UAC administrator elevation requirements during fresh installs and in-app auto-updates, allowing smooth non-admin operation.

### 🎨 Modern Branded Installer Aesthetics (MUI2)
- **High-Resolution Branded Sidebars**: Replaced retro Windows 98/XP NSIS metro graphics with custom 24-bit bitmap sidebars (`build-resources/installerSidebar.bmp` and `uninstallerSidebar.bmp`) featuring a modern deep slate-to-indigo gradient, glowing radial backdrop, the Uni Extract logo, glassmorphic feature badges, and AryansDevStudios signature.
- **Seamless Header Integration**: Added a clean right-aligned header bitmap (`build-resources/installerHeader.bmp`) designed with a pure white background that blends smoothly into inner wizard pages (Choose Install Location and File Extraction).
- **Dedicated Welcome Page**: Configured a welcoming onboarding screen (`customWelcomePage`) introducing Uni Extract's capabilities with custom greeting typography before presenting destination folder choices.
- **Cancellation Safeguard**: Added `MUI_ABORTWARNING` dialog confirmation to prevent accidental installer terminations.
- **Automated Graphics Script**: Added `scripts/generate-installer-graphics.py` and `npm run installer:graphics` to programmatically regenerate installer graphics.

## [2.8.7] - 2026-09-08

### 🛡️ Crash Prevention & Stream Lifecycle Hardening
- **Stream Handler Exception Guards**: Added defensive existence guards across all yt-dlp `stdout` and `stderr` stream data callbacks. Completely eliminates the unhandled `TypeError: Cannot set properties of undefined (setting 'lastOutputTime')` exceptions when downloads are cancelled, aborted, or purged from memory.
- **Process Tree Termination (Linux / Cloud)**: Updated process abort and watchdog stall termination to execute `pkill -P <pid> -9` on Linux/POSIX platforms (Render, Docker, VPS), ensuring child processes (like FFmpeg) spawned by yt-dlp are fully terminated instead of remaining orphaned.
- **Detached Stream Listeners**: Proactively detaches stream listeners (`data`, `error`, `close`) when aborting jobs or handling stall events to prevent trailing buffered pipe data from triggering callbacks after job deletion.
- **Extended Memory Purge Grace Period**: Increased the cancellation job memory purge grace period from 4 seconds to 30 seconds, giving client polling loops and pending network sockets ample time to gracefully complete before memory reclamation.

### ✂️ Robust Video Trimming & Audio-Video Synchronization
- **Eliminated yt-dlp Section-Download Throttling**: Removed `--download-sections` from yt-dlp execution. Because YouTube severely throttles sequential HTTP requests routed through FFmpeg down to ~40KB/s (causing 0% progress hangs, connection drops, and timeouts), media streams are now downloaded natively at full multi-fragment speed (4 concurrent fragments, 10MB chunking).
- **Accurate Post-Download FFmpeg Trimming**: Segments are trimmed directly from local disk via FFmpeg using fast input seeking (`-ss`) and duration limits (`-t`) with `-avoid_negative_ts make_zero`.
- **Perfect Audio/Video Sync**: Transcodes trimmed video with `libx264` (or `libvpx-vp9` for WebM) and audio with `aac` (or `libopus` for WebM/Opus, `libmp3lame` for MP3) to guarantee frame-accurate cuts and eliminate audio drifting or desynchronization.
- **Smart Clip Delivery Hand-off**: Clipped downloads transition smoothly to `processing` ("Trimming media clip...") and only deliver the final cut file once FFmpeg finishes, preventing premature delivery of raw uncut media.
- **Accurate Clip Request Detection**: Fixed clip detection logic in `/api/download` so default `00:00:00` start times without an end time are correctly treated as full downloads rather than false-positive clips.

## [2.8.6] - 2026-09-08

### 🎨 Responsive Dropdown Menus & Truncation Elimination
- **Never-Truncated File Sizes**: Rebuilt trigger buttons for Video Quality and Audio Track dropdowns with dedicated right-aligned file size badges (`289.4 MB`, `7.3 MB`), completely eliminating mid-word ellipsis truncation (`289...` and `Stereo •...`).
- **Responsive Collision-Aware Popover Menus**: Replaced narrow fixed containers with responsive `sm:min-w-[360px] md:min-w-[420px]` popovers featuring smart alignment (`left-0` for video, right-aligned `sm:right-0` for audio and format) to prevent off-screen overflow on desktop and mobile.
- **Modern Glass Aesthetics**: Styled dropdowns with `rounded-2xl`, glass blur backdrop (`backdrop-blur-2xl`), deep elevation shadow, and subtle borders.
- **Scrollbar Polish**: Disabled Windows WebKit scrollbar arrow buttons (`▲` / `▼`) via CSS across all dropdowns and list views.
- **Dismiss Handlers**: Replaced brittle blur events with robust pointerdown click-outside listeners and `Escape` key dismiss.

### 🎧 Audio Track Language & Dub Label Enrichment
- **Human-Readable Language Labels**: Audio streams in `metadata.formats` are now enriched using `cleanLanguageName(rawLang, note)` to provide clear language names (e.g. `English (Original)`, `Spanish (Dubbed)`, `German`, `Japanese`).
- **Original Audio Tag**: Audio tracks detect and display prominent `ORIGINAL` tags, allowing users to distinguish between multiple same-bitrate audio dubs at a glance.
- **Structured Option Cards**: Dropdown items now display color-coded quality/codec pills (`4K`, `FHD`, `HD`, `OPUS`, `MP4A`), primary titles, specs/channels subtitles, file sizes, and active checkmarks `✓`.
- **Bi-Directional Track Sync**: Selecting an audio stream in the main Audio Track dropdown seamlessly updates the Language & Captions panel and vice-versa.

## [2.8.5] - 2026-09-08

### 🎵 Original Audio Track Default Selection & Enforcement
- **Visible Original Track by Default**: The Audio Language selector now detects and highlights the real Original audio track (e.g. `English (US) (Original)`) by default, completely eliminating the ambiguous `"Default / Original"` option.
- **Dubbed Audio Prevention**: Fixed an issue where multi-track audio videos (e.g. YouTube multi-dub) defaulted to whichever arbitrary dub was first in the manifest (e.g. German, Spanish, French). The player and download queue now strictly prioritize the original language stream.
- **Backend Fallback Enforcement**: When downloading without an explicit audio dub selection, `server.js` now enforces `bestaudio[language_preference>=0]/bestaudio[format_note*=original]/bestaudio/best`, guaranteeing the original track is downloaded instead of a random dub.
- **Formatting Polish**: Cleaned up duplicate nested parentheses in audio track labels (e.g. `English (US) ((Original))` -> `English (US) (Original)`).

## [2.8.4] - 2026-09-08

### 🛡️ Cloud & Low-Memory Deployment Resilience (Render / VPS)
- **YouTube Radio & Mix Auto-Stripping**: When analyzing media URLs with video IDs (`/watch?v=...`), automatically strips dynamic YouTube Radio parameters (`list=RD...` and `start_radio=1`). Prevents automated YouTube mixes from accidentally launching 50-item background playlist extractions when users simply want the song.
- **Throttled Concurrency**: Reduced concurrent playlist format enrichment probes (`probeVideoFormats`) from 8 down to 2 (configurable via `CONCURRENT_PROBES`), decreasing peak memory consumption from ~750MB to <200MB and preventing Out-Of-Memory (OOM) container kills on 512MB RAM cloud tiers (Render Free/Starter, small VPS instances).
- **Process Crash Guards**: Added global `uncaughtException` and `unhandledRejection` safety listeners to `server.js` with structured logging, ensuring background asynchronous errors never terminate the server process.

### 🎯 Clean & Focused UI Loading State
- **Single Loading Indicator**: Removed duplicate loading spinners from the search input's left icon and right submit button. Now displays only a single, focused, centered `"Scanning Media..."` status spinner during analysis.
- **ReferenceError Fix**: Resolved a JavaScript variable scoping regression (`ReferenceError: url is not defined`) in `handleAnalyze` during deep-link query parameter parsing on initial page mount.

## [2.8.3] - 2026-09-08

### 🧭 SPA Clean Path Routing & History State Sync
- **Dedicated Route Paths**: Added first-class clean path routing without page reloads across the web client, PWA, and desktop interfaces:
  - `/` — Core media extractor, format ladder, and batch playlist engine.
  - `/downloads` (and `/download`) — Download Center with cross-platform native installers, portable builds, and source archives.
  - `/cookies` (and `/cookie`) — Cookie sanitizer and session token manager.
  - `/settings` — User preferences, resolution priorities, and default configurations.
  - `/server` — Cloud and custom backend endpoint connection selector.
  - `/update` (and `/updates`) — Version status, release notes, and update wizard.
- **Bi-Directional Route Synchronization**: Opening modals automatically updates the browser address bar path without page reloads, and browser Back/Forward navigation seamlessly opens or closes modals.
- **Universal SPA Redirection**: Added Netlify and static hosting `_redirects` (`/* /index.html 200`) and Express wildcard route handlers to serve `index.html` on direct deep path requests.

### 🔗 Deep-Link Query Auto-Analysis & Typo Repair
- **Automated Query Scanning**: Passing `?url=...`, `?q=...`, `?link=...`, or `?video=...` in the URL automatically prefills the search bar and triggers media analysis upon website load.
- **Smart Typo Repair**:
  - Automatically fixes common typos (e.g. `youtobe.com` -> `youtube.com`, `yotube.com` -> `youtube.com`).
  - Repairs broken query string syntax such as `watch?=` missing the `v` parameter (`watch?v=`).
  - Automatically prepends `https://` if the protocol was omitted.
  - Resolves raw 11-character YouTube video IDs directly into full watch URLs.

### 🛡️ GitHub Releases API Rate-Limit Resilience
- **Deterministic Static Manifest Fallback**: When GitHub API unauthenticated rate limits (HTTP 403 / 60 req/hr) are hit, `DownloadPage.jsx` instantly falls back to a deterministic 25-package release manifest.
- **Uncapped Direct CDN Mirrors**: All download links route to `github.com/AryansDevStudios/UniExtract/releases/download/...`, which runs on GitHub CDN and is never subject to API rate limits.
- **Persistent Asset Caching**: Successful releases API payloads are cached in `localStorage` for 1 hour to prevent redundant external queries.
- **Backend Updates Fallback**: Updated `/api/updates` in `server.js` to return direct release asset mirrors instead of an empty package list when rate-limited.

## [2.8.2] - 2026-09-08

### ⚡ Smart Native FFmpeg Resolution & Real GPU Probing
- **Native-First Auto-Detection**: On startup, UniExtract now automatically checks the host or container for native FFmpeg binaries (`/usr/bin/ffmpeg`, WinGet, Homebrew, Chocolatey, Scoop, and system PATH) before falling back to bundled static FFmpeg (`ffmpeg-static`).
- **Dynamic Codecs & Acceleration**: Preserves dynamic hardware acceleration libraries (NVENC, QuickSync, VA-API, VideoToolbox, AMF) that were stripped in static Linux builds.
- **Real GPU Hardware Micro-Probing**: Replaced static string matching of `-encoders` with live single-frame test-encoding (`testEncoderHardwareSupport`) to verify actual GPU driver and hardware availability, eliminating false positives (e.g., claiming NVENC/VA-API without hardware).
- **Startup Engine Controls**: Added `FFMPEG_MODE` (`auto`, `native`, `static`), `FFMPEG_PREFER_STATIC`, and `FFMPEG_PATH` environment variables.
- **Enhanced Healthcheck**: Added comprehensive FFmpeg status, version, and active hardware transcoder metadata to `GET /api/health`.

### 📦 Download Center & Release Engine
- **Direct GitHub API Fallback**: Added direct client-side fallback to GitHub's Releases API in `DownloadPage.jsx` when the backend server is unreachable or returning empty arrays.
- **Auto-Fetch on Mount**: Guaranteed download packages load immediately upon opening the Download Center.
- **Filter Reset & Retry**: Added proactive "Reset Filters" and "Retry" buttons to immediately recover if filter selections or network interruptions result in 0 visible packages.
- **GitHub Token Support**: Backend update proxy now respects `GITHUB_TOKEN` to avoid rate limits on high-traffic instances.

### 📚 Documentation & Reference Suite
- **API Reference**: Added comprehensive `docs/API_REFERENCE.md` documenting all 17 REST endpoints with request/response schemas.
- **Configuration Guide**: Added `docs/CONFIGURATION.md` detailing every environment variable, cloud parameter, and Docker Compose setup.
- **Deployment Architecture**: Modernized `docs/DEPLOYMENT_MODES.md` and `docs/ELECTRON.md` with multi-arch packaging instructions and hardware acceleration guides.


## [2.8.0] - 2026-09-08

### 🚀 Stable Release Highlights
- Promoted the unified web, PWA, Electron, and self-hosted experience to a stable production release.
- Added a structured download and release center with clear selection steps for release channel, platform, architecture, and package type.
- Added stable and pre-release package browsing with grouped artifacts, archive visibility, release metadata, and direct GitHub release links.
- Added deployment guidance for full-repository installs, frontend-only hosting, backend-only servers, Docker, Render, VPS, and direct `server.js` retrieval.

### ✂️ Accurate Full-File Trimming
- Reworked clipping so yt-dlp downloads the complete selected media before FFmpeg processing.
- Removed section/keyframe-based download clipping that could return nearby frames or incomplete source segments.
- Added server-side timestamp trimming after download with synchronized audio/video output.
- Clipped video is re-encoded with deterministic H.264 settings and clipped audio is re-encoded when necessary for reliable synchronization.
- Clipped jobs are not marked ready until the final FFmpeg output exists; failed clip processing now reports an explicit error instead of delivering the raw full file.

### 📱 Responsive Frontend Improvements
- Made mobile cards and primary media surfaces use the available viewport more effectively with reduced outer spacing.
- Converted Server Architecture and Cookies/Auth workflows into compact full-screen mobile sheets.
- Improved mobile header/logo allocation and modal action alignment.
- Rebuilt the clip scrubber with independent pointer and keyboard-accessible handles.

### 🖥️ Platform and Desktop Experience
- Preserved Electron external-link routing through the default operating-system browser.
- Kept local, cloud, PWA, Electron, Netlify, Render, and custom backend routing in the same frontend release path.
- Synchronized the production `public/` bundle with the stable application version.

### 📦 Release Contents
- Windows installer and portable packages for x64 and ARM64.
- Linux AppImage and deb packages.
- macOS dmg and zip packages.
- Release metadata and archive artifacts for managed and enterprise deployment pipelines.

---

## [2.6.7] - 2026-09-07 (DEV / Pre-release)

### 🌐 Desktop Browser & External Link Integration
- **Default OS Browser Redirection**:
  - Configured Electron's window management to intercept all external links (`target="_blank"`, `window.open()`, and non-local navigation) and open them in the user's default OS web browser (e.g. Chrome, Edge, Firefox, Brave) rather than internal Electron Chromium windows.
  - Added direct IPC bridge `window.electronAPI.openExternal(url)` through `electron/preload.js` and `electron/main.js`.
  - Updated all external UI links in `SettingsModal` (Developer Profile, Main Repository, Releases, Issue Tracker, MIT License), `UpdateModal` (GitHub Release page, direct installer assets), and `PlaylistView` (video source URLs) to cleanly delegate to the external default browser.

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
