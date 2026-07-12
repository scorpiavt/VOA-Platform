import fs from "fs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { config, discordConfigured } from "./config";
import {
  createRefreshToken,
  consumeRefreshToken,
  pkcePair,
  randomState,
  signAccessToken,
  verifyAccessToken,
} from "./auth";
import { getDb, type DbUser } from "./db";
import {
  createCharacter,
  deleteCharacter,
  getCharacterBySlot,
  listCharacters,
  touchCharacterPlayed,
  updateCharacterName,
} from "./characters";
import { listModPackages, resolvePackageArchive } from "./mods";
import { getServerStatus } from "./status";
import { getUserById, toPublicUser, upsertDiscordUser } from "./users";
import {
  assertCommunityMemberAtLogin,
  assertCommunityMemberOngoing,
  membershipErrorHtml,
} from "./discordGuild";
import { getLauncherBinaryPath, readLauncherUpdate } from "./launcherUpdate";

async function requireUser(req: FastifyRequest): Promise<DbUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    const err = new Error("Unauthorized") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  const token = header.slice(7);
  try {
    const claims = await verifyAccessToken(token);
    const user = getUserById(Number(claims.sub));
    if (!user || user.banned) {
      const err = new Error("Unauthorized") as Error & { statusCode: number };
      err.statusCode = 401;
      throw err;
    }
    return user;
  } catch {
    const err = new Error("Unauthorized") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/v1/status", async () => getServerStatus());

  app.get("/v1/news", async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(50, Math.max(1, Number(q.limit ?? 20) || 20));
    const rows = getDb()
      .prepare(
        `SELECT * FROM news ORDER BY pinned DESC, published_at DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: number;
      title: string;
      body: string;
      pinned: number;
      tags: string;
      published_at: string;
    }>;
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        pinned: Boolean(r.pinned),
        tags: JSON.parse(r.tags || "[]") as string[],
        publishedAt: r.published_at,
      })),
    };
  });

  app.post("/v1/news", async (req, reply) => {
    const user = await requireUser(req);
    if (!config.adminDiscordIds.includes(user.discord_id)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
    const body = req.body as {
      title?: string;
      body?: string;
      pinned?: boolean;
      tags?: string[];
    };
    if (!body.title?.trim() || !body.body?.trim()) {
      return reply.code(400).send({ error: "title and body required" });
    }
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        `INSERT INTO news (title, body, pinned, tags, published_at, author_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.title.trim(),
        body.body.trim(),
        body.pinned ? 1 : 0,
        JSON.stringify(body.tags ?? []),
        now,
        user.id
      );
    return { id: Number(info.lastInsertRowid) };
  });

  app.get("/v1/me", async (req, reply) => {
    const user = await requireUser(req);
    return { user: toPublicUser(user) };
  });

  app.post("/v1/auth/refresh", async (req, reply) => {
    const body = req.body as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({ error: "refreshToken required" });
    }
    const userId = consumeRefreshToken(body.refreshToken);
    if (!userId) return reply.code(401).send({ error: "Invalid refresh token" });
    const user = getUserById(userId);
    if (!user || user.banned) return reply.code(401).send({ error: "Unauthorized" });

    // Double security: still in community Discord?
    const member = await assertCommunityMemberOngoing(user.discord_id);
    if (!member.ok) {
      return reply.code(403).send({
        error: "community_required",
        message: member.reason,
        inviteUrl: member.inviteUrl || config.discordInviteUrl || undefined,
      });
    }

    const accessToken = await signAccessToken(user);
    const refreshToken = createRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSec,
      user: toPublicUser(user),
    };
  });

  app.post("/v1/sessions", async (req, reply) => {
    const user = await requireUser(req);
    if (user.banned) return reply.code(403).send({ error: "Banned" });
    if (config.maintenance) {
      return reply.code(503).send({ error: "Maintenance", message: config.statusMessage });
    }

    // Double security: re-check guild membership before minting a game session
    const member = await assertCommunityMemberOngoing(user.discord_id);
    if (!member.ok) {
      return reply.code(403).send({
        error: "community_required",
        message: member.reason,
        inviteUrl: member.inviteUrl || config.discordInviteUrl || undefined,
      });
    }
    const body = (req.body || {}) as { characterSlot?: number };
    const characterSlot =
      typeof body.characterSlot === "number" && body.characterSlot >= 0 && body.characterSlot <= 1
        ? body.characterSlot
        : 0;
    const ch = getCharacterBySlot(user.id, characterSlot);
    if (!ch || ch.empty) {
      return reply.code(400).send({
        error: "Select or create a character in this slot first",
        characterSlot,
      });
    }
    touchCharacterPlayed(user.id, characterSlot);

    const session = nanoid(32);
    const expiresAt = new Date(Date.now() + config.sessionTtlSec * 1000).toISOString();
    getDb()
      .prepare(
        `INSERT INTO game_sessions (session_id, user_id, profile_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(session, user.id, user.profile_id, expiresAt, new Date().toISOString());

    // Store slot on session row via side table meta key (lightweight)
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`
      )
      .run(`session_slot:${session}`, String(characterSlot));

    return {
      session,
      profileId: user.profile_id,
      expiresAt,
      serverIp: config.gameServerIp,
      serverPort: config.gameServerPort,
      master: config.publicUrl,
      characterSlot,
    };
  });

  // --- Characters (2 slots per account) ---

  app.get("/v1/characters", async (req) => {
    const user = await requireUser(req);
    return { characters: listCharacters(user.id), maxSlots: 2 };
  });

  app.post("/v1/characters", async (req, reply) => {
    const user = await requireUser(req);
    const body = (req.body || {}) as { slot?: number; name?: string };
    if (typeof body.slot !== "number") {
      return reply.code(400).send({ error: "slot required (0 or 1)" });
    }
    try {
      const character = createCharacter(user.id, body.slot, body.name);
      return { character };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  app.delete("/v1/characters/:id", async (req, reply) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    try {
      deleteCharacter(user.id, Number(id));
      return { ok: true };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /** Set character display name from in-game look.name */
  app.patch("/v1/characters/slot/:slot", async (req, reply) => {
    const user = await requireUser(req);
    const slot = Number((req.params as { slot: string }).slot);
    const body = (req.body || {}) as { name?: string };
    try {
      const character = updateCharacterName(user.id, slot, body.name || "");
      return { character };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /**
   * In-game client reports look.name after race menu / load.
   * Auth via active game session (no Discord token in Skyrim).
   */
  app.post("/v1/game/character-name", async (req, reply) => {
    const body = (req.body || {}) as {
      session?: string;
      profileId?: number;
      slot?: number;
      name?: string;
    };
    const session = String(body.session || "").trim();
    const name = String(body.name || "").trim().slice(0, 48);
    const slot =
      typeof body.slot === "number" && body.slot >= 0 && body.slot <= 1
        ? body.slot
        : 0;
    if (!session || !name) {
      return reply.code(400).send({ error: "session and name required" });
    }
    const row = getDb()
      .prepare(
        `SELECT user_id, profile_id FROM game_sessions
         WHERE session_id = ? AND datetime(expires_at) > datetime('now')`
      )
      .get(session) as { user_id: number; profile_id: number } | undefined;
    if (!row) {
      return reply.code(401).send({ error: "Invalid or expired session" });
    }
    if (
      typeof body.profileId === "number" &&
      body.profileId !== row.profile_id
    ) {
      return reply.code(403).send({ error: "profile mismatch" });
    }
    try {
      const character = updateCharacterName(row.user_id, slot, name);
      return { ok: true, character };
    } catch (e: any) {
      return reply
        .code(e?.statusCode || 500)
        .send({ error: e?.message || String(e) });
    }
  });

  /** SkyMP master-compatible session lookup */
  app.get("/api/servers/:addr/sessions/:session", async (req, reply) => {
    const { addr, session } = req.params as { addr: string; session: string };
    // addr may be URL-encoded (ip:port)
    const decodedAddr = decodeURIComponent(addr);
    if (decodedAddr !== config.gameServerAddr) {
      app.log.warn({ decodedAddr, expected: config.gameServerAddr }, "unexpected server addr");
      // Still allow lookup if session is valid — some servers mis-detect public IP
    }
    const row = getDb()
      .prepare(
        `SELECT gs.profile_id, gs.expires_at, u.banned
         FROM game_sessions gs
         JOIN users u ON u.id = gs.user_id
         WHERE gs.session_id = ?`
      )
      .get(session) as
      | { profile_id: number; expires_at: string; banned: number }
      | undefined;

    if (!row) return reply.code(404).send({ error: "session not found" });
    if (row.banned) return reply.code(403).send({ error: "banned" });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return reply.code(410).send({ error: "session expired" });
    }
    return { user: { id: row.profile_id } };
  });

  app.get("/v1/updates/client/latest", async () => {
    const version = "0.0.0";
    return {
      version,
      channel: "stable" as const,
      minLauncher: "0.1.0",
      files: [] as Array<{ path: string; sha256: string; size: number; url: string }>,
      note: "Client CDN not published yet (Phase 5).",
    };
  });

  /** Launcher self-update (public). Play is blocked client-side while outdated. */
  app.get("/v1/updates/launcher/latest", async () => {
    return readLauncherUpdate();
  });

  /** Stream portable launcher binary from data/cdn/launcher/ */
  app.get("/cdn/launcher/VisionsOfAetherius.exe", async (_req, reply) => {
    const bin = getLauncherBinaryPath();
    if (!bin) {
      return reply.code(404).send({
        error: "Launcher binary not published yet",
        hint: "Place VisionsOfAetherius.exe under DATA_DIR/cdn/launcher/",
      });
    }
    const stream = fs.createReadStream(bin);
    const st = fs.statSync(bin);
    return reply
      .header("Content-Type", "application/octet-stream")
      .header(
        "Content-Disposition",
        'attachment; filename="VisionsOfAetherius.exe"'
      )
      .header("Content-Length", String(st.size))
      .header("Cache-Control", "public, max-age=300")
      .send(stream);
  });

  /** Mod package catalog — each entry is one archive (easy install / uninstall unit) */
  app.get("/v1/mods", async () => {
    const packages = listModPackages();
    return { packages };
  });

  app.get("/v1/mods/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const pkg = listModPackages().find((p) => p.id === id);
    if (!pkg) return reply.code(404).send({ error: "Package not found" });
    return pkg;
  });

  /** Stream a single package archive (zip) for the launcher download manager */
  app.get("/v1/mods/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const resolved = resolvePackageArchive(id);
    if (!resolved) {
      return reply.code(404).send({ error: "Package archive not available" });
    }
    const { meta, archivePath } = resolved;
    const st = fs.statSync(archivePath);
    const stream = fs.createReadStream(archivePath);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Length", st.size)
      .header(
        "Content-Disposition",
        `attachment; filename="${meta.filename.replace(/"/g, "")}"`
      )
      .header("X-VOA-Package-Id", meta.id)
      .header("X-VOA-Package-Version", meta.version)
      .send(stream);
  });

  // --- Discord OAuth ---

  /** Public setup info so operators can fix redirect_uri without reading code */
  app.get("/v1/auth/discord-setup", async () => {
    const protocol = "voa://callback";
    const loopback = "http://127.0.0.1:47821/auth/discord/callback";
    const loopbackLocalhost = "http://localhost:47821/auth/discord/callback";
    return {
      clientId: config.discordClientId || null,
      configured: discordConfigured(),
      /** Primary desktop redirect + HTTP fallbacks */
      requiredRedirects: [protocol, loopback, loopbackLocalhost],
      portalUrl: config.discordClientId
        ? `https://discord.com/developers/applications/${config.discordClientId}/oauth2/general`
        : "https://discord.com/developers/applications",
      hint:
        "Invalid OAuth2 redirect_uri = Discord app missing this redirect. Add voa://callback under OAuth2 → Redirects and click Save Changes.",
    };
  });

  app.get("/auth/discord/setup", async (_req, reply) => {
    const protocol = "voa://callback";
    const loopback = "http://127.0.0.1:47821/auth/discord/callback";
    const loopbackLocalhost = "http://localhost:47821/auth/discord/callback";
    const portal = config.discordClientId
      ? `https://discord.com/developers/applications/${config.discordClientId}/oauth2/general`
      : "https://discord.com/developers/applications";
    const cid = escapeHtml(config.discordClientId || "(not set)");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>VOA Discord setup</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f1115;color:#e8e6e3;max-width:680px;margin:2rem auto;padding:0 1rem;line-height:1.55}
h1{color:#c9a227;font-size:1.4rem}h2{font-size:1.05rem;margin-top:1.5rem;color:#e0c04a}
code,pre{background:#1a1d24;padding:.4rem .6rem;border-radius:6px;display:block;margin:.45rem 0 1rem;word-break:break-all;border:1px solid #333}
a.btn{display:inline-block;background:linear-gradient(180deg,#e0c04a,#a8841c);color:#1a1408;font-weight:700;text-decoration:none;padding:.65rem 1.1rem;border-radius:10px;margin:.5rem 0 1rem}
a{color:#6eb6ff}ol{padding-left:1.25rem}li{margin:.45rem 0}.warn{color:#ffb4b4;background:#3a1a1a;padding:.75rem 1rem;border-radius:8px;border:1px solid #633}
.ok{color:#9ddeb8}</style></head>
<body>
<h1>Fix Discord login (Invalid OAuth2 redirect_uri)</h1>
<p class="warn"><strong>This is not a launcher bug and not your authenticator.</strong><br>
Discord rejects the login until the redirect URL is registered on <em>this exact</em> application.</p>
<p>Client ID (must match): <code style="display:inline">${cid}</code></p>
<p><a class="btn" href="${portal}" target="_blank" rel="noreferrer">Open Discord OAuth2 settings for this app →</a></p>
<h2>Steps</h2>
<ol>
<li>Click the gold button above (or open the link).</li>
<li>Scroll to <strong>Redirects</strong>.</li>
<li>Click <strong>Add Redirect</strong>.</li>
<li>Paste this <strong>first</strong> (desktop protocol — recommended):</li>
</ol>
<pre>${escapeHtml(protocol)}</pre>
<ol start="5">
<li>Add these too (optional fallbacks):</li>
</ol>
<pre>${escapeHtml(loopback)}</pre>
<pre>${escapeHtml(loopbackLocalhost)}</pre>
<ol start="6">
<li>Click <strong>Save Changes</strong> (bottom of page). If you skip Save, Discord still errors.</li>
<li>Quit the VOA launcher completely, start the latest build, click <strong>Login with Discord</strong> again.</li>
<li>After authorizing, if the browser asks to open VisionsOfAetherius / <code style="display:inline">voa://</code>, click <strong>Open</strong>.</li>
</ol>
<p class="ok">Still failing? You are almost certainly on the <strong>wrong Discord application</strong> — Client ID must be ${cid}.</p>
</body></html>`;
    return reply.type("text/html").send(html);
  });

  app.get("/auth/discord", async (req, reply) => {
    if (!discordConfigured()) {
      return reply.code(503).send({
        error: "Discord OAuth not configured",
        hint: "Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET on the API.",
      });
    }
    const q = req.query as { redirect_uri?: string; format?: string };
    // Desktop launcher uses 127.0.0.1 loopback (Discord-supported). Browser tests use API callback.
    const defaultRedirect = `${config.publicUrl.replace(/\/$/, "")}/auth/discord/callback`;
    const protocolRedirect = "voa://callback";
    const loopbackRedirect = "http://127.0.0.1:47821/auth/discord/callback";
    const allowedRedirects = new Set([
      protocolRedirect,
      defaultRedirect,
      loopbackRedirect,
      "http://localhost:47821/auth/discord/callback",
      "http://127.0.0.1:3100/auth/discord/callback",
    ]);
    const redirectUri = q.redirect_uri || protocolRedirect;
    if (!allowedRedirects.has(redirectUri)) {
      return reply.code(400).send({
        error: "Invalid redirect_uri",
        allowed: [...allowedRedirects],
      });
    }
    const state = randomState();
    const { verifier, challenge } = pkcePair();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    getDb()
      .prepare(
        `INSERT INTO oauth_pending (state, code_verifier, redirect_uri, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(state, verifier, redirectUri, new Date().toISOString(), expiresAt);

    // identify = profile; guilds = community membership gate (double security)
    const scopes = config.requireDiscordGuild
      ? "identify guilds"
      : "identify";
    const params = new URLSearchParams({
      client_id: config.discordClientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "consent",
    });

    const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    // Launcher asks for JSON so it can poll with `state`
    if (q.format === "json") {
      return { authorizeUrl: url, state, expiresAt };
    }
    return reply.redirect(url);
  });

  /** Launcher polls this after Discord browser login until tokens appear */
  app.get("/v1/auth/poll/:state", async (req, reply) => {
    const { state } = req.params as { state: string };
    const row = getDb()
      .prepare("SELECT payload, expires_at FROM auth_handoff WHERE state = ?")
      .get(state) as { payload: string; expires_at: string } | undefined;
    if (!row) {
      return reply.code(204).send();
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      getDb().prepare("DELETE FROM auth_handoff WHERE state = ?").run(state);
      return reply.code(410).send({ error: "Login expired — try again" });
    }
    // one-time claim
    getDb().prepare("DELETE FROM auth_handoff WHERE state = ?").run(state);
    return JSON.parse(row.payload);
  });

  type OAuthPayload = {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: ReturnType<typeof toPublicUser>;
  };

  async function completeDiscordOAuth(
    code: string,
    state: string
  ): Promise<
    | { ok: true; payload: OAuthPayload; state: string }
    | { ok: false; status: number; error: string; title?: string }
  > {
    const pending = getDb()
      .prepare("SELECT * FROM oauth_pending WHERE state = ?")
      .get(state) as
      | {
          state: string;
          code_verifier: string;
          redirect_uri: string;
          expires_at: string;
        }
      | undefined;
    getDb().prepare("DELETE FROM oauth_pending WHERE state = ?").run(state);
    if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
      return { ok: false, status: 400, error: "Invalid or expired state" };
    }

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirect_uri,
        code_verifier: pending.code_verifier,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      app.log.error({ t, redirect: pending.redirect_uri }, "discord token exchange failed");
      return { ok: false, status: 502, error: "Token exchange failed" };
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string };
    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!meRes.ok) {
      return { ok: false, status: 502, error: "Could not load Discord profile" };
    }
    const me = (await meRes.json()) as {
      id: string;
      username: string;
      discriminator?: string;
      global_name?: string;
      avatar: string | null;
    };

    const membership = await assertCommunityMemberAtLogin(
      tokenJson.access_token,
      me.id
    );
    if (!membership.ok) {
      app.log.info(
        { discordId: me.id, reason: membership.reason },
        "discord login rejected — not in community guild"
      );
      const { title, message } = membershipErrorHtml(membership);
      return { ok: false, status: 403, error: message, title };
    }

    const user = upsertDiscordUser({
      discordId: me.id,
      username: me.global_name || me.username,
      discriminator: me.discriminator ?? null,
      avatar: me.avatar,
    });
    if (user.banned) {
      return { ok: false, status: 403, error: "Your account is banned.", title: "Banned" };
    }

    const accessToken = await signAccessToken(user);
    const refreshToken = createRefreshToken(user.id);
    const payload: OAuthPayload = {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSec,
      user: toPublicUser(user),
    };

    const handoffExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO auth_handoff (state, payload, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(state, JSON.stringify(payload), handoffExpiry, new Date().toISOString());

    return { ok: true, payload, state };
  }

  app.get("/auth/discord/callback", async (req, reply) => {
    if (!discordConfigured()) {
      return reply.code(503).send({ error: "Discord OAuth not configured" });
    }
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) {
      return reply.code(400).type("text/html").send(htmlPage("Login failed", q.error));
    }
    if (!q.code || !q.state) {
      return reply.code(400).type("text/html").send(htmlPage("Login failed", "Missing code/state"));
    }

    const result = await completeDiscordOAuth(q.code, q.state);
    if (!result.ok) {
      return reply
        .code(result.status)
        .type("text/html")
        .send(htmlPage(result.title || "Login failed", result.error));
    }
    return reply.type("text/html").send(htmlSuccess(result.payload));
  });

  /**
   * Desktop launcher loopback: browser lands on 127.0.0.1, launcher POSTs code here.
   * redirect_uri in the authorize step must be http://127.0.0.1:47821/auth/discord/callback
   */
  app.post("/v1/auth/discord/exchange", async (req, reply) => {
    if (!discordConfigured()) {
      return reply.code(503).send({ error: "Discord OAuth not configured" });
    }
    const body = (req.body || {}) as { code?: string; state?: string };
    if (!body.code?.trim() || !body.state?.trim()) {
      return reply.code(400).send({ error: "code and state required" });
    }
    const result = await completeDiscordOAuth(body.code.trim(), body.state.trim());
    if (!result.ok) {
      return reply.code(result.status).send({
        error: result.error,
        title: result.title,
      });
    }
    return result.payload;
  });

  /** Dev helper: mint tokens without Discord (disabled unless ALLOW_DEV_LOGIN=true) */
  app.post("/v1/auth/dev-login", async (req, reply) => {
    if ((process.env.ALLOW_DEV_LOGIN ?? "false").toLowerCase() !== "true") {
      return reply.code(404).send({ error: "Not found" });
    }
    const body = req.body as { username?: string };
    const name = body.username?.trim() || "DevUser";
    const fakeId = `dev-${name.toLowerCase().replace(/[^a-z0-9]/g, "") || "user"}`;
    const user = upsertDiscordUser({
      discordId: fakeId,
      username: name,
      discriminator: "0000",
      avatar: null,
    });
    const accessToken = await signAccessToken(user);
    const refreshToken = createRefreshToken(user.id);
    return {
      accessToken,
      refreshToken,
      expiresIn: config.accessTokenTtlSec,
      user: toPublicUser(user),
    };
  });
}

function htmlPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title>
  <style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f1115;color:#e8e6e3;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#1a1d24;padding:2rem 2.5rem;border-radius:12px;max-width:420px;box-shadow:0 8px 32px #0008}
  h1{margin:0 0 .5rem;font-size:1.25rem;color:#c9a227}p{margin:0;opacity:.9;line-height:1.5}</style></head>
  <body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

function htmlSuccess(payload: unknown): string {
  const json = JSON.stringify(payload);
  return `<!doctype html><html><head><meta charset="utf-8"><title>VOA Login</title>
  <style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f1115;color:#e8e6e3;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#1a1d24;padding:2rem 2.5rem;border-radius:12px;max-width:480px;box-shadow:0 8px 32px #0008}
  h1{margin:0 0 .5rem;font-size:1.25rem;color:#c9a227}p{margin:0 0 1rem;opacity:.9;line-height:1.5}
  .ok{color:#3d9a6a;font-weight:600}
  </style></head>
  <body><div class="card">
  <h1>Login successful</h1>
  <p class="ok" id="status">Sending session to the VOA Launcher...</p>
  <p>You can close this tab and return to the launcher.</p>
  </div>
  <script>
    const payload = ${json};
    function notifyLauncher() {
      return fetch('http://127.0.0.1:47821/auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors',
        cache: 'no-store'
      }).then(function(r) {
        if (r.ok) {
          document.getElementById('status').textContent = 'Launcher updated — you can close this tab.';
        } else {
          document.getElementById('status').textContent = 'Launcher will pick this up automatically — close this tab.';
        }
      }).catch(function() {
        document.getElementById('status').textContent = 'Launcher will pick this up automatically — close this tab.';
      });
    }
    notifyLauncher();
    setTimeout(notifyLauncher, 500);
    setTimeout(notifyLauncher, 1500);
  </script>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
