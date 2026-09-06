# Universal Media Extractor - API Documentation

This document outlines the REST API endpoints exposed by the Universal Media Extractor backend (hosted on Render). This API drives the media extraction, format resolution, and video processing engine.

## Base URL
- **Development:** `http://localhost:3000`
- **Production:** `https://universal-media-extractor-vav8.onrender.com`

---

## 1. Analyze Media URL
Extracts metadata and available formats for a given media URL (YouTube, Instagram, TikTok, etc.). This endpoint uses an in-memory cache to serve repeated requests instantly.

- **URL:** `/api/analyze`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`

### Request Body
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### Response (Success - 200 OK)
```json
{
  "title": "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
  "thumbnail": "https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/maxresdefault.webp",
  "formats": [
    {
      "id": "137",
      "ext": "mp4",
      "height": 1080,
      "resolution": "1080p",
      "vcodec": "avc1.640028",
      "acodec": null,
      "size": 80911999,
      "abr": null,
      "label": "FHD",
      "codec_info": "avc1"
    },
    {
      "id": "140",
      "ext": "m4a",
      "height": 0,
      "resolution": "Native",
      "vcodec": null,
      "acodec": "mp4a.40.2",
      "size": 3449447,
      "abr": "130kbps",
      "label": "M4A",
      "codec_info": "mp4a"
    },
    {
      "id": "313",
      "ext": "webm",
      "height": 2160,
      "resolution": "2160p",
      "vcodec": "vp9",
      "acodec": null,
      "size": 358608461,
      "abr": null,
      "label": "4K",
      "codec_info": "vp9"
    }
  ]
}
```

---

## 2. Initiate Download & Processing
Starts an asynchronous job on the server to download the requested video and audio formats, merge them using FFmpeg, and inject the high-resolution thumbnail as the video cover.

- **URL:** `/api/download`
- **Method:** `POST`
- **Headers:** `Content-Type: application/json`

### Request Body
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "vId": "137",
  "aId": "140",
  "vLabel": "FHD",
  "aLabel": "M4A",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

### Response (Success - 200 OK)
```json
{
  "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```
*Note: The frontend must use this `jobId` to poll the status endpoint.*

---

## 3. Check Job Status
Poll this endpoint every 1-2 seconds to get real-time download and FFmpeg merging progress.

- **URL:** `/api/status/:jobId`
- **Method:** `GET`

### Response (Processing)
```json
{
  "status": "downloading",
  "progress": "45.2%",
  "file": null,
  "customTag": "FHD_M4A",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

### Response (Completed)
```json
{
  "status": "completed",
  "progress": "100%",
  "file": "f47ac10b-58cc-4372-a567-0e02b2c3d479.mp4",
  "customTag": "FHD_M4A",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```
*Note: Once `status` is `"completed"`, the frontend should redirect the user to the File Delivery endpoint.*

---

## 4. File Delivery & Memory Cleanup
Serves the final processed `.mp4` file to the user as a direct download. **Crucially**, once the download completes (or is aborted), the server automatically deletes the temporary file to free up disk space.

- **URL:** `/api/file/:jobId/:title`
- **Method:** `GET`

### Example Usage (Frontend)
```javascript
// Once status === 'completed'
window.location.href = `/api/file/${jobId}/${encodeURIComponent(title)}`;
```

### Response
- **Headers:** `Content-Disposition: attachment; filename="Rick_Astley_Never_Gonna_Give_You_Up_FHD_M4A.mp4"`
- **Body:** Binary MP4 file stream.

---

## 5. Thumbnail Downloader (CORS Bypass & Format Converter)
Some platforms (like YouTube) serve thumbnails in WebP format and restrict them via CORS. This endpoint streams the image through FFmpeg on the backend to guarantee a high-quality, downloadable `.png` file.

- **URL:** `/api/thumbnail`
- **Method:** `GET`
- **Query Parameters:**
  - `imgUrl`: The raw thumbnail URL returned from `/api/analyze`
  - `title`: The title to use for the downloaded file

### Example Request
`/api/thumbnail?imgUrl=https%3A%2F%2Fi.ytimg.com%2Fvi%2FdQw4w9WgXcQ%2Fmaxresdefault.jpg&title=Rick_Astley`

### Response
- **Headers:** `Content-Disposition: attachment; filename="Rick_Astley_thumb.png"`, `Content-Type: image/png`
- **Body:** Binary PNG image stream.
