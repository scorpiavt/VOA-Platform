import { config } from "./config";

export type GuildCheckResult =
  | { ok: true; method: "oauth_guilds" | "bot_member" | "skipped" }
  | { ok: false; reason: string; inviteUrl?: string };

export type StaffCheckResult = {
  isStaff: boolean;
  /** Matching configured admin role IDs the member holds */
  roleIds: string[];
  /** Human labels for matching roles */
  roleLabels: string[];
  method:
    | "bot_roles"
    | "oauth_roles"
    | "db_cache"
    | "user_allowlist"
    | "none"
    | "bot_missing";
};

/** How long cached staff roles from last login stay valid (hours). */
const STAFF_CACHE_HOURS = 12;

/** Cache guild member role lookups (Discord rate limits). */
const memberRoleCache = new Map<
  string,
  { at: number; roles: string[] | null; ok: boolean }
>();
const ROLE_CACHE_MS = 60_000;

function inviteHint(): string | undefined {
  return config.discordInviteUrl || undefined;
}

/**
 * OAuth `guilds` scope: user must list the community guild.
 * Works without a bot; primary gate at login.
 */
export async function userInGuildViaOAuth(
  userAccessToken: string
): Promise<GuildCheckResult> {
  const guildId = config.discordGuildId;
  if (!guildId) {
    return {
      ok: false,
      reason: "Server misconfigured: DISCORD_GUILD_ID is not set.",
    };
  }

  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) {
    return {
      ok: false,
      reason: `Could not verify Discord server membership (${res.status}).`,
      inviteUrl: inviteHint(),
    };
  }

  const guilds = (await res.json()) as Array<{ id: string; name?: string }>;
  if (!Array.isArray(guilds)) {
    return { ok: false, reason: "Unexpected Discord guilds response." };
  }

  const member = guilds.some((g) => String(g.id) === String(guildId));
  if (!member) {
    return {
      ok: false,
      reason:
        "You must join the Visions of Aetherius Discord community before logging in.",
      inviteUrl: inviteHint(),
    };
  }
  return { ok: true, method: "oauth_guilds" };
}

/**
 * Bot re-check: GET /guilds/{id}/members/{userId}
 * Requires bot in the server + Server Members Intent for reliability.
 * Used on Play/session to revoke access if the user left the community.
 */
export async function userInGuildViaBot(
  discordUserId: string
): Promise<GuildCheckResult> {
  const guildId = config.discordGuildId;
  if (!guildId) {
    return {
      ok: false,
      reason: "Server misconfigured: DISCORD_GUILD_ID is not set.",
    };
  }
  if (!config.discordBotToken) {
    // Soft skip when bot not configured — OAuth gate still applies at login
    return { ok: true, method: "skipped" };
  }

  const res = await fetch(
    `https://discord.com/api/guilds/${encodeURIComponent(
      guildId
    )}/members/${encodeURIComponent(discordUserId)}`,
    {
      headers: { Authorization: `Bot ${config.discordBotToken}` },
    }
  );

  if (res.status === 404) {
    return {
      ok: false,
      reason:
        "You are not a member of the Visions of Aetherius Discord community. Rejoin, then log in again.",
      inviteUrl: inviteHint(),
    };
  }
  if (res.status === 403 || res.status === 401) {
    // Bot misconfigured — fail closed in production so we don't silently open the gate
    return {
      ok: false,
      reason:
        "Could not verify community membership (bot configuration). Contact staff.",
      inviteUrl: inviteHint(),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: `Community membership check failed (${res.status}). Try again shortly.`,
      inviteUrl: inviteHint(),
    };
  }
  return { ok: true, method: "bot_member" };
}

/** Combined gate used at OAuth callback */
export async function assertCommunityMemberAtLogin(
  userAccessToken: string,
  discordUserId: string
): Promise<GuildCheckResult> {
  if (!config.requireDiscordGuild) {
    return { ok: true, method: "skipped" };
  }

  // Prefer OAuth guild list (works with identify+guilds, no privileged intent)
  const oauth = await userInGuildViaOAuth(userAccessToken);
  if (!oauth.ok) return oauth;

  // Optional second factor when bot is configured
  if (config.discordBotToken) {
    const bot = await userInGuildViaBot(discordUserId);
    if (!bot.ok) return bot;
  }

  return { ok: true, method: "oauth_guilds" };
}

