param (
    [string]$Password = "aryansdevstudios",
    [string]$CertDir = "certs"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $CertDir)) {
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
}

$pfxPath = Join-Path $CertDir "AryansDevStudios.pfx"
$cerPath = Join-Path $CertDir "AryansDevStudios.cer"

Write-Host "Creating Code Signing Certificate for AryansDevStudios..."
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=AryansDevStudios, O=AryansDevStudios, OU=Software Development" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -NotAfter (Get-Date).AddYears(10) `
    -CertStoreLocation "Cert:\CurrentUser\My"

$secPass = ConvertTo-SecureString -String $Password -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secPass | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "Certificate exported successfully:"
Write-Host "  PFX: $pfxPath"
Write-Host "  CER: $cerPath"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  Subject: $($cert.Subject)"
