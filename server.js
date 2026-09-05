const express = require('express');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync, spawn, spawnSync } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIES = path.join(__dirname, 'cookies.txt');
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(__dirname, 'cache');

// --- INITIALIZATION ---
let ytDlpPath = null;

app.use(cors());
app.use(express.json());

if (!fs.existsSync(TEMP_DIR)) {
    console.log(`[SYSTEM] Creating temporary directory at: ${TEMP_DIR}`);
    fs.mkdirSync(TEMP_DIR);
}

if (!fs.existsSync(CACHE_DIR)) {
    console.log(`[SYSTEM] Creating yt-dlp cache directory at: ${CACHE_DIR}`);
    fs.mkdirSync(CACHE_DIR);
}

const jobs = {};
let selectedEncoder = 'libx264';

// --- IN-MEMORY METADATA CACHE ---
const analysisCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const getCachedAnalysis = (url) => {
    const entry = analysisCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        analysisCache.delete(url);
        return null;
    }
    return entry.data;
};

const setCachedAnalysis = (url, data) => {
    if (analysisCache.size > 200) {
        const oldestKey = analysisCache.keys().next().value;
        analysisCache.delete(oldestKey);
    }
    analysisCache.set(url, { timestamp: Date.now(), data });
};

// --- SYSTEM LOGGER HELPER ---
const logger = (jobId, message, type = 'INFO') => {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const idTag = jobId ? `[Job: ${jobId.substring(0, 8)}]` : '[SYSTEM]';
    const typeTag = `[${type}]`.padEnd(8);
    console.log(`${timestamp} ${idTag} ${typeTag} ${message}`);
};

// --- ENSURE YT-DLP BINARY ---
const ensureYtDlp = async () => {
    if (ytDlpPath && fs.existsSync(ytDlpPath)) {
        return ytDlpPath;
    }

    // 1. Check if ytdlp-nodejs already has a downloaded binary
    try {
        const bundled = helpers.findYtdlpBinary();
        if (bundled && fs.existsSync(bundled)) {
            ytDlpPath = bundled;
            logger(null, `Using bundled yt-dlp binary at: ${ytDlpPath}`);
            return ytDlpPath;
        }
    } catch (e) {}

    // 2. Check if yt-dlp is available in system PATH
    try {
        const checkCmd = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
        const systemPath = execSync(checkCmd).toString().trim().split(/\r?\n/)[0].trim();
        if (systemPath && fs.existsSync(systemPath)) {
            ytDlpPath = systemPath;
            logger(null, `Using system yt-dlp binary at: ${ytDlpPath}`);
            return ytDlpPath;
        }
    } catch (e) {}

    // 3. Automatically download yt-dlp binary if missing
    logger(null, `yt-dlp binary not found locally or in PATH. Downloading yt-dlp...`, "WARN");
    try {
        ytDlpPath = await helpers.downloadYtDlp();
        logger(null, `yt-dlp downloaded successfully to: ${ytDlpPath}`);
        if (process.platform !== 'win32') {
            try { fs.chmodSync(ytDlpPath, 0o755); } catch (e) {}
        }
        try {
            const ver = execSync(`"${ytDlpPath}" --version`).toString().trim();
            logger(null, `yt-dlp version: ${ver}`);
        } catch (e) {}
        return ytDlpPath;
    } catch (err) {
        logger(null, `Failed to download yt-dlp binary: ${err.message}`, "CRITICAL");
        throw err;
    }
};

// --- URL SANITIZER ---
const cleanMediaUrl = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);

        // Strip YouTube Playlist & Tracking Params
        if (parsed.hostname.includes('youtube.com')) {
            parsed.searchParams.delete('list');
            parsed.searchParams.delete('index');
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
        } else if (parsed.hostname.includes('youtu.be')) {
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
        }

        // Universal tracking parameters to strip for IG, TikTok, FB, Snap
        const trackingParams = ['igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'is_from_webapp', 'sender_device', 'share_app_id', 'feature', 'fbclid'];
        trackingParams.forEach(param => parsed.searchParams.delete(param));

        return parsed.toString();
    } catch (e) {
        return rawUrl; // Fallback to raw URL if parsing fails
    }
};

