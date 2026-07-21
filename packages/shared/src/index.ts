import { z } from "zod";

/** Public user shape returned to launcher */
export const UserSchema = z.object({
  id: z.number().int(),
  profileId: z.number().int(),
  discordId: z.string(),
  username: z.string(),
  discriminator: z.string().optional().nullable(),
  avatarUrl: z.string().url().nullable().optional(),
  banned: z.boolean(),
});
export type User = z.infer<typeof UserSchema>;

export const NewsPostSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  body: z.string(),
  pinned: z.boolean(),
  tags: z.array(z.string()),
  publishedAt: z.string(),
});
export type NewsPost = z.infer<typeof NewsPostSchema>;

export const ServerStatusSchema = z.object({
  gameOnline: z.boolean(),
  maintenance: z.boolean(),
  message: z.string().optional(),
  serverName: z.string(),
  serverIp: z.string(),
  serverPort: z.number().int(),
  apiVersion: z.string(),
  playersOnline: z.number().int().nullable().optional(),
  maxPlayers: z.number().int().nullable().optional(),
});
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const CreateSessionResponseSchema = z.object({
  session: z.string(),
  profileId: z.number().int(),
  expiresAt: z.string(),
  serverIp: z.string(),
  serverPort: z.number().int(),
  master: z.string(),
  /** Selected character slot (0 or 1) for multi-character accounts */
  characterSlot: z.number().int().min(0).max(1).optional(),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/** One of two character slots per VOA account */
export const CharacterSlotSchema = z.object({
  id: z.number().int(),
  slot: z.number().int().min(0).max(1),
  name: z.string(),
  /** Empty = no character created in-game yet for this slot */
  empty: z.boolean(),
  lastPlayedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type CharacterSlot = z.infer<typeof CharacterSlotSchema>;

export const MAX_CHARACTER_SLOTS = 2 as const;

/** SkyMP master compatibility response */
export const SkympSessionLookupSchema = z.object({
  user: z.object({
    id: z.number().int(),
  }),
});
export type SkympSessionLookup = z.infer<typeof SkympSessionLookupSchema>;

export const ClientUpdateFileSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number().int(),
  url: z.string(),
});

export const ClientUpdateManifestSchema = z.object({
  version: z.string(),
  channel: z.enum(["stable", "beta"]),
  minLauncher: z.string().optional(),
  files: z.array(ClientUpdateFileSchema),
});
export type ClientUpdateManifest = z.infer<typeof ClientUpdateManifestSchema>;

/** Public launcher self-update manifest — sha256 + Ed25519 signature required (Nexus §4) */
export const LauncherUpdateSchema = z.object({
  version: z.string().min(1),
  /** Absolute HTTPS URL to the launcher artifact */
  downloadUrl: z.string().url(),
  /** SHA-256 hex of the artifact (required) */
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  /** Ed25519 signature base64 over canonical payload (required in production) */
  signature: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  minVersion: z.string().optional(),
  channel: z.enum(["stable", "beta"]).optional(),
  format: z.enum(["portable", "zip"]).optional(),
});
export type LauncherUpdate = z.infer<typeof LauncherUpdateSchema>;

/**
 * A single downloadable mod package (one archive = one install unit).
 * Uninstall removes every file that package installed.
 */
export const ModPackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  /** Bytes of the downloadable archive */
  size: z.number().int().nonnegative(),
  sha256: z.string().optional(),
  /** Absolute or API-relative URL for the single package archive */
  downloadUrl: z.string(),
  required: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  /** Where archive paths are relative to: skyrim root (default) */
  installRoot: z.enum(["skyrim"]).optional(),
});
export type ModPackage = z.infer<typeof ModPackageSchema>;

export const ModCatalogSchema = z.object({
  packages: z.array(ModPackageSchema),
});
export type ModCatalog = z.infer<typeof ModCatalogSchema>;

export const InstalledModSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  installedAt: z.string(),
  /** Paths relative to Skyrim install root */
  files: z.array(z.string()),
});
export type InstalledMod = z.infer<typeof InstalledModSchema>;

/** Proximity voice (in-game CEF + LiveKit) — public config */
export const VoiceRangesSchema = z.object({
  whisper: z.number(),
  normal: z.number(),
  shout: z.number(),
});
export type VoiceRanges = z.infer<typeof VoiceRangesSchema>;

export const VoiceKeybindsSchema = z.object({
  ptt: z.string(),
  /** Single key cycles normal → shout → whisper → normal */
  cycle: z.string(),
});
export type VoiceKeybinds = z.infer<typeof VoiceKeybindsSchema>;

export const VoiceConfigSchema = z.object({
  enabled: z.boolean(),
  url: z.string(),
  room: z.string(),
  ranges: VoiceRangesSchema,
  defaultKeybinds: VoiceKeybindsSchema,
  maxBitrate: z.number().optional(),
  architecture: z.literal("in-game-cef-livekit").optional(),
});
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const VoiceTokenResponseSchema = z.object({
  token: z.string(),
  identity: z.string(),
  room: z.string(),
  url: z.string(),
  expiresAt: z.string(),
  ranges: VoiceRangesSchema,
  defaultKeybinds: VoiceKeybindsSchema.optional(),
});
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponseSchema>;

export const DEFAULT_SERVER = {
  name: "Visions of Aetherius",
  ip: "178.156.158.116",
  port: 10000,
} as const;

export const API_VERSION = "0.1.0";
