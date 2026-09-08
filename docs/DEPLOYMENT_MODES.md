# Uni Extract - Deployment Modes & Architecture Guide 🚀

Uni Extract (UniExtract) is built with a **fully decoupled, modular architecture**. You can run the entire stack together self-contained on your local computer, run it natively as a desktop application, or split frontend and backend across different cloud providers, CDNs, Docker hosts, and home servers.

---

## 📊 Deployment Combinations Matrix

| Mode | Flavor | Codebase Needed | Target Platform | Description |
|---|---|---|---|---|
| **1** | **All-in-One Full-Stack (PWA)** | Full Repository | Local PC / Mac / Linux | Unified Express server serving bundled React client on `localhost:3000`. Installs as a standalone PWA. |
| **2** | **Backend Only (Headless Media API)** | `server.js`, `package.json`, `scripts/` | Render, Railway, Fly.io, Linux VPS, Docker | Headless media extraction, FFmpeg transcoding, and REST API. Zero frontend or Electron dependencies. |
| **3** | **Frontend Only (Static Web Client)** | `client/` folder only | Netlify, Vercel, Cloudflare Pages | Pure static React + Vite SPA. Zero Node backend needed on static host. Connects to any remote backend via in-app Server Selector. |
| **4** | **Native Desktop (Electron)** | Full Repository | Windows 10/11, macOS, Linux | Standalone binaries for Windows (x64 & ARM64), macOS (.dmg/.zip), and Linux (.AppImage/.deb). Runs embedded local engine. |
| **5** | **Pre-Built Static Production GUI** | `server.js` + `public/` | Low-RAM nodes, Raspberry Pi, Home Servers | Complete pre-compiled modern React production bundle in `public/`. Zero frontend build step or devDependencies required on device. |
| **6** | **Docker Container (GHCR)** | Pre-built image or `Dockerfile` | Linux VPS, Unraid, TrueNAS, Synology | Fully containerized multi-arch (amd64 / arm64) image with FFmpeg, Python 3, and automated healthcheck. |

---

## 🔌 Web App vs. Native Desktop: How Extraction Works

A common question is whether the **downloaded desktop app** requires an external backend, and whether the **web app** can work frontend-only:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      NATIVE DESKTOP APP (ELECTRON)                      │
│                                                                         │
│  [ React Frontend UI ] ──▶ [ Embedded Local Engine (127.0.0.1:3000) ]   │
│                                  │                                      │
│                                  ▼                                      │
│               [ Bundled yt-dlp ] + [ Bundled FFmpeg ]                   │
│                                                                         │
│  • 100% Self-Contained & Offline-Capable                                │
│  • Zero cloud hosting or external backend required                      │
│  • Unlimited downloads using your personal CPU, GPU, & bandwidth        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      HOSTED WEB CLIENT (NETLIFY / PWA)                  │
│                                                                         │
│  [ Web Browser Client ] ──(CORS Proxy)──▶ [ Remote Backend Server ]    │
│  (Netlify / Vercel / Phone)                 (Render / Docker / VPS / PC)│
│                                                   │                     │
│                                                   ▼                     │
│                                [ yt-dlp Engine ] + [ FFmpeg Transcoder ]│
│                                                                         │
│  • Accessible anywhere from mobile, tablet, or desktop browser          │
│  • Requires backend to bypass browser CORS & YouTube bot detection      │
│  • Connects to any server via the built-in Server Selector              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Can't a Web Browser Download Directly (Frontend-Only)?
1. **Browser CORS Restrictions**: Browsers forbid JavaScript running on web domains (e.g. `your-app.netlify.app`) from making direct `fetch()` requests to `youtube.com` or Google video CDNs (`googlevideo.com`). Google and Meta do not provide open CORS headers for raw video streams.
2. **Cipher Decryption & Anti-Bot Detection**: YouTube, Instagram, and TikTok require JavaScript challenge solvers (`n`-sig deciphering, player signature unscrambling, PO tokens, and visitor data cookies). Browsers cannot execute native Python/binary extraction tools inside a web sandbox.
3. **DASH / HLS Stream Muxing**: Modern streaming services deliver high-resolution video (1080p, 4K) as separate video-only and audio-only streams. An engine must download both streams and merge them into MP4/MKV via FFmpeg. WebAssembly in a browser suffers from a 2GB memory ceiling and lacks hardware GPU encoding access.

---

## 🎬 FFmpeg Engine & Real Hardware Acceleration Probing

UniExtract v2.8.2 features a **Smart Startup FFmpeg Resolution Engine** designed to maximize speed, hardware acceleration, and dynamic codec compatibility:

### Resolution Hierarchy:
1. **Host Native First**: On startup, the server automatically probes the host system or container for a native FFmpeg binary (via PATH, `where.exe`, `which`, and standard OS locations like `/usr/bin/ffmpeg`, WinGet, or Homebrew).
   - If verified via `-version`, the native binary is used.
   - Native FFmpeg unlocks **dynamic hardware acceleration** (NVIDIA NVENC, Intel QuickSync, Linux VA-API, Apple VideoToolbox, AMD AMF) and complete host codec libraries.
2. **Seamless Static Fallback**: If no native FFmpeg is detected on the device/container, it automatically falls back to bundled static FFmpeg (`ffmpeg-static`), guaranteeing zero deployment failures or setup friction.
3. **Live GPU Hardware Micro-Probing**:
   - Rather than relying on simple text checks from `ffmpeg -encoders` (which falsely report every compiled encoder even when drivers/GPUs are absent), UniExtract test-encodes a live single-frame dummy sample directly on the GPU.
   - Only encoders that **successfully initialize and encode on the actual GPU** are selected.
   - Eliminates false positives (e.g., claiming NVENC without an NVIDIA GPU, or VA-API on Windows).

