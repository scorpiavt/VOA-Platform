import json
d = json.load(open("/home/skymp/voa-server/world/changeForms/0.json"))
print(json.dumps(d, indent=2)[:5000])
print("--- keys ---", sorted(d.keys()))
