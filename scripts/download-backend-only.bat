@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo Uni Extract: Backend Only Downloader
echo ==================================================

set "TARGET_DIR=%~1"
if "%TARGET_DIR%"=="" set "TARGET_DIR=uniextract-backend"

echo [1/4] Cloning backend files via Git Sparse Checkout into %TARGET_DIR%...
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    exit /b 1
)

git clone --depth 1 --filter=blob:none --sparse https://github.com/AryansDevStudios/UniExtract.git "%TARGET_DIR%"
cd /d "%TARGET_DIR%"
git sparse-checkout set server.js scripts package.json yt-dlp.conf .env.example public

echo [2/4] Initializing environment configuration (.env)...
if not exist .env (
    if exist .env.example copy .env.example .env >nul
    echo Created .env from .env.example
)

echo [3/4] Installing backend production dependencies...
call npm install --omit=dev

echo [4/4] Verifying FFmpeg...
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] FFmpeg was not detected in PATH.
    echo Please install FFmpeg and add it to your Windows PATH for video transcoding.
) else (
    echo FFmpeg is installed and available.
)

echo.
echo ==================================================
echo Backend installation successful!
echo To start the server:
echo   cd %TARGET_DIR%
echo   npm run backend:start
echo ==================================================
