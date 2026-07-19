#!/usr/bin/env python3
from pathlib import Path

roots = [
    Path("/home/skymp/voa-server/gamemode/addons"),
    Path("/home/skymp/voa-server"),
]
for root in roots:
    if not root.exists():
        continue
    for p in root.glob("*.js"):
        if "node_modules" in str(p) or p.name.startswith("."):
            continue
        # only strip active VOA addons / snippets, not huge redhouse archive
        if p.name in ("gamemode.redhouse.js", "gamemode.with-console.js"):
            continue
        b = p.read_bytes()
        n = sum(1 for c in b if c > 127)
        if n:
            p.write_bytes(bytes((c if c < 128 else 63) for c in b))
            print("stripped", p, n)
        else:
            print("ok", p.name)
