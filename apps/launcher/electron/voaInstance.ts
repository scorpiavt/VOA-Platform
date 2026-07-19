/**
 * Dedicated VOA Skyrim tree — hardlink/copy from the user's main install.
 * Default "lean" mode: vanilla masters + BSA + SKSE only (no third-party ESPs/SKSE stack).
 */
import fs from "fs";
import path from "path";

export type InstanceProgress = {
  phase: "scan" | "clone" | "done" | "error";
  current: number;
  total: number;
  percent: number;
  message?: string;
};

export type InstanceMode = "lean" | "full";

export type InstanceMarker = {
  sourcePath: string;
  createdAt: string;
  lastSyncedAt: string;
  hardlinked: number;
  copied: number;
  /** lean = multiplayer-safe vanilla; full = entire source tree */
  mode?: InstanceMode;
  version: 1 | 2;
};

export type EnsureInstanceResult = {
  ok: boolean;
  path?: string;
  sourcePath?: string;
  created?: boolean;
  reused?: boolean;
  hardlinked?: number;
  copied?: number;
  skipped?: number;
  mode?: InstanceMode;
  error?: string;
};

const MARKER_NAME = ".voa-instance.json";

const SKIP_DIR = new Set(
  ["crashdumps", ".git", "node_modules", "shadercache", "gpucache"].map((s) =>
    s.toLowerCase()
  )
);

const SKIP_FILE_EXACT = new Set(
  ["skyrim.log", "skse64.log", "crashdump.log"].map((s) => s.toLowerCase())
);

/** Official masters only (AE DLC). */
const VANILLA_ESM = new Set([
  "skyrim.esm",
  "update.esm",
  "dawnguard.esm",
  "hearthfires.esm",
  "dragonborn.esm",
]);

/** SKSE plugin basenames allowed in lean VOA (case-insensitive). */
const LEAN_SKSE_PLUGIN_ALLOW = new Set(
  [
    "skyrimplatform.dll",
    "skyrimplatform.ini",
    "mpclientplugin.dll",
    "fmt.dll",
    "spdlog.dll",
    "enginefixes.dll",
    "enginefixes.toml",
    "enginefixes_snse.dll",
    "crashlogger.dll",
    "crashlogger.ini",
    // Address Library bins matched by prefix below
  ].map((s) => s.toLowerCase())
);

function shouldSkipDir(name: string): boolean {
  return SKIP_DIR.has(name.toLowerCase());
}

function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (SKIP_FILE_EXACT.has(lower)) return true;
  if (lower.endsWith(".log") || lower.endsWith(".tmp") || lower.endsWith(".bak")) return true;
  if (lower === MARKER_NAME) return true;
  return false;
}

/**
 * Lean filter: keep game binaries, vanilla masters, BSA, strings, SKSE loader —
 * drop third-party ESPs/ESLs, loose mod assets, and non-essential SKSE plugins.
 */
function includeInLeanClone(relPosix: string): boolean {
  const n = relPosix.replace(/\\/g, "/").toLowerCase();

  // Root: exes, dlls, txts next to game
  if (!n.includes("/")) {
    return true;
  }

  // Skip entire Platform tree from source (we install VOA/SP cleanly after)
  if (n.startsWith("data/platform/")) return false;

  // SKSE plugins: curated allow-list + Address Library bins
  if (n.startsWith("data/skse/plugins/")) {
    const base = path.posix.basename(n);
    if (LEAN_SKSE_PLUGIN_ALLOW.has(base)) return true;
    if (base.startsWith("version-") && base.endsWith(".bin")) return true;
    if (base.startsWith("versionlib-") && base.endsWith(".bin")) return true;
    // EngineFixes configs
    if (base.startsWith("enginefixes")) return true;
    return false;
  }

  // SKSE non-plugin files (skse.ini, etc.)
  if (n.startsWith("data/skse/")) return true;

  // Data masters: only vanilla ESMs
  if (n.startsWith("data/") && n.endsWith(".esm")) {
    return VANILLA_ESM.has(path.posix.basename(n));
  }

  // No third-party plugins
  if (n.endsWith(".esp") || n.endsWith(".esl")) return false;

  // BSA archives (vanilla + CC if present as bsa without esp — CC often needs esl; skip loose bsa that aren't skyrim-named is OK to include all bsa)
  if (n.startsWith("data/") && n.endsWith(".bsa")) return true;

  // Strings, Video, Interface defaults, Music, Sound — needed for boot
  if (
    n.startsWith("data/strings/") ||
    n.startsWith("data/video/") ||
    n.startsWith("data/music/") ||
    n.startsWith("data/sound/") ||
    n.startsWith("data/shadersfx/")
  ) {
    return true;
  }

  // Loose meshes/textures/scripts from mods — skip (use BSA only)
  if (
    n.startsWith("data/meshes/") ||
    n.startsWith("data/textures/") ||
    n.startsWith("data/scripts/") ||
    n.startsWith("data/source/") ||
    n.startsWith("data/seq/") ||
    n.startsWith("data/grass/") ||
    n.startsWith("data/lodsettings/") ||
    n.startsWith("data/interface/")
  ) {
    return false;
  }

  // Other Data files (ini, txt under Data)
  if (n.startsWith("data/")) {
    // Don't pull random loose files
    return false;
  }

  return true;
}

