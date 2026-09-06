@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo Universal Media Extractor: Frontend Only Downloader
echo ==================================================

set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="" set "TARGET_DIR=ume-frontend"

echo [1/3] Cloning frontend files via Git Sparse Checkout into %TARGET_DIR%...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    exit /b 1
)

git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/Universal-Media-Extractor.git "%TARGET_DIR%"
cd /d "%TARGET_DIR%"
git sparse-checkout set client
cd client

echo [2/3] Installing frontend dependencies (React, Vite, Tailwind)...
call npm install

echo [3/3] Building production bundle...
call npm run build

echo.
echo ==================================================
echo Frontend installation successful!
echo Options to run:
echo   1. Dev server:  cd %TARGET_DIR%\client && npm run dev
echo   2. Static host: Deploy %TARGET_DIR%\client\dist to Netlify/Vercel
echo ==================================================
