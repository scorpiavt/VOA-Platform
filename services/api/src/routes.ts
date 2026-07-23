import crypto from "crypto";
import fs from "fs";
import path from "path";
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
  bindCharacterActor,
  createCharacter,
  deleteCharacter,
  getCharacterBindingByProfileSlot,
  getCharacterBySlot,
  listBindingsForProfile,
  listCharacters,
  listPendingWipes,
  markWipesDone,
  queueOrphanWipes,
  saveCharacterState,
  touchCharacterPlayed,
  updateCharacterName,
} from "./characters";
import { getCatalogMeta, listModPackages, resolvePackageArchive } from "./mods";
import { getServerStatus } from "./status";
import { getUserById, toPublicUser, upsertDiscordUser } from "./users";
import {
  assertCommunityMemberAtLogin,
  assertCommunityMemberOngoing,
  checkStaffAccess,
  membershipErrorHtml,
  refreshStaffRolesAtLogin,
  type StaffCheckResult,
} from "./discordGuild";
import {
  getLauncherBinaryPath,
  getLauncherCdnFile,
  readLauncherUpdate,
} from "./launcherUpdate";
import {
  bugReportStats,
  createBugReport,
  deleteBugReport,
  getBugReport,
  listAllBugReports,
  listBugReportsForUser,
  updateBugReportStatus,
} from "./bugReports";
import {
  ackAdminActions,
  listAdminCharacters,
  listPendingAdminActions,
  listUserWarnings,
  queueAdminAction,
  runCharacterAdminAction,
} from "./adminModeration";
import {
  ensureSupportLogsTable,
  getSupportLogFile,
  listSupportLogs,
  listSupportLogsForUser,
  purgeExpiredSupportLogs,
  saveSupportLog,
  SUPPORT_LOG_MAX_BYTES,
  SUPPORT_LOG_RETENTION_DAYS,
  toPublicSupportLog,
} from "./supportLogs";
import {
  getVoicePublicConfig,
  mintLiveKitAccessToken,
  voiceEnabled,
} from "./voice";

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

