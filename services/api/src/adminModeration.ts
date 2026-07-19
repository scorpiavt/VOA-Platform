import { getDb } from "./db";
import { deleteCharacter, type CharacterRow } from "./characters";

export type AdminActionType =
  | "ban"
  | "unban"
  | "warn"
  | "delete_character"
  | "wipe_inventory"
  | "wipe_equipment"
  | "wipe_spells"
  | "wipe_map_markers"
  | "reset_position";

export type AdminCharacterRow = {
  characterId: number;
  userId: number;
  profileId: number;
  username: string;
  discordId: string;
  banned: boolean;
  slot: number;
  name: string;
  empty: boolean;
  actorFormId: number | null;
  worldOrCell: number | null;
  pos: [number, number, number] | null;
  lastPlayedAt: string | null;
  createdAt: string;
  hasInventory: boolean;
  hasEquipment: boolean;
  warningCount: number;
};

export type PendingAdminAction = {
  id: number;
  action: string;
  profileId: number;
  actorFormId: number | null;
  characterId: number | null;
  slot: number | null;
  note: string | null;
  payload: unknown;
  createdAt: string;
};

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function listAdminCharacters(opts?: {
  q?: string;
  includeEmpty?: boolean;
  limit?: number;
}): AdminCharacterRow[] {
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 2000);
  const includeEmpty = Boolean(opts?.includeEmpty);
  const q = String(opts?.q || "")
    .trim()
    .toLowerCase();

  const rows = getDb()
    .prepare(
      `SELECT
         c.id AS character_id,
         c.user_id,
         c.slot,
         c.name,
         c.empty,
         c.actor_form_id,
         c.world_or_cell,
         c.pos_x, c.pos_y, c.pos_z,
         c.inventory_json,
         c.equipment_json,
         c.last_played_at,
         c.created_at,
         u.profile_id,
         u.username,
         u.discord_id,
         u.banned,
         (SELECT COUNT(*) FROM user_warnings w WHERE w.user_id = u.id) AS warning_count
       FROM characters c
       JOIN users u ON u.id = c.user_id
       WHERE c.deleted = 0
         ${includeEmpty ? "" : "AND c.empty = 0"}
       ORDER BY u.profile_id ASC, c.slot ASC
       LIMIT ?`
    )
    .all(limit) as Array<{
    character_id: number;
    user_id: number;
    slot: number;
    name: string;
    empty: number;
    actor_form_id: number | null;
    world_or_cell: number | null;
    pos_x: number | null;
    pos_y: number | null;
    pos_z: number | null;
    inventory_json: string | null;
    equipment_json: string | null;
    last_played_at: string | null;
    created_at: string;
    profile_id: number;
    username: string;
    discord_id: string;
    banned: number;
    warning_count: number;
  }>;

  let out: AdminCharacterRow[] = rows.map((r) => ({
    characterId: r.character_id,
    userId: r.user_id,
    profileId: r.profile_id,
    username: r.username,
    discordId: r.discord_id,
    banned: Boolean(r.banned),
    slot: r.slot,
    name: r.name,
    empty: Boolean(r.empty),
    actorFormId:
      r.actor_form_id != null && Number(r.actor_form_id) > 0
        ? Number(r.actor_form_id)
        : null,
    worldOrCell: r.world_or_cell != null ? Number(r.world_or_cell) : null,
    pos:
      r.pos_x != null && r.pos_y != null && r.pos_z != null
        ? [Number(r.pos_x), Number(r.pos_y), Number(r.pos_z)]
        : null,
    lastPlayedAt: r.last_played_at,
    createdAt: r.created_at,
    hasInventory: Boolean(r.inventory_json && r.inventory_json !== "null"),
    hasEquipment: Boolean(r.equipment_json && r.equipment_json !== "null"),
    warningCount: Number(r.warning_count || 0),
  }));

  if (q) {
    out = out.filter((c) => {
      const hay = `${c.username} ${c.name} ${c.profileId} ${c.discordId} p${c.profileId}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

function queueAdminAction(input: {
  action: AdminActionType | string;
  staffUserId: number;
  targetUserId?: number | null;
  targetProfileId?: number | null;
  targetCharacterId?: number | null;
  targetActorFormId?: number | null;
  targetSlot?: number | null;
  note?: string | null;
  payload?: unknown;
}): number {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO admin_actions (
         action, target_user_id, target_profile_id, target_character_id,
         target_actor_form_id, target_slot, staff_user_id, note, payload_json,
         done, created_at, done_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)`
    )
    .run(
      String(input.action),
      input.targetUserId ?? null,
      input.targetProfileId ?? null,
      input.targetCharacterId ?? null,
      input.targetActorFormId ?? null,
      input.targetSlot ?? null,
      input.staffUserId,
      input.note ? String(input.note).trim().slice(0, 2000) : null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      now
    );
  return Number(result.lastInsertRowid);
}

export function setUserBanned(userId: number, banned: boolean): void {
  const now = new Date().toISOString();
  const r = getDb()
    .prepare(`UPDATE users SET banned = ?, updated_at = ? WHERE id = ?`)
    .run(banned ? 1 : 0, now, userId);
  if (!r.changes) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
}

export function addUserWarning(
  userId: number,
  staffUserId: number,
  note: string
): number {
  const text = String(note || "").trim().slice(0, 2000);
  if (text.length < 2) {
    throw Object.assign(new Error("Warning note required"), { statusCode: 400 });
  }
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO user_warnings (user_id, staff_user_id, note, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, staffUserId, text, now);
  return Number(result.lastInsertRowid);
}

export function listUserWarnings(userId: number): Array<{
  id: number;
  note: string;
  staffUserId: number;
  createdAt: string;
}> {
  const rows = getDb()
    .prepare(
      `SELECT id, note, staff_user_id, created_at FROM user_warnings
       WHERE user_id = ? ORDER BY id DESC LIMIT 50`
    )
    .all(userId) as Array<{
    id: number;
    note: string;
    staff_user_id: number;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    staffUserId: r.staff_user_id,
    createdAt: r.created_at,
  }));
}