/** Default isolated folder: sibling of Steam install (same volume → hardlinks). */
export function defaultInstancePath(sourcePath: string, userData: string): string {
  const resolved = path.resolve(sourcePath);
  const parent = path.dirname(resolved);
  const sibling = path.join(parent, "Skyrim Special Edition - Visions of Aetherius");
  try {
    if (path.parse(sibling).root.toLowerCase() === path.parse(resolved).root.toLowerCase()) {
      return sibling;
    }
  } catch {
    /* fall through */
  }
  return path.join(userData, "Game", "Skyrim Special Edition - VOA");
}

export function isValidGameRoot(dir: string): boolean {
  if (!dir) return false;
  try {
    return fs.existsSync(path.join(dir, "SkyrimSE.exe"));
  } catch {
    return false;
  }
}

export function readInstanceMarker(instancePath: string): InstanceMarker | null {
  try {
    const p = path.join(instancePath, MARKER_NAME);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as InstanceMarker;
  } catch {
    return null;
  }
}

export function isVoaInstance(instancePath: string): boolean {
  return Boolean(readInstanceMarker(instancePath)) && isValidGameRoot(instancePath);
}

/**
 * Write without mutating hardlinked source files (break nlink>1 first).
 */
export function writeFileExclusive(
  filePath: string,
  data: string | Buffer,
  encoding: BufferEncoding = "utf8"
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    const st = fs.lstatSync(filePath);
    if (st.isFile() && st.nlink > 1) {
      fs.unlinkSync(filePath);
    } else if (st.isSymbolicLink()) {
      fs.unlinkSync(filePath);
    }
  } catch {
    /* missing ok */
  }
  if (Buffer.isBuffer(data)) {
    fs.writeFileSync(filePath, data);
  } else {
    fs.writeFileSync(filePath, data, encoding);
  }
}

function linkOrCopy(src: string, dest: string): "hardlink" | "copy" {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    try {
      const s = fs.statSync(src);
      const d = fs.statSync(dest);
      if (s.size === d.size && Math.floor(s.mtimeMs / 1000) === Math.floor(d.mtimeMs / 1000)) {
        return "hardlink";
      }
      if (s.ino && d.ino && s.ino === d.ino && s.dev === d.dev) {
        return "hardlink";
      }
      try {
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }
  try {
    fs.linkSync(src, dest);
    return "hardlink";
  } catch {
    fs.copyFileSync(src, dest);
    try {
      const st = fs.statSync(src);
      fs.utimesSync(dest, st.atime, st.mtime);
    } catch {
      /* ignore */
    }
    return "copy";
  }
}

type FileEntry = { rel: string; abs: string };

function collectFiles(root: string, mode: InstanceMode): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (absDir: string, relDir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const name = ent.name;
      if (ent.isDirectory()) {
        if (shouldSkipDir(name)) continue;
        // Lean: skip heavy loose-asset trees early
        if (mode === "lean" && relDir.toLowerCase() === "data") {
          const low = name.toLowerCase();
          if (
            ["meshes", "textures", "scripts", "source", "seq", "grass", "interface", "lodsettings"].includes(
              low
            )
          ) {
            continue;
          }
        }
        walk(path.join(absDir, name), relDir ? path.join(relDir, name) : name);
      } else if (ent.isFile() || ent.isSymbolicLink()) {
        if (shouldSkipFile(name)) continue;
        const rel = relDir ? path.join(relDir, name) : name;
        if (mode === "lean" && !includeInLeanClone(rel)) continue;
        out.push({ rel, abs: path.join(absDir, name) });
      }
    }
  };
  walk(root, "");
  return out;
}

