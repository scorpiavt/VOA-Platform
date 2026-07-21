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
 * Catalog policy (Nexus compliance — letter of the law):
 * - local: VOA first-party + non-Nexus redistributables (SKSE silverlock) under DATA_DIR/mod-packages
 * - nexus: ONLY path = user-initiated launcher OAuth → download_link with user Bearer token
 *          → direct HTTPS CDN download. NEVER server personal apikey. NEVER VOA rehost of Nexus files.
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
    id: "voa-address-library",
    name: "Address Library (AE 1.6.1170)",
    description:
      "Required versionlib database for SKSE plugins on Skyrim AE 1.6.1170 (versionlib-1-6-1170-0.bin). Hosted on VOA CDN so players do not need a Nexus login for multiplayer. Installs under Data/SKSE/Plugins.",
    version: "1.6.1170",
    source: "local",
    filename: "voa-address-library-1.6.1170.zip",
    required: true,
    tags: ["required", "skse", "address-library"],
  },
  {
    id: "voa-mp-core",
    name: "VOA Multiplayer Core",
    description:
      "Required multiplayer client: Skyrim Platform AE 2.9.0 matched stack (SKSEPlugin_Version) + Impl/CEF + MpClientPlugin + skymp5-client. Official Plugins layout (fmt/spdlog only in RuntimeDependencies). Do not mix with Keizaal/other SP builds.",
    version: "0.1.8",
    source: "local",
    filename: "voa-mp-core-0.1.8.zip",
    required: true,
    tags: ["required", "multiplayer"],
  },
  {
    id: "address-library-ae",
    name: "Address Library (Nexus full pack, optional)",
    description:
      "Optional full Address Library All-in-One from Nexus. Not required if VOA Address Library (AE 1.6.1170) is installed. Needs Nexus login.",
    version: "11",
    source: "nexus",
    nexusGame: "skyrimspecialedition",
    nexusModId: 32444,
    nexusFileId: 720756,
    sizeHint: 5_302_930,
    required: false,
    tags: ["optional", "skse", "address-library", "nexus"],
    remapSkseToData: true,
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
  /** Local VOA CDN URL; empty string for nexus packages (OAuth direct download only). */
  downloadUrl: string;
  required: boolean;
  tags: string[];
  installRoot: "skyrim";
  available: boolean;
  source: "local" | "nexus";
  /** Present when source === "nexus" — launcher uses user OAuth (not personal API keys). */
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
