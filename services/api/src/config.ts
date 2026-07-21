import path from "path";
import dotenv from "dotenv";

dotenv.config();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env: ${name}`);
  return n;
}

/** Values that must never be used as production secrets. */
const FORBIDDEN_SECRET_VALUES = new Set([
  "",
  "dev-only-change-me",
  "change-me-to-a-long-random-string",
  "voa-dev-secret-change-before-production-please",
  "secret",
  "password",
  "changeme",
  "jwt-secret",
  "game-secret",
]);

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

/**
 * Production posture when:
 * - NODE_ENV=production, or
 * - VOA_REQUIRE_SECRETS=true, or
 * - PUBLIC_URL points at a non-local host
 */
export function isProductionLike(): boolean {
  const env = (process.env.NODE_ENV || "").toLowerCase();
  if (env === "production") return true;
  if ((process.env.VOA_REQUIRE_SECRETS || "").toLowerCase() === "true") return true;
  const pub = (process.env.PUBLIC_URL || "").trim();
  if (pub) {
    try {
      const u = new URL(pub);
      if (!isLocalHostname(u.hostname)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Secrets: NO default values in production.
 * Dev may use a local-only placeholder so `npm run dev` works without .env.
 */
function resolveSecret(name: string): string {
  const raw = (process.env[name] ?? "").trim();
  if (isProductionLike()) {
    if (!raw || FORBIDDEN_SECRET_VALUES.has(raw.toLowerCase()) || FORBIDDEN_SECRET_VALUES.has(raw)) {
      throw new Error(
        `[VOA compliance] ${name} is required and must not be empty or a documented placeholder. ` +
          `Generate a long random value. See docs/NEXUS_COMPLIANCE.md §5.`
      );
    }
    if (raw.length < 24) {
      throw new Error(
        `[VOA compliance] ${name} must be at least 24 characters in production.`
      );
    }
    return raw;
  }
  // Local development only
  if (!raw || FORBIDDEN_SECRET_VALUES.has(raw) || FORBIDDEN_SECRET_VALUES.has(raw.toLowerCase())) {
    return `dev-local-only-${name.toLowerCase()}-not-for-production`;
  }
  return raw;
}

/**
 * Public base URL: production MUST be HTTPS. No insecure public HTTP.
 * Localhost HTTP is allowed only for development.
 */
function resolvePublicUrl(): string {
  const raw = (process.env.PUBLIC_URL ?? "http://127.0.0.1:3100").trim().replace(/\/$/, "");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`[VOA compliance] PUBLIC_URL is not a valid URL: ${raw}`);
  }
  if (!isLocalHostname(u.hostname)) {
    if (u.protocol !== "https:") {
      throw new Error(
        `[VOA compliance] PUBLIC_URL must use HTTPS for non-local hosts (got ${u.protocol}//${u.hostname}). ` +
          `Terminate TLS with Caddy/nginx. See docs/NEXUS_COMPLIANCE.md §3.`
      );
    }
  }
  return raw;
}

function resolveCdnBaseUrl(publicUrl: string): string {
  const raw = (process.env.CDN_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return `${publicUrl}/cdn`;
  try {
    const u = new URL(raw);
    if (!isLocalHostname(u.hostname) && u.protocol !== "https:") {
      throw new Error(
        `[VOA compliance] CDN_BASE_URL must use HTTPS for non-local hosts. See docs/NEXUS_COMPLIANCE.md §3.`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("VOA compliance")) throw e;
    throw new Error(`[VOA compliance] CDN_BASE_URL is not a valid URL: ${raw}`);
  }
  return raw;
}

function resolveGameStatusUrl(): string {
  const raw = (process.env.GAME_STATUS_URL ?? "").trim();
  if (!raw) {
    // Internal sidecar on localhost is fine; public status should be fronted by HTTPS reverse proxy
    return "http://127.0.0.1:3099/status";
  }
  try {
    const u = new URL(raw);
    if (!isLocalHostname(u.hostname) && u.protocol !== "https:") {
      throw new Error(
        `[VOA compliance] GAME_STATUS_URL must use HTTPS when not localhost. See docs/NEXUS_COMPLIANCE.md §3.`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("VOA compliance")) throw e;
  }
  return raw;
}

const publicUrl = resolvePublicUrl();

export const config = {
  port: num("PORT", 3100),
  host: process.env.HOST ?? "0.0.0.0",
  publicUrl,
  dataDir: path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), "data")),
  jwtSecret: resolveSecret("JWT_SECRET"),
  accessTokenTtlSec: num("ACCESS_TOKEN_TTL_SEC", 3600),
  refreshTokenTtlSec: num("REFRESH_TOKEN_TTL_SEC", 60 * 60 * 24 * 30),
  sessionTtlSec: num("SESSION_TTL_SEC", 900),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordGuildId: (process.env.DISCORD_GUILD_ID ?? "").trim(),
  discordBotToken: (process.env.DISCORD_BOT_TOKEN ?? "").trim(),
  discordInviteUrl: (process.env.DISCORD_INVITE_URL ?? "").trim(),
  requireDiscordGuild:
    (process.env.REQUIRE_DISCORD_GUILD ?? "").toLowerCase() === "true" ||
    ((process.env.REQUIRE_DISCORD_GUILD ?? "").toLowerCase() !== "false" &&
      Boolean((process.env.DISCORD_GUILD_ID ?? "").trim())),
  adminDiscordIds: (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminDiscordRoleIds: (
    process.env.ADMIN_DISCORD_ROLE_IDS ??
    "1521249000748224554,1522731546329481449,1522747699273793626"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminDiscordRoleLabels: {
    "1521249000748224554": "Founder",
    "1522731546329481449": "Senior Gamemaster",
    "1522747699273793626": "Gamemaster",
  } as Record<string, string>,
  gameServerIp: process.env.GAME_SERVER_IP ?? "178.156.158.116",
  gameServerPort: num("GAME_SERVER_PORT", 10000),
  gameServerName: process.env.GAME_SERVER_NAME ?? "Visions of Aetherius",
  gameServerAddr: process.env.GAME_SERVER_ADDR ?? "178.156.158.116:10000",
  maintenance: (process.env.MAINTENANCE ?? "false").toLowerCase() === "true",
  statusMessage: process.env.STATUS_MESSAGE ?? "",
  cdnBaseUrl: resolveCdnBaseUrl(publicUrl),
  gameStatusUrl: resolveGameStatusUrl(),
  maxPlayers: num("MAX_PLAYERS", 50),
  /** Game-server → API shared secret. Required; no production default. */
  gameServerSecret: resolveSecret("GAME_SERVER_SECRET"),
  nexusAppName: (process.env.NEXUS_APP_NAME ?? "VisionsOfAetherius").trim(),
  /**
   * Ed25519 public key (base64) for launcher update signature verification.
   * Private key is offline-only (VOA_UPDATE_SIGNING_KEY) — never commit it.
   */
  updatePublicKey: (process.env.VOA_UPDATE_PUBLIC_KEY ?? "").trim(),
};

export function discordConfigured(): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret);
}
