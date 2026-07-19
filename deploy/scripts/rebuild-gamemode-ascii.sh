#!/bin/bash
set -e
cd /home/skymp/voa-server
STOCK=gamemode.js.stockbak
if [ ! -f "$STOCK" ]; then STOCK=gamemode.stock.js; fi
if [ ! -f "$STOCK" ]; then STOCK=gamemode.js; fi

# ASCII-sanitize snippets
python3 - <<'PY'
from pathlib import Path
for name in [
  "gamemode.voa-console-snippet.js",
  "gamemode.voa-interact-snippet.js",
  "gamemode.voa-chat-snippet.js",
]:
  p = Path(name)
  if not p.exists():
    print("missing", name); continue
  raw = p.read_bytes()
  # decode as utf-8 ignoring errors, then strip non-ascii
  text = raw.decode("utf-8", "ignore")
  ascii_text = "".join(ch if ord(ch) < 128 else "?" for ch in text)
  # fix any smart punctuation leftovers already stripped
  p.write_bytes(ascii_text.encode("ascii", "ignore"))
  bad = sum(1 for x in p.read_bytes() if x > 127)
  print(name, "bytes", p.stat().st_size, "nonascii", bad)
PY

python3 - <<'PY'
from pathlib import Path
import json
stock = Path("gamemode.js.stockbak")
if not stock.exists():
  stock = Path("gamemode.stock.js")
if not stock.exists():
  stock = Path("gamemode.js")
parts = [stock.read_text(encoding="utf-8", errors="ignore")]
for name in [
  "gamemode.voa-console-snippet.js",
  "gamemode.voa-interact-snippet.js",
  "gamemode.voa-chat-snippet.js",
]:
  p = Path(name)
  if p.exists():
    parts.append("\n" + p.read_text(encoding="utf-8", errors="ignore") + "\n")
    print("append", name, p.stat().st_size)
  else:
    print("SKIP missing", name)
out = "\n".join(parts)
# force pure ascii for Chakra
out_ascii = "".join(ch if ord(ch) < 128 else " " for ch in out)
Path("gamemode.with-console.js").write_bytes(out_ascii.encode("ascii"))
print("wrote gamemode.with-console.js", len(out_ascii), "nonascii", sum(1 for c in out_ascii if ord(c)>127))
# Point settings at with-console (NOT node bootstrap - Chakra cannot require)
ss = Path("server-settings.json")
d = json.loads(ss.read_text())
old = d.get("gamemodePath")
d["gamemodePath"] = "gamemode.with-console.js"
ss.write_text(json.dumps(d, indent=2) + "\n")
print("gamemodePath", old, "->", d["gamemodePath"])
PY

# syntax check snippets with node (not the whole parcel gamemode)
node --check gamemode.voa-console-snippet.js
node --check gamemode.voa-interact-snippet.js
node --check gamemode.voa-chat-snippet.js
echo "snippet syntax OK"
pm2 restart voa-server
sleep 3
pm2 list
tail -n 40 /root/.pm2/logs/voa-server-out.log