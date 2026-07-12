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
};

function manifestPath(): string {
  return path.join(config.dataDir, "launcher-update.json");
}

function launcherBinaryPath(): string {
  return path.join(config.dataDir, "cdn", "launcher", "VisionsOfAetherius.exe");
}

/** Ensure default manifest exists (version matches current public build until you publish a newer one). */
export function ensureLauncherUpdateDefaults(): void {
  const dir = path.join(config.dataDir, "cdn", "launcher");
  fs.mkdirSync(dir, { recursive: true });
  const p = manifestPath();
  if (!fs.existsSync(p)) {
    const def: LauncherUpdateInfo = {
      version: "0.1.0",
      downloadUrl: `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/VisionsOfAetherius.exe`,
      notes: "Initial public player launcher.",
      minVersion: "0.1.0",
      channel: "stable",
    };
    fs.writeFileSync(p, JSON.stringify(def, null, 2), "utf8");
  }
}

export function readLauncherUpdate(): LauncherUpdateInfo {
  ensureLauncherUpdateDefaults();
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath(), "utf8")) as LauncherUpdateInfo;
    const version = String(raw.version || "0.0.0");
    const downloadUrl =
      raw.downloadUrl ||
      `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/VisionsOfAetherius.exe`;
    const bin = launcherBinaryPath();
    let size = typeof raw.size === "number" ? raw.size : undefined;
    let sha256 = raw.sha256;
    if (fs.existsSync(bin)) {
      const st = fs.statSync(bin);
      size = st.size;
      if (!sha256) {
        sha256 = crypto.createHash("sha256").update(fs.readFileSync(bin)).digest("hex");
      }
    }
    return {
      version,
      downloadUrl,
      sha256,
      size,
      notes: raw.notes,
      minVersion: raw.minVersion || version,
      channel: raw.channel || "stable",
    };
  } catch {
    return {
      version: "0.1.0",
      downloadUrl: `${config.publicUrl.replace(/\/$/, "")}/cdn/launcher/VisionsOfAetherius.exe`,
      minVersion: "0.1.0",
      channel: "stable",
    };
  }
}

export function getLauncherBinaryPath(): string | null {
  const p = launcherBinaryPath();
  return fs.existsSync(p) ? p : null;
}
