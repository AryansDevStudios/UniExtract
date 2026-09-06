const express = require('express');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync, spawn, spawnSync, exec } = require('child_process');
const cors = require('cors');
const archiver = require('archiver');

// --- LOAD .ENV VARIABLES IF PRESENT ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split(/\r?\n/);
        let currentKey = null;
        let currentValLines = [];
        let inQuotes = false;
        let quoteChar = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!inQuotes) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = line.indexOf('=');
                if (eqIdx !== -1) {
                    const key = line.substring(0, eqIdx).trim();
                    let val = line.substring(eqIdx + 1).trim();
                    if (val.startsWith('"') || val.startsWith("'")) {
                        quoteChar = val[0];
                        val = val.substring(1);
                        if (val.endsWith(quoteChar) && (val.length === 1 || !val.endsWith('\\' + quoteChar))) {
                            val = val.slice(0, -1);
                            if (!process.env[key]) process.env[key] = val;
                        } else {
                            inQuotes = true;
                            currentKey = key;
                            currentValLines = [val];
                        }
                    } else {
                        const commentIdx = val.indexOf('#');
                        if (commentIdx !== -1) val = val.substring(0, commentIdx).trim();
                        if (!process.env[key]) process.env[key] = val;
                    }
                }
            } else {
                if (line.includes(quoteChar)) {
                    const endIdx = line.indexOf(quoteChar);
                    currentValLines.push(line.substring(0, endIdx));
                    if (!process.env[currentKey]) {
                        process.env[currentKey] = currentValLines.join('\n');
                    }
                    inQuotes = false;
                    currentKey = null;
                    currentValLines = [];
                    quoteChar = null;
                } else {
                    currentValLines.push(line);
                }
            }
        }
    } catch (e) {}
}


const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const COOKIE_PASSWORD = (process.env.COOKIE_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
const COOKIES = process.env.COOKIES_PATH || path.join(__dirname, 'cookies.txt');
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, 'temp');
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'cache');

