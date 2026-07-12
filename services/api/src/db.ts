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
      UNIQUE(user_id, slot)
    );
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
