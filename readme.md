# Universal Media Extractor (UME) 🚀

A modern, high-performance, multi-platform media extraction and transcoding engine built with **React**, **Vite**, **Tailwind CSS**, **Node.js / Express**, **yt-dlp**, and **FFmpeg**. Available as a standalone **Progressive Web App (PWA)**, a native **Windows Desktop App (Electron)**, or a lightweight web client deployable to **Netlify** with cloud backends (e.g., **Render** / **VPS**).

---

## ✨ Key Features

- 🎥 **Multi-Platform Support**: High-fidelity extraction for **YouTube**, **TikTok**, **Instagram Reels**, **Snapchat Spotlight**, **Facebook Video**, **Twitter / X**, **Twitch**, **SoundCloud**, **Vimeo**, **Reddit**, and 1,000+ more sites supported by `yt-dlp`.
- 📺 **Full Resolution Ladder**: Native 8K (4320p), 4K (2160p), 2K (1440p), 1080p FHD, 720p HD, with adaptive auto-fallback logic.
- 🎵 **Audiophile & Multi-Container Audio**:
  - Uncompressed / Lossless Copy: **FLAC**, **WAV**, **OPUS**, **M4A**.
  - High-Fidelity Transcoding: Studio 320 kbps **MP3** with embedded high-resolution ID3 album artwork and metadata.
  - Video Containers: **MP4**, **MKV**, **WebM**.
- 📋 **Batch Playlist Manager**: Probes, queues, and sequentially downloads entire YouTube playlists with synchronized real-time progress bars, per-item status tracking, and format override capabilities.
- ✂️ **Precision Time Trimming**: Built-in visual clip panel allowing sub-second or timestamp-based trimming (`HH:MM:SS`) directly via server-side FFmpeg without downloading unneeded parts.
- 📑 **Chapter Splitting**: Automatically detects YouTube video chapters and packages them into a clean, tagged `.zip` bundle.
- 🌐 **Multi-Language Audio & Subtitles**:
  - Independent audio stream picker (Original vs. Dubbed tracks).
  - Subtitle downloader & container embedder supporting **SRT**, **VTT**, **TXT** (transcript), **ASS**, and **LRC** (synced lyrics).
- 🍪 **Intelligent Cookie Sanitizer & Persistent Storage**:
  - Upload or paste `cookies.txt` (Netscape or JSON format from Cookie-Editor / EditThisCookie).
  - Automatically isolates required media platform session cookies (YouTube, Instagram, etc.) and drops tracking/junk cookies.
  - Password protected via `COOKIE_PASSWORD` to prevent unauthorized remote override.
  - Automatically preserved across portable and installed desktop updates.
- 🖥️ **Adaptive Deployment Modes**:
  - **PWA & Local Mode**: Binds securely to `127.0.0.1` and auto-hides external server selectors because backend runs locally.
  - **Electron App**: Packaged as standard Windows installer (NSIS) or self-contained Portable executable.
  - **Remote Web Mode (Netlify + Render)**: Includes a dedicated Server Selector modal allowing users to connect their frontend to custom or private backend endpoints.
- 🛡️ **Bandwidth & Resource Saver**:
  - Active download cancellation: aborting a download instantly terminates backend yt-dlp/FFmpeg child processes and deletes intermediate files.
  - Automatic temporary disk cleanup with a 15-minute grace window for multi-chunk mobile downloads.
  - In-memory analysis caching and non-blocking background disk cache warm-up.

---

## 🏗️ Architecture & Deployment Overview

Universal Media Extractor is structured into two core layers:

```text
UniversalMediaExtractor/
├── client/                     # Modern React + Vite + Tailwind frontend
│   ├── public/                 # PWA manifest, favicons, app icons
│   ├── src/                    # UI Components (SearchBox, CompactResultPanel, PlaylistView, AuthModal, ServerModal)
│   └── netlify.toml            # Netlify build & rewrite rules
├── electron/                   # Native Windows desktop host (Electron)
│   └── main.js                 # Electron main process, auto server spawning, persistent cookies
├── scripts/                    # Build, installation, and end-to-end verification scripts
├── public/                     # Pre-built modern React production distribution (dist)
├── server.js                   # High-throughput Express + yt-dlp + FFmpeg engine
└── package.json                # Project scripts & Electron builder configuration
```

### 🧩 Modular Architecture & Deployment Flavors

Universal Media Extractor is designed to be **fully decoupled**. You do **not** need to download the whole codebase if you only need the backend or only the frontend!