function instanceLooksComplete(instancePath: string): boolean {
  if (!isValidGameRoot(instancePath)) return false;
  const esm = path.join(instancePath, "Data", "Skyrim.esm");
  return fs.existsSync(esm);
}

function writeVanillaPluginsTxt(instancePath: string): void {
  // Best-effort: game still uses AppData plugins.txt, but a copy in Data helps tooling
  const lines = [
    "# Automatically generated for Visions of Aetherius (lean)",
    "*Skyrim.esm",
    "*Update.esm",
    "*Dawnguard.esm",
    "*HearthFires.esm",
    "*Dragonborn.esm",
    "",
  ];
  try {
    writeFileExclusive(
      path.join(instancePath, "Data", "plugins.txt"),
      lines.join("\r\n"),
      "utf8"
    );
  } catch {
    /* ignore */
  }
}

/**
 * Ensure an isolated VOA game tree exists (hardlink from source when possible).
 * Default mode is **lean** (vanilla DLC + SKSE essentials) for multiplayer stability.
 */
export function ensureVoaInstance(opts: {
  sourcePath: string;
  instancePath?: string | null;
  userData: string;
  force?: boolean;
  /** Default lean */
  mode?: InstanceMode;
  onProgress?: (p: InstanceProgress) => void;
}): EnsureInstanceResult {
  const mode: InstanceMode = opts.mode || "lean";
  const source = path.resolve(opts.sourcePath.replace(/[\\/]+$/, ""));
  if (!isValidGameRoot(source)) {
    return {
      ok: false,
      error: `Source Skyrim folder is invalid (SkyrimSE.exe missing): ${source}`,
    };
  }

  let dest = opts.instancePath
    ? path.resolve(opts.instancePath.replace(/[\\/]+$/, ""))
    : defaultInstancePath(source, opts.userData);

  if (dest.toLowerCase() === source.toLowerCase()) {
    dest = defaultInstancePath(source, opts.userData);
  }

  const emit = (p: InstanceProgress) => {
    try {
      opts.onProgress?.(p);
    } catch {
      /* ignore */
    }
  };

  try {
    const marker = readInstanceMarker(dest);
    const modeMismatch = marker && (marker.mode || "full") !== mode;
    const mustRebuild =
      Boolean(opts.force) ||
      Boolean(modeMismatch) ||
      (marker && path.resolve(marker.sourcePath).toLowerCase() !== source.toLowerCase());

    if (mustRebuild && (isVoaInstance(dest) || fs.existsSync(dest))) {
      emit({
        phase: "clone",
        current: 0,
        total: 1,
        percent: 0,
        message:
          modeMismatch
            ? "Upgrading VOA folder to multiplayer-safe (vanilla) layout…"
            : "Removing old VOA game folder…",
      });
      try {
        fs.rmSync(dest, { recursive: true, force: true });
      } catch (e: any) {
        return {
          ok: false,
          error: `Could not remove old VOA folder (close the game first): ${e?.message || e}`,
        };
      }
    }

    const marker2 = readInstanceMarker(dest);
    if (
      !mustRebuild &&
      marker2 &&
      instanceLooksComplete(dest) &&
      (marker2.mode || "lean") === mode &&
      path.resolve(marker2.sourcePath).toLowerCase() === source.toLowerCase()
    ) {
      emit({
        phase: "scan",
        current: 0,
        total: 1,
        percent: 5,
        message: "Checking VOA game folder…",
      });
      const critical = ["SkyrimSE.exe", "Data\\Skyrim.esm", "Data\\Update.esm"];
      let repaired = 0;
      for (const rel of critical) {
        const d = path.join(dest, rel);
        const s = path.join(source, rel);
        if (!fs.existsSync(d) && fs.existsSync(s)) {
          linkOrCopy(s, d);
          repaired++;
        }
      }
      try {
        writeFileExclusive(path.join(dest, "steam_appid.txt"), "489830", "utf8");
      } catch {
        /* ignore */
      }
      if (mode === "lean") writeVanillaPluginsTxt(dest);
      marker2.lastSyncedAt = new Date().toISOString();
      marker2.mode = mode;
      marker2.version = 2;
      writeFileExclusive(
        path.join(dest, MARKER_NAME),
        JSON.stringify(marker2, null, 2) + "\n",
        "utf8"
      );
      emit({
        phase: "done",
        current: 1,
        total: 1,
        percent: 100,
        message: repaired
          ? `VOA game folder ready (repaired ${repaired} file(s))`
          : "VOA game folder ready",
      });
      return {
        ok: true,
        path: dest,
        sourcePath: source,
        reused: true,
        hardlinked: marker2.hardlinked,
        copied: marker2.copied,
        skipped: 0,
        mode,
      };
    }

    emit({
      phase: "scan",
      current: 0,
      total: 1,
      percent: 2,
      message:
        mode === "lean"
          ? "Scanning for vanilla game files (multiplayer-safe)…"
          : "Scanning base Skyrim install…",
    });
    const files = collectFiles(source, mode);
    const total = files.length || 1;
    emit({
      phase: "scan",
      current: 0,
      total,
      percent: 5,
      message: `Found ${files.length} files to link/copy…`,
    });

    fs.mkdirSync(dest, { recursive: true });
    fs.mkdirSync(path.join(dest, "Data", "SKSE", "Plugins"), { recursive: true });
    fs.mkdirSync(path.join(dest, "Data", "Platform", "Plugins"), { recursive: true });
    fs.mkdirSync(path.join(dest, "Data", "Platform", "PluginsDev"), { recursive: true });

    let hardlinked = 0;
    let copied = 0;
    let skipped = 0;
    let i = 0;
    for (const f of files) {
      i++;
      const target = path.join(dest, f.rel);
      try {
        const relNorm = f.rel.replace(/\\/g, "/").toLowerCase();
        if (
          relNorm === "data/platform/plugins/skymp5-client.js" ||
          relNorm === "data/platform/plugins/skymp5-client-settings.txt" ||
          relNorm === "data/platform/distribution/password"
        ) {
          skipped++;
          continue;
        }
        const m = linkOrCopy(f.abs, target);
        if (m === "hardlink") hardlinked++;
        else copied++;
      } catch (e: any) {
        skipped++;
        if (f.rel.toLowerCase().endsWith("skyrimse.exe")) {
          return {
            ok: false,
            error: `Failed to clone SkyrimSE.exe: ${e?.message || e}`,
          };
        }
      }
      if (i % 40 === 0 || i === total) {
        emit({
          phase: "clone",
          current: i,
          total,
          percent: Math.min(99, Math.round(5 + (i / total) * 90)),
          message: `Building VOA game folder… ${i}/${total}`,
        });
      }
    }

    if (!instanceLooksComplete(dest)) {
      return {
        ok: false,
        error:
          "VOA game folder is incomplete after clone (SkyrimSE.exe / Data missing). " +
          "Check disk space and that the base Skyrim path is correct.",
        path: dest,
        sourcePath: source,
      };
    }

    try {
      writeFileExclusive(path.join(dest, "steam_appid.txt"), "489830", "utf8");
    } catch {
      /* ignore */
    }
    if (mode === "lean") writeVanillaPluginsTxt(dest);

    const markerOut: InstanceMarker = {
      sourcePath: source,
      createdAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
      hardlinked,
      copied,
      mode,
      version: 2,
    };
    writeFileExclusive(
      path.join(dest, MARKER_NAME),
      JSON.stringify(markerOut, null, 2) + "\n",
      "utf8"
    );

    emit({
      phase: "done",
      current: total,
      total,
      percent: 100,
      message:
        mode === "lean"
          ? `Multiplayer-safe VOA folder ready (${hardlinked} hardlinks, ${copied} copies)`
          : `VOA game folder ready (${hardlinked} hardlinks, ${copied} copies)`,
    });

    return {
      ok: true,
      path: dest,
      sourcePath: source,
      created: true,
      hardlinked,
      copied,
      skipped,
      mode,
    };
  } catch (e: any) {
    emit({
      phase: "error",
      current: 0,
      total: 1,
      percent: 0,
      message: e?.message || String(e),
    });
    return { ok: false, error: e?.message || String(e), sourcePath: source };
  }
}
