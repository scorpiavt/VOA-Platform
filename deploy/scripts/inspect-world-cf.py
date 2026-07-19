from pathlib import Path
import json, os

cf = Path("/home/skymp/voa-server/world/changeForms")
files = list(cf.iterdir()) if cf.exists() else []
print("changeForm count", len(files))
# sample names
for p in sorted(files, key=lambda x: x.name)[:30]:
    print(" ", p.name, p.stat().st_size)
print("...")
for p in sorted(files, key=lambda x: x.name)[-15:]:
    print(" ", p.name, p.stat().st_size)

# count by form id high bits
players = []
vanilla = []
ff = []
for p in files:
    name = p.stem  # often hex form id
    try:
        # filenames like 0xff000000.json or ff000000
        h = name.replace("0x","").replace("0X","")
        if not all(c in "0123456789abcdefABCDEF" for c in h):
            continue
        n = int(h, 16)
        if n >= 0xFF000000:
            ff.append((n, p.name, p.stat().st_size))
        else:
            vanilla.append((n, p.name, p.stat().st_size))
    except Exception as e:
        pass
print("ff* forms", len(ff))
print("vanilla-ish forms", len(vanilla))
print("sample ff", ff[:10])
print("sample vanilla", vanilla[:15])

# peek one vanilla and one player
for group, label in ((ff, "player"), (vanilla, "vanilla")):
    if not group: continue
    p = cf / group[0][1]
    raw = p.read_bytes()[:400]
    print(label, "file", p.name, "head", raw[:200])
    try:
        t = p.read_text(encoding="utf-8", errors="replace")[:500]
        print(label, "text", t[:300])
    except Exception as e:
        print(label, e)

ss = Path("/home/skymp/voa-server/server-settings.json")
print("settings", ss.read_text()[:2500])