| Mode | Flavor | Codebase Needed | Target Platform | Description |
|---|---|---|---|---|
| **1** | **All-in-One Full-Stack (PWA)** | Full Repository | Local PC / Mac / Linux | Unified Express server serving bundled React client on `localhost:3000`. Installs as standalone PWA. |
| **2** | **Backend Only (Headless Media API)** | `server.js`, `package.json`, `scripts/` (~50KB) | Render, Railway, Fly.io, Linux VPS, Docker | Headless media extraction, FFmpeg transcoding, and REST API. Zero frontend or Electron dependencies. |
| **3** | **Frontend Only (Static Web Client)** | `client/` folder only | Netlify, Vercel, Cloudflare Pages | Pure static React + Vite SPA. Zero Node backend needed on host. Connects to any remote backend. |
| **4** | **Native Desktop (Electron)** | Full Repository | Windows 10/11 | Bundled `.exe` (NSIS installer or Portable). Auto-manages backend and persistent desktop cookies. |
| **5** | **Pre-Built Static GUI** | `server.js` + `public/` | Low-RAM nodes, Raspberry Pi, Home Servers | Complete pre-compiled modern React production bundle in `public/`. Zero frontend build step or memory overhead required on device. |

> 📖 **Complete Documentation**: Read [docs/DEPLOYMENT_MODES.md](docs/DEPLOYMENT_MODES.md) for full pairing combinations, VPS systemd setup, and cross-platform guide. For native Windows app builds, see [docs/ELECTRON.md](docs/ELECTRON.md).

---

## ⚡ Modular Download & Quick Start

Choose the flavor you want to install. You don't need to clone unnecessary components:

### Option A: All-in-One Full-Stack (Local & PWA)
```bash
git clone https://github.com/AryansDevStudios/Universal-Media-Extractor.git
cd Universal-Media-Extractor
npm run fullstack:install
npm run fullstack:start
```
Open `http://localhost:3000` and click **Install** in your browser's address bar.

### Option B: Backend Only (Headless Media Server / VPS / Render)
**Linux / macOS (One-liner download without cloning frontend):**
```bash
curl -sL https://raw.githubusercontent.com/AryansDevStudios/Universal-Media-Extractor/main/scripts/download-backend-only.sh | bash
cd ume-backend && npm run backend:start
```
**Windows (Sparse-Checkout):**
```cmd
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/Universal-Media-Extractor.git ume-backend
cd ume-backend
git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example public
npm install --omit=dev
npm run backend:start
```

### Option C: Frontend Only (Static React SPA for Netlify / Vercel)
**Sparse-Checkout (Only downloads `client/`):**
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/Universal-Media-Extractor.git ume-frontend
cd ume-frontend
git sparse-checkout set client
cd client
npm install
npm run build
```
Deploy `client/dist` to Netlify, Vercel, or GitHub Pages. Open the in-app **Server Selector** to connect to your backend!

---

## 🚀 Getting Started (Full Repository)

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [FFmpeg](https://ffmpeg.org/) installed and available in system `PATH`
- [Python 3](https://www.python.org/) (optional, yt-dlp binary is automatically downloaded by `scripts/install-ytdlp.js`)

### Installation (Standard Git Clone)

```bash
git clone https://github.com/AryansDevStudios/Universal-Media-Extractor.git
cd Universal-Media-Extractor

# Install server & client dependencies (automatically fetches latest yt-dlp binary)
npm install
npm install --prefix client
```

### Configuration (`.env`)

Copy `.env.example` to `.env` in the root directory:

```env
# Server Port (defaults to 3000)
PORT=3000

# Host Interface Binding
# - Local / PWA: defaults to 127.0.0.1 (safe, private to local machine)
# - Cloud / Remote: defaults to 0.0.0.0
# HOST=127.0.0.1

# Cookie Upload & Deletion Password Protection
# Recommended for remote / cloud servers (e.g. Render / VPS) to prevent unauthorized overrides.
COOKIE_PASSWORD=your_secure_password_here

# Cloud / Render Environment Cookies:
# Use either COOKIES_CONTENT (raw Netscape/JSON text) or COOKIES_BASE64 (base64-encoded cookies.txt).
# This allows deploying on Render or cloud VPS with working cookies without ever committing cookies.txt to GitHub!
# For local / PWA usage, the app automatically reads and preserves cookies.txt on disk.
# COOKIES_CONTENT=
# COOKIES_BASE64=

# Optional: Custom Cookies File Path
# COOKIES_PATH=./cookies.txt

# Optional: Temporary and Cache Directories
# TEMP_DIR=./temp
# CACHE_DIR=./cache
```

> **Security & Cookies Note**:
> 1. `cookies.txt` is `.gitignore`d to ensure sensitive account session tokens are **never** committed to public GitHub repositories.
> 2. For **Render / Cloud deployments**, paste your cookies into `COOKIES_CONTENT` or `COOKIES_BASE64` in your Render Environment Variables dashboard or `.env`.
> 3. For **Local / PWA / Desktop usage**, simply paste your cookies in the in-app cookie modal or keep `cookies.txt` in your local project root.
> 4. If `COOKIE_PASSWORD` is left empty, cookie uploads are open to anyone who accesses the endpoint, and the server prints a prominent red security warning at startup. For remote servers, always set `COOKIE_PASSWORD`.


---

## 💻 Running the App

### 1. Web / PWA Mode (Vite Frontend + Express Server)

**Development:**
```bash
# Run server
npm run dev