/** Positive guild membership cache for Play/session mint (Discord is slow). */
const ongoingGuildCache = new Map<string, { at: number; ok: boolean; reason?: string }>();
const ONGOING_GUILD_CACHE_MS = 120_000; // 2 minutes

/** Re-check at Play / token refresh */
export async function assertCommunityMemberOngoing(
  discordUserId: string
): Promise<GuildCheckResult> {
  if (!config.requireDiscordGuild) {
    return { ok: true, method: "skipped" };
  }
  if (!config.discordGuildId) {
    return {
      ok: false,
      reason: "Server misconfigured: DISCORD_GUILD_ID is not set.",
    };
  }
  // Ongoing checks use bot when available; without bot we only gated at login
  if (!config.discordBotToken) {
    return { ok: true, method: "skipped" };
  }

  const id = String(discordUserId);
  const hit = ongoingGuildCache.get(id);
  if (hit && Date.now() - hit.at < ONGOING_GUILD_CACHE_MS) {
    if (hit.ok) return { ok: true, method: "bot_member" };
    return {
      ok: false,
      reason: hit.reason || "Not a community member.",
      inviteUrl: inviteHint(),
    };
  }

  const result = await userInGuildViaBot(discordUserId);
  ongoingGuildCache.set(id, {
    at: Date.now(),
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
  });
  return result;
}

export function membershipErrorHtml(result: Extract<GuildCheckResult, { ok: false }>): {
  title: string;
  message: string;
} {
  const invite = result.inviteUrl
    ? ` Join here: ${result.inviteUrl}`
    : " Join the community Discord, then try again.";
  return {
    title: "Community required",
    message: result.reason + invite,
  };
}

/**
 * Fetch guild member role IDs via bot (GET /guilds/{guild.id}/members/{user.id}).
 * Requires bot in the server + Server Members Intent.
 */
export async function fetchGuildMemberRoles(
  discordUserId: string
): Promise<{ ok: boolean; roles: string[]; status?: number }> {
  const guildId = config.discordGuildId;
  if (!guildId || !config.discordBotToken) {
    return { ok: false, roles: [] };
  }

  const cached = memberRoleCache.get(discordUserId);
  if (cached && Date.now() - cached.at < ROLE_CACHE_MS) {
    return {
      ok: cached.ok,
      roles: cached.roles || [],
    };
  }

  const res = await fetch(
    `https://discord.com/api/guilds/${encodeURIComponent(
      guildId
    )}/members/${encodeURIComponent(discordUserId)}`,
    {
      headers: { Authorization: `Bot ${config.discordBotToken}` },
    }
  );

  if (!res.ok) {
    memberRoleCache.set(discordUserId, { at: Date.now(), roles: null, ok: false });
    return { ok: false, roles: [], status: res.status };
  }

  const body = (await res.json()) as { roles?: string[] };
  const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
  memberRoleCache.set(discordUserId, { at: Date.now(), roles, ok: true });
  return { ok: true, roles };
}

/**
 * OAuth path (no bot): GET /users/@me/guilds/{guild.id}/member
 * Requires scope `guilds.members.read` at login.
 */
export async function fetchGuildMemberRolesViaOAuth(
  userAccessToken: string
): Promise<{ ok: boolean; roles: string[]; status?: number }> {
  const guildId = config.discordGuildId;
  if (!guildId || !userAccessToken) {
    return { ok: false, roles: [] };
  }
  const res = await fetch(
    `https://discord.com/api/users/@me/guilds/${encodeURIComponent(guildId)}/member`,
    {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    }
  );
  if (!res.ok) {
    return { ok: false, roles: [], status: res.status };
  }
  const body = (await res.json()) as { roles?: string[] };
  const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
  return { ok: true, roles };
}

function matchStaffRoles(allRoleIds: string[]): {
  matched: string[];
  labels: string[];
} {
  const staffRoleSet = new Set(config.adminDiscordRoleIds.map(String));
  const matched = allRoleIds.filter((r) => staffRoleSet.has(String(r)));
  const labels = matched.map(
    (r) => config.adminDiscordRoleLabels[r] || `Role ${r}`
  );
  return { matched, labels };
}