function clearCharacterField(
  characterId: number,
  fields: Partial<{
    inventory: boolean;
    equipment: boolean;
    mapMarkers: boolean;
    position: boolean;
  }>
): void {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [now];
  if (fields.inventory) {
    sets.push("inventory_json = ?");
    args.push(JSON.stringify({ entries: [] }));
  }
  if (fields.equipment) {
    sets.push("equipment_json = ?");
    args.push(JSON.stringify({ inv: { entries: [] }, numChanges: 0 }));
  }
  if (fields.mapMarkers) {
    sets.push("map_markers_json = ?");
    args.push("[]");
  }
  if (fields.position) {
    sets.push("world_or_cell = NULL", "pos_x = NULL", "pos_y = NULL", "pos_z = NULL", "angle_z = NULL");
  }
  args.push(characterId);
  getDb()
    .prepare(`UPDATE characters SET ${sets.join(", ")} WHERE id = ?`)
    .run(...(args as (string | number | null)[]));
}

/**
 * Staff moderation action against a character row (and/or owning user).
 */
export function runCharacterAdminAction(input: {
  characterId: number;
  staffUserId: number;
  action: string;
  note?: string | null;
}): { ok: true; action: string; queued: boolean; detail?: string } {
  const action = String(input.action || "").toLowerCase();
  const row = getDb()
    .prepare(
      `SELECT c.*, u.profile_id, u.banned
       FROM characters c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ? AND c.deleted = 0`
    )
    .get(input.characterId) as
    | (CharacterRow & { profile_id: number; banned: number })
    | undefined;
  if (!row) {
    throw Object.assign(new Error("Character not found"), { statusCode: 404 });
  }

  const actorFormId =
    row.actor_form_id != null && Number(row.actor_form_id) > 0
      ? Number(row.actor_form_id)
      : null;
  const note = input.note ? String(input.note).trim().slice(0, 2000) : null;

  switch (action) {
    case "ban": {
      setUserBanned(row.user_id, true);
      queueAdminAction({
        action: "ban",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return { ok: true, action, queued: true, detail: "Account banned" };
    }
    case "unban": {
      setUserBanned(row.user_id, false);
      queueAdminAction({
        action: "unban",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        note,
      });
      return { ok: true, action, queued: false, detail: "Account unbanned" };
    }
    case "warn": {
      if (!note) {
        throw Object.assign(new Error("Warn requires a note"), { statusCode: 400 });
      }
      const wid = addUserWarning(row.user_id, input.staffUserId, note);
      queueAdminAction({
        action: "warn",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        note,
        payload: { warningId: wid },
      });
      return { ok: true, action, queued: false, detail: `Warning #${wid} saved` };
    }
    case "delete_character": {
      deleteCharacter(row.user_id, row.id, row.profile_id);
      queueAdminAction({
        action: "delete_character",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return {
        ok: true,
        action,
        queued: true,
        detail: "Character slot cleared; world actor wipe queued",
      };
    }
    case "wipe_inventory": {
      clearCharacterField(row.id, { inventory: true });
      queueAdminAction({
        action: "wipe_inventory",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return { ok: true, action, queued: true, detail: "Inventory wiped (DB + game queue)" };
    }
    case "wipe_equipment": {
      clearCharacterField(row.id, { equipment: true, inventory: true });
      queueAdminAction({
        action: "wipe_equipment",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return { ok: true, action, queued: true, detail: "Equipment/inventory wiped" };
    }
    case "wipe_spells": {
      queueAdminAction({
        action: "wipe_spells",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return {
        ok: true,
        action,
        queued: true,
        detail: "Spell wipe queued for game server",
      };
    }
    case "wipe_map_markers": {
      clearCharacterField(row.id, { mapMarkers: true });
      queueAdminAction({
        action: "wipe_map_markers",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        note,
      });
      return { ok: true, action, queued: true, detail: "Map markers cleared" };
    }
    case "reset_position": {
      clearCharacterField(row.id, { position: true });
      queueAdminAction({
        action: "reset_position",
        staffUserId: input.staffUserId,
        targetUserId: row.user_id,
        targetProfileId: row.profile_id,
        targetCharacterId: row.id,
        targetActorFormId: actorFormId,
        targetSlot: row.slot,
        note,
      });
      return {
        ok: true,
        action,
        queued: true,
        detail: "Saved position cleared; next spawn uses start points",
      };
    }
    default:
      throw Object.assign(new Error(`Unknown action: ${action}`), { statusCode: 400 });
  }
}

export function listPendingAdminActions(limit = 50): PendingAdminAction[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM admin_actions WHERE done = 0 ORDER BY id ASC LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 200)) as Array<{
    id: number;
    action: string;
    target_profile_id: number | null;
    target_actor_form_id: number | null;
    target_character_id: number | null;
    target_slot: number | null;
    note: string | null;
    payload_json: string | null;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    profileId: Number(r.target_profile_id || 0),
    actorFormId: r.target_actor_form_id,
    characterId: r.target_character_id,
    slot: r.target_slot,
    note: r.note,
    payload: parseJson(r.payload_json),
    createdAt: r.created_at,
  }));
}

export function ackAdminActions(ids: number[]): number {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    `UPDATE admin_actions SET done = 1, done_at = ? WHERE id = ? AND done = 0`
  );
  let n = 0;
  for (const id of ids) {
    n += Number(stmt.run(now, id).changes || 0);
  }
  return n;
}

