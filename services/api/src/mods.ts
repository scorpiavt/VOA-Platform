import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config";

export type ModPackageMeta = {
  id: string;
  name: string;
  description: string;
  version: string;
  filename: string;
  required?: boolean;
  tags?: string[];
};

/** Built-in catalog entries; archive files live in data/mod-packages/ */
const CATALOG: ModPackageMeta[] = [
  {
    id: "voa-mp-core",
    name: "VOA Multiplayer Core",
    description:
      "Required multiplayer client package: skymp5-client, MpClientPlugin.dll, SkyrimPlatform.dll, and scripts. Single archive — uninstall removes every file this package installed.",
    version: "0.1.3",
    filename: "voa-mp-core-0.1.3.zip",
    required: true,
    tags: ["required", "multiplayer"],
  },
  {
    id: "sse-engine-fixes-runtime",
    name: "SSE Engine Fixes Runtime (Part 2)",
    description:
      "Recommended stability package. Installs d3dx9_42.dll next to SkyrimSE.exe (Engine Fixes preloader / Part 2). Engine Fixes 7.x no longer uses tbb.dll — this is the current Part 2 equivalent. Uninstall removes only this package’s files.",
    version: "7.0",
    filename: "sse-engine-fixes-runtime-7.0.zip",
    required: false,
    tags: ["recommended", "stability", "engine-fixes"],
  },
  {
    id: "sse-engine-fixes-ae",
    name: "SSE Engine Fixes AE 7.0.20",
    description:
      "SKSE Engine Fixes plugin for Anniversary Edition 1.6.1170 (Part 1). Install Runtime (Part 2) as well. Single archive for clean uninstall.",
    version: "7.0.20",
    filename: "sse-engine-fixes-ae-7.0.20.zip",
    required: false,
    tags: ["recommended", "stability", "engine-fixes"],
  },
  {
    id: "voa-base-assets",
    name: "VOA Base Assets",
    description:
      "Shared VOA branding and placeholder assets package. Installed as one package for clean uninstall.",
    version: "0.1.0",
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
  downloadUrl: string;
  required: boolean;
  tags: string[];
  installRoot: "skyrim";
  available: boolean;
};

export function listModPackages(): PublicModPackage[] {
  const dir = modPackagesDir();
  fs.mkdirSync(dir, { recursive: true });

  return CATALOG.map((meta) => {
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
    };
  });
}

export function resolvePackageArchive(packageId: string): {
  meta: ModPackageMeta;
  archivePath: string;
} | null {
  const meta = CATALOG.find((p) => p.id === packageId);
  if (!meta) return null;
  const archivePath = path.join(modPackagesDir(), meta.filename);
  if (!fs.existsSync(archivePath)) return null;
  return { meta, archivePath };
}
