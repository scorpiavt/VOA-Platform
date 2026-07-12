import path from "path";
import dotenv from "dotenv";

dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env: ${name}`);
  return n;
}

export const config = {
  port: num("PORT", 3100),
  host: process.env.HOST ?? "0.0.0.0",
  publicUrl: process.env.PUBLIC_URL ?? "http://127.0.0.1:3100",
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data")),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  accessTokenTtlSec: num("ACCESS_TOKEN_TTL_SEC", 3600),
  refreshTokenTtlSec: num("REFRESH_TOKEN_TTL_SEC", 60 * 60 * 24 * 30),
  sessionTtlSec: num("SESSION_TTL_SEC", 900),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  /**
   * Community Discord server snowflake. Login requires membership.
   * Enable Developer Mode in Discord → right-click server → Copy Server ID.
   */
  discordGuildId: (process.env.DISCORD_GUILD_ID ?? "").trim(),
  /**
   * Optional bot token for re-checking membership on Play / refresh.
   * Bot must be in the community server; enable Server Members Intent.
   */
  discordBotToken: (process.env.DISCORD_BOT_TOKEN ?? "").trim(),
  /** Shown in “join the community” login errors */
  discordInviteUrl: (process.env.DISCORD_INVITE_URL ?? "").trim(),
  /**
   * When true (default if GUILD_ID set), enforce community membership.
   * Set REQUIRE_DISCORD_GUILD=false only for emergency/debug.
   */
  requireDiscordGuild:
    (process.env.REQUIRE_DISCORD_GUILD ?? "").toLowerCase() === "true" ||
    ((process.env.REQUIRE_DISCORD_GUILD ?? "").toLowerCase() !== "false" &&
      Boolean((process.env.DISCORD_GUILD_ID ?? "").trim())),
  adminDiscordIds: (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  gameServerIp: process.env.GAME_SERVER_IP ?? "178.156.158.116",
  gameServerPort: num("GAME_SERVER_PORT", 10000),
  gameServerName: process.env.GAME_SERVER_NAME ?? "Visions of Aetherius",
  gameServerAddr: process.env.GAME_SERVER_ADDR ?? "178.156.158.116:10000",
  maintenance: (process.env.MAINTENANCE ?? "false").toLowerCase() === "true",
  statusMessage: process.env.STATUS_MESSAGE ?? "",
  cdnBaseUrl: process.env.CDN_BASE_URL ?? "",
  /** Remote player-count service (VPS sidecar), e.g. http://178.156.158.116:3099/status */
  gameStatusUrl:
    process.env.GAME_STATUS_URL ??
    `http://${process.env.GAME_SERVER_IP ?? "178.156.158.116"}:3099/status`,
  maxPlayers: num("MAX_PLAYERS", 50),
};

export function discordConfigured(): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret);
}
