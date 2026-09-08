# Uni Extract - REST API Reference 📡

Complete specification for the Uni Extract headless media extraction, streaming, and transcoding REST API (`server.js`).

---

## 🧭 Base URL & Authentication

- **Local Default**: `http://127.0.0.1:3000`
- **Cloud / VPS**: `https://your-domain.com`
- **CORS**: Enabled by default (`*`), supporting web frontends (e.g. Netlify, Vercel, localhost).
- **Authentication**: Public endpoints require no authentication. Administrative endpoints (cookie uploads and token deletion) require `x-cookie-password` header or `password` body property when `COOKIE_PASSWORD` is configured in `.env`.

---

## 🩺 System & Health Endpoints

### 1. Health & Hardware Status
```http
GET /api/health
```
Returns system uptime, active app version, and the resolved FFmpeg binary with verified hardware acceleration capabilities.

#### Response:
```json
{
  "status": "ok",
  "version": "2.8.2",
  "uptime": 3600,
  "timestamp": 1788843317268,
  "ffmpeg": {
    "path": "C:\\Users\\aryan\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe",
    "source": "native",
    "version": "ffmpeg version 9.0.1-full_build-www.gyan.dev",
    "encoder": "h264_qsv",
    "hardwareAcceleration": "h264_qsv",
    "mode": "auto"
  }
}
```

---

### 2. Version Information
```http
GET /api/version
```
#### Response:
```json
{
  "version": "2.8.2",
  "name": "uni-extract"
}
```

---

## 🔍 Media Analysis & Stream Probing

### 3. Analyze Media URL
```http
POST /api/analyze
Content-Type: application/json
```

Probes a media link from YouTube, Instagram, TikTok, Twitter/X, Twitch, SoundCloud, Vimeo, Reddit, and 1,000+ sites.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "cookiesContent": ""
}
```

#### Response:
```json
{
  "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
  "duration": 213,
  "uploader": "Rick Astley",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "formats": [
    {
      "format_id": "137+140",
      "resolution": "1080p (FHD)",
      "extension": "mp4",
      "filesize": 54200000,
      "vcodec": "avc1.640028",
      "acodec": "mp4a.40.2"
    }
  ],
  "audioTracks": [
    { "id": "140", "language": "en", "label": "English (Original)", "bitrate": 128 }
  ],
  "subtitles": [
    { "lang": "en", "label": "English", "url": "..." }
  ],
  "chapters": []
}
```

---

## ⬇️ Media Download & Transcoding Pipeline

### 4. Initiate Download Job
```http
POST /api/download
Content-Type: application/json
```

Starts an asynchronous download and transcoding job. Returns immediately with a unique `jobId`.

#### Request Body:
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "formatId": "137+140",
  "extension": "mp4",
  "quality": "1080p",
  "audioTrack": "140",
  "isMuted": false,
  "clipStart": "00:00:30",
  "clipEnd": "00:01:00",
  "splitChapters": false,
  "embedSubs": true,
  "subLang": "en"
}
```

#### Response:
```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "starting",
  "message": "Download initiated"
}
```

---

### 5. Check Job Progress & Status
```http
GET /api/status/:jobId
```

Polls the status of an active download.

#### Response (Downloading):
```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "downloading",
  "percent": 65.4,
  "speed": "12.8 MB/s",
  "eta": "00:05",
  "totalSize": "54.2 MB",
  "filename": "Rick_Astley_Never_Gonna_Give_You_Up.mp4"
}
```

#### Response (Completed):
```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "completed",
  "percent": 100,
  "downloadUrl": "/api/file/f47ac10b-58cc-4372-a567-0e02b2c3d479/Rick_Astley_Never_Gonna_Give_You_Up.mp4",
  "filename": "Rick_Astley_Never_Gonna_Give_You_Up.mp4",
  "fileSize": 54210400
}
```

---

### 6. Decoupled Post-Processing Status
```http
GET /api/post-process-status/:jobId
```
Returns secondary transcoding progress (clipping, subtitle embedding, chapter packaging) executed after raw stream download.

---

### 7. Fetch Completed File
```http
GET /api/file/:jobId/:title
```
Streams the final transcoded media file to the client with `Content-Disposition: attachment` and `Accept-Ranges` byte streaming support.

---

### 8. Cancel Active Job
```http
POST /api/cancel/:jobId
```
Terminates the in-flight `yt-dlp` and `ffmpeg` processes immediately and wipes temporary scratch files from disk.

---

## 🍪 Cookie & Authentication Management

### 9. Get Cookie Status
```http
GET /api/auth-tokens
```
Returns whether cookies are currently loaded, total cookie count, and whether `COOKIE_PASSWORD` protection is active.

---

### 10. Update Cookies
```http
POST /api/auth-tokens
Content-Type: application/json
x-cookie-password: your_password
```
Accepts Netscape or JSON formatted cookies. Automatically sanitizes and preserves video platform session tokens while purging tracking junk.

---

### 11. Clear Cookies
```http
DELETE /api/auth-tokens
x-cookie-password: your_password
```
Removes saved session cookies from disk.

---

## 🔄 Updates & Maintenance

### 12. Query Release Updates
```http
GET /api/updates?channel=stable&force=false
```
Returns the latest available GitHub release, release notes, categories (features, fixes, security), and direct platform download assets.

### 13. Active Jobs Count (Traffic-Safe Updater)
```http
GET /api/updates/active-jobs
```
Returns `{ activeJobsCount: 0, updatePendingWhenIdle: false }`. Used by the Electron desktop shell to defer auto-updates until all downloads are finished.
