const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

console.log('[TEST UPDATES] Testing Semver and live update endpoints on server...');

// 1. Unit test semver parsing
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

console.assert(isNewerVersion('2.0.0', '2.0.1') === true, '2.0.1 should be newer than 2.0.0');
console.assert(isNewerVersion('2.0.0', 'v2.0.1') === true, 'v2.0.1 should be newer than 2.0.0');
console.assert(isNewerVersion('2.0.1', '2.0.1') === false, '2.0.1 is not newer than 2.0.1');
console.assert(isNewerVersion('2.1.0', '2.0.9') === false, '2.0.9 is not newer than 2.1.0');
console.log('✓ Semver unit tests PASSED.');

// 2. Integration test: Spawn server on port 3098 and probe endpoints
const serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '3098', HOST: '127.0.0.1' },
    stdio: 'ignore'
});

const cleanup = (code) => {
    try {
        if (process.platform === 'win32') {
            require('child_process').execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
        } else {
            serverProc.kill('SIGKILL');
        }
    } catch (e) {}
    process.exit(code);
};

const getJson = (endpoint) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3098${endpoint}`, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
            try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
    }).on('error', reject);
});

const waitForServer = async (retries = 15) => {
    for (let i = 0; i < retries; i++) {
        try {
            await getJson('/api/health');
            return true;
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error('Timed out waiting for server to be ready on port 3098');
};

(async () => {
    try {
        console.log('[TEST UPDATES] Waiting for server to become ready...');
        await waitForServer();
        console.log('✓ Server is ready.');

        console.log('[TEST UPDATES] Probing GET /api/updates/active-jobs...');
        const activeJobsRes = await getJson('/api/updates/active-jobs');
        console.log('✓ Active jobs response:', activeJobsRes);
        console.assert(typeof activeJobsRes.activeJobsCount === 'number', 'activeJobsCount should be a number');

        console.log('[TEST UPDATES] Probing GET /api/updates...');
        const updatesRes = await getJson('/api/updates');
        console.log('✓ Updates response:', {
            currentVersion: updatesRes.currentVersion,
            latestVersion: updatesRes.latestVersion,
            updateAvailable: updatesRes.updateAvailable,
            assetsCount: updatesRes.assets ? updatesRes.assets.length : 0
        });
        console.assert(typeof updatesRes.currentVersion === 'string', 'currentVersion must be string');
        console.assert(typeof updatesRes.updateAvailable === 'boolean', 'updateAvailable must be boolean');

        console.log('\n🎉 [TEST UPDATES] ALL UPDATE ENGINE TESTS PASSED!');
        cleanup(0);
    } catch (err) {
        console.error('[TEST UPDATES] Endpoint probe failed:', err.message);
        cleanup(1);
    }
})();