// --- HARDWARE DETECTION ENGINE ---
const detectHardware = () => {
    console.log("\n" + "=".repeat(50));
    logger(null, "Probing Hardware Acceleration Capabilities...");
    try {
        const encoders = execSync('ffmpeg -encoders').toString();

        if (encoders.includes('h264_qsv')) {
            selectedEncoder = 'h264_qsv';
            logger(null, "SUCCESS: Found Intel QuickSync (h264_qsv)", "HARDWARE");
        } else if (encoders.includes('h264_nvenc')) {
            selectedEncoder = 'h264_nvenc';
            logger(null, "SUCCESS: Found NVIDIA NVENC (h264_nvenc)", "HARDWARE");
        } else if (encoders.includes('h264_videotoolbox')) {
            selectedEncoder = 'h264_videotoolbox';
            logger(null, "SUCCESS: Found Apple VideoToolbox (h264_videotoolbox)", "HARDWARE");
        } else if (encoders.includes('h264_amf')) {
            selectedEncoder = 'h264_amf';
            logger(null, "SUCCESS: Found AMD AMF (h264_amf)", "HARDWARE");
        } else {
            logger(null, "NOTICE: No hardware encoder detected. Using CPU (libx264).", "FALLBACK");
        }
    } catch (err) {
        logger(null, "ERROR: FFmpeg probe failed. Is FFmpeg installed?", "CRITICAL");
    }
    console.log("=".repeat(50) + "\n");
};
detectHardware();

// --- ROUTE: LOGO/FAVICON SERVING ---
app.get('/favicon.ico', (req, res) => {
    const logoPath = path.join(__dirname, 'favicon.ico');
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
    } else {
        res.status(404).end();
    }
});

// Standard browser favicon request fallback
app.get('/favfavicon.ico', (req, res) => {
    const logoPath = path.join(__dirname, 'favicon.ico');
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
    } else {
        res.status(404).end();
    }
});

