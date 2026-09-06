@echo off
echo ==> Setting up Uni Extract Backend...

if not exist .env (
    if exist .env.example copy .env.example .env >nul
    echo Created .env from .env.example
)

echo ==> Installing backend production dependencies...
call npm install --omit=dev

echo ==> Verifying FFmpeg...
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] FFmpeg was not detected in PATH!
) else (
    echo FFmpeg is installed and ready.
)

echo ==> Backend ready. Start with: npm run backend:start
