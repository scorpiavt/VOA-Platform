#!/bin/bash
# Install VOA character DB bridge on VPS game server + restart API if local.
# Run as root on the VPS after uploading voa-platform deploy files.
set -euo pipefail

RUNTIME="${VOA_RUNTIME:-/home/skymp/voa-server}"
API_DIR="${VOA_API_DIR:-/home/skymp/voa-platform/services/api}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SECRET="${VOA_GAME_SECRET:-${GAME_SERVER_SECRET:-}}"

if [[ -z "$SECRET" ]]; then
  echo "WARN: VOA_GAME_SECRET not set — generate one and put in API + game env"
  SECRET="$(openssl rand -hex 24)"
  echo "Generated SECRET=$SECRET"
fi

echo "=== 1) Game server env ==="
ENV_FILE="$RUNTIME/.env"
touch "$ENV_FILE"
grep -q '^VOA_API_BASE=' "$ENV_FILE" 2>/dev/null || echo "VOA_API_BASE=http://127.0.0.1:3100" >> "$ENV_FILE"
grep -q '^VOA_GAME_SECRET=' "$ENV_FILE" 2>/dev/null || echo "VOA_GAME_SECRET=$SECRET" >> "$ENV_FILE"
# Also export for current shell / pm2
export VOA_API_BASE="${VOA_API_BASE:-http://127.0.0.1:3100}"
export VOA_GAME_SECRET="$SECRET"

echo "=== 2) Copy characters addon ==="
mkdir -p "$RUNTIME/gamemode/addons"
cp -f "$SCRIPT_DIR/voa-characters-addon.js" "$RUNTIME/gamemode/addons/voa-characters-addon.js"
chown -R skymp:skymp "$RUNTIME/gamemode/addons" 2>/dev/null || true

# Ensure gamemode loads the addon
GM_INDEX="$RUNTIME/gamemode/index.js"
if [[ -f "$GM_INDEX" ]] && ! grep -q 'voa-characters-addon' "$GM_INDEX"; then
  echo "require('./addons/voa-characters-addon.js');" >> "$GM_INDEX"
  echo "Appended require to gamemode/index.js"
elif [[ -f "$RUNTIME/gamemode.js" ]] && ! grep -q 'voa-characters-addon' "$RUNTIME/gamemode.js"; then
  echo "require('./gamemode/addons/voa-characters-addon.js');" >> "$RUNTIME/gamemode.js" || true
fi

echo "=== 3) Patch spawn/login ==="
export VOA_DIST_BACK="$RUNTIME/dist_back"
node "$SCRIPT_DIR/patch-login-spawn-slot.js"

echo "=== 4) API secret (if local api env) ==="
if [[ -d "$API_DIR" ]]; then
  API_ENV="$API_DIR/.env"
  touch "$API_ENV"
  if grep -q '^GAME_SERVER_SECRET=' "$API_ENV"; then
    sed -i "s|^GAME_SERVER_SECRET=.*|GAME_SERVER_SECRET=$SECRET|" "$API_ENV"
  else
    echo "GAME_SERVER_SECRET=$SECRET" >> "$API_ENV"
  fi
  echo "API .env updated"
fi

echo "=== 5) Restart services ==="
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart voa-server --update-env || true
  pm2 restart voa-api --update-env || true
  sleep 3
  pm2 list
fi

echo "=== Done ==="
echo "Set the same GAME_SERVER_SECRET on the API host if API is remote."
echo "Friend must delete characters again (or Play once) so orphans wipe."
