import { getDb } from "./db";

export type CharacterRow = {
  id: number;
  user_id: number;
  slot: number;
  name: string;
  empty: number;
  deleted: number;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicCharacter = {
  id: number;
  slot: number;
  name: string;
  empty: boolean;
  lastPlayedAt: string | null;
  createdAt: string;
};

const MAX_SLOTS = 2;

export function ensureCharacterSlots(userId: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const existing = db
      .prepare(
        `SELECT id FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
      )
      .get(userId, slot) as { id: number } | undefined;
    if (!existing) {
      // Soft-deleted row may occupy unique(user_id,slot) — revive empty or insert
      const any = db
        .prepare(`SELECT id, deleted FROM characters WHERE user_id = ? AND slot = ?`)
        .get(userId, slot) as { id: number; deleted: number } | undefined;
      if (any && any.deleted) {
        db.prepare(
          `UPDATE characters SET deleted = 0, empty = 1, name = 'Empty Slot',
           last_played_at = NULL, updated_at = ? WHERE id = ?`
        ).run(now, any.id);
      } else if (!any) {
        db.prepare(
          `INSERT INTO characters (user_id, slot, name, empty, deleted, created_at, updated_at)
           VALUES (?, ?, 'Empty Slot', 1, 0, ?, ?)`
        ).run(userId, slot, now, now);
      }
    }
  }
}

export function listCharacters(userId: number): PublicCharacter[] {
  ensureCharacterSlots(userId);
  const rows = getDb()
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND deleted = 0 ORDER BY slot ASC`
    )
    .all(userId) as CharacterRow[];
  return rows.map((r) => ({
    id: r.id,
    slot: r.slot,
    name: r.name,
    empty: Boolean(r.empty),
    lastPlayedAt: r.last_played_at,
    createdAt: r.created_at,
  }));
}

export function createCharacter(
  userId: number,
  slot: number,
  name?: string
): PublicCharacter {
  if (slot < 0 || slot > 1) throw Object.assign(new Error("Invalid slot"), { statusCode: 400 });
  ensureCharacterSlots(userId);
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`)
    .get(userId, slot) as CharacterRow | undefined;
  if (!row) throw Object.assign(new Error("Slot not found"), { statusCode: 404 });
  if (!row.empty) {
    throw Object.assign(new Error("Slot already has a character — delete first"), {
      statusCode: 409,
    });
  }
  const now = new Date().toISOString();
  const charName = (name?.trim() || `New Character ${slot + 1}`).slice(0, 48);
  db.prepare(
    `UPDATE characters SET name = ?, empty = 0, updated_at = ? WHERE id = ?`
  ).run(charName, now, row.id);
  const updated = db.prepare(`SELECT * FROM characters WHERE id = ?`).get(row.id) as CharacterRow;
  return {
    id: updated.id,
    slot: updated.slot,
    name: updated.name,
    empty: false,
    lastPlayedAt: updated.last_played_at,
    createdAt: updated.created_at,
  };
}

export function deleteCharacter(userId: number, characterId: number): void {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM characters WHERE id = ? AND user_id = ? AND deleted = 0`)
    .get(characterId, userId) as CharacterRow | undefined;
  if (!row) throw Object.assign(new Error("Character not found"), { statusCode: 404 });
  const now = new Date().toISOString();
  // Reset slot to empty (keep slot available) rather than hard-delete unique key issues
  db.prepare(
    `UPDATE characters SET empty = 1, name = 'Empty Slot', last_played_at = NULL, updated_at = ? WHERE id = ?`
  ).run(now, row.id);
}

export function touchCharacterPlayed(userId: number, slot: number): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE characters SET last_played_at = ?, updated_at = ?
       WHERE user_id = ? AND slot = ? AND deleted = 0 AND empty = 0`
    )
    .run(now, now, userId, slot);
}

/** Update display name from in-game look.name (race menu / look sync). */
export function updateCharacterName(
  userId: number,
  slot: number,
  name: string
): PublicCharacter {
  if (slot < 0 || slot > 1) {
    throw Object.assign(new Error("Invalid slot"), { statusCode: 400 });
  }
  const charName = String(name || "")
    .trim()
    .slice(0, 48);
  if (!charName) {
    throw Object.assign(new Error("name required"), { statusCode: 400 });
  }
  ensureCharacterSlots(userId);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
    )
    .get(userId, slot) as CharacterRow | undefined;
  if (!row) {
    throw Object.assign(new Error("Slot not found"), { statusCode: 404 });
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE characters SET name = ?, empty = 0, updated_at = ? WHERE id = ?`
  ).run(charName, now, row.id);
  const updated = db
    .prepare(`SELECT * FROM characters WHERE id = ?`)
    .get(row.id) as CharacterRow;
  return {
    id: updated.id,
    slot: updated.slot,
    name: updated.name,
    empty: false,
    lastPlayedAt: updated.last_played_at,
    createdAt: updated.created_at,
  };
}

export function getCharacterBySlot(
  userId: number,
  slot: number
): CharacterRow | undefined {
  ensureCharacterSlots(userId);
  return getDb()
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
    )
    .get(userId, slot) as CharacterRow | undefined;
}
