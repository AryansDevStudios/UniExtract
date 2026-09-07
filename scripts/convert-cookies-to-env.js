// scripts/convert-cookies-to-env.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputPath = process.argv[2] || path.resolve(__dirname, '..', 'cookies.txt');
const outputPath = path.resolve(__dirname, '..', '.env-cookies');

console.log('=== UniExtract Cookies-to-Env Converter ===\n');

if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: File not found at ${inputPath}`);
    console.log('Please ensure cookies.txt exists in the project root or pass its path as an argument.');
    process.exit(1);
}

const rawContent = fs.readFileSync(inputPath, 'utf8');
if (!rawContent.trim()) {
    console.error('❌ Error: cookies.txt is empty.');
    process.exit(1);
}

// Parse domains and stats
const lines = rawContent.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
const domains = new Set(lines.map(l => l.split('\t')[0].trim()).filter(Boolean));

console.log(`✓ Read cookies file: ${inputPath}`);
console.log(`✓ Total valid cookie entries: ${lines.length}`);
console.log(`✓ Domains included (${domains.size}):`);
domains.forEach(d => console.log(`   - ${d}`));

// 1. Encode as Base64 (Recommended for Render - 100% immune to newline/tab parsing issues)
const base64Cookies = Buffer.from(rawContent, 'utf8').toString('base64');

// 2. Generate a secure random COOKIE_PASSWORD if not already set
const randomPassword = crypto.randomBytes(12).toString('hex');

// Prepare .env contents
const envOutput = `# =========================================================
# UniExtract Environment Variables for Render / Cloud Host
# Generated on: ${new Date().toISOString()}
# =========================================================

# 1. Base64 Encoded Cookies (RECOMMENDED - Single line, zero syntax/tab issues)
COOKIES_BASE64=${base64Cookies}

# 2. Administrative Security Password (protects cookies on public Render backend)
COOKIE_PASSWORD=${randomPassword}

# 3. Environment identifier
NODE_ENV=production
`;

fs.writeFileSync(outputPath, envOutput, 'utf8');

console.log(`\n✓ Successfully generated: ${outputPath}`);
console.log('\n' + '='.repeat(65));
console.log('👉 EXACT TEXT TO COPY-PASTE INTO RENDER "Add from .env" MODAL:');
console.log('='.repeat(65) + '\n');
console.log(envOutput);
console.log('='.repeat(65));
console.log(`\n🔑 Your Server Cookie Password is: ${randomPassword}`);
console.log('   Save this password if you want to update cookies remotely from the web app.');
