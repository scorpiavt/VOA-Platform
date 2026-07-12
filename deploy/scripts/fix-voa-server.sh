#!/bin/bash
set -e
RUNTIME=/home/skymp/voa-server
cd "$RUNTIME"

echo "=== backup world if present ==="
if [ -d world ]; then
  bak="world.bak.$(date +%Y%m%d%H%M%S)"
  mv world "$bak"
  echo "moved world -> $bak"
fi
mkdir -p world
chown -R skymp:skymp world || true

echo "=== disable papyrus hot reload ==="
python3 - <<'PY'
import json
p="/home/skymp/voa-server/server-settings.json"
d=json.load(open(p))
d["isPapyrusHotReloadEnabled"]=False
# keep offlineMode
open(p,"w").write(json.dumps(d, indent=2)+"\n")
print(open(p).read())
PY

echo "=== ensure Chakra lib in runtime ==="
CHAKRA_SRC=/home/skymp/red-house-public/skymp/build/vcpkg_installed/x64-linux/bin/libChakraCore.so
if [ -f "$CHAKRA_SRC" ] && [ ! -f "$RUNTIME/libChakraCore.so" ]; then
  cp "$CHAKRA_SRC" "$RUNTIME/libChakraCore.so"
fi
ls -la "$RUNTIME/libChakraCore.so" || true

echo "=== rewrite start.sh ==="
cat > "$RUNTIME/start.sh" <<'EOF'
#!/bin/bash
cd /home/skymp/voa-server
export LD_LIBRARY_PATH=/home/skymp/voa-server:/home/skymp/red-house-public/skymp/build/vcpkg_installed/x64-linux/bin:${LD_LIBRARY_PATH}
export NODE_PATH=/home/skymp/red-house-public/skymp/skymp5-server/node_modules
exec node dist_back/index.js
EOF
chmod +x "$RUNTIME/start.sh"

echo "=== ensure dist_front client matches installed path ClientVerify uses ==="
# ClientVerify uses ./dist_front/skymp5-client.js from cwd
ls -la dist_front/skymp5-client.js

echo "=== trial run 20s ==="
timeout 20 bash start.sh > /tmp/voa-trial.log 2>&1 || true
echo "trial exit (124=timeout/success-running): $?"
cat /tmp/voa-trial.log
echo "=== ports during/after trial ==="
ss -ulnp | grep 10000 || echo "no udp 10000"
ss -tlnp | grep 10001 || echo "no tcp 10001"
