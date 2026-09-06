# Universal Media Extractor - Deployment Modes & Pairing Guide 🚀

Universal Media Extractor (UME) is designed with a **fully decoupled, modular architecture**. You can run the entire stack together on your local machine, or split it across different cloud providers, VPSs, and CDNs.

---

## 📊 Deployment Combinations Matrix

| Mode | Flavor | Codebase Needed | Target Platform | Description |
|---|---|---|---|---|
| **1** | **All-in-One Full-Stack (PWA)** | Full Repository | Local PC / Mac / Linux | Unified Express server serving bundled React client on `localhost:3000`. Installs as standalone PWA. |
| **2** | **Backend Only (Headless Media API)** | `server.js`, `package.json`, `scripts/` | Render, Railway, Fly.io, Linux VPS, Docker | Headless media extraction, FFmpeg transcoding, and REST API. Zero frontend or Electron dependencies. |
| **3** | **Frontend Only (Static Web Client)** | `client/` folder only | Netlify, Vercel, Cloudflare Pages | Pure static React + Vite SPA. Zero Node backend needed on host. Connects to any remote backend. |
| **4** | **Native Desktop (Electron)** | Full Repository | Windows 10/11, macOS, Linux | Bundled packages for Windows (x64/ARM64), macOS (dmg/zip), Linux (AppImage/deb). |
| **5** | **Pre-Built Static GUI** | `server.js` + `public/` | Low-RAM nodes, Raspberry Pi, Home Servers | Complete pre-compiled modern React production bundle in `public/`. Zero frontend build step or memory overhead required on device. |
| **6** | **Docker Container (GHCR)** | Pre-built image or `Dockerfile` | Linux VPS, Unraid, TrueNAS, Synology | Fully containerized multi-arch (amd64 / arm64) image with FFmpeg, Python 3, and healthcheck. |

---

## 🔌 Cross-Platform Pairing Matrix

Every frontend client includes an interactive **Server Selector** allowing you to switch backends on the fly:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │                     FRONTEND CLIENTS                        │
   │  [ Netlify Web App ]   [ Installed PWA ]   [ Desktop App ]  │
   └───────────────┬─────────────────┬───────────────────┬───────┘
                   │                 │                   │
                   ▼                 ▼                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  BACKEND TRANSCODING ENGINES                │
   │  [ Localhost:3000 ]   [ Cloud Render ]   [ Private VPS ]    │
   └─────────────────────────────────────────────────────────────┘
```

### Common Pairing Scenarios:
1. **Netlify Frontend + Cloud Render Backend** *(Free Cloud Setup)*:
   - Frontend hosted for free on Netlify CDN with instant global caching.
   - Backend hosted on Render free tier (auto-proxied via `client/netlify.toml`).
2. **Netlify Frontend + Private VPS Backend** *(Power User / No Limits)*:
   - Frontend accessed via Netlify web URL.
   - User opens the in-app **Server Selector** and inputs their personal VPS URL (`https://vps.example.com`).
   - All transcoding runs on their high-speed private server.
3. **PWA Localhost + Built-in Backend** *(Daily Driver / Offline)*:
   - Running `npm start` on your computer.
   - Access at `http://localhost:3000` and click **Install App** in Chrome/Edge.
   - Zero external cloud latency, infinite downloads, direct disk streaming.

---

## 🛠️ Step-by-Step Installation Guides

### Mode 1: All-in-One Full-Stack (Local PC & PWA)

Best for everyday users and developers who want the full application running on their personal machine.

```bash
# 1. Clone repository
git clone https://github.com/AryansDevStudios/Universal-Media-Extractor.git
cd Universal-Media-Extractor

# 2. Install both backend and frontend dependencies
npm run fullstack:install

# 3. Build frontend and launch unified production server
npm run fullstack:start
```
- Open `http://localhost:3000` in Chrome, Edge, or Brave.
- Click the **Install** icon in your browser's address bar to install it as a standalone Progressive Web App (PWA).

---

### Mode 2: Backend Only (Headless Media API / VPS / Cloud)

Best for hosting on an Ubuntu/Debian VPS, Raspberry Pi, Docker, or Cloud platform (Render, Railway, Fly.io). **You do not need to download the React frontend or Electron files!**

#### Option A: Download ONLY Backend via Git Sparse Checkout (Recommended)
```bash
# Clone ONLY backend files from GitHub into 'ume-backend'
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/Universal-Media-Extractor.git ume-backend
cd ume-backend
git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example public

# Install production dependencies only (NO devDependencies)
npm install --omit=dev

# Start backend server
npm run backend:start
```

#### Option B: Using Helper Script
- **Linux / macOS**:
  ```bash
  curl -sL https://raw.githubusercontent.com/AryansDevStudios/Universal-Media-Extractor/main/scripts/download-backend-only.sh | bash
  ```
- **Windows CMD**:
  ```cmd
  scripts\download-backend-only.bat
  ```

#### Backend Configuration (`.env`)
Create a `.env` file in your backend folder:
```env
PORT=3000
HOST=0.0.0.0
COOKIE_PASSWORD=your_secure_password_here

# For Render / Cloud: inject cookies without committing cookies.txt to GitHub:
# COOKIES_CONTENT=
# COOKIES_BASE64=
```

#### Running in Production (Systemd Service on Linux VPS)
Create `/etc/systemd/system/ume.service`:
```ini
[Unit]
Description=Universal Media Extractor Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/ume-backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ume
```

---

### Mode 3: Frontend Only (Static Client / Jamstack)

Best for deploying to Netlify, Vercel, Cloudflare Pages, or running a standalone React client. **You do not need Node.js backend dependencies, yt-dlp binaries, or FFmpeg on your static host!**

#### Option A: Download ONLY Frontend via Git Sparse Checkout
```bash
# Clone ONLY the client folder from GitHub into 'ume-frontend'
git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/Universal-Media-Extractor.git ume-frontend
cd ume-frontend
git sparse-checkout set client
cd client

# Install frontend dependencies
npm install

# Build production static bundle
npm run build
```

#### Option B: Deploying to Netlify
1. Connect your repository to Netlify.
2. Set **Base directory**: `client`
3. Set **Build command**: `npm run build`
4. Set **Publish directory**: `client/dist`
5. Netlify uses `client/netlify.toml` to rewrite `/api/*` calls automatically to your backend!

---

### Mode 4: Native Desktop App (Electron - Windows / macOS / Linux)

See [docs/ELECTRON.md](ELECTRON.md) for full instructions on running and packaging native desktop apps across Windows, macOS, and Linux.

```bash
# Windows executables (x64 and ARM64 NSIS + Portable)
npm run dist:win

# Linux packages (.AppImage and .deb)
npm run dist:linux

# macOS packages (.dmg and .zip)
npm run dist:mac
```

---

### Mode 5: Pre-Built Static Production GUI (Zero-Build Node / Low-RAM / Raspberry Pi)

If you are running on an ultra-low-power or low-RAM device (e.g. Raspberry Pi, low-tier VPS, home server) without the memory or tooling to compile React/Vite from scratch:
1. `public/` contains the pre-compiled production `dist` bundle generated by `npm run build`.
2. When `client/dist` is absent, `server.js` automatically serves the pre-built React application from `public/`.
3. You get the **complete, full-featured modern React + Tailwind interface** (playlist queue, server selector, audio track picker, clip editor) with **zero frontend build steps or devDependencies** on the host machine!

---

### Mode 6: Docker Container (GHCR / Self-Hosted)

Best for unRAID, TrueNAS SCALE, Synology, Proxmox, or Docker Swarm/Kubernetes home labs.

```bash
# Pull and run pre-built multi-arch image from GitHub Container Registry
docker run -d \
  --name universal-media-extractor \
  -p 3000:3000 \
  -v $(pwd)/cookies.txt:/app/cookies.txt \
  -e COOKIE_PASSWORD=your_secure_password \
  --restart unless-stopped \
  ghcr.io/aryansdevstudios/universal-media-extractor:latest
```

---

## 🔒 Security & Password Protection Across Modes

1. **Remote Cloud Backends**:
   Always set `COOKIE_PASSWORD=your_password` in `.env` on remote servers (e.g., Render or VPS). This prevents unauthorized users from modifying cookies via `/api/auth-tokens`.
2. **CORS Support**:
   Cross-Origin Resource Sharing (CORS) is enabled by default in `server.js`, allowing any static frontend (e.g., Netlify or `localhost:5173`) to safely communicate with your backend.
3. **Repository Privacy**:
   `cookies.txt` is gitignored and will never be committed to public GitHub repositories. On cloud hosts, supply cookies via `COOKIES_CONTENT` or `COOKIES_BASE64` in `.env`.
