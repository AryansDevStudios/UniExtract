#!/usr/bin/env bash
set -e

# ==============================================================================
# Universal Media Extractor - Backend Only Downloader & Installer
# Fetches ONLY backend server files from GitHub using Git Sparse Checkout.
# No frontend or Electron files are downloaded.
# ==============================================================================

REPO_URL="https://github.com/AryansDevStudios/Universal-Media-Extractor.git"
TARGET_DIR="${1:-ume-backend}"

echo "=================================================="
echo "Universal Media Extractor: Backend Only Downloader"
echo "Target directory: $TARGET_DIR"
echo "=================================================="

if command -v git >/dev/null 2>&1; then
    echo "[1/4] Cloning backend files via Git Sparse Checkout..."
    git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TARGET_DIR"
    cd "$TARGET_DIR"
    git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example
else
    echo "[ERROR] git is required to download backend files."
    exit 1
fi

echo "[2/4] Initializing environment configuration (.env)..."
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

echo "[3/4] Installing backend production dependencies..."
npm install --omit=dev

echo "[4/4] Verifying FFmpeg..."
if command -v ffmpeg >/dev/null 2>&1; then
    echo "FFmpeg is installed and available in PATH."
else
    echo "[WARNING] FFmpeg not found in PATH! Please install FFmpeg (e.g., sudo apt install ffmpeg)."
fi

echo ""
echo "=================================================="
echo "Backend installation successful!"
echo "To start the backend server:"
echo "  cd $TARGET_DIR"
echo "  npm run backend:start"
echo "=================================================="
