const { YtDlp, helpers } = require('ytdlp-nodejs');
const https = require('https');
const { execSync } = require('child_process');

async function checkLatestYtDlpRelease() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/yt-dlp/yt-dlp/releases/latest',
            headers: { 'User-Agent': 'UniExtract-HealthCheck' }
        };
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.tag_name || null);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function main() {
    console.log('='.repeat(60));
    console.log('[HEALTH CHECK] Starting yt-dlp Extractor & Compatibility Check...');
    console.log('='.repeat(60));

    // 1. Check local yt-dlp binary
    const binPath = helpers.findYtdlpBinary();
    if (!binPath) {
        throw new Error('yt-dlp binary not found locally in ytdlp-nodejs!');
    }
    const currentVersion = execSync(`"${binPath}" --version`).toString().trim();
    console.log(`✓ Local yt-dlp Version: ${currentVersion}`);

    // 2. Check upstream latest release
    const latestRelease = await checkLatestYtDlpRelease();
    if (latestRelease) {
        console.log(`✓ Upstream Latest Release: ${latestRelease}`);
        if (currentVersion !== latestRelease) {
            console.log(`ℹ Note: Newer yt-dlp release available (${latestRelease}). Run update script if needed.`);
        } else {
            console.log('✓ Local binary is on the latest release.');
        }
    }

    // 3. Test URL extraction against stable public test video
    // Test URL: "Me at the zoo" (YouTube's first permanent video)
    const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    console.log(`\n[PROBE] Testing extraction on: ${testUrl}`);

    const ytdlp = new YtDlp({ binaryPath: binPath });
    const startTime = Date.now();
    const info = await ytdlp.getInfoAsync(testUrl, { noPlaylist: true });
    const durationMs = Date.now() - startTime;

    if (!info || !info.title) {
        throw new Error('Failed to retrieve video info or title from yt-dlp!');
    }

    console.log(`✓ Extraction Successful in ${durationMs}ms:`);
    console.log(`  - Title:    "${info.title}"`);
    console.log(`  - Uploader: ${info.uploader || 'N/A'}`);
    console.log(`  - Duration: ${info.duration}s`);
    console.log(`  - Formats:  ${Array.isArray(info.formats) ? info.formats.length : 0} streams found`);

    console.log('\n' + '='.repeat(60));
    console.log('✓ [PASS] yt-dlp engine is 100% HEALTHY and operational!');
    console.log('='.repeat(60));
}

main().catch((err) => {
    console.error('\n❌ [FAIL] yt-dlp health check failed:', err.message);
    process.exit(1);
});
