# Uni Extract - Environment Configuration Guide ⚙️

Uni Extract is configured via environment variables. These can be defined in a `.env` file in the root directory, through container environment parameters (Docker), or via cloud provider dashboards (Render, Railway, Fly.io).

---

## 📋 Complete Environment Variables Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | Number | `3000` | Port for the Express server to listen on. |
| `HOST` | String | `127.0.0.1` (Local) / `0.0.0.0` (Cloud) | Host interface to bind to. `127.0.0.1` restricts access to localhost, while `0.0.0.0` exposes it externally. |
| `NODE_ENV` | String | `production` | Environment mode (`development` or `production`). |
| `COOKIE_PASSWORD` | String | *Empty* | Password required to upload or delete cookies via `/api/auth-tokens`. Highly recommended on public/cloud servers. |
| `COOKIES_CONTENT` | String | *Empty* | Raw Netscape or JSON cookie string injected into memory on boot. Avoids committing `cookies.txt` to git on cloud servers. |
| `COOKIES_BASE64` | String | *Empty* | Base64-encoded `cookies.txt` content for cloud deployments. |
| `COOKIES_PATH` | String | `./cookies.txt` | Custom file path for persistent cookie storage on disk. |
| `TEMP_DIR` | String | `./temp` | Temporary folder for in-flight video downloads, audio muxing, and chapter zip bundling. |
| `CACHE_DIR` | String | `./cache` | Storage directory for cached `.info.json` metadata to prevent redundant extraction requests. |
| `FFMPEG_MODE` | String | `auto` | FFmpeg resolution mode: `auto` (Native First $\to$ Static Fallback), `native` (Strict Native), or `static` (Strict Bundled Static). |
| `FFMPEG_PREFER_STATIC` | Boolean | `false` | Convenience flag (`true`/`false`) to force the bundled static build (`ffmpeg-static`). |
| `FFMPEG_PATH` | String | *Empty* | Explicit absolute file path to a custom FFmpeg binary (overrides auto-detection). |
| `GITHUB_TOKEN` | String | *Empty* | GitHub Personal Access Token (PAT). Increases GitHub API rate limits from 60 to 5,000 requests/hour for update checks. |

---

## 💡 Example Configurations by Environment

### 1. Local PC / Developer (.env)
```env
PORT=3000
HOST=127.0.0.1
TEMP_DIR=./temp
CACHE_DIR=./cache
FFMPEG_MODE=auto
```

### 2. Render Cloud Backend (.env / Render Environment)
```env
PORT=3000
HOST=0.0.0.0
COOKIE_PASSWORD=SuperSecretPassword123!
GITHUB_TOKEN=ghp_yourPersonalAccessTokenHere
FFMPEG_MODE=auto

# Inject cookies into cloud instance without git commits:
COOKIES_BASE64=I05ldHNjYXBlIEhUVFAgQ29va2llIEZpbGUK...
```

### 3. Docker Container (docker-compose.yml)
```yaml
version: '3.8'

services:
  uniextract:
    image: ghcr.io/aryansdevstudios/uniextract:latest
    container_name: uniextract
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - COOKIE_PASSWORD=MySecurePassword
      - FFMPEG_MODE=auto
    volumes:
      - ./cookies.txt:/app/cookies.txt
      - ./temp:/app/temp
      - ./cache:/app/cache
    restart: unless-stopped
```

### 4. Headless Ubuntu / Debian VPS Systemd Service
```ini
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=COOKIE_PASSWORD=MyVpsSecretPassword
Environment=FFMPEG_MODE=native
Environment=FFMPEG_PATH=/usr/bin/ffmpeg
```
