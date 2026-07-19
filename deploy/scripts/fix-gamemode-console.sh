#!/bin/bash
set -e
cd /home/skymp/voa-server

# Revert to stock gamemode bundle (Chakra has no Node require)
python3 - <<'PY'
import json
p="server-settings.json"
with open(p) as f: d=json.load(f)
d["gamemodePath"]="gamemode.js"
with open(p,"w") as f: json.dump(d,f,indent=2)
print("gamemodePath=", d["gamemodePath"])
PY

# Append pure Chakra console staff handler to a side file that scamp may not load.
# Instead: inject via Node system at startup if possible.
# Create systems patch file loaded by dist_back if present.
mkdir -p dist_back/systems

# Pure-Chakra snippet (no require) — inject by prepending to gamemode load via wrapper that only uses global mp after main loads
# Scamp loads gamemode as one script. We'll create gamemode.voa.js that is the stock file + our IIFE appended.
if [ -f gamemode.js ] && [ ! -f gamemode.js.stockbak ]; then
  cp -a gamemode.js gamemode.js.stockbak
fi

# Build gamemode with console lock appended (pure Chakra, staff cache updated by... we can't HTTP)
# So staff check: property on actor set from Node spawn system
# For now: client-side lock is primary. Server CustomEvent handler allows only if mp.get(actor,"voaStaff")===true

python3 - <<'PY'
append = r'''
/* === VOA console staff lock (Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;
    mp["_voaConsole"] = function (senderFormId, profileId, commandName, argsJson) {
      try {
        var actorId = +senderFormId || 0;
        if (!actorId) return;
        var allowed = false;
        try { allowed = mp.get(actorId, "voaStaff") === true; } catch (e0) { allowed = false; }
        if (!allowed) {
          console.log("[VOA-console] DENIED form=" + actorId.toString(16) + " p=" + profileId);
          return;
        }
        var cmd = String(commandName || "").toLowerCase();
        var args = [];
        try { args = typeof argsJson === "string" ? JSON.parse(argsJson) : (argsJson || []); } catch (e1) { args = []; }
        console.log("[VOA-console] ALLOW " + cmd + " " + JSON.stringify(args));
        if (cmd === "additem") {
          var itemId = +args[1];
          var count = +args[2] || 1;
          var inv = { entries: [] };
          try { inv = mp.get(actorId, "inventory") || { entries: [] }; } catch (e2) {}
          if (!inv.entries) inv.entries = [];
          var found = false;
          for (var i = 0; i < inv.entries.length; i++) {
            if (+inv.entries[i].baseId === itemId) {
              inv.entries[i].count = (+inv.entries[i].count || 0) + count;
              found = true;
              break;
            }
          }
          if (!found) inv.entries.push({ baseId: itemId, count: count });
          try { mp.set(actorId, "inventory", inv); } catch (e3) { console.log("[VOA-console] set inv fail " + e3); }
        }
      } catch (eAll) {
        console.log("[VOA-console] " + eAll);
      }
    };
    console.log("[VOA-console] Chakra handler ready (voaStaff property)");
  } catch (e) {
    console.log("[VOA-console] init fail " + e);
  }
})();
'''
# Append only once
src = open("gamemode.js.stockbak").read() if __import__("os").path.exists("gamemode.js.stockbak") else open("gamemode.js").read()
if "VOA-console] Chakra handler" not in src and "VOA console staff lock" not in src:
    # Don't append to minified parcel if huge - write separate load path
    open("gamemode.voa-console-snippet.js","w").write(append)
    # Concatenate for gamemode.with-console.js
    open("gamemode.with-console.js","w").write(src + "\n" + append)
    import json
    d=json.load(open("server-settings.json"))
    d["gamemodePath"]="gamemode.with-console.js"
    json.dump(d, open("server-settings.json","w"), indent=2)
    print("wrote gamemode.with-console.js and pointed server-settings")
else:
    print("snippet already present or using with-console")
    import json, os
    if os.path.exists("gamemode.with-console.js"):
        d=json.load(open("server-settings.json"))
        d["gamemodePath"]="gamemode.with-console.js"
        json.dump(d, open("server-settings.json","w"), indent=2)
        print("pointed to with-console")
PY