# In another terminal, run client dev server
npm run client:dev
```
Open `http://localhost:5173` in your browser.

**Production Web Build:**
```bash
# Build Vite client
npm run client:build

# Start unified production server (serves client from client/dist)
npm start
```
Open `http://localhost:3000`. You can install it as a Progressive Web App (PWA) directly from your browser's address bar.

---

### 2. Electron Desktop App

**Run in Electron Development Mode:**
```bash
npm run electron:dev
```

**Package for Windows (NSIS Installer & Portable Executable):**
```bash
npm run dist:win
```
The compiled executables will be generated in `dist-electron/`:
- `UniversalMediaExtractor-2.0.0-x64.exe` (NSIS Installer)
- `UniversalMediaExtractor-Portable-2.0.0.exe` (Standalone Portable)

In portable mode, placing a `cookies.txt` next to the executable keeps your authentication persistent across runs.

---

## 📡 REST API Reference

Universal Media Extractor exposes a full set of JSON endpoints for media extraction, streaming, and conversion:

### 1. `GET /api/health`
Health check and server uptime indicator.
- **Response**: `{ "status": "ok", "version": "2.0.0", "uptime": 120, "timestamp": 1725619200000 }`

---

### 2. `POST /api/analyze`
Extracts metadata, formats, chapters, and available tracks for a given URL.
- **Body**: `{ "url": "https://www.youtube.com/watch?v=..." }`
- **Response**: Video title, thumbnail, duration, chapters, audio tracks, subtitles, and sorted list of available video/audio streams.

---

### 3. `POST /api/download`
Starts an asynchronous download & FFmpeg processing job.
- **Body**:
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "vId": "137",
  "aId": "140",
  "vLabel": "1080p",
  "aLabel": "HQ",
  "title": "My Video",
  "container": "mp4",
  "clipStart": "00:01:00",
  "clipEnd": "00:02:30",
  "splitChapters": false,
  "embedSubs": false,
  "subLang": "en",
  "audioLang": "default"
}
```
- **Response**: `{ "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479" }`

---

### 4. `GET /api/status/:jobId`
Polls real-time progress of a download job.
- **Response**:
```json
{
  "status": "downloading",
  "progress": "74.5%",
  "speed": "12.4MiB/s",
  "eta": "00:04",
  "file": null
}
```
When completed, `status` becomes `"completed"` and `file` contains the processed filename.

---

### 5. `GET /api/file/:jobId/:title`
Streams the completed media file to the client as an attachment. Supports HTTP Range requests and keeps files available for 15 minutes before cleanup.

---

### 6. `ALL /api/cancel/:jobId`
Immediately terminates active yt-dlp child processes, kills FFmpeg pipelines, deletes intermediate temp files, and marks the job as `cancelled`.

---

### 7. `GET /api/auth-tokens` (or `/api/cookies`)
Returns summary of active cookies:
```json
{
  "exists": true,
  "count": 42,
  "domains": ["youtube.com", "instagram.com"],
  "isYouTubeAuthed": true,
  "requiresPassword": true
}
```

---

### 8. `POST /api/auth-tokens` (or `/api/cookies`)
Uploads or updates media session cookies. Automatically sanitizes input and drops tracking cookies.
- **Body**:
```json
{
  "content": "Netscape cookies.txt content or JSON array",
  "password": "your_secure_password_here"
}
```

---

### 9. `DELETE /api/auth-tokens` (or `/api/cookies`)
Clears stored cookies.
- **Body**: `{ "password": "your_secure_password_here" }`

---

### 10. `GET /api/thumbnail`
Converts and streams high-resolution video thumbnails as PNG files (bypassing CORS restrictions).
- **Query Params**: `?imgUrl=...&title=...`

---

### 11. `GET /api/subtitle`
Extracts and converts standalone subtitle tracks.
- **Query Params**: `?url=...&lang=en&format=srt&title=...` (formats: `srt`, `vtt`, `txt`, `ass`, `lrc`).

---

## 🔒 Security Best Practices

1. **Local Isolation**: By default, local and PWA server executions bind strictly to `127.0.0.1`. Do not bind to `0.0.0.0` unless running behind a reverse proxy or in a secured container.
2. **Cookie Protection**: Never expose an unauthenticated remote instance to public traffic without setting `COOKIE_PASSWORD`.
3. **Storage Persistence**: `cookies.txt` is stored securely in `%APPDATA%` on installed Windows instances or adjacent to portable executables.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 👨‍💻 Author

Crafted by **[AryansDevStudios](https://github.com/AryansDevStudios)**