// --- API: ANALYZE ---
app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    const cleanedUrl = cleanMediaUrl(url); // Sanitize the URL to prevent playlist crashes
    logger(null, `Incoming analysis for URL: ${url}`);

    // Check memory cache first (instant response if previously requested)
    const cached = getCachedAnalysis(cleanedUrl);
    if (cached) {
        logger(null, `Serving cached analysis for: "${cached.title}" (instant)`);
        return res.json(cached);
    }

    try {
        await ensureYtDlp();
        const ytdlp = new YtDlp(ytDlpPath ? { binaryPath: ytDlpPath } : undefined);
        const info = await ytdlp.getInfoAsync(cleanedUrl, { cookies: COOKIES, noPlaylist: true });
        logger(null, `Metadata retrieved for: "${info.title}"`);

        // Graceful error handling to prevent backend crash if a playlist still slips through
        let rawFormats = info.formats;
        if (!rawFormats) {
            if (info.url) {
                // Some extractors (like direct Snapchat Spotlight) return a single format at the root instead of an array
                rawFormats = [info];
                // Manually inject format_id if missing so the download step knows what to request
                if (!info.format_id) info.format_id = info.format_id || '0';
            } else {
                throw new Error("No video stream found. Please ensure the link points to a specific video, not a channel or playlist.");
            }
        }

        // Safely map formats (Supports YT, FB, IG, TT, Snap natively now)
        const formats = rawFormats.map(f => {
            let label = "SD";

            // Fix: Treat missing codec fields as present unless explicitly flagged as 'none' (fixes Snapchat/IG)
            const hasVideo = f.vcodec !== 'none' && f.video_ext !== 'none';
            const hasAudio = f.acodec !== 'none' && f.audio_ext !== 'none';

            // Smart orientation detection for vertical videos (TikTok, Shorts, Reels)
            const width = f.width || 0;
            const height = f.height || 0;
            const isVertical = height > width && width > 0;

            // Use the shortest edge to accurately determine quality category (HD, FHD, 4K)
            let shortEdge = height;
            if (width && height) {
                shortEdge = Math.min(width, height);
            } else if (width && !height) {
                shortEdge = width;
            }

            if (hasVideo) {
                if (shortEdge >= 4320) label = "8K";
                else if (shortEdge >= 2160) label = "4K";
                else if (shortEdge >= 1440) label = "2K";
                else if (shortEdge >= 1080) label = "FHD";
                else if (shortEdge >= 720) label = "HD";
                else if (shortEdge >= 480) label = "SD";
                else label = "Low";
            } else {
                label = f.ext ? f.ext.toUpperCase() : "RAW";
            }

            // Determine correct display resolution text (e.g., show '1080p' for a 1080x1920 video)
            let resDisplay = 'Native';
            if (width && height) {
                resDisplay = isVertical ? `${width}p` : `${height}p`;
            } else if (height) {
                resDisplay = `${height}p`;
            } else if (width) {
                resDisplay = `${width}w`;
            }

            return {
                id: f.format_id,
                ext: f.ext,
                height: height || 0, // Kept for backend sorting logic
                resolution: resDisplay,
                vcodec: hasVideo ? (f.vcodec || 'unknown') : null,
                acodec: hasAudio ? (f.acodec || 'unknown') : null,
                size: f.filesize || f.filesize_approx || 0,
                abr: f.abr ? `${Math.round(f.abr)}kbps` : null,
                label: label,
                codec_info: hasVideo ? (f.vcodec ? f.vcodec.split('.')[0] : 'VID') : (hasAudio ? (f.acodec ? f.acodec.split('.')[0] : 'AUD') : 'RAW')
            };
        });

        const responseData = { title: info.title, thumbnail: info.thumbnail, formats };
        setCachedAnalysis(cleanedUrl, responseData);
        
        // SAVE RAW METADATA FOR INSTANT DOWNLOAD START
        const hash = Buffer.from(cleanedUrl).toString('base64url');
        const infoJsonPath = path.join(CACHE_DIR, `${hash}.info.json`);
        fs.writeFileSync(infoJsonPath, JSON.stringify(info));
        
        res.json(responseData);
    } catch (err) {
        logger(null, `Analysis failed: ${err.message}`, "ERROR");
        res.status(500).json({ error: err.message });
    }
});

// --- API: THUMBNAIL DOWNLOADER (Server-Side Bypass for CORS + WebP to PNG) ---
app.get('/api/thumbnail', (req, res) => {
    const { imgUrl, title } = req.query;
    if (!imgUrl) return res.status(400).send('No image URL provided');

    // Security check: ensure URL is an actual web resource
    try {
        const parsedUrl = new URL(imgUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
    } catch (e) {
        return res.status(400).send('Invalid URL format');
    }

    const safeTitle = (title || 'thumbnail').replace(/[^a-z0-9]/gi, '_');

    // Force browser to treat as a downloadable PNG file
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_thumb.png"`);
    res.setHeader('Content-Type', 'image/png');

    // Pipe the image through FFmpeg to convert it (e.g. YouTube WebP) into a high-quality PNG on the fly
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', imgUrl,
        '-vframes', '1',    
        '-c:v', 'png',
        '-f', 'image2pipe',
        'pipe:1'
    ]);

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.on('error', (err) => {
        logger(null, `Thumbnail conversion error: ${err.message}`, "ERROR");
        if (!res.headersSent) res.status(500).send('Failed to process thumbnail');
    });
});

