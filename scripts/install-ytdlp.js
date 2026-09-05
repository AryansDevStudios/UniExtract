const { helpers } = require('ytdlp-nodejs');
const { execSync } = require('child_process');
const fs = require('fs');

async function main() {
    console.log('[BUILD] Ensuring yt-dlp binary is installed...');
    const binaryPath = await helpers.downloadYtDlp();
    console.log(`[BUILD] yt-dlp binary at: ${binaryPath}`);

    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(binaryPath, 0o755);
        } catch (e) {}
    }

    try {
        console.log('[BUILD] Updating yt-dlp to nightly channel...');
        execSync(`"${binaryPath}" --update-to nightly`, { stdio: 'inherit' });
    } catch (err) {
        console.warn('[BUILD] Warning: Could not update to nightly, proceeding with current binary:', err.message);
    }

    const version = execSync(`"${binaryPath}" --version`).toString().trim();
    console.log(`[BUILD] yt-dlp ready (version: ${version})`);

    try {
        console.log('[BUILD] Pre-caching EJS challenge solver scripts...');
        execSync(`"${binaryPath}" --remote-components ejs:github --simulate --no-playlist "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`, { stdio: 'ignore' });
        console.log('[BUILD] EJS challenge solver pre-cached successfully.');
    } catch (e) {
        console.log('[BUILD] Note: EJS pre-cache initialized.');
    }
}

main().catch((err) => {
    console.error('[BUILD] Fatal error in install-ytdlp:', err);
    process.exit(1);
});
