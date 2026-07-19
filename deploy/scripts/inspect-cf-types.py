from pathlib import Path
import json
from collections import Counter
cf = Path("/home/skymp/voa-server/world/changeForms")
types = Counter()
bases = Counter()
samples = []
players = []
for p in cf.iterdir():
    if not p.suffix == ".json":
        continue
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        types["parse_err"] += 1
        continue
    # common keys: formDesc, type, baseDesc, appearance, isHarvested, etc
    t = d.get("type") or d.get("formType") or d.get("recType") or "?"
    types[str(t)] += 1
    bd = d.get("baseDesc") or d.get("baseId") or ""
    if d.get("appearance") or d.get("isPlayerCharacter") or p.name in ("0.json","1.json","2.json","3.json"):
        players.append((p.name, list(d.keys())[:12], d.get("baseDesc"), bool(d.get("appearance"))))
    if len(samples) < 5 and p.name not in ("0.json","1.json","2.json","3.json"):
        samples.append((p.name, list(d.keys()), d.get("baseDesc"), d.get("type"), d.get("formDesc"), d.get("worldOrCellDesc")))

print("TYPES", types.most_common(20))
print("PLAYERS", players)
print("SAMPLES")
for s in samples:
    print(s)
# count files matching *esm*
esm = [p for p in cf.iterdir() if "_Skyrim.esm" in p.name or "_Update" in p.name or "Dawnguard" in p.name or "Dragonborn" in p.name or "Hearth" in p.name]
print("esm-named", len(esm))
print("player-named", [p.name for p in cf.iterdir() if p.name in ("0.json","1.json","2.json","3.json") or p.name.startswith("ff")])
# keys of 0.json
d0=json.loads((cf/"0.json").read_text())
print("0 keys", sorted(d0.keys()))
print("0 has appearance", "appearance" in d0, "profileId", d0.get("profileId"), "isDisabled", d0.get("isDisabled"))
