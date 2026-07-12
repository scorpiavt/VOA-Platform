#!/bin/bash
set -e
cd /home/skymp/voa-server

python3 <<'PY'
from pathlib import Path
import re
p = Path("dist_back/index.js")
t = p.read_text(encoding="utf-8")
# Remove any second-pass that still evals voa-downed separately
t2, n = re.subn(
    r"// VOA second pass: downed only[\s\S]*?catch \(e\) \{ log\(\"VOA: second pass failed \" \+ e\); \}\s*",
    "                // VOA: second pass off — downed merged into gamemode.js\n",
    t,
    count=1,
)
if n == 0:
    t2, n = re.subn(
        r"// VOA: second pass DISABLED[\s\S]*?\n",
        "                // VOA: second pass off — downed merged into gamemode.js\n",
        t,
        count=1,
    )
# Also strip leftover runGamemodeWithVm for voa-downed if present
t2 = t2.replace(
    'runGamemodeWithVm(voaAddon, server);\n                        log("VOA: executed voa-downed-addon.js (second pass)");',
    '/* downed merged into gamemode.js */',
)
p.write_text(t2, encoding="utf-8")
print("index second-pass cleaned, n=", n)
print("still loads addon separately?", "executed voa-downed-addon" in p.read_text())
PY

# Single Chakra eval: stock gamemode + downed addon
cp -a gamemode.stock.js gamemode.base.stock.js
cat gamemode.stock.js voa-downed-addon.js > gamemode.js
chown skymp:skymp gamemode.js
echo "gamemode.js bytes: $(wc -c < gamemode.js)"

pm2 delete voa-server 2>/dev/null || true
sleep 1
timeout 18 bash start.sh > /tmp/voa-merge.log 2>&1 || echo "manual_exit=$?"
echo "=== manual log ==="
tail -40 /tmp/voa-merge.log

pm2 start start.sh --name voa-server --cwd /home/skymp/voa-server
pm2 save
sleep 18
pm2 list
ss -ulnp | grep 10000 || echo "no-udp"
ss -tlnp | grep 10001 || echo "no-tcp"
echo "=== out ==="
tail -20 /root/.pm2/logs/voa-server-out.log
