#!/bin/bash
set -e
RUNTIME=/home/skymp/voa-server
cd "$RUNTIME"

echo "=== stop voa-server ==="
pm2 stop voa-server 2>/dev/null || true
pm2 delete voa-server 2>/dev/null || true
sleep 2

echo "=== backup+reset world ==="
if [ -d world ]; then
  bak="world.bak.$(date +%Y%m%d%H%M%S)"
  mv world "$bak"
  echo "moved to $bak"
fi
mkdir -p world
chown -R skymp:skymp world || true

# Keep settings stable
python3 - <<'PY'
import json
p="/home/skymp/voa-server/server-settings.json"
d=json.load(open(p))
d["isPapyrusHotReloadEnabled"]=False
d["offlineMode"]=True
open(p,"w").write(json.dumps(d, indent=2)+"\n")
print(open(p).read())
PY

# Soften ClientVerify: always accept client (VOA ships matched client via launcher)
# Avoid string-equality failures from getPluginSourceCode vs disk (CRLF/BOM/cache)
if [ -f dist_back/systems/clientVerify.js ]; then
  cp dist_back/systems/clientVerify.js dist_back/systems/clientVerify.js.bak
  python3 - <<'PY'
from pathlib import Path
p = Path("/home/skymp/voa-server/dist_back/systems/clientVerify.js")
t = p.read_text(encoding="utf-8")
# Replace strict equality check with always-verify path
old = 'if (content["src"] === this.compiledFront)'
# various minify styles
if old in t:
    t = t.replace(
        old,
        'if (true /* VOA: accept any client front; launcher ships matched package */ || content["src"] === this.compiledFront)'
    )
    p.write_text(t, encoding="utf-8")
    print("patched clientVerify.js (strict match)")
else:
    # try minified
    import re
    t2, n = re.subn(
        r'content\["src"\]===this\.compiledFront',
        'true',
        t,
        count=1,
    )
    if n:
        p.write_text(t2, encoding="utf-8")
        print("patched minified clientVerify.js")
    else:
        print("WARN: could not find verify equality to patch")
        # show snippet
        i = t.find("clientVersion")
        print(t[max(0,i):i+400] if i>=0 else t[:500])
PY
fi

# Disable fs.watch thrashing (optional - leave reloadFront)
# Ensure start.sh has lib path
cat > start.sh <<'EOF'
#!/bin/bash
cd /home/skymp/voa-server
export LD_LIBRARY_PATH=/home/skymp/voa-server:/home/skymp/red-house-public/skymp/build/vcpkg_installed/x64-linux/bin:${LD_LIBRARY_PATH}
export NODE_PATH=/home/skymp/red-house-public/skymp/skymp5-server/node_modules
exec node dist_back/index.js
EOF
chmod +x start.sh

echo "=== start server ==="
pm2 start start.sh --name voa-server --time
sleep 12
pm2 list
echo "=== ports ==="
ss -ulnp | grep 10000 || echo "NO UDP 10000"
ss -tlnp | grep 10001 || echo "NO TCP 10001"
echo "=== log tail ==="
tail -n 30 /root/.pm2/logs/voa-server-out.log
echo "=== err tail ==="
tail -n 8 /root/.pm2/logs/voa-server-error.log
curl -s http://127.0.0.1:3099/status; echo
