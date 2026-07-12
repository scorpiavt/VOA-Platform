# Build a compact public player package (no monorepo, no dev tools).
# Output: voa-platform/public-release/
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Building launcher portable (public)..."
npm run build -w @voa/shared
npm run dist:public -w voa-launcher

$Release = Join-Path $Root "apps\launcher\release"
$Out = Join-Path $Root "public-release"
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Path $Out | Out-Null

$portable = Get-ChildItem $Release -Filter "VisionsOfAetherius-*-portable.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $portable) { throw "Portable exe not found in $Release" }

# Single downloadable binary (stable name). Versioned build stays under apps/launcher/release/.
Copy-Item $portable.FullName (Join-Path $Out "VisionsOfAetherius.exe")

# Player docs
Copy-Item (Join-Path $PSScriptRoot "PUBLIC-PLAYER-README.md") (Join-Path $Out "README.txt")

# Optional client reference (launcher already embeds client into resources)
$ClientOut = Join-Path $Out "client-optional"
New-Item -ItemType Directory -Path $ClientOut | Out-Null
Copy-Item (Join-Path $Root "client-dist\skymp5-client.js") $ClientOut
Copy-Item (Join-Path $Root "client-dist\skymp5-client-settings.example.txt") $ClientOut
@"
Manual install (only if automatic Play install fails):
1. Install SKSE64 + Skyrim Platform for your Skyrim SE/AE version
2. Copy skymp5-client.js into:
   <Skyrim>\Data\Platform\Plugins\
3. Prefer using VisionsOfAetherius.exe → Login → Play (writes settings automatically)
"@ | Set-Content (Join-Path $ClientOut "INSTALL.txt") -Encoding UTF8

# Clean old builder junk names from release/ (keep latest portable only)
Get-ChildItem $Release -Filter "VOA-Launcher*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Sync Desktop public package (single public exe)
$DesktopPublic = Join-Path $env:USERPROFILE "Desktop\VOA-Public"
New-Item -ItemType Directory -Path $DesktopPublic -Force | Out-Null
Get-ChildItem $DesktopPublic -Filter "VisionsOfAetherius*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "VisionsOfAetherius.exe" } |
  Remove-Item -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Out "VisionsOfAetherius.exe") (Join-Path $DesktopPublic "VisionsOfAetherius.exe") -Force
Copy-Item (Join-Path $Out "README.txt") (Join-Path $DesktopPublic "README.txt") -Force

# Sync Desktop dev package (same binary + bat forcing local API)
$DesktopDev = Join-Path $env:USERPROFILE "Desktop\VOA-Dev"
New-Item -ItemType Directory -Path $DesktopDev -Force | Out-Null
Copy-Item (Join-Path $Out "VisionsOfAetherius.exe") (Join-Path $DesktopDev "VisionsOfAetherius-Dev.exe") -Force
@"
@echo off
title VOA Launcher (DEV)
set VOA_API_URL=http://127.0.0.1:3100
echo VOA Dev mode — API: %VOA_API_URL%
echo Start local API:  cd voa-platform ^& npm run dev:api
start "" "%~dp0VisionsOfAetherius-Dev.exe"
"@ | Set-Content (Join-Path $DesktopDev "Start-Dev.bat") -Encoding ASCII

Write-Host ""
Write-Host "Public package ready:"
Get-ChildItem $Out -Recurse | Select-Object FullName, Length | Format-Table -AutoSize
Write-Host "Folder: $Out"
Write-Host "Share:  $Out\VisionsOfAetherius.exe  (+ README.txt)"
Write-Host "Desktop public: $DesktopPublic\VisionsOfAetherius.exe"
Write-Host "Desktop dev:    $DesktopDev\Start-Dev.bat"
