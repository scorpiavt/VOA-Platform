#!/usr/bin/env python3
"""Load VOA Chakra snippets separately (appending to parcel gamemode breaks require)."""
from pathlib import Path
import json

index_path = Path("/home/skymp/voa-server/dist_back/index.js")
src = index_path.read_text(encoding="utf-8")

marker_start = "const pvpAddon = path.join(path.dirname(require.resolve(module)), \"voa-pvp-addon.js\");"
if marker_start not in src:
    # maybe already patched
    if "gamemode.voa-console-snippet.js" in src:
        print("already patched")
    else:
        raise SystemExit("pvp addon block not found and not already patched")
else:
    old_block = """            try {
                const pvpAddon = path.join(path.dirname(require.resolve(module)), "voa-pvp-addon.js");
                if (fs.existsSync(pvpAddon)) {
                    const pvpSrc = fs.readFileSync(pvpAddon, "utf8");
                    server.executeJavaScriptOnChakra(pvpSrc);
                    log("VOA: pvp addon Chakra OK");
                }
            } catch (ePvp2) {
                log("VOA: pvp addon Chakra failed: " + ePvp2);
            }"""
    new_block = r"""            try {
                const gmDir = path.dirname(require.resolve(module));
                const snippetNames = [
                    "gamemode.voa-console-snippet.js",
                    "gamemode.voa-interact-snippet.js",
                    "gamemode.voa-chat-snippet.js",
                    "voa-pvp-addon.js",
                ];
                for (const sn of snippetNames) {
                    const snPath = path.join(gmDir, sn);
                    if (!fs.existsSync(snPath)) {
                        log("VOA: snippet missing " + sn);
                        continue;
                    }
                    let snSrc = fs.readFileSync(snPath, "utf8");
                    snSrc = snSrc.replace(/[^\x00-\x7F]/g, "?");
                    try {
                        server.executeJavaScriptOnChakra(snSrc);
                        log("VOA: snippet Chakra OK " + sn);
                    } catch (eSn) {
                        log("VOA: snippet Chakra failed " + sn + ": " + eSn);
                    }
                }
            } catch (ePvp2) {
                log("VOA: snippet load failed: " + ePvp2);
            }"""
    if old_block not in src:
        raise SystemExit("exact old block not found")
    index_path.write_text(src.replace(old_block, new_block, 1), encoding="utf-8")
    print("patched index.js snippet loader")

# Force stock gamemode path (no concat)
ss = Path("/home/skymp/voa-server/server-settings.json")
d = json.loads(ss.read_text(encoding="utf-8"))
for cand in ["gamemode.js.stockbak", "gamemode.stock.js", "gamemode.js"]:
    if Path("/home/skymp/voa-server") / cand.exists() if False else Path(f"/home/skymp/voa-server/{cand}").exists():
        d["gamemodePath"] = cand
        break
ss.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")
print("gamemodePath=", d.get("gamemodePath"))

# Sanity: snippets pure ascii
for name in [
    "gamemode.voa-console-snippet.js",
    "gamemode.voa-interact-snippet.js",
    "gamemode.voa-chat-snippet.js",
]:
    p = Path("/home/skymp/voa-server") / name
    if not p.exists():
        print("MISSING", name)
        continue
    raw = p.read_bytes()
    if any(b > 127 for b in raw):
        text = raw.decode("utf-8", "ignore")
        ascii_text = "".join(ch if ord(ch) < 128 else "?" for ch in text)
        p.write_bytes(ascii_text.encode("ascii"))
        print("sanitized", name)
    else:
        print("ok ascii", name, len(raw))
