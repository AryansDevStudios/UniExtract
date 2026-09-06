@echo off
setlocal
echo ========================================================
echo Trusting AryansDevStudios Certificate on Windows
echo ========================================================

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set CER_FILE=%~dp0..\certs\AryansDevStudios.cer
if not exist "%CER_FILE%" (
    set CER_FILE=%~dp0AryansDevStudios.cer
)
if not exist "%CER_FILE%" (
    set CER_FILE=%CD%\certs\AryansDevStudios.cer
)
if not exist "%CER_FILE%" (
    set CER_FILE=%CD%\AryansDevStudios.cer
)

if not exist "%CER_FILE%" (
    echo [ERROR] Certificate file AryansDevStudios.cer not found!
    pause
    exit /b 1
)

echo Adding AryansDevStudios to Trusted Publishers...
certutil -addstore -f "TrustedPublisher" "%CER_FILE%"

echo Adding AryansDevStudios to Trusted Root Certification Authorities...
certutil -addstore -f "Root" "%CER_FILE%"

echo.
echo ========================================================
echo [SUCCESS] AryansDevStudios is now trusted on this PC!
echo SmartScreen and Unknown Publisher warnings are resolved.
echo ========================================================
pause