/**
 * Staff if member has Founder / Senior Gamemaster / Gamemaster,
 * via bot, OAuth role cache, or optional ADMIN_DISCORD_IDS allow-list.
 */
export async function checkStaffAccess(
  discordUserId: string
): Promise<StaffCheckResult> {
  // Lazy import avoids circular deps at module load
  const { getUserByDiscordId, getUserStaffRoleCache } = await import("./users");

  const uid = String(discordUserId || "");
  if (!uid) {
    return { isStaff: false, roleIds: [], roleLabels: [], method: "none" };
  }

  // Optional emergency user allow-list
  if (config.adminDiscordIds.includes(uid)) {
    return {
      isStaff: true,
      roleIds: [],
      roleLabels: ["Allow-list"],
      method: "user_allowlist",
    };
  }

  const staffRoleSet = new Set(config.adminDiscordRoleIds.map(String));
  if (staffRoleSet.size === 0) {
    return { isStaff: false, roleIds: [], roleLabels: [], method: "none" };
  }

  // 1) Live bot fetch (best when configured)
  if (config.discordBotToken && config.discordGuildId) {
    const member = await fetchGuildMemberRoles(uid);
    if (member.ok) {
      const { matched, labels } = matchStaffRoles(member.roles);
      // Keep DB cache warm
      try {
        const u = getUserByDiscordId(uid);
        if (u) {
          const { saveUserStaffRoles } = await import("./users");
          saveUserStaffRoles(u.id, member.roles);
        }
      } catch {
        /* ignore */
      }
      return {
        isStaff: matched.length > 0,
        roleIds: matched,
        roleLabels: labels,
        method: "bot_roles",
      };
    }
  }

  // 2) Roles cached at last Discord login (OAuth guilds.members.read)
  try {
    const u = getUserByDiscordId(uid);
    if (u) {
      const cache = getUserStaffRoleCache(u.id);
      if (cache.checkedAt && cache.roleIds.length >= 0) {
        const ageMs = Date.now() - new Date(cache.checkedAt).getTime();
        if (ageMs >= 0 && ageMs < STAFF_CACHE_HOURS * 3600 * 1000) {
          const { matched, labels } = matchStaffRoles(cache.roleIds);
          return {
            isStaff: matched.length > 0,
            roleIds: matched,
            roleLabels: labels,
            method: "db_cache",
          };
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (!config.discordBotToken) {
    return { isStaff: false, roleIds: [], roleLabels: [], method: "bot_missing" };
  }

  return { isStaff: false, roleIds: [], roleLabels: [], method: "bot_roles" };
}

/**
 * Call at Discord OAuth complete: resolve roles via user token and persist.
 */
export async function refreshStaffRolesAtLogin(
  discordUserId: string,
  userAccessToken: string,
  userId: number
): Promise<StaffCheckResult> {
  const { saveUserStaffRoles } = await import("./users");

  // Prefer OAuth member endpoint (no bot required)
  const oauth = await fetchGuildMemberRolesViaOAuth(userAccessToken);
  if (oauth.ok) {
    saveUserStaffRoles(userId, oauth.roles);
    invalidateStaffCache(discordUserId);
    const { matched, labels } = matchStaffRoles(oauth.roles);
    return {
      isStaff: matched.length > 0,
      roleIds: matched,
      roleLabels: labels,
      method: "oauth_roles",
    };
  }

  // Bot fallback at login
  if (config.discordBotToken) {
    const bot = await fetchGuildMemberRoles(discordUserId);
    if (bot.ok) {
      saveUserStaffRoles(userId, bot.roles);
      invalidateStaffCache(discordUserId);
      const { matched, labels } = matchStaffRoles(bot.roles);
      return {
        isStaff: matched.length > 0,
        roleIds: matched,
        roleLabels: labels,
        method: "bot_roles",
      };
    }
  }

  // Clear stale roles if we couldn't re-fetch
  saveUserStaffRoles(userId, []);
  return { isStaff: false, roleIds: [], roleLabels: [], method: "none" };
}

export function invalidateStaffCache(discordUserId?: string): void {
  if (discordUserId) memberRoleCache.delete(String(discordUserId));
  else memberRoleCache.clear();
}
