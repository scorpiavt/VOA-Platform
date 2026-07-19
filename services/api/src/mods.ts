import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config";

export type LocalModMeta = {
  id: string;
  name: string;
  description: string;
  version: string;
  source: "local";
  filename: string;
  required?: boolean;
  tags?: string[];
};

export type NexusModMeta = {
  id: string;
  name: string;
  description: string;
  version: string;
  source: "nexus";
  /** Nexus game domain, e.g. skyrimspecialedition */
  nexusGame: string;
  nexusModId: number;
  nexusFileId: number;
  /** Approximate size hint for UI (bytes); Nexus may differ slightly */
  sizeHint?: number;
  required?: boolean;
  tags?: string[];
  /**
   * If the Nexus zip roots at SKSE/ instead of Data/SKSE/, set true
   * so the launcher rewrites paths for Skyrim install root.
   */
  remapSkseToData?: boolean;
};

export type ModPackageMeta = LocalModMeta | NexusModMeta;

/**
 * Catalog policy:
 * - local: VOA first-party + non-Nexus redistributables (SKSE silverlock) under DATA_DIR/mod-packages
 * - nexus: launcher downloads via the user's Nexus browser OAuth login (Free/Premium) —
 *   NEVER rehosted or proxied through VOA for end users
 */
const CATALOG: ModPackageMeta[] = [
  {
    id: "skse-ae-2.2.6",
    name: "SKSE64 AE 2.2.6",
    description:
      "Skyrim Script Extender (Anniversary Edition) 2.2.6 for game version 1.6.1170. Official build from skse.silverlock.org — not a Nexus mod. Installs skse64_loader.exe, skse64_1_6_1170.dll, and SKSE scripts. Required to run VOA / SKSE plugins.",
    version: "2.2.6",
    source: "local",
    filename: "skse-ae-2.2.6.zip",
    required: true,
    tags: ["required", "skse", "runtime"],
  },
  {
    id: "address-library-ae",
    name: "Address Library for SKSE Plugins",
    description:
      "Required database for SKSE plugins (Engine Fixes, Crash Logger, etc.) on AE 1.6.1170. Downloaded from Nexus Mods after you log in with your Nexus account in the browser (Free or Premium) — not rehosted on VOA. Log in under Account before installing.",
    version: "11",
    source: "nexus",
    nexusGame: "skyrimspecialedition",
    nexusModId: 32444,
    nexusFileId: 720756, // All in one (all game versions) v11
    sizeHint: 5_302_930,
    required: true,
    tags: ["required", "skse", "address-library", "nexus"],
    remapSkseToData: true,
  },
  {
    id: "voa-mp-core",
    name: "VOA Multiplayer Core",
    description:
      "Required multiplayer client: matched Skyrim Platform AE + MpClientPlugin set (fixes error 126 and libnode Tick crash), skymp5-client, RuntimeDependencies, scripts, password. Uninstall removes only this package's files. Do not mix with Keizaal/other SP builds.",
    version: "0.1.5",
    source: "local",
    filename: "voa-mp-core-0.1.5.zip",
    required: true,
    tags: ["required", "multiplayer"],
  },
  {
    id: "voa-base-assets",
    name: "VOA Base Assets",
    description:
      "Shared VOA branding and placeholder assets package. Installed as one package for clean uninstall.",
    version: "0.1.0",
    source: "local",
    filename: "voa-base-assets-0.1.0.zip",
    required: false,
    tags: ["optional", "assets"],
  },
];

export function modPackagesDir(): string {
  return path.join(config.dataDir, "mod-packages");
}

function fileSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export type PublicModPackage = {
  id: string;
  name: string;
  description: string;
  version: string;
  size: number;
  sha256: string;
  /** Local VOA CDN URL; empty for nexus packages (client downloads via user key). */
  downloadUrl: string;
  required: boolean;
  tags: string[];
  installRoot: "skyrim";
  available: boolean;
  source: "local" | "nexus";
  /** Present when source === "nexus" — launcher uses these with the user's API key. */
  nexusGame?: string;
  nexusModId?: number;
  nexusFileId?: number;
  remapSkseToData?: boolean;
};

export function getCatalogMeta(packageId: string): ModPackageMeta | undefined {
  return CATALOG.find((p) => p.id === packageId);
}

export function listModPackages(): PublicModPackage[] {
  const dir = modPackagesDir();
  fs.mkdirSync(dir, { recursive: true });

  return CATALOG.map((meta) => {
    if (meta.source === "nexus") {
      // Always listed as available in catalog metadata. The launcher requires
      // the user to log in to Nexus in the browser (Free/Premium) before install.
      return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        version: meta.version,
        size: meta.sizeHint ?? 0,
        sha256: "", // integrity via Nexus CDN; skip launcher checksum
        downloadUrl: "",
        required: Boolean(meta.required),
        tags: meta.tags ?? [],
        installRoot: "skyrim" as const,
        available: true,
        source: "nexus" as const,
        nexusGame: meta.nexusGame,
        nexusModId: meta.nexusModId,
        nexusFileId: meta.nexusFileId,
        remapSkseToData: Boolean(meta.remapSkseToData),
      };
    }

    const archivePath = path.join(dir, meta.filename);
    const available = fs.existsSync(archivePath);
    let size = 0;
    let sha256 = "";
    if (available) {
      const st = fs.statSync(archivePath);
      size = st.size;
      try {
        sha256 = fileSha256(archivePath);
      } catch {
        sha256 = "";
      }
    }
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      size,
      sha256,
      downloadUrl: `${config.publicUrl}/v1/mods/${encodeURIComponent(meta.id)}/download`,
      required: Boolean(meta.required),
      tags: meta.tags ?? [],
      installRoot: "skyrim" as const,
      available,
      source: "local" as const,
    };
  });
}

export function resolvePackageArchive(packageId: string): {
  meta: LocalModMeta;
  archivePath: string;
} | null {
  const meta = CATALOG.find((p) => p.id === packageId);
  if (!meta || meta.source !== "local") return null;
  const archivePath = path.join(modPackagesDir(), meta.filename);
  if (!fs.existsSync(archivePath)) return null;
  return { meta, archivePath };
}
