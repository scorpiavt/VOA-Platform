import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { getDb } from "./db";

/** Max raw log text per upload (after redaction), bytes */
export const SUPPORT_LOG_MAX_BYTES = 512 * 1024;
/** Keep support dumps this many days */
export const SUPPORT_LOG_RETENTION_DAYS = 30;

export type SupportLogRow = {
  id: number;
  user_id: number;
  profile_id: number;
  discord_id: string;
  username: string;
  reason: string | null;
  launcher_version: string | null;
  consent: number;
  size_bytes: number;
  file_name: string;
  sha256: string;
  created_at: string;
  expires_at: string;
};

function supportDir(): string {
  const dir = path.join(config.dataDir, "support-logs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureSupportLogsTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS support_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL,
      discord_id TEXT NOT NULL,
      username TEXT NOT NULL,
      reason TEXT,
      launcher_version TEXT,
      consent INTEGER NOT NULL DEFAULT 1,
      size_bytes INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_support_logs_user ON support_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_logs_created ON support_logs(created_at);
  `);
}

/** Best-effort redaction (also done client-side). */
export function redactSupportText(input: string): string {
  let s = String(input || "");
  // Windows user paths
  s = s.replace(/([A-Za-z]:\\Users\\)[^\\\/\s"']+/gi, "$1REDACTED");
  s = s.replace(/(\/Users\/)[^\/\s"']+/g, "$1REDACTED");
  s = s.replace(/(\\Users\\)[^\\\/\s"']+/gi, "$1REDACTED");
  // Bearer / tokens / sessions
  s = s.replace(/(Bearer\s+)[A-Za-z0-9\-._~+\/]+=*/gi, "$1[REDACTED]");
  s = s.replace(
    /("?(?:accessToken|refreshToken|session|token|secret|password|authorization)"?\s*[:=]\s*")[^"]*(")/gi,
    "$1[REDACTED]$2"
  );
  s = s.replace(/(session=)[^&\s"']+/gi, "$1[REDACTED]");
  s = s.replace(/(GAME_SERVER_SECRET|JWT_SECRET|VOA_GAME_SECRET)=[^\s"']+/gi, "$1=[REDACTED]");
  // Long hex/base64-ish blobs that look like tokens
  s = s.replace(/\b[A-Za-z0-9_-]{80,}\b/g, "[REDACTED_TOKEN]");
  return s;
}

export function saveSupportLog(opts: {
  userId: number;
  profileId: number;
  discordId: string;
  username: string;
  reason?: string | null;
  launcherVersion?: string | null;
  consent: boolean;
  text: string;
}): { id: number; sizeBytes: number; expiresAt: string; sha256: string } {
  if (!opts.consent) {
    const err = new Error("Explicit consent is required to upload support logs") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  let text = redactSupportText(opts.text || "");
  if (!text.trim()) {
    const err = new Error("Log payload is empty") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }
  const buf = Buffer.from(text, "utf8");
  if (buf.length > SUPPORT_LOG_MAX_BYTES) {
    // Keep tail (most recent)
    text = buf.subarray(buf.length - SUPPORT_LOG_MAX_BYTES).toString("utf8");
  }
  const finalBuf = Buffer.from(text, "utf8");
  const sha256 = crypto.createHash("sha256").update(finalBuf).digest("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SUPPORT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const createdAt = now.toISOString();
  const expiresAt = expires.toISOString();
  const fileName = `p${opts.profileId}_${now.toISOString().replace(/[:.]/g, "-")}_${sha256.slice(0, 12)}.log`;
  const filePath = path.join(supportDir(), fileName);
  fs.writeFileSync(filePath, finalBuf);

  const info = getDb()
    .prepare(
      `INSERT INTO support_logs
       (user_id, profile_id, discord_id, username, reason, launcher_version, consent, size_bytes, file_name, sha256, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.userId,
      opts.profileId,
      opts.discordId,
      opts.username,
      (opts.reason || "").slice(0, 200) || null,
      (opts.launcherVersion || "").slice(0, 64) || null,
      finalBuf.length,
      fileName,
      sha256,
      createdAt,
      expiresAt
    );

  return {
    id: Number(info.lastInsertRowid),
    sizeBytes: finalBuf.length,
    expiresAt,
    sha256,
  };
}

export function listSupportLogs(limit = 100): SupportLogRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM support_logs ORDER BY id DESC LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 500)) as SupportLogRow[];
}

export function listSupportLogsForUser(userId: number, limit = 20): SupportLogRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM support_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, Math.min(Math.max(limit, 1), 50)) as SupportLogRow[];
}

export function getSupportLogFile(id: number): { row: SupportLogRow; text: string } | null {
  const row = getDb()
    .prepare(`SELECT * FROM support_logs WHERE id = ?`)
    .get(id) as SupportLogRow | undefined;
  if (!row) return null;
  const fp = path.join(supportDir(), row.file_name);
  if (!fs.existsSync(fp)) return null;
  return { row, text: fs.readFileSync(fp, "utf8") };
}

/** Delete expired dumps (call on startup / periodic). */
export function purgeExpiredSupportLogs(): number {
  const now = new Date().toISOString();
  const rows = getDb()
    .prepare(`SELECT id, file_name FROM support_logs WHERE expires_at < ?`)
    .all(now) as { id: number; file_name: string }[];
  let n = 0;
  for (const r of rows) {
    try {
      const fp = path.join(supportDir(), r.file_name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
    getDb().prepare(`DELETE FROM support_logs WHERE id = ?`).run(r.id);
    n++;
  }
  return n;
}

export function toPublicSupportLog(r: SupportLogRow, staff = false) {
  return {
    id: r.id,
    profileId: r.profile_id,
    username: staff ? r.username : undefined,
    discordId: staff ? r.discord_id : undefined,
    reason: r.reason,
    launcherVersion: r.launcher_version,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    sha256: r.sha256,
  };
}