// --- API: DOWNLOAD & PROCESS ---
app.post('/api/download', async (req, res) => {
    const { url, vId, aId, vLabel, aLabel, title } = req.body;
    const cleanedUrl = cleanMediaUrl(url);
    const jobId = uuidv4();
    
    // Determine dynamic extension based on user selection
    const isAudioOnly = !vId && !!aId;
    const extension = isAudioOnly ? 'mp3' : 'mp4';
    
    const namingTag = `${vLabel || 'NoVideo'}_${aLabel || 'NoAudio'}`;

    jobs[jobId] = { status: 'downloading', progress: '0%', file: null, customTag: namingTag, title, extension };

    logger(jobId, `Download initiated for "${title}" [Format: ${extension.toUpperCase()}]`, "START");

    await ensureYtDlp();
    const ytdlp = new YtDlp(ytDlpPath ? { binaryPath: ytDlpPath } : undefined);
    let formatSelection = (vId && aId) ? `${vId}+${aId}` : (vId || aId);

    // TASK 1: Build the specific FFmpeg instructions based on media type
    let ffmpegArgs = [];
    
    // SPEED UP: Bypass extraction phase completely if we have cached metadata
    const hash = Buffer.from(cleanedUrl).toString('base64url');
    const infoJsonPath = path.join(CACHE_DIR, `${hash}.info.json`);
    
    // EXPLICIT METADATA EXTRACTION FOR WINDOWS/APPLE COMPATIBILITY
    let metaTitle = title || "Unknown Title";
    let metaArtist = "Unknown Artist";
    let metaDate = "";
    let metaThumb = "";

    if (fs.existsSync(infoJsonPath)) {
        ffmpegArgs.push('--load-info-json', infoJsonPath);
        logger(jobId, "Bypassing network extraction phase using cached metadata (Instant Start)", "SPEED");
        
        try {
            const infoData = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
            if (infoData.title) metaTitle = infoData.title;
            if (infoData.uploader || infoData.channel) metaArtist = infoData.uploader || infoData.channel;
            if (infoData.upload_date) metaDate = infoData.upload_date.substring(0, 4);
            if (infoData.thumbnail) metaThumb = infoData.thumbnail;
        } catch (e) {}
    }
    
    // Store metadata explicitly in the job to use during Task 2 Thumbnail Injection
    jobs[jobId].metaTitle = metaTitle;
    jobs[jobId].metaArtist = metaArtist;
    jobs[jobId].metaDate = metaDate;
    jobs[jobId].metaThumb = metaThumb;
    
    if (isAudioOnly) {
        // Extract audio and convert directly to MP3
        ffmpegArgs.push(
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--add-metadata', // yt-dlp first pass
            '--write-thumbnail', // Save cover art
            '--convert-thumbnails', 'jpg',
            '-o', `${jobId}.%(ext)s`
        );
    } else {
        // Merge Video + Audio and ensure MP4 container
        // Adding -pix_fmt yuv420p prevents hardware encoders (QuickSync/NVENC) from crashing on 10-bit/AV1 streams
        ffmpegArgs.push(
            '--merge-output-format', extension,
            '--recode-video', extension,
            '--postprocessor-args', `VideoConvertor:-c:v ${selectedEncoder} -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k`,
            '--postprocessor-args', `Merger:-c:v ${selectedEncoder} -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 192k`,
            '--add-metadata', // yt-dlp first pass
            '--write-thumbnail',
            '--convert-thumbnails', 'jpg',
            '-o', `${jobId}.%(ext)s`
        );
    }

    ytdlp.download(cleanedUrl)
        .cookies(COOKIES)
        .format(formatSelection)
        .output(TEMP_DIR)
        .on('progress', (p) => {
            if (jobs[jobId]) {
                jobs[jobId].progress = p.percentage_str || '0%';
                const pInt = parseInt(p.percentage_str);
                if (pInt % 25 === 0) logger(jobId, `Progress: ${p.percentage_str}`, "PROGRESS");
            }
        })
        .run(ffmpegArgs)
        .then((result) => {
            if (result.filePaths && result.filePaths.length > 0) {
                // If yt-dlp's hardware encoder crashed, it silently falls back to .webm or .mkv. We MUST detect the actual extension.
                const finalFile = result.filePaths.find(p => p.endsWith(`.${extension}`)) || result.filePaths[0];
                const baseName = finalFile.substring(0, finalFile.lastIndexOf('.'));
                const actualExt = finalFile.split('.').pop(); // 'mp4', 'webm', 'mkv', or 'mp3'
                jobs[jobId].extension = actualExt; // Tell the delivery route the correct container

                const possibleThumbs = [baseName + '.jpg', baseName + '.webp', baseName + '.png'];
                let thumbFile = possibleThumbs.find(f => fs.existsSync(f));

                const mTitle = jobs[jobId].metaTitle;
                const mArtist = jobs[jobId].metaArtist;
                const mDate = jobs[jobId].metaDate;
                const mThumb = jobs[jobId].metaThumb;

                // If yt-dlp skipped thumbnail download because of --load-info-json, explicitly fetch it manually!
                if (!thumbFile && mThumb) {
                    logger(jobId, `Manual thumbnail fetch triggered for Task 2...`, "THUMB");
                    const manualThumb = baseName + '_manual.jpg';
                    try {
                        execSync(`ffmpeg -y -i "${mThumb}" -vframes 1 "${manualThumb}" -hide_banner -loglevel error`);
                        if (fs.existsSync(manualThumb)) thumbFile = manualThumb;
                    } catch (e) {
                        logger(jobId, `Manual thumbnail fetch failed.`, "WARN");
                    }
                }

                // TASK 2: Use an isolated FFmpeg operation to natively embed the thumbnail and force metadata
                if (fs.existsSync(finalFile)) {
                    try {
                        let embedArgs = [];
                        // Keep the exact same container extension to prevent FFmpeg from blindly trying to transcode streams during a metadata copy
                        const embeddedFile = baseName + '_with_meta.' + actualExt;

                        if (thumbFile) {
                            logger(jobId, `Task 2: Injecting high-res thumbnail and metadata into ${actualExt.toUpperCase()}...`, "META");
                            if (isAudioOnly) {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-i', thumbFile,
                                    '-map', '0:0', '-map', '1:0', '-c', 'copy', '-map_metadata', '0', '-id3v2_version', '3',
                                    '-metadata', `title=${mTitle}`, '-metadata', `artist=${mArtist}`, '-metadata', `album=${mArtist} (YouTube)`, '-metadata', `date=${mDate}`,
                                    '-metadata:s:v', 'title="Album cover"', '-metadata:s:v', 'comment="Cover (front)"',
                                    embeddedFile
                                ];
                            } else {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-i', thumbFile,
                                    '-map', '0', '-map', '1', '-c', 'copy', '-map_metadata', '0',
                                    '-metadata', `title=${mTitle}`, '-metadata', `artist=${mArtist}`, '-metadata', `album=${mArtist} (YouTube)`, '-metadata', `date=${mDate}`,
                                    '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic',
                                    embeddedFile
                                ];
                            }
                        } else {
                            logger(jobId, `Task 2: Thumbnail completely missing. Injecting ONLY metadata into ${actualExt.toUpperCase()}...`, "META");
                            if (isAudioOnly) {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-c', 'copy', '-map_metadata', '0', '-id3v2_version', '3',
                                    '-metadata', `title=${mTitle}`, '-metadata', `artist=${mArtist}`, '-metadata', `album=${mArtist} (YouTube)`, '-metadata', `date=${mDate}`,
                                    embeddedFile
                                ];
                            } else {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-c', 'copy', '-map_metadata', '0',
                                    '-metadata', `title=${mTitle}`, '-metadata', `artist=${mArtist}`, '-metadata', `album=${mArtist} (YouTube)`, '-metadata', `date=${mDate}`,
                                    embeddedFile
                                ];
                            }
                        }

                        // Run Task 2 natively
                        spawnSync('ffmpeg', embedArgs);

                        // Replace the original with our newly embedded version
                        if (fs.existsSync(embeddedFile)) {
                            fs.unlinkSync(finalFile);
                            if (thumbFile) fs.unlinkSync(thumbFile);
                            fs.renameSync(embeddedFile, finalFile);
                        }
                    } catch (err) {
                        logger(jobId, `Metadata injection failed, proceeding with original. Error: ${err.message}`, "WARN");
                    }
                }

                if (jobs[jobId]) {
                    jobs[jobId].status = 'completed';
                    jobs[jobId].file = path.basename(finalFile);
                    logger(jobId, `Processing Finished. Output: ${jobs[jobId].file}`, "SUCCESS");
                }
            }
        })
        .catch((err) => {
            if (jobs[jobId]) jobs[jobId].status = 'error';
            logger(jobId, `Download/Merge error: ${err.message}`, "ERROR");
        });

    res.json({ jobId });
});

