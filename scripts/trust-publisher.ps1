# Run to install the AryansDevStudios Code Signing Certificate
param (
    [string]$CertPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CertPath)) {
    $candidates = @(
        (Join-Path $PSScriptRoot "..\certs\AryansDevStudios.cer"),
        (Join-Path $PSScriptRoot "AryansDevStudios.cer"),
        (Join-Path (Get-Location) "certs\AryansDevStudios.cer"),
        (Join-Path (Get-Location) "AryansDevStudios.cer")
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand) {
            $CertPath = (Resolve-Path $cand).Path
            break
        }
    }
}

if (-not (Test-Path $CertPath)) {
    Write-Error "AryansDevStudios.cer not found. Please verify the file path."
    exit 1
}

Write-Host "Installing AryansDevStudios Certificate from: $CertPath"
Write-Host "Adding to TrustedPublisher store..."
& certutil -addstore -f "TrustedPublisher" $CertPath

Write-Host "Adding to Root store..."
& certutil -addstore -f "Root" $CertPath

Write-Host "`n[SUCCESS] Windows now trusts AryansDevStudios as a Verified Publisher!" -ForegroundColor Green
Write-Host "UniExtract installers and executables will now be recognized with Publisher: AryansDevStudios." -ForegroundColor Cyan
