#!/usr/bin/env python3
from pathlib import Path

p = Path("/home/skymp/voa-server/dist_back/index.js")
t = p.read_text(encoding="utf-8")
sn = "gamemode.voa-player-only-snippet.js"
if sn in t:
    print("already patched")
else:
    needle = '"gamemode.voa-chat-snippet.js",'
    insert = (
        '"gamemode.voa-chat-snippet.js",\n'
        '                    "gamemode.voa-player-only-snippet.js",'
    )
    if needle not in t:
        needle = "'gamemode.voa-chat-snippet.js',"
        insert = (
            "'gamemode.voa-chat-snippet.js',\n"
            "                    'gamemode.voa-player-only-snippet.js',"
        )
    if needle not in t:
        raise SystemExit("chat snippet line not found in index.js")
    p.write_text(t.replace(needle, insert, 1), encoding="utf-8")
    print("patched OK")

# show snippetNames block
text = p.read_text(encoding="utf-8")
for i, line in enumerate(text.splitlines(), 1):
    if "snippetNames" in line or "voa-" in line and "snippet" in line or "voa-pvp" in line:
        if "snippet" in line or "voa-pvp" in line or "snippetNames" in line:
            print(f"{i}: {line.strip()[:100]}")
