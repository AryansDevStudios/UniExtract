#!/usr/bin/env bash
set -e

echo "==> Setting up Universal Media Extractor Backend..."

if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

echo "==> Installing backend production dependencies..."
npm install --omit=dev

echo "==> Verifying FFmpeg..."
if command -v ffmpeg >/dev/null 2>&1; then
    echo "FFmpeg found: $(ffmpeg -version | head -n 1)"
else
    echo "[WARNING] FFmpeg not found in PATH! Please install FFmpeg."
fi

echo "==> Backend ready. Start with: npm run backend:start"
