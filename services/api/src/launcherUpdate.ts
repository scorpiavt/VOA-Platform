import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config";

export type LauncherUpdateInfo = {
  version: string;
  downloadUrl: string;
  sha256?: string;
  size?: number;
  notes?: string;
  minVersion?: string;
  channel?: "stable" | "beta";
  /** portable = single .exe; zip = full win-unpacked tree (preferred for UI/asar updates) */
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

/** Prefer zip artifact for full UI updates; fall back to portable .exe */
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

/** Ensure default manifest exists (version matches current public build until you publish a newer one). */
export function ensureLauncherUpdateDefaults(): void {
  fs.mkdirSync(launcherDir(), { recursive: true });
  const p = manifestPath();
  if (!fs.existsSync(p)) {
    const def: LauncherUpdateInfo = {
      version: "0.2.0",
      downloadUrl: `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/VisionsOfAetherius-update.zip`,
      notes:
        "Launcher UI refresh: cosmic background + magic VFX, frameless chrome, Download All, Address Library / SKSE packages.",
      minVersion: "0.1.0",
      channel: "stable",
      format: "zip",
    };
    fs.writeFileSync(p, JSON.stringify(def, null, 2), "utf8");
  }
}

export function readLauncherUpdate(): LauncherUpdateInfo {
  ensureLauncherUpdateDefaults();
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as LauncherUpdateInfo;
    const version = String(raw.version || "0.0.0");
    const artifact = resolveArtifact();
    const format = raw.format || artifact.format;
    const defaultName =
      format === "zip" ? "VisionsOfAetherius-update.zip" : "VisionsOfAetherius.exe";
    const downloadUrl =
      raw.downloadUrl ||
      `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/${defaultName}`;

    let size = typeof raw.size === "number" ? raw.size : undefined;
    let sha256 = raw.sha256;
    if (artifact.filePath && fs.existsSync(artifact.filePath)) {
      const st = fs.statSync(artifact.filePath);
      size = st.size;
      if (!sha256) {
        sha256 = crypto
          .createHash("sha256")
          .update(fs.readFileSync(artifact.filePath))
          .digest("hex");
      }
    }
    return {
      version,
      downloadUrl,
      sha256,
      size,
      notes: raw.notes,
      minVersion: raw.minVersion || "0.1.0",
      channel: raw.channel || "stable",
      format,
    };
  } catch {
    return {
      version: "0.2.0",
      downloadUrl: `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/VisionsOfAetherius-update.zip`,
      minVersion: "0.1.0",
      channel: "stable",
      format: "zip",
    };
  }
}

export function getLauncherBinaryPath(): string | null {
  const artifact = resolveArtifact();
  return artifact.filePath;
}

/** Path used by /cdn/launcher/* static routes */
export function getLauncherCdnFile(fileName: string): string | null {
  const safe = path.basename(fileName);
  const p = path.join(launcherDir(), safe);
  return fs.existsSync(p) ? p : null;
}