// --- API: STATUS ---
app.get('/api/status/:jobId', (req, res) => {
    res.json(jobs[req.params.jobId] || {});
});

// --- API: DELIVERY & CLEANUP ---
app.get('/api/file/:jobId/:title', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(400).send('File not ready');

    const filePath = path.join(TEMP_DIR, job.file);
    const safeTitle = req.params.title.replace(/[^a-z0-9]/gi, '_');

    // Dynamically use the correct extension (MP4 or MP3)
    const finalExt = job.extension || 'mp4';
    const finalName = `${safeTitle}_${job.customTag}.${finalExt}`;

    logger(req.params.jobId, `Transmitting file to client: ${finalName}`, "SEND");

    // ==========================================
    // DEBUG: Dump final metadata to console
    // ==========================================
    try {
        console.log(`\n================= METADATA VERIFICATION =================`);
        console.log(`File: ${job.file}`);
        // Run FFmpeg to print format/metadata. Exit code 1 is normal because no output is specified.
        const metaDump = execSync(`ffmpeg -i "${filePath}" -hide_banner -f null - 2>&1`, { stdio: 'pipe' }).toString();
        
        // Only print the lines that are actually related to Metadata/Stream details to keep the log clean
        const cleanMeta = metaDump.split('\n').filter(line => line.includes('Metadata:') || line.includes('  title ') || line.includes('  artist ') || line.includes('  album ') || line.includes('  date ') || line.includes('Stream #')).join('\n');
        console.log(cleanMeta || metaDump);
        console.log(`=========================================================\n`);
    } catch (e) {
        const metaDump = e.stdout ? e.stdout.toString() : (e.stderr ? e.stderr.toString() : "");
        const cleanMeta = metaDump.split('\n').filter(line => line.includes('Metadata:') || line.includes('    title') || line.includes('    artist') || line.includes('    album') || line.includes('    date') || line.includes('Stream #')).join('\n');
        console.log(`\n================= METADATA VERIFICATION =================\n${cleanMeta || metaDump}\n=========================================================\n`);
    }

    res.download(filePath, finalName, (err) => {
        if (err) {
            logger(req.params.jobId, `Transmission interrupted: ${err.message}`, "WARN");
        }

        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                logger(req.params.jobId, `CLEANUP: Deleted temporary file ${job.file}`, "DELETE");
            }
            delete jobs[req.params.jobId];
            logger(req.params.jobId, `Session closed. Memory purged.`, "PURGE");
        } catch (e) {
            logger(req.params.jobId, `Cleanup failed: ${e.message}`, "ERROR");
        }
    });
});