// --- INITIALIZATION ---
let ytDlpPath = null;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Helper to inspect active in-flight jobs (downloading or transcoding)
const getActiveJobsCount = () => {
    return Object.values(jobs).filter(j => 
        j && (j.status === 'downloading' || j.status === 'processing' || j.status === 'starting')
    ).length;
};

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
        const shortId = jobId.substring(0, 8);
        const files = fs.readdirSync(TEMP_DIR);
        files.forEach(f => {
            if (f.startsWith(shortId) || f.includes(shortId) || f.includes(jobId) || (job.baseName && f.includes(path.basename(job.baseName)))) {
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

const parseTimeToSeconds = (value) => {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value.trim();
    if (!cleaned) return null;
    const match = cleaned.match(/^((?:\d+:)?\d{1,2}:\d{2})(?:\.\d+)?$/) || cleaned.match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) return null;

    if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
        return Number(cleaned);
    }

    const parts = cleaned.split(':').map(Number);
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return null;
};

const formatSecondsToClock = (seconds) => {
    if (seconds === null || Number.isNaN(seconds) || !Number.isFinite(seconds)) return '00:00:00';
    const total = Math.max(0, Math.floor(seconds));
    const hours = String(Math.floor(total / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
};

const cleanLanguageName = (rawLang, note = '') => {
    let langName = '';
    if (rawLang && rawLang !== 'und' && rawLang !== 'unknown') {
        try {
            langName = new Intl.DisplayNames(['en'], { type: 'language' }).of(rawLang) || '';
        } catch (e) {}
    }

    let cleanNote = note.trim()
        .replace(/,\s*(low|medium|high|ultra|tiny|small).*$/i, '')
        .replace(/\b(low|medium|high)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanNote) {
        cleanNote = cleanNote
            .replace(/original\s*\(default\)/i, '(Original)')
            .replace(/original/i, '(Original)')
            .replace(/dubbed/i, '(Dubbed)')
            .replace(/default/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        return cleanNote;
    }

    return langName || (rawLang ? rawLang.toUpperCase() : 'Audio');
};

const ISO639_TO_3 = {
    'hi': 'hin', 'en': 'eng', 'es': 'spa', 'fr': 'fra', 'de': 'deu',
    'it': 'ita', 'pt': 'por', 'ru': 'rus', 'ja': 'jpn', 'ko': 'kor',
    'zh': 'zho', 'ar': 'ara', 'bn': 'ben', 'pa': 'pan', 'te': 'tel',
    'ta': 'tam', 'mr': 'mar', 'ur': 'urd', 'gu': 'guj', 'kn': 'kan',
    'ml': 'mal', 'tr': 'tur', 'vi': 'vie', 'pl': 'pol', 'uk': 'ukr',
    'nl': 'nld', 'el': 'ell', 'th': 'tha', 'id': 'ind', 'sv': 'swe',
    'no': 'nor', 'da': 'dan', 'fi': 'fin', 'cs': 'ces', 'ro': 'ron',
    'hu': 'hun', 'fa': 'fas', 'he': 'heb'
};

const getIso3 = (code) => {
    if (!code) return 'und';
    const base = code.toLowerCase().split(/[-_]/)[0];
    return ISO639_TO_3[base] || (base.length === 3 ? base : 'und');
};

const getSubtitleTrackTitle = (code) => {
    if (!code) return 'Subtitles';
    const clean = code.toLowerCase().trim();
    const base = clean.replace(/-(orig|auto)$/i, '').split(/[-_]/)[0];
    const isOrig = clean.includes('orig');
    const isAuto = clean.includes('auto');

    let name = '';
    try {
        name = new Intl.DisplayNames(['en'], { type: 'language' }).of(base);
    } catch (e) {}

    if (!name) {
        name = base.toUpperCase();
    }

    if (isOrig) return `${name} (Original)`;
    if (isAuto) return `${name} (Auto)`;
    return name;
};

const collectAudioTracks = (info) => {
    const map = new Map();
    const allFormats = Array.isArray(info?.formats) ? info.formats : [];

    for (const fmt of allFormats) {
        if (!fmt || (!fmt.acodec || fmt.acodec === 'none')) continue;

        // Group by language code, or by language name embedded in note if language code is missing
        const rawLang = (fmt.language || fmt.language_code || '').toLowerCase().trim();
        const note = fmt.format_note || '';
        
        // Skip formats without identifiable language info
        const displayLabel = cleanLanguageName(rawLang, note);
        const langKey = rawLang || displayLabel.toLowerCase();

        const abr = fmt.abr || fmt.tbr || 0;
        const existing = map.get(langKey);

        // Keep the best audio stream format_id for each language
        if (!existing || abr > existing.abr) {
            map.set(langKey, {
                id: fmt.format_id,
                language: displayLabel,
                abr,
                ext: fmt.ext || 'audio'
            });
        }
    }

    return [...map.values()];
};

const collectSubtitleOptions = (info) => {
    const combined = new Map();

    // 1. Process creator/manual subtitles first
    if (info?.subtitles && typeof info.subtitles === 'object') {
        for (const [lang, entries] of Object.entries(info.subtitles)) {
            const list = Array.isArray(entries) ? entries : [];
            const name = list[0]?.name || lang;
            combined.set(lang, {
                id: lang,
                lang,
                name,
                isAuto: false
            });
        }
    }

    // 2. Process automatic captions (prioritizing original speech tracks like en-orig)
    if (info?.automatic_captions && typeof info.automatic_captions === 'object') {
        for (const [lang, entries] of Object.entries(info.automatic_captions)) {
            const list = Array.isArray(entries) ? entries : [];
            const rawName = list[0]?.name;
            const isOrig = lang.endsWith('-orig');

            // Skip noisy cross-translated auto-sub combinations (e.g. 'aa-ar', 'ab-vi')
            if (lang.includes('-') && !isOrig && !['zh-Hans', 'zh-Hant', 'pt-BR', 'es-419', 'en-US', 'en-GB'].includes(lang)) {
                continue;
            }

            if (isOrig) {
                // Original speech-to-text track (e.g. 'en-orig' -> 'English (Original)')
                const label = rawName || (lang.startsWith('en') ? 'English (Original)' : `${lang} (Original)`);
                combined.set(lang, {
                    id: lang,
                    lang,
                    name: label,
                    isAuto: true,
                    isOrig: true
                });
            } else if (!combined.has(lang)) {
                // Primary auto-caption language not already covered by manual subtitles
                const label = rawName ? `${rawName} (Auto)` : `${lang.toUpperCase()} (Auto)`;
                combined.set(lang, {
                    id: lang,
                    lang,
                    name: label,
                    isAuto: true,
                    isOrig: false
                });
            }
        }
    }

    // 3. Sort intelligently: Original & English tracks first, then alphabetical
    const all = [...combined.values()];
    return all.sort((a, b) => {
        const getPriority = (item) => {
            if (item.isOrig || item.lang === 'en-orig') return 0;
            if (item.lang === 'en' && !item.isAuto) return 1;
            if (item.lang === 'en') return 2;
            if (!item.isAuto) return 3;
            return 4;
        };
        const pDiff = getPriority(a) - getPriority(b);
        if (pDiff !== 0) return pDiff;
        return (a.name || a.lang).localeCompare(b.name || b.lang);
    });
};

const createChapterZip = async (jobId, files, title) => {
    const zipPath = path.join(TEMP_DIR, `${jobId}_chapters.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
        output.on('close', () => resolve(zipPath));
        output.on('error', reject);
        archive.on('error', reject);
        archive.pipe(output);

        files.forEach((filePath) => {
            const name = path.basename(filePath);
            archive.file(filePath, { name });
        });

        archive.finalize();
    });
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

// --- ENSURE FFMPEG BINARY (Node.js package, local bin, or system PATH) ---
let resolvedFfmpegPath = process.env.FFMPEG_PATH || null;

const ensureFfmpeg = () => {
    if (resolvedFfmpegPath && fs.existsSync(resolvedFfmpegPath)) {
        return resolvedFfmpegPath;
    }

    const candidatePaths = [
        process.env.FFMPEG_PATH,
        (() => {
            try {
                const p = require('ffmpeg-static');
                return p ? p.replace('app.asar', 'app.asar.unpacked') : null;
            } catch (e) { return null; }
        })(),
        path.join(__dirname, '..', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        path.join(__dirname, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        (() => {
            try {
                const pkgPath = require.resolve('ffmpeg-static/package.json');
                const exe = path.join(path.dirname(pkgPath), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg').replace('app.asar', 'app.asar.unpacked');
                return fs.existsSync(exe) ? exe : null;
            } catch (e) { return null; }
        })(),
        (() => {
            try {
                const installer = require('@ffmpeg-installer/ffmpeg');
                return installer && installer.path ? installer.path.replace('app.asar', 'app.asar.unpacked') : null;
            } catch (e) { return null; }
        })()
    ];

    for (const candidate of candidatePaths) {
        if (candidate && fs.existsSync(candidate)) {
            resolvedFfmpegPath = candidate;
            break;
        }
    }

    // Fallback: Check system PATH
    if (!resolvedFfmpegPath) {
        try {
            const checkCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
            const sysPath = execSync(checkCmd).toString().trim().split(/\r?\n/)[0].trim();
            if (sysPath && fs.existsSync(sysPath)) {
                resolvedFfmpegPath = sysPath;
            }
        } catch (e) {}
    }

    if (resolvedFfmpegPath) {
        const ffmpegDir = path.dirname(resolvedFfmpegPath);
        // Prepend binary directory to PATH so yt-dlp and child_process.spawn find it automatically
        const currentPath = process.env.PATH || '';
        const pathParts = currentPath.split(path.delimiter);
        if (!pathParts.includes(ffmpegDir)) {
            process.env.PATH = `${ffmpegDir}${path.delimiter}${currentPath}`;
        }
        process.env.FFMPEG_PATH = resolvedFfmpegPath;
        logger(null, `FFmpeg binary active: ${resolvedFfmpegPath}`);
    } else {
        logger(null, `WARNING: FFmpeg binary not found in Node.js packages or PATH!`, "WARN");
    }

    return resolvedFfmpegPath;
};

// --- HARDWARE DETECTION ENGINE ---
const detectHardware = () => {
    console.log("\n" + "=".repeat(50));
    logger(null, "Probing Hardware Acceleration Capabilities...");
    ensureFfmpeg();
    try {
        const encoders = execSync('ffmpeg -encoders').toString();
        try {
            const verLine = execSync('ffmpeg -version').toString().split(/\r?\n/)[0].trim();
            logger(null, `FFmpeg Engine: ${verLine}`);
        } catch (e) {}

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

// --- HEALTH CHECK ENDPOINT ---
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.0.0',
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now()
    });
});

// --- RELEASE & UPDATE CHECKING SYSTEM ---
let cachedReleaseData = null;
let lastReleaseCheck = 0;
const RELEASE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache
let updatePendingWhenIdle = false;

function parseSemver(v) {
    if (!v) return [0, 0, 0];
    const cleaned = String(v).replace(/^v/i, '').trim();
    const [main] = cleaned.split('-');
    const parts = main.split('.').map(p => parseInt(p, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
}

function isNewerVersion(current, latest) {
    const [cMaj, cMin, cPat] = parseSemver(current);
    const [lMaj, lMin, lPat] = parseSemver(latest);
    if (lMaj > cMaj) return true;
    if (lMaj < cMaj) return false;
    if (lMin > cMin) return true;
    if (lMin < cMin) return false;
    return lPat > cPat;
}

// Active jobs query for traffic-safe updates
app.get('/api/updates/active-jobs', (req, res) => {
    res.json({
        activeJobsCount: getActiveJobsCount(),
        updatePendingWhenIdle,
        uptime: Math.floor(process.uptime())
    });
});

// Full update check endpoint
app.get('/api/updates', async (req, res) => {
    const currentVersion = require('./package.json').version || '2.0.0';
    const force = req.query.force === 'true';
    const now = Date.now();

    if (!force && cachedReleaseData && (now - lastReleaseCheck < RELEASE_CACHE_TTL)) {
        return res.json({
            ...cachedReleaseData,
            currentVersion,
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true'
        });
    }

    try {
        const response = await fetch('https://api.github.com/repos/AryansDevStudios/Universal-Media-Extractor/releases/latest', {
            headers: {
                'User-Agent': 'UniversalMediaExtractor-UpdateChecker/2.0.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            return res.json({
                currentVersion,
                latestVersion: currentVersion,
                updateAvailable: false,
                activeJobsCount: getActiveJobsCount(),
                updatePendingWhenIdle,
                isElectron: process.env.IS_ELECTRON === 'true',
                isPortable: process.env.ELECTRON_PORTABLE === 'true',
                message: 'No newer release published on GitHub or rate limit reached.'
            });
        }

        const release = await response.json();
        const latestTag = release.tag_name || release.name || '';
        const latestClean = latestTag.replace(/^v/i, '');
        const updateAvailable = isNewerVersion(currentVersion, latestClean);

        const assets = (release.assets || []).map(a => {
            let type = 'other';
            let arch = 'universal';
            const nameLower = a.name.toLowerCase();
            if (nameLower.includes('arm64')) arch = 'arm64';
            else if (nameLower.includes('x64')) arch = 'x64';

            if (nameLower.endsWith('.exe')) {
                type = nameLower.includes('portable') ? 'windows-portable' : 'windows-installer';
            } else if (nameLower.endsWith('.dmg')) {
                type = 'macos-dmg';
            } else if (nameLower.endsWith('.appimage')) {
                type = 'linux-appimage';
            } else if (nameLower.endsWith('.deb')) {
                type = 'linux-deb';
            } else if (nameLower.endsWith('.zip')) {
                type = 'archive-zip';
            }

            return {
                name: a.name,
                size: a.size,
                url: a.browser_download_url,
                type,
                arch
            };
        });

        cachedReleaseData = {
            latestVersion: latestClean,
            latestTag,
            updateAvailable,
            releaseName: release.name || latestTag,
            releaseNotes: release.body || '',
            releaseUrl: release.html_url || '',
            publishedAt: release.published_at || null,
            assets
        };
        lastReleaseCheck = now;

        res.json({
            ...cachedReleaseData,
            currentVersion,
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true'
        });
    } catch (err) {
        res.json({
            currentVersion,
            latestVersion: currentVersion,
            updateAvailable: false,
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true',
            error: err.message
        });
    }
});

// Schedule safe update when traffic is idle
app.post('/api/updates/schedule-install', (req, res) => {
    const activeCount = getActiveJobsCount();
    updatePendingWhenIdle = true;

    if (activeCount === 0) {
        res.json({
            status: 'ready',
            message: 'Zero active downloads. Update can be applied immediately.'
        });
    } else {
        res.json({
            status: 'queued',
            activeJobsCount: activeCount,
            message: `Update queued safely. Will apply automatically when all ${activeCount} active download(s) complete.`
        });
    }
});

// --- COOKIE MANAGEMENT & INTELLIGENT FILTERING SYSTEM ---
const ALLOWED_MEDIA_DOMAINS = [
    'youtube.com',
    'instagram.com',
    'facebook.com',
    'snapchat.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'reddit.com',
    'twitch.tv',
    'soundcloud.com',
    'vimeo.com',
    'pinterest.com',
    'dailymotion.com',
    'threads.net',
    'bilibili.com'
];

const EXCLUDED_COOKIE_DOMAINS = [
    'accounts.google.com',
    'mail.google.com',
    'myaccount.google.com',
    'gds.google.com',
    'contacts.google.com',
    'ogs.google.com',
    'google.com',
    'google.co.in',
    'bing.com',
    'msn.com',
    'scorecardresearch.com',
    'doubleclick.net',
    'linkedin.com'
];

function isAllowedCookieDomain(domain) {
    if (!domain) return false;
    const d = domain.toLowerCase().replace(/^\./, '');
    for (const ex of EXCLUDED_COOKIE_DOMAINS) {
        if (d === ex || d.endsWith('.' + ex)) {
            // Keep YouTube cookies even though YouTube is hosted under Google infrastructure
            if (d.includes('youtube.com')) return true;
            return false;
        }
    }
    for (const plat of ALLOWED_MEDIA_DOMAINS) {
        if (d === plat || d.endsWith('.' + plat)) {
            return true;
        }
    }
    return false;
}

function filterAndFormatCookies(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
        return { success: false, error: 'Empty cookie content provided' };
    }

    const trimmed = rawInput.trim();
    let parsedCookies = [];
    let droppedCount = 0;
    let keptCount = 0;

    // 1. Try parsing JSON format (e.g. from Cookie-Editor / EditThisCookie export)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            const rawArr = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of rawArr) {
                const domain = (item.domain || '').trim();
                if (!isAllowedCookieDomain(domain)) {
                    droppedCount++;
                    continue;
                }
                const name = (item.name || '').trim();
                const value = item.value !== undefined ? String(item.value).trim() : '';
                if (!name) {
                    droppedCount++;
                    continue;
                }
                const path = item.path || '/';
                const secure = item.secure ? 'TRUE' : 'FALSE';
                const includeSubdomains = item.hostOnly ? 'FALSE' : (domain.startsWith('.') ? 'TRUE' : 'FALSE');
                let expires = Math.floor(Number(item.expirationDate || item.expires || 0));
                if (isNaN(expires) || expires < 0) expires = 0;

                parsedCookies.push({
                    domain,
                    includeSubdomains,
                    path,
                    secure,
                    expires,
                    name,
                    value
                });
                keptCount++;
            }
        } catch (e) {}
    }

    // 2. Parse Netscape format (standard cookies.txt)
    if (parsedCookies.length === 0) {
        const lines = rawInput.split(/\r?\n/);
        for (const line of lines) {
            const lineTrim = line.trim();
            if (!lineTrim || lineTrim.startsWith('#')) continue;
            const parts = lineTrim.split(/\t+/);
            const cols = parts.length >= 7 ? parts : lineTrim.split(/\s{2,}/);
            if (cols.length >= 7) {
                const domain = cols[0].trim();
                if (!isAllowedCookieDomain(domain)) {
                    droppedCount++;
                    continue;
                }
                const name = cols[5].trim();
                const value = cols.slice(6).join('\t').trim();
                if (!name) {
                    droppedCount++;
                    continue;
                }
                parsedCookies.push({
                    domain,
                    includeSubdomains: cols[1].trim().toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
                    path: cols[2].trim(),
                    secure: cols[3].trim().toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
                    expires: cols[4].trim(),
                    name,
                    value
                });
                keptCount++;
            } else {
                droppedCount++;
            }
        }
    }

    if (keptCount === 0) {
        return {
            success: false,
            error: 'No media extraction cookies detected. Please ensure your export contains cookies for supported platforms (YouTube, Instagram, Facebook, Snapchat, etc.).',
            droppedCount
        };
    }

    let netscapeText = '# Netscape HTTP Cookie File\n# Filtered and formatted by Universal Media Extractor\n\n';
    const domainsSet = new Set();
    let isYouTubeAuthed = false;

    for (const c of parsedCookies) {
        netscapeText += `${c.domain}\t${c.includeSubdomains}\t${c.path}\t${c.secure}\t${c.expires}\t${c.name}\t${c.value}\n`;
        const cleanDomain = c.domain.replace(/^\./, '').toLowerCase();
        for (const plat of ALLOWED_MEDIA_DOMAINS) {
            if (cleanDomain === plat || cleanDomain.endsWith('.' + plat)) {
                domainsSet.add(plat);
                break;
            }
        }

        if (cleanDomain.includes('youtube.com')) {
            if (['__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO', 'SID', 'SSID'].includes(c.name) && c.value) {
                isYouTubeAuthed = true;
            }
        }
    }

    return {
        success: true,
        netscapeText,
        keptCount,
        droppedCount,
        domains: Array.from(domainsSet),
        isYouTubeAuthed
    };
}

function getCookiesSummary() {
    if (!fs.existsSync(COOKIES)) {
        return {
            exists: false,
            count: 0,
            domains: [],
            isYouTubeAuthed: false,
            isPortable: !!process.env.PORTABLE_EXECUTABLE_DIR,
            requiresPassword: !!COOKIE_PASSWORD
        };
    }

    try {
        const stat = fs.statSync(COOKIES);
        if (stat.size === 0) {
            return {
                exists: false,
                count: 0,
                domains: [],
                isYouTubeAuthed: false,
                isPortable: !!process.env.PORTABLE_EXECUTABLE_DIR,
                requiresPassword: !!COOKIE_PASSWORD
            };
        }

        const content = fs.readFileSync(COOKIES, 'utf8');
        const lines = content.split(/\r?\n/);
        let count = 0;
        const domainsSet = new Set();
        let isYouTubeAuthed = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split(/\t+/);
            const cols = parts.length >= 7 ? parts : trimmed.split(/\s{2,}/);
            if (cols.length >= 7) {
                count++;
                const domain = cols[0].trim().replace(/^\./, '').toLowerCase();
                const name = cols[5].trim();
                const value = cols.slice(6).join('\t').trim();

                for (const plat of ALLOWED_MEDIA_DOMAINS) {
                    if (domain === plat || domain.endsWith('.' + plat)) {
                        domainsSet.add(plat);
                        break;
                    }
                }

                if (domain.includes('youtube.com')) {
                    if (['__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO', 'SID', 'SSID'].includes(name) && value) {
                        isYouTubeAuthed = true;
                    }
                }
            }
        }

        const isEnvManaged = !!(process.env.COOKIES_CONTENT || process.env.COOKIE_DATA || process.env.COOKIES_BASE64 || process.env.YOUTUBE_COOKIES);
        return {
            exists: count > 0,
            count,
            domains: Array.from(domainsSet),
            isYouTubeAuthed,
            isPortable: !!process.env.PORTABLE_EXECUTABLE_DIR,
            requiresPassword: !!COOKIE_PASSWORD,
            isEnvManaged
        };
    } catch (err) {
        return {
            exists: false,
            count: 0,
            domains: [],
            isYouTubeAuthed: false,
            error: err.message,
            isPortable: !!process.env.PORTABLE_EXECUTABLE_DIR,
            requiresPassword: !!COOKIE_PASSWORD,
            isEnvManaged: !!(process.env.COOKIES_CONTENT || process.env.COOKIE_DATA || process.env.COOKIES_BASE64 || process.env.YOUTUBE_COOKIES)
        };
    }
}

// --- AUTO-INITIALIZE COOKIES FROM ENV (RENDER & CLOUD DEPLOYMENTS) ---
function initCookiesFromEnv() {
    const rawEnvCookies = process.env.COOKIES_CONTENT || 
                           process.env.COOKIE_DATA || 
                           process.env.YOUTUBE_COOKIES ||
                           (process.env.COOKIES_BASE64 ? Buffer.from(process.env.COOKIES_BASE64, 'base64').toString('utf8') : null);

    if (!rawEnvCookies || typeof rawEnvCookies !== 'string' || !rawEnvCookies.trim()) {
        return;
    }

    let formatted = rawEnvCookies.trim();
    // Handle escaped newlines or tabs if entered as a single-line string in .env
    if (formatted.includes('\\n') && !formatted.includes('\n')) {
        formatted = formatted.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }

    // Auto-create/update cookies file if missing, empty, or running on Render
    const shouldInitialize = !fs.existsSync(COOKIES) || fs.statSync(COOKIES).size === 0 || process.env.RENDER;
    if (shouldInitialize) {
        const filterResult = filterAndFormatCookies(formatted);
        const dir = path.dirname(COOKIES);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (filterResult.success) {
            fs.writeFileSync(COOKIES, filterResult.netscapeText, 'utf8');
            console.log(`[AUTH] Auto-initialized ${filterResult.keptCount} media cookies from environment variable (.env / Render)`);
        } else {
            fs.writeFileSync(COOKIES, formatted, 'utf8');
            console.log(`[AUTH] Auto-initialized raw cookies file from environment variable (.env / Render)`);
        }
    }
}

initCookiesFromEnv();


// --- PASSWORD VERIFICATION HELPER ---
function verifyCookiePassword(req) {
    if (!COOKIE_PASSWORD) return true; // No password configured; unauthenticated mode
    const clientPassword = (req.body?.password || req.headers['x-cookie-password'] || '').trim();
    return clientPassword === COOKIE_PASSWORD;
}

// --- ROUTES: AUTH TOKENS & COOKIE MANAGEMENT ---
const handleGetTokens = (req, res) => {
    res.json(getCookiesSummary());
};

const handlePostTokens = (req, res) => {
    if (!verifyCookiePassword(req)) {
        logger(null, 'Unauthorized attempt to update cookies (invalid or missing password)', 'WARN');
        return res.status(401).json({
            success: false,
            error: 'Authentication failed: Incorrect or missing server password.'
        });
    }

    const { content } = req.body;
    if (!content) {
        return res.status(400).json({ success: false, error: 'No cookie content provided.' });
    }

    const result = filterAndFormatCookies(content);
    if (!result.success) {
        return res.status(400).json({ success: false, error: result.error, droppedCount: result.droppedCount || 0 });
    }

    try {
        const dir = path.dirname(COOKIES);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(COOKIES, result.netscapeText, 'utf8');
        logger(null, `Updated auth tokens at: ${COOKIES} (${result.keptCount} kept, ${result.droppedCount} junk cookies filtered out)`);

        warmUpYtDlp();

        const summary = getCookiesSummary();
        res.json({
            success: true,
            message: `Successfully saved ${result.keptCount} media tokens (${result.droppedCount} junk/tracking cookies filtered out).`,
            ...summary,
            keptCount: result.keptCount,
            droppedCount: result.droppedCount
        });
    } catch (err) {
        logger(null, `Failed to write cookies file: ${err.message}`, 'ERROR');
        res.status(500).json({ success: false, error: `Failed to save cookies: ${err.message}` });
    }
};

const handleDeleteTokens = (req, res) => {
    if (!verifyCookiePassword(req)) {
        logger(null, 'Unauthorized attempt to clear cookies (invalid or missing password)', 'WARN');
        return res.status(401).json({
            success: false,
            error: 'Authentication failed: Incorrect or missing server password.'
        });
    }

    try {
        if (fs.existsSync(COOKIES)) {
            fs.writeFileSync(COOKIES, '# Netscape HTTP Cookie File\n# Cookies cleared by user\n', 'utf8');
        }
        logger(null, `Cleared cookies file at: ${COOKIES}`);
        res.json({ success: true, message: 'Cookies cleared successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

app.get(['/api/auth-tokens', '/api/cookies'], handleGetTokens);
app.post(['/api/auth-tokens', '/api/cookies'], handlePostTokens);
app.delete(['/api/auth-tokens', '/api/cookies'], handleDeleteTokens);

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
        const cookieArg = (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) ? ` --cookies "${COOKIES}"` : '';
        const cmd = `"${bin}" --no-playlist${cookieArg} --print "%(resolution)s | %(formats.:.height)j | %(formats.:.abr)j | %(formats.:.acodec)j" "https://www.youtube.com/watch?v=${videoId}"`;
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

        const hasValidCookies = COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0;
        const ytdlpOptions = { 
            ...(hasValidCookies ? { cookies: COOKIES } : {}), 
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
                fps: f.fps || null,
                audio_channels: f.audio_channels || 2,
                codec_info: hasVideo ? (f.vcodec ? f.vcodec.split('.')[0] : 'VID') : (hasAudio ? (f.acodec ? f.acodec.split('.')[0] : 'AUD') : 'RAW')
            };
        });

        const responseData = {
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration || 0,
            formats,
            chapters: Array.isArray(info.chapters) ? info.chapters.map(ch => ({
                title: ch.title,
                start_time: ch.start_time,
                end_time: ch.end_time
            })) : [],
            audioTracks: collectAudioTracks(info),
            subtitles: collectSubtitleOptions(info)
        };
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

// --- API: STANDALONE SUBTITLE DOWNLOADER ---
app.get('/api/subtitle', async (req, res) => {
    const { url, lang, format, title } = req.query;
    if (!url) return res.status(400).send('No video URL provided');

    const targetLang = (lang || 'en-orig').trim();
    const reqFormat = (format || 'srt').toLowerCase().trim();
    const isTxt = reqFormat === 'txt';
    const convFormat = isTxt ? 'srt' : (['srt', 'vtt', 'ass', 'lrc'].includes(reqFormat) ? reqFormat : 'srt');
    const safeTitle = (title || 'subtitles').replace(/[\/\\?%*:|"<>]/g, '_').trim() || 'subtitles';
    const cleanedUrl = cleanMediaUrl(url);

    try {
        await ensureYtDlp();
        const subId = uuidv4().substring(0, 8);
        const subOutTemplate = path.join(TEMP_DIR, `${subId}_%(title)s.%(ext)s`);

        logger(null, `Direct subtitle extraction requested: lang=${targetLang}, format=${reqFormat} for "${cleanedUrl}"`, "INFO");

        const ytdlpArgs = [
            '--skip-download',
            '--write-subs',
            '--write-auto-subs',
            '--sub-langs', targetLang,
            '--convert-subs', convFormat,
            '--no-playlist',
            '-o', subOutTemplate
        ];

        if (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) {
            ytdlpArgs.push('--cookies', COOKIES);
        }

        ytdlpArgs.push(cleanedUrl);

        const subProc = spawnSync(ytDlpPath || 'yt-dlp', ytdlpArgs, { encoding: 'utf8', timeout: 45000 });
        if (subProc.error) {
            throw subProc.error;
        }

        const candidates = fs.readdirSync(TEMP_DIR)
            .filter(name => name.startsWith(subId) && (name.endsWith(`.${convFormat}`) || name.endsWith('.vtt') || name.endsWith('.srt') || name.endsWith('.ass') || name.endsWith('.lrc')))
            .map(name => path.join(TEMP_DIR, name));

        if (candidates.length === 0 || !fs.existsSync(candidates[0])) {
            return res.status(404).send(`Subtitle track '${targetLang}' not found.`);
        }

        const subFile = candidates[0];
        const finalExt = isTxt ? 'txt' : (path.extname(subFile).replace('.', '') || convFormat);
        const outFileName = `${safeTitle}.${targetLang}.${finalExt}`;

        let contentType = 'application/x-subrip';
        if (finalExt === 'vtt') contentType = 'text/vtt';
        else if (finalExt === 'ass') contentType = 'text/x-ssa';
        else if (finalExt === 'lrc') contentType = 'text/plain';
        else if (finalExt === 'txt') contentType = 'text/plain; charset=utf-8';

        res.setHeader('Content-Disposition', `attachment; filename="${outFileName}"`);
        res.setHeader('Content-Type', contentType);

        if (isTxt) {
            const rawContent = fs.readFileSync(subFile, 'utf8');
            const cleanText = rawContent
                .replace(/\r\n/g, '\n')
                .replace(/^\d+\s*$/gm, '')
                .replace(/^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}.*$/gm, '')
                .replace(/<[^>]+>/g, '')
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean)
                .filter((line, idx, arr) => idx === 0 || line !== arr[idx - 1])
                .join('\n');

            try { if (fs.existsSync(subFile)) fs.unlinkSync(subFile); } catch (e) {}
            return res.send(cleanText);
        }

        const stream = fs.createReadStream(subFile);
        stream.pipe(res);
        stream.on('end', () => {
            try { if (fs.existsSync(subFile)) fs.unlinkSync(subFile); } catch (e) {}
        });
        stream.on('error', () => {
            try { if (fs.existsSync(subFile)) fs.unlinkSync(subFile); } catch (e) {}
        });
    } catch (err) {
        logger(null, `Subtitle extraction failed: ${err.message}`, "ERROR");
        res.status(500).send(`Failed to extract subtitles: ${err.message}`);
    }
});

// --- API: DOWNLOAD & PROCESS ---
app.post('/api/download', async (req, res) => {
    const {
        url,
        vId,
        aId,
        vLabel,
        aLabel,
        title,
        qualityPreset,
        videoQuality,
        audioQuality,
        thumbnail,
        artist,
        container,
        splitChapters,
        clipStart,
        clipEnd,
        audioLang,
        embedSubs,
        subLang
    } = req.body;
    const cleanedUrl = cleanMediaUrl(url);
    const jobId = uuidv4();
    
    let isAudioOnly = false;
    let isMuted = false;
    let formatSelection = '';
    let extension = 'mp4';
    let namingTag = '';
    const clipStartSeconds = parseTimeToSeconds(clipStart);
    const clipEndSeconds = parseTimeToSeconds(clipEnd);
    let resolvedClipStart = null;
    let resolvedClipEnd = null;

    if (clipStartSeconds !== null && clipEndSeconds !== null) {
        if (clipStartSeconds < clipEndSeconds) {
            resolvedClipStart = formatSecondsToClock(clipStartSeconds);
            resolvedClipEnd = formatSecondsToClock(clipEndSeconds);
        } else {
            logger(jobId, `Warning: Inverted clip range requested (${clipStart} -> ${clipEnd}). Clip disabled to prevent failure.`, "WARN");
        }
    } else if (clipStartSeconds !== null && clipEndSeconds === null) {
        resolvedClipStart = formatSecondsToClock(clipStartSeconds);
    }

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
        if (container && container !== 'default') {
            extension = container;
        }
    } else {
        isAudioOnly = !vId && !!aId;
        extension = isAudioOnly ? 'mp3' : 'mp4';

        if (isAudioOnly) {
            if (container && container !== 'default') {
                extension = container;
                targetAudio = container;
                if (container === 'm4a') {
                    formatSelection = (aId && aId !== 'm4a' && aId !== 'mp3') ? aId : 'bestaudio[ext=m4a]/bestaudio/best';
                } else if (container === 'opus') {
                    formatSelection = (aId && aId !== 'm4a' && aId !== 'mp3') ? aId : 'bestaudio[acodec=opus]/bestaudio/best';
                } else if (container === 'mp3') {
                    formatSelection = (aId && aId !== 'm4a' && aId !== 'mp3') ? aId : 'bestaudio/best';
                    targetAudio = '320k';
                } else {
                    formatSelection = (aId && aId !== 'm4a' && aId !== 'mp3') ? aId : 'bestaudio/best';
                }
            } else if (aId === 'mp3' || aId === 'm4a') {
                if (aId === 'mp3') {
                    formatSelection = 'bestaudio/best';
                    targetAudio = '320k';
                    extension = 'mp3';
                } else if (aId === 'm4a') {
                    formatSelection = 'bestaudio[ext=m4a]/bestaudio/best';
                    targetAudio = 'm4a';
                    extension = 'm4a';
                }
            } else {
                formatSelection = aId || 'bestaudio/best';
            }
        } else {
            formatSelection = (vId && aId) ? `${vId}+${aId}` : (vId || aId || 'best');
            if (container && container !== 'default') {
                extension = container;
            }
        }
        namingTag = `${vLabel || 'NoVideo'}_${aLabel || 'NoAudio'}`;
    }

    if (audioLang && audioLang !== 'default' && audioLang !== '') {
        if (isAudioOnly) {
            formatSelection = audioLang;
        } else if (vId && !isMuted) {
            formatSelection = `${vId}+${audioLang}`;
        }
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
        baseName: null,
        splitChapters: !!splitChapters,
        clipStart: resolvedClipStart,
        clipEnd: resolvedClipEnd,
        embedSubs: !!embedSubs,
        subLang: subLang || null,
        hasZipBundle: false
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
    let metaArtist = artist || "Unknown Artist";
    let metaDate = "";
    let metaThumb = thumbnail || "";

    if (fs.existsSync(infoJsonPath)) {
        try {
            const infoData = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
            if (infoData.title && !title) metaTitle = infoData.title;
            if (infoData.uploader || infoData.channel) metaArtist = artist || infoData.uploader || infoData.channel;
            if (infoData.upload_date) metaDate = infoData.upload_date.substring(0, 4);
            if (infoData.thumbnail && !metaThumb) metaThumb = infoData.thumbnail;
        } catch (e) {}
    }

    // Resilient fallback for YouTube thumbnail if missing
    if (!metaThumb) {
        const vidMatch = cleanedUrl.match(/(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
        if (vidMatch) {
            metaThumb = `https://i.ytimg.com/vi/${vidMatch[1]}/hqdefault.jpg`;
        }
    }
    
    // Store metadata explicitly in the job to use during Task 2 Thumbnail Injection
    jobs[jobId].metaTitle = metaTitle;
    jobs[jobId].metaArtist = metaArtist;
    jobs[jobId].metaDate = metaDate;
    jobs[jobId].metaThumb = metaThumb;
    
    // Pre-fetch thumbnail in background parallel to yt-dlp download
    const manualThumb = path.join(TEMP_DIR, `${jobId.substring(0, 8)}_manual.jpg`);
    let thumbFetchPromise = null;
    if (metaThumb) {
        thumbFetchPromise = new Promise((resolve) => {
            const p = spawn('ffmpeg', ['-y', '-i', metaThumb, '-vframes', '1', manualThumb, '-hide_banner', '-loglevel', 'error']);
            p.on('close', () => resolve(fs.existsSync(manualThumb) ? manualThumb : null));
            p.on('error', () => resolve(null));
        });
    }

    if (splitChapters) {
        ffmpegArgs.push('--split-chapters');
    }
    if (resolvedClipStart && resolvedClipEnd) {
        ffmpegArgs.push('--download-sections', `*${resolvedClipStart}-${resolvedClipEnd}`);
    } else if (resolvedClipStart && resolvedClipStart !== '00:00:00') {
        ffmpegArgs.push('--download-sections', `*${resolvedClipStart}-inf`);
    }
    if (embedSubs && subLang) {
        ffmpegArgs.push('--write-subs', '--write-auto-subs', '--sub-langs', subLang, '--convert-subs', 'srt');
    }

    ffmpegArgs.push('--no-playlist');
    if (resolvedFfmpegPath) {
        ffmpegArgs.push('--ffmpeg-location', path.dirname(resolvedFfmpegPath));
    }

    const download = ytdlp.download(cleanedUrl);
    jobs[jobId].downloadInstance = download;
    if (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) {
        download.cookies(COOKIES);
    }
    download.format(formatSelection);
    download.setOutputTemplate(path.join(TEMP_DIR, `${jobId.substring(0, 8)}_%(${'title'})s.%(${'ext'})s`));
    if (ffmpegArgs.length > 0) {
        download.addArgs(...ffmpegArgs);
    }
    download.on('progress', (p) => {
        if (jobs[jobId] && jobs[jobId].status === 'downloading') {
            jobs[jobId].progress = p.percentage_str || '0%';
            jobs[jobId].speed = p.speed_str || null;
            jobs[jobId].eta = p.eta_str || null;
            jobs[jobId].lastProgressTime = Date.now();
            const pInt = parseInt(p.percentage_str);
            if (pInt % 25 === 0) logger(jobId, `Progress: ${p.percentage_str}${p.speed_str ? ` (${p.speed_str})` : ''}`, "PROGRESS");
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

                // Await background pre-fetched thumbnail if yt-dlp did not provide one
                if (!thumbFile && thumbFetchPromise) {
                    thumbFile = await thumbFetchPromise;
                }

                if (jobs[jobId] && jobs[jobId].status === 'cancelled') return; // Exit if aborted

                if (jobs[jobId]?.splitChapters) {
                    const chapterFiles = fs.readdirSync(TEMP_DIR)
                        .filter((name) => (name.startsWith(jobId.substring(0, 8)) || name.startsWith(`${jobId}_`)) && !name.endsWith('_chapters.zip'))
                        .filter((name) => /\.(mp4|mkv|webm|mp3|m4a|opus|flac|wav|aac|ogg)$/i.test(name))
                        .map((name) => path.join(TEMP_DIR, name))
                        .filter((p) => p !== finalFile);

                    if (chapterFiles.length > 1) {
                        try {
                            const zipPath = await createChapterZip(jobId, chapterFiles, title || 'chapter_bundle');
                            // Reclaim disk space by cleaning up individual slice files immediately
                            chapterFiles.forEach((cf) => {
                                try { if (fs.existsSync(cf)) fs.unlinkSync(cf); } catch (e) {}
                            });
                            try { if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile); } catch (e) {}

                            jobs[jobId].file = path.basename(zipPath);
                            jobs[jobId].extension = 'zip';
                            jobs[jobId].hasZipBundle = true;
                            jobs[jobId].status = 'completed';
                            jobs[jobId].progress = '100%';
                            logger(jobId, `Chapter bundle created: ${jobs[jobId].file}`, 'SUCCESS');
                            return;
                        } catch (zipErr) {
                            logger(jobId, `Chapter zip creation failed: ${zipErr.message}`, 'WARN');
                        }
                    }
                }

                // TASK 2: Convert/remux into target format with full metadata and cover art
                if (fs.existsSync(finalFile)) {
                    try {
                        let targetExt = 'mp4';
                        if (container && container !== 'default') {
                            targetExt = container;
                        } else if (isAudioOnly) {
                            targetExt = 'mp3';
                            if (targetAudio === 'flac' || targetAudio === 'wav' || targetAudio === 'mkv' || targetAudio === 'm4a' || targetAudio === 'opus') {
                                targetExt = targetAudio;
                            } else if (targetAudio === 'best' || targetAudio === 'copy') {
                                const srcExt = path.extname(finalFile).replace('.', '').toLowerCase();
                                targetExt = (srcExt === 'm4a') ? 'm4a' : 'opus';
                            }
                        } else {
                            if (targetVideo === 'mkv' || targetAudio === 'mkv') targetExt = 'mkv';
                        }
                        
                        const embeddedFile = baseName + '_final.' + targetExt;
                        let embedArgs = [];
                        let subtitleFile = null;

                        if (isAudioOnly) {
                            if (targetExt === 'flac' || targetExt === 'wav') {
                                embedArgs = [
                                    '-y', '-threads', '0', '-i', finalFile,
                                    ...(thumbFile ? ['-i', thumbFile] : []),
                                    '-map', '0:a:0',
                                    ...(thumbFile ? ['-map', '1:0'] : []),
                                    '-c:a', targetExt === 'flac' ? 'flac' : 'pcm_s16le',
                                    ...(thumbFile ? ['-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic'] : []),
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else if (targetExt === 'mkv') {
                                embedArgs = [
                                    '-y', '-threads', '0', '-i', finalFile,
                                    '-map', '0:a:0',
                                    '-c:a', 'copy',
                                    ...(thumbFile ? ['-attach', thumbFile, '-metadata:s:t', 'mimetype=image/jpeg'] : []),
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else if (targetExt === 'm4a') {
                                // For m4a container, audio must be AAC or ALAC. If source is opus/vorbis/mp3, transcode to aac
                                const isSourceAac = finalFile.toLowerCase().endsWith('.m4a');
                                const aCodecArgs = isSourceAac ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '256k'];
                                embedArgs = [
                                    '-y', '-threads', '0', '-i', finalFile,
                                    ...(thumbFile ? ['-i', thumbFile] : []),
                                    '-map', '0:a:0',
                                    ...(thumbFile ? ['-map', '1:0'] : []),
                                    ...aCodecArgs,
                                    ...(thumbFile ? ['-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic'] : []),
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else if (targetExt === 'opus') {
                                // For opus/ogg container, audio must be opus. If source is aac/mp3, transcode to libopus
                                const isSourceOpus = finalFile.toLowerCase().endsWith('.opus') || finalFile.toLowerCase().endsWith('.webm');
                                const aCodecArgs = isSourceOpus ? ['-c:a', 'copy'] : ['-c:a', 'libopus', '-b:a', '160k'];
                                embedArgs = [
                                    '-y', '-threads', '0', '-i', finalFile,
                                    '-map', '0:a:0',
                                    ...aCodecArgs,
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    embeddedFile
                                ];
                            } else {
                                const lameBitrate = targetAudio && targetAudio !== 'best' && targetAudio !== 'copy' ? ['-b:a', targetAudio] : ['-b:a', '320k'];
                                embedArgs = [
                                    '-y', '-threads', '0', '-i', finalFile,
                                    ...(thumbFile ? ['-i', thumbFile] : []),
                                    '-map', '0:a:0',
                                    ...(thumbFile ? ['-map', '1:0'] : []),
                                    '-c:a', 'libmp3lame', ...lameBitrate, '-ac', '2',
                                    '-id3v2_version', '3',
                                    '-metadata', `title=${mTitle}`,
                                    '-metadata', `artist=${mArtist}`,
                                    '-metadata', `album_artist=${mArtist}`,
                                    '-metadata', `album=${mArtist} (YouTube)`,
                                    '-metadata', `date=${mDate}`,
                                    '-metadata', `year=${mDate}`,
                                    ...(thumbFile ? ['-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)'] : []),
                                    embeddedFile
                                ];
                            }
                        } else {
                            // Subtitle extraction & mapping for both muted and standard video
                            subtitleFile = null;
                            if (jobs[jobId].embedSubs && jobs[jobId].subLang) {
                                const subCandidates = fs.readdirSync(TEMP_DIR)
                                    .filter((name) => name.startsWith(jobId.substring(0, 8)) && /\.(vtt|srt|ass)$/i.test(name))
                                    .map((name) => path.join(TEMP_DIR, name));
                                if (subCandidates.length > 0 && fs.existsSync(subCandidates[0])) {
                                    subtitleFile = subCandidates[0];
                                }
                            }

                            // Build input list and track stream mappings
                            const inputs = ['-y', '-i', finalFile];
                            let nextInputIdx = 1;
                            let subInputIdx = -1;
                            let thumbInputIdx = -1;

                            if (subtitleFile) {
                                inputs.push('-i', subtitleFile);
                                subInputIdx = nextInputIdx++;
                            }
                            if (thumbFile && targetExt !== 'mkv') {
                                inputs.push('-i', thumbFile);
                                thumbInputIdx = nextInputIdx++;
                            }

                            // Format-specific subtitle codec & stream metadata
                            let subCodecArgs = [];
                            if (subInputIdx !== -1) {
                                const sLang = (jobs[jobId].subLang || 'en').toLowerCase();
                                const sLang3 = getIso3(sLang);
                                const sTitle = getSubtitleTrackTitle(sLang);

                                if (targetExt === 'mp4' || targetExt === 'm4v') {
                                    subCodecArgs = ['-c:s', 'mov_text', '-metadata:s:s:0', `language=${sLang3}`, '-metadata:s:s:0', `title=${sTitle}`];
                                } else if (targetExt === 'webm') {
                                    subCodecArgs = ['-c:s', 'webvtt', '-metadata:s:s:0', `language=${sLang3}`, '-metadata:s:s:0', `title=${sTitle}`];
                                } else {
                                    subCodecArgs = ['-c:s', 'copy', '-metadata:s:s:0', `language=${sLang3}`, '-metadata:s:s:0', `title=${sTitle}`];
                                }
                            }

                            const metaArgs = [
                                '-metadata', `title=${mTitle}`,
                                '-metadata', `artist=${mArtist}`,
                                '-metadata', `album_artist=${mArtist}`,
                                '-metadata', `album=${mArtist} (YouTube)`,
                                '-metadata', `date=${mDate}`,
                                '-metadata', `year=${mDate}`
                            ];

                            if (isMuted) {
                                const streamMaps = ['-map', '0:v:0'];
                                if (subInputIdx !== -1) streamMaps.push('-map', `${subInputIdx}:0`);
                                if (thumbInputIdx !== -1) streamMaps.push('-map', `${thumbInputIdx}:0`);

                                if (targetExt === 'mkv') {
                                    embedArgs = [
                                        ...inputs,
                                        ...streamMaps,
                                        '-c:v:0', 'copy',
                                        '-an',
                                        ...subCodecArgs,
                                        ...(thumbFile ? ['-attach', thumbFile, '-metadata:s:t', 'mimetype=image/jpeg'] : []),
                                        ...metaArgs,
                                        embeddedFile
                                    ];
                                } else {
                                    embedArgs = [
                                        ...inputs,
                                        ...streamMaps,
                                        '-c:v:0', 'copy',
                                        '-an',
                                        ...subCodecArgs,
                                        '-movflags', '+faststart',
                                        ...(thumbInputIdx !== -1 ? ['-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic'] : []),
                                        ...metaArgs,
                                        embeddedFile
                                    ];
                                }
                            } else {
                                const isTranscode = targetAudio && targetAudio !== 'best' && targetAudio !== 'copy';
                                const audioCodecArgs = isTranscode ? ['-c:a', 'aac', '-b:a', targetAudio] : ['-c:a', 'copy'];

                                const streamMaps = ['-map', '0:v:0', '-map', '0:a:0?'];
                                if (subInputIdx !== -1) streamMaps.push('-map', `${subInputIdx}:0`);
                                if (thumbInputIdx !== -1) streamMaps.push('-map', `${thumbInputIdx}:0`);

                                if (targetExt === 'mkv') {
                                    embedArgs = [
                                        ...inputs,
                                        ...streamMaps,
                                        '-c:v:0', 'copy',
                                        ...audioCodecArgs,
                                        ...subCodecArgs,
                                        ...(thumbFile ? ['-attach', thumbFile, '-metadata:s:t', 'mimetype=image/jpeg'] : []),
                                        ...metaArgs,
                                        embeddedFile
                                    ];
                                } else {
                                    embedArgs = [
                                        ...inputs,
                                        ...streamMaps,
                                        '-c:v:0', 'copy',
                                        ...audioCodecArgs,
                                        ...subCodecArgs,
                                        '-movflags', '+faststart',
                                        ...(thumbInputIdx !== -1 ? ['-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic'] : []),
                                        ...metaArgs,
                                        embeddedFile
                                    ];
                                }
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
                            const originalFile = finalFile;
                            finalFile = embeddedFile;
                            jobs[jobId].extension = targetExt;
                            try { if (fs.existsSync(originalFile)) fs.unlinkSync(originalFile); } catch (e) {}
                            if (thumbFile && fs.existsSync(thumbFile)) try { fs.unlinkSync(thumbFile); } catch (e) {}
                            if (subtitleFile && fs.existsSync(subtitleFile)) try { fs.unlinkSync(subtitleFile); } catch (e) {}
                            logger(jobId, `Task 2 Packaging Successful: Output is authentic ${targetExt.toUpperCase()}`, "META");

                            try {
                                if (isAudioOnly) {
                                    const audioTag = jobs[jobId].targetAudio === 'best' ? 'Best Quality' : jobs[jobId].targetAudio.toUpperCase();
                                } else {
                                    const pRes = spawnSync('ffmpeg', ['-nostdin', '-i', finalFile, '-hide_banner']);
                                    const probe = (pRes.stderr ? pRes.stderr.toString() : '') + (pRes.stdout ? pRes.stdout.toString() : '');
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
                        if (fs.existsSync(embeddedFile) && fs.statSync(embeddedFile).size > 1000) {
                            finalFile = embeddedFile;
                        }
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
                jobs[jobId].error = err.message || 'Download or processing failed';
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
        speed: job.speed || null,
        eta: job.eta || null,
        file: job.file,
        title: job.title,
        extension: job.extension,
        customTag: job.customTag,
        isAudioOnly: job.isAudioOnly,
        isMuted: job.isMuted,
        targetVideo: job.targetVideo,
        targetAudio: job.targetAudio,
        resolvedFormat: job.resolvedFormat,
        error: job.error,
        bundleType: job.hasZipBundle ? 'zip' : null
    });
});

// --- API: DELIVERY & CLEANUP ---
app.get('/api/file/:jobId/:title', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(400).send('File not ready');

    const filePath = path.join(TEMP_DIR, job.file);
    const safeTitle = req.params.title.replace(/[\/\\?%*:|"<>]/g, '_').trim() || 'media';

    // Dynamically use the correct extension (MP4 or MP3)
    const finalExt = job.extension || 'mp4';
    const finalName = job.hasZipBundle ? `${safeTitle}_chapters.zip` : `${safeTitle}_${job.customTag}.${finalExt}`;

    const fileSizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    logger(req.params.jobId, `Transmitting file to client: ${finalName} (${fileSizeMb} MB)`, "SEND");

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
                    const shortId = req.params.jobId.substring(0, 8);
                    const remaining = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(shortId) || f.includes(shortId));
                    remaining.forEach(rf => {
                        try { fs.unlinkSync(path.join(TEMP_DIR, rf)); } catch (e) {}
                    });
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
const publicDir = path.join(__dirname, 'public');

// Prioritize client/dist if present, otherwise serve pre-built public/ dist product
const staticDir = (fs.existsSync(clientDist) && fs.existsSync(path.join(clientDist, 'index.html')))
    ? clientDist
    : (fs.existsSync(publicDir) && fs.existsSync(path.join(publicDir, 'index.html')) ? publicDir : null);

if (staticDir) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        const indexPath = path.join(staticDir, 'index.html');
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
        next();
    });
}

// --- BOOT-TIME WARM-UP (primes yt-dlp disk cache in background) ---
const warmUpYtDlp = () => {
    if (!ytDlpPath) return;
    logger(null, 'Warming up yt-dlp engine (background, non-blocking)...');
    const warmArgs = [
        '--simulate',
        '--no-playlist',
        '--cache-dir', CACHE_DIR
    ];
    if (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) {
        warmArgs.push('--cookies', COOKIES);
    }
    warmArgs.push('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const warmup = spawn(ytDlpPath, warmArgs, { stdio: 'ignore' });
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

    if (!COOKIE_PASSWORD) {
        console.log("\x1b[1;31m" + "=".repeat(65) + "\x1b[0m");
        console.log("\x1b[1;31m[SECURITY WARNING] COOKIE_PASSWORD is not configured in .env!\x1b[0m");
        console.log("\x1b[1;31mCookie uploads on this server are UNPROTECTED without authentication.\x1b[0m");
        console.log("\x1b[33mFor remote deployments (e.g. Render / VPS), define COOKIE_PASSWORD in your .env or host settings to prevent unauthorized cookie modifications.\x1b[0m");
        console.log("\x1b[1;31m" + "=".repeat(65) + "\x1b[0m\n");
    } else {
        console.log(`[SECURITY] Cookie password protection: \x1b[1;32mENABLED\x1b[0m`);
    }

    app.listen(PORT, HOST, () => {
        console.log("\n" + "=".repeat(50));
        console.log(`[SERVER] Universal Media Extractor Server running on port ${PORT}`);
        console.log(`[ACCESS] Bound to: http://${HOST}:${PORT}`);
        console.log(`[TEMP]   Temp Folder: ${TEMP_DIR}`);
        console.log(`[CACHE]  Cache Folder: ${CACHE_DIR}`);
        console.log("=".repeat(50) + "\n");

        // Non-blocking: prime the yt-dlp disk cache while server is already accepting requests
        warmUpYtDlp();
    });
})();
