# Universal Media Extractor - Deployment Modes & Pairing Guide 🚀

Universal Media Extractor (UME) is designed with a **fully decoupled, modular architecture**. You can run the entire stack together on your local machine, or split it across different cloud providers, VPSs, and CDNs.

---

## 📊 Deployment Combinations Matrix

| Mode | Flavor | Codebase Needed | Target Platform | Description |
|---|---|---|---|---|
| **1** | **All-in-One Full-Stack (PWA)** | Full Repository | Local PC / Mac / Linux | Unified Express server serving bundled React client on `localhost:3000`. Installs as standalone PWA. |
| **2** | **Backend Only (Headless Media API)** | `server.js`, `package.json`, `scripts/` | Render, Railway, Fly.io, Linux VPS, Docker | Headless media extraction, FFmpeg transcoding, and REST API. Zero frontend or Electron dependencies. |
| **3** | **Frontend Only (Static Web Client)** | `client/` folder only | Netlify, Vercel, Cloudflare Pages | Pure static React + Vite SPA. Zero Node backend needed on host. Connects to any remote backend. |
| **4** | **Native Desktop (Electron)** | Full Repository | Windows 10/11 | Bundled `.exe` (NSIS installer or Portable). Auto-manages backend and persistent desktop cookies. |
| **5** | **Ultra-Light Fallback GUI** | `server.js` + `public/` | Low-RAM nodes, Raspberry Pi | Single-file vanilla HTML/Tailwind CDN web GUI with zero frontend npm build step. |

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
git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example

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

### Mode 4: Native Windows Desktop App (Electron)

See [docs/ELECTRON.md](ELECTRON.md) for full instructions on running and building Windows NSIS installers and Portable executables.

```bash
# Install and build Windows executable
npm install
npm run dist:win
```

---

### Mode 5: Ultra-Light Fallback GUI (Zero-Build Vanilla Web)

If you are running on an ultra-low-power device (e.g. Raspberry Pi Zero, embedded home router) with no Node build tools:
1. Start `server.js` without running `npm run client:build`.
2. When `client/dist` is absent, `server.js` automatically falls back to serving `public/index.html`.
3. `public/index.html` uses vanilla JavaScript and Tailwind CSS via CDN, providing instant media extraction with zero frontend compilation.

---

## 🔒 Security & Password Protection Across Modes

1. **Remote Cloud Backends**:
   Always set `COOKIE_PASSWORD=your_password` in `.env` on remote servers (e.g., Render or VPS). This prevents unauthorized users from modifying cookies via `/api/auth-tokens`.
2. **CORS Support**:
   Cross-Origin Resource Sharing (CORS) is enabled by default in `server.js`, allowing any static frontend (e.g., Netlify or `localhost:5173`) to safely communicate with your backend.
3. **Repository Privacy**:
   `cookies.txt` is gitignored and will never be committed to public GitHub repositories. On cloud hosts, supply cookies via `COOKIES_CONTENT` or `COOKIES_BASE64` in `.env`.
