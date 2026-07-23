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
  actor_form_id: number | null;
  world_or_cell: number | null;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
  angle_z: number | null;
  equipment_json: string | null;
  inventory_json: string | null;
  appearance_json: string | null;
  map_markers_json: string | null;
};

export type PublicCharacter = {
  id: number;
  slot: number;
  name: string;
  empty: boolean;
  lastPlayedAt: string | null;
  createdAt: string;
  hasWorldActor: boolean;
  hasSavedPosition: boolean;
};

export type CharacterStatePayload = {
  name?: string;
  actorFormId?: number;
  worldOrCell?: number;
  pos?: [number, number, number] | number[];
  angleZ?: number;
  equipment?: unknown;
  inventory?: unknown;
  appearance?: unknown;
  mapMarkers?: unknown;
};

export type CharacterWipeRow = {
  id: number;
  profile_id: number;
  actor_form_id: number;
  slot: number | null;
  user_id: number | null;
  created_at: string;
  done: number;
};

const MAX_SLOTS = 2;

function safeJson(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return fallback;
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPublic(r: CharacterRow): PublicCharacter {
  return {
    id: r.id,
    slot: r.slot,
    name: r.name,
    empty: Boolean(r.empty),
    lastPlayedAt: r.last_played_at,
    createdAt: r.created_at,
    hasWorldActor: r.actor_form_id != null && Number(r.actor_form_id) > 0,
    hasSavedPosition:
      r.pos_x != null && r.pos_y != null && r.pos_z != null && r.world_or_cell != null,
  };
}

function clearWorldStateSql(): string {
  return `actor_form_id = NULL,
    world_or_cell = NULL, pos_x = NULL, pos_y = NULL, pos_z = NULL, angle_z = NULL,
    equipment_json = NULL, inventory_json = NULL, appearance_json = NULL,
    map_markers_json = NULL`;
}

export function ensureCharacterSlots(userId: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  // One query for both slots instead of 2–4 round trips
  const rows = db
    .prepare(
      `SELECT id, slot, deleted FROM characters WHERE user_id = ? AND slot IN (0, 1)`
    )
    .all(userId) as Array<{ id: number; slot: number; deleted: number }>;
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const any = bySlot.get(slot);
    if (!any) {
      db.prepare(
        `INSERT INTO characters (user_id, slot, name, empty, deleted, created_at, updated_at)
         VALUES (?, ?, 'Empty Slot', 1, 0, ?, ?)`
      ).run(userId, slot, now, now);
    } else if (any.deleted) {
      db.prepare(
        `UPDATE characters SET deleted = 0, empty = 1, name = 'Empty Slot',
         last_played_at = NULL, ${clearWorldStateSql()}, updated_at = ? WHERE id = ?`
      ).run(now, any.id);
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
  return rows.map(toPublic);
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
  // Fresh character: no world actor yet. Spawn will create + bind a new one.
  db.prepare(
    `UPDATE characters SET name = ?, empty = 0, last_played_at = NULL,
     ${clearWorldStateSql()}, updated_at = ? WHERE id = ?`
  ).run(charName, now, row.id);
  const updated = db.prepare(`SELECT * FROM characters WHERE id = ?`).get(row.id) as CharacterRow;
  return toPublic(updated);
}

/**
 * Soft-empty the launcher slot AND queue destruction of the SkyMP world actor.
 * Without destroy, getActorsByProfileId still returns "Roman" forever.
 */
export function deleteCharacter(
  userId: number,
  characterId: number,
  profileId: number
): { wipedActorFormId: number | null } {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM characters WHERE id = ? AND user_id = ? AND deleted = 0`)
    .get(characterId, userId) as CharacterRow | undefined;
  if (!row) throw Object.assign(new Error("Character not found"), { statusCode: 404 });
  const now = new Date().toISOString();
  const actorFormId =
    row.actor_form_id != null && Number(row.actor_form_id) > 0
      ? Number(row.actor_form_id)
      : null;

  if (actorFormId) {
    db.prepare(
      `INSERT INTO character_wipes (profile_id, actor_form_id, slot, user_id, created_at, done)
       VALUES (?, ?, ?, ?, ?, 0)`
    ).run(profileId, actorFormId, row.slot, userId, now);
  }

  db.prepare(
    `UPDATE characters SET empty = 1, name = 'Empty Slot', last_played_at = NULL,
     ${clearWorldStateSql()}, updated_at = ? WHERE id = ?`
  ).run(now, row.id);

  return { wipedActorFormId: actorFormId };
}

/** Wipe every non-empty slot for a user (admin / bulk). */
export function deleteAllCharactersForUser(
  userId: number,
  profileId: number
): number {
  ensureCharacterSlots(userId);
  const rows = getDb()
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND deleted = 0 AND empty = 0`
    )
    .all(userId) as CharacterRow[];
  let n = 0;
  for (const r of rows) {
    deleteCharacter(userId, r.id, profileId);
    n++;
  }
  return n;
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
  return toPublic(updated);
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

/** All non-empty slot bindings for a profile (migration / orphan detection). */
export function listBindingsForProfile(profileId: number): Array<{
  slot: number;
  name: string;
  empty: boolean;
  actorFormId: number | null;
}> {
  const user = getDb()
    .prepare(`SELECT id FROM users WHERE profile_id = ?`)
    .get(profileId) as { id: number } | undefined;
  if (!user) return [];
  ensureCharacterSlots(user.id);
  const rows = getDb()
    .prepare(
      `SELECT slot, name, empty, actor_form_id FROM characters
       WHERE user_id = ? AND deleted = 0 ORDER BY slot ASC`
    )
    .all(user.id) as {
    slot: number;
    name: string;
    empty: number;
    actor_form_id: number | null;
  }[];
  return rows.map((r) => ({
    slot: r.slot,
    name: r.name,
    empty: Boolean(r.empty),
    actorFormId:
      r.actor_form_id != null && Number(r.actor_form_id) > 0
        ? Number(r.actor_form_id)
        : null,
  }));
}

export function getCharacterBindingByProfileSlot(
  profileId: number,
  slot: number
): {
  userId: number;
  slot: number;
  name: string;
  empty: boolean;
  actorFormId: number | null;
  worldOrCell: number | null;
  pos: [number, number, number] | null;
  angleZ: number | null;
  equipment: unknown;
  inventory: unknown;
  appearance: unknown;
  mapMarkers: unknown;
} | null {
  if (slot < 0 || slot > 1) return null;
  const user = getDb()
    .prepare(`SELECT id FROM users WHERE profile_id = ?`)
    .get(profileId) as { id: number } | undefined;
  if (!user) return null;
  ensureCharacterSlots(user.id);
  const row = getDb()
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
    )
    .get(user.id, slot) as CharacterRow | undefined;
  if (!row) return null;
  const pos =
    row.pos_x != null && row.pos_y != null && row.pos_z != null
      ? ([Number(row.pos_x), Number(row.pos_y), Number(row.pos_z)] as [
          number,
          number,
          number,
        ])
      : null;
  return {
    userId: row.user_id,
    slot: row.slot,
    name: row.name,
    empty: Boolean(row.empty),
    actorFormId:
      row.actor_form_id != null && Number(row.actor_form_id) > 0
        ? Number(row.actor_form_id)
        : null,
    worldOrCell:
      row.world_or_cell != null ? Number(row.world_or_cell) : null,
    pos,
    angleZ: row.angle_z != null ? Number(row.angle_z) : null,
    equipment: parseJson(row.equipment_json, null),
    inventory: parseJson(row.inventory_json, null),
    appearance: parseJson(row.appearance_json, null),
    mapMarkers: parseJson(row.map_markers_json, []),
  };
}

/** Bind a newly created SkyMP actor to this account slot (idempotent). */
export function bindCharacterActor(
  profileId: number,
  slot: number,
  actorFormId: number
): PublicCharacter {
  if (slot < 0 || slot > 1) {
    throw Object.assign(new Error("Invalid slot"), { statusCode: 400 });
  }
  if (!(actorFormId > 0)) {
    throw Object.assign(new Error("actorFormId required"), { statusCode: 400 });
  }
  const user = getDb()
    .prepare(`SELECT id FROM users WHERE profile_id = ?`)
    .get(profileId) as { id: number } | undefined;
  if (!user) {
    throw Object.assign(new Error("Unknown profile"), { statusCode: 404 });
  }
  ensureCharacterSlots(user.id);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
    )
    .get(user.id, slot) as CharacterRow | undefined;
  if (!row || row.empty) {
    throw Object.assign(new Error("Slot empty — create character in launcher first"), {
      statusCode: 400,
    });
  }
  // Reject binding if this form is already bound to a different slot of same user
  const clash = db
    .prepare(
      `SELECT id, slot FROM characters
       WHERE user_id = ? AND actor_form_id = ? AND deleted = 0 AND id != ?`
    )
    .get(user.id, actorFormId, row.id) as { id: number; slot: number } | undefined;
  if (clash) {
    throw Object.assign(
      new Error(`Actor already bound to slot ${clash.slot}`),
      { statusCode: 409 }
    );
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE characters SET actor_form_id = ?, empty = 0, updated_at = ? WHERE id = ?`
  ).run(actorFormId, now, row.id);
  return toPublic(
    db.prepare(`SELECT * FROM characters WHERE id = ?`).get(row.id) as CharacterRow
  );
}

/** Upsert full character world state (name, pos, gear, inventory, markers). */
export function saveCharacterState(
  profileId: number,
  slot: number,
  state: CharacterStatePayload
): PublicCharacter {
  if (slot < 0 || slot > 1) {
    throw Object.assign(new Error("Invalid slot"), { statusCode: 400 });
  }
  const user = getDb()
    .prepare(`SELECT id FROM users WHERE profile_id = ?`)
    .get(profileId) as { id: number } | undefined;
  if (!user) {
    throw Object.assign(new Error("Unknown profile"), { statusCode: 404 });
  }
  ensureCharacterSlots(user.id);
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND slot = ? AND deleted = 0`
    )
    .get(user.id, slot) as CharacterRow | undefined;
  if (!row || row.empty) {
    throw Object.assign(new Error("Slot empty"), { statusCode: 400 });
  }

  const now = new Date().toISOString();
  const name =
    typeof state.name === "string" && state.name.trim()
      ? state.name.trim().slice(0, 48)
      : row.name;

  let actorFormId = row.actor_form_id;
  if (typeof state.actorFormId === "number" && state.actorFormId > 0) {
    actorFormId = state.actorFormId;
  }

  let worldOrCell = row.world_or_cell;
  let posX = row.pos_x;
  let posY = row.pos_y;
  let posZ = row.pos_z;
  let angleZ = row.angle_z;
  if (typeof state.worldOrCell === "number" && state.worldOrCell > 0) {
    worldOrCell = state.worldOrCell;
  }
  if (Array.isArray(state.pos) && state.pos.length >= 3) {
    posX = Number(state.pos[0]) || 0;
    posY = Number(state.pos[1]) || 0;
    posZ = Number(state.pos[2]) || 0;
  }
  if (typeof state.angleZ === "number" && !Number.isNaN(state.angleZ)) {
    angleZ = state.angleZ;
  }

  const equipmentJson =
    state.equipment !== undefined
      ? safeJson(state.equipment, row.equipment_json || "null")
      : row.equipment_json;
  const inventoryJson =
    state.inventory !== undefined
      ? safeJson(state.inventory, row.inventory_json || "null")
      : row.inventory_json;
  const appearanceJson =
    state.appearance !== undefined
      ? safeJson(state.appearance, row.appearance_json || "null")
      : row.appearance_json;
  const mapMarkersJson =
    state.mapMarkers !== undefined
      ? safeJson(state.mapMarkers, row.map_markers_json || "[]")
      : row.map_markers_json;

  db.prepare(
    `UPDATE characters SET
       name = ?, empty = 0, actor_form_id = ?,
       world_or_cell = ?, pos_x = ?, pos_y = ?, pos_z = ?, angle_z = ?,
       equipment_json = ?, inventory_json = ?, appearance_json = ?, map_markers_json = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    actorFormId,
    worldOrCell,
    posX,
    posY,
    posZ,
    angleZ,
    equipmentJson,
    inventoryJson,
    appearanceJson,
    mapMarkersJson,
    now,
    row.id
  );

  return toPublic(
    db.prepare(`SELECT * FROM characters WHERE id = ?`).get(row.id) as CharacterRow
  );
}

export function listPendingWipes(limit = 50): CharacterWipeRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM character_wipes WHERE done = 0 ORDER BY id ASC LIMIT ?`
    )
    .all(limit) as CharacterWipeRow[];
}

