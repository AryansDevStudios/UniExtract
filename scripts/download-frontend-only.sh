#!/usr/bin/env bash
set -e

# ==============================================================================
# Uni Extract - Frontend Only Downloader & Installer
# Fetches ONLY the client React/Vite/Tailwind frontend folder.
# No backend dependencies, yt-dlp binaries, or Electron files are downloaded.
# ==============================================================================

REPO_URL="https://github.com/AryansDevStudios/UniExtract.git"
TARGET_DIR="${1:-uniextract-frontend}"

echo "=================================================="
echo "Uni Extract: Frontend Only Downloader"
echo "Target directory: $TARGET_DIR"
echo "=================================================="

if command -v git >/dev/null 2>&1; then
    echo "[1/3] Cloning frontend files via Git Sparse Checkout..."
    git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" "$TARGET_DIR"
    cd "$TARGET_DIR"
    git sparse-checkout set client
    cd client
else
    echo "[ERROR] git is required to download frontend files."
    exit 1
fi

echo "[2/3] Installing frontend dependencies (React, Vite, Tailwind)..."
npm install

echo "[3/3] Building production bundle..."
npm run build

echo ""
echo "=================================================="
echo "Frontend installation successful!"
echo "Options to run:"
echo "  1. Dev server:  cd $TARGET_DIR/client && npm run dev"
echo "  2. Static host: Deploy $TARGET_DIR/client/dist to Netlify/Vercel"
echo "=================================================="