async function requireStaff(
  req: FastifyRequest
): Promise<{ user: DbUser; staff: StaffCheckResult }> {
  const user = await requireUser(req);
  const staff = await checkStaffAccess(user.discord_id);
  if (!staff.isStaff) {
    const err = new Error(
      "Staff only — requires Founder, Senior Gamemaster, or Gamemaster role"
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  return { user, staff };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  app.get("/v1/status", async () => getServerStatus());

  /**
   * Proximity voice — public config (safe to call before login).
   * In-game CEF + SP client use this to know if LiveKit is live.
   */
  app.get("/v1/voice/config", async () => getVoicePublicConfig());

  /**
   * Mint LiveKit access token for in-game proximity voice.
   * Auth: game session (preferred from SP) OR launcher Bearer JWT.
   */
  app.post("/v1/voice/token", async (req, reply) => {
    if (!voiceEnabled()) {
      return reply.code(503).send({
        error: "Proximity voice is not enabled on this server",
        enabled: false,
      });
    }

    const body = (req.body || {}) as {
      session?: string;
      characterSlot?: number;
      displayName?: string;
    };

    let profileId = 0;
    let userId = 0;
    let characterSlot =
      typeof body.characterSlot === "number" &&
      body.characterSlot >= 0 &&
      body.characterSlot <= 1
        ? body.characterSlot
        : 0;

    const session = String(body.session || "").trim();
    if (session) {
      const row = getDb()
        .prepare(
          `SELECT user_id, profile_id FROM game_sessions
           WHERE session_id = ? AND datetime(expires_at) > datetime('now')`
        )
        .get(session) as { user_id: number; profile_id: number } | undefined;
      if (!row) {
        return reply.code(401).send({ error: "Invalid or expired session" });
      }
      userId = row.user_id;
      profileId = row.profile_id;
    } else {
      try {
        const user = await requireUser(req);
        userId = user.id;
        profileId = user.profile_id;
      } catch {
        return reply
          .code(401)
          .send({ error: "session or Authorization Bearer required" });
      }
    }

    const user = getUserById(userId);
    if (!user || user.banned) {
      return reply.code(403).send({ error: "not allowed" });
    }

    let displayName = String(body.displayName || "").trim().slice(0, 64);
    if (!displayName) {
      try {
        const ch = getCharacterBySlot(userId, characterSlot);
        if (ch?.name && !ch.empty) displayName = ch.name;
      } catch {
        /* ignore */
      }
    }
    if (!displayName) {
      displayName = user.username || `Player ${profileId}`;
    }

    try {
      const minted = await mintLiveKitAccessToken({
        profileId,
        displayName,
        characterSlot,
      });
      const pub = getVoicePublicConfig();
      return {
        token: minted.token,
        identity: minted.identity,
        room: minted.room,
        url: pub.url,
        expiresAt: minted.expiresAt,
        ranges: pub.ranges,
        defaultKeybinds: pub.defaultKeybinds,
      };
    } catch (e: any) {
      return reply.code(500).send({
        error: e?.message || "Failed to mint voice token",
      });
    }
  });

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
    let user: DbUser;
    try {
      ({ user } = await requireStaff(req));
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Forbidden" });
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

  app.get("/v1/me", async (req) => {
    const user = await requireUser(req);
    const staff = await checkStaffAccess(user.discord_id);
    return {
      user: toPublicUser(user),
      staff: {
        isStaff: staff.isStaff,
        roleIds: staff.roleIds,
        roleLabels: staff.roleLabels,
      },
    };
  });

  /**
   * In-game / game-server staff check by session or profileId.
   * Client uses this to lock console commands to Discord staff roles.
   */
  app.get("/v1/game/is-staff", async (req, reply) => {
    const q = req.query as { session?: string; profileId?: string; secret?: string };
    const headerSecret = String(req.headers["x-voa-game-secret"] || "").trim();
    const secret = headerSecret || String(q.secret || "").trim();

    let profileId = Number(q.profileId) || 0;
    if (q.session) {
      const row = getDb()
        .prepare(
          `SELECT profile_id FROM game_sessions
           WHERE session_id = ? AND datetime(expires_at) > datetime('now')`
        )
        .get(String(q.session)) as { profile_id: number } | undefined;
      if (!row) return reply.code(401).send({ error: "Invalid session", isStaff: false });
      profileId = row.profile_id;
    } else if (secret && secret === config.gameServerSecret && profileId > 0) {
      // game server trusted lookup by profile
    } else if (!q.session) {
      return reply.code(400).send({ error: "session or (secret+profileId) required", isStaff: false });
    }

    const user = getDb()
      .prepare(`SELECT * FROM users WHERE profile_id = ?`)
      .get(profileId) as DbUser | undefined;
    if (!user) {
      return { ok: true, isStaff: false, profileId, roles: [] as string[] };
    }
    if (user.banned) {
      return { ok: true, isStaff: false, profileId, roles: [] as string[], banned: true };
    }
    const staff = await checkStaffAccess(user.discord_id);
    return {
      ok: true,
      isStaff: staff.isStaff,
      profileId,
      roles: staff.roleLabels,
      method: staff.method,
    };
  });

  /**
   * In-game staff console (bypass broken CustomEvent path).
   * Client posts with game session; game server polls pending-admin-actions
   * and runs mp._voaConsole via Chakra.
   */
  app.post("/v1/game/console-command", async (req, reply) => {
    const body = (req.body || {}) as {
      session?: string;
      profileId?: number;
      command?: string;
      args?: unknown;
    };
    const session = String(body.session || "").trim();
    const command = String(body.command || "")
      .trim()
      .toLowerCase()
      .slice(0, 48);
    if (!session || !command) {
      return reply.code(400).send({ error: "session and command required" });
    }
    const allowed = new Set([
      "listplayers",
      "players",
      "announce",
      "tp",
      "tpto",
      "goto",
      "summon",
      "bring",
      "giveplayerspell",
      "givespell",
      "addspell",
      "additem",
    ]);
    if (!allowed.has(command)) {
      return reply.code(400).send({ error: "unknown command: " + command });
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
      body.profileId > 0 &&
      body.profileId !== row.profile_id
    ) {
      return reply.code(403).send({ error: "profile mismatch" });
    }
    const user = getDb()
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(row.user_id) as DbUser | undefined;
    if (!user || user.banned) {
      return reply.code(403).send({ error: "not allowed" });
    }
    const staff = await checkStaffAccess(user.discord_id);
    if (!staff.isStaff) {
      return reply.code(403).send({ error: "Admin only", isStaff: false });
    }
    let args: unknown[] = [];
    if (Array.isArray(body.args)) args = body.args;
    else if (body.args != null) args = [body.args];
    // normalize aliases in payload
    let cmd = command;
    if (cmd === "players") cmd = "listplayers";
    if (cmd === "bring") cmd = "summon";
    if (cmd === "tpto" || cmd === "goto") cmd = "tp";
    if (cmd === "givespell" || cmd === "addspell") cmd = "giveplayerspell";
    const id = queueAdminAction({
      action: "console_cmd",
      staffUserId: user.id,
      targetProfileId: row.profile_id,
      payload: {
        cmd,
        args,
        staffProfileId: row.profile_id,
      },
    });
    return {
      ok: true,
      queued: true,
      id,
      command: cmd,
      args,
      profileId: row.profile_id,
    };
  });

  /**
   * In-game player interact (give name / trade) — bypasses broken CustomEvent.
   * Any logged-in session can queue; game server runs mp._voaInteract.
   */
  app.post("/v1/game/interact", async (req, reply) => {
    const body = (req.body || {}) as {
      session?: string;
      profileId?: number;
      action?: string;
      targetRemoteId?: number;
      payload?: unknown;
    };
    const session = String(body.session || "").trim();
    const action = String(body.action || "")
      .trim()
      .toLowerCase()
      .slice(0, 48);
    if (!session || !action) {
      return reply.code(400).send({ error: "session and action required" });
    }
    const allowed = new Set([
      "givename",
      "giveName",
      "givename_nearby",
      "giveName_nearby",
      "trade_request",
      "trade_accept",
      "trade_decline",
      "trade_cancel",
      "trade_ready",
      "trade_offer",
    ]);
    // normalize to lower for allow list check
    const actKey = action.replace(/_/g, "").toLowerCase();
    const allowedNorm = new Set(
      [...allowed].map((a) => a.replace(/_/g, "").toLowerCase())
    );
    if (!allowedNorm.has(actKey) && !allowed.has(action)) {
      // still allow known snake_case from client
      const okAct =
        action === "givename" ||
        action === "givename_nearby" ||
        action.startsWith("trade_");
      if (!okAct) {
        return reply.code(400).send({ error: "unknown action: " + action });
      }
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
      body.profileId > 0 &&
      body.profileId !== row.profile_id
    ) {
      return reply.code(403).send({ error: "profile mismatch" });
    }
    const user = getDb()
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(row.user_id) as DbUser | undefined;
    if (!user || user.banned) {
      return reply.code(403).send({ error: "not allowed" });
    }
    const id = queueAdminAction({
      action: "interact_cmd",
      staffUserId: user.id,
      targetProfileId: row.profile_id,
      targetActorFormId:
        typeof body.targetRemoteId === "number" ? body.targetRemoteId : null,
      payload: {
        action,
        targetRemoteId: Number(body.targetRemoteId) || 0,
        payload: body.payload || {},
        fromProfileId: row.profile_id,
      },
    });
    return {
      ok: true,
      queued: true,
      id,
      action,
      profileId: row.profile_id,
    };
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
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO game_sessions (session_id, user_id, profile_id, expires_at, created_at, character_slot)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(session, user.id, user.profile_id, expiresAt, createdAt, characterSlot);

    // Keep meta key for older game-server / client readers (cheap, same transaction path)
    getDb()
      .prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
      .run(`session_slot:${session}`, String(characterSlot));

    // Single response includes character so launcher need not re-GET /v1/characters on Play
    return {
      session,
      profileId: user.profile_id,
      expiresAt,
      serverIp: config.gameServerIp,
      serverPort: config.gameServerPort,
      master: config.publicUrl,
      characterSlot,
      character: {
        id: ch.id,
        slot: ch.slot,
        name: ch.name,
        empty: Boolean(ch.empty),
        lastPlayedAt: ch.last_played_at,
        hasWorldActor: Boolean(
          ch.actor_form_id != null && Number(ch.actor_form_id) > 0
        ),
      },
    };
  });

  // --- Support logs (opt-in, private storage — not public CDN) ---
  ensureSupportLogsTable();
  try {
    purgeExpiredSupportLogs();
  } catch {
    /* ignore */
  }

  /**
   * Opt-in support log upload. Requires Discord login + explicit consent:true.
   * Stored under DATA_DIR/support-logs (staff-only access), auto-expire ~30 days.
   */
  app.post("/v1/support/logs", async (req, reply) => {
    const user = await requireUser(req);
    const body = (req.body || {}) as {
      consent?: boolean;
      consentText?: string;
      reason?: string;
      launcherVersion?: string;
      text?: string;
    };
    if (body.consent !== true) {
      return reply.code(400).send({
        error: "consent_required",
        message:
          "You must set consent:true after reviewing the support-log disclaimer.",
      });
    }
    if (!body.text || typeof body.text !== "string") {
      return reply.code(400).send({ error: "text required" });
    }
    // Soft rate limit: max 5 uploads / hour / user
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = getDb()
        .prepare(
          `SELECT COUNT(*) AS c FROM support_logs WHERE user_id = ? AND created_at > ?`
        )
        .get(user.id, hourAgo) as { c: number };
      if (recent.c >= 5) {
        return reply.code(429).send({
          error: "rate_limited",
          message: "Max 5 support log uploads per hour.",
        });
      }
    } catch {
      /* table may race */
    }
    try {
      const saved = saveSupportLog({
        userId: user.id,
        profileId: user.profile_id,
        discordId: user.discord_id,
        username: user.username,
        reason: body.reason,
        launcherVersion: body.launcherVersion,
        consent: true,
        text: body.text,
      });
      return {
        ok: true,
        id: saved.id,
        sizeBytes: saved.sizeBytes,
        expiresAt: saved.expiresAt,
        retentionDays: SUPPORT_LOG_RETENTION_DAYS,
        maxBytes: SUPPORT_LOG_MAX_BYTES,
        message:
          "Support log received. Staff may use it only to diagnose your issue. It is deleted after the retention period.",
      };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /** Current user: their own upload history (metadata only) */
  app.get("/v1/support/logs/mine", async (req) => {
    const user = await requireUser(req);
    return {
      logs: listSupportLogsForUser(user.id).map((r) => toPublicSupportLog(r, false)),
      retentionDays: SUPPORT_LOG_RETENTION_DAYS,
    };
  });

  /** Staff: list recent support dumps (metadata) */
  app.get("/v1/support/logs", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    purgeExpiredSupportLogs();
    return {
      logs: listSupportLogs(100).map((r) => toPublicSupportLog(r, true)),
      retentionDays: SUPPORT_LOG_RETENTION_DAYS,
    };
  });

  /** Staff: download one dump (private; not CDN) */
  app.get("/v1/support/logs/:id", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const id = Number((req.params as { id: string }).id);
    const file = getSupportLogFile(id);
    if (!file) return reply.code(404).send({ error: "Not found or expired" });
    return {
      ok: true,
      meta: toPublicSupportLog(file.row, true),
      text: file.text,
    };
  });

  // --- Bug reports (launcher tab) ---

  app.get("/v1/bug-reports", async (req) => {
    const user = await requireUser(req);
    const staff = await checkStaffAccess(user.discord_id);
    const q = req.query as { all?: string; status?: string };
    if (staff.isStaff && (q.all === "1" || q.all === "true")) {
      return {
        reports: listAllBugReports(200, q.status),
        admin: true,
        staffRoles: staff.roleLabels,
        categories: ["crash", "multiplayer", "launcher", "mods", "character", "other"],
      };
    }
    return {
      reports: listBugReportsForUser(user.id),
      admin: staff.isStaff,
      staffRoles: staff.roleLabels,
      categories: ["crash", "multiplayer", "launcher", "mods", "character", "other"],
    };
  });

  app.post("/v1/bug-reports", async (req, reply) => {
    const user = await requireUser(req);
    const body = (req.body || {}) as {
      title?: string;
      body?: string;
      category?: string;
      launcherVersion?: string;
      gameVersion?: string;
      characterSlot?: number | null;
      characterName?: string | null;
    };
    try {
      const report = createBugReport({
        userId: user.id,
        profileId: user.profile_id,
        title: body.title || "",
        body: body.body || "",
        category: body.category,
        launcherVersion: body.launcherVersion,
        gameVersion: body.gameVersion,
        characterSlot: body.characterSlot,
        characterName: body.characterName,
      });
      return { ok: true, report };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  app.get("/v1/bug-reports/:id", async (req, reply) => {
    const user = await requireUser(req);
    const id = Number((req.params as { id: string }).id);
    const staff = await checkStaffAccess(user.discord_id);
    const report = getBugReport(id, user.id, staff.isStaff);
    if (!report) return reply.code(404).send({ error: "Not found" });
    return { report, admin: staff.isStaff, staffRoles: staff.roleLabels };
  });

  /** Staff: update status / note (Discord roles: Founder / SGM / GM) */
  app.patch("/v1/bug-reports/:id", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const id = Number((req.params as { id: string }).id);
    const body = (req.body || {}) as { status?: string; staffNote?: string | null };
    try {
      const report = updateBugReportStatus(id, body.status || "open", body.staffNote);
      return { ok: true, report };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /** Staff: permanently delete a bug report */
  app.delete("/v1/bug-reports/:id", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const id = Number((req.params as { id: string }).id);
    try {
      deleteBugReport(id);
      return { ok: true };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /** Staff: all characters linked to accounts / world actors */
  app.get("/v1/admin/characters", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const q = req.query as { q?: string; includeEmpty?: string };
    const characters = listAdminCharacters({
      q: q.q,
      includeEmpty: q.includeEmpty === "1" || q.includeEmpty === "true",
      limit: 1000,
    });
    return {
      ok: true,
      characters,
      actions: [
        "ban",
        "unban",
        "warn",
        "delete_character",
        "wipe_inventory",
        "wipe_equipment",
        "wipe_spells",
        "wipe_map_markers",
        "reset_position",
      ],
    };
  });

  /** Staff: moderation action on a character */
  app.post("/v1/admin/characters/:id/action", async (req, reply) => {
    let staffUser: DbUser;
    try {
      ({ user: staffUser } = await requireStaff(req));
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const id = Number((req.params as { id: string }).id);
    const body = (req.body || {}) as { action?: string; note?: string };
    try {
      const result = runCharacterAdminAction({
        characterId: id,
        staffUserId: staffUser.id,
        action: body.action || "",
        note: body.note,
      });
      return result;
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  app.get("/v1/admin/users/:userId/warnings", async (req, reply) => {
    try {
      await requireStaff(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const userId = Number((req.params as { userId: string }).userId);
    return { ok: true, warnings: listUserWarnings(userId) };
  });

  /** Game server: pending moderation actions (wipe inv/spells/kick ban, etc.) */
  app.get("/v1/game/pending-admin-actions", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    return { ok: true, actions: listPendingAdminActions(100) };
  });

  app.post("/v1/game/pending-admin-actions/ack", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    const body = (req.body || {}) as { ids?: number[] };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x) => Number(x)).filter((x) => x > 0)
      : [];
    return { ok: true, done: ackAdminActions(ids) };
  });

  /** Staff dashboard summary */
  app.get("/v1/admin/summary", async (req, reply) => {
    let staff: StaffCheckResult;
    try {
      ({ staff } = await requireStaff(req));
    } catch (e: any) {
      return reply.code(e?.statusCode || 403).send({ error: e?.message || "Staff only" });
    }
    const bugs = bugReportStats();
    const users = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM users`)
      .get() as { c: number };
    const characters = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM characters WHERE empty = 0 AND deleted = 0`)
      .get() as { c: number };
    const status = await getServerStatus();
    return {
      ok: true,
      staffRoles: staff.roleLabels,
      staffRoleIds: staff.roleIds,
      bugs,
      users: Number(users.c || 0),
      characters: Number(characters.c || 0),
      server: {
        gameOnline: status.gameOnline,
        playersOnline: status.playersOnline,
        maxPlayers: status.maxPlayers,
        maintenance: status.maintenance,
        message: status.message,
      },
      recentBugs: listAllBugReports(25, "open"),
    };
  });

  // --- Characters (2 slots per account) ---

  app.get("/v1/characters", async (req) => {
    const user = await requireUser(req);
    // Lightweight list for launcher UI — SQLite indexed by user_id
    return {
      characters: listCharacters(user.id),
      maxSlots: 2,
      profileId: user.profile_id,
    };
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
      // Queues SkyMP destroyActor via character_wipes — launcher UI alone is not enough
      const result = deleteCharacter(user.id, Number(id), user.profile_id);
      return {
        ok: true,
        wipedActorFormId: result.wipedActorFormId,
        note: result.wipedActorFormId
          ? "World actor queued for destroy on game server"
          : "Launcher slot cleared (no bound world actor)",
      };
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

  // --- Game-server character DB (bind / wipe / full state) ---

  function requireGameSecret(req: FastifyRequest): void {
    const header = String(req.headers["x-voa-game-secret"] || "").trim();
    const q = String((req.query as { secret?: string })?.secret || "").trim();
    const secret = header || q;
    if (!secret || secret !== config.gameServerSecret) {
      const err = new Error("Unauthorized game server") as Error & {
        statusCode: number;
      };
      err.statusCode = 401;
      throw err;
    }
  }

  function sessionRow(session: string) {
    return getDb()
      .prepare(
        `SELECT user_id, profile_id, character_slot FROM game_sessions
         WHERE session_id = ? AND datetime(expires_at) > datetime('now')`
      )
      .get(session) as
      | { user_id: number; profile_id: number; character_slot?: number }
      | undefined;
  }

  /**
   * Spawn binding for game server: which world actor belongs to this slot,
   * plus last saved position / gear / inventory / map markers.
   */
  app.get("/v1/game/character-binding", async (req, reply) => {
    // Auth: game secret (scamp) OR valid game session (client look restore)
    const q = req.query as {
      profileId?: string;
      slot?: string;
      session?: string;
    };
    let profileId = Number(q.profileId);
    let slot = Number(q.slot);
    const headerSecret = String(req.headers["x-voa-game-secret"] || "").trim();
    const qSecret = String((q as { secret?: string }).secret || "").trim();
    const secret = headerSecret || qSecret;
    let authed = false;
    if (secret && secret === config.gameServerSecret) {
      authed = true;
    } else if (q.session) {
      const row = sessionRow(String(q.session));
      if (!row) return reply.code(401).send({ error: "Invalid session" });
      profileId = row.profile_id;
      authed = true;
      if (!(slot >= 0 && slot <= 1)) {
        if (typeof row.character_slot === "number") {
          slot = row.character_slot;
        } else {
          const meta = getDb()
            .prepare(`SELECT value FROM meta WHERE key = ?`)
            .get(`session_slot:${q.session}`) as { value: string } | undefined;
          slot = meta ? Number(meta.value) : 0;
        }
      }
    }
    if (!authed) {
      try {
        requireGameSecret(req);
        authed = true;
      } catch (e: any) {
        return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
      }
    }
    if (!(profileId > 0) || !(slot >= 0 && slot <= 1)) {
      return reply.code(400).send({ error: "profileId and slot required" });
    }
    const binding = getCharacterBindingByProfileSlot(profileId, slot);
    if (!binding) {
      return reply.code(404).send({ error: "No character for profile/slot" });
    }
    const allSlots = listBindingsForProfile(profileId);
    return { ok: true, profileId, binding, allSlots };
  });

  /** Bind newly created SkyMP actor form id to launcher slot. */
  app.post("/v1/game/character-bind", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    const body = (req.body || {}) as {
      profileId?: number;
      slot?: number;
      actorFormId?: number;
    };
    try {
      const character = bindCharacterActor(
        Number(body.profileId),
        Number(body.slot),
        Number(body.actorFormId)
      );
      return { ok: true, character };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /**
   * Full character state upsert (name, pos, equipment, inventory, map markers).
   * Called by gamemode on disconnect / interval, or client with session auth.
   */
  app.post("/v1/game/character-state", async (req, reply) => {
    const body = (req.body || {}) as {
      secret?: string;
      session?: string;
      profileId?: number;
      slot?: number;
      name?: string;
      actorFormId?: number;
      worldOrCell?: number;
      pos?: number[];
      angleZ?: number;
      equipment?: unknown;
      inventory?: unknown;
      appearance?: unknown;
      mapMarkers?: unknown;
    };

    let profileId = 0;
    let slot =
      typeof body.slot === "number" && body.slot >= 0 && body.slot <= 1
        ? body.slot
        : 0;

    const headerSecret = String(req.headers["x-voa-game-secret"] || "").trim();
    const secret = headerSecret || String(body.secret || "").trim();
    if (secret && secret === config.gameServerSecret) {
      profileId = Number(body.profileId) || 0;
    } else if (body.session) {
      const row = sessionRow(String(body.session));
      if (!row) return reply.code(401).send({ error: "Invalid session" });
      profileId = row.profile_id;
      if (typeof body.profileId === "number" && body.profileId !== profileId) {
        return reply.code(403).send({ error: "profile mismatch" });
      }
    } else {
      return reply.code(401).send({ error: "session or game secret required" });
    }
    if (!(profileId > 0)) {
      return reply.code(400).send({ error: "profileId required" });
    }
    try {
      const character = saveCharacterState(profileId, slot, {
        name: body.name,
        actorFormId: body.actorFormId,
        worldOrCell: body.worldOrCell,
        pos: body.pos,
        angleZ: body.angleZ,
        equipment: body.equipment,
        inventory: body.inventory,
        appearance: body.appearance,
        mapMarkers: body.mapMarkers,
      });
      return { ok: true, character };
    } catch (e: any) {
      return reply.code(e?.statusCode || 500).send({ error: e?.message || String(e) });
    }
  });

  /** Pending world-actor destroys for gamemode (delete character in launcher). */
  app.get("/v1/game/pending-wipes", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    const wipes = listPendingWipes(100).map((w) => ({
      id: w.id,
      profileId: w.profile_id,
      actorFormId: w.actor_form_id,
      slot: w.slot,
    }));
    return { ok: true, wipes };
  });

  app.post("/v1/game/pending-wipes/ack", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    const body = (req.body || {}) as { ids?: number[] };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x) => Number(x)).filter((x) => x > 0)
      : [];
    const done = markWipesDone(ids);
    return { ok: true, done };
  });

  /**
   * Game server reports all actors for a profile; API queues destroy for any
   * not bound to a live launcher slot (fixes "deleted but still Roman").
   */
  app.post("/v1/game/orphan-actors", async (req, reply) => {
    try {
      requireGameSecret(req);
    } catch (e: any) {
      return reply.code(e?.statusCode || 401).send({ error: e?.message || "unauthorized" });
    }
    const body = (req.body || {}) as {
      profileId?: number;
      actorFormIds?: number[];
    };
    const profileId = Number(body.profileId);
    const ids = Array.isArray(body.actorFormIds)
      ? body.actorFormIds.map((x) => Number(x)).filter((x) => x > 0)
      : [];
    if (!(profileId > 0)) {
      return reply.code(400).send({ error: "profileId required" });
    }
    const queued = queueOrphanWipes(profileId, ids);
    return { ok: true, queued };
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

  /**
   * Authoritative skymp5-client.js for launchers (must match game-server ClientVerify).
   * Place file at DATA_DIR/cdn/client/skymp5-client.js (synced from voa-server/dist_front).
   */
  app.get("/v1/client/skymp5-client.js", async (_req, reply) => {
    const filePath = path.join(config.dataDir, "cdn", "client", "skymp5-client.js");
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        error: "Multiplayer client not published",
        hint: "Place skymp5-client.js under DATA_DIR/cdn/client/",
      });
    }
    const st = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    return reply
      .header("Content-Type", "application/javascript; charset=utf-8")
      .header("Content-Length", String(st.size))
      .header("Cache-Control", "no-cache")
      .header("X-VOA-Client-File", "skymp5-client.js")
      .send(stream);
  });

  app.get("/v1/client/info", async (_req, reply) => {
    const filePath = path.join(config.dataDir, "cdn", "client", "skymp5-client.js");
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ available: false });
    }
    const st = fs.statSync(filePath);
    const buf = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    return {
      available: true,
      size: st.size,
      sha256,
      downloadUrl: `${config.publicUrl.replace(/\/$/, "")}/v1/client/skymp5-client.js`,
    };
  });

  /**
   * In-game proximity voice CEF assets (voice.html / voice-app.js).
   * Served from DATA_DIR/cdn/voice/ — keep path basename-only (no zip-slip).
   */
  app.get("/cdn/voice/:fileName", async (req, reply) => {
    const fileName = path.basename(String((req.params as { fileName: string }).fileName || ""));
    if (!fileName || fileName !== String((req.params as { fileName: string }).fileName)) {
      return reply.code(400).send({ error: "Invalid file name" });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      return reply.code(400).send({ error: "Invalid file name" });
    }
    const filePath = path.join(config.dataDir, "cdn", "voice", fileName);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "Not found", hint: "Place files under DATA_DIR/cdn/voice/" });
    }
    const ext = path.extname(fileName).toLowerCase();
    const type =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
    const stream = fs.createReadStream(filePath);
    return reply.header("Content-Type", type).send(stream);
  });

  /** Stream launcher update artifact (portable .exe or full-app .zip) from data/cdn/launcher/ */
  app.get("/cdn/launcher/:fileName", async (req, reply) => {
    const { fileName } = req.params as { fileName: string };
    const allowed = new Set([
      "VisionsOfAetherius.exe",
      "VisionsOfAetherius-update.zip",
      "VOA-Launcher-update.zip",
      "VisionsOfAetherius-Setup.exe",
    ]);
    if (!allowed.has(fileName)) {
      return reply.code(404).send({ error: "Unknown launcher artifact" });
    }
    const exact = getLauncherCdnFile(fileName);
    if (!exact) {
      return reply.code(404).send({
        error: "Launcher artifact not published yet",
        hint: `Place ${fileName} under DATA_DIR/cdn/launcher/`,
      });
    }
    const stream = fs.createReadStream(exact);
    const st = fs.statSync(exact);
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .header("Content-Length", String(st.size))
      .header("Cache-Control", "public, max-age=120")
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

  /**
   * Stream a local VOA package archive for the launcher download manager.
   *
   * Nexus packages are NEVER streamed or proxied here (Nexus §1–§2):
   * the launcher uses user-initiated OAuth (Bearer access_token) →
   * download_link.json → direct HTTPS CDN. No personal apikey. No rehost.
   */
  app.get("/v1/mods/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const meta = getCatalogMeta(id);
    if (!meta) {
      return reply.code(404).send({ error: "Package not found" });
    }

    if (meta.source === "nexus") {
      return reply.code(400).send({
        error:
          "Nexus packages are not hosted by VOA. Use launcher Nexus OAuth (browser login), then direct CDN download.",
        hint: "Account tab → Log in to Nexus Mods (OAuth). Install uses your user Bearer token only — never a server personal API key.",
        source: "nexus",
        architecture: "oauth-user-initiated-direct-cdn",
        nexusGame: meta.nexusGame,
        nexusModId: meta.nexusModId,
        nexusFileId: meta.nexusFileId,
        remapSkseToData: Boolean(meta.remapSkseToData),
      });
    }

    const resolved = resolvePackageArchive(id);
    if (!resolved) {
      return reply.code(404).send({ error: "Package archive not available" });
    }
    const { meta: localMeta, archivePath } = resolved;
    const st = fs.statSync(archivePath);
    const stream = fs.createReadStream(archivePath);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Length", st.size)
      .header(
        "Content-Disposition",
        `attachment; filename="${localMeta.filename.replace(/"/g, "")}"`
      )
      .header("X-VOA-Package-Id", localMeta.id)
      .header("X-VOA-Package-Version", localMeta.version)
      .header("X-VOA-Package-Source", "local")
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

    // identify = profile; guilds = community membership;
    // guilds.members.read = own roles in guild (staff Admin tab without bot token)
    const scopes = config.requireDiscordGuild
      ? "identify guilds guilds.members.read"
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

    // Resolve Founder/SGM/GM roles at login (OAuth member roles → DB cache)
    try {
      const staff = await refreshStaffRolesAtLogin(
        me.id,
        tokenJson.access_token,
        user.id
      );
      app.log.info(
        {
          discordId: me.id,
          profileId: user.profile_id,
          isStaff: staff.isStaff,
          roles: staff.roleLabels,
          method: staff.method,
        },
        "staff role check at login"
      );
    } catch (eStaff) {
      app.log.warn({ err: eStaff, discordId: me.id }, "staff role refresh failed");
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
