from pathlib import Path
import json
from collections import Counter
cf = Path("/home/skymp/voa-server/world/changeForms")
recTypes = Counter()
profileIds = Counter()
for p in cf.iterdir():
    if p.suffix != ".json":
        continue
    d = json.loads(p.read_text(encoding="utf-8"))
    recTypes[str(d.get("recType"))] += 1
    pid = d.get("profileId")
    if pid is not None:
        profileIds[str(pid)] += 1
print("recType", recTypes)
print("profileId counts", profileIds)
# any with profileId not null that is not 0-3?
for p in cf.iterdir():
    if p.suffix != ".json":
        continue
    d = json.loads(p.read_text(encoding="utf-8"))
    if d.get("profileId") not in (None, 0, -1) and p.name not in ("0.json","1.json","2.json","3.json"):
        print("extra profile", p.name, d.get("profileId"), d.get("formDesc"), d.get("recType"))
# count isDisabled true among esm
dis=0
for p in cf.iterdir():
    if "_esm" in p.name or "Skyrim.esm" in p.name:
        d=json.loads(p.read_text())
        if d.get("isDisabled"):
            dis += 1
print("esm disabled", dis)