export function markWipesDone(ids: number[]): number {
  if (!ids.length) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  let n = 0;
  const stmt = db.prepare(
    `UPDATE character_wipes SET done = 1, done_at = ? WHERE id = ? AND done = 0`
  );
  for (const id of ids) {
    const r = stmt.run(now, id);
    n += Number(r.changes || 0);
  }
  return n;
}

/**
 * Queue wipe for every unbound world actor the game server reports for a profile.
 * Used when launchers emptied slots but old ChangeForms remain.
 */
export function queueOrphanWipes(
  profileId: number,
  actorFormIds: number[]
): number {
  const user = getDb()
    .prepare(`SELECT id FROM users WHERE profile_id = ?`)
    .get(profileId) as { id: number } | undefined;
  if (!user) return 0;
  ensureCharacterSlots(user.id);
  const bound = new Set(
    (
      getDb()
        .prepare(
          `SELECT actor_form_id FROM characters
           WHERE user_id = ? AND deleted = 0 AND actor_form_id IS NOT NULL`
        )
        .all(user.id) as { actor_form_id: number }[]
    )
      .map((r) => Number(r.actor_form_id))
      .filter((id) => id > 0)
  );
  const now = new Date().toISOString();
  let n = 0;
  const ins = getDb().prepare(
    `INSERT INTO character_wipes (profile_id, actor_form_id, slot, user_id, created_at, done)
     VALUES (?, ?, NULL, ?, ?, 0)`
  );
  // Avoid duplicate pending wipes for same actor
  const pending = new Set(
    (
      getDb()
        .prepare(
          `SELECT actor_form_id FROM character_wipes WHERE profile_id = ? AND done = 0`
        )
        .all(profileId) as { actor_form_id: number }[]
    ).map((r) => Number(r.actor_form_id))
  );
  for (const raw of actorFormIds) {
    const id = Number(raw);
    if (!(id > 0) || bound.has(id) || pending.has(id)) continue;
    ins.run(profileId, id, user.id, now);
    pending.add(id);
    n++;
  }
  return n;
}
