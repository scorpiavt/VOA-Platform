#!/usr/bin/env python3
import json, os, glob

cf_dir = "/home/skymp/voa-server/world/changeForms"
print("files:", os.listdir(cf_dir) if os.path.isdir(cf_dir) else "missing")
for path in sorted(glob.glob(cf_dir + "/*.json")):
    try:
        d = json.load(open(path))
    except Exception as e:
        print(path, "ERR", e)
        continue
    # Find player-like forms (profileId or isRaceMenuOpen or high form id)
    keys = list(d.keys())
    interesting = {}
    for k in (
        "profileId",
        "isRaceMenuOpen",
        "appearance",
        "equipment",
        "healthPercentage",
        "formDesc",
        "baseDesc",
        "recType",
        "refrId",
        "idx",
    ):
        if k in d:
            v = d[k]
            s = json.dumps(v) if not isinstance(v, (str, int, float, bool, type(None))) else v
            interesting[k] = str(s)[:180]
    # also nested changeForm style
    if "type" in d:
        interesting["type"] = d["type"]
    if interesting:
        print("---", os.path.basename(path), "---")
        for k, v in interesting.items():
            print(f"  {k}: {v}")
    elif "0.json" in path:
        print("--- 0.json raw keys ---", keys[:30])
        print(json.dumps(d, indent=2)[:1500])
