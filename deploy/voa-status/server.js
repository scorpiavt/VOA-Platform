/**
 * VOA player-count sidecar (port 3099).
 * Tracks online profiles from voa-server PM2 logs + reconciles with TCP UI peers.
 *
 * Log patterns (skymp / Red House):
 *   "0 logged as 1001"  → userId 0 is profile 1001 (online)
 *   "disconnect 0"      → userId 0 left
 *   "websocket server up" → server (re)started → clear online set
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = Number(process.env.STATUS_PORT || 3099);
const LOG = process.env.VOA_LOG || "/root/.pm2/logs/voa-server-out.log";
const STATE = path.join(__dirname, "state.json");
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 50);
/** Consecutive status polls with log-players > 0 but zero UI TCP peers before treating as ghosts */
const GHOST_TCP_POLLS = Number(process.env.GHOST_TCP_POLLS || 3);

/** profileId strings currently online */
const online = new Set();
/** userId string → profileId string */
const userToProfile = new Map();
/** profileId → { "0": "Name", "1": "Name2" } in-game character names */
const characterNames = {};

let lastLine = 0;
/** How many consecutive empty-TCP observations while log still shows players */
let ghostEmptyTcpStreak = 0;

function loadState() {
  try {
    const j = JSON.parse(fs.readFileSync(STATE, "utf8"));
    if (Array.isArray(j.online)) {
      for (const p of j.online) online.add(String(p));
    }
    if (j.userToProfile && typeof j.userToProfile === "object") {
      for (const [u, p] of Object.entries(j.userToProfile)) {
        userToProfile.set(String(u), String(p));
      }
    }
    if (j.characterNames && typeof j.characterNames === "object") {
      Object.assign(characterNames, j.characterNames);
    }
    lastLine = Number(j.lastLine) || 0;
  } catch {
    /* fresh */
  }
}