// --- SERVE THE UI ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- BOOT-TIME WARM-UP (primes yt-dlp disk cache in background) ---
const warmUpYtDlp = () => {
    if (!ytDlpPath) return;
    logger(null, 'Warming up yt-dlp engine (background, non-blocking)...');
    const warmup = spawn(ytDlpPath, [
        '--simulate',
        '--no-playlist',
        '--cookies', COOKIES,
        '--cache-dir', CACHE_DIR,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    ], { stdio: 'ignore' });
    warmup.on('close', (code) => {
        logger(null, `yt-dlp warm-up completed (exit: ${code}) — disk cache primed`);
    });
    warmup.on('error', () => {
        logger(null, 'yt-dlp warm-up skipped (non-critical)', 'WARN');
    });
};

// --- START SERVER ---
(async () => {
    try {
        await ensureYtDlp();
    } catch (err) {
        logger(null, `Initial yt-dlp setup warning: ${err.message}`, "WARN");
    }

    app.listen(PORT, () => {
        console.log("\n" + "=".repeat(50));
        console.log(`[SERVER] Universal Media Extractor Server running on port ${PORT}`);
        console.log(`[TEMP] Temp Folder: ${TEMP_DIR}`);
        console.log(`[CACHE] Cache Folder: ${CACHE_DIR}`);
        console.log("=".repeat(50) + "\n");

        // Non-blocking: prime the yt-dlp disk cache while server is already accepting requests
        warmUpYtDlp();
    });
})();