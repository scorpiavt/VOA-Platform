# Deploy production VOA API to the public VPS (players). Dev login disabled.
# Requires: SSH key at red-house-public/server/voa_ssh_key, Node on VPS.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent $Root
$Key = Join-Path $RepoRoot "red-house-public\server\voa_ssh_key"
$HostName = "178.156.158.116"
$User = "root"
$Remote = "/home/skymp/voa-platform"

if (-not (Test-Path $Key)) { throw "SSH key missing: $Key" }

Write-Host "==> Build API locally"
Set-Location $Root
npm run build:api

$LocalEnv = Join-Path $Root "services\api\.env"
if (-not (Test-Path $LocalEnv)) { throw "Missing services/api/.env" }

# Stage a clean upload tree (no local sqlite / runtime logs)
$Stage = Join-Path $env:TEMP "voa-api-deploy"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $Stage "services\api") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Stage "packages\shared") -Force | Out-Null

Copy-Item (Join-Path $Root "package.json") $Stage
Copy-Item (Join-Path $Root "package-lock.json") $Stage -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Root "services\api\package.json") (Join-Path $Stage "services\api\")
Copy-Item (Join-Path $Root "services\api\dist") (Join-Path $Stage "services\api\dist") -Recurse
Copy-Item (Join-Path $Root "packages\shared\package.json") (Join-Path $Stage "packages\shared\")
Copy-Item (Join-Path $Root "packages\shared\dist") (Join-Path $Stage "packages\shared\dist") -Recurse -ErrorAction SilentlyContinue
# shared may compile to dist or just be TS — copy src if needed
if (-not (Test-Path (Join-Path $Stage "packages\shared\dist"))) {
  Copy-Item (Join-Path $Root "packages\shared\src") (Join-Path $Stage "packages\shared\src") -Recurse
}

# Production env from local secrets, forced public settings
$envLines = Get-Content $LocalEnv
$prod = @()
foreach ($line in $envLines) {
  if ($line -match '^\s*#') { $prod += $line; continue }
  if ($line -match '^\s*$') { $prod += $line; continue }
  if ($line -match '^PUBLIC_URL=') { $prod += "PUBLIC_URL=http://178.156.158.116:3100"; continue }
  if ($line -match '^CDN_BASE_URL=') { $prod += "CDN_BASE_URL=http://178.156.158.116:3100/cdn"; continue }
  if ($line -match '^ALLOW_DEV_LOGIN=') { $prod += "ALLOW_DEV_LOGIN=false"; continue }
  if ($line -match '^HOST=') { $prod += "HOST=0.0.0.0"; continue }
  if ($line -match '^PORT=') { $prod += "PORT=3100"; continue }
  if ($line -match '^GAME_STATUS_URL=') { $prod += "GAME_STATUS_URL=http://127.0.0.1:3099/status"; continue }
  $prod += $line
}
if ($prod -notmatch 'ALLOW_DEV_LOGIN=') { $prod += "ALLOW_DEV_LOGIN=false" }
if ($prod -notmatch 'NODE_ENV=') { $prod += "NODE_ENV=production" }
$prod | Set-Content (Join-Path $Stage "services\api\.env") -Encoding UTF8

Write-Host "==> Upload to ${User}@${HostName}:$Remote"
ssh -i $Key -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${User}@${HostName}" "mkdir -p $Remote/services/api $Remote/packages/shared /home/skymp/voa-platform-data"

# tar + scp is more reliable than many scp recursion edge cases on Windows
$Tar = Join-Path $env:TEMP "voa-api-deploy.tgz"
if (Test-Path $Tar) { Remove-Item $Tar -Force }
Push-Location $Stage
tar -czf $Tar *
Pop-Location
scp -i $Key -o BatchMode=yes $Tar "${User}@${HostName}:/tmp/voa-api-deploy.tgz"

$remoteScript = @'
set -e
mkdir -p /home/skymp/voa-platform
cd /home/skymp/voa-platform
tar -xzf /tmp/voa-api-deploy.tgz -C /home/skymp/voa-platform
# Install production deps for API workspace-ish layout
cd /home/skymp/voa-platform/services/api
# Flatten: install deps next to API using package.json
npm install --omit=dev --no-fund --no-audit 2>/dev/null || npm install --production --no-audit
# Link shared package
mkdir -p node_modules/@voa
rm -rf node_modules/@voa/shared
ln -sfn /home/skymp/voa-platform/packages/shared node_modules/@voa/shared
# Ensure shared has a resolvable main
if [ -f /home/skymp/voa-platform/packages/shared/package.json ]; then
  echo "shared package ok"
fi
chown -R skymp:skymp /home/skymp/voa-platform /home/skymp/voa-platform-data
# DATA_DIR on durable path
grep -q '^DATA_DIR=' /home/skymp/voa-platform/services/api/.env && \
  sed -i 's|^DATA_DIR=.*|DATA_DIR=/home/skymp/voa-platform-data|' /home/skymp/voa-platform/services/api/.env || \
  echo 'DATA_DIR=/home/skymp/voa-platform-data' >> /home/skymp/voa-platform/services/api/.env
# PM2 process as root for parity with voa-server
cd /home/skymp/voa-platform/services/api
pm2 delete voa-api 2>/dev/null || true
pm2 start dist/index.js --name voa-api --cwd /home/skymp/voa-platform/services/api
pm2 save
sleep 2
curl -sS -m 5 http://127.0.0.1:3100/health || (pm2 logs voa-api --lines 40 --nostream; exit 1)
curl -sS -m 5 http://127.0.0.1:3100/v1/status | head -c 400; echo
ss -tlnp | grep 3100 || true
pm2 list
echo "DEPLOY_OK"
'@

ssh -i $Key -o BatchMode=yes "${User}@${HostName}" $remoteScript

Write-Host "==> Public health check from this machine"
try {
  $h = Invoke-WebRequest -Uri "http://178.156.158.116:3100/health" -UseBasicParsing -TimeoutSec 10
  Write-Host "External health:" $h.Content
} catch {
  Write-Host "WARN: external health failed (firewall?): $_"
}

Write-Host "Done. Discord redirect URI must include: http://178.156.158.116:3100/auth/discord/callback"
