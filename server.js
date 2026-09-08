// =============================================================================
// Uni Extract — Performance-Fixed Server (server.js)
// Round 1 fixes (preserved): decoupled post-processing, smarter watchdog,
// faster analysis, larger caches, non-blocking warm-up, immediate delivery.
// Round 2 fixes (new):
//   #11 Analysis disk-cache READ-BACK (instant repeat analysis, 1h TTL)
//   #12 Downloads start instantly via --load-info-json (no URL re-extraction)
//   #13 Anti-throttle: 4 concurrent fragments + 10MB chunked transfer
//   #14 Raw-spawn engine: exit-code-driven completion (fixes jobs hanging
//       at "100%" when filePaths came back empty), weighted true progress
//   #15 /api/subtitle no longer blocks the event loop (was spawnSync, 45s)
//   #16 Stall detection (6 min of engine silence -> error, not infinite hang)
//   #17 Cleanup sweep no longer deletes files of active downloads
// =============================================================================
const express = require('express');
const { YtDlp, helpers } = require('ytdlp-nodejs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { execSync, spawn, spawnSync, exec } = require('child_process');
const cors = require('cors');
const archiver = require('archiver');
const os = require('os');

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
const isAsar = __dirname.includes('app.asar');
const defaultTemp = isAsar ? path.join(os.tmpdir(), 'uniextract-temp') : path.join(__dirname, 'temp');
const defaultCache = isAsar ? path.join(os.tmpdir(), 'uniextract-cache') : path.join(__dirname, 'cache');
const COOKIES = process.env.COOKIES_PATH || (isAsar ? path.join(os.tmpdir(), 'cookies.txt') : path.join(__dirname, 'cookies.txt'));
const TEMP_DIR = process.env.TEMP_DIR || defaultTemp;
const CACHE_DIR = process.env.CACHE_DIR || defaultCache;

// --- INITIALIZATION ---
let ytDlpPath = null;

// Enhanced CORS with Private Network Access (PNA) preflight support
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Access-Control-Request-Private-Network');

    if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (!fs.existsSync(TEMP_DIR)) {
    try {
        console.log(`[SYSTEM] Creating temporary directory at: ${TEMP_DIR}`);
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    } catch (e) {}
}

if (!fs.existsSync(CACHE_DIR)) {
    try {
        console.log(`[SYSTEM] Creating yt-dlp cache directory at: ${CACHE_DIR}`);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    } catch (e) {}
}

const jobs = {};
let selectedEncoder = 'libx264';

const getActiveJobsCount = () => {
    return Object.values(jobs).filter(j =>
        j && (j.status === 'downloading' || j.status === 'processing' || j.status === 'starting')
    ).length;
};

// =============================================================================
// FIX #1: ABORT & CLEANUP HELPER (unchanged behavior, faster kill)
// =============================================================================
const abortJob = (jobId, reason = 'Client disconnected or cancelled') => {
    const job = jobs[jobId];
    if (!job || job.status === 'completed' || job.status === 'cancelled') return;

    logger(jobId, `Aborting in-flight download: ${reason}`, "ABORT");
    job.status = 'cancelled';

    if (job.downloadInstance) {
        try {
            job.downloadInstance.stdout?.removeAllListeners('data');
            job.downloadInstance.stderr?.removeAllListeners('data');
            job.downloadInstance.removeAllListeners('close');
            job.downloadInstance.removeAllListeners('error');
        } catch (e) {}

        try {
            if (process.platform === 'win32' && job.downloadInstance.pid) {
                execSync(`taskkill /pid ${job.downloadInstance.pid} /T /F`, { stdio: 'ignore' });
            } else if (job.downloadInstance.pid) {
                try {
                    execSync(`pkill -P ${job.downloadInstance.pid} -9`, { stdio: 'ignore' });
                } catch (e) {}
                job.downloadInstance.kill('SIGKILL');
            }
        } catch (e) {}
    }

    if (job.activeFfmpeg && job.activeFfmpeg.pid) {
        try {
            job.activeFfmpeg.stdout?.removeAllListeners('data');
            job.activeFfmpeg.stderr?.removeAllListeners('data');
            job.activeFfmpeg.removeAllListeners('close');
            job.activeFfmpeg.removeAllListeners('error');
        } catch (e) {}

        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${job.activeFfmpeg.pid} /T /F`, { stdio: 'ignore' });
            } else {
                try {
                    execSync(`pkill -P ${job.activeFfmpeg.pid} -9`, { stdio: 'ignore' });
                } catch (e) {}
                job.activeFfmpeg.kill('SIGKILL');
            }
        } catch (e) {}
    }

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

    setTimeout(() => {
        delete jobs[jobId];
    }, 30000);
};

// =============================================================================
// FIX #2 + #16: SMARTER WATCHDOG + STALL DETECTION
// - Extended timeout: 180s so background tabs don't get killed
// - Only abort if BOTH (a) no progress in 30s AND (b) no polling in 180s
// - NEW: if the engine goes totally silent for 6 minutes while downloading,
//   the job is failed with an error instead of hanging forever
// =============================================================================
const WATCHDOG_TIMEOUT_MS = 180000;
const STARTUP_GRACE_PERIOD_MS = 45000;
const PROGRESS_FRESH_MS = 30000;
const STALL_NO_OUTPUT_MS = 360000;     // 6 minutes of total engine silence

setInterval(() => {
    const now = Date.now();
    Object.entries(jobs).forEach(([jobId, job]) => {
        if (!job || job.status !== 'downloading') return;

        // NEW (#16): stall detection — kill and fail rather than hang forever
        if (job.lastOutputTime && (now - job.lastOutputTime > STALL_NO_OUTPUT_MS)) {
            const inst = job.downloadInstance;
            job.status = 'error';
            job.error = 'Download engine stalled (no output from yt-dlp for 6 minutes). Please retry.';
            logger(jobId, `Download engine stalled — marking job as error.`, "ERROR");
            if (inst && inst.pid) {
                try {
                    inst.stdout?.removeAllListeners('data');
                    inst.stderr?.removeAllListeners('data');
                } catch (e) {}
                try {
                    if (process.platform === 'win32') {
                        spawnSync('taskkill', ['/pid', String(inst.pid), '/T', '/F'], { stdio: 'ignore' });
                    } else {
                        try { spawnSync('pkill', ['-P', String(inst.pid), '-9'], { stdio: 'ignore' }); } catch (e) {}
                        inst.kill('SIGKILL');
                    }
                } catch (e) {}
            }
            job.downloadInstance = null;
            return;
        }

        // 1. Never abort during startup grace period
        if (job.createdAt && (now - job.createdAt < STARTUP_GRACE_PERIOD_MS)) return;

        // 2. Never abort if yt-dlp is actively pushing progress bytes
        if (job.lastProgressTime && (now - job.lastProgressTime < PROGRESS_FRESH_MS)) return;

        // 3. Only abort if client has completely ceased polling for > 3 minutes
        if (job.lastPoll && (now - job.lastPoll > WATCHDOG_TIMEOUT_MS)) {
            abortJob(jobId, `Client stopped polling for > 3 min (browser tab closed or unreachable)`);
        }
    });
}, 5000);

// =============================================================================
// FIX #3: LARGER, LONGER-LIVED ANALYSIS CACHE
// =============================================================================
const analysisCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_SIZE = 1000;

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
    if (analysisCache.size > CACHE_MAX_SIZE) {
        const toRemove = Math.floor(CACHE_MAX_SIZE * 0.1);
        const keys = Array.from(analysisCache.keys()).slice(0, toRemove);
        keys.forEach(k => analysisCache.delete(k));
    }
    analysisCache.set(url, { timestamp: Date.now(), data });
};

const logger = (jobId, message, type = 'INFO') => {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const idTag = jobId ? `[Job: ${jobId.substring(0, 8)}]` : '[SYSTEM]';
    const typeTag = `[${type}]`.padEnd(8);
    console.log(`${timestamp} ${idTag} ${typeTag} ${message}`);
};

// Global error handlers to prevent unhandled rejections or runtime exceptions from crashing the server
process.on('uncaughtException', (err) => {
    logger(null, `Uncaught Exception caught: ${err?.message || err}\n${err?.stack || ''}`, 'ERROR');
});
process.on('unhandledRejection', (reason) => {
    logger(null, `Unhandled Rejection caught: ${reason?.message || reason}`, 'ERROR');
});

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
        .replace(/\b(low|medium|high|ultra|tiny|small)\b/gi, '')
        .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanNote) {
        cleanNote = cleanNote
            .replace(/\[\s*original\s*\]/gi, '(Original)')
            .replace(/\[\s*dubbed\s*\]/gi, '(Dubbed)')
            .replace(/\(?\boriginal\s*\(default\)\)?/gi, '(Original)')
            .replace(/\(?\boriginal\b\)?/gi, '(Original)')
            .replace(/\(?\bdubbed\b\)?/gi, '(Dubbed)')
            .replace(/\bdefault\b/gi, '')
            .replace(/\[\s*\((.*?)\)\s*\]/g, '($1)')
            .replace(/\(\s*\((.*?)\)\s*\)/g, '($1)')
            .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (cleanNote) return cleanNote;
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

        const rawLang = (fmt.language || fmt.language_code || '').toLowerCase().trim();
        const note = fmt.format_note || '';

        const displayLabel = cleanLanguageName(rawLang, note);
        const langKey = rawLang || displayLabel.toLowerCase();

        const isOriginal = (fmt.language_preference !== undefined && fmt.language_preference >= 0) ||
                           (note && note.toLowerCase().includes('original')) ||
                           (fmt.is_default === true);

        const abr = fmt.abr || fmt.tbr || 0;
        const existing = map.get(langKey);

        if (!existing || abr > existing.abr || (isOriginal && !existing.isOriginal)) {
            map.set(langKey, {
                id: fmt.format_id,
                language: displayLabel,
                abr,
                ext: fmt.ext || 'audio',
                isOriginal: !!isOriginal,
                languageCode: rawLang
            });
        }
    }

    const tracks = [...map.values()];
    // Always sort the original audio track FIRST, then sort by highest bitrate
    tracks.sort((a, b) => {
        if (a.isOriginal && !b.isOriginal) return -1;
        if (!a.isOriginal && b.isOriginal) return 1;
        return (b.abr || 0) - (a.abr || 0);
    });

    return tracks;
};

const collectSubtitleOptions = (info) => {
    const combined = new Map();

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

    if (info?.automatic_captions && typeof info.automatic_captions === 'object') {
        for (const [lang, entries] of Object.entries(info.automatic_captions)) {
            const list = Array.isArray(entries) ? entries : [];
            const rawName = list[0]?.name;
            const isOrig = lang.endsWith('-orig');

            if (lang.includes('-') && !isOrig && !['zh-Hans', 'zh-Hant', 'pt-BR', 'es-419', 'en-US', 'en-GB'].includes(lang)) {
                continue;
            }

            if (isOrig) {
                const label = rawName || (lang.startsWith('en') ? 'English (Original)' : `${lang} (Original)`);
                combined.set(lang, {
                    id: lang,
                    lang,
                    name: label,
                    isAuto: true,
                    isOrig: true
                });
            } else if (!combined.has(lang)) {
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

    try {
        const bundled = helpers.findYtdlpBinary();
        if (bundled) {
            const unpackedBundled = bundled.replace('app.asar', 'app.asar.unpacked');
            if (fs.existsSync(unpackedBundled)) {
                ytDlpPath = unpackedBundled;
                logger(null, `Using bundled yt-dlp binary at: ${ytDlpPath}`);
                return ytDlpPath;
            } else if (fs.existsSync(bundled)) {
                ytDlpPath = bundled;
                logger(null, `Using bundled yt-dlp binary at: ${ytDlpPath}`);
                return ytDlpPath;
            }
        }
    } catch (e) {}

    try {
        const checkCmd = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
        const systemPath = execSync(checkCmd).toString().trim().split(/\r?\n/)[0].trim();
        if (systemPath && fs.existsSync(systemPath)) {
            ytDlpPath = systemPath;
            logger(null, `Using system yt-dlp binary at: ${ytDlpPath}`);
            return ytDlpPath;
        }
    } catch (e) {}

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

const cleanMediaUrl = (rawUrl) => {
    try {
        const parsed = new URL(rawUrl);

        if (parsed.hostname.includes('youtube.com')) {
            const listParam = parsed.searchParams.get('list');
            const hasVideo = parsed.searchParams.has('v');
            const isPlaylistUrl = parsed.pathname.includes('/playlist') || (listParam && !hasVideo);

            // Handle YouTube Radio / Mixes (list=RD...)
            if (listParam && listParam.startsWith('RD')) {
                if (hasVideo) {
                    // When watching a specific video, YouTube appends automated radio list=RD...: strip it so user gets the video
                    parsed.searchParams.delete('list');
                } else if (parsed.pathname.includes('/playlist')) {
                    // Standalone mix playlist link: resolve seed video ID and route to /watch?v=...
                    const seedVideoId = listParam.replace(/^RD(AMVM|AMBN|CLAK5uy_)?/, '').slice(0, 11);
                    if (seedVideoId && seedVideoId.length >= 11) {
                        parsed.pathname = '/watch';
                        parsed.searchParams.set('v', seedVideoId);
                        parsed.searchParams.delete('list');
                    }
                }
            } else if (!isPlaylistUrl && !parsed.pathname.includes('/playlist')) {
                // Strip non-standard list parameters on video watch links (preserve genuine playlists PL/OLAK/UU/FL)
                if (listParam && !listParam.startsWith('PL') && !listParam.startsWith('OLAK') && !listParam.startsWith('UU') && !listParam.startsWith('FL')) {
                    parsed.searchParams.delete('list');
                }
            }
            parsed.searchParams.delete('index');
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
            parsed.searchParams.delete('playnext');
            parsed.searchParams.delete('start_radio');
            parsed.searchParams.delete('rv');
        } else if (parsed.hostname.includes('youtu.be')) {
            parsed.searchParams.delete('si');
            parsed.searchParams.delete('pp');
            parsed.searchParams.delete('playnext');
            parsed.searchParams.delete('start_radio');
            parsed.searchParams.delete('rv');
        }

        const trackingParams = ['igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'is_from_webapp', 'sender_device', 'share_app_id', 'feature', 'fbclid'];
        trackingParams.forEach(param => parsed.searchParams.delete(param));

        return parsed.toString();
    } catch (e) {
        return rawUrl;
    }
};

// --- ENSURE FFMPEG BINARY (CROSS-PLATFORM NATIVE FIRST WITH STATIC FALLBACK) ---
let resolvedFfmpegPath = null;
let ffmpegMeta = {
    path: null,
    source: 'none', // 'native' | 'static' | 'custom' | 'none'
    version: null,
    hardwareAcceleration: null,
    mode: 'auto'
};

const testFfmpegExecutable = (candidatePath) => {
    if (!candidatePath || typeof candidatePath !== 'string') return null;
    try {
        if (!fs.existsSync(candidatePath)) return null;
        if (process.platform !== 'win32') {
            try {
                fs.accessSync(candidatePath, fs.constants.X_OK);
            } catch (e) {
                return null;
            }
        }
        const stat = fs.statSync(candidatePath);
        if (!stat.isFile()) return null;

        const probe = spawnSync(candidatePath, ['-version'], {
            timeout: 4000,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });

        if (probe.status === 0 && probe.stdout) {
            const lines = probe.stdout.trim().split(/\r?\n/);
            const firstLine = lines[0] || 'ffmpeg version unknown';
            return {
                path: candidatePath,
                versionLine: firstLine,
                fullOutput: probe.stdout
            };
        }
    } catch (e) {}
    return null;
};

const isBundledFfmpegPath = (candidatePath) => {
    if (!candidatePath) return false;
    const normalized = path.normalize(candidatePath).toLowerCase();
    return normalized.includes('node_modules') ||
           normalized.includes('app.asar') ||
           normalized.includes('ffmpeg-static') ||
           normalized.includes('@ffmpeg-installer');
};

const findNativeFfmpeg = () => {
    const candidates = [];

    // 1. Search PATH via system lookup command
    try {
        if (process.platform === 'win32') {
            const whereOut = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            if (whereOut.status === 0 && whereOut.stdout) {
                const foundLines = whereOut.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                candidates.push(...foundLines);
            }
        } else {
            const whichOut = spawnSync('which', ['-a', 'ffmpeg'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            if (whichOut.status === 0 && whichOut.stdout) {
                const foundLines = whichOut.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                candidates.push(...foundLines);
            } else {
                // Fallback to simple 'which ffmpeg'
                const singleWhich = spawnSync('which', ['ffmpeg'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                if (singleWhich.status === 0 && singleWhich.stdout) {
                    candidates.push(singleWhich.stdout.trim().split(/\r?\n/)[0].trim());
                }
            }
        }
    } catch (e) {}

    // 2. Standard system locations per OS
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        const programData = process.env.ProgramData || 'C:\\ProgramData';
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const homeDir = os.homedir();

        candidates.push(
            path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
            path.join(programData, 'chocolatey', 'bin', 'ffmpeg.exe'),
            path.join(homeDir, 'scoop', 'shims', 'ffmpeg.exe'),
            path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
            path.join(programFiles, 'ffmpeg', 'ffmpeg.exe'),
            path.join(programFilesX86, 'ffmpeg', 'bin', 'ffmpeg.exe'),
            'C:\\ffmpeg\\bin\\ffmpeg.exe',
            'C:\\ffmpeg\\ffmpeg.exe'
        );
    } else if (process.platform === 'darwin') {
        // macOS standard paths (Homebrew Apple Silicon / Intel, MacPorts, etc.)
        candidates.push(
            '/opt/homebrew/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/opt/local/bin/ffmpeg',
            path.join(os.homedir(), 'bin', 'ffmpeg'),
            path.join(os.homedir(), '.local', 'bin', 'ffmpeg'),
            '/usr/bin/ffmpeg'
        );
    } else {
        // Linux (Render containers, Docker, Ubuntu, Debian, Alpine, Arch, etc.)
        candidates.push(
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/bin/ffmpeg',
            '/snap/bin/ffmpeg',
            '/usr/lib/jellyfin-ffmpeg/ffmpeg',
            path.join(os.homedir(), '.local', 'bin', 'ffmpeg'),
            path.join(os.homedir(), 'bin', 'ffmpeg'),
            '/opt/ffmpeg/bin/ffmpeg'
        );
    }

    // Deduplicate and test each candidate (skipping bundled node_modules paths)
    const seen = new Set();
    for (const candidate of candidates) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        if (isBundledFfmpegPath(candidate)) continue;

        const tested = testFfmpegExecutable(candidate);
        if (tested) {
            return tested;
        }
    }

    return null;
};

const findStaticFfmpeg = () => {
    const staticCandidates = [
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

    const seen = new Set();
    for (const candidate of staticCandidates) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);

        const tested = testFfmpegExecutable(candidate);
        if (tested) {
            return tested;
        }
    }

    return null;
};

const ensureFfmpeg = () => {
    if (resolvedFfmpegPath && fs.existsSync(resolvedFfmpegPath)) {
        return resolvedFfmpegPath;
    }

    const envMode = (process.env.FFMPEG_MODE || '').toLowerCase().trim();
    const preferStatic = process.env.FFMPEG_PREFER_STATIC === 'true' || process.env.FFMPEG_FORCE_STATIC === 'true';
    const effectiveMode = envMode || (preferStatic ? 'static' : 'auto');
    ffmpegMeta.mode = effectiveMode;

    console.log("\n" + "=".repeat(60));
    logger(null, "Probing FFmpeg Environment & Binary Availability...", "START");
    logger(null, `FFmpeg Resolution Mode: ${effectiveMode.toUpperCase()} | Platform: ${process.platform} (${process.arch})`);

    // Case 1: Explicit FFMPEG_PATH provided
    if (process.env.FFMPEG_PATH) {
        const explicitCandidate = process.env.FFMPEG_PATH;
        logger(null, `Checking explicit FFMPEG_PATH override: ${explicitCandidate}`);
        const tested = testFfmpegExecutable(explicitCandidate);
        if (tested) {
            resolvedFfmpegPath = tested.path;
            ffmpegMeta.source = 'custom';
            ffmpegMeta.path = tested.path;
            ffmpegMeta.version = tested.versionLine;
            logger(null, `✓ Explicit FFmpeg binary validated: ${resolvedFfmpegPath}`, "SYSTEM");
            logger(null, `FFmpeg Engine: ${tested.versionLine}`, "SYSTEM");
        } else {
            logger(null, `WARNING: Explicit FFMPEG_PATH '${explicitCandidate}' is invalid or not executable. Falling back...`, "WARN");
        }
    }

    // Case 2: Auto or Native mode -> Probe native system FFmpeg first
    if (!resolvedFfmpegPath && effectiveMode !== 'static') {
        logger(null, "Checking for host native FFmpeg (supports dynamic codecs & hardware acceleration)...");
        const nativeMatch = findNativeFfmpeg();
        if (nativeMatch) {
            resolvedFfmpegPath = nativeMatch.path;
            ffmpegMeta.source = 'native';
            ffmpegMeta.path = nativeMatch.path;
            ffmpegMeta.version = nativeMatch.versionLine;
            logger(null, `✓ Native system FFmpeg detected: ${resolvedFfmpegPath}`, "SYSTEM");
            logger(null, `FFmpeg Engine: ${nativeMatch.versionLine}`, "SYSTEM");
            logger(null, "FFmpeg Type: Native System Binary (dynamic codecs & hardware acceleration supported)", "SYSTEM");
        } else {
            logger(null, `Host native FFmpeg not found on this ${process.platform} system.`);
            if (effectiveMode === 'native') {
                logger(null, "CRITICAL: FFMPEG_MODE is set to 'native' but no native FFmpeg was found!", "CRITICAL");
            }
        }
    }

    // Case 3: Fallback to bundled static build if native not found or mode is 'static'
    if (!resolvedFfmpegPath && effectiveMode !== 'native') {
        logger(null, "Falling back to bundled static FFmpeg (ffmpeg-static)...");
        const staticMatch = findStaticFfmpeg();
        if (staticMatch) {
            resolvedFfmpegPath = staticMatch.path;
            ffmpegMeta.source = 'static';
            ffmpegMeta.path = staticMatch.path;
            ffmpegMeta.version = staticMatch.versionLine;
            logger(null, `✓ Bundled static FFmpeg active: ${resolvedFfmpegPath}`, "FALLBACK");
            logger(null, `FFmpeg Engine: ${staticMatch.versionLine}`, "FALLBACK");
            logger(null, "FFmpeg Type: Bundled Static Binary (CPU-only processing fallback; dynamic hwaccel stripped)", "FALLBACK");
        }
    }

    // Update PATH so child processes (yt-dlp, CLI helpers) access the selected binary
    if (resolvedFfmpegPath) {
        const ffmpegDir = path.dirname(resolvedFfmpegPath);
        const currentPath = process.env.PATH || '';
        const pathParts = currentPath.split(path.delimiter);
        if (!pathParts.includes(ffmpegDir)) {
            process.env.PATH = `${ffmpegDir}${path.delimiter}${currentPath}`;
        }
        process.env.FFMPEG_PATH = resolvedFfmpegPath;
    } else {
        ffmpegMeta.source = 'none';
        logger(null, "CRITICAL: No usable FFmpeg binary found in system PATH or bundled packages!", "CRITICAL");
    }

    console.log("=".repeat(60) + "\n");
    return resolvedFfmpegPath;
};

const testEncoderHardwareSupport = (ffmpegBin, encoderName) => {
    try {
        const res = spawnSync(ffmpegBin, [
            '-hide_banner',
            '-loglevel', 'error',
            '-f', 'lavfi',
            '-i', 'color=c=black:s=64x64:d=0.04',
            '-c:v', encoderName,
            '-frames:v', '1',
            '-f', 'null',
            '-'
        ], {
            timeout: 2000,
            stdio: ['ignore', 'ignore', 'ignore']
        });
        return res.status === 0;
    } catch (e) {
        return false;
    }
};

const detectHardware = () => {
    console.log("\n" + "=".repeat(60));
    logger(null, "Probing Hardware Acceleration Capabilities...");
    const activeFfmpeg = ensureFfmpeg();

    if (!activeFfmpeg) {
        logger(null, "ERROR: Cannot probe hardware acceleration. No FFmpeg binary available.", "CRITICAL");
        console.log("=".repeat(60) + "\n");
        return;
    }

    try {
        const probe = spawnSync(activeFfmpeg, ['-encoders'], {
            timeout: 5000,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        const encodersOutput = (probe.stdout || '') + (probe.stderr || '');

        // Select candidates appropriate for the active operating system
        const platformCandidates = [];
        if (process.platform === 'win32') {
            platformCandidates.push(
                { id: 'h264_nvenc', name: 'NVIDIA NVENC (h264_nvenc)' },
                { id: 'h264_qsv', name: 'Intel QuickSync (h264_qsv)' },
                { id: 'h264_amf', name: 'AMD AMF (h264_amf)' },
                { id: 'h264_mf', name: 'Windows Media Foundation (h264_mf)' }
            );
        } else if (process.platform === 'darwin') {
            platformCandidates.push(
                { id: 'h264_videotoolbox', name: 'Apple VideoToolbox (h264_videotoolbox)' }
            );
        } else {
            // Linux / Render containers / Docker / BSD
            platformCandidates.push(
                { id: 'h264_nvenc', name: 'NVIDIA NVENC (h264_nvenc)' },
                { id: 'h264_qsv', name: 'Intel QuickSync (h264_qsv)' },
                { id: 'h264_vaapi', name: 'Linux VA-API (h264_vaapi)' },
                { id: 'h264_amf', name: 'AMD AMF (h264_amf)' },
                { id: 'h264_v4l2m2m', name: 'ARM V4L2 (h264_v4l2m2m)' }
            );
        }

        const verifiedEncoders = [];
        for (const candidate of platformCandidates) {
            // 1. Check if the binary was compiled with this encoder
            if (encodersOutput.includes(candidate.id)) {
                // 2. Actually test whether the host GPU/driver can initialize and encode with it
                if (testEncoderHardwareSupport(activeFfmpeg, candidate.id)) {
                    verifiedEncoders.push(candidate);
                }
            }
        }

        if (verifiedEncoders.length > 0) {
            selectedEncoder = verifiedEncoders[0].id;
            ffmpegMeta.hardwareAcceleration = selectedEncoder;
            verifiedEncoders.forEach(enc => {
                logger(null, `SUCCESS: Verified working hardware encoder: ${enc.name}`, "HARDWARE");
            });
            logger(null, `Active Hardware Transcoder: ${selectedEncoder}`, "HARDWARE");
        } else {
            selectedEncoder = 'libx264';
            ffmpegMeta.hardwareAcceleration = false;
            if (ffmpegMeta.source === 'static') {
                logger(null, "NOTICE: Static build is CPU-only (libx264). Dynamic hardware acceleration is stripped from static packages.", "FALLBACK");
                logger(null, "TIP: Install native FFmpeg (e.g. 'apt-get install -y ffmpeg' on Linux/Render) to enable GPU acceleration.", "INFO");
            } else {
                logger(null, "NOTICE: No active GPU hardware encoder verified on host. Using CPU (libx264).", "FALLBACK");
            }
        }
    } catch (err) {
        logger(null, `ERROR: FFmpeg encoder probe failed: ${err.message}`, "CRITICAL");
    }
    console.log("=".repeat(60) + "\n");
};
detectHardware();

app.get('/favicon.ico', (req, res) => {
    const logoPath = path.join(__dirname, 'favicon.ico');
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
    } else {
        res.status(404).end();
    }
});

app.get('/favfavicon.ico', (req, res) => {
    const logoPath = path.join(__dirname, 'favicon.ico');
    if (fs.existsSync(logoPath)) {
        res.sendFile(logoPath);
    } else {
        res.status(404).end();
    }
});

app.get('/api/health', (req, res) => {
    const appVersion = require('./package.json').version || '2.8.5';
    res.json({
        status: 'ok',
        version: appVersion,
        uptime: Math.floor(process.uptime()),
        timestamp: Date.now(),
        ffmpeg: {
            path: resolvedFfmpegPath,
            source: ffmpegMeta.source,
            version: ffmpegMeta.version,
            encoder: selectedEncoder,
            hardwareAcceleration: ffmpegMeta.hardwareAcceleration || false,
            mode: ffmpegMeta.mode
        }
    });
});

app.get('/api/version', (req, res) => {
    const appVersion = require('./package.json').version || '2.8.5';
    res.json({ version: appVersion, name: 'uni-extract' });
});

const cachedReleaseData = { stable: null, beta: null };
const lastReleaseCheck = { stable: 0, beta: 0 };
const RELEASE_CACHE_TTL = 15 * 60 * 1000;
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

function getVersionBumpType(current, latest) {
    const [cMaj, cMin, cPat] = parseSemver(current);
    const [lMaj, lMin, lPat] = parseSemver(latest);
    if (lMaj > cMaj) return 'major';
    if (lMin > cMin) return 'minor';
    if (lPat > cPat) return 'patch';
    return 'none';
}

function categorizeReleaseNotes(body) {
    const categories = { features: [], fixes: [], security: [], performance: [], general: [] };
    if (!body) return categories;

    const lines = body.split('\n');
    let currentCat = 'general';

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const lower = line.toLowerCase();

        if (lower.startsWith('#') || lower.startsWith('**')) {
            if (lower.includes('feature') || lower.includes('what\'s new') || lower.includes('added') || lower.includes('enhancement')) {
                currentCat = 'features';
            } else if (lower.includes('fix') || lower.includes('bug') || lower.includes('resolved') || lower.includes('patch')) {
                currentCat = 'fixes';
            } else if (lower.includes('security') || lower.includes('cve') || lower.includes('vulnerability')) {
                currentCat = 'security';
            } else if (lower.includes('performance') || lower.includes('speed') || lower.includes('optim')) {
                currentCat = 'performance';
            } else {
                currentCat = 'general';
            }
            continue;
        }

        if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) {
            const cleanItem = line.replace(/^[-*•]\s*/, '').trim();
            if (cleanItem) {
                const itemLower = cleanItem.toLowerCase();
                let itemCat = currentCat;
                if (itemLower.startsWith('feat') || itemLower.includes('feature')) itemCat = 'features';
                else if (itemLower.startsWith('fix') || itemLower.includes('bugfix')) itemCat = 'fixes';
                else if (itemLower.startsWith('sec') || itemLower.includes('security')) itemCat = 'security';
                else if (itemLower.startsWith('perf') || itemLower.includes('speed')) itemCat = 'performance';

                categories[itemCat].push(cleanItem);
            }
        }
    }
    return categories;
}

function createStaticReleaseAssets(version) {
    const cleanVersion = String(version || '2.8.5').replace(/^v/i, '');
    const tag = `v${cleanVersion}`;
    const base = `https://github.com/AryansDevStudios/UniExtract/releases/download/${tag}`;
    return [
        { name: `UniExtract-${cleanVersion}-x64-Setup.exe`, size: 135214320, url: `${base}/UniExtract-${cleanVersion}-x64-Setup.exe`, type: 'windows-installer', arch: 'x64' },
        { name: `UniExtract-Portable-${cleanVersion}-x64.exe`, size: 134919096, url: `${base}/UniExtract-Portable-${cleanVersion}-x64.exe`, type: 'windows-portable', arch: 'x64' },
        { name: `UniExtract-${cleanVersion}-arm64-Setup.exe`, size: 129645880, url: `${base}/UniExtract-${cleanVersion}-arm64-Setup.exe`, type: 'windows-installer', arch: 'arm64' },
        { name: `UniExtract-Portable-${cleanVersion}-arm64.exe`, size: 129351104, url: `${base}/UniExtract-Portable-${cleanVersion}-arm64.exe`, type: 'windows-portable', arch: 'arm64' },
        { name: `UniExtract-${cleanVersion}-Setup.exe`, size: 264097800, url: `${base}/UniExtract-${cleanVersion}-Setup.exe`, type: 'windows-installer', arch: 'universal' },
        { name: `UniExtract-Portable-${cleanVersion}.exe`, size: 263802752, url: `${base}/UniExtract-Portable-${cleanVersion}.exe`, type: 'windows-portable', arch: 'universal' },
        { name: `UniExtract-${cleanVersion}-x86_64.AppImage`, size: 190446590, url: `${base}/UniExtract-${cleanVersion}-x86_64.AppImage`, type: 'linux-appimage', arch: 'x64' },
        { name: `UniExtract-${cleanVersion}-amd64.deb`, size: 156414404, url: `${base}/UniExtract-${cleanVersion}-amd64.deb`, type: 'linux-deb', arch: 'x64' },
        { name: `UniExtract-${cleanVersion}-arm64.AppImage`, size: 190672809, url: `${base}/UniExtract-${cleanVersion}-arm64.AppImage`, type: 'linux-appimage', arch: 'arm64' },
        { name: `UniExtract-${cleanVersion}-x64.dmg`, size: 174608436, url: `${base}/UniExtract-${cleanVersion}-x64.dmg`, type: 'macos-dmg', arch: 'x64' },
        { name: `UniExtract-${cleanVersion}-x64.zip`, size: 174271886, url: `${base}/UniExtract-${cleanVersion}-x64.zip`, type: 'archive-zip', arch: 'x64' },
        { name: `UniExtract-${cleanVersion}-arm64.dmg`, size: 169581002, url: `${base}/UniExtract-${cleanVersion}-arm64.dmg`, type: 'macos-dmg', arch: 'arm64' },
        { name: `UniExtract-${cleanVersion}-arm64.zip`, size: 169196522, url: `${base}/UniExtract-${cleanVersion}-arm64.zip`, type: 'archive-zip', arch: 'arm64' },
        { name: `AryansDevStudios.cer`, size: 894, url: `${base}/AryansDevStudios.cer`, type: 'other', arch: 'universal' },
        { name: `trust-publisher.bat`, size: 1286, url: `${base}/trust-publisher.bat`, type: 'other', arch: 'universal' },
        { name: `latest.yml`, size: 673, url: `${base}/latest.yml`, type: 'other', arch: 'universal' },
        { name: `latest-mac.yml`, size: 814, url: `${base}/latest-mac.yml`, type: 'other', arch: 'universal' },
        { name: `latest-linux.yml`, size: 543, url: `${base}/latest-linux.yml`, type: 'other', arch: 'universal' },
        { name: `latest-linux-arm64.yml`, size: 384, url: `${base}/latest-linux-arm64.yml`, type: 'other', arch: 'universal' }
    ];
}

app.get('/api/updates/active-jobs', (req, res) => {
    res.json({
        activeJobsCount: getActiveJobsCount(),
        updatePendingWhenIdle,
        uptime: Math.floor(process.uptime())
    });
});

app.get('/api/updates', async (req, res) => {
    const currentVersion = require('./package.json').version || '2.8.5';
    const channel = req.query.channel === 'beta' ? 'beta' : 'stable';
    const force = req.query.force === 'true';
    const now = Date.now();

    const integrityInfo = {
        publisher: 'AryansDevStudios',
        authenticode: 'AryansDevStudios Code Signing Certificate',
        sha512Enforced: true,
        zeroDisruptionGuard: true,
        verifiedSignature: true
    };

    if (!force && cachedReleaseData[channel] && (now - lastReleaseCheck[channel] < RELEASE_CACHE_TTL)) {
        return res.json({
            ...cachedReleaseData[channel],
            channel,
            currentVersion,
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            integrity: integrityInfo,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true'
        });
    }

    try {
        const ghUrl = channel === 'beta'
            ? 'https://api.github.com/repos/AryansDevStudios/UniExtract/releases?per_page=10'
            : 'https://api.github.com/repos/AryansDevStudios/UniExtract/releases/latest';

        const reqHeaders = {
            'User-Agent': `UniExtract-UpdateChecker/${currentVersion} (${channel})`,
            'Accept': 'application/vnd.github.v3+json'
        };
        if (process.env.GITHUB_TOKEN) {
            reqHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const response = await fetch(ghUrl, { headers: reqHeaders });

        if (!response.ok) {
            if (cachedReleaseData[channel]) {
                return res.json({
                    ...cachedReleaseData[channel],
                    channel,
                    currentVersion,
                    activeJobsCount: getActiveJobsCount(),
                    updatePendingWhenIdle,
                    integrity: integrityInfo,
                    isElectron: process.env.IS_ELECTRON === 'true',
                    isPortable: process.env.ELECTRON_PORTABLE === 'true'
                });
            }

            // Fallback to static manifest for current version so users are never left with 0 packages
            const fallbackAssets = createStaticReleaseAssets(currentVersion);
            const fallbackData = {
                channel,
                currentVersion,
                latestVersion: currentVersion,
                latestTag: `v${currentVersion}`,
                releaseUrl: `https://github.com/AryansDevStudios/UniExtract/releases/tag/v${currentVersion}`,
                updateAvailable: false,
                bumpType: 'none',
                activeJobsCount: getActiveJobsCount(),
                updatePendingWhenIdle,
                integrity: integrityInfo,
                isElectron: process.env.IS_ELECTRON === 'true',
                isPortable: process.env.ELECTRON_PORTABLE === 'true',
                assets: fallbackAssets,
                isFallback: true,
                message: 'GitHub API rate limit reached or offline. Direct download mirrors provided.'
            };

            // Cache fallback for 10 minutes to protect upstream rate limit
            cachedReleaseData[channel] = fallbackData;
            lastReleaseCheck[channel] = now - RELEASE_CACHE_TTL + (10 * 60 * 1000);

            return res.json(fallbackData);
        }

        const data = await response.json();
        const release = Array.isArray(data) ? (data[0] || {}) : data;
        const latestTag = release.tag_name || release.name || '';
        const latestClean = latestTag.replace(/^v/i, '');
        const updateAvailable = isNewerVersion(currentVersion, latestClean);
        const bumpType = updateAvailable ? getVersionBumpType(currentVersion, latestClean) : 'none';
        const categories = categorizeReleaseNotes(release.body || '');

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

            return { name: a.name, size: a.size, url: a.browser_download_url, type, arch };
        });

        cachedReleaseData[channel] = {
            channel,
            latestVersion: latestClean,
            latestTag,
            updateAvailable,
            bumpType,
            isPrerelease: Boolean(release.prerelease),
            releaseName: release.name || latestTag,
            releaseNotes: release.body || '',
            categories,
            releaseUrl: release.html_url || '',
            publishedAt: release.published_at || null,
            assets
        };
        lastReleaseCheck[channel] = now;

        res.json({
            ...cachedReleaseData[channel],
            currentVersion,
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            integrity: integrityInfo,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true'
        });
    } catch (err) {
        if (cachedReleaseData[channel]) {
            return res.json({
                ...cachedReleaseData[channel],
                channel,
                currentVersion,
                activeJobsCount: getActiveJobsCount(),
                updatePendingWhenIdle,
                integrity: integrityInfo,
                isElectron: process.env.IS_ELECTRON === 'true',
                isPortable: process.env.ELECTRON_PORTABLE === 'true'
            });
        }
        res.json({
            channel,
            currentVersion,
            latestVersion: currentVersion,
            updateAvailable: false,
            bumpType: 'none',
            activeJobsCount: getActiveJobsCount(),
            updatePendingWhenIdle,
            integrity: integrityInfo,
            isElectron: process.env.IS_ELECTRON === 'true',
            isPortable: process.env.ELECTRON_PORTABLE === 'true',
            assets: [],
            error: err.message
        });
    }
});

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

const ALLOWED_MEDIA_DOMAINS = [
    'youtube.com', 'instagram.com', 'facebook.com', 'snapchat.com', 'tiktok.com',
    'twitter.com', 'x.com', 'reddit.com', 'twitch.tv', 'soundcloud.com',
    'vimeo.com', 'pinterest.com', 'dailymotion.com', 'threads.net', 'bilibili.com'
];

const EXCLUDED_COOKIE_DOMAINS = [
    'accounts.google.com', 'mail.google.com', 'myaccount.google.com', 'gds.google.com',
    'contacts.google.com', 'ogs.google.com', 'google.com', 'google.co.in', 'bing.com',
    'msn.com', 'scorecardresearch.com', 'doubleclick.net', 'linkedin.com'
];

function isAllowedCookieDomain(domain) {
    if (!domain) return false;
    const d = domain.toLowerCase().replace(/^\./, '');
    for (const ex of EXCLUDED_COOKIE_DOMAINS) {
        if (d === ex || d.endsWith('.' + ex)) {
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

                parsedCookies.push({ domain, includeSubdomains, path, secure, expires, name, value });
                keptCount++;
            }
        } catch (e) {}
    }

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

    let netscapeText = '# Netscape HTTP Cookie File\n# Filtered and formatted by Uni Extract\n\n';
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

function initCookiesFromEnv() {
    const rawEnvCookies = process.env.COOKIES_CONTENT ||
                           process.env.COOKIE_DATA ||
                           process.env.YOUTUBE_COOKIES ||
                           (process.env.COOKIES_BASE64 ? Buffer.from(process.env.COOKIES_BASE64, 'base64').toString('utf8') : null);

    if (!rawEnvCookies || typeof rawEnvCookies !== 'string' || !rawEnvCookies.trim()) {
        return;
    }

    let formatted = rawEnvCookies.trim();
    if (formatted.includes('\\n') && !formatted.includes('\n')) {
        formatted = formatted.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    }

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

function verifyCookiePassword(req) {
    if (!COOKIE_PASSWORD) return true;
    const clientPassword = (req.body?.password || req.headers['x-cookie-password'] || '').trim();
    return clientPassword === COOKIE_PASSWORD;
}

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
        logger(null, `Failed to write cookies file: ${err.message}`, "ERROR");
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

// YOUR REAL COOKIE ROUTES — restored exactly as the frontend expects them
app.get(['/api/auth-tokens', '/api/cookies', '/api/cookies/status'], handleGetTokens);
app.post(['/api/auth-tokens', '/api/cookies'], handlePostTokens);
app.delete(['/api/auth-tokens', '/api/cookies'], handleDeleteTokens);

// --- FORMAT EXTRACTION & PLAYLIST ENRICHMENT ENGINE ---
const formatMemoryCache = new Map();
const playlistEnrichmentJobs = {};

function categorizeHeights(rawHeights) {
    const heights = [...new Set(rawHeights.filter(h => typeof h === 'number' && h > 0))].sort((a, b) => b - a);
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
    const bitrates = [...new Set(rawBitrates.filter(b => typeof b === 'number' && b > 0))].sort((a, b) => b - a);
    const validCodecs = [...new Set(rawCodecs.filter(c => typeof c === 'string' && c !== 'none'))];
    const hasAudio = bitrates.length > 0 || validCodecs.length > 0;
    const maxAbr = bitrates.length > 0 ? Math.round(bitrates[0]) : (hasAudio ? 128 : 0);

    const audioQualities = [];
    let audioBadge = 'No Audio';
    let maxAudioRes = 'none';

    if (hasAudio) {
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

    (async () => {
        logger(null, `Starting format analysis for playlist "${playlistId}" (${pendingItems.length} videos to probe)`, "ANALYSIS");
        const maxConcurrent = Math.max(1, parseInt(process.env.CONCURRENT_PROBES || '2', 10));
        const executing = [];
        for (const item of pendingItems) {
            const p = probeVideoFormats(item.id).then(formatData => {
                job.items[item.id] = formatData;
                job.completed = Object.keys(job.items).length;
                if (formatData.maxHeight > job.maxPlaylistHeight) {
                    job.maxPlaylistHeight = formatData.maxHeight;
                    updatePlaylistMaxResolution(job);
                }
                const idx = executing.indexOf(p);
                if (idx !== -1) executing.splice(idx, 1);
            }).catch(() => {
                job.completed = Object.keys(job.items).length;
                const idx = executing.indexOf(p);
                if (idx !== -1) executing.splice(idx, 1);
            });
            executing.push(p);
            if (executing.length >= maxConcurrent) {
                await Promise.race(executing);
            }
        }
        await Promise.all(executing);
        job.isDone = true;
        updatePlaylistMaxResolution(job);
        logger(null, `Playlist "${playlistId}" format analysis completed: ${job.completed}/${job.total} videos probed. Highest resolution: ${job.maxPlaylistResolution.toUpperCase()}`, "SUCCESS");
    })().catch(err => {
        logger(null, `Playlist format enrichment notice: ${err?.message || err}`, "WARN");
    });

    return job;
}

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

// =============================================================================
// FIX #4 + #11: FASTER /api/analyze
// - 30-min memory cache (1000 entries)
// - NEW: the on-disk info.json is now READ BACK (1h TTL) — repeat analysis is
//   instant even after a restart or memory-cache expiry. Previously the file
//   was written but never read.
// - NEW: 90s timeout so the UI never hangs on a slow extractor
// =============================================================================
function buildVideoAnalysisResponse(info) {
    let rawFormats = info.formats;
    if (!rawFormats) {
        if (info.url) {
            rawFormats = [info];
            if (!info.format_id) info.format_id = info.format_id || '0';
        } else {
            return null;
        }
    }

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

        const width = f.width || 0;
        const height = f.height || 0;
        const isVertical = height > width && width > 0;

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

        let resDisplay = 'Native';
        if (width && height) {
            resDisplay = isVertical ? `${width}p` : `${height}p`;
        } else if (height) {
            resDisplay = `${height}p`;
        } else if (width) {
            resDisplay = `${width}w`;
        }

        const rawLang = (f.language || f.language_code || '').toLowerCase().trim();
        const note = f.format_note || '';
        const displayLabel = cleanLanguageName(rawLang, note);

        const isOriginal = (f.language_preference !== undefined && f.language_preference >= 0) ||
                           (note && note.toLowerCase().includes('original')) ||
                           (f.is_default === true);

        return {
            id: f.format_id,
            ext: f.ext,
            height: height || 0,
            resolution: resDisplay,
            vcodec: hasVideo ? (f.vcodec || 'unknown') : null,
            acodec: hasAudio ? (f.acodec || 'unknown') : null,
            size: f.filesize || f.filesize_approx || 0,
            abr: f.abr ? `${Math.round(f.abr)}kbps` : null,
            label: label,
            fps: f.fps || null,
            audio_channels: f.audio_channels || 2,
            isOriginal: !!isOriginal,
            language: displayLabel || (f.language ? f.language.toUpperCase() : null),
            format_note: note || null,
            codec_info: hasVideo ? (f.vcodec ? f.vcodec.split('.')[0] : 'VID') : (hasAudio ? (f.acodec ? f.acodec.split('.')[0] : 'AUD') : 'RAW')
        };
    });

    return {
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
}

app.post('/api/analyze', async (req, res) => {
    const { url } = req.body;
    const cleanedUrl = cleanMediaUrl(url);
    logger(null, `Incoming analysis for URL: ${url}`);

    const cached = getCachedAnalysis(cleanedUrl);
    if (cached) {
        logger(null, `Serving cached analysis for: "${cached.title}" (instant)`);
        return res.json(cached);
    }

    const hash = Buffer.from(cleanedUrl).toString('base64url');
    const infoJsonPath = path.join(CACHE_DIR, `${hash}.info.json`);

    // NEW (#11): serve from the on-disk analysis dump when it's still fresh
    try {
        if (fs.existsSync(infoJsonPath)) {
            const st = fs.statSync(infoJsonPath);
            if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
                const diskInfo = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
                if (diskInfo && (diskInfo.formats || diskInfo.url) && !Array.isArray(diskInfo.entries)) {
                    const diskResponse = buildVideoAnalysisResponse(diskInfo);
                    if (diskResponse) {
                        setCachedAnalysis(cleanedUrl, diskResponse);
                        logger(null, `Serving disk-cached analysis for: "${diskResponse.title}" (instant)`);
                        return res.json(diskResponse);
                    }
                }
            } else {
                try { fs.unlinkSync(infoJsonPath); } catch (e) {}
            }
        }
    } catch (e) {}

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

        if (isMix) {
            ytdlpOptions.playlistItems = '1-50';
        }

        // NEW: 90s timeout — never leave the UI hanging on a slow extractor
        const info = await Promise.race([
            ytdlp.getInfoAsync(cleanedUrl, ytdlpOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Analysis timed out after 90 seconds. The platform may be slow or blocking yt-dlp.')), 90000))
        ]);

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

        const responseData = buildVideoAnalysisResponse(info);
        if (!responseData) {
            throw new Error("No video stream found. Please ensure the link points to a specific video, not a channel or playlist.");
        }

        setCachedAnalysis(cleanedUrl, responseData);

        // Refresh the on-disk dump (also feeds instant download start below)
        try {
            fs.writeFileSync(infoJsonPath, JSON.stringify(info));
        } catch (we) {}

        res.json(responseData);
    } catch (err) {
        logger(null, `Analysis failed: ${err.message}`, "ERROR");
        res.status(500).json({ error: err.message });
    }
});

// FIX #5: Reuse cached analysis on a different URL (instant)
app.get('/api/analyze-cache', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    const cleaned = cleanMediaUrl(url);
    const cached = getCachedAnalysis(cleaned);
    if (!cached) return res.json({ hit: false });
    res.json({ hit: true, data: cached });
});

