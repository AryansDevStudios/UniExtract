const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'client', 'dist');
const dest = path.join(__dirname, '..', 'public');

if (!fs.existsSync(src)) {
    console.error('[sync-dist] Error: client/dist does not exist. Run "npm run build --prefix client" first.');
    process.exit(1);
}

if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
}

// Clean old assets directory in public to avoid stale hashed bundles
const destAssets = path.join(dest, 'assets');
if (fs.existsSync(destAssets)) {
    fs.rmSync(destAssets, { recursive: true, force: true });
}

// Copy everything from client/dist to public
fs.cpSync(src, dest, { recursive: true });
console.log('✓ [sync-dist] Successfully synced client/dist production build to public/');
