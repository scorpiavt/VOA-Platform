#!/bin/bash
set -e
cd /home/skymp/voa-server

# Pure stock gamemode (Chakra-safe). Downed append was breaking Chakra parse;
# keep downed as separate file for later second-pass if needed.
cp -a gamemode.base.stock.js gamemode.js
printf '\nconsole.log("[VOA] player-only mode (isVanillaSpawn=false; client strips NPCs)");\n' >> gamemode.js
chown skymp:skymp gamemode.js

# Ensure server options
if [ -f data/server-options.json ]; then
  echo "server-options present"
  cat data/server-options.json | head -c 200
  echo
fi

echo "gamemode bytes: $(wc -c < gamemode.js)"
echo "client: $(md5sum dist_front/skymp5-client.js)"
grep offlineMode server-settings.json || true

pm2 restart voa-server
sleep 12
pm2 list
ss -ulnp | grep 10000 || echo "no-udp-10000"
ss -tlnp | grep 10001 || echo "no-tcp-10001"
echo "=== OUT ==="
tail -30 /root/.pm2/logs/voa-server-out.log
echo "=== ERR ==="
tail -8 /root/.pm2/logs/voa-server-error.log
