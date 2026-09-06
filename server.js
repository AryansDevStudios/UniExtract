const express = require('express');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync, spawn, spawnSync, exec } = require('child_process');
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

// --- IN-FLIGHT DOWNLOAD ABORT & CLEANUP HELPER ---
const abortJob = (jobId, reason = 'Client disconnected or cancelled') => {
    const job = jobs[jobId];
    if (!job || job.status === 'completed' || job.status === 'cancelled') return;

    logger(jobId, `Aborting in-flight download: ${reason}`, "ABORT");
    job.status = 'cancelled';

    // 1. Kill yt-dlp child process tree
    if (job.downloadInstance) {
        try {
            if (process.platform === 'win32' && job.downloadInstance.pid) {
                execSync(`taskkill /pid ${job.downloadInstance.pid} /T /F`, { stdio: 'ignore' });
            } else {
                job.downloadInstance.kill('SIGKILL');
            }
        } catch (e) {}
    }

    // 2. Kill Task 2 FFmpeg conversion process if running
    if (job.activeFfmpeg && job.activeFfmpeg.pid) {
        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${job.activeFfmpeg.pid} /T /F`, { stdio: 'ignore' });
            } else {
                job.activeFfmpeg.kill('SIGKILL');
            }
        } catch (e) {}
    }

    // 3. Immediately purge partial downloaded files to save disk space
    try {
        const files = fs.readdirSync(TEMP_DIR);
        files.forEach(f => {
            if (f.includes(jobId) || (job.baseName && f.includes(job.baseName))) {
                try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch (e) {}
            }
        });
        logger(jobId, `Bandwidth usage halted & partial temporary files purged.`, "CLEANUP");
    } catch (e) {}

    // 4. Remove from jobs memory after brief grace period
    setTimeout(() => {
        delete jobs[jobId];
    }, 4000);
};

// Automatic watchdog: if client stops polling for > 60 seconds (e.g. closed browser / killed app), drop the download
// Uses a 60s timeout, a 45s startup grace period, and active-progress protection to prevent false aborts
// when tabs are backgrounded (browser timer throttling) or when downloading large previous files.
const WATCHDOG_TIMEOUT_MS = 60000;
const STARTUP_GRACE_PERIOD_MS = 45000;

setInterval(() => {
    const now = Date.now();
    Object.entries(jobs).forEach(([jobId, job]) => {
        if (job.status !== 'downloading') return;
        
        // 1. Never abort during the initial startup grace period (yt-dlp launch + stream negotiation)
        if (job.createdAt && (now - job.createdAt < STARTUP_GRACE_PERIOD_MS)) return;
        
        // 2. Never abort if yt-dlp is actively downloading chunks right now (< 20s ago)
        if (job.lastProgressTime && (now - job.lastProgressTime < 20000)) return;
        
        // 3. Only abort if client has completely ceased polling for > 60 seconds
        if (job.lastPoll && (now - job.lastPoll > WATCHDOG_TIMEOUT_MS)) {
            abortJob(jobId, 'Client stopped polling for > 60s (browser tab closed or unreachable)');
        }
    });
}, 5000);

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

        // Strip YouTube tracking params, but PRESERVE playlist parameters (list=...) for playlists
        if (parsed.hostname.includes('youtube.com')) {
            const listParam = parsed.searchParams.get('list');
            const isPlaylistUrl = parsed.pathname.includes('/playlist') || (listParam && !parsed.searchParams.has('v'));
            
            // Handle dynamic YouTube Radio / Mixes (list=RD...)
            if (listParam && listParam.startsWith('RD')) {
                // If it's a /playlist URL, convert to /watch?v=<seedVideoId>&list=RD... so YouTube does not 404
                if (parsed.pathname.includes('/playlist') && !parsed.searchParams.has('v')) {
                    const seedVideoId = listParam.replace(/^RD(AMVM|AMBN|CLAK5uy_)?/, '').slice(0, 11);
                    if (seedVideoId && seedVideoId.length >= 11) {
                        parsed.pathname = '/watch';
                        parsed.searchParams.set('v', seedVideoId);
                    }
                }
            } else if (!isPlaylistUrl && !parsed.pathname.includes('/playlist')) {
                // If it's a watch URL without playlist ID, delete list
                if (!listParam || (!listParam.startsWith('PL') && !listParam.startsWith('OLAK') && !listParam.startsWith('UU') && !listParam.startsWith('FL'))) {
                    parsed.searchParams.delete('list');
                }
            }
            parsed.searchParams.delete('index');
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
            parsed.searchParams.delete('playnext');
        } else if (parsed.hostname.includes('youtu.be')) {
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
            parsed.searchParams.delete('playnext');
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

// --- FORMAT EXTRACTION & PLAYLIST ENRICHMENT ENGINE ---
const formatMemoryCache = new Map();
const playlistEnrichmentJobs = {};

function categorizeHeights(rawHeights) {
    const heights = [...new Set(rawHeights.filter(h => typeof h === 'number' && h > 0))].sort((a,b) => b-a);
    const videoResolutions = [];
    
    if (heights.some(h => h >= 4320)) videoResolutions.push('8k');
    if (heights.some(h => h >= 2000)) videoResolutions.push('4k');
    if (heights.some(h => h >= 1400)) videoResolutions.push('1440p');
    if (heights.some(h => h >= 1000)) videoResolutions.push('1080p');
    if (heights.some(h => h >= 700)) videoResolutions.push('720p');
    if (heights.some(h => h >= 460)) videoResolutions.push('480p');
    if (heights.some(h => h >= 300)) videoResolutions.push('360p');
    if (heights.some(h => h >= 200)) videoResolutions.push('240p');
    if (heights.some(h => h > 0 && h < 200)) videoResolutions.push('144p');

    // Always include audio-only
    videoResolutions.push('none');

    const maxHeight = heights.length > 0 ? heights[0] : 0;
    let maxRes = '360p';
    let qualityBadge = 'SD';

    if (maxHeight >= 4320) { maxRes = '8k'; qualityBadge = '8K UHD'; }
    else if (maxHeight >= 2000) { maxRes = '4k'; qualityBadge = '4K UHD'; }
    else if (maxHeight >= 1400) { maxRes = '1440p'; qualityBadge = '2K QHD'; }
    else if (maxHeight >= 1000) { maxRes = '1080p'; qualityBadge = '1080p FHD'; }
    else if (maxHeight >= 700) { maxRes = '720p'; qualityBadge = '720p HD'; }
    else if (maxHeight >= 460) { maxRes = '480p'; qualityBadge = '480p SD'; }
    else if (maxHeight >= 300) { maxRes = '360p'; qualityBadge = '360p'; }
    else if (maxHeight >= 200) { maxRes = '240p'; qualityBadge = '240p'; }
    else { maxRes = '144p'; qualityBadge = '144p'; }

    return {
        heights,
        maxHeight,
        maxRes,
        qualityBadge,
        videoResolutions
    };
}

function categorizeAudio(rawBitrates, rawCodecs = []) {
    const bitrates = [...new Set(rawBitrates.filter(b => typeof b === 'number' && b > 0))].sort((a,b) => b-a);
    const validCodecs = [...new Set(rawCodecs.filter(c => typeof c === 'string' && c !== 'none'))];
    const hasAudio = bitrates.length > 0 || validCodecs.length > 0;
    const maxAbr = bitrates.length > 0 ? Math.round(bitrates[0]) : (hasAudio ? 128 : 0);

    const audioQualities = [];
    let audioBadge = 'No Audio';
    let maxAudioRes = 'none';

    if (hasAudio) {
        // YouTube serves native Opus (format 251, ~120-160k) or AAC (format 140, ~128k).
        // Opus 120-160k / AAC 128k provides studio clarity qualifying for 320k/256k MP3/AAC export.
        if (maxAbr >= 115) {
            audioBadge = '320k HQ';
            maxAudioRes = '320k';
            audioQualities.push('best', '320k', '256k', '192k', '128k');
        } else if (maxAbr >= 80) {
            audioBadge = '192k';
            maxAudioRes = '192k';
            audioQualities.push('best', '192k', '128k');
        } else {
            audioBadge = '128k';
            maxAudioRes = '128k';
            audioQualities.push('best', '128k');
        }
    }
    audioQualities.push('none');

    return {
        hasAudio,
        bitrates,
        maxAbr,
        audioBadge,
        maxAudioRes,
        audioQualities
    };
}

function probeVideoFormats(videoId) {
    if (formatMemoryCache.has(videoId)) {
        return Promise.resolve(formatMemoryCache.get(videoId));
    }
    const cacheFile = path.join(CACHE_DIR, `${videoId}.format.json`);
    if (fs.existsSync(cacheFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            formatMemoryCache.set(videoId, data);
            return Promise.resolve(data);
        } catch (e) {}
    }

    return new Promise((resolve) => {
        const bin = ytDlpPath || 'yt-dlp';
        const cmd = `"${bin}" --no-playlist --cookies "${COOKIES}" --print "%(resolution)s | %(formats.:.height)j | %(formats.:.abr)j | %(formats.:.acodec)j" "https://www.youtube.com/watch?v=${videoId}"`;
        exec(cmd, { windowsHide: true, timeout: 25000 }, (err, stdout) => {
            if (err || !stdout) {
                const fallback = categorizeHeights([1080, 720, 480, 360]);
                fallback.audio = categorizeAudio([128], ['opus']);
                return resolve(fallback);
            }
            try {
                const parts = stdout.trim().split(' | ');
                const rawHeights = JSON.parse(parts[1] || '[]');
                const rawAbr = JSON.parse(parts[2] || '[]');
                const rawCodecs = JSON.parse(parts[3] || '[]');
                const cat = categorizeHeights(rawHeights);
                cat.audio = categorizeAudio(rawAbr, rawCodecs);

                formatMemoryCache.set(videoId, cat);
                try {
                    fs.writeFileSync(cacheFile, JSON.stringify(cat));
                } catch (we) {}
                resolve(cat);
            } catch (pe) {
                const fallback = categorizeHeights([1080, 720, 480, 360]);
                fallback.audio = categorizeAudio([128], ['opus']);
                resolve(fallback);
            }
        });
    });
}

function updatePlaylistMaxResolution(job) {
    if (job.maxPlaylistHeight >= 4320) job.maxPlaylistResolution = '8k';
    else if (job.maxPlaylistHeight >= 2000) job.maxPlaylistResolution = '4k';
    else if (job.maxPlaylistHeight >= 1400) job.maxPlaylistResolution = '1440p';
    else if (job.maxPlaylistHeight >= 1000) job.maxPlaylistResolution = '1080p';
    else if (job.maxPlaylistHeight >= 700) job.maxPlaylistResolution = '720p';
    else if (job.maxPlaylistHeight >= 460) job.maxPlaylistResolution = '480p';
    else if (job.maxPlaylistHeight >= 300) job.maxPlaylistResolution = '360p';
    else if (job.maxPlaylistHeight >= 200) job.maxPlaylistResolution = '240p';
    else job.maxPlaylistResolution = '144p';

    let maxAbr = 0;
    let anyAudio = false;
    const probedKeys = Object.keys(job.items);
    for (const id of probedKeys) {
        const a = job.items[id]?.audio;
        if (a && a.hasAudio) {
            anyAudio = true;
            if (a.maxAbr > maxAbr) maxAbr = a.maxAbr;
        }
    }
    if (probedKeys.length === 0) {
        job.maxPlaylistAudio = '320k';
    } else if (!anyAudio) {
        job.maxPlaylistAudio = 'none';
    } else if (maxAbr >= 250) {
        job.maxPlaylistAudio = '320k';
    } else if (maxAbr >= 160) {
        job.maxPlaylistAudio = '256k';
    } else {
        job.maxPlaylistAudio = '320k';
    }
}

function startPlaylistEnrichment(playlistId, items) {
    let job = playlistEnrichmentJobs[playlistId];
    if (!job) {
        job = {
            playlistId,
            total: items.length,
            completed: 0,
            isDone: false,
            items: {},
            maxPlaylistResolution: '1080p',
            maxPlaylistHeight: 1080,
            maxPlaylistAudio: '320k'
        };
        playlistEnrichmentJobs[playlistId] = job;
    }

    const pendingItems = [];
    for (const item of items) {
        if (job.items[item.id]) continue;

        if (formatMemoryCache.has(item.id)) {
            const cached = formatMemoryCache.get(item.id);
            job.items[item.id] = cached;
            if (cached.maxHeight > job.maxPlaylistHeight) {
                job.maxPlaylistHeight = cached.maxHeight;
            }
        } else {
            const cacheFile = path.join(CACHE_DIR, `${item.id}.format.json`);
            if (fs.existsSync(cacheFile)) {
                try {
                    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                    formatMemoryCache.set(item.id, cached);
                    job.items[item.id] = cached;
                    if (cached.maxHeight > job.maxPlaylistHeight) {
                        job.maxPlaylistHeight = cached.maxHeight;
                    }
                    continue;
                } catch (e) {}
            }
            pendingItems.push(item);
        }
    }

    job.completed = Object.keys(job.items).length;
    updatePlaylistMaxResolution(job);

    if (pendingItems.length === 0) {
        job.isDone = true;
        return job;
    }

    // Launch background worker pool (concurrency: 8)
    (async () => {
        logger(null, `Starting format analysis for playlist "${playlistId}" (${pendingItems.length} videos to probe)`, "ANALYSIS");
        const executing = [];
        for (const item of pendingItems) {
            const p = probeVideoFormats(item.id).then(formatData => {
                job.items[item.id] = formatData;
                job.completed = Object.keys(job.items).length;
                if (formatData.maxHeight > job.maxPlaylistHeight) {
                    job.maxPlaylistHeight = formatData.maxHeight;
                    updatePlaylistMaxResolution(job);
                }
                executing.splice(executing.indexOf(p), 1);
            }).catch(() => {
                job.completed = Object.keys(job.items).length;
                executing.splice(executing.indexOf(p), 1);
            });
            executing.push(p);
            if (executing.length >= 8) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
        job.isDone = true;
        updatePlaylistMaxResolution(job);
        logger(null, `Playlist "${playlistId}" format analysis completed: ${job.completed}/${job.total} videos probed. Highest resolution: ${job.maxPlaylistResolution.toUpperCase()}`, "SUCCESS");
    })();

    return job;
}

// --- API: PLAYLIST FORMATS STREAM / STATUS ---
app.get('/api/playlist-formats/:playlistId', (req, res) => {
    const job = playlistEnrichmentJobs[req.params.playlistId];
    if (!job) {
        return res.json({ isDone: true, completed: 0, total: 0, items: {}, maxPlaylistResolution: '1080p', maxPlaylistHeight: 1080, maxPlaylistAudio: '320k' });
    }
    res.json({
        playlistId: job.playlistId,
        total: job.total,
        completed: job.completed,
        isDone: job.isDone,
        items: job.items,
        maxPlaylistResolution: job.maxPlaylistResolution || '1080p',
        maxPlaylistHeight: job.maxPlaylistHeight || 1080,
        maxPlaylistAudio: job.maxPlaylistAudio || '320k'
    });
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
        
        const isPlaylist = cleanedUrl.includes('/playlist') || cleanedUrl.includes('list=');
        const isMix = cleanedUrl.includes('list=RD');

        const ytdlpOptions = { 
            cookies: COOKIES, 
            flatPlaylist: isPlaylist,
            noPlaylist: !isPlaylist
        };

        // Cap infinite dynamic YouTube mixes to the top 50 songs for instant snappy response
        if (isMix) {
            ytdlpOptions.playlistItems = '1-50';
        }

        const info = await ytdlp.getInfoAsync(cleanedUrl, ytdlpOptions);
        
        // 1. HANDLE PLAYLISTS
        if (info._type === 'playlist' || Array.isArray(info.entries)) {
            const rawItems = info.entries || [];
            const items = rawItems.filter(item => item && item.id).map((item, idx) => {
                const thumb = (item.thumbnails && item.thumbnails.length > 0)
                    ? item.thumbnails[item.thumbnails.length - 1].url
                    : `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;

                let durText = '--:--';
                if (item.duration) {
                    const m = Math.floor(item.duration / 60);
                    const s = Math.floor(item.duration % 60);
                    durText = `${m}:${s < 10 ? '0' : ''}${s}`;
                }

                // Detect potential format hints from title or thumbnail
                const titleUpper = (item.title || '').toUpperCase();
                let qualityHint = 'HD';
                if (titleUpper.includes('8K') || titleUpper.includes('4320P')) {
                    qualityHint = '8K';
                } else if (titleUpper.includes('4K') || titleUpper.includes('2160P') || titleUpper.includes('UHD')) {
                    qualityHint = '4K';
                } else if (titleUpper.includes('1440P') || titleUpper.includes('2K')) {
                    qualityHint = '2K';
                } else if (titleUpper.includes('1080P') || titleUpper.includes('FHD')) {
                    qualityHint = '1080p';
                } else if (thumb && (thumb.includes('maxres') || thumb.includes('sddefault'))) {
                    qualityHint = 'FHD/HD';
                }

                return {
                    index: idx + 1,
                    id: item.id,
                    title: item.title || `Video ${idx + 1}`,
                    duration: item.duration || 0,
                    durationText: durText,
                    thumbnail: thumb,
                    url: `https://www.youtube.com/watch?v=${item.id}`,
                    uploader: item.uploader || item.channel || info.uploader || '',
                    qualityHint
                };
            });

            const playlistId = info.id || Buffer.from(cleanedUrl).toString('base64url');
            const enrichment = startPlaylistEnrichment(playlistId, items);

            // If any items are already analyzed, attach them directly
            items.forEach(it => {
                if (enrichment.items[it.id]) {
                    it.formatData = enrichment.items[it.id];
                    it.qualityHint = enrichment.items[it.id].qualityBadge;
                }
            });

            const playlistThumb = info.thumbnails?.[0]?.url || items[0]?.thumbnail || '';

            const responseData = {
                isPlaylist: true,
                id: playlistId,
                title: info.title || 'YouTube Playlist',
                uploader: info.uploader || info.channel || 'Various Artists',
                itemCount: items.length,
                thumbnail: playlistThumb,
                items,
                maxPlaylistResolution: enrichment.maxPlaylistResolution || '1080p',
                maxPlaylistAudio: enrichment.maxPlaylistAudio || '320k',
                isFormatsComplete: enrichment.isDone,
                initialFormatData: enrichment.items
            };

            setCachedAnalysis(cleanedUrl, responseData);
            logger(null, `Playlist retrieved: "${info.title}" (${items.length} videos, ${enrichment.completed}/${items.length} formats ready)`);
            return res.json(responseData);
        }

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

        // Safely filter and map formats (exclude internal HLS manifests and empty storyboards)
        const validFormats = rawFormats.filter(f => {
            if (f.format_note === 'storyboard' || f.protocol === 'm3u8_native') return false;
            const hasRealVideo = f.vcodec && f.vcodec !== 'none';
            const hasRealAudio = f.acodec && f.acodec !== 'none';
            const isDirectFallback = !f.vcodec && !f.acodec && (f.ext === 'mp4' || f.ext === 'webm');
            return hasRealVideo || hasRealAudio || isDirectFallback;
        });

        const formats = validFormats.map(f => {
            let label = "SD";

            const hasVideo = f.vcodec ? f.vcodec !== 'none' : (!f.acodec && (f.ext === 'mp4' || f.ext === 'webm'));
            const hasAudio = f.acodec ? f.acodec !== 'none' : (!f.vcodec && (f.ext === 'mp4' || f.ext === 'webm'));

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
    const { url, vId, aId, vLabel, aLabel, title, qualityPreset, videoQuality, audioQuality } = req.body;
    const cleanedUrl = cleanMediaUrl(url);
    const jobId = uuidv4();
    
    let isAudioOnly = false;
    let isMuted = false;
    let formatSelection = '';
    let extension = 'mp4';
    let namingTag = '';

    const heightMap = {
        '8k': 4320,
        '4k': 2160,
        '1440p': 1440,
        '2k': 1440,
        '1080p': 1080,
        '720p': 720,
        '480p': 480,
        '360p': 360,
        '240p': 240,
        '144p': 144
    };

    // Determine target video & audio quality
    let targetVideo = videoQuality;
    let targetAudio = audioQuality;

    // Backward compatibility with legacy qualityPreset
    if (qualityPreset && !videoQuality && !audioQuality) {
        if (qualityPreset === 'audio') {
            targetVideo = 'none';
            targetAudio = '320k';
        } else {
            targetVideo = qualityPreset;
            targetAudio = 'best';
        }
    }

    if (targetVideo !== undefined || targetAudio !== undefined) {
        const v = targetVideo || '1080p';
        const a = targetAudio || 'best';

        if (v === 'none' && a === 'none') {
            return res.status(400).json({ error: "Cannot select both 'No Video' and 'No Audio'." });
        }

        if (v === 'none') {
            // Audio Only mode
            isAudioOnly = true;
            extension = 'mp3';
            formatSelection = 'bestaudio/best';
            namingTag = `Audio_${a === 'best' ? 'HQ' : a.toUpperCase()}`;
        } else if (a === 'none') {
            // Muted Video mode
            isMuted = true;
            extension = 'mp4';
            const h = heightMap[v];
            formatSelection = h 
                ? `bestvideo[height<=${h}]/best[height<=${h}]/best`
                : 'bestvideo/best';
            namingTag = `${v.toUpperCase()}_Muted`;
        } else {
            // Video + Audio with resilient resolution fallback (falls back to next highest if 4K/8K not present)
            isAudioOnly = false;
            extension = 'mp4';
            const h = heightMap[v];
            formatSelection = h
                ? `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
                : 'bestvideo+bestaudio/best';
            namingTag = `${v.toUpperCase()}_${a === 'best' ? 'HQ' : a.toUpperCase()}`;
        }
    } else {
        isAudioOnly = !vId && !!aId;
        extension = isAudioOnly ? 'mp3' : 'mp4';
        formatSelection = (vId && aId) ? `${vId}+${aId}` : (vId || aId || 'best');
        namingTag = `${vLabel || 'NoVideo'}_${aLabel || 'NoAudio'}`;
    }

    jobs[jobId] = { 
        status: 'downloading', 
        progress: '0%', 
        file: null, 
        customTag: namingTag, 
        title, 
        extension,
        isAudioOnly,
        isMuted,
        targetVideo: targetVideo || (isAudioOnly ? 'none' : 'best'),
        targetAudio: targetAudio || (isMuted ? 'none' : 'best'),
        resolvedFormat: null,
        createdAt: Date.now(),
        lastPoll: Date.now(),
        lastProgressTime: Date.now(),
        downloadInstance: null,
        activeFfmpeg: null,
        baseName: null
    };

    logger(jobId, `Download initiated for "${title}" [Format: ${extension.toUpperCase()}]`, "START");

    await ensureYtDlp();
    const ytdlp = new YtDlp(ytDlpPath ? { binaryPath: ytDlpPath } : undefined);

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
        ffmpegArgs.push('--no-playlist');
    } else {
        ffmpegArgs.push('--no-playlist');
    }

    const download = ytdlp.download(cleanedUrl);
    jobs[jobId].downloadInstance = download;
    download.cookies(COOKIES);
    download.format(formatSelection);
    download.output(TEMP_DIR);
    if (ffmpegArgs.length > 0) {
        download.addArgs(...ffmpegArgs);
    }
    download.on('progress', (p) => {
        if (jobs[jobId] && jobs[jobId].status === 'downloading') {
            jobs[jobId].progress = p.percentage_str || '0%';
            jobs[jobId].lastProgressTime = Date.now();
            const pInt = parseInt(p.percentage_str);
            if (pInt % 25 === 0) logger(jobId, `Progress: ${p.percentage_str}`, "PROGRESS");
        }
    });

    download.run()
        .then(async (result) => {
            if (jobs[jobId] && jobs[jobId].status === 'cancelled') return; // Exit if aborted
            if (result.filePaths && result.filePaths.length > 0) {
                let finalFile = result.filePaths[0];
                const baseName = finalFile.substring(0, finalFile.lastIndexOf('.'));
                jobs[jobId].baseName = baseName;
                const targetExt = isAudioOnly ? 'mp3' : 'mp4';

                const possibleThumbs = [baseName + '.jpg', baseName + '.webp', baseName + '.png'];
                let thumbFile = possibleThumbs.find(f => fs.existsSync(f));

                const mTitle = jobs[jobId].metaTitle;
                const mArtist = jobs[jobId].metaArtist;
                const mDate = jobs[jobId].metaDate;
                const mThumb = jobs[jobId].metaThumb;

                // If yt-dlp skipped thumbnail download, explicitly fetch it
                if (!thumbFile && mThumb && jobs[jobId]?.status === 'downloading') {
                    logger(jobId, `Manual thumbnail fetch triggered for Task 2...`, "THUMB");
                    const manualThumb = baseName + '_manual.jpg';
                    try {
                        await new Promise((resolve) => {
                            const p = spawn('ffmpeg', ['-y', '-i', mThumb, '-vframes', '1', manualThumb, '-hide_banner', '-loglevel', 'error']);
                            p.on('close', resolve);
                            p.on('error', resolve);
                        });
                        if (fs.existsSync(manualThumb)) thumbFile = manualThumb;
                    } catch (e) {
                        logger(jobId, `Manual thumbnail fetch failed.`, "WARN");
                    }
                }

                if (jobs[jobId] && jobs[jobId].status === 'cancelled') return; // Exit if aborted

                // TASK 2: Convert/remux into target format (MP4 for video, MP3 for audio) with full metadata and cover art
                if (fs.existsSync(finalFile)) {
                    try {
                        const embeddedFile = baseName + '_final.' + targetExt;
                        let embedArgs = [];

                        if (isAudioOnly) {
                            const isTranscode = targetAudio && targetAudio !== 'best' && targetAudio !== 'copy';
                            if (!isTranscode) {
                                // ZERO QUALITY LOSS: Preserve untouched source audio stream
                                const srcExt = path.extname(finalFile).replace('.', '').toLowerCase();
                                const pureExt = (srcExt === 'm4a') ? 'm4a' : 'opus';
                                const losslessEmbeddedFile = baseName + '_final.' + pureExt;
                                jobs[jobId].extension = pureExt;

                                if (pureExt === 'm4a' && thumbFile) {
                                    embedArgs = [
                                        '-y', '-i', finalFile, '-i', thumbFile,
                                        '-map', '0:a:0', '-map', '1:0',
                                        '-c:a', 'copy', '-c:v:0', 'copy',
                                        '-disposition:v:0', 'attached_pic',
                                        '-metadata', `title=${mTitle}`,
                                        '-metadata', `artist=${mArtist}`,
                                        '-metadata', `album_artist=${mArtist}`,
                                        '-metadata', `album=${mArtist} (YouTube)`,
                                        '-metadata', `date=${mDate}`,
                                        '-metadata', `year=${mDate}`,
                                        losslessEmbeddedFile
                                    ];
                                } else {
                                    embedArgs = [
                                        '-y', '-i', finalFile,
                                        '-map', '0:a:0',
                                        '-c:a', 'copy',
                                        '-metadata', `title=${mTitle}`,
                                        '-metadata', `artist=${mArtist}`,
                                        '-metadata', `album_artist=${mArtist}`,
                                        '-metadata', `album=${mArtist} (YouTube)`,
                                        '-metadata', `date=${mDate}`,
                                        '-metadata', `year=${mDate}`,
                                        losslessEmbeddedFile
                                    ];
                                }
                            } else {
                                const lameBitrate = ['-b:a', targetAudio];
                                if (thumbFile) {
                                    embedArgs = [
                                        '-y', '-i', finalFile, '-i', thumbFile,
                                        '-map', '0:a:0', '-map', '1:0',
                                        '-c:a', 'libmp3lame', ...lameBitrate,
                                        '-id3v2_version', '3',
                                        '-metadata', `title=${mTitle}`,
                                        '-metadata', `artist=${mArtist}`,
                                        '-metadata', `album_artist=${mArtist}`,
                                        '-metadata', `album=${mArtist} (YouTube)`,
                                        '-metadata', `date=${mDate}`,
                                        '-metadata', `year=${mDate}`,
                                        '-metadata:s:v', 'title=Album cover',
                                        '-metadata:s:v', 'comment=Cover (front)',
                                        embeddedFile
                                    ];
                                } else {
                                    embedArgs = [
                                        '-y', '-i', finalFile,
                                        '-map', '0:a:0',
                                        '-c:a', 'libmp3lame', ...lameBitrate,
                                        '-id3v2_version', '3',
                                        '-metadata', `title=${mTitle}`,
                                        '-metadata', `artist=${mArtist}`,
                                        '-metadata', `album_artist=${mArtist}`,
                                        '-metadata', `album=${mArtist} (YouTube)`,
                                        '-metadata', `date=${mDate}`,
                                        '-metadata', `year=${mDate}`,
                                        embeddedFile
                                    ];
                                }
                            }
                        } else if (isMuted) {
                            if (thumbFile) {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-i', thumbFile,
                                    '-map', '0:v:0', '-map', '1:0',
                                    '-c:v:0', 'copy',
                                    '-an',
                                    '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic',
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else {
                                embedArgs = [
                                    '-y', '-i', finalFile,
                                    '-map', '0:v:0',
                                    '-c:v:0', 'copy',
                                    '-an',
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            }
                        } else {
                            // Video + Audio: Stream copy by default for ZERO loss in quality!
                            const isTranscode = targetAudio && targetAudio !== 'best' && targetAudio !== 'copy';
                            const audioCodecArgs = isTranscode ? ['-c:a', 'aac', '-b:a', targetAudio] : ['-c:a', 'copy'];
                            if (thumbFile) {
                                embedArgs = [
                                    '-y', '-i', finalFile, '-i', thumbFile,
                                    '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:0',
                                    '-c:v:0', 'copy',
                                    ...audioCodecArgs,
                                    '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic',
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else {
                                embedArgs = [
                                    '-y', '-i', finalFile,
                                    '-map', '0:v:0', '-map', '0:a:0?',
                                    '-c:v:0', 'copy',
                                    ...audioCodecArgs,
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            }
                        }

                        logger(jobId, `Task 2: Converting/packaging to pristine ${targetExt.toUpperCase()} with metadata...`, "META");
                        
                        // Non-blocking asynchronous FFmpeg spawn with process tracking
                        const task2Result = await new Promise((resolve) => {
                            const proc = spawn('ffmpeg', embedArgs);
                            if (jobs[jobId]) jobs[jobId].activeFfmpeg = proc;
                            let stderr = '';
                            proc.stderr?.on('data', (d) => stderr += d.toString());
                            proc.on('close', (code) => {
                                if (jobs[jobId]) jobs[jobId].activeFfmpeg = null;
                                resolve({ status: code, stderr });
                            });
                            proc.on('error', (err) => {
                                if (jobs[jobId]) jobs[jobId].activeFfmpeg = null;
                                resolve({ status: -1, stderr: err.message });
                            });
                        });

                        if (jobs[jobId] && jobs[jobId].status === 'cancelled') return; // Exit if aborted

                        if (task2Result.status === 0 && fs.existsSync(embeddedFile) && fs.statSync(embeddedFile).size > 1000) {
                            fs.unlinkSync(finalFile);
                            if (thumbFile && fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);
                            finalFile = embeddedFile;
                            jobs[jobId].extension = targetExt;
                            logger(jobId, `Task 2 Packaging Successful: Output is authentic ${targetExt.toUpperCase()}`, "META");

                            try {
                                if (isAudioOnly) {
                                    const audioTag = jobs[jobId].targetAudio === 'best' ? 'Best Quality' : jobs[jobId].targetAudio.toUpperCase();
                                    jobs[jobId].resolvedFormat = `MP3 (${audioTag})`;
                                } else {
                                    const probe = execSync(`ffmpeg -i "${finalFile}" -hide_banner -f null - 2>&1`, { stdio: 'pipe' }).toString();
                                    const resMatch = probe.match(/Video:.*?(\d{3,4})x(\d{3,4})/s) || probe.match(/, (\d{3,4})x(\d{3,4})/);
                                    if (resMatch) {
                                        const h = parseInt(resMatch[2]);
                                        let label = `${h}p`;
                                        if (h >= 4320) label = '8K (4320p)';
                                        else if (h >= 2160) label = '4K (2160p)';
                                        else if (h >= 1440) label = '2K (1440p)';
                                        else if (h >= 1080) label = '1080p FHD';
                                        else if (h >= 720) label = '720p HD';
                                        else if (h >= 480) label = '480p SD';
                                        else if (h >= 360) label = '360p';
                                        
                                        const audioSuffix = isMuted ? ' (Muted)' : (jobs[jobId].targetAudio && jobs[jobId].targetAudio !== 'best' ? ` + ${jobs[jobId].targetAudio.toUpperCase()}` : '');
                                        jobs[jobId].resolvedFormat = `${label}${audioSuffix}`;
                                    }
                                }
                            } catch (pe) {}
                        } else {
                            const errorLog = task2Result.stderr ? task2Result.stderr.toString() : 'Unknown FFmpeg Error';
                            logger(jobId, `Task 2 FFmpeg warning/fallback:\n${errorLog}`, "WARN");
                            if (fs.existsSync(embeddedFile)) fs.unlinkSync(embeddedFile);
                            jobs[jobId].extension = finalFile.split('.').pop();
                        }
                    } catch (err) {
                        logger(jobId, `Metadata injection script crashed: ${err.message}`, "WARN");
                        jobs[jobId].extension = finalFile.split('.').pop();
                    }
                }

                if (jobs[jobId] && jobs[jobId].status !== 'cancelled') {
                    jobs[jobId].status = 'completed';
                    jobs[jobId].file = path.basename(finalFile);
                    logger(jobId, `Processing Finished. Output: ${jobs[jobId].file}`, "SUCCESS");
                }
            }
        })
        .catch((err) => {
            if (jobs[jobId] && jobs[jobId].status !== 'cancelled') {
                jobs[jobId].status = 'error';
                logger(jobId, `Download/Merge error: ${err.message}`, "ERROR");
            }
        });

    res.json({ jobId });
});

// --- API: CANCEL / ABORT IN-FLIGHT DOWNLOAD ---
app.all('/api/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    abortJob(jobId, 'Client requested cancellation via button or tab close');
    res.json({ success: true, message: 'Download aborted and bandwidth saved' });
});

// --- API: STATUS ---
app.get('/api/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) {
        return res.json({});
    }
    job.lastPoll = Date.now();
    res.json({
        status: job.status,
        progress: job.progress,
        file: job.file,
        title: job.title,
        extension: job.extension,
        customTag: job.customTag,
        isAudioOnly: job.isAudioOnly,
        isMuted: job.isMuted,
        targetVideo: job.targetVideo,
        targetAudio: job.targetAudio,
        resolvedFormat: job.resolvedFormat,
        error: job.error
    });
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
            logger(req.params.jobId, `Transmission stream status: ${err.message}`, "INFO");
        }

        // Keep the completed file available for a 15-minute grace period so mobile browsers and download managers
        // can make multiple Range requests, resume interrupted downloads, or stream in parallel chunks.
        if (!job.cleanupTimer) {
            job.cleanupTimer = setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        logger(req.params.jobId, `CLEANUP: Deleted temporary file ${job.file} (grace period expired)`, "DELETE");
                    }
                    delete jobs[req.params.jobId];
                    logger(req.params.jobId, `Session closed. Memory purged.`, "PURGE");
                } catch (e) {
                    logger(req.params.jobId, `Cleanup failed: ${e.message}`, "ERROR");
                }
            }, 15 * 60 * 1000);
        }
    });
});

// Periodic sweeper for any orphaned temp files older than 30 minutes
setInterval(() => {
    try {
        const now = Date.now();
        if (fs.existsSync(TEMP_DIR)) {
            const files = fs.readdirSync(TEMP_DIR);
            for (const file of files) {
                const fPath = path.join(TEMP_DIR, file);
                const stats = fs.statSync(fPath);
                if (now - stats.mtimeMs > 30 * 60 * 1000) {
                    fs.unlinkSync(fPath);
                }
            }
        }
    } catch (e) {}
}, 10 * 60 * 1000);

// --- SERVE THE UI ---
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(clientDist, 'index.html'));
    });
} else {
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

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

    app.listen(PORT, '0.0.0.0', () => {
        console.log("\n" + "=".repeat(50));
        console.log(`[SERVER] Universal Media Extractor Server running on port ${PORT}`);
        console.log(`[LOCAL]  http://localhost:${PORT}`);
        console.log(`[LAN]    http://0.0.0.0:${PORT}`);
        console.log(`[TEMP] Temp Folder: ${TEMP_DIR}`);
        console.log(`[CACHE] Cache Folder: ${CACHE_DIR}`);
        console.log("=".repeat(50) + "\n");

        // Non-blocking: prime the yt-dlp disk cache while server is already accepting requests
        warmUpYtDlp();
    });
})();