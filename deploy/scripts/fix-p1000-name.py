#!/usr/bin/env python3
import json
from pathlib import Path

p = Path("/home/skymp/voa-server/world/changeForms/0.json")
d = json.loads(p.read_text(encoding="utf-8"))
look = d.get("lookDump")
if isinstance(look, str):
    look = json.loads(look)
if not isinstance(look, dict):
    look = {}
print("before name", look.get("name"), "raceMenu", d.get("isRaceMenuOpen"), "pid", d.get("profileId"))
# Keep appearance; set the known VOA display name used in prior sessions
look["name"] = "Paarthurnax"
d["lookDump"] = look
d["isRaceMenuOpen"] = False
d["profileId"] = 1000
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("after name", look.get("name"), "bytes", p.stat().st_size)
