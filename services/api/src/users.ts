import {
  allocateProfileId,
  avatarUrl,
  getDb,
  type DbUser,
} from "./db";

export function getUserById(id: number): DbUser | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByDiscordId(discordId: string): DbUser | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE discord_id = ?")
    .get(discordId) as DbUser | undefined;
}

export function upsertDiscordUser(input: {
  discordId: string;
  username: string;
  discriminator?: string | null;
  avatar?: string | null;
}): DbUser {
  const existing = getUserByDiscordId(input.discordId);
  const now = new Date().toISOString();
  if (existing) {
    getDb()
      .prepare(
        `UPDATE users SET username = ?, discriminator = ?, avatar = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.username,
        input.discriminator ?? null,
        input.avatar ?? null,
        now,
        existing.id
      );
    return getUserById(existing.id)!;
  }
  const profileId = allocateProfileId();
  const info = getDb()
    .prepare(
      `INSERT INTO users (profile_id, discord_id, username, discriminator, avatar, banned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .run(
      profileId,
      input.discordId,
      input.username,
      input.discriminator ?? null,
      input.avatar ?? null,
      now,
      now
    );
  return getUserById(Number(info.lastInsertRowid))!;
}

// node:sqlite StatementResult uses lastInsertRowid

export function toPublicUser(user: DbUser) {
  return {
    id: user.id,
    profileId: user.profile_id,
    discordId: user.discord_id,
    username: user.username,
    discriminator: user.discriminator,
    avatarUrl: avatarUrl(user.discord_id, user.avatar),
    banned: Boolean(user.banned),
  };
}

/** Cache Discord role IDs from OAuth or bot (for staff Admin tab without bot on every request). */
export function saveUserStaffRoles(userId: number, roleIds: string[]): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE users SET staff_roles_json = ?, staff_checked_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(JSON.stringify(roleIds || []), now, now, userId);
}

export function getUserStaffRoleCache(userId: number): {
  roleIds: string[];
  checkedAt: string | null;
} {
  const row = getDb()
    .prepare(`SELECT staff_roles_json, staff_checked_at FROM users WHERE id = ?`)
    .get(userId) as
    | { staff_roles_json: string | null; staff_checked_at: string | null }
    | undefined;
  if (!row) return { roleIds: [], checkedAt: null };
  let roleIds: string[] = [];
  try {
    const parsed = JSON.parse(row.staff_roles_json || "[]");
    if (Array.isArray(parsed)) roleIds = parsed.map(String);
  } catch {
    roleIds = [];
  }
  return { roleIds, checkedAt: row.staff_checked_at };
}
