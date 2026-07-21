import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config, isProductionLike } from "./config";

/**
 * Launcher self-update manifest — Nexus compliance §4.
 * sha256 and signature are REQUIRED for any non-local public channel.
 */
export type LauncherUpdateInfo = {
  version: string;
  downloadUrl: string;
  /** SHA-256 hex of the artifact (required for production updates) */
  sha256: string;
  /** Ed25519 signature (base64) over canonicalSignPayload(...) */
  signature: string;
  size?: number;
  notes?: string;
  minVersion?: string;
  channel?: "stable" | "beta";
  format?: "portable" | "zip";
};

function manifestPath(): string {
  return path.join(config.dataDir, "launcher-update.json");
}

function launcherDir(): string {
  return path.join(config.dataDir, "cdn", "launcher");
}

function launcherZipPath(): string {
  return path.join(launcherDir(), "VisionsOfAetherius-update.zip");
}

function launcherBinaryPath(): string {
  return path.join(launcherDir(), "VisionsOfAetherius.exe");
}

function resolveArtifact(): {
  filePath: string | null;
  format: "portable" | "zip";
  fileName: string;
} {
  if (fs.existsSync(launcherZipPath())) {
    return {
      filePath: launcherZipPath(),
      format: "zip",
      fileName: "VisionsOfAetherius-update.zip",
    };
  }
  if (fs.existsSync(launcherBinaryPath())) {
    return {
      filePath: launcherBinaryPath(),
      format: "portable",
      fileName: "VisionsOfAetherius.exe",
    };
  }
  return { filePath: null, format: "zip", fileName: "VisionsOfAetherius-update.zip" };
}

/** Canonical string that is signed / verified (stable field order). */
export function canonicalSignPayload(info: {
  version: string;
  downloadUrl: string;
  sha256: string;
  size?: number;
  format?: string;
}): string {
  return [
    "voa-launcher-update-v1",
    info.version,
    info.downloadUrl,
    info.sha256.toLowerCase(),
    String(info.size ?? ""),
    info.format || "zip",
  ].join("\n");
}

export function ensureLauncherUpdateDefaults(): void {
  fs.mkdirSync(launcherDir(), { recursive: true });
  // Do not invent unsigned production manifests. Dev may create an empty placeholder.
  const p = manifestPath();
  if (!fs.existsSync(p) && !isProductionLike()) {
    const def = {
      version: "0.0.0-dev",
      downloadUrl: `${config.publicUrl}/cdn/launcher/VisionsOfAetherius-update.zip`,
      sha256: "0".repeat(64),
      signature: "UNSIGNED-DEV-ONLY",
      notes: "Dev placeholder — run scripts/sign-launcher-update.mjs before production.",
      minVersion: "0.0.0",
      channel: "stable",
      format: "zip",
    };
    fs.writeFileSync(p, JSON.stringify(def, null, 2), "utf8");
  }
}

function assertHttpsUrl(url: string, field: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`[VOA compliance] ${field} is not a valid URL`);
  }
  const local =
    u.hostname === "127.0.0.1" ||
    u.hostname === "localhost" ||
    u.hostname === "::1";
  if (!local && u.protocol !== "https:") {
    throw new Error(
      `[VOA compliance] ${field} must be HTTPS for non-local hosts (got ${u.protocol})`
    );
  }
}

export function readLauncherUpdate(): LauncherUpdateInfo {
  ensureLauncherUpdateDefaults();
  if (!fs.existsSync(manifestPath())) {
    throw new Error(
      "[VOA compliance] launcher-update.json missing. Publish a signed manifest before serving updates."
    );
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as Partial<LauncherUpdateInfo>;
  const version = String(raw.version || "").trim();
  if (!version) {
    throw new Error("[VOA compliance] launcher update manifest missing version");
  }
  const artifact = resolveArtifact();
  const format = (raw.format || artifact.format) as "portable" | "zip";
  const defaultName =
    format === "zip" ? "VisionsOfAetherius-update.zip" : "VisionsOfAetherius.exe";
  const downloadUrl = String(
    raw.downloadUrl || `${config.publicUrl}/cdn/launcher/${defaultName}`
  ).trim();
  assertHttpsUrl(downloadUrl, "downloadUrl");

  let size = typeof raw.size === "number" ? raw.size : undefined;
  let sha256 = String(raw.sha256 || "").trim().toLowerCase();
  if (artifact.filePath && fs.existsSync(artifact.filePath)) {
    const st = fs.statSync(artifact.filePath);
    size = st.size;
    const diskHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(artifact.filePath))
      .digest("hex");
    if (sha256 && sha256 !== diskHash) {
      throw new Error(
        "[VOA compliance] launcher-update.json sha256 does not match on-disk artifact"
      );
    }
    sha256 = diskHash;
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(
      "[VOA compliance] launcher update manifest requires a 64-char hex sha256 of the binary/zip"
    );
  }
  const signature = String(raw.signature || "").trim();
  if (!signature || signature === "UNSIGNED-DEV-ONLY") {
    if (isProductionLike()) {
      throw new Error(
        "[VOA compliance] launcher update manifest requires Ed25519 signature (run scripts/sign-launcher-update.mjs)"
      );
    }
  }

  return {
    version,
    downloadUrl,
    sha256,
    signature: signature || "UNSIGNED-DEV-ONLY",
    size,
    notes: raw.notes,
    minVersion: raw.minVersion || "0.1.0",
    channel: raw.channel || "stable",
    format,
  };
}

export function getLauncherBinaryPath(): string | null {
  return resolveArtifact().filePath;
}

export function getLauncherCdnFile(fileName: string): string | null {
  const safe = path.basename(fileName);
  if (safe !== fileName || safe.includes("..")) return null;
  const p = path.join(launcherDir(), safe);
  return fs.existsSync(p) ? p : null;
}
