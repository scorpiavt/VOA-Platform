#!/usr/bin/env python3
"""Player-only world: remove non-player changeForms so server never streams NPCs."""
from pathlib import Path
import json
import shutil
import time

WORLD = Path("/home/skymp/voa-server/world/changeForms")
assert WORLD.is_dir(), WORLD

ts = int(time.time())
bak = Path(f"/home/skymp/voa-server/world/changeForms_bak_vanilla_{ts}")
bak.mkdir(parents=True, exist_ok=True)

keep = []
move = []
for p in sorted(WORLD.iterdir()):
    if p.suffix != ".json":
        continue
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print("SKIP parse", p.name, e)
        continue
    pid = d.get("profileId", -1)
    # Real player characters only (launcher slots). Vanilla world actors use -1.
    if isinstance(pid, int) and pid >= 0:
        keep.append((p.name, pid, d.get("formDesc"), d.get("recType")))
    else:
        move.append(p)

for p in move:
    dest = bak / p.name
    shutil.move(str(p), str(dest))

print("kept", len(keep))
for row in keep:
    print("  KEEP", row)
print("moved", len(move), "->", bak)
print("remaining", len(list(WORLD.glob("*.json"))))
