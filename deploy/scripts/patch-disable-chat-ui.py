from pathlib import Path

p = Path("/home/skymp/voa-server/dist_back/index.js")
t = p.read_text(encoding="utf-8")
bak = Path(str(p) + ".bak.uichat")
if not bak.exists():
    bak.write_text(t, encoding="utf-8")

if "VOA: chat UI websocket disabled" not in t:
    t2 = t.replace(
        "chat.main(server);",
        'console.log("VOA: chat UI websocket disabled for stability"); /* chat.main(server); */',
    )
    t2 = t2.replace(
        "chat.attachMpApi((formId, msg) => server.onUiEvent(formId, msg));",
        "chat.attachMpApi((formId, msg) => { /* VOA: skip Chakra onUiEvent crash 0x10001 */ });",
    )
    t2 = t2.replace(
        "chat.sendMsg(server, formId, message);",
        'try { chat.sendMsg(server, formId, message); } catch (eSend) { console.error("VOA sendUiMessage", eSend); }',
    )
    if t2 == t:
        raise SystemExit("FAIL: expected strings not found in index.js")
    p.write_text(t2, encoding="utf-8")
    print("index.js patched OK")
else:
    print("already patched")

for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
    if "chat." in line or "VOA: chat" in line or "onUiEvent" in line:
        print(f"{i}: {line}")
