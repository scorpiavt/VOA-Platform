#!/bin/bash
set -euo pipefail

echo "=== VOA proximity voice deploy ==="

# --- Patch gamemode snippet list ---
python3 <<'PY'
from pathlib import Path
p = Path("/home/skymp/voa-server/dist_back/index.js")
t = p.read_text()
sn = "gamemode.voa-voice-snippet.js"
if sn not in t:
    old = '"gamemode.voa-fx-snippet.js",'
    new = '"gamemode.voa-fx-snippet.js",\n                "gamemode.voa-voice-snippet.js",'
    if old not in t:
        raise SystemExit("could not find fx snippet entry to patch")
    p.write_text(t.replace(old, new, 1))
    print("patched index.js snippet list")
else:
    print("voice snippet already listed")
assert sn in p.read_text()
print("OK snippet list")
PY

# --- Install LiveKit binary if missing ---
LK_DIR=/opt/livekit
mkdir -p "$LK_DIR"
if [ ! -x "$LK_DIR/livekit-server" ]; then
  echo "Downloading livekit-server..."
  cd /tmp
  curl -fsSL -o livekit.tar.gz \
    "https://github.com/livekit/livekit/releases/download/v1.8.4/livekit_1.8.4_linux_amd64.tar.gz" \
    || curl -fsSL -o livekit.tar.gz \
    "https://github.com/livekit/livekit/releases/download/v1.8.3/livekit_1.8.3_linux_amd64.tar.gz"
  tar -xzf livekit.tar.gz
  # tarball may extract livekit-server directly or in folder
  if [ -f livekit-server ]; then
    mv -f livekit-server "$LK_DIR/livekit-server"
  else
    find . -name livekit-server -type f | head -1 | xargs -I{} mv {} "$LK_DIR/livekit-server"
  fi
  chmod +x "$LK_DIR/livekit-server"
  echo "installed $($LK_DIR/livekit-server --version 2>/dev/null || echo livekit-server)"
else
  echo "livekit-server already present"
fi

# --- Generate keys if not already in env ---
ENVF=/home/skymp/voa-platform/services/api/.env
if ! grep -q '^LIVEKIT_API_KEY=' "$ENVF" 2>/dev/null; then
  # Generate random key/secret (LiveKit format: API + secret)
  API_KEY="API$(openssl rand -hex 8)"
  API_SECRET="$(openssl rand -hex 32)"
  echo "Generated LiveKit keys"
else
  API_KEY=$(grep '^LIVEKIT_API_KEY=' "$ENVF" | cut -d= -f2-)
  API_SECRET=$(grep '^LIVEKIT_API_SECRET=' "$ENVF" | cut -d= -f2-)
  echo "Reusing LiveKit keys from .env"
fi

# Write LiveKit config
cat > "$LK_DIR/livekit.yaml" <<YAML
port: 7880
log_level: info
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  use_external_ip: true
keys:
  ${API_KEY}: ${API_SECRET}
YAML

# systemd unit
cat > /etc/systemd/system/voa-livekit.service <<'UNIT'
[Unit]
Description=VOA LiveKit proximity voice SFU
After=network.target

[Service]
Type=simple
ExecStart=/opt/livekit/livekit-server --config /opt/livekit/livekit.yaml
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable voa-livekit
systemctl restart voa-livekit
sleep 2
systemctl is-active voa-livekit || (journalctl -u voa-livekit -n 30 --no-pager; exit 1)
echo "LiveKit active"

# Open firewall if ufw present
if command -v ufw >/dev/null 2>&1; then
  ufw allow 7880/tcp || true
  ufw allow 7881/tcp || true
  ufw allow 50000:50100/udp || true
fi

# --- Update API .env ---
# Keep existing GAME_SERVER_SECRET; strengthen JWT if placeholder; allow HTTP transitional
python3 <<PY
from pathlib import Path
import secrets
p = Path("$ENVF")
text = p.read_text()
lines = text.splitlines()
kv = {}
order = []
for line in lines:
    if not line.strip() or line.strip().startswith("#") or "=" not in line:
        order.append(("raw", line))
        continue
    k, v = line.split("=", 1)
    kv[k] = v
    order.append(("kv", k))

def setk(k, v):
    kv[k] = v
    if not any(t == "kv" and x == k for t, x in order):
        order.append(("kv", k))

# JWT secret: replace known placeholders
bad = {
    "voa-dev-secret-change-before-production-please",
    "dev-only-change-me",
    "change-me-to-a-long-random-string",
    "secret",
    "changeme",
}
jwt = kv.get("JWT_SECRET", "")
if jwt in bad or len(jwt) < 24:
    setk("JWT_SECRET", secrets.token_hex(32))
    print("rotated JWT_SECRET")
else:
    print("JWT_SECRET kept")

# GAME_SERVER_SECRET must stay in sync with game server
if not kv.get("GAME_SERVER_SECRET") or len(kv.get("GAME_SERVER_SECRET","")) < 24:
    # match ecosystem if present
    setk("GAME_SERVER_SECRET", "ca775a0c26c9e9227431b06e5395ba9a422e18dd1b41aaa6")
    print("set GAME_SERVER_SECRET from known game secret")

setk("VOA_ALLOW_INSECURE_PUBLIC_HTTP", "true")
setk("LIVEKIT_URL", "ws://178.156.158.116:7880")
setk("LIVEKIT_API_KEY", """$API_KEY""")
setk("LIVEKIT_API_SECRET", """$API_SECRET""")
setk("LIVEKIT_ROOM", "voa-main")
setk("LIVEKIT_TOKEN_TTL_SEC", "7200")

out = []
seen = set()
for t, x in order:
    if t == "raw":
        out.append(x)
    else:
        if x in seen:
            continue
        seen.add(x)
        out.append(f"{x}={kv[x]}")
for k, v in kv.items():
    if k not in seen:
        out.append(f"{k}={v}")
p.write_text("\n".join(out) + "\n")
print("wrote", p)
PY

# Ensure voice.js is present
test -f /home/skymp/voa-platform/services/api/dist/voice.js
test -f /home/skymp/voa-platform/services/api/dist/routes.js

# Restart API
cd /home/skymp/voa-platform/services/api
pm2 restart voa-api
sleep 3
pm2 list
curl -sS http://127.0.0.1:3100/health || true
echo
curl -sS http://127.0.0.1:3100/v1/voice/config || true
echo

# Restart game server to load voice snippet
pm2 restart voa-server
sleep 4
pm2 list
grep -E 'VOA-voice|voice snippet|snippet Chakra' /root/.pm2/logs/voa-server-out.log | tail -20 || true
tail -15 /root/.pm2/logs/voa-api-error.log || true
tail -10 /root/.pm2/logs/voa-api-out.log || true

echo "=== deploy-voice done ==="