app.get('/api/thumbnail', (req, res) => {
    const { imgUrl, title } = req.query;
    if (!imgUrl) return res.status(400).send('No image URL provided');

    try {
        const parsedUrl = new URL(imgUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
    } catch (e) {
        return res.status(400).send('Invalid URL format');
    }

    const safeTitle = (title || 'thumbnail').replace(/[^a-z0-9]/gi, '_');

    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_thumb.png"`);
    res.setHeader('Content-Type', 'image/png');

    const ffmpegProcess = spawn(resolvedFfmpegPath || 'ffmpeg', [
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

// =============================================================================
// FIX #15: /api/subtitle — now fully async.
// Previously used spawnSync which BLOCKED the entire event loop for up to 45s,
// freezing all status polling (and triggering false watchdog aborts).
// Response contract is unchanged.
// =============================================================================
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

        // Async spawn — never blocks polling or other downloads
        await new Promise((resolve, reject) => {
            const subProc = spawn(ytDlpPath, ytdlpArgs, { windowsHide: true });
            let errText = '';
            if (subProc.stderr) subProc.stderr.on('data', (d) => { errText += d.toString(); });
            const killer = setTimeout(() => {
                try { subProc.kill('SIGKILL'); } catch (e) {}
            }, 45000);
            subProc.on('error', (err) => { clearTimeout(killer); reject(err); });
            subProc.on('close', (code) => {
                clearTimeout(killer);
                if (code === 0) return resolve();
                const lastLine = errText.trim().split(/\r?\n/).filter(Boolean).pop();
                reject(new Error(lastLine || 'yt-dlp subtitle extraction failed'));
            });
        });

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

// =============================================================================
// FIX #6 + #12/#13/#14: /api/download — decoupled Task 2 (kept) PLUS:
//   - Instant start: --load-info-json reuses the analysis dump (no re-extraction)
//     with one automatic live-URL retry if the cached stream links expired
//   - Anti-throttle: 4 concurrent fragments + 10MB chunked transfer
//   - Raw-spawn engine: completion is driven by the process exit code + a
//     deterministic file scan (the old wrapper could resolve with empty
//     filePaths, leaving jobs stuck at "100%" forever)
//   - Weighted TRUE progress across video+audio streams
// All request params, job fields, statuses, and response shapes unchanged.
// =============================================================================
const friendlyDownloadError = (raw) => {
    const text = String(raw || '');
    if (/sign in to confirm/i.test(text)) return 'YouTube requires verification (bot check). Add valid cookies via Auth Tokens, then retry.';
    if (/age.?(restricted|verification)/i.test(text)) return 'Age-restricted video — add cookies from a logged-in account under Auth Tokens.';
    if (/requested format is not available/i.test(text)) return 'Selected format is no longer available — re-analyze the link and pick another quality.';
    if (/http error 40[13]/i.test(text)) return 'Platform denied access (expired stream link) — please retry the download.';
    if (/private video/i.test(text)) return 'This video is private.';
    if (/video unavailable/i.test(text)) return 'Video unavailable (removed or region-locked).';
    if (/timed? ?out/i.test(text)) return 'Network timeout while contacting the platform — please retry.';
    const lastLines = text.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    return lastLines ? `yt-dlp: ${lastLines.slice(0, 300)}` : 'Download failed with an unknown error.';
};

// Deterministically locate the finished media file for a job
const findDownloadedFile = (jobId) => {
    const shortId = jobId.substring(0, 8);
    try {
        const candidates = fs.readdirSync(TEMP_DIR)
            .filter(name => name.startsWith(`${shortId}_`) && !name.endsWith('.part') && !name.endsWith('.ytdl'))
            .filter(name => /\.(mp4|mkv|webm|mov|avi|flv|3gp|mp3|m4a|opus|flac|wav|aac|ogg)$/i.test(name))
            .map(name => {
                const full = path.join(TEMP_DIR, name);
                try {
                    const st = fs.statSync(full);
                    return { full, size: st.size, mtime: st.mtimeMs };
                } catch (e) { return null; }
            })
            .filter(Boolean);

        if (!candidates.length) return null;
        // The merged output is always the largest finished file
        candidates.sort((a, b) => b.size - a.size || b.mtime - a.mtime);
        return candidates[0].full;
    } catch (e) {
        return null;
    }
};

// Completion logic — identical lifecycle to the old download.run().then():
// chapter zip -> immediate 'completed' -> Task 2 in the background
async function completeDownload(jobId, finalFile, ctx) {
    const job = jobs[jobId];
    if (!job || job.status === 'cancelled') return;

    const baseName = finalFile.substring(0, finalFile.lastIndexOf('.'));
    jobs[jobId].baseName = baseName;

    const possibleThumbs = [baseName + '.jpg', baseName + '.webp', baseName + '.png'];
    let thumbFile = possibleThumbs.find(f => fs.existsSync(f));

    const mTitle = jobs[jobId].metaTitle;
    const mArtist = jobs[jobId].metaArtist;
    const mDate = jobs[jobId].metaDate;
    const mThumb = jobs[jobId].metaThumb;

    if (!thumbFile && ctx.thumbFetchPromise) {
        thumbFile = await ctx.thumbFetchPromise;
    }

    if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;

    // Handle chapter bundles (zip) — yt-dlp already produced separate files
    if (jobs[jobId]?.splitChapters) {
        const chapterFiles = fs.readdirSync(TEMP_DIR)
            .filter((name) => (name.startsWith(jobId.substring(0, 8)) || name.startsWith(`${jobId}_`)) && !name.endsWith('_chapters.zip'))
            .filter((name) => /\.(mp4|mkv|webm|mp3|m4a|opus|flac|wav|aac|ogg)$/i.test(name))
            .map((name) => path.join(TEMP_DIR, name))
            .filter((p) => p !== finalFile);

        if (chapterFiles.length > 1) {
            try {
                const zipPath = await createChapterZip(jobId, chapterFiles, jobs[jobId]?.title || 'chapter_bundle');
                if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;
                chapterFiles.forEach((cf) => {
                    try { if (fs.existsSync(cf)) fs.unlinkSync(cf); } catch (e) {}
                });
                try { if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile); } catch (e) {}

                jobs[jobId].file = path.basename(zipPath);
                jobs[jobId].extension = 'zip';
                jobs[jobId].hasZipBundle = true;
                jobs[jobId].status = 'completed';
                jobs[jobId].progress = '100%';
                jobs[jobId].postProcessStatus = 'skipped';
                logger(jobId, `Chapter bundle created: ${jobs[jobId].file}`, 'SUCCESS');
                return;
            } catch (zipErr) {
                logger(jobId, `Chapter zip creation failed: ${zipErr.message}`, "WARN");
            }
        }
    }

    if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;

    // KEY: For standard downloads, mark as 'completed' IMMEDIATELY so the user can download the raw
    // file while Task 2 (metadata/thumb injection) runs in the background.
    // For clipped downloads, keep status as 'processing' until FFmpeg produces the trimmed clip.
    if (fs.existsSync(finalFile)) {
        if (!jobs[jobId].clipRequested) {
            jobs[jobId].status = 'completed';
            jobs[jobId].file = path.basename(finalFile);
            jobs[jobId].rawDownloadFile = path.basename(finalFile);
            jobs[jobId].progress = '100%';
            logger(jobId, `Download Finished. Output (raw): ${jobs[jobId].file} — File is ready for delivery.`, "SUCCESS");
        } else {
            jobs[jobId].status = 'processing';
            jobs[jobId].rawDownloadFile = path.basename(finalFile);
            jobs[jobId].progress = 'Trimming media clip...';
            logger(jobId, `Download Finished. Trimming requested segment (${jobs[jobId].clipStart || '00:00:00'} -> ${jobs[jobId].clipEnd || 'end'})...`, "PROGRESS");
        }
    }

    // TASK 2: background post-processing & clip trimming
    if (fs.existsSync(finalFile) && jobs[jobId] && jobs[jobId].status !== 'cancelled') {
        jobs[jobId].postProcessStatus = 'running';
        runTask2PostProcessing(jobId, finalFile, baseName, jobs[jobId].isAudioOnly, jobs[jobId].isMuted, mTitle, mArtist, mDate, mThumb, jobs[jobId].embedSubs, jobs[jobId].subLang, ctx.container, jobs[jobId].targetAudio, jobs[jobId].targetVideo, thumbFile)
            .then((polishedFile) => {
                if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;
                if (polishedFile && fs.existsSync(polishedFile)) {
                    jobs[jobId].postProcessFile = path.basename(polishedFile);
                    jobs[jobId].postProcessStatus = 'done';
                    jobs[jobId].file = jobs[jobId].postProcessFile;
                    jobs[jobId].extension = path.extname(polishedFile).replace('.', '') || jobs[jobId].extension;
                    if (jobs[jobId].clipRequested) {
                        jobs[jobId].status = 'completed';
                        jobs[jobId].progress = '100%';
                        logger(jobId, `Clip trimmed successfully: ${jobs[jobId].file} — File is ready for delivery.`, "SUCCESS");
                    } else {
                        logger(jobId, `Task 2 Packaging Successful: ${jobs[jobId].postProcessFile} (Polished)`, "META");
                    }
                } else {
                    jobs[jobId].postProcessStatus = 'failed';
                    if (jobs[jobId].clipRequested) {
                        jobs[jobId].status = 'error';
                        jobs[jobId].error = 'FFmpeg could not create the requested clip.';
                        logger(jobId, `Clip processing failed: output file not found.`, "ERROR");
                    } else {
                        logger(jobId, `Task 2 finished without producing a polished file; raw file still available.`, "WARN");
                    }
                }
            })
            .catch((err) => {
                if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;
                jobs[jobId].postProcessStatus = 'failed';
                if (jobs[jobId].clipRequested) {
                    jobs[jobId].status = 'error';
                    jobs[jobId].error = `FFmpeg clip processing failed: ${err.message}`;
                    logger(jobId, `Clip processing failed: ${err.message}`, "ERROR");
                } else {
                    logger(jobId, `Task 2 crashed: ${err.message} — raw file still available.`, "WARN");
                }
            });
    }
}

const startDownloadEngine = (jobId, ctx) => {
    const job = jobs[jobId];
    if (!job || job.status === 'cancelled') return;

    const ytdlpArgs = [
        '--newline',
        '--no-warnings',
        '-f', ctx.formatSelection,
        '-o', path.join(TEMP_DIR, `${jobId.substring(0, 8)}_%(title)s.%(ext)s`),
        // FIX #13: anti-throttle — parallel fragment fetching + 10MB chunked
        // transfer defeats YouTube's ~50KB/s slow-lane
        '--concurrent-fragments', '4',
        '--http-chunk-size', '10M',
        '--socket-timeout', '20',
        '--retries', '5',
        '--fragment-retries', '5',
        ...ctx.ffmpegArgs
    ];

    if (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) {
        ytdlpArgs.push('--cookies', COOKIES);
    }

    // FIX #12: instant start — reuse the analysis dump instead of re-extracting
    let usingInfoJson = false;
    if (!ctx.forceUrl && ctx.infoJsonPath && fs.existsSync(ctx.infoJsonPath)) {
        try {
            const st = fs.statSync(ctx.infoJsonPath);
            if (Date.now() - st.mtimeMs < 60 * 60 * 1000) {
                ytdlpArgs.push('--load-info-json', ctx.infoJsonPath);
                usingInfoJson = true;
            }
        } catch (e) {}
    }
    if (!usingInfoJson) {
        ytdlpArgs.push(ctx.cleanedUrl);
    }

    const downloadProc = spawn(ytDlpPath, ytdlpArgs, { windowsHide: true });
    if (!jobs[jobId] || jobs[jobId].status === 'cancelled') {
        try {
            if (process.platform === 'win32' && downloadProc.pid) {
                spawnSync('taskkill', ['/pid', String(downloadProc.pid), '/T', '/F'], { stdio: 'ignore' });
            } else if (downloadProc.pid) {
                try { spawnSync('pkill', ['-P', String(downloadProc.pid), '-9'], { stdio: 'ignore' }); } catch (e) {}
                downloadProc.kill('SIGKILL');
            }
        } catch (e) {}
        return;
    }
    jobs[jobId].downloadInstance = downloadProc;
    jobs[jobId].lastOutputTime = Date.now();

    let destCount = 0;
    let stdoutBuf = '';
    let stderrTail = [];

    downloadProc.stdout.on('data', (chunk) => {
        if (!jobs[jobId] || jobs[jobId].status === 'cancelled' || jobs[jobId].status === 'error') return;
        jobs[jobId].lastOutputTime = Date.now();
        stdoutBuf += chunk.toString();
        const lines = stdoutBuf.split(/\r\n|\r|\n/);
        stdoutBuf = lines.pop();
        for (const line of lines) {
            if (!jobs[jobId] || jobs[jobId].status === 'cancelled' || jobs[jobId].status === 'error') return;
            const t = line.trim();
            if (!t) continue;

            // Track each stream so overall progress is weighted correctly
            if (/^\[download\]\s+Destination:/i.test(t)) {
                destCount++;
                continue;
            }

            if (/has already been downloaded/i.test(t)) {
                jobs[jobId].progress = '100%';
                jobs[jobId].lastProgressTime = Date.now();
                continue;
            }

            const pm = t.match(/^\[download\]\s+([\d.]+)%/);
            if (pm) {
                const pct = parseFloat(pm[1]);
                const speedM = t.match(/\bat\s+(\S+\/s)/i);
                const etaM = t.match(/\bETA\s+([\d:]+)/i);

                // FIX #14: weighted TRUE progress across video+audio streams
                // (the old per-stream "100%" was misleading)
                const denom = Math.max(destCount, ctx.formatSelection.includes('+') ? 2 : 1);
                const partIndex = Math.max(0, destCount - 1);
                const overall = Math.min(99.5, ((partIndex + pct / 100) / denom) * 100);

                jobs[jobId].progress = `${overall.toFixed(1)}%`;
                if (speedM) jobs[jobId].speed = speedM[1];
                if (etaM) jobs[jobId].eta = etaM[1];
                jobs[jobId].lastProgressTime = Date.now();

                const pInt = Math.round(overall);
                if (pInt % 25 === 0 && pInt !== jobs[jobId]._lastLoggedPct) {
                    jobs[jobId]._lastLoggedPct = pInt;
                    logger(jobId, `Progress: ${jobs[jobId].progress}${jobs[jobId].speed ? ` (${jobs[jobId].speed})` : ''}`, "PROGRESS");
                }
            }
        }
    });

    downloadProc.stderr.on('data', (chunk) => {
        if (!jobs[jobId] || jobs[jobId].status === 'cancelled' || jobs[jobId].status === 'error') return;
        jobs[jobId].lastOutputTime = Date.now();
        const lines = chunk.toString().split(/\r\n|\r|\n/);
        for (const line of lines) {
            const t = line.trim();
            if (t) {
                stderrTail.push(t);
                if (stderrTail.length > 30) stderrTail.shift();
            }
        }
    });

    downloadProc.on('error', (err) => {
        if (jobs[jobId] && jobs[jobId].status !== 'cancelled') {
            jobs[jobId].status = 'error';
            jobs[jobId].error = `Failed to launch yt-dlp: ${err.message}`;
            logger(jobId, `Download/Merge error: ${jobs[jobId].error}`, "ERROR");
        }
    });

    downloadProc.on('close', (code) => {
        if (!jobs[jobId] || jobs[jobId].status === 'cancelled') return;

        if (code !== 0) {
            // Cached dump failed (e.g. expired stream URLs)? Retry once with the live URL
            if (usingInfoJson && !jobs[jobId]._retriedWithUrl) {
                jobs[jobId]._retriedWithUrl = true;
                logger(jobId, 'Cached-metadata attempt failed — retrying once with live URL extraction...', "RETRY");
                startDownloadEngine(jobId, { ...ctx, forceUrl: true });
                return;
            }
            jobs[jobId].status = 'error';
            jobs[jobId].error = friendlyDownloadError(stderrTail.join('\n'));
            logger(jobId, `Download/Merge error: ${jobs[jobId].error}`, "ERROR");
            return;
        }

        const finalFile = findDownloadedFile(jobId);
        if (!finalFile) {
            jobs[jobId].status = 'error';
            jobs[jobId].error = 'Download finished but no output file was found on disk.';
            logger(jobId, `Download/Merge error: ${jobs[jobId].error}`, "ERROR");
            return;
        }

        completeDownload(jobId, finalFile, ctx).catch((err) => {
            if (jobs[jobId] && jobs[jobId].status !== 'cancelled') {
                jobs[jobId].status = 'error';
                jobs[jobId].error = err.message;
                logger(jobId, `Download/Merge error: ${err.message}`, "ERROR");
            }
        });
    });
};

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
    } else if (clipStartSeconds !== null && clipStartSeconds > 0 && clipEndSeconds === null) {
        resolvedClipStart = formatSecondsToClock(clipStartSeconds);
    }
    const clipRequested = Boolean((resolvedClipStart && resolvedClipStart !== '00:00:00') || resolvedClipEnd);

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

    let targetVideo = videoQuality;
    let targetAudio = audioQuality;

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
            isAudioOnly = true;
            extension = 'mp3';
            formatSelection = 'bestaudio/best';
            namingTag = `Audio_${a === 'best' ? 'HQ' : a.toUpperCase()}`;
        } else if (a === 'none') {
            isMuted = true;
            extension = 'mp4';
            const h = heightMap[v];
            formatSelection = h
                ? `bestvideo[height<=${h}]/best[height<=${h}]/best`
                : 'bestvideo/best';
            namingTag = `${v.toUpperCase()}_Muted`;
        } else {
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

    const hasExplicitAudioLang = audioLang && audioLang !== 'default' && audioLang !== 'original' && audioLang !== '';
    if (hasExplicitAudioLang) {
        if (isAudioOnly) {
            formatSelection = audioLang;
        } else if (vId && !isMuted) {
            formatSelection = `${vId}+${audioLang}`;
        }
    } else if (!aId || aId === 'bestaudio/best' || aId === 'bestaudio' || aId === 'mp3' || aId === 'm4a') {
        const originalAudioSelector = 'bestaudio[language_preference>=0]/bestaudio[format_note*=original]/bestaudio/best';
        if (isAudioOnly) {
            formatSelection = originalAudioSelector;
        } else if (vId && !isMuted) {
            formatSelection = `${vId}+${originalAudioSelector}`;
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
        clipRequested,
        embedSubs: !!embedSubs,
        subLang: subLang || null,
        hasZipBundle: false,
        // Decoupled pipeline fields:
        postProcessStatus: 'pending',
        postProcessFile: null,
        rawDownloadFile: null
    };

    logger(jobId, `Download initiated for "${title}" [Format: ${extension.toUpperCase()}]`, "START");

    await ensureYtDlp();
    ensureFfmpeg();

    let ffmpegArgs = [];

    const hash = Buffer.from(cleanedUrl).toString('base64url');
    const infoJsonPath = path.join(CACHE_DIR, `${hash}.info.json`);

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

    if (!metaThumb) {
        const vidMatch = cleanedUrl.match(/(?:v=|\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
        if (vidMatch) {
            metaThumb = `https://i.ytimg.com/vi/${vidMatch[1]}/hqdefault.jpg`;
        }
    }

    jobs[jobId].metaTitle = metaTitle;
    jobs[jobId].metaArtist = metaArtist;
    jobs[jobId].metaDate = metaDate;
    jobs[jobId].metaThumb = metaThumb;

    const manualThumb = path.join(TEMP_DIR, `${jobId.substring(0, 8)}_manual.jpg`);
    let thumbFetchPromise = null;
    if (metaThumb) {
        thumbFetchPromise = new Promise((resolve) => {
            const p = spawn(resolvedFfmpegPath || 'ffmpeg', ['-y', '-i', metaThumb, '-vframes', '1', manualThumb, '-hide_banner', '-loglevel', 'error']);
            p.on('close', () => resolve(fs.existsSync(manualThumb) ? manualThumb : null));
            p.on('error', () => resolve(null));
        });
    }

    if (splitChapters) {
        ffmpegArgs.push('--split-chapters');
    }
    if (embedSubs && subLang) {
        ffmpegArgs.push('--write-subs', '--write-auto-subs', '--sub-langs', subLang, '--convert-subs', 'srt');
    }

    ffmpegArgs.push('--no-playlist');
    if (resolvedFfmpegPath) {
        ffmpegArgs.push('--ffmpeg-location', path.dirname(resolvedFfmpegPath));
    }

    startDownloadEngine(jobId, {
        cleanedUrl,
        formatSelection,
        ffmpegArgs,
        infoJsonPath,
        thumbFetchPromise,
        container,
        title
    });

    res.json({ jobId });
});

// =============================================================================
// Task 2 (FFmpeg post-processing) — unchanged pipeline, async, runs in the
// background after download. Only change: uses the resolved FFmpeg binary.
// =============================================================================
async function runTask2PostProcessing(jobId, finalFile, baseName, isAudioOnly, isMuted, mTitle, mArtist, mDate, mThumb, embedSubs, subLang, container, targetAudio, targetVideo, thumbFile) {
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
        const clipRequested = Boolean(jobs[jobId]?.clipRequested);
        const clipStartSeconds = clipRequested ? (parseTimeToSeconds(jobs[jobId].clipStart) || 0) : 0;
        const clipEndSeconds = clipRequested ? parseTimeToSeconds(jobs[jobId].clipEnd) : null;
        const clipDurationSeconds = (clipRequested && clipEndSeconds !== null) ? Math.max(0, clipEndSeconds - clipStartSeconds) : null;

        const clipInputArgs = (clipRequested && clipStartSeconds > 0) ? ['-ss', String(clipStartSeconds)] : [];
        const clipOutputArgs = clipRequested
            ? [
                ...(clipDurationSeconds !== null ? ['-t', String(clipDurationSeconds)] : []),
                '-avoid_negative_ts', 'make_zero'
              ]
            : [];

        let vCodec = 'libx264';
        let vCodecExtra = ['-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p'];
        if (targetExt === 'webm') {
            vCodec = 'libvpx-vp9';
            vCodecExtra = ['-crf', '30', '-b:v', '0'];
        }
        const videoCodecArgs = clipRequested
            ? ['-c:v:0', vCodec, ...vCodecExtra]
            : ['-c:v:0', 'copy'];

        if (isAudioOnly) {
            if (targetExt === 'flac' || targetExt === 'wav') {
                embedArgs = [
                    '-y', '-threads', '0',
                    ...clipInputArgs,
                    '-i', finalFile,
                    ...(thumbFile ? ['-i', thumbFile] : []),
                    ...clipOutputArgs,
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
                const aCodecArgs = clipRequested ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy'];
                embedArgs = [
                    '-y', '-threads', '0',
                    ...clipInputArgs,
                    '-i', finalFile,
                    ...clipOutputArgs,
                    '-map', '0:a:0',
                    ...aCodecArgs,
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
                const isSourceAac = finalFile.toLowerCase().endsWith('.m4a');
                const aCodecArgs = (clipRequested || !isSourceAac) ? ['-c:a', 'aac', '-b:a', '256k'] : ['-c:a', 'copy'];
                embedArgs = [
                    '-y', '-threads', '0',
                    ...clipInputArgs,
                    '-i', finalFile,
                    ...(thumbFile ? ['-i', thumbFile] : []),
                    ...clipOutputArgs,
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
                const isSourceOpus = finalFile.toLowerCase().endsWith('.opus') || finalFile.toLowerCase().endsWith('.webm');
                const aCodecArgs = (clipRequested || !isSourceOpus) ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'copy'];
                embedArgs = [
                    '-y', '-threads', '0',
                    ...clipInputArgs,
                    '-i', finalFile,
                    ...clipOutputArgs,
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
                    '-y', '-threads', '0',
                    ...clipInputArgs,
                    '-i', finalFile,
                    ...(thumbFile ? ['-i', thumbFile] : []),
                    ...clipOutputArgs,
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
            subtitleFile = null;
            if (embedSubs && subLang) {
                const subCandidates = fs.readdirSync(TEMP_DIR)
                    .filter((name) => name.startsWith(jobId.substring(0, 8)) && /\.(vtt|srt|ass)$/i.test(name))
                    .map((name) => path.join(TEMP_DIR, name));
                if (subCandidates.length > 0 && fs.existsSync(subCandidates[0])) {
                    subtitleFile = subCandidates[0];
                }
            }

            const inputs = ['-y', ...clipInputArgs, '-i', finalFile];
            let nextInputIdx = 1;
            let subInputIdx = -1;
            let thumbInputIdx = -1;

            if (subtitleFile) {
                inputs.push(...clipInputArgs, '-i', subtitleFile);
                subInputIdx = nextInputIdx++;
            }
            if (thumbFile && targetExt !== 'mkv') {
                inputs.push('-i', thumbFile);
                thumbInputIdx = nextInputIdx++;
            }

            let subCodecArgs = [];
            if (subInputIdx !== -1) {
                const sLang = (subLang || 'en').toLowerCase();
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
                        ...clipOutputArgs,
                        ...streamMaps,
                        ...videoCodecArgs,
                        '-an',
                        ...subCodecArgs,
                        ...(thumbFile ? ['-attach', thumbFile, '-metadata:s:t', 'mimetype=image/jpeg'] : []),
                        ...metaArgs,
                        embeddedFile
                    ];
                } else {
                    embedArgs = [
                        ...inputs,
                        ...clipOutputArgs,
                        ...streamMaps,
                        ...videoCodecArgs,
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
                const audioCodecArgs = clipRequested
                    ? (targetExt === 'webm' ? ['-c:a', 'libopus', '-b:a', '160k'] : ['-c:a', 'aac', '-b:a', '192k'])
                    : (isTranscode ? ['-c:a', 'aac', '-b:a', targetAudio] : ['-c:a', 'copy']);

                const streamMaps = ['-map', '0:v:0', '-map', '0:a:0?'];
                if (subInputIdx !== -1) streamMaps.push('-map', `${subInputIdx}:0`);
                if (thumbInputIdx !== -1) streamMaps.push('-map', `${thumbInputIdx}:0`);

                if (targetExt === 'mkv') {
                    embedArgs = [
                        ...inputs,
                        ...clipOutputArgs,
                        ...streamMaps,
                        ...videoCodecArgs,
                        ...audioCodecArgs,
                        ...subCodecArgs,
                        ...(thumbFile ? ['-attach', thumbFile, '-metadata:s:t', 'mimetype=image/jpeg'] : []),
                        ...metaArgs,
                        embeddedFile
                    ];
                } else {
                    embedArgs = [
                        ...inputs,
                        ...clipOutputArgs,
                        ...streamMaps,
                        ...videoCodecArgs,
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

        const task2Result = await new Promise((resolve) => {
            const proc = spawn(resolvedFfmpegPath || 'ffmpeg', embedArgs);
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

        if (task2Result.status === 0 && fs.existsSync(embeddedFile) && fs.statSync(embeddedFile).size > 1000) {
            const originalFile = finalFile;
            try { if (fs.existsSync(originalFile)) fs.unlinkSync(originalFile); } catch (e) {}
            if (thumbFile && fs.existsSync(thumbFile)) try { fs.unlinkSync(thumbFile); } catch (e) {}
            if (subtitleFile && fs.existsSync(subtitleFile)) try { fs.unlinkSync(subtitleFile); } catch (e) {}

            try {
                if (!isAudioOnly) {
                    const pRes = spawnSync(resolvedFfmpegPath || 'ffmpeg', ['-nostdin', '-i', embeddedFile, '-hide_banner']);
                    const probe = (pRes.stderr ? pRes.stderr.toString() : '') + (pRes.stdout ? pRes.stdout.toString() : '');
                    const resMatch = probe.match(/Video:.*?(\d{3,4})x(\d{3,4})/s) || probe.match(/, (\d{3,4})x(\d{3,4})/);
                    if (resMatch && jobs[jobId]) {
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
            return embeddedFile;
        } else {
            const errorLog = task2Result.stderr ? task2Result.stderr.toString() : 'Unknown FFmpeg Error';
            logger(jobId, `Task 2 FFmpeg warning/fallback:\n${errorLog}`, "WARN");
            if (fs.existsSync(embeddedFile)) fs.unlinkSync(embeddedFile);
            return null;
        }
    } catch (err) {
        logger(jobId, `Metadata injection script crashed: ${err.message}`, "WARN");
        return null;
    }
}

app.all('/api/cancel/:jobId', (req, res) => {
    const { jobId } = req.params;
    abortJob(jobId, 'Client requested cancellation via button or tab close');
    res.json({ success: true, message: 'Download aborted and bandwidth saved' });
});

// FIX #7: Status endpoint exposes postProcessStatus (unchanged contract)
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
        bundleType: job.hasZipBundle ? 'zip' : null,
        postProcessStatus: job.postProcessStatus || 'skipped',
        postProcessFile: job.postProcessFile || null,
        readyToDeliver: job.status === 'completed' && !!job.file
    });
});

// FIX #8: Poll for the polished version after raw delivery
app.get('/api/post-process-status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.json({ status: 'unknown' });
    res.json({
        status: job.postProcessStatus || 'skipped',
        file: job.postProcessFile || null,
        resolvedFormat: job.resolvedFormat || null
    });
});

app.get('/api/file/:jobId/:title', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.status(400).send('File not ready');

    const fileToServe = job.postProcessFile || job.file;
    if (!fileToServe) return res.status(400).send('No file available');

    const filePath = path.join(TEMP_DIR, fileToServe);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');

    const safeTitle = req.params.title.replace(/[\/\\?%*:|"<>]/g, '_').trim() || 'media';
    const finalExt = job.extension || 'mp4';
    const finalName = job.hasZipBundle ? `${safeTitle}_chapters.zip` : `${safeTitle}_${job.customTag}.${finalExt}`;

    const fileSizeMb = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    logger(req.params.jobId, `Transmitting file to client: ${finalName} (${fileSizeMb} MB)`, "SEND");

    res.download(filePath, finalName, (err) => {
        if (err) {
            logger(req.params.jobId, `Transmission stream status: ${err.message}`, "INFO");
        }

        if (!job.cleanupTimer) {
            job.cleanupTimer = setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        logger(req.params.jobId, `CLEANUP: Deleted temporary file ${fileToServe} (grace period expired)`, "DELETE");
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

// FIX #9: HEAD support for /api/file
app.head('/api/file/:jobId/:title', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job || job.status !== 'completed') return res.sendStatus(404);
    const fileToServe = job.postProcessFile || job.file;
    if (!fileToServe) return res.sendStatus(404);
    const filePath = path.join(TEMP_DIR, fileToServe);
    if (!fs.existsSync(filePath)) return res.sendStatus(404);
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendStatus(200);
});

// =============================================================================
// FIX #17: Cleanup sweep — 30-min TTL kept, but now it NEVER touches files
// that belong to an active download (previously it could delete the partial
// file of a long-running download and break it mid-transfer).
// =============================================================================
setInterval(() => {
    try {
        const now = Date.now();
        if (fs.existsSync(TEMP_DIR)) {
            const activeShortIds = new Set(
                Object.keys(jobs)
                    .filter(id => jobs[id] && (jobs[id].status === 'downloading' || jobs[id].status === 'processing' || jobs[id].status === 'starting'))
                    .map(id => id.substring(0, 8))
            );
            const files = fs.readdirSync(TEMP_DIR);
            for (const file of files) {
                if (activeShortIds.has(file.substring(0, 8))) continue;
                try {
                    const fPath = path.join(TEMP_DIR, file);
                    const stats = fs.statSync(fPath);
                    if (stats.isFile() && (now - stats.mtimeMs > 30 * 60 * 1000)) {
                        fs.unlinkSync(fPath);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
}, 10 * 60 * 1000);

const clientDist = path.join(__dirname, 'client', 'dist');
const publicDir = path.join(__dirname, 'public');

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

// FIX #10: WARM-UP — truly non-blocking, tiny simulated probe (<1s)
const warmUpYtDlp = () => {
    if (!ytDlpPath) return;
    logger(null, 'Warming up yt-dlp engine (background, non-blocking)...');

    const warmArgs = [
        '--simulate',
        '--quiet',
        '--no-warnings',
        '--no-playlist',
        '--cache-dir', CACHE_DIR,
        '--socket-timeout', '5'
    ];
    if (COOKIES && fs.existsSync(COOKIES) && fs.statSync(COOKIES).size > 0) {
        warmArgs.push('--cookies', COOKIES);
    }
    warmArgs.push('https://www.youtube.com/watch?v=jNQXAC9IVRw');

    const warmup = spawn(ytDlpPath, warmArgs, { stdio: 'ignore' });
    let done = false;
    warmup.on('close', (code) => {
        if (!done) {
            done = true;
            logger(null, `yt-dlp warm-up completed (exit: ${code}) — disk cache primed`);
        }
    });
    warmup.on('error', () => {
        if (!done) {
            done = true;
            logger(null, 'yt-dlp warm-up skipped (non-critical)', 'WARN');
        }
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

    const httpsEnabled = process.env.HTTPS === 'true';
    const sslCertPath = process.env.SSL_CERT || path.join(__dirname, 'certs', 'server.crt');
    const sslKeyPath = process.env.SSL_KEY || path.join(__dirname, 'certs', 'server.key');
    let sslOptions = null;

    if (httpsEnabled || (fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath))) {
        try {
            if (fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
                sslOptions = {
                    cert: fs.readFileSync(sslCertPath),
                    key: fs.readFileSync(sslKeyPath)
                };
                console.log(`[SECURITY] HTTPS SSL Certificates loaded from: ${sslCertPath}`);
            } else {
                console.warn(`[SECURITY] HTTPS=true requested but certificate files not found at ${sslCertPath}`);
            }
        } catch (err) {
            console.warn(`[SECURITY] Failed to load SSL certificates, falling back to HTTP: ${err.message}`);
            sslOptions = null;
        }
    }

    if (sslOptions) {
        const https = require('https');
        https.createServer(sslOptions, app).listen(PORT, HOST, () => {
            console.log("\n" + "=".repeat(50));
            console.log(`[SERVER] Uni Extract HTTPS Server running on port ${PORT}`);
            console.log(`[ACCESS] Bound to: https://${HOST}:${PORT}`);
            console.log(`[TEMP]   Temp Folder: ${TEMP_DIR}`);
            console.log(`[CACHE]  Cache Folder: ${CACHE_DIR}`);
            console.log("=".repeat(50) + "\n");
            warmUpYtDlp();
        });
    } else {
        app.listen(PORT, HOST, () => {
            console.log("\n" + "=".repeat(50));
            console.log(`[SERVER] Uni Extract Server running on port ${PORT}`);
            console.log(`[ACCESS] Bound to: http://${HOST}:${PORT}`);
            console.log(`[TEMP]   Temp Folder: ${TEMP_DIR}`);
            console.log(`[CACHE]  Cache Folder: ${CACHE_DIR}`);
            console.log("=".repeat(50) + "\n");
            warmUpYtDlp();
        });
    }
})();