#!/usr/bin/env python3
import json
from pathlib import Path

found = []
roots = [
    Path("/home/skymp/voa-server"),
    Path("/home/skymp/voa-platform-data"),
]
for root in roots:
    if not root.exists():
        continue
    for bak in root.rglob("*.json"):
        s = str(bak)
        if "changeForm" not in s and "/world" not in s and "character" not in s.lower():
            continue
        try:
            st = bak.stat()
        except Exception:
            continue
        if st.st_size > 800000 or st.st_size < 200:
            continue
        try:
            t = bak.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "profileId" not in t and "profile_id" not in t and "Paarthurnax" not in t:
            continue
        try:
            d = json.loads(t)
        except Exception:
            continue
        pid = d.get("profileId", d.get("profile_id"))
        look = d.get("lookDump") or d.get("look") or d.get("appearance")
        name = None
        if isinstance(look, dict):
            name = look.get("name")
        elif isinstance(look, str):
            try:
                name = json.loads(look).get("name")
            except Exception:
                name = None
        if name is None:
            name = d.get("name")
        if pid == 1000 or (name and "Paar" in str(name)) or "Paarthurnax" in t:
            found.append(
                {
                    "mtime": st.st_mtime,
                    "size": st.st_size,
                    "pid": pid,
                    "name": name,
                    "formDesc": d.get("formDesc"),
                    "raceMenu": d.get("isRaceMenuOpen"),
                    "path": s,
                    "hasLook": bool(look),
                }
            )

found.sort(key=lambda x: -x["mtime"])
print("found", len(found))
for f in found[:50]:
    print(
        f["mtime"],
        f["size"],
        "pid",
        f["pid"],
        "name",
        f["name"],
        "form",
        f["formDesc"],
        "race",
        f["raceMenu"],
        "look",
        f["hasLook"],
        f["path"][-100:],
    )
