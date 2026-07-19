#!/usr/bin/env python3
"""Inspect candidate p1000 changeForms and restore best look-bearing one."""
import json
import shutil
import time
from pathlib import Path

CANDIDATES = [
    Path("/home/skymp/voa-server/world/changeForms_bak_auto/0.json"),
    Path("/home/skymp/voa-server/world.bak.crashloop.20260715024937/changeForms/0.json"),
    Path("/home/skymp/voa-server/world.bak.crash./changeForms/0.json"),
]
# also scan bak dirs for profileId 1000 with look
for bak in Path("/home/skymp/voa-server/world").glob("changeForms*"):
    if bak.is_dir():
        for p in bak.glob("*.json"):
            CANDIDATES.append(p)
for bak in Path("/home/skymp/voa-server").glob("world.bak*"):
    cf = bak / "changeForms"
    if cf.is_dir():
        for p in cf.glob("*.json"):
            CANDIDATES.append(p)

seen = set()
best = None
print("=== candidates with profileId 1000 ===")
for p in CANDIDATES:
    try:
        rp = str(p.resolve())
    except Exception:
        rp = str(p)
    if rp in seen or not p.is_file():
        continue
    seen.add(rp)
    try:
        d = json.loads(p.read_text(encoding="utf-8", errors="ignore"))
    except Exception as e:
        continue
    if d.get("profileId") != 1000:
        continue
    look = d.get("lookDump")
    if isinstance(look, str):
        try:
            look = json.loads(look)
        except Exception:
            look = None
    name = look.get("name") if isinstance(look, dict) else None
    has_look = isinstance(look, dict) and bool(look.get("raceId") or look.get("name") or look.get("headpartIds") or look.get("options"))
    inv = d.get("inv") if isinstance(d.get("inv"), dict) else {}
    n_inv = len(inv.get("entries") or [])
    score = 0
    if has_look:
        score += 100
    if name:
        score += 10
    if not d.get("isRaceMenuOpen"):
        score += 5
    score += min(n_inv, 20)
    score += min(p.stat().st_size // 500, 20)
    print(
        f"score={score} name={name!r} raceMenu={d.get('isRaceMenuOpen')} "
        f"inv={n_inv} size={p.stat().st_size} form={d.get('formDesc')} path={p}"
    )
    if best is None or score > best[0]:
        best = (score, p, d, name, has_look)

if not best:
    print("NO p1000 CF found to restore")
    raise SystemExit(1)

score, path, d, name, has_look = best
print("=== BEST ===", score, name, path)

# Normalize for restore
d["profileId"] = 1000
d["formDesc"] = "0" if d.get("formDesc") in (None, "0", 0, "ff000000") else d.get("formDesc")
# formDesc for first actor is often "0" mapping to ff000000
if str(d.get("formDesc")) in ("0", "ff000000", "FF000000"):
    d["formDesc"] = "0"
d["isRaceMenuOpen"] = False if has_look else bool(d.get("isRaceMenuOpen", True))
# ensure lookDump is object (file format often stores object)
look = d.get("lookDump")
if isinstance(look, str):
    try:
        d["lookDump"] = json.loads(look)
    except Exception:
        pass

dest_dir = Path("/home/skymp/voa-server/world/changeForms")
dest_dir.mkdir(parents=True, exist_ok=True)
# backup current live if any
for live in dest_dir.glob("*.json"):
    try:
        ld = json.loads(live.read_text(encoding="utf-8", errors="ignore"))
        if ld.get("profileId") == 1000:
            bakp = dest_dir.parent / f"changeForms_bak_pre_restore_{int(time.time())}"
            bakp.mkdir(exist_ok=True)
            shutil.copy2(live, bakp / live.name)
            print("backed live", live, "->", bakp)
    except Exception:
        pass

# Write as 0.json (formDesc 0 / first player form)
out = dest_dir / "0.json"
# if 0.json exists and is not p1000, keep formDesc unique - use 0.json for p1000
text = json.dumps(d, indent=2, ensure_ascii=False) + "\n"
out.write_text(text, encoding="utf-8")
print("WROTE", out, "bytes", out.stat().st_size, "name", name, "raceMenu", d.get("isRaceMenuOpen"))
print("RESTART voa-server required to load CF")