function saveState() {
  fs.writeFileSync(
    STATE,
    JSON.stringify(
      {
        online: [...online],
        userToProfile: Object.fromEntries(userToProfile),
        characterNames,
        lastLine,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

function clearOnline(reason) {
  if (online.size === 0 && userToProfile.size === 0) return;
  console.log(
    `[voa-status] clear online (${online.size} profiles) reason=${reason || "unknown"}`
  );
  online.clear();
  userToProfile.clear();
  ghostEmptyTcpStreak = 0;
  saveState();
}

function markOnline(userId, profileId) {
  const u = String(userId);
  const p = String(profileId);
  const prev = userToProfile.get(u);
  if (prev && prev !== p) online.delete(prev);
  userToProfile.set(u, p);
  online.add(p);
  ghostEmptyTcpStreak = 0;
}

function markOfflineByUserId(userId) {
  const u = String(userId);
  const p = userToProfile.get(u);
  if (p) {
    online.delete(p);
    userToProfile.delete(u);
    return true;
  }
  if (online.has(u)) {
    online.delete(u);
    return true;
  }
  return false;
}

function processLine(line) {
  // Strip PM2 timestamps: "2026-07-12T05:31:45: 0 logged as 1001"
  const raw = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+:\s*/, "").trim();
  if (!raw) return;

  // Server (re)start — all sessions are dead
  if (
    /websocket server up/i.test(raw) ||
    /Server resources folder is listening/i.test(raw) ||
    /AttachSaveStorage took/i.test(raw)
  ) {
    clearOnline("server-restart-log");
    return;
  }

  // "0 logged as 1001" / "Logged as 1001"
  let m = raw.match(/^(\d+)\s+logged as\s+(\d+)\s*$/i);
  if (m) {
    markOnline(m[1], m[2]);
    return;
  }
  m = raw.match(/^Logged as\s+(\d+)\s*$/i);
  if (m) {
    online.add(m[1]);
    ghostEmptyTcpStreak = 0;
    return;
  }

  // disconnect variants
  m = raw.match(/^disconnect(?:ed)?(?:\s+user)?(?:\s*id)?\s*[:=]?\s*(\d+)\s*$/i);
  if (m) {
    markOfflineByUserId(m[1]);
    return;
  }
  m = raw.match(/User\s+(\d+)\s+disconnect/i);
  if (m) {
    markOfflineByUserId(m[1]);
    return;
  }
  m = raw.match(/disconnect(?:ed)?(?:\s+user)?(?:Id)?[^\d]*(\d+)/i);
  if (m && /disconnect/i.test(raw)) {
    markOfflineByUserId(m[1]);
    return;
  }

  // [VOA-names] NAME profile=1001 slot=0 name="Paarthurnax"
  m = raw.match(
    /\[VOA-names\]\s+NAME\s+profile=(\d+)\s+slot=(\d+)\s+name=(.+)\s*$/i
  );
  if (m) {
    const profileId = m[1];
    const slot = String(Number(m[2]) || 0);
    let name = m[3].trim();
    try {
      if (name.startsWith('"')) name = JSON.parse(name);
    } catch {
      name = name.replace(/^"|"$/g, "");
    }
    name = String(name || "")
      .trim()
      .slice(0, 48);
    if (name) {
      if (!characterNames[profileId]) characterNames[profileId] = {};
      characterNames[profileId][slot] = name;
    }
  }
}

function scanLog() {
  try {
    if (!fs.existsSync(LOG)) return;
    const text = fs.readFileSync(LOG, "utf8");
    const lines = text.split(/\r?\n/);
    if (lastLine > lines.length) {
      // Log rotated — rescan recent history but start empty (don't resurrect ghosts)
      lastLine = Math.max(0, lines.length - 200);
      clearOnline("log-rotate");
    }
    for (let i = lastLine; i < lines.length; i++) {
      if (lines[i]) processLine(lines[i]);
    }
    lastLine = lines.length;
    saveState();
  } catch (e) {
    console.error("scanLog", e.message);
  }
}

function tcpUiPeers() {
  try {
    const out = execSync(
      "ss -H -tn state established '( sport = :10001 )' 2>/dev/null | wc -l",
      { encoding: "utf8" }
    );
    return Math.max(0, parseInt(out.trim(), 10) || 0);
  } catch {
    return 0;
  }
}

function gameListening() {
  try {
    execSync("ss -H -ulnp 2>/dev/null | grep -q ':10000 '", { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync("ss -H -tlnp 2>/dev/null | grep -q ':10001'", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * If logs still claim players but no client UI sockets for several polls,
 * treat them as ghosts (missed disconnect / crash).
 */
function reconcileGhosts(fromTcp) {
  if (online.size === 0) {
    ghostEmptyTcpStreak = 0;
    return;
  }
  if (fromTcp > 0) {
    ghostEmptyTcpStreak = 0;
    return;
  }
  ghostEmptyTcpStreak += 1;
  if (ghostEmptyTcpStreak >= GHOST_TCP_POLLS) {
    clearOnline("no-tcp-peers");
  }
}

loadState();
// On process start: don't trust persisted ghosts without live sockets
try {
  if (tcpUiPeers() === 0 && online.size > 0) {
    clearOnline("startup-no-peers");
  }
} catch {
  /* ignore */
}
scanLog();
setInterval(scanLog, 2000);

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/health") {
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/status" || req.url === "/") {
    scanLog();
    const fromTcp = tcpUiPeers();
    reconcileGhosts(fromTcp);
    const fromLog = online.size;
    const playersOnline = fromLog;
    res.end(
      JSON.stringify({
        gameOnline: gameListening(),
        playersOnline,
        playersFromLog: fromLog,
        playersFromTcp: fromTcp,
        profiles: [...online],
        characterNames,
        maxPlayers: MAX_PLAYERS,
        updatedAt: new Date().toISOString(),
      })
    );
    return;
  }

  const charMatch = req.url && req.url.match(/^\/characters\/(\d+)\/?$/);
  if (charMatch) {
    scanLog();
    const pid = charMatch[1];
    res.end(
      JSON.stringify({ profileId: Number(pid), names: characterNames[pid] || {} })
    );
    return;
  }

  if (req.url === "/reset" && req.method === "POST") {
    clearOnline("manual-reset");
    characterNames && Object.keys(characterNames).forEach((k) => delete characterNames[k]);
    // keep characterNames actually — only clear presence
    res.end(JSON.stringify({ ok: true, cleared: true, playersOnline: 0 }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("VOA status on :" + PORT + " log=" + LOG);
});
