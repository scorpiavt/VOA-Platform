import { getDb } from "./db";

export type BugCategory =
  | "crash"
  | "multiplayer"
  | "launcher"
  | "mods"
  | "character"
  | "other";

export type BugStatus = "open" | "triaged" | "in_progress" | "resolved" | "wont_fix";

export type BugReportRow = {
  id: number;
  user_id: number;
  profile_id: number;
  title: string;
  body: string;
  category: string;
  status: string;
  launcher_version: string | null;
  game_version: string | null;
  character_slot: number | null;
  character_name: string | null;
  staff_note: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicBugReport = {
  id: number;
  title: string;
  body: string;
  category: BugCategory | string;
  status: BugStatus | string;
  launcherVersion: string | null;
  gameVersion: string | null;
  characterSlot: number | null;
  characterName: string | null;
  staffNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on admin list only */
  username?: string;
  profileId?: number;
  discordId?: string;
};

const CATEGORIES = new Set<string>([
  "crash",
  "multiplayer",
  "launcher",
  "mods",
  "character",
  "other",
]);

const STATUSES = new Set<string>([
  "open",
  "triaged",
  "in_progress",
  "resolved",
  "wont_fix",
]);

function toPublic(r: BugReportRow, extra?: Partial<PublicBugReport>): PublicBugReport {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    status: r.status,
    launcherVersion: r.launcher_version,
    gameVersion: r.game_version,
    characterSlot: r.character_slot,
    characterName: r.character_name,
    staffNote: r.staff_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...extra,
  };
}

export function createBugReport(input: {
  userId: number;
  profileId: number;
  title: string;
  body: string;
  category?: string;
  launcherVersion?: string;
  gameVersion?: string;
  characterSlot?: number | null;
  characterName?: string | null;
}): PublicBugReport {
  const title = String(input.title || "")
    .trim()
    .slice(0, 120);
  const body = String(input.body || "")
    .trim()
    .slice(0, 8000);
  if (title.length < 3) {
    throw Object.assign(new Error("Title must be at least 3 characters"), {
      statusCode: 400,
    });
  }
  if (body.length < 10) {
    throw Object.assign(new Error("Description must be at least 10 characters"), {
      statusCode: 400,
    });
  }
  let category = String(input.category || "other").toLowerCase();
  if (!CATEGORIES.has(category)) category = "other";

  let slot: number | null = null;
  if (typeof input.characterSlot === "number" && input.characterSlot >= 0 && input.characterSlot <= 1) {
    slot = input.characterSlot;
  }

  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO bug_reports (
         user_id, profile_id, title, body, category, status,
         launcher_version, game_version, character_slot, character_name,
         staff_note, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      input.userId,
      input.profileId,
      title,
      body,
      category,
      input.launcherVersion?.slice(0, 32) || null,
      input.gameVersion?.slice(0, 32) || null,
      slot,
      input.characterName?.trim().slice(0, 48) || null,
      now,
      now
    );

  const row = getDb()
    .prepare(`SELECT * FROM bug_reports WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as BugReportRow;
  return toPublic(row);
}

export function listBugReportsForUser(userId: number): PublicBugReport[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM bug_reports WHERE user_id = ? ORDER BY id DESC LIMIT 100`
    )
    .all(userId) as BugReportRow[];
  return rows.map((r) => toPublic(r));
}

export function listAllBugReports(limit = 100, statusFilter?: string): PublicBugReport[] {
  const lim = Math.min(Math.max(limit, 1), 500);
  let rows: (BugReportRow & { username: string; discord_id: string })[];
  if (statusFilter && statusFilter !== "all") {
    rows = getDb()
      .prepare(
        `SELECT br.*, u.username, u.discord_id
         FROM bug_reports br
         JOIN users u ON u.id = br.user_id
         WHERE br.status = ?
         ORDER BY br.id DESC
         LIMIT ?`
      )
      .all(statusFilter, lim) as (BugReportRow & {
      username: string;
      discord_id: string;
    })[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT br.*, u.username, u.discord_id
         FROM bug_reports br
         JOIN users u ON u.id = br.user_id
         ORDER BY br.id DESC
         LIMIT ?`
      )
      .all(lim) as (BugReportRow & {
      username: string;
      discord_id: string;
    })[];
  }
  return rows.map((r) =>
    toPublic(r, {
      username: r.username,
      profileId: r.profile_id,
      discordId: r.discord_id,
    })
  );
}

export function bugReportStats(): {
  total: number;
  open: number;
  triaged: number;
  in_progress: number;
  resolved: number;
  wont_fix: number;
} {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status = 'triaged' THEN 1 ELSE 0 END) AS triaged,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN status = 'wont_fix' THEN 1 ELSE 0 END) AS wont_fix
       FROM bug_reports`
    )
    .get() as Record<string, number | null>;
  return {
    total: Number(row.total || 0),
    open: Number(row.open || 0),
    triaged: Number(row.triaged || 0),
    in_progress: Number(row.in_progress || 0),
    resolved: Number(row.resolved || 0),
    wont_fix: Number(row.wont_fix || 0),
  };
}

export function getBugReport(
  id: number,
  userId: number,
  admin: boolean
): PublicBugReport | null {
  const row = getDb()
    .prepare(
      admin
        ? `SELECT br.*, u.username, u.discord_id
           FROM bug_reports br JOIN users u ON u.id = br.user_id
           WHERE br.id = ?`
        : `SELECT * FROM bug_reports WHERE id = ? AND user_id = ?`
    )
    .get(...(admin ? [id] : [id, userId])) as
    | (BugReportRow & { username?: string; discord_id?: string })
    | undefined;
  if (!row) return null;
  return toPublic(row, {
    username: row.username,
    profileId: row.profile_id,
    discordId: row.discord_id,
  });
}

export function updateBugReportStatus(
  id: number,
  status: string,
  staffNote?: string | null
): PublicBugReport {
  const st = String(status || "").toLowerCase();
  if (!STATUSES.has(st)) {
    throw Object.assign(new Error("Invalid status"), { statusCode: 400 });
  }
  const existing = getDb()
    .prepare(`SELECT * FROM bug_reports WHERE id = ?`)
    .get(id) as BugReportRow | undefined;
  if (!existing) {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }
  const now = new Date().toISOString();
  const note =
    staffNote === undefined
      ? existing.staff_note
      : staffNote === null
        ? null
        : String(staffNote).trim().slice(0, 2000) || null;
  getDb()
    .prepare(
      `UPDATE bug_reports SET status = ?, staff_note = ?, updated_at = ? WHERE id = ?`
    )
    .run(st, note, now, id);
  const row = getDb()
    .prepare(`SELECT * FROM bug_reports WHERE id = ?`)
    .get(id) as BugReportRow;
  return toPublic(row);
}

/** Hard-delete a bug report (staff only). */
export function deleteBugReport(id: number): void {
  const existing = getDb()
    .prepare(`SELECT id FROM bug_reports WHERE id = ?`)
    .get(id) as { id: number } | undefined;
  if (!existing) {
    throw Object.assign(new Error("Not found"), { statusCode: 404 });
  }
  getDb().prepare(`DELETE FROM bug_reports WHERE id = ?`).run(id);
}
