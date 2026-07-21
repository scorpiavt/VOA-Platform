/**
 * VOA proximity voice — LiveKit token mint + public config.
 * In-game CEF (Keizaal-style) uses these tokens; the API never carries audio.
 */

import { SignJWT } from "jose";
import { config } from "./config";

export type VoiceMode = "whisper" | "normal" | "shout";

/** Skyrim units — align with local chat ~2200. */
export const VOICE_RANGES: Record<VoiceMode, number> = {
  whisper: 800,
  normal: 2200,
  shout: 6000,
};

export const DEFAULT_VOICE_KEYBINDS = {
  ptt: "V",
  whisper: "Z",
  normal: "X",
  shout: "C",
} as const;

export function voiceEnabled(): boolean {
  return Boolean(
    config.livekitUrl && config.livekitApiKey && config.livekitApiSecret
  );
}

export function getVoicePublicConfig() {
  const enabled = voiceEnabled();
  return {
    enabled,
    /** LiveKit websocket URL for clients (wss://… in production). */
    url: enabled ? config.livekitUrl : "",
    room: config.livekitRoom,
    ranges: { ...VOICE_RANGES },
    defaultKeybinds: { ...DEFAULT_VOICE_KEYBINDS },
    /** Max Opus-ish target; client may clamp. */
    maxBitrate: 32_000,
    /** How players experience it — always in-game CEF, not a separate app. */
    architecture: "in-game-cef-livekit" as const,
  };
}

export type MintVoiceTokenInput = {
  profileId: number;
  displayName?: string;
  /** Optional character slot for metadata */
  characterSlot?: number;
};

/**
 * Mint a LiveKit access token (HS256 JWT) for one player identity.
 * Identity is always String(profileId) for stable spatial mapping.
 */
export async function mintLiveKitAccessToken(
  input: MintVoiceTokenInput
): Promise<{ token: string; identity: string; room: string; expiresAt: string }> {
  if (!voiceEnabled()) {
    throw new Error(
      "Proximity voice is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)"
    );
  }

  const identity = String(input.profileId);
  const room = config.livekitRoom;
  const ttlSec = config.livekitTokenTtlSec;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;

  const secret = new TextEncoder().encode(config.livekitApiSecret);

  // LiveKit grant shape — see livekit-server-sdk AccessToken video grant
  const video = {
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  };

  const token = await new SignJWT({
    sub: identity,
    name: (input.displayName || `Player ${identity}`).slice(0, 64),
    metadata: JSON.stringify({
      profileId: input.profileId,
      characterSlot: input.characterSlot ?? 0,
      voa: 1,
    }),
    video,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.livekitApiKey)
    .setNotBefore(now - 10)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);

  return {
    token,
    identity,
    room,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}
