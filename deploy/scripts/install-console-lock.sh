#!/bin/bash
set -e
mkdir -p /home/skymp/voa-server/gamemode/addons
BOOT=/home/skymp/voa-server/gamemode.voa-bootstrap.js
cat > "$BOOT" << 'BOOTJS'
try { require("./gamemode/addons/voa-characters-addon.js"); } catch (e) { console.log("[VOA] characters addon", e && e.message); }
try { require("./gamemode/addons/voa-console-addon.js"); } catch (e) { console.log("[VOA] console addon", e && e.message); }
try { require("./voa-pvp-addon.js"); } catch (e) {}
require("./gamemode.js");
BOOTJS

python3 - <<'PY'
import json
p="/home/skymp/voa-server/server-settings.json"
with open(p) as f: d=json.load(f)
old=d.get("gamemodePath")
d["gamemodePath"]="gamemode.voa-bootstrap.js"
with open(p,"w") as f: json.dump(d,f,indent=2)
print("gamemodePath", old, "->", d["gamemodePath"])
PY

# Ensure VOA_GAME_SECRET on pm2 if ecosystem - inject into a .env file next to server
API_ENV=/home/skymp/voa-platform/services/api/.env
SECRET=$(grep '^GAME_SERVER_SECRET=' "$API_ENV" 2>/dev/null | cut -d= -f2- || true)
if [ -n "$SECRET" ]; then
  echo "VOA_API_BASE=http://127.0.0.1:3100" > /home/skymp/voa-server/.voa-env
  echo "VOA_GAME_SECRET=$SECRET" >> /home/skymp/voa-server/.voa-env
  echo "GAME_SERVER_SECRET=$SECRET" >> /home/skymp/voa-server/.voa-env
  # pm2 restart with env
  if command -v pm2 >/dev/null; then
    cd /home/skymp/voa-server
    # shellcheck disable=SC2046
    export $(grep -v '^#' .voa-env | xargs)
    pm2 restart voa-server --update-env || true
    # also set env via pm2 set
    pm2 restart voa-server --update-env 2>/dev/null || true
  fi
fi

mkdir -p /home/skymp/voa-platform-data/cdn/client
ls -la /home/skymp/voa-server/gamemode/addons/
ls -la /home/skymp/voa-platform-data/cdn/client/skymp5-client.js || true

SECRET_Q=$(grep '^GAME_SERVER_SECRET=' /home/skymp/voa-platform/services/api/.env | cut -d= -f2-)
echo "is-staff p1000:"
curl -sS "http://127.0.0.1:3100/v1/game/is-staff?profileId=1000&secret=${SECRET_Q}"
echo
echo "is-staff p1001:"
curl -sS "http://127.0.0.1:3100/v1/game/is-staff?profileId=1001&secret=${SECRET_Q}"
echo
echo "DONE"
