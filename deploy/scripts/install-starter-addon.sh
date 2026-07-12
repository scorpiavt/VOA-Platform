#!/bin/bash
# Install VOA ragged-robes starter addon into stock gamemode (safe merge).
# Usage on VPS: bash install-starter-addon.sh
set -e
RUNTIME=/home/skymp/voa-server
cd "$RUNTIME"

if [ ! -f gamemode.stock.js ]; then
  if [ -f gamemode.js ]; then
    cp -a gamemode.js gamemode.stock.js
    echo "saved current gamemode.js as gamemode.stock.js"
  else
    echo "ERROR: no gamemode.stock.js or gamemode.js"
    exit 1
  fi
fi

if [ ! -f voa-starter-addon.js ]; then
  echo "ERROR: place voa-starter-addon.js in $RUNTIME first"
  exit 1
fi

# Merge: stock + optional downed (if present and stable) + starter
# Prefer stock-only + starter for stability
cat gamemode.stock.js voa-starter-addon.js > gamemode.js
chown skymp:skymp gamemode.js || true
echo "gamemode.js bytes: $(wc -c < gamemode.js)"
echo "contains starter? $(grep -c 'VOA-starter' gamemode.js || true)"

pm2 restart voa-server || pm2 start start.sh --name voa-server --cwd "$RUNTIME"
sleep 8
pm2 list
echo "=== log ==="
tail -n 25 /root/.pm2/logs/voa-server-out.log 2>/dev/null || true
echo "=== err ==="
tail -n 15 /root/.pm2/logs/voa-server-error.log 2>/dev/null || true
