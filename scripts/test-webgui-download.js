const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const CHROME_PATH = process.env.CHROME_PATH || (
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')
);
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads');
const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5173';
const VIDEO_URL = 'https://www.youtube.com/watch?v=BfM86k78AO0';
const PLAYLIST_URL = 'https://www.youtube.com/watch?v=AyFOei2TO7E&list=PLPXwi5T3lqH42GzCEqhltQF5HycT7icmG';


async function waitForNewDownload(clickTime, timeoutMs = 300000) {
  console.log(`Waiting for file in Downloads folder (timeout: ${timeoutMs / 1000}s)...`);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const currentFiles = fs.readdirSync(DOWNLOAD_DIR);
    
    // Find any file modified after clickTime
    const candidate = currentFiles.find(f => {
      if (f.endsWith('.crdownload') || f.endsWith('.tmp')) return false;
      if (!f.endsWith('.mp4') && !f.endsWith('.mp3') && !f.endsWith('.m4a') && !f.endsWith('.opus')) return false;
      try {
        const stat = fs.statSync(path.join(DOWNLOAD_DIR, f));
        return stat.mtimeMs >= clickTime - 1000;
      } catch (e) {
        return false;
      }
    });
    
    if (candidate) {
      const filePath = path.join(DOWNLOAD_DIR, candidate);
      let size1 = -1;
      try { size1 = fs.statSync(filePath).size; } catch(e) {}
      await new Promise(r => setTimeout(r, 1500));
      let size2 = -1;
      try { size2 = fs.statSync(filePath).size; } catch(e) {}
      
      if (size1 > 0 && size1 === size2) {
        return filePath;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for download after ${timeoutMs}ms`);
}

function verifyMetadata(filePath) {
  console.log(`\n==================================================`);
  console.log(`VERIFYING METADATA & THUMBNAIL: ${path.basename(filePath)}`);
  console.log(`File Size: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`==================================================`);

  const probe = spawnSync('ffmpeg', ['-i', filePath, '-hide_banner']);
  const dump = (probe.stderr ? probe.stderr.toString() : '') + (probe.stdout ? probe.stdout.toString() : '');
  console.log(dump);
  
  const hasVideo = dump.includes('Stream #') && dump.includes('Video:');
  const hasAudio = dump.includes('Stream #') && dump.includes('Audio:');
  const hasAttachedPic = dump.includes('attached pic') || dump.includes('attached_pic') || dump.includes('Album cover') || dump.includes('mjpeg');
  const hasTitle = dump.includes('title') || dump.includes('Title:');
  const hasArtist = dump.includes('artist') || dump.includes('Artist:');

  console.log('\n--- VERIFICATION RESULTS ---');
  console.log(`Video Stream Present: ${hasVideo ? 'YES' : 'NO'}`);
  console.log(`Audio Stream Present: ${hasAudio ? 'YES' : 'NO'}`);
  console.log(`Attached Thumbnail Cover Art: ${hasAttachedPic ? 'YES' : 'NO'}`);
  console.log(`Title Metadata: ${hasTitle ? 'YES' : 'NO'}`);
  console.log(`Artist Metadata: ${hasArtist ? 'YES' : 'NO'}`);
  console.log('----------------------------\n');

  return { hasVideo, hasAudio, hasAttachedPic, hasTitle, hasArtist };
}

async function run() {
  console.log('Starting automated Web GUI test with Chrome Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Enable download in Chrome
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });
    try {
      const bClient = await browser.target().createCDPSession();
      await bClient.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DOWNLOAD_DIR,
        eventsEnabled: true
      });
    } catch(e) {}

    console.log(`Navigating to Web GUI: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // ----------------------------------------------------
    // TEST 1: SINGLE VIDEO DOWNLOAD VIA WEB GUI
    // ----------------------------------------------------
    console.log('\n>>> [TEST 1] Testing Single Video Web GUI Download...');
    const initialFiles = new Set(fs.readdirSync(DOWNLOAD_DIR));

    // Find search input
    const inputSelector = 'input[placeholder*="Paste YouTube"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.type(inputSelector, VIDEO_URL);

    // Click Analyze button
    console.log(`Entering URL: ${VIDEO_URL} and clicking Analyze...`);
    const analyzeBtn = await page.$('button[type="submit"]');
    await analyzeBtn.click();

    // Wait for analysis to complete and CompactResultPanel to render
    console.log('Waiting for video analysis to complete...');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.innerText.includes('Download') && !b.innerText.includes('Selected'));
    }, { timeout: 30000 });
    
    await new Promise(r => setTimeout(r, 2000));

    // Find the Download button
    console.log('Clicking the Download button in the Web GUI...');
    const downloadButtons = await page.$$('button');
    let downloadBtn = null;
    for (const b of downloadButtons) {
      const text = await page.evaluate(el => el.innerText, b);
      if (text && text.includes('Download') && !text.includes('Selected')) {
        downloadBtn = b;
        break;
      }
    }

    if (!downloadBtn) {
      throw new Error('Could not find Download button on Single Video panel');
    }

    await downloadBtn.click();
    console.log('Download initiated via Web GUI! Waiting for file delivery to Downloads folder...');

    const singleVideoFile = await waitForNewDownload(initialFiles, 300000);
    console.log(`\nSUCCESS: File delivered to user's Downloads folder: ${singleVideoFile}`);

    // Verify metadata & thumbnail
    const singleResult = verifyMetadata(singleVideoFile);
    if (!singleResult.hasVideo || !singleResult.hasAudio || !singleResult.hasAttachedPic || !singleResult.hasTitle) {
      throw new Error('Single video verification failed: missing required streams or cover art thumbnail');
    }

    // ----------------------------------------------------
    // TEST 2: PLAYLIST DOWNLOAD VIA WEB GUI
    // ----------------------------------------------------
    console.log('\n>>> [TEST 2] Testing Playlist Web GUI Download...');
    const playlistInitialFiles = new Set(fs.readdirSync(DOWNLOAD_DIR));

    // Clear input and enter playlist URL
    await page.click(inputSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(inputSelector, PLAYLIST_URL);

    console.log(`Entering Playlist URL: ${PLAYLIST_URL} and clicking Analyze...`);
    const analyzeBtn2 = await page.$('button[type="submit"]');
    await analyzeBtn2.click();

    // Wait for playlist view to render
    console.log('Waiting for playlist analysis to complete...');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.innerText.includes('Download Selected'));
    }, { timeout: 40000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Configuring playlist selection: selecting 1 item for test download...');
    // Deselect All first
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const deselectBtn = buttons.find(b => b.innerText.includes('Deselect All'));
      if (deselectBtn) deselectBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Select the first video card
    const selected = await page.evaluate(() => {
      const list = document.querySelector('.custom-scroll.max-h-\\[600px\\]') || document.querySelector('.max-h-\\[600px\\]');
      if (list) {
        const firstCardButton = list.querySelector('button');
        if (firstCardButton) {
          firstCardButton.click();
          return true;
        }
      }
      return false;
    });
    console.log(`First video card selected: ${selected}`);
    await new Promise(r => setTimeout(r, 1000));

    // Click Download Selected button
    console.log('Clicking Download Selected in the Playlist Web GUI...');
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.innerText.includes('Download Selected'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error('Could not click Download Selected button on Playlist view');
    }

    console.log('Playlist download initiated via Web GUI! Waiting for file delivery to Downloads folder...');
    const playlistVideoFile = await waitForNewDownload(playlistInitialFiles, 300000);
    console.log(`\nSUCCESS: Playlist file delivered to user's Downloads folder: ${playlistVideoFile}`);

    // Verify metadata & thumbnail for playlist file
    const playlistResult = verifyMetadata(playlistVideoFile);
    if (!playlistResult.hasVideo || !playlistResult.hasAudio || !playlistResult.hasAttachedPic || !playlistResult.hasTitle) {
      throw new Error('Playlist verification failed: missing required streams or cover art thumbnail');
    }

    console.log('\n==================================================');
    console.log('🎉 ALL WEB GUI DOWNLOAD TESTS & VERIFICATIONS PASSED!');
    console.log('==================================================');

  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
