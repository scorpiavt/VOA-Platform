#!/usr/bin/env python3
import sqlite3
import time
import urllib.request
from datetime import datetime, timedelta, timezone

db = "/home/skymp/voa-platform-data/voa.db"
con = sqlite3.connect(db)
row = con.execute("SELECT id, profile_id FROM users LIMIT 1").fetchone()
if not row:
    now = datetime.now(timezone.utc).isoformat()
    con.execute(
        "INSERT INTO users (profile_id, discord_id, username, discriminator, avatar, banned, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (900001, "test-master-smoke", "MasterSmoke", "0000", None, 0, now, now),
    )
    con.commit()
    row = con.execute(
        "SELECT id, profile_id FROM users WHERE discord_id=?",
        ("test-master-smoke",),
    ).fetchone()

uid, pid = row
session = "smoke-session-" + str(int(time.time()))
exp = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
now = datetime.now(timezone.utc).isoformat()
con.execute(
    "INSERT INTO game_sessions (session_id, user_id, profile_id, expires_at, created_at) VALUES (?,?,?,?,?)",
    (session, uid, pid, exp, now),
)
con.commit()

url = f"http://127.0.0.1:3100/api/servers/178.156.158.116:10000/sessions/{session}"
print("lookup", url)
with urllib.request.urlopen(url, timeout=5) as r:
    body = r.read().decode()
    print("status", r.status)
    print("body", body)

con.execute("DELETE FROM game_sessions WHERE session_id=?", (session,))
con.commit()
print("cleaned", session)
