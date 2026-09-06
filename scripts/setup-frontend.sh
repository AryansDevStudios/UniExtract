#!/usr/bin/env bash
set -e

echo "==> Setting up Universal Media Extractor Frontend..."
npm install --prefix client
npm run build --prefix client
echo "==> Frontend built to client/dist."
