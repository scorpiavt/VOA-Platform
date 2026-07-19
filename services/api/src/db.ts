import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config";

export type DbUser = {
  id: number;
  profile_id: number;
  discord_id: string;
  username: string;
  discriminator: string | null;
  avatar: string | null;
  banned: number;
  created_at: string;
  updated_at: string;
  /** JSON array of Discord role snowflakes last seen for staff checks */
  staff_roles_json?: string | null;
  staff_checked_at?: string | null;
};

export type DbSession = {
  session_id: string;
  user_id: number;
  profile_id: number;
  expires_at: string;
  created_at: string;
};

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) throw new Error("DB not initialized");
  return db;
}

export function initDb(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, "voa.db");
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL UNIQUE,
      discord_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      discriminator TEXT,
      avatar TEXT,
      banned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      published_at TEXT NOT NULL,
      author_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS oauth_pending (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_handoff (
      state TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK(slot IN (0, 1)),
      name TEXT NOT NULL DEFAULT 'Empty Slot',
      empty INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0,
      last_played_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      actor_form_id INTEGER,
      world_or_cell INTEGER,
      pos_x REAL,
      pos_y REAL,
      pos_z REAL,
      angle_z REAL,
      equipment_json TEXT,
      inventory_json TEXT,
      appearance_json TEXT,
      map_markers_json TEXT,
      UNIQUE(user_id, slot)
    );

    CREATE TABLE IF NOT EXISTS character_wipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      actor_form_id INTEGER NOT NULL,
      slot INTEGER,
      user_id INTEGER,
      created_at TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      done_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_character_wipes_pending
      ON character_wipes(done, profile_id);

    CREATE TABLE IF NOT EXISTS bug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'open',
      launcher_version TEXT,
      game_version TEXT,
      character_slot INTEGER,
      character_name TEXT,
      staff_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bug_reports_user
      ON bug_reports(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_status
      ON bug_reports(status, id DESC);

    CREATE TABLE IF NOT EXISTS user_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      staff_user_id INTEGER,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_warnings_user
      ON user_warnings(user_id, id DESC);

    CREATE TABLE IF NOT EXISTS admin_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_user_id INTEGER,
      target_profile_id INTEGER,
      target_character_id INTEGER,
      target_actor_form_id INTEGER,
      target_slot INTEGER,
      staff_user_id INTEGER,
      note TEXT,
      payload_json TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      done_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_admin_actions_pending
      ON admin_actions(done, id ASC);
  `);

  // Migrations for DBs created before world-state columns existed
  const charCols = (
    db.prepare(`PRAGMA table_info(characters)`).all() as { name: string }[]
  ).map((c) => c.name);
  const addCharCol = (name: string, ddl: string) => {
    if (!charCols.includes(name)) {
      db.exec(`ALTER TABLE characters ADD COLUMN ${ddl}`);
    }
  };
  addCharCol("actor_form_id", "actor_form_id INTEGER");
  addCharCol("world_or_cell", "world_or_cell INTEGER");
  addCharCol("pos_x", "pos_x REAL");
  addCharCol("pos_y", "pos_y REAL");
  addCharCol("pos_z", "pos_z REAL");
  addCharCol("angle_z", "angle_z REAL");
  addCharCol("equipment_json", "equipment_json TEXT");
  addCharCol("inventory_json", "inventory_json TEXT");
  addCharCol("appearance_json", "appearance_json TEXT");
  addCharCol("map_markers_json", "map_markers_json TEXT");

  // Staff role cache (OAuth guilds.members.read or bot member fetch)
  const userCols = (
    db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]
  ).map((c) => c.name);
  if (!userCols.includes("staff_roles_json")) {
    db.exec(`ALTER TABLE users ADD COLUMN staff_roles_json TEXT`);
  }
  if (!userCols.includes("staff_checked_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN staff_checked_at TEXT`);
  }

  // Support log metadata (files live under data/support-logs/, not public CDN)
  db.exec(`
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

  const count = db.prepare("SELECT COUNT(*) AS c FROM news").get() as { c: number };
  if (count.c === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO news (title, body, pinned, tags, published_at, author_user_id)
       VALUES (?, ?, 1, ?, ?, NULL)`
    ).run(
      "Welcome to Visions of Aetherius",
      "The VOA launcher platform is online. Log in with Discord, then press **Play** to join the server.\n\nThis is early infrastructure — thank you for testing.",
      JSON.stringify(["announcement"]),
      now
    );
  }

  const meta = db.prepare("SELECT value FROM meta WHERE key = 'next_profile_id'").get() as
    | { value: string }
    | undefined;
  if (!meta) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('next_profile_id', '1000')").run();
  }
}

export function allocateProfileId(): number {
  const row = getDb()
    .prepare("SELECT value FROM meta WHERE key = 'next_profile_id'")
    .get() as { value: string };
  const id = Number(row.value);
  getDb()
    .prepare("UPDATE meta SET value = ? WHERE key = 'next_profile_id'")
    .run(String(id + 1));
  return id;
}

export function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
}
