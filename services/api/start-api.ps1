# Start VOA API fully detached (VBS) so it never dies with the shell
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $root "start-api-hidden.vbs"

function Test-Api {
  try {
    $h = Invoke-RestMethod "http://127.0.0.1:3100/health" -TimeoutSec 2
    return [bool]$h.ok
  } catch { return $false }
}

if (Test-Api) {
  Write-Host "VOA API already running on http://127.0.0.1:3100"
  exit 0
}

# Free stuck port holders that aren't healthy
Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.OwningProcess -gt 0) {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 1

if (-not (Test-Path (Join-Path $root "dist\index.js"))) {
  Write-Host "Building API..."
  Push-Location (Join-Path $root "..\..")
  npm run build -w @voa/api
  Pop-Location
}

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbs`"" -WindowStyle Hidden
Start-Sleep -Seconds 2

for ($i = 0; $i -lt 15; $i++) {
  if (Test-Api) {
    Write-Host "VOA API running on http://127.0.0.1:3100"
    exit 0
  }
  Start-Sleep -Milliseconds 400
}

Write-Host "API failed to start. Check data/api-runtime.log"
if (Test-Path (Join-Path $root "data\api-runtime.log")) {
  Get-Content (Join-Path $root "data\api-runtime.log") -Tail 40
}
exit 1
