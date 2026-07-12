import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";
import { getDb, type DbUser } from "./db";

const enc = new TextEncoder();

export type AccessClaims = {
  sub: string; // user id
  profileId: number;
  discordId: string;
};

export async function signAccessToken(user: DbUser): Promise<string> {
  return new SignJWT({
    profileId: user.profile_id,
    discordId: user.discord_id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSec}s`)
    .sign(enc.encode(config.jwtSecret));
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, enc.encode(config.jwtSecret));
  if (!payload.sub) throw new Error("Invalid token");
  return {
    sub: payload.sub,
    profileId: Number(payload.profileId),
    discordId: String(payload.discordId),
  };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRefreshToken(userId: number): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.refreshTokenTtlSec * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(hashToken(token), userId, expires, new Date().toISOString());
  return token;
}

export function consumeRefreshToken(token: string): number | null {
  const hash = hashToken(token);
  const row = getDb()
    .prepare("SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = ?")
    .get(hash) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  getDb().prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(hash);
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState(): string {
  return crypto.randomBytes(16).toString("base64url");
}
