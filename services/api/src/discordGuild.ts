import { config } from "./config";

export type GuildCheckResult =
  | { ok: true; method: "oauth_guilds" | "bot_member" | "skipped" }
  | { ok: false; reason: string; inviteUrl?: string };

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
  if (config.discordBotToken) {
    return userInGuildViaBot(discordUserId);
  }
  return { ok: true, method: "skipped" };
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