### Configuration Environment Variables:
| Variable | Values | Default | Description |
|---|---|---|---|
| `FFMPEG_MODE` | `auto`, `native`, `static` | `auto` | `auto` probes native first and falls back to static. `native` strictly enforces host binary. `static` forces bundled static CPU build. |
| `FFMPEG_PREFER_STATIC` | `true`, `false` | `false` | Shorthand to force the bundled static build (`ffmpeg-static`). |
| `FFMPEG_PATH` | `/path/to/ffmpeg` | *None* | Overrides auto-detection with an explicit executable path. |

> **Render / Docker Tip**: Installing native FFmpeg (`apt-get install -y ffmpeg` or Alpine `apk add ffmpeg`) in your container automatically unlocks native system performance and codecs!

---

## 🛠️ Installation & Setup by Deployment Mode

### Mode 1: All-in-One Full-Stack (Local PC & PWA)

Best for everyday users and developers running the full application locally:

```bash
# 1. Clone repository
git clone https://github.com/AryansDevStudios/UniExtract.git
cd UniExtract

# 2. Install dependencies
npm run fullstack:install

# 3. Build frontend and launch unified server
npm run fullstack:start
```
- Open `http://localhost:3000` in Chrome, Edge, or Brave.
- Click the **Install App** icon in your browser address bar to install as a standalone PWA.

---

### Mode 2: Backend Only (Headless Media API / VPS / Cloud)

Best for hosting on an Ubuntu/Debian VPS, Raspberry Pi, Docker, or Cloud platform (Render, Railway, Fly.io). **Zero frontend build step or devDependencies required.**

#### Option A: Sparse Checkout (Fastest)
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/UniExtract.git uniextract-backend
cd uniextract-backend
git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example public

# Install production dependencies only
npm install --omit=dev

# Start backend server
npm run backend:start
```

#### Option B: Helper Scripts
- **Linux / macOS**:
  ```bash
  curl -sL https://raw.githubusercontent.com/AryansDevStudios/UniExtract/main/scripts/download-backend-only.sh | bash
  ```
- **Windows CMD**:
  ```cmd
  scripts\download-backend-only.bat
  ```

#### Production Systemd Service (`/etc/systemd/system/uniextract.service`):
```ini
[Unit]
Description=Uni Extract Media Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/uniextract-backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=COOKIE_PASSWORD=your_secure_password

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now uniextract
```

---

### Mode 3: Frontend Only (Static Client / Jamstack)

Best for deploying a static web app to Netlify, Vercel, or Cloudflare Pages.

#### Sparse Checkout:
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/UniExtract.git uniextract-frontend
cd uniextract-frontend
git sparse-checkout set client
cd client
npm install
npm run build
```

#### Netlify Deployment:
1. Connect repository to Netlify.
2. Set **Base directory**: `client`
3. Set **Build command**: `npm run build`
4. Set **Publish directory**: `client/dist`
5. `client/netlify.toml` automatically proxies `/api/*` calls to your configured backend server.

---

### Mode 4: Native Desktop App (Electron)

Standalone, self-contained desktop executables for Windows, macOS, and Linux. See [docs/ELECTRON.md](ELECTRON.md) for full details.

```bash
# Windows (x64 and ARM64 NSIS + Portable)
npm run dist:win

# Linux (.AppImage and .deb)
npm run dist:linux

# macOS (.dmg and .zip)
npm run dist:mac
```

---

### Mode 5: Pre-Built Static Production GUI (Low-RAM / Zero-Build)

Ideal for Raspberry Pi, low-tier VPSs, and home servers with limited RAM:
1. `public/` contains the pre-compiled production bundle.
2. When `client/dist` is absent, `server.js` automatically serves the pre-built React application from `public/`.
3. Enjoy the complete modern UI with **zero frontend build steps or memory overhead**.

---

### Mode 6: Docker Container (GHCR / Self-Hosted)

Multi-architecture image (amd64 / arm64) for Unraid, TrueNAS, Synology, or Kubernetes:

```bash
docker run -d \
  --name uniextract \
  -p 3000:3000 \
  -v $(pwd)/cookies.txt:/app/cookies.txt \
  -e COOKIE_PASSWORD=your_secure_password \
  -e FFMPEG_MODE=auto \
  --restart unless-stopped \
  ghcr.io/aryansDevStudios/uniextract:latest
```

---

## 🔒 Security & Environment Recommendations

1. **Remote Cloud Deployments**: Always configure `COOKIE_PASSWORD=your_password` in `.env` to prevent unauthorized users from uploading or modifying cookies via `/api/auth-tokens`.
2. **GitHub API Rate Limits**: For cloud hosts (like Render) sharing public egress IPs, define `GITHUB_TOKEN=ghp_your_token` in `.env` to allow up to 5,000 requests/hour for update checks.
3. **CORS Support**: Cross-Origin Resource Sharing is enabled by default in `server.js`, allowing any static frontend (e.g. Netlify) to safely interact with your backend.
4. **Cookie Privacy**: `cookies.txt` is gitignored by default. For cloud deployments, supply cookies securely using `COOKIES_CONTENT` or `COOKIES_BASE64` in `.env`.