# Node system to mark staff actors after spawn (uses HTTP)
cat > dist_back/systems/voa-staff-console.js << 'JS'
"use strict";
const http = require("http");
const API = process.env.VOA_API_BASE || "http://127.0.0.1:3100";
const SECRET = process.env.VOA_GAME_SECRET || process.env.GAME_SERVER_SECRET || "";

function isStaff(profileId) {
  return new Promise((resolve) => {
    if (!profileId) return resolve(false);
    const q = `/v1/game/is-staff?profileId=${encodeURIComponent(profileId)}&secret=${encodeURIComponent(SECRET)}`;
    const u = new URL(API + q);
    const req = http.get(
      { hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: 4000 },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(b);
            resolve(!!(j && j.isStaff));
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

class VoaStaffConsole {
  constructor(log) {
    this.log = log;
    this.systemName = "VoaStaffConsole";
  }
  async initAsync(ctx) {
    // After spawnAllowed, mark actor voaStaff for Chakra console handler
    ctx.gm.on("spawnAllowed", (userId, profileId, characterSlot) => {
      setTimeout(() => {
        try {
          const actorId = ctx.svr.getUserActor(userId);
          if (!actorId) return;
          isStaff(profileId).then((ok) => {
            try {
              // Prefer property if scamp supports dynamic props via mp in gamemode
              // Node scamp may expose set via executeJavaScriptOnChakra
              if (typeof ctx.svr.executeJavaScriptOnChakra === "function") {
                const js = `try{if(typeof mp!=="undefined"&&mp){mp.set(${actorId},"voaStaff",${ok?"true":"false"});}}catch(e){}`;
                ctx.svr.executeJavaScriptOnChakra(js);
              }
              this.log(
                "VOA staff console flag p" + profileId + " actor=" + actorId.toString(16) + " staff=" + ok
              );
            } catch (e) {
              this.log("VOA staff flag set fail: " + e);
            }
          });
        } catch (e) {
          this.log("VOA staff spawn hook: " + e);
        }
      }, 1500);
    });
  }
  disconnect() {}
}
exports.VoaStaffConsole = VoaStaffConsole;
JS

# Register system in index if systems list is editable
if [ -f dist_back/index.js ]; then
  if ! grep -q 'voa-staff-console' dist_back/index.js; then
    python3 - <<'PY'
from pathlib import Path
import re
p = Path("dist_back/index.js")
src = p.read_text(encoding="utf-8", errors="replace")
if 'const login_1 = require("./systems/login");' in src and "voa-staff-console" not in src:
    src = src.replace(
        'const login_1 = require("./systems/login");',
        'const login_1 = require("./systems/login");\nconst voa_staff_console_1 = require("./systems/voa-staff-console");',
        1,
    )
m = re.search(r"systems\.push\(([\s\S]*?)\);", src)
if m and "VoaStaffConsole" not in m.group(0):
    block = m.group(1).rstrip()
    if block.endswith(")"):
        block = block + ",\n  new voa_staff_console_1.VoaStaffConsole(log)"
    src = src[: m.start()] + "systems.push(" + block + ");" + src[m.end() :]
    print("wired VoaStaffConsole into systems.push")
p.write_text(src, encoding="utf-8")
PY
  else
    echo "VoaStaffConsole already wired"
  fi
fi

# Load env for pm2
if [ -f /home/skymp/voa-platform/services/api/.env ]; then
  SECRET=$(grep '^GAME_SERVER_SECRET=' /home/skymp/voa-platform/services/api/.env | cut -d= -f2-)
  export VOA_API_BASE=http://127.0.0.1:3100
  export VOA_GAME_SECRET="$SECRET"
  export GAME_SERVER_SECRET="$SECRET"
  # Write ecosystem-style env for pm2
  cat > /home/skymp/voa-server/ecosystem.voa.env.json << JSON
{
  "VOA_API_BASE": "http://127.0.0.1:3100",
  "VOA_GAME_SECRET": "$SECRET",
  "GAME_SERVER_SECRET": "$SECRET"
}
JSON
fi

pm2 restart voa-server --update-env
sleep 4
tail -n 25 /root/.pm2/logs/voa-server-out.log | grep -iE 'VOA|gamemode|Error|staff|console' || tail -n 15 /root/.pm2/logs/voa-server-out.log
echo OK
