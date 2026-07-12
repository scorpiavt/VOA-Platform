#!/bin/bash
set -e
RUNTIME=/home/skymp/voa-server
BUILD=/home/skymp/red-house-public/skymp/build

# --- spawn.js: never re-open race menu when loading existing character ---
python3 <<'PY'
from pathlib import Path
import re
p = Path("/home/skymp/voa-server/dist_back/systems/spawn.js")
t = p.read_text()
pat = r'if \(actorId\) \{\s*this\.log\("Loading character", actorId\.toString\(16\)\);\s*ctx\.svr\.setEnabled\(actorId, true\);\s*ctx\.svr\.setUserActor\(userId, actorId\);\s*\}'
rep = 'if (actorId) { this.log("Loading character", actorId.toString(16), "profile", userProfileId); ctx.svr.setEnabled(actorId, true); ctx.svr.setUserActor(userId, actorId); try { ctx.svr.setRaceMenuOpen(actorId, false); } catch (e) {} }'
t2, n = re.subn(pat, rep, t, count=1)
if n:
    p.write_text(t2)
    print("spawn.js patched ok")
else:
    print("spawn.js pattern not found")
    i = t.find("Loading character")
    print(repr(t[max(0,i-60):i+220]))
PY

# --- rebuild native with OnHit damage ---
echo "=== ninja targets with scamp ==="
(cd "$BUILD" && ninja -t targets 2>/dev/null | grep -i scamp | head -20) || true
(cd "$BUILD" && ninja -t targets 2>/dev/null | grep -i server_guest | head -10) || true

# Preferred: build the node addon target
if [ -f "$BUILD/skymp5-server/scamp_native.node" ] || [ -f "$BUILD/dist/server/scamp_native.node" ]; then
  echo "Existing build outputs present"
fi

# Try common targets
cd "$BUILD"
if ninja -t targets 2>/dev/null | grep -q '^scamp_native.node:'; then
  ninja scamp_native.node
elif ninja -t targets 2>/dev/null | grep -q 'skymp5-server'; then
  ninja skymp5-server
else
  # rebuild server_guest_lib + link node module if listed
  ninja -t targets 2>/dev/null | head -50
  # fallback: full ninja (long)
  echo "Running full ninja (may take a while)..."
  ninja
fi

echo "=== copy scamp_native.node if newer ==="
for cand in \
  "$BUILD/skymp5-server/scamp_native.node" \
  "$BUILD/dist/server/scamp_native.node" \
  "$BUILD/skymp5-server/cpp/scamp_native.node"
do
  if [ -f "$cand" ]; then
    echo "found $cand"
    ls -la "$cand"
    cp -f "$cand" "$RUNTIME/scamp_native.node"
    chown skymp:skymp "$RUNTIME/scamp_native.node"
    ls -la "$RUNTIME/scamp_native.node"
  fi
done

# Ensure OnHit patch still in source (verify)
grep -n "kAssumedBaseHealth" /home/skymp/red-house-public/skymp/skymp5-server/cpp/server_guest_lib/ActionListener.cpp || echo "WARN: OnHit patch missing in source"

# Restart server WITHOUT wiping world
pm2 restart voa-server || pm2 start "$RUNTIME/start.sh" --name voa-server --time
sleep 10
pm2 list
ss -ulnp | grep 10000 || echo NO_UDP
curl -s http://127.0.0.1:3099/status; echo
tail -n 15 /root/.pm2/logs/voa-server-out.log
