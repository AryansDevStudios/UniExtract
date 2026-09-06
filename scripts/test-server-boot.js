const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

console.log('[CI TEST] Starting server.js for boot and health verification...');

const serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '3099', HOST: '127.0.0.1' },
    stdio: 'inherit'
});

let testPassed = false;

const checkHealth = (retries = 15) => {
    http.get('http://127.0.0.1:3099/api/health', (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.status === 'ok') {
                    console.log('\n✓ [CI TEST] Health check PASSED:', json);
                    testPassed = true;
                    cleanup(0);
                } else {
                    throw new Error('Unexpected status: ' + data);
                }
            } catch (err) {
                console.error('[CI TEST] Failed to parse health response:', err.message);
                cleanup(1);
            }
        });
    }).on('error', (err) => {
        if (retries > 0) {
            setTimeout(() => checkHealth(retries - 1), 1000);
        } else {
            console.error('[CI TEST] Timed out waiting for /api/health:', err.message);
            cleanup(1);
        }
    });
};

const cleanup = (exitCode) => {
    try {
        if (process.platform === 'win32') {
            require('child_process').execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
        } else {
            serverProc.kill('SIGKILL');
        }
    } catch (e) {}
    process.exit(exitCode);
};

serverProc.on('error', (err) => {
    console.error('[CI TEST] Server process error:', err);
    cleanup(1);
});

// Start probing after 1.5 seconds
setTimeout(() => checkHealth(), 1500);
