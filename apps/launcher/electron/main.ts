import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  safeStorage,
  clipboard,
  Menu,
  protocol,
} from "electron";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { spawn, execFile, execFileSync } from "child_process";
import { URL, pathToFileURL } from "url";
import { promisify } from "util";
import {
  defaultInstancePath,
  ensureVoaInstance,
  isValidGameRoot,
  writeFileExclusive,
  purgeBannedInstanceJunk,
  pathLooksLikeProgramFiles,
  type InstanceProgress,
} from "./voaInstance";

const execFileAsync = promisify(execFile);

// Must be set before app ready — allows BGM autoplay without a click
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Custom media scheme so <audio> can stream from resources/ outside asar
protocol.registerSchemesAsPrivileged([
  {
    scheme: "voa-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

/**
 * Official public platform API (players). MUST be HTTPS (Nexus compliance §3).
 * Override with VOA_API_URL for local dev (http://127.0.0.1 only).
 */
const PUBLIC_API_URL = "https://api.visionsofaetherius.com";
const PUBLIC_GAME = {
  ip: "178.156.158.116",
  port: 10000,
  name: "Visions of Aetherius",
} as const;

/**
 * Ed25519 public key (SPKI base64) for launcher update signatures.
 * Matching private key is offline-only (VOA_UPDATE_SIGNING_KEY). Nexus compliance §4.
 * Replace after `node scripts/sign-launcher-update.mjs --generate-keys`.
 */
const VOA_UPDATE_PUBLIC_KEY_B64 =
  process.env.VOA_UPDATE_PUBLIC_KEY?.trim() ||
  // Ed25519 SPKI (base64). Private key offline only — scripts/sign-launcher-update.mjs
  "MCowBQYDK2VwAyEAqAPth5lpwCl3phkWjbyuRIWKhdc95z0knKVRoUrOlak=";

function isLocalApiHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function assertPublicHttpsApiUrl(urlStr: string): string {
  const base = urlStr.replace(/\/$/, "");
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error(`Invalid VOA_API_URL: ${urlStr}`);
  }
  if (!isLocalApiHost(u.hostname) && u.protocol !== "https:") {
    throw new Error(
      `[VOA compliance] Public API URL must be HTTPS (got ${u.protocol}//${u.hostname}). ` +
        `See docs/NEXUS_COMPLIANCE.md §3.`
    );
  }
  return base;
}

function resolveApiBase(): string {
  if (process.env.VOA_API_URL) {
    return assertPublicHttpsApiUrl(process.env.VOA_API_URL);
  }
  // Packaged player builds: HTTPS public API only
  if (app.isPackaged) return assertPublicHttpsApiUrl(PUBLIC_API_URL);
  // Dev default: local API (run `npm run dev:api`)
  return "http://127.0.0.1:3100";
}

// Prefer 127.0.0.1 (not localhost) — on Windows localhost can hang on IPv6 ::1
const API_BASE = resolveApiBase();
const AUTH_LOOPBACK_PORT = 47821;
/**
 * Preferred Discord OAuth redirect for desktop (custom protocol).
 * Discord docs allow app schemes like myapp://callback — often more reliable than IP http redirects.
 * MUST be listed under Discord Developer Portal → OAuth2 → Redirects (exact).
 */
const AUTH_PROTOCOL = "voa";
const AUTH_PROTOCOL_REDIRECT = "voa://callback";
/** Fallback loopback (also register in Discord if you prefer browser→localhost). */
const AUTH_LOOPBACK_REDIRECT = `http://127.0.0.1:${AUTH_LOOPBACK_PORT}/auth/discord/callback`;
const AUTH_REDIRECT =
  process.env.VOA_OAUTH_REDIRECT?.trim() || AUTH_PROTOCOL_REDIRECT;

function isLocalApiBase(base: string = API_BASE): boolean {
  try {
    const u = new URL(base);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

/** Node-side HTTP JSON (avoids Chromium renderer network / localhost IPv6 issues) */
function apiRequest<T = unknown>(
  method: string,
  pathname: string,
  opts?: { token?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: T; raw: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, API_BASE);
    const lib = url.protocol === "https:" ? https : http;
    const bodyStr = opts?.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          Accept: "application/json",
          ...(bodyStr
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
            : {}),
          ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data = null as unknown as T;
          try {
            data = raw ? (JSON.parse(raw) as T) : (null as T);
          } catch {
            data = raw as unknown as T;
          }
          resolve({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            status: res.statusCode || 0,
            data,
            raw,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`API timeout talking to ${API_BASE}${pathname}`));
    });
    req.on("error", (err) => {
      reject(new Error(`Cannot reach API at ${API_BASE} (${err.message})`));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let mainWindow: BrowserWindow | null = null;
let authServer: http.Server | null = null;

/** Path to API service — local monorepo / optional packaged sidecar only (never hard-coded machine paths). */
function apiServiceDir(): string {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "voa-api") : "",
    path.resolve(__dirname, "../../../services/api"),
    path.resolve(__dirname, "../../services/api"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "dist", "index.js"))) return c;
    if (fs.existsSync(path.join(c, "index.js"))) return c;
  }
  return candidates[0] || "";
}

async function pingApi(): Promise<boolean> {
  try {
    const res = await apiRequest<{ ok?: boolean }>("GET", "/health");
    return res.ok && !!(res.data as any)?.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure API is reachable.
 * - Public builds: only ping remote VPS (never spawn local API / monorepo).
 * - Dev (localhost API): may auto-start monorepo API for convenience.
 */
async function ensureApiRunning(): Promise<boolean> {
  if (await pingApi()) return true;

  // Player builds talk only to the official API
  if (app.isPackaged || !isLocalApiBase()) {
    return false;
  }

  const dir = apiServiceDir();
  if (!dir) return false;
  const vbs = path.join(dir, "start-api-hidden.vbs");
  const indexJsDist = path.join(dir, "dist", "index.js");
  const indexJsRoot = path.join(dir, "index.js");
  try {
    if (fs.existsSync(vbs)) {
      spawn("wscript.exe", [vbs], { detached: true, stdio: "ignore", cwd: dir }).unref();
    } else if (fs.existsSync(indexJsDist)) {
      spawn("node", ["dist/index.js"], {
        detached: true,
        stdio: "ignore",
        cwd: dir,
        windowsHide: true,
        env: { ...process.env, PORT: "3100", HOST: "0.0.0.0" },
      }).unref();
    } else if (fs.existsSync(indexJsRoot)) {
      spawn("node", ["index.js"], {
        detached: true,
        stdio: "ignore",
        cwd: dir,
        windowsHide: true,
        env: { ...process.env, PORT: "3100", HOST: "0.0.0.0" },
      }).unref();
    } else {
      return false;
    }
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await pingApi()) return true;
    }
  } catch {
    return false;
  }
  return await pingApi();
}

/** Bundled SkyMP client plugin shipped with the player launcher (offline fallback) */
function bundledClientPath(): string | null {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, "client", "skymp5-client.js")
      : "",
    path.resolve(__dirname, "../../../client-dist/skymp5-client.js"),
    path.resolve(__dirname, "../../client-dist/skymp5-client.js"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Download text body from API_BASE path (Node http/https).
 */
function downloadTextFromApi(
  urlPath: string,
  timeoutMs = 60_000
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlPath, API_BASE.endsWith("/") ? API_BASE : API_BASE + "/");
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.get(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: { Accept: "application/javascript,text/plain,*/*" },
          timeout: timeoutMs,
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const next = new URL(res.headers.location, u).toString();
            downloadTextFromApi(next, timeoutMs).then(resolve);
            res.resume();
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(Buffer.from(c)));
          res.on("end", () => {
            resolve({
              ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
              status: res.statusCode || 0,
              text: Buffer.concat(chunks).toString("utf8"),
            });
          });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 0, text: "timeout" });
      });
      req.on("error", (e) =>
        resolve({ ok: false, status: 0, text: e.message || String(e) })
      );
    } catch (e: any) {
      resolve({ ok: false, status: 0, text: e?.message || String(e) });
    }
  });
}

/**
 * Canonical VOA Multiplayer Core sizes — must be installed as a matched set.
 * Mixing SP dll from one pack with Impl from another → REL/Relocation.h "unexpected format"
 * and a console that opens then dies instantly (SkyrimPlatformImpl.dll message box).
 *
 * Stack A (primary): AE SP 2.9.0 — SKSEPlugin_Version; proven on host (Paarthurnax).
 * Stack B (legacy CDN): older Query export; SKSE often reports "no version data" / no console.
 */
const VOA_SP_STACK = {
  skyrimPlatformDll: 155_648,
  mpClientDll: 812_032,
  skyrimPlatformImpl: 14_801_408,
} as const;

/** Legacy CDN pack (0.1.6–0.1.7) — accept as matched so we do not thrash reinstall. */
const SP_STACK_ALT = {
  skyrimPlatformDll: 157_696,
  mpClientDll: 812_032,
  skyrimPlatformImpl: 14_579_200,
} as const;

function fileSizeOr0(p: string): number {
  try {
    return fs.existsSync(p) ? fs.statSync(p).size : 0;
  } catch {
    return 0;
  }
}

function spStackPaths(skyrim: string) {
  return {
    spDll: path.join(skyrim, "Data", "SKSE", "Plugins", "SkyrimPlatform.dll"),
    mpDll: path.join(skyrim, "Data", "SKSE", "Plugins", "MpClientPlugin.dll"),
    impl: path.join(
      skyrim,
      "Data",
      "Platform",
      "Distribution",
      "RuntimeDependencies",
      "SkyrimPlatformImpl.dll"
    ),
    versionlib: path.join(
      skyrim,
      "Data",
      "SKSE",
      "Plugins",
      "versionlib-1-6-1170-0.bin"
    ),
  };
}

/** True only if SP + MpClient + Impl are a known matched triple (not mixed packs). */
function isMatchedSpStack(skyrim: string): boolean {
  const p = spStackPaths(skyrim);
  const sp = fileSizeOr0(p.spDll);
  const mp = fileSizeOr0(p.mpDll);
  const impl = fileSizeOr0(p.impl);
  if (!sp || !mp || !impl) return false;
  const a = VOA_SP_STACK;
  const b = SP_STACK_ALT;
  const matchA =
    sp === a.skyrimPlatformDll &&
    mp === a.mpClientDll &&
    impl === a.skyrimPlatformImpl;
  const matchB =
    sp === b.skyrimPlatformDll &&
    mp === b.mpClientDll &&
    impl === b.skyrimPlatformImpl;
  return matchA || matchB;
}

/** Preferred CDN/host stack (A / 2.9.0 Version export). Legacy B still "matched" but we upgrade off it. */
function isPreferredSpStack(skyrim: string): boolean {
  const p = spStackPaths(skyrim);
  const a = VOA_SP_STACK;
  return (
    fileSizeOr0(p.spDll) === a.skyrimPlatformDll &&
    fileSizeOr0(p.mpDll) === a.mpClientDll &&
    fileSizeOr0(p.impl) === a.skyrimPlatformImpl
  );
}

/**
 * Lean SKSE stack for VOA: only SP + MpClient + Address Library 1170.
 * Quarantine EngineFixes / CrashLogger / etc. (they cause SP REL crashes).
 * Detect mismatched SP triples so Play can force-reinstall voa-mp-core.
 */
function ensureLeanSpStack(skyrim: string): string[] {
  const cleaned: string[] = [];
  // Keizaal _disabledByKzl / MO2 / cuprofiles — strip every Play (was re-hardlinked from source)
  try {
    const purged = purgeBannedInstanceJunk(skyrim);
    if (purged.length) {
      cleaned.push(...purged.map((p) => `purged:${p}`));
      playLog(`purged banned junk: ${purged.join(", ")}`);
    }
  } catch (ePurge: any) {
    playLog(`purgeBannedInstanceJunk err: ${ePurge?.message || ePurge}`);
  }
  const plug = path.join(skyrim, "Data", "SKSE", "Plugins");
  try {
    fs.mkdirSync(plug, { recursive: true });
  } catch {
    return cleaned;
  }

  // Official SP: only SkyrimPlatform + MpClient (+ Address Library bins) in Plugins.
  // fmt/spdlog belong exclusively in RuntimeDependencies — quarantine if present.
  const keepExact = new Set(
    [
      "skyrimplatform.dll",
      "skyrimplatform.ini",
      "mpclientplugin.dll",
      "versionlib-1-6-1170-0.bin",
      "versionlib-1-6-1170-0-1.bin",
      "version-1-6-1170-0.bin",
      "versionlib-1-6-1170.bin",
      "versionlib_1_6_1170_0.bin",
    ].map((s) => s.toLowerCase())
  );
  const quarantine = path.join(
    plug,
    `_voa-lean-${new Date().toISOString().slice(0, 10)}`
  );

  try {
    for (const ent of fs.readdirSync(plug, { withFileTypes: true })) {
      if (!ent.isFile()) continue;
      const n = ent.name;
      const nl = n.toLowerCase();
      if (keepExact.has(nl)) continue;
      if (
        nl.includes("versionlib") &&
        (nl.includes("1-6-1170") || nl.includes("1_6_1170"))
      ) {
        continue;
      }
      if (nl.startsWith("version-1-6-1170")) continue;
      if (nl.includes("disabled") || nl.startsWith("_")) continue;
      try {
        fs.mkdirSync(quarantine, { recursive: true });
        const from = path.join(plug, n);
        const to = path.join(quarantine, n);
        try {
          fs.unlinkSync(to);
        } catch {
          /* ignore */
        }
        fs.renameSync(from, to);
        cleaned.push(n);
      } catch {
        try {
          fs.copyFileSync(path.join(plug, n), path.join(quarantine, n));
          fs.unlinkSync(path.join(plug, n));
          cleaned.push(n);
        } catch {
          /* locked */
        }
      }
    }
  } catch {
    /* ignore */
  }

  const paths = spStackPaths(skyrim);
  const spSz = fileSizeOr0(paths.spDll);
  const mpSz = fileSizeOr0(paths.mpDll);
  const implSz = fileSizeOr0(paths.impl);

  if (!isMatchedSpStack(skyrim)) {
    cleaned.push(
      `WARN: SP stack mismatch or incomplete (sp=${spSz} mp=${mpSz} impl=${implSz}) — need VOA Multiplayer Core reinstall`
    );
    playLog(
      `sp-stack mismatch sp=${spSz} mp=${mpSz} impl=${implSz} (want ${VOA_SP_STACK.skyrimPlatformDll}/${VOA_SP_STACK.mpClientDll}/${VOA_SP_STACK.skyrimPlatformImpl})`
    );
  }

  // Dev monorepo: restore a full matched pack when present
  const packRoots = [
    {
      root: path.resolve(__dirname, "../../../tmp-sp-ae"),
      expect: VOA_SP_STACK,
    },
    {
      root: path.resolve(__dirname, "../../../tmp-sp-ae-clean"),
      expect: VOA_SP_STACK,
    },
    {
      root: path.resolve(__dirname, "../../../tmp-sp29"),
      expect: SP_STACK_ALT,
    },
  ];
  if (!isMatchedSpStack(skyrim)) {
    for (const { root, expect } of packRoots) {
      const spSrc = path.join(root, "SKSE", "Plugins", "SkyrimPlatform.dll");
      const mpSrc = path.join(root, "SKSE", "Plugins", "MpClientPlugin.dll");
      const implSrc = path.join(
        root,
        "Platform",
        "Distribution",
        "RuntimeDependencies",
        "SkyrimPlatformImpl.dll"
      );
      try {
        if (!fs.existsSync(spSrc) || !fs.existsSync(mpSrc) || !fs.existsSync(implSrc)) {
          continue;
        }
        if (fs.statSync(spSrc).size !== expect.skyrimPlatformDll) continue;
        if (fs.statSync(implSrc).size !== expect.skyrimPlatformImpl) continue;
        for (const [from, to] of [
          [spSrc, paths.spDll],
          [mpSrc, paths.mpDll],
        ] as const) {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          try {
            fs.unlinkSync(to);
          } catch {
            /* ignore */
          }
          fs.copyFileSync(from, to);
        }
        const rdSrc = path.join(root, "Platform", "Distribution", "RuntimeDependencies");
        const rdDst = path.dirname(paths.impl);
        fs.mkdirSync(rdDst, { recursive: true });
        for (const f of fs.readdirSync(rdSrc)) {
          const from = path.join(rdSrc, f);
          const to = path.join(rdDst, f);
          try {
            if (!fs.statSync(from).isFile()) continue;
            try {
              fs.unlinkSync(to);
            } catch {
              /* ignore */
            }
            fs.copyFileSync(from, to);
          } catch {
            /* ignore */
          }
        }
        cleaned.push(`SP stack restored from ${path.basename(root)}`);
        playLog(`sp-stack restored from ${root}`);
        break;
      } catch (e: any) {
        playLog(`sp-stack restore fail ${root}: ${e?.message || e}`);
      }
    }
  }

  return cleaned;
}

/** True if RuntimeDependencies + CEF look like a complete SP AE pack (not half-copied). */
function hasCompleteRuntimeDeps(skyrim: string): boolean {
  const rd = path.join(
    skyrim,
    "Data",
    "Platform",
    "Distribution",
    "RuntimeDependencies"
  );
  const need = [
    "SkyrimPlatformImpl.dll",
    "libcef.dll",
    "ChakraCore.dll",
    "spdlog.dll",
    "fmt.dll",
  ];
  for (const n of need) {
    if (!fs.existsSync(path.join(rd, n))) return false;
  }
  // CEF resource paks — without these SP often dies before the debug console appears
  const cefPak = path.join(
    skyrim,
    "Data",
    "Platform",
    "Distribution",
    "CEF",
    "resources.pak"
  );
  if (!fs.existsSync(cefPak)) return false;
  try {
    if (fs.statSync(cefPak).size < 1_000_000) return false;
  } catch {
    return false;
  }
  return true;
}

/** True if Play should force-download voa-mp-core again (missing, mismatched, legacy B, or incomplete). */
function needsVoaMpCoreReinstall(skyrim: string): boolean {
  // Prefer stack A only — legacy CDN stack B often fails SKSE load (no SP console).
  if (!isPreferredSpStack(skyrim)) return true;
  if (!hasCompleteRuntimeDeps(skyrim)) return true;
  return false;
}

/**
 * SKSE ships Papyrus overrides under Data/Scripts (Actor.pex, Form.pex, …).
 * Skyrim Platform hard-requires a subset; without them SP logs
 * "[Exception] Missing files: Actor.pex …" and papyrus hooks break.
 */
function hasSksePapyrusScripts(skyrim: string): boolean {
  const dir = path.join(skyrim, "Data", "Scripts");
  // Sentinels from SKSE AE 2.2.6 + SP missing-files list
  const need = [
    "Actor.pex",
    "ActorBase.pex",
    "Form.pex",
    "ObjectReference.pex",
    "Cell.pex",
    "Race.pex",
    "skse.pex",
  ];
  for (const n of need) {
    if (!fs.existsSync(path.join(dir, n))) return false;
  }
  return true;
}

/** Break hardlinks / locked targets before writing package files. */
function copyBreakHardlink(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.voa-new-${process.pid}`;
  try {
    fs.copyFileSync(from, tmp);
    try {
      fs.unlinkSync(to);
    } catch {
      /* may not exist */
    }
    fs.renameSync(tmp, to);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Delete mismatched SP binaries so reinstall cannot merge with hardlinked junk.
 */
function wipeVoaMpCoreFiles(skyrim: string): void {
  const p = spStackPaths(skyrim);
  const extra = [
    p.spDll,
    p.mpDll,
    p.impl,
    path.join(skyrim, "Data", "SKSE", "Plugins", "fmt.dll"),
    path.join(skyrim, "Data", "SKSE", "Plugins", "spdlog.dll"),
    path.join(skyrim, "Data", "SKSE", "Plugins", "SkyrimPlatform.ini"),
  ];
  for (const f of extra) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e: any) {
      playLog(`wipe fail ${f}: ${e?.message || e}`);
    }
  }
  // Clear RuntimeDependencies entirely (will be refilled by voa-mp-core)
  const rd = path.join(
    skyrim,
    "Data",
    "Platform",
    "Distribution",
    "RuntimeDependencies"
  );
  try {
    if (fs.existsSync(rd)) {
      for (const ent of fs.readdirSync(rd, { withFileTypes: true })) {
        if (!ent.isFile()) continue;
        try {
          fs.unlinkSync(path.join(rd, ent.name));
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e: any) {
    playLog(`wipe RD fail: ${e?.message || e}`);
  }
  playLog("wiped SP stack files before voa-mp-core reinstall");
}

/** Skyrim AE multiplayer target: 1.6.1170.x */
function getSkyrimExeVersion(skyrim: string): string | null {
  try {
    const exe = path.join(skyrim, "SkyrimSE.exe");
    if (!fs.existsSync(exe)) return null;
    // PowerShell FileVersionInfo is reliable on Windows
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.FileVersion`,
      ],
      { windowsHide: true, timeout: 8000, encoding: "utf8" }
    );
    return String(out || "").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Install multiplayer join files into the *playable* Skyrim root (VOA instance by default):
 * - skymp5-client.js (prefer live VPS/API copy)
 * - password under Platform/Distribution
 * - SkyrimPlatform.ini (console + plugin folders)
 * - empty PluginsDev; strip non-VOA junk scripts from Plugins
 * Uses exclusive writes so hardlinked Steam files are never mutated.
 */
async function installVoaGameFiles(
  skyrim: string
): Promise<{
  ok: boolean;
  error?: string;
  clientPath?: string;
  source?: "vps" | "bundled";
  clientBytes?: number;
  cleanedPlugins?: string[];
}> {
  const destDir = path.join(skyrim, "Data", "Platform", "Plugins");
  const destJs = path.join(destDir, "skymp5-client.js");
  const cleaned: string[] = [];
  try {
    // Always lean-strip before launch (Verify Files / mod install reintroduce EngineFixes)
    cleaned.push(...ensureLeanSpStack(skyrim));

    fs.mkdirSync(destDir, { recursive: true });
    fs.mkdirSync(path.join(skyrim, "Data", "Platform", "PluginsDev"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(skyrim, "Data", "Platform", "PluginsNoLoad"), {
      recursive: true,
    });

    let body = "";
    let source: "vps" | "bundled" = "bundled";

    // 1) Prefer live client from VOA API (same file game server ClientVerify uses)
    const remote = await downloadTextFromApi("/v1/client/skymp5-client.js");
    if (remote.ok && remote.text && remote.text.length > 10_000) {
      body = remote.text;
      source = "vps";
    } else {
      // 2) Fallback: launcher-bundled client
      const bundled = bundledClientPath();
      if (!bundled) {
        return {
          ok: false,
          error:
            "Could not download multiplayer client from the VOA server, and this launcher has no bundled client. Check your connection or re-download the launcher.",
        };
      }
      body = fs.readFileSync(bundled, "utf8");
      source = "bundled";
    }

    // Exclusive write (break hardlinks so the main Skyrim install is never modified)
    writeFileExclusive(destJs, body, "utf8");

    // Networking password (SkyMP SLikeNet) — always enforce
    const distDir = path.join(skyrim, "Data", "Platform", "Distribution");
    fs.mkdirSync(distDir, { recursive: true });
    writeFileExclusive(path.join(distDir, "password"), "2", "utf8");

    // Unbind vanilla Wait from T (DIK 0x14) so VOA chat can use T.
    // Full controlmap override under Data/Interface/Controls/PC/
    try {
      const controlmapCandidates = [
        path.join(process.resourcesPath || "", "client", "Interface", "Controls", "PC", "controlmap.txt"),
        path.resolve(__dirname, "../../../client-dist/Interface/Controls/PC/controlmap.txt"),
        path.resolve(__dirname, "../../client-dist/Interface/Controls/PC/controlmap.txt"),
        path.resolve(
          __dirname,
          "../../../../deploy/assets/Interface/Controls/PC/controlmap.txt"
        ),
      ];
      let controlmapSrc = "";
      for (const c of controlmapCandidates) {
        try {
          if (c && fs.existsSync(c)) {
            controlmapSrc = c;
            break;
          }
        } catch {
          /* ignore */
        }
      }
      if (controlmapSrc) {
        const mapDir = path.join(skyrim, "Data", "Interface", "Controls", "PC");
        fs.mkdirSync(mapDir, { recursive: true });
        writeFileExclusive(
          path.join(mapDir, "controlmap.txt"),
          fs.readFileSync(controlmapSrc, "utf8"),
          "utf8"
        );
        cleaned.push("controlmap.txt(Wait unbound)");
      }
      // In-game rebinds write controlmap_custom.txt and would re-bind Wait to T
      for (const custom of [
        path.join(skyrim, "controlmap_custom.txt"),
        path.join(skyrim, "Data", "controlmap_custom.txt"),
      ]) {
        try {
          if (fs.existsSync(custom)) {
            fs.unlinkSync(custom);
            cleaned.push(path.basename(custom));
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }

    // SkyrimSoulsRE keeps menus unpaused — conflicts with VOA menu pause. Disable while playing VOA.
    try {
      const souls = path.join(skyrim, "Data", "SKSE", "Plugins", "SkyrimSoulsRE.dll");
      const soulsOff = souls + ".voa-disabled";
      if (fs.existsSync(souls) && !fs.existsSync(soulsOff)) {
        fs.renameSync(souls, soulsOff);
        cleaned.push("SkyrimSoulsRE.dll");
      }
    } catch {
      /* ignore */
    }

    // Ensure SP loads Plugins + shows console (Hello Multiplayer / connect logs)
    const spIni = path.join(skyrim, "Data", "SKSE", "Plugins", "SkyrimPlatform.ini");
    try {
      fs.mkdirSync(path.dirname(spIni), { recursive: true });
      writeFileExclusive(
        spIni,
        [
          "[Debug]",
          "LogLevel = 0",
          "Cmd = true",
          "CmdOffsetLeft = 0",
          // Large, low on screen so friends see Hello Multiplayer (was easy to miss at 600/900x350)
          "CmdOffsetTop = 400",
          "CmdWidth = 1400",
          "CmdHeight = 450",
          "CmdIsAlwaysOnTop = false",
          // CEF ON — required for VOA chat box, radial menu, announce popup overlays
          // (lean matched SP stack; keep false only if Chromium crashes on your machine)
          "ChromiumEnabled = true",
          "",
          "[Main]",
          "PluginFolders = Data/Platform/Plugins;Data/Platform/PluginsDev",
          "",
        ].join("\r\n"),
        "utf8"
      );
    } catch {
      /* ignore */
    }

    // SP loads EVERY file in Plugins except *-settings.txt / *-logs.txt.
    // Move non-VOA scripts out so only the multiplayer client runs.
    const keep = new Set([
      "skymp5-client.js",
      "skymp5-client-settings.txt",
    ]);
    const quarantine = path.join(
      skyrim,
      "Data",
      "Platform",
      "PluginsNoLoad",
      `_voa-quarantine-${Date.now()}`
    );
    for (const ent of fs.readdirSync(destDir, { withFileTypes: true })) {
      if (keep.has(ent.name)) continue;
      if (ent.name.startsWith(".")) continue;
      try {
        fs.mkdirSync(quarantine, { recursive: true });
        fs.renameSync(path.join(destDir, ent.name), path.join(quarantine, ent.name));
        cleaned.push(ent.name);
      } catch {
        /* ignore locked files */
      }
    }

    return {
      ok: true,
      clientPath: destJs,
      source,
      clientBytes: Buffer.byteLength(body, "utf8"),
      cleanedPlugins: cleaned,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function playLog(line: string): void {
  try {
    const p = path.join(app.getPath("userData"), "voa-play.log");
    fs.appendFileSync(
      p,
      `[${new Date().toISOString()}] ${line}\n`,
      "utf8"
    );
  } catch {
    /* ignore */
  }
}

/** True if path is under OneDrive (cloud) — VOA must never use these. */
function isOneDrivePath(p: string | null | undefined): boolean {
  if (!p) return false;
  let n = String(p).replace(/\\/g, "/").toLowerCase();
  if (
    n.includes("/onedrive") ||
    n.includes("onedrive -") ||
    n.includes("onedrive/") ||
    n.startsWith("onedrive")
  ) {
    return true;
  }
  try {
    const real = fs.realpathSync(p);
    n = real.replace(/\\/g, "/").toLowerCase();
    if (n.includes("onedrive")) return true;
  } catch {
    /* path may not exist yet */
  }
  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
    const od = process.env[key];
    if (!od) continue;
    const odn = od.replace(/\\/g, "/").toLowerCase().replace(/\/$/, "");
    if (odn && n.startsWith(odn)) return true;
  }
  return false;
}

/**
 * Local Documents root that is NEVER OneDrive.
 * Prefer %USERPROFILE%\Documents only if not redirected; else LocalAppData VOA.
 */
function getLocalDocumentsPath(): string {
  const tryPath = (p: string): string | null => {
    if (!p || isOneDrivePath(p)) return null;
    try {
      fs.mkdirSync(p, { recursive: true });
      return p;
    } catch {
      return null;
    }
  };

  // Explicit local profile Documents (reject if junction → OneDrive)
  if (process.env.USERPROFILE) {
    const d = tryPath(path.join(process.env.USERPROFILE, "Documents"));
    if (d) return d;
  }

  try {
    const docs = app.getPath("documents");
    const d = tryPath(docs);
    if (d) return d;
  } catch {
    /* ignore */
  }

  // Guaranteed local: next to launcher userData (AppData\Roaming\... is not OneDrive)
  const fallback = path.join(app.getPath("userData"), "Documents");
  fs.mkdirSync(fallback, { recursive: true });
  playLog(`documents using local fallback (OneDrive blocked): ${fallback}`);
  return fallback;
}

/** My Games / Skyrim SE roots to use (never OneDrive). */
function getLocalSkyrimMyGamesDirs(): string[] {
  const out: string[] = [];
  const add = (p: string) => {
    if (!p || isOneDrivePath(p)) return;
    if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  };
  add(path.join(getLocalDocumentsPath(), "My Games", "Skyrim Special Edition"));
  add(
    path.join(app.getPath("userData"), "My Games", "Skyrim Special Edition")
  );
  if (process.env.LOCALAPPDATA) {
    add(
      path.join(
        process.env.LOCALAPPDATA,
        "VOA",
        "My Games",
        "Skyrim Special Edition"
      )
    );
  }
  return out;
}

function rejectOneDrivePath(p: string, what: string): string | null {
  if (isOneDrivePath(p)) {
    return `${what} cannot be on OneDrive (${p}). Use a local disk path only (e.g. Steam under Program Files or a local drive). Disable OneDrive "Backup Documents" if needed.`;
  }
  return null;
}

/** True if a process with this image name is running (Windows). */
function isProcessRunning(imageName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", `IMAGENAME eq ${imageName}`, "/NH"],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        const out = String(stdout || "").toLowerCase();
        resolve(out.includes(imageName.toLowerCase()));
      }
    );
  });
}

async function waitForGameProcess(timeoutMs = 12_000): Promise<{
  seen: boolean;
  which?: string;
}> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isProcessRunning("SkyrimSE.exe")) {
      return { seen: true, which: "SkyrimSE.exe" };
    }
    if (await isProcessRunning("skse64_loader.exe")) {
      return { seen: true, which: "skse64_loader.exe" };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { seen: false };
}

/** Clear Mark-of-the-Web so Windows does not silently block skse64_loader / SP DLLs. */
function unblockWindowsFile(filePath: string): void {
  try {
    if (process.platform !== "win32" || !fs.existsSync(filePath)) return;
    const zone = `${filePath}:Zone.Identifier`;
    try {
      fs.unlinkSync(zone);
    } catch {
      /* no zone stream */
    }
  } catch {
    /* ignore */
  }
}

/**
 * CDN zip extracts often keep MOTW on every .dll under Data/Platform.
 * Unblock the whole VOA tree — LoadLibrary of SkyrimPlatformImpl/libcef fails
 * silently otherwise (vanilla menu, no skyrim-platform.log).
 */
function unblockWindowsGameTree(gameDir: string): void {
  if (process.platform !== "win32" || !gameDir || !fs.existsSync(gameDir)) return;
  const roots = [
    gameDir,
    path.join(gameDir, "Data", "SKSE"),
    path.join(gameDir, "Data", "Platform"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      const lit = root.replace(/'/g, "''");
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Get-ChildItem -LiteralPath '${lit}' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '\\.(dll|exe|bin|pak)$' } | Unblock-File -ErrorAction SilentlyContinue`,
        ],
        { windowsHide: true, timeout: 90_000 }
      );
    } catch (e: any) {
      playLog(`Unblock-File tree fail ${root}: ${e?.message || e}`);
    }
  }
  // Also strip Zone.Identifier on the critical load path (PS may miss some)
  const critical = [
    path.join(gameDir, "skse64_loader.exe"),
    path.join(gameDir, "skse64_1_6_1170.dll"),
    path.join(gameDir, "Data", "SKSE", "Plugins", "SkyrimPlatform.dll"),
    path.join(gameDir, "Data", "SKSE", "Plugins", "MpClientPlugin.dll"),
    path.join(
      gameDir,
      "Data",
      "Platform",
      "Distribution",
      "RuntimeDependencies",
      "SkyrimPlatformImpl.dll"
    ),
    path.join(
      gameDir,
      "Data",
      "Platform",
      "Distribution",
      "RuntimeDependencies",
      "libcef.dll"
    ),
    path.join(
      gameDir,
      "Data",
      "Platform",
      "Distribution",
      "RuntimeDependencies",
      "ChakraCore.dll"
    ),
  ];
  for (const f of critical) unblockWindowsFile(f);
}

/**
 * Force-close Skyrim / SKSE so Play can start a clean skse64_loader session.
 * Vanilla Steam SkyrimSE without SKSE must not be treated as a successful Play.
 */
async function stopSkyrimProcesses(): Promise<void> {
  if (process.platform !== "win32") return;
  const images = ["SkyrimSE.exe", "skse64_loader.exe", "SkyrimSELauncher.exe"];
  for (const img of images) {
    try {
      await execFileAsync("taskkill", ["/F", "/IM", img, "/T"], {
        windowsHide: true,
        timeout: 12_000,
      });
      playLog(`taskkill ${img} ok`);
    } catch {
      /* not running or access denied */
    }
  }
  // Brief settle so Steam/handles release the exe
  await new Promise((r) => setTimeout(r, 800));
}

/**
 * Start skse64_loader.exe with the Skyrim install as process working directory.
 * Address Library opens Data/SKSE/Plugins/versionlib-*.bin relative to CWD.
 *
 * NEVER launches bare SkyrimSE.exe.
 * NEVER treats an already-running vanilla Skyrim as success (that was a bug —
 * friends saw "Game started" with no SKSE / no SP console).
 */
async function launchSkseMultiplayer(
  skyrim: string,
  loaderPath: string
): Promise<{ ok: boolean; error?: string; method?: string }> {
  const gameDir = path.resolve(skyrim.replace(/[\\/]+$/, ""));
  if (!fs.existsSync(loaderPath)) {
    return { ok: false, error: `skse64_loader.exe not found in ${gameDir}` };
  }
  if (!fs.existsSync(path.join(gameDir, "SkyrimSE.exe"))) {
    return {
      ok: false,
      error: `SkyrimSE.exe not found in ${gameDir}. Set the real Skyrim SE folder in Settings (the folder that contains SkyrimSE.exe).`,
    };
  }

  playLog(`launch begin dir=${gameDir} loader=${loaderPath}`);

  // If Skyrim is already open (often from Steam without SKSE), close it first.
  if (
    (await isProcessRunning("SkyrimSE.exe")) ||
    (await isProcessRunning("skse64_loader.exe"))
  ) {
    playLog("game already running — stopping so SKSE can start cleanly");
    await stopSkyrimProcesses();
    if (await isProcessRunning("SkyrimSE.exe")) {
      return {
        ok: false,
        error:
          "Skyrim is already running and could not be closed. Exit Skyrim completely (check Task Manager for SkyrimSE.exe), then press Play again. Do not start Skyrim from Steam.",
      };
    }
  }

  // Unblock loader + full SP/SKSE tree (CDN extracts keep MOTW; PF copies worse)
  unblockWindowsGameTree(gameDir);

  // Ensure steam_appid for non-Steam launches
  try {
    writeFileExclusive(path.join(gameDir, "steam_appid.txt"), "489830", "utf8");
  } catch {
    /* ignore */
  }

  const qPs = (p: string) => `'${p.replace(/'/g, "''")}'`;
  const qCmd = (p: string) => `"${p.replace(/"/g, '""')}"`;

  // --- 1) PowerShell Start-Process (most reliable cwd + Program Files) ---
  try {
    const ps = [
      "Start-Process",
      "-FilePath",
      qPs(loaderPath),
      "-WorkingDirectory",
      qPs(gameDir),
    ].join(" ");
    playLog(`try powershell: ${ps}`);
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, timeout: 15_000, cwd: gameDir }
    );
    playLog("spawned skse64_loader (powershell Start-Process)");
    const check = await waitForGameProcess(14_000);
    if (check.seen) {
      playLog(`ok powershell process=${check.which}`);
      return { ok: true, method: "powershell-start" };
    }
    playLog("powershell: no Skyrim/SKSE process within 14s");
  } catch (e: any) {
    playLog(`powershell error: ${e?.message || e}`);
  }

  // --- 2) Direct spawn with CWD = game root ---
  try {
    const child = spawn(loaderPath, [], {
      cwd: gameDir,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: { ...process.env },
    });
    const pid = child.pid;
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      setTimeout(resolve, 300);
    });
    child.unref();
    playLog(`spawned skse64_loader (direct) pid=${pid ?? "?"}`);
    const check = await waitForGameProcess(12_000);
    if (check.seen) {
      playLog(`ok direct process=${check.which}`);
      return { ok: true, method: "spawn-cwd" };
    }
    playLog("direct spawn: no process within 12s");
  } catch (e: any) {
    playLog(`direct spawn error: ${e?.message || e}`);
  }

  // --- 3) cmd start /D ---
  try {
    const cmdLine = `start "" /D ${qCmd(gameDir)} ${qCmd(loaderPath)}`;
    playLog(`try cmd: ${cmdLine}`);
    const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", cmdLine], {
      cwd: gameDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      setTimeout(resolve, 300);
    });
    child.unref();
    playLog("spawned via cmd start /D");
    const check = await waitForGameProcess(12_000);
    if (check.seen) {
      playLog(`ok start/D process=${check.which}`);
      return { ok: true, method: "start-d" };
    }
    playLog("start /D: no process within 12s");
  } catch (e: any) {
    playLog(`start /D error: ${e?.message || e}`);
  }

  // --- 4) Helper .bat in game dir (last resort; same as double-clicking loader) ---
  try {
    const bat = path.join(gameDir, "_voa_launch_skse.bat");
    const batBody =
      "@echo off\r\n" +
      `cd /d ${qCmd(gameDir)}\r\n` +
      `start "" ${qCmd(loaderPath)}\r\n`;
    writeFileExclusive(bat, batBody, "utf8");
    playLog(`try bat: ${bat}`);
    const child = spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", qCmd(bat)], {
      cwd: gameDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      setTimeout(resolve, 400);
    });
    child.unref();
    const check = await waitForGameProcess(12_000);
    if (check.seen) {
      playLog(`ok bat process=${check.which}`);
      return { ok: true, method: "bat" };
    }
    playLog("bat: no process within 12s");
  } catch (e: any) {
    playLog(`bat error: ${e?.message || e}`);
  }

  return {
    ok: false,
    error:
      "skse64_loader.exe did not start. Close Skyrim completely, keep Steam running, " +
      "then try: (1) Play again, or (2) double-click skse64_loader.exe in the VOA game folder. " +
      "If Windows/antivirus blocks it, allow the file. " +
      `Folder: ${gameDir}. Log: ${path.join(app.getPath("userData"), "voa-play.log")}`,
  };
}
const storePath = () => path.join(app.getPath("userData"), "voa-store.json");

type NexusUserInfo = {
  userId?: number;
  name?: string;
  isPremium?: boolean;
  isSupporter?: boolean;
};

type Store = {
  accessToken?: string;
  refreshToken?: string;
  user?: unknown;
  /** User's main Skyrim install (source). Not written by VOA Play when instance mode is on. */
  skyrimPath?: string;
  /**
   * Dedicated VOA game tree (hardlinks/copies from skyrimPath).
   * Play + mod install target this folder so the main install stays untouched.
   */
  voaInstancePath?: string;
  /** Default true — use isolated VOA folder. Set false only for advanced users. */
  useVoaInstance?: boolean;
  /** Selected character slot 0|1 for next Play */
  characterSlot?: number;
  /** Nexus OAuth access token (Bearer) — from browser login, not API key paste */
  nexusAccessToken?: string;
  nexusRefreshToken?: string;
  /** Unix ms when access token expires */
  nexusTokenExpiresAt?: number;
  nexusUser?: NexusUserInfo | null;
  /** Launcher background music (0–100). Ready for track drop-in. */
  musicVolume?: number;
  musicMuted?: boolean;
};

function readStore(): Store {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Store & {
      encAccess?: string;
      encRefresh?: string;
      encNexusAccess?: string;
      encNexusRefresh?: string;
      /** legacy personal API key (migrated away) */
      encNexusKey?: string;
      nexusApiKey?: string;
    };
    const out: Store = { ...raw };
    if (raw.encAccess && safeStorage.isEncryptionAvailable()) {
      out.accessToken = safeStorage.decryptString(Buffer.from(raw.encAccess, "base64"));
    }
    if (raw.encRefresh && safeStorage.isEncryptionAvailable()) {
      out.refreshToken = safeStorage.decryptString(Buffer.from(raw.encRefresh, "base64"));
    }
    if (raw.encNexusAccess && safeStorage.isEncryptionAvailable()) {
      out.nexusAccessToken = safeStorage.decryptString(
        Buffer.from(raw.encNexusAccess, "base64")
      );
    }
    if (raw.encNexusRefresh && safeStorage.isEncryptionAvailable()) {
      out.nexusRefreshToken = safeStorage.decryptString(
        Buffer.from(raw.encNexusRefresh, "base64")
      );
    }
    delete (out as { encAccess?: string }).encAccess;
    delete (out as { encRefresh?: string }).encRefresh;
    delete (out as { encNexusAccess?: string }).encNexusAccess;
    delete (out as { encNexusRefresh?: string }).encNexusRefresh;
    delete (out as { encNexusKey?: string }).encNexusKey;
    delete (out as { nexusApiKey?: string }).nexusApiKey;
    return out;
  } catch {
    return {};
  }
}

function writeStore(partial: Store): void {
  const prev = readStore();
  // Only override keys that were explicitly provided (allow clearing with null/"")
  const next: Store = { ...prev };
  for (const key of Object.keys(partial) as (keyof Store)[]) {
    if (partial[key] !== undefined) {
      (next as Record<string, unknown>)[key] = partial[key] as unknown;
    }
  }

  const toWrite: Record<string, unknown> = {
    user: next.user ?? null,
    skyrimPath: next.skyrimPath ?? null,
    voaInstancePath: next.voaInstancePath ?? null,
    nexusUser: next.nexusUser ?? null,
  };
  if (typeof next.useVoaInstance === "boolean") {
    toWrite.useVoaInstance = next.useVoaInstance;
  }
  if (typeof next.characterSlot === "number") {
    toWrite.characterSlot = next.characterSlot;
  }
  if (typeof next.nexusTokenExpiresAt === "number") {
    toWrite.nexusTokenExpiresAt = next.nexusTokenExpiresAt;
  }
  if (typeof next.musicVolume === "number") {
    toWrite.musicVolume = Math.max(0, Math.min(100, Math.round(next.musicVolume)));
  }
  if (typeof next.musicMuted === "boolean") {
    toWrite.musicMuted = next.musicMuted;
  }

  const access = next.accessToken || "";
  const refresh = next.refreshToken || "";
  const nexusAccess = next.nexusAccessToken || "";
  const nexusRefresh = next.nexusRefreshToken || "";

  if (safeStorage.isEncryptionAvailable()) {
    if (access) {
      toWrite.encAccess = safeStorage.encryptString(access).toString("base64");
    }
    if (refresh) {
      toWrite.encRefresh = safeStorage.encryptString(refresh).toString("base64");
    }
    if (nexusAccess) {
      toWrite.encNexusAccess = safeStorage.encryptString(nexusAccess).toString("base64");
    }
    if (nexusRefresh) {
      toWrite.encNexusRefresh = safeStorage.encryptString(nexusRefresh).toString("base64");
    }
  } else {
    if (access) toWrite.accessToken = access;
    if (refresh) toWrite.refreshToken = refresh;
    if (nexusAccess) toWrite.nexusAccessToken = nexusAccess;
    if (nexusRefresh) toWrite.nexusRefreshToken = nexusRefresh;
  }

  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(toWrite, null, 2), "utf8");
}

function detectSkyrimPath(): string | null {
  const candidates = [
    "E:\\Steam\\SteamInstallFolder\\steamapps\\common\\Skyrim Special Edition",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Skyrim Special Edition",
    "C:\\Program Files\\Steam\\steamapps\\common\\Skyrim Special Edition",
    "D:\\Steam\\steamapps\\common\\Skyrim Special Edition",
  ];
  for (const c of candidates) {
    if (isOneDrivePath(c)) continue;
    if (fs.existsSync(path.join(c, "SkyrimSE.exe"))) return c;
  }
  return null;
}

function getSourceSkyrimPath(): string | null {
  const s = readStore();
  if (s.skyrimPath && isValidGameRoot(s.skyrimPath)) {
    const resolved = path.resolve(s.skyrimPath);
    if (isOneDrivePath(resolved)) {
      playLog(`BLOCKED OneDrive skyrimPath: ${resolved}`);
      return null;
    }
    return resolved;
  }
  const detected = detectSkyrimPath();
  return detected ? path.resolve(detected) : null;
}

function emitInstanceProgress(p: InstanceProgress): void {
  try {
    mainWindow?.webContents.send("instance:progress", p);
  } catch {
    /* ignore */
  }
}

/**
 * Playable root: isolated VOA instance (default) or direct base path if user disabled isolation.
 */
function resolvePlayableSkyrim(opts?: {
  forceRebuild?: boolean;
}): {
  ok: boolean;
  path?: string;
  sourcePath?: string;
  usingInstance?: boolean;
  created?: boolean;
  reused?: boolean;
  hardlinked?: number;
  copied?: number;
  error?: string;
} {
  const source = getSourceSkyrimPath();
  if (!source) {
    return {
      ok: false,
      error:
        "Base Skyrim folder not set (or was on OneDrive). In Settings, Browse to your local Steam Skyrim Special Edition folder (SkyrimSE.exe). OneDrive paths are not allowed.",
    };
  }
  if (isOneDrivePath(source)) {
    return {
      ok: false,
      error:
        "Skyrim path is on OneDrive. Move/install Skyrim on a local disk (Steam library) and set that path in Settings.",
    };
  }
  const store = readStore();
  const useInstance = store.useVoaInstance !== false;
  if (!useInstance) {
    return { ok: true, path: source, sourcePath: source, usingInstance: false };
  }

  const userData = app.getPath("userData");
  let instancePath =
    store.voaInstancePath &&
    path.resolve(store.voaInstancePath).toLowerCase() !== source.toLowerCase()
      ? path.resolve(store.voaInstancePath)
      : defaultInstancePath(source, userData);
  // Never put VOA instance on OneDrive or under Program Files (friends' Steam default)
  if (isOneDrivePath(instancePath) || pathLooksLikeProgramFiles(instancePath)) {
    const movedFrom = instancePath;
    instancePath = defaultInstancePath(source, userData);
    // If default still unsafe (edge case), force userData Game folder
    if (isOneDrivePath(instancePath) || pathLooksLikeProgramFiles(instancePath)) {
      instancePath = path.join(userData, "Game", "Skyrim Special Edition - VOA");
    }
    playLog(
      `instance path unsafe (${movedFrom}) — migrating to ${instancePath}`
    );
    // Force rebuild into the writable location so we do not reuse a half-broken PF tree
    opts = { ...opts, forceRebuild: true };
  }

  const res = ensureVoaInstance({
    sourcePath: source,
    instancePath,
    userData,
    force: Boolean(opts?.forceRebuild),
    // Multiplayer-safe: vanilla DLC + SKSE essentials only (no full modlist clone)
    mode: "lean",
    onProgress: emitInstanceProgress,
  });
  if (!res.ok || !res.path) {
    return {
      ok: false,
      error: res.error || "Failed to prepare VOA game folder",
      sourcePath: source,
      usingInstance: true,
    };
  }
  writeStore({ voaInstancePath: res.path, useVoaInstance: true });
  playLog(
    `instance ok path=${res.path} created=${Boolean(res.created)} reused=${Boolean(res.reused)} hl=${res.hardlinked ?? 0} cp=${res.copied ?? 0}`
  );
  return {
    ok: true,
    path: res.path,
    sourcePath: source,
    usingInstance: true,
    created: res.created,
    reused: res.reused,
    hardlinked: res.hardlinked,
    copied: res.copied,
  };
}

function resolveAppIcon(): string | undefined {
  // Packaged: icon.ico is copied next to the .exe and into resources/ by afterPack.
  // Dev: use build/ next to the project.
  const candidates = [
    path.join(process.resourcesPath || "", "icon.ico"),
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(path.dirname(process.execPath), "icon.ico"),
    path.join(path.dirname(process.execPath), "icon.png"),
    path.join(__dirname, "../build/icon.ico"),
    path.join(__dirname, "../build/icon.png"),
    path.join(process.resourcesPath || "", "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.png"),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function createWindow() {
  const icon = resolveAppIcon();
  // No File/Edit/View menu bar; custom in-app chrome for close.
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f1115",
    title: "Visions of Aetherius",
    frame: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Chromium autoplay: also set on session (covers media elements)
  try {
    mainWindow.webContents.session.setPermissionRequestHandler(
      (_wc, permission, callback) => {
        if (permission === "media" || permission === "mediaKeySystem") {
          callback(true);
          return;
        }
        callback(false);
      }
    );
  } catch {
    /* ignore */
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // packaged: dist-electron next to dist; dev production build: same layout
    const htmlCandidates = [
      path.join(__dirname, "../dist/index.html"),
      path.join(__dirname, "index.html"),
      path.join(app.getAppPath(), "dist", "index.html"),
    ];
    const html = htmlCandidates.find((p) => fs.existsSync(p));
    if (html) mainWindow.loadFile(html);
    else mainWindow.loadURL("data:text/html,<h1>VOA Launcher: missing dist/index.html</h1>");
  }
}

function applyAuthPayload(payload: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}): void {
  writeStore({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  });
  mainWindow?.webContents.send("auth:updated", payload);
}

function registerVoaProtocol(): void {
  try {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [
          path.resolve(process.argv[1]),
        ]);
      }
    } else {
      app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
    }
  } catch (e) {
    console.warn("protocol register failed", e);
  }
}

/** Handle voa://callback?code=&state= (and loopback-equivalent query strings). */
async function completeOAuthFromParams(
  code: string | null,
  state: string | null,
  err: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (err) return { ok: false, error: `Discord: ${err}` };
  if (!code || !state) return { ok: false, error: "Missing code/state from Discord" };
  try {
    if (!(await ensureApiRunning())) {
      return { ok: false, error: "Cannot reach VOA API to finish login" };
    }
    const ex = await apiRequest<{
      accessToken?: string;
      refreshToken?: string;
      user?: unknown;
      error?: string;
    }>("POST", "/v1/auth/discord/exchange", { body: { code, state } });
    if (!ex.ok || !ex.data?.accessToken || !ex.data?.refreshToken) {
      return {
        ok: false,
        error: (ex.data as any)?.error || ex.raw || `Exchange failed (${ex.status})`,
      };
    }
    applyAuthPayload({
      accessToken: ex.data.accessToken,
      refreshToken: ex.data.refreshToken,
      user: ex.data.user,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function parseAuthDeepLink(urlStr: string): {
  code: string | null;
  state: string | null;
  error: string | null;
} | null {
  if (!urlStr || !/^voa:/i.test(urlStr)) return null;
  try {
    // voa://callback?code=...&state=...
    const u = new URL(urlStr);
    return {
      code: u.searchParams.get("code"),
      state: u.searchParams.get("state"),
      error: u.searchParams.get("error"),
    };
  } catch {
    // Fallback parse
    const q = urlStr.includes("?") ? urlStr.split("?")[1] : "";
    const params = new URLSearchParams(q);
    return {
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
    };
  }
}

async function handleAuthDeepLink(urlStr: string): Promise<void> {
  const parsed = parseAuthDeepLink(urlStr);
  if (!parsed) return;
  const result = await completeOAuthFromParams(parsed.code, parsed.state, parsed.error);
  if (!result.ok) {
    dialog.showErrorBox(
      "Discord login failed",
      result.error ||
        "Unknown error. Add redirect voa://callback in Discord Developer Portal → OAuth2 → Redirects, Save Changes."
    );
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
}

function htmlAuthPage(title: string, message: string, ok: boolean): string {
  const color = ok ? "#3d9a6a" : "#c45c5c";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f1115;color:#e8e6e3;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1a1d24;padding:2rem 2.5rem;border-radius:12px;max-width:440px;box-shadow:0 8px 32px #0008}
h1{margin:0 0 .5rem;font-size:1.25rem;color:${color}}p{margin:0;opacity:.9;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function startAuthLoopback() {
  if (authServer) return;
  authServer = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${AUTH_LOOPBACK_PORT}`);

    // Discord redirects here after 2FA (desktop loopback OAuth)
    if (
      req.method === "GET" &&
      (url.pathname === "/auth/discord/callback" || url.pathname === "/auth/callback")
    ) {
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (err) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlAuthPage(
            "Login failed",
            `Discord returned: ${err}. Close this tab and try Login again in the launcher.`,
            false
          )
        );
        return;
      }
      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlAuthPage("Login failed", "Missing code/state. Close this tab and try again.", false)
        );
        return;
      }

      completeOAuthFromParams(code, state, null).then((ex) => {
        if (!ex.ok) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            htmlAuthPage(
              "Login failed",
              (ex.error || "Exchange failed") +
                " Close this tab and try again from the launcher.",
              false
            )
          );
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlAuthPage(
            "Login successful",
            "You can close this tab and return to the Visions of Aetherius launcher.",
            true
          )
        );
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/complete") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body) as {
            accessToken: string;
            refreshToken: string;
            user: unknown;
          };
          applyAuthPayload(payload);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
  authServer.listen(AUTH_LOOPBACK_PORT, "127.0.0.1");
}

// Single instance so voa:// deep links land in this process
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const deep = argv.find((a) => /^voa:/i.test(a));
    if (deep) void handleAuthDeepLink(deep);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS protocol open
app.on("open-url", (event, url) => {
  event.preventDefault();
  void handleAuthDeepLink(url);
});

app.whenReady().then(async () => {
  registerVoaProtocol();

  // Serve BGM from disk via voa-media://bgm (reliable outside asar)
  protocol.registerFileProtocol("voa-media", (request, callback) => {
    const musicPath = resolveMusicFilePath();
    if (musicPath) {
      callback({ path: musicPath });
      return;
    }
    callback({ error: -6 }); // FILE_NOT_FOUND
  });

  // Boot local VOA API if needed (Play/status depend on it)
  await ensureApiRunning();

  createWindow();
  startAuthLoopback();

  // Cold-start protocol URL (Windows passes it in argv)
  const deep = process.argv.find((a) => /^voa:/i.test(a));
  if (deep) void handleAuthDeepLink(deep);

  const store = readStore();
  if (!store.skyrimPath) {
    const detected = detectSkyrimPath();
    if (detected) writeStore({ skyrimPath: detected });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  authServer?.close();
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("voa:getApiBase", () => API_BASE);

ipcMain.handle("voa:getAppVersion", () => app.getVersion());

ipcMain.handle("voa:windowClose", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.close();
  return true;
});

ipcMain.handle("voa:windowMinimize", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.minimize();
  return true;
});

/**
 * Resolve launcher BGM on disk (not via broken absolute /music URL in asar).
 * Packaged: extraResources → resources/music/launcher-theme.mp3
 */
function resolveMusicFilePath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || "", "music", "launcher-theme.mp3"),
    path.join(app.getAppPath(), "dist", "music", "launcher-theme.mp3"),
    path.join(app.getAppPath(), "public", "music", "launcher-theme.mp3"),
    path.join(__dirname, "..", "dist", "music", "launcher-theme.mp3"),
    path.join(__dirname, "..", "public", "music", "launcher-theme.mp3"),
    // asarUnpack fallback
    path.join(
      process.resourcesPath || "",
      "app.asar.unpacked",
      "dist",
      "music",
      "launcher-theme.mp3"
    ),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).size > 1000) return p;
    } catch {
      /* continue */
    }
  }
  return null;
}

ipcMain.handle("voa:getMusicSrc", () => {
  const filePath = resolveMusicFilePath();
  if (!filePath) {
    return {
      ok: false,
      src: null as string | null,
      error: "Music file not found (expected resources/music/launcher-theme.mp3)",
    };
  }
  // Prefer privileged custom scheme (works with asar-loaded UI); file:// as fallback
  return {
    ok: true,
    src: "voa-media://bgm",
    path: filePath,
    fileUrl: pathToFileURL(filePath).href,
  };
});

/**
 * Nexus Mods OAuth2 + PKCE (browser login — same idea as Discord).
 * Public clients: no client secret. Client ID must be registered with Nexus.
 * Vortex uses "vortex_loopback"; we use "voa_loopback" (register with Nexus staff if missing).
 * Override with VOA_NEXUS_CLIENT_ID.
 */
const NEXUS_OAUTH_BASE = "https://users.nexusmods.com/oauth";
const NEXUS_OAUTH_CLIENT_ID =
  process.env.VOA_NEXUS_CLIENT_ID?.trim() || "voa_loopback";
function nexusAppHeaders(): Record<string, string> {
  return {
    "Application-Name": "VisionsOfAetherius",
    "Application-Version": (() => {
      try {
        return app.getVersion() || "0.2.0";
      } catch {
        return "0.2.0";
      }
    })(),
    accept: "application/json",
  };
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function nexusResultHtml(ok: boolean, detail?: string): string {
  const title = ok ? "Nexus login successful" : "Nexus login failed";
  const body = ok
    ? "You can close this tab and return to Visions of Aetherius."
    : detail || "Close this tab and try again from the launcher.";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0b12;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:420px;padding:28px;border-radius:12px;background:#161622;border:1px solid #333}
h1{font-size:1.25rem;margin:0 0 12px}p{color:#aaa;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

type NexusTokenReply = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function exchangeNexusCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<NexusTokenReply> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: NEXUS_OAUTH_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(`${NEXUS_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...nexusAppHeaders(),
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    if (/invalid_client/i.test(text)) {
      throw new Error(
        `Nexus OAuth client "${NEXUS_OAUTH_CLIENT_ID}" is not registered. Register Visions of Aetherius as a public OAuth app with Nexus Mods (loopback redirects like Vortex), then set VOA_NEXUS_CLIENT_ID if they issue a different id.`
      );
    }
    throw new Error(
      `Nexus token exchange failed (HTTP ${res.status}): ${text.slice(0, 220)}`
    );
  }
  return JSON.parse(text) as NexusTokenReply;
}

async function refreshNexusAccessToken(refreshToken: string): Promise<NexusTokenReply> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: NEXUS_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${NEXUS_OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...nexusAppHeaders(),
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Nexus token refresh failed (HTTP ${res.status}): ${text.slice(0, 180)}`
    );
  }
  return JSON.parse(text) as NexusTokenReply;
}

async function fetchNexusOAuthUser(accessToken: string): Promise<NexusUserInfo> {
  const res = await fetch(`${NEXUS_OAUTH_BASE}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...nexusAppHeaders(),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Nexus userinfo failed (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid Nexus userinfo response");
  }
  const roles: string[] = Array.isArray(data.membership_roles)
    ? data.membership_roles.map(String)
    : Array.isArray(data.membershipRoles)
      ? data.membershipRoles.map(String)
      : [];
  const isPremium =
    roles.some((r) => r.toLowerCase() === "premium") ||
    Boolean(data.is_premium) ||
    Boolean(data.isPremium);
  const isSupporter = roles.some((r) => r.toLowerCase() === "supporter");
  const sub = data.sub ?? data.user_id ?? data.userId;
  return {
    userId: sub != null ? Number(sub) || undefined : undefined,
    name: String(data.name || data.preferred_username || data.username || "Nexus user"),
    isPremium,
    isSupporter,
  };
}

function saveNexusTokens(token: NexusTokenReply, user: NexusUserInfo): void {
  const expiresIn = Number(token.expires_in) || 3600;
  writeStore({
    nexusAccessToken: token.access_token,
    nexusRefreshToken: token.refresh_token || readStore().nexusRefreshToken || "",
    nexusTokenExpiresAt: Date.now() + expiresIn * 1000 - 30_000,
    nexusUser: user,
  });
}

/** Valid OAuth access token for Nexus API (Bearer). Refreshes if needed. */
async function getValidNexusAccessToken(): Promise<string> {
  const s = readStore();
  const access = String(s.nexusAccessToken || "").trim();
  const refresh = String(s.nexusRefreshToken || "").trim();
  const exp = s.nexusTokenExpiresAt || 0;
  if (access && exp > Date.now() + 5_000) return access;
  if (refresh) {
    const token = await refreshNexusAccessToken(refresh);
    const user =
      s.nexusUser ||
      (await fetchNexusOAuthUser(token.access_token).catch(() => ({
        name: "Nexus user",
        isPremium: false,
      })));
    if (!s.nexusUser && token.access_token) {
      try {
        const u = await fetchNexusOAuthUser(token.access_token);
        saveNexusTokens(token, u);
        return token.access_token;
      } catch {
        /* fall through */
      }
    }
    saveNexusTokens(token, user as NexusUserInfo);
    return token.access_token;
  }
  if (access) return access;
  throw new Error(
    "Log in to Nexus Mods under Account (browser login). VOA does not use API keys."
  );
}

function clearNexusAuthFromDisk(): void {
  writeStore({
    nexusAccessToken: "",
    nexusRefreshToken: "",
    nexusTokenExpiresAt: 0,
    nexusUser: null,
  });
  try {
    const p = storePath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      delete raw.encNexusAccess;
      delete raw.encNexusRefresh;
      delete raw.encNexusKey;
      delete raw.nexusAccessToken;
      delete raw.nexusRefreshToken;
      delete raw.nexusApiKey;
      raw.nexusUser = null;
      raw.nexusTokenExpiresAt = 0;
      fs.writeFileSync(p, JSON.stringify(raw, null, 2), "utf8");
    }
  } catch {
    /* ignore */
  }
}

ipcMain.handle("voa:getNexusAccount", () => {
  const s = readStore();
  return {
    linked: Boolean(s.nexusAccessToken || s.nexusRefreshToken),
    user: s.nexusUser || null,
  };
});

/**
 * Browser OAuth login (PKCE + 127.0.0.1 loopback), same pattern as Discord / Vortex.
 * Opens Nexus sign-in page — no personal API key paste.
 */
ipcMain.handle("voa:openNexusLogin", async () => {
  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(16).toString("hex");

  return await new Promise<{
    ok: boolean;
    error?: string;
    user?: NexusUserInfo;
  }>((resolve) => {
    let settled = false;
    let server: http.Server | null = null;
    let redirectUri = "";

    const finish = (result: {
      ok: boolean;
      error?: string;
      user?: NexusUserInfo;
    }) => {
      if (settled) return;
      settled = true;
      try {
        server?.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        error:
          "Timed out waiting for Nexus login (5 min). Finish sign-in in the browser, then allow the redirect back to the launcher.",
      });
    }, 300_000);

    server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url || "/", "http://127.0.0.1");
        const err = u.searchParams.get("error");
        const code = u.searchParams.get("code");
        const st = u.searchParams.get("state");

        if (err) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(false, `Nexus returned: ${err}`));
          clearTimeout(timeout);
          finish({ ok: false, error: `Nexus login denied: ${err}` });
          return;
        }

        if (!code || !st) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(false, "Missing code/state from Nexus."));
          return;
        }
        if (st !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(false, "Invalid OAuth state."));
          clearTimeout(timeout);
          finish({ ok: false, error: "OAuth state mismatch — try login again" });
          return;
        }

        try {
          const token = await exchangeNexusCode({
            code,
            codeVerifier: verifier,
            redirectUri,
          });
          const user = await fetchNexusOAuthUser(token.access_token);
          saveNexusTokens(token, user);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(true));
          clearTimeout(timeout);
          finish({ ok: true, user });
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(false, e?.message || String(e)));
          clearTimeout(timeout);
          finish({ ok: false, error: e?.message || String(e) });
        }
      } catch (e: any) {
        try {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          res.end(nexusResultHtml(false, e?.message || String(e)));
        } catch {
          /* ignore */
        }
        clearTimeout(timeout);
        finish({ ok: false, error: e?.message || String(e) });
      }
    });

    server.listen(0, "127.0.0.1", async () => {
      const addr = server!.address();
      if (!addr || typeof addr === "string") {
        clearTimeout(timeout);
        finish({ ok: false, error: "Could not start Nexus login callback server" });
        return;
      }
      // Vortex-style: http://127.0.0.1:PORT (no path) — Nexus must whitelist this client id
      redirectUri = `http://127.0.0.1:${addr.port}`;
      const params = new URLSearchParams({
        response_type: "code",
        scope: "openid profile email",
        code_challenge_method: "S256",
        client_id: NEXUS_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
      });
      const authorizeUrl = `${NEXUS_OAUTH_BASE}/authorize?${params.toString()}`;
      try {
        await shell.openExternal(authorizeUrl);
      } catch (e: any) {
        clearTimeout(timeout);
        finish({
          ok: false,
          error: e?.message || "Could not open browser for Nexus login",
        });
      }
    });

    server.on("error", (e) => {
      clearTimeout(timeout);
      finish({ ok: false, error: e.message || "Nexus callback server error" });
    });
  });
});

ipcMain.handle("voa:unlinkNexusAccount", () => {
  clearNexusAuthFromDisk();
  return { ok: true };
});

ipcMain.handle("voa:openExternal", async (_e, url: string) => {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return false;
  await shell.openExternal(u);
  return true;
});

function cmpSemver(a: string, b: string): number {
  const pa = String(a || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

type LauncherUpdateInfo = {
  version: string;
  downloadUrl: string;
  /** Required — SHA-256 hex of artifact (Nexus §4) */
  sha256: string;
  /** Required — Ed25519 signature base64 (Nexus §4) */
  signature: string;
  size?: number;
  notes?: string;
  minVersion?: string;
  channel?: string;
  format?: "portable" | "zip";
};

function canonicalUpdateSignPayload(info: {
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

function verifyLauncherUpdateSignature(latest: LauncherUpdateInfo): void {
  const sha = String(latest.sha256 || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) {
    throw new Error(
      "[VOA compliance] Update manifest missing required sha256 (64-char hex)"
    );
  }
  const sig = String(latest.signature || "").trim();
  if (!sig || sig === "UNSIGNED-DEV-ONLY") {
    throw new Error(
      "[VOA compliance] Update manifest missing required Ed25519 signature"
    );
  }
  if (
    !VOA_UPDATE_PUBLIC_KEY_B64 ||
    VOA_UPDATE_PUBLIC_KEY_B64.startsWith("REPLACE_WITH_")
  ) {
    throw new Error(
      "[VOA compliance] Launcher build has no update public key embedded — refuse update"
    );
  }
  let u: URL;
  try {
    u = new URL(latest.downloadUrl);
  } catch {
    throw new Error("[VOA compliance] Update downloadUrl is invalid");
  }
  if (u.protocol !== "https:" && !isLocalApiHost(u.hostname)) {
    throw new Error("[VOA compliance] Update downloadUrl must be HTTPS");
  }
  const payload = canonicalUpdateSignPayload({
    version: latest.version,
    downloadUrl: latest.downloadUrl,
    sha256: sha,
    size: latest.size,
    format: latest.format,
  });
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(VOA_UPDATE_PUBLIC_KEY_B64, "base64"),
      format: "der",
      type: "spki",
    });
    const ok = crypto.verify(
      null,
      Buffer.from(payload, "utf8"),
      key,
      Buffer.from(sig, "base64")
    );
    if (!ok) {
      throw new Error("[VOA compliance] Update signature verification failed");
    }
  } catch (e: any) {
    if (String(e?.message || e).includes("VOA compliance")) throw e;
    throw new Error(
      `[VOA compliance] Update signature verification error: ${e?.message || e}`
    );
  }
}

/**
 * Zip-slip / path traversal guard (Nexus §6).
 * Returns normalized relative path using forward slashes for storage.
 */
function assertSafeArchiveRelPath(relRaw: string, installRoot: string): string {
  const rel = String(relRaw || "").replace(/\\/g, "/");
  if (!rel || rel === ".") {
    throw new Error("[VOA compliance] Empty archive path rejected");
  }
  if (rel.includes("\0")) {
    throw new Error("[VOA compliance] NUL in archive path rejected");
  }
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new Error(`[VOA compliance] Absolute archive path rejected: ${rel}`);
  }
  const parts = rel.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error(`[VOA compliance] Path traversal rejected: ${rel}`);
  }
  const destAbs = path.resolve(installRoot, ...parts);
  const rootAbs = path.resolve(installRoot);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  if (destAbs !== rootAbs && !destAbs.startsWith(rootPrefix)) {
    throw new Error(`[VOA compliance] Path escapes install root: ${rel}`);
  }
  return parts.join("/");
}

/** Validate every file under extractDir stays under installRoot when mapped. */
function validateExtractedTree(extractDir: string, installRoot: string): string[] {
  const staged = listFilesRecursive(extractDir);
  const safe: string[] = [];
  for (const rel of staged) {
    safe.push(assertSafeArchiveRelPath(rel, installRoot));
  }
  return safe;
}

function emitLauncherUpdateProgress(payload: {
  phase: string;
  received: number;
  total: number;
  percent: number;
  message?: string;
}): void {
  mainWindow?.webContents.send("launcher:update-progress", payload);
}

ipcMain.handle("voa:checkLauncherUpdate", async () => {
  const currentVersion = app.getVersion();
  try {
    // Prefer remote API (public). Local API is fine in dev.
    if (!(await ensureApiRunning()) && app.isPackaged) {
      return {
        currentVersion,
        updateAvailable: false,
        error: "Cannot reach update server",
      };
    }
    if (!(await ensureApiRunning())) {
      // Dev without API: no forced update
      return { currentVersion, updateAvailable: false, latest: null };
    }
    const res = await apiRequest<LauncherUpdateInfo>(
      "GET",
      "/v1/updates/launcher/latest"
    );
    if (!res.ok || !res.data?.version) {
      return {
        currentVersion,
        updateAvailable: false,
        error: res.raw || `update check ${res.status}`,
      };
    }
    const latest = res.data;
    // Nexus §4 — never surface an unsigned update as available
    try {
      verifyLauncherUpdateSignature(latest);
    } catch (e: any) {
      return {
        currentVersion,
        updateAvailable: false,
        error: e?.message || String(e),
        latest: null,
      };
    }
    const behindLatest = cmpSemver(currentVersion, latest.version) < 0;
    const belowMin =
      Boolean(latest.minVersion) &&
      cmpSemver(currentVersion, latest.minVersion!) < 0;
    const updateAvailable = behindLatest || belowMin;
    return {
      currentVersion,
      updateAvailable,
      forced: belowMin,
      latest,
    };
  } catch (e: any) {
    return {
      currentVersion,
      updateAvailable: false,
      error: e?.message || String(e),
    };
  }
});

type LauncherUpdateInfoExt = LauncherUpdateInfo & {
  format?: "portable" | "zip";
};

/** Download launcher update (zip full app or portable exe) and swap via helper bat, then quit. */
ipcMain.handle("voa:applyLauncherUpdate", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return { ok: false, error: "Cannot reach update server" };
    }
    const res = await apiRequest<LauncherUpdateInfoExt>(
      "GET",
      "/v1/updates/launcher/latest"
    );
    if (!res.ok || !res.data?.downloadUrl) {
      return { ok: false, error: res.raw || "No update available" };
    }
    const latest = res.data;
    // Nexus §4 — refuse unsigned / unhashed manifests (no optional path)
    try {
      verifyLauncherUpdateSignature(latest);
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
    const currentVersion = app.getVersion();
    if (cmpSemver(currentVersion, latest.version) >= 0) {
      return { ok: false, error: "Already up to date" };
    }

    const isZip =
      latest.format === "zip" ||
      /\.zip(\?|$)/i.test(latest.downloadUrl);

    const tmpDir = path.join(app.getPath("temp"), "voa-launcher-update");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(
      tmpDir,
      isZip ? "VisionsOfAetherius-update.zip" : "VisionsOfAetherius-update.exe"
    );
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    emitLauncherUpdateProgress({
      phase: "download",
      received: 0,
      total: latest.size || 0,
      percent: 0,
      message: `Downloading launcher v${latest.version}…`,
    });

    const { size, sha256 } = await downloadFile(
      latest.downloadUrl,
      tmpFile,
      "__launcher__",
      latest.size
    );

    if (sha256.toLowerCase() !== latest.sha256.toLowerCase()) {
      return {
        ok: false,
        error: `[VOA compliance] Update checksum mismatch (got ${sha256.slice(0, 12)}…)`,
      };
    }
    if (size < 500_000) {
      return { ok: false, error: "Downloaded update looks too small — aborted" };
    }

    emitLauncherUpdateProgress({
      phase: "install",
      received: size,
      total: size,
      percent: 100,
      message: "Installing update…",
    });

    const targetExe = process.execPath;
    const installDir = path.dirname(targetExe);
    const batPath = path.join(tmpDir, "apply-update.bat");
    const src = tmpFile.replace(/"/g, "");
    const destDir = installDir.replace(/"/g, "");
    const destExe = targetExe.replace(/"/g, "");

    // Zip = full UI/asar package; portable = single-file replace
    const bat = isZip
      ? [
          "@echo off",
          "setlocal",
          `set "SRC=${src}"`,
          `set "DEST=${destDir}"`,
          `set "EXE=${destExe}"`,
          `set "EXTRACT=%TEMP%\\voa-lu-extract-%RANDOM%"`,
          "echo Updating Visions of Aetherius Launcher (full package)...",
          "timeout /t 2 /nobreak >nul",
          'if exist "%EXTRACT%" rmdir /s /q "%EXTRACT%"',
          'mkdir "%EXTRACT%"',
          'powershell -NoProfile -Command "Expand-Archive -LiteralPath \'%SRC%\' -DestinationPath \'%EXTRACT%\' -Force"',
          "if errorlevel 1 (",
          "  echo Extract failed",
          "  exit /b 1",
          ")",
          ":retry",
          'xcopy /E /Y /I /Q "%EXTRACT%\\*" "%DEST%\\" >nul',
          "if errorlevel 1 (",
          "  timeout /t 1 /nobreak >nul",
          "  goto retry",
          ")",
          'start "" "%EXE%"',
          'rmdir /s /q "%EXTRACT%" >nul 2>&1',
          'del "%SRC%" >nul 2>&1',
          'del "%~f0" >nul 2>&1',
          "",
        ].join("\r\n")
      : [
          "@echo off",
          "setlocal",
          `set "SRC=${src}"`,
          `set "TARGET=${destExe}"`,
          "echo Updating Visions of Aetherius Launcher...",
          "timeout /t 2 /nobreak >nul",
          ":retry",
          'copy /y "%SRC%" "%TARGET%" >nul 2>&1',
          "if errorlevel 1 (",
          "  timeout /t 1 /nobreak >nul",
          "  goto retry",
          ")",
          'start "" "%TARGET%"',
          'del "%SRC%" >nul 2>&1',
          'del "%~f0" >nul 2>&1',
          "",
        ].join("\r\n");
    fs.writeFileSync(batPath, bat, "utf8");

    spawn("cmd.exe", ["/c", batPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();

    setTimeout(() => {
      app.quit();
    }, 400);

    return { ok: true, version: latest.version };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("voa:getStatus", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return {
        error: app.isPackaged
          ? "Cannot reach the official server status API. Check your connection."
          : `Cannot reach API at ${API_BASE} (failed to auto-start)`,
      };
    }
    const res = await apiRequest("GET", "/v1/status");
    if (!res.ok) return { error: res.raw || `status ${res.status}` };
    return { status: res.data };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

ipcMain.handle("voa:getNews", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return {
        error: app.isPackaged
          ? "Cannot reach the official server for news."
          : `Cannot reach API at ${API_BASE}`,
        items: [],
      };
    }
    const res = await apiRequest<{ items: unknown[] }>("GET", "/v1/news?limit=20");
    if (!res.ok) return { error: res.raw || `news ${res.status}`, items: [] };
    return { items: (res.data as any)?.items ?? [] };
  } catch (e: any) {
    return { error: e?.message || String(e), items: [] };
  }
});

ipcMain.handle("voa:getStore", () => {
  const s = readStore();
  const source = s.skyrimPath || detectSkyrimPath();
  const useInstance = s.useVoaInstance !== false;
  const instancePath =
    s.voaInstancePath ||
    (source ? defaultInstancePath(source, app.getPath("userData")) : null);
  return {
    user: s.user ?? null,
    skyrimPath: s.skyrimPath ?? null,
    voaInstancePath: instancePath,
    useVoaInstance: useInstance,
    hasTokens: Boolean(s.accessToken && s.refreshToken),
    accessToken: s.accessToken ?? null,
    refreshToken: s.refreshToken ?? null,
    characterSlot: typeof s.characterSlot === "number" ? s.characterSlot : 0,
    musicVolume:
      typeof s.musicVolume === "number"
        ? Math.max(0, Math.min(100, s.musicVolume))
        : 40,
    musicMuted: Boolean(s.musicMuted),
  };
});

ipcMain.handle("voa:setUseVoaInstance", (_e, enabled: boolean) => {
  writeStore({ useVoaInstance: Boolean(enabled) });
  return { ok: true, useVoaInstance: Boolean(enabled) };
});

ipcMain.handle("voa:rebuildInstance", async () => {
  try {
    const res = resolvePlayableSkyrim({ forceRebuild: true });
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      path: res.path,
      sourcePath: res.sourcePath,
      hardlinked: res.hardlinked,
      copied: res.copied,
      created: res.created,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("voa:getInstanceInfo", () => {
  const source = getSourceSkyrimPath();
  const s = readStore();
  const useInstance = s.useVoaInstance !== false;
  const instancePath =
    s.voaInstancePath ||
    (source ? defaultInstancePath(source, app.getPath("userData")) : null);
  let instanceReady = false;
  if (instancePath) {
    try {
      instanceReady =
        fs.existsSync(path.join(instancePath, "SkyrimSE.exe")) &&
        fs.existsSync(path.join(instancePath, ".voa-instance.json"));
    } catch {
      instanceReady = false;
    }
  }
  return {
    sourcePath: source,
    instancePath,
    useVoaInstance: useInstance,
    instanceReady,
  };
});

ipcMain.handle(
  "voa:setMusicPrefs",
  (
    _e,
    prefs: { volume?: number; muted?: boolean }
  ): { ok: boolean; musicVolume: number; musicMuted: boolean } => {
    const s = readStore();
    let volume =
      typeof s.musicVolume === "number"
        ? Math.max(0, Math.min(100, s.musicVolume))
        : 40;
    let muted = Boolean(s.musicMuted);
    if (typeof prefs?.volume === "number" && Number.isFinite(prefs.volume)) {
      volume = Math.max(0, Math.min(100, Math.round(prefs.volume)));
    }
    if (typeof prefs?.muted === "boolean") {
      muted = prefs.muted;
    }
    writeStore({ musicVolume: volume, musicMuted: muted });
    return { ok: true, musicVolume: volume, musicMuted: muted };
  }
);

ipcMain.handle("voa:setCharacterSlot", (_e, slot: number) => {
  const n = Number(slot);
  if (n !== 0 && n !== 1) return { ok: false, error: "slot must be 0 or 1" };
  writeStore({ characterSlot: n });
  return { ok: true };
});

ipcMain.handle("voa:getCharacters", async () => {
  try {
    const store = readStore();
    if (!store.accessToken) return { error: "Not logged in", characters: [] };
    const res = await apiRequest<{ characters: unknown[] }>("GET", "/v1/characters", {
      token: store.accessToken,
    });
    if (!res.ok) return { error: res.raw || `characters ${res.status}`, characters: [] };
    let characters = ((res.data as any)?.characters ?? []) as Array<{
      id: number;
      slot: number;
      name: string;
      empty: boolean;
      lastPlayedAt?: string | null;
      createdAt: string;
    }>;

    // Merge in-game names from status (race menu / look sync)
    try {
      const profileId = (store.user as any)?.profileId;
      const st = await apiRequest("GET", "/v1/status");
      const namesRoot = (st.data as any)?.characterNames;
      const bySlot =
        profileId != null && namesRoot
          ? namesRoot[String(profileId)] || namesRoot[profileId]
          : null;
      if (bySlot && typeof bySlot === "object") {
        characters = await Promise.all(
          characters.map(async (ch) => {
            const gameName = bySlot[String(ch.slot)] || bySlot[ch.slot];
            if (
              !ch.empty &&
              typeof gameName === "string" &&
              gameName.trim() &&
              gameName.trim() !== ch.name
            ) {
              const nm = gameName.trim().slice(0, 48);
              // Persist to API so UI stays correct offline of status
              try {
                await apiRequest("PATCH", `/v1/characters/slot/${ch.slot}`, {
                  token: store.accessToken!,
                  body: { name: nm },
                });
              } catch {
                /* ignore */
              }
              return { ...ch, name: nm, empty: false };
            }
            return ch;
          })
        );
      }
    } catch {
      /* status optional */
    }

    return { characters };
  } catch (e: any) {
    return { error: e?.message || String(e), characters: [] };
  }
});

ipcMain.handle(
  "voa:createCharacter",
  async (_e, payload: { slot: number; name?: string }) => {
    try {
      const store = readStore();
      if (!store.accessToken) return { ok: false, error: "Not logged in" };
      const res = await apiRequest("POST", "/v1/characters", {
        token: store.accessToken,
        body: { slot: payload.slot, name: payload.name },
      });
      if (!res.ok) {
        const err =
          (res.data as any)?.error || res.raw || `create failed ${res.status}`;
        return { ok: false, error: err };
      }
      writeStore({ characterSlot: payload.slot });
      return { ok: true, character: (res.data as any)?.character };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
);

ipcMain.handle("voa:deleteCharacter", async (_e, characterId: number) => {
  try {
    const store = readStore();
    if (!store.accessToken) return { ok: false, error: "Not logged in" };
    const res = await apiRequest("DELETE", `/v1/characters/${Number(characterId)}`, {
      token: store.accessToken,
    });
    if (!res.ok) {
      return { ok: false, error: (res.data as any)?.error || res.raw || "delete failed" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("voa:getBugReports", async (_e, opts?: { all?: boolean; status?: string }) => {
  try {
    const store = readStore();
    if (!store.accessToken) {
      return { error: "Not logged in", reports: [], admin: false };
    }
    const params = new URLSearchParams();
    if (opts?.all) params.set("all", "1");
    if (opts?.status) params.set("status", opts.status);
    const qs = params.toString() ? `?${params}` : "";
    const res = await apiRequest<{
      reports?: unknown[];
      admin?: boolean;
      staffRoles?: string[];
      categories?: string[];
    }>("GET", `/v1/bug-reports${qs}`, { token: store.accessToken });
    if (!res.ok) {
      return {
        error: (res.data as any)?.error || res.raw || "bug reports failed",
        reports: [],
        admin: false,
      };
    }
    return {
      reports: (res.data as any)?.reports ?? [],
      admin: Boolean((res.data as any)?.admin),
      staffRoles: (res.data as any)?.staffRoles ?? [],
      categories: (res.data as any)?.categories ?? [],
    };
  } catch (e: any) {
    return { error: e?.message || String(e), reports: [], admin: false };
  }
});

ipcMain.handle("voa:getStaffInfo", async () => {
  try {
    const store = readStore();
    if (!store.accessToken) {
      return { isStaff: false, roleLabels: [] as string[] };
    }
    const res = await apiRequest<{
      staff?: { isStaff?: boolean; roleLabels?: string[]; roleIds?: string[] };
    }>("GET", "/v1/me", { token: store.accessToken });
    if (!res.ok) return { isStaff: false, roleLabels: [] as string[] };
    const s = (res.data as any)?.staff;
    return {
      isStaff: Boolean(s?.isStaff),
      roleLabels: Array.isArray(s?.roleLabels) ? s.roleLabels : [],
      roleIds: Array.isArray(s?.roleIds) ? s.roleIds : [],
    };
  } catch {
    return { isStaff: false, roleLabels: [] as string[] };
  }
});

ipcMain.handle("voa:getAdminSummary", async () => {
  try {
    const store = readStore();
    if (!store.accessToken) return { ok: false, error: "Not logged in" };
    const res = await apiRequest("GET", "/v1/admin/summary", {
      token: store.accessToken,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: (res.data as any)?.error || res.raw || "admin summary failed",
      };
    }
    return { ok: true, ...(res.data as object) };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle(
  "voa:submitBugReport",
  async (
    _e,
    payload: {
      title: string;
      body: string;
      category?: string;
      characterSlot?: number | null;
      characterName?: string | null;
      gameVersion?: string;
    }
  ) => {
    try {
      const store = readStore();
      if (!store.accessToken) return { ok: false, error: "Not logged in" };
      const res = await apiRequest("POST", "/v1/bug-reports", {
        token: store.accessToken,
        body: {
          title: payload.title,
          body: payload.body,
          category: payload.category || "other",
          launcherVersion: app.getVersion(),
          gameVersion: payload.gameVersion || undefined,
          characterSlot: payload.characterSlot,
          characterName: payload.characterName,
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: (res.data as any)?.error || res.raw || "submit failed",
        };
      }
      return { ok: true, report: (res.data as any)?.report };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
);

/** Opt-in support log disclaimer (shown in Settings UI). */
const SUPPORT_LOG_DISCLAIMER = `SUPPORT LOG UPLOAD — PLEASE READ

By uploading, you choose to send diagnostic information to Visions of Aetherius staff so they can help fix crashes, multiplayer, or launcher issues.

What may be included (after automatic redaction):
• Skyrim Platform / SKSE log tails from known My Games / SKSE folders
• Launcher play log and related files under the VOA launcher data folder
• Config and listings from VOA game folder(s) and base Skyrim (ini, plugin sizes)
• Client/plugin file sizes and versions we already manage

We try to remove Windows usernames, full home paths, tokens, and secrets before upload. Redaction is best-effort — do not paste passwords or personal secrets into the “reason” field.

How we use this:
• Only to diagnose and fix technical problems you reported or that affect stability
• Access is limited to authorized staff
• Files are stored privately (not a public CDN listing) and deleted after about 30 days

This is optional. You can play without uploading logs. Uploading is not required to use VOA.

By checking “I understand and consent” and clicking Upload, you confirm you have read this notice and voluntarily consent to this processing for support purposes.`;

function redactSupportLogText(input: string): string {
  let s = String(input || "");
  s = s.replace(/([A-Za-z]:\\Users\\)[^\\\/\s"']+/gi, "$1REDACTED");
  s = s.replace(/(\/Users\/)[^\/\s"']+/g, "$1REDACTED");
  s = s.replace(/(\\Users\\)[^\\\/\s"']+/gi, "$1REDACTED");
  s = s.replace(/(Bearer\s+)[A-Za-z0-9\-._~+\/]+=*/gi, "$1[REDACTED]");
  s = s.replace(
    /("?(?:accessToken|refreshToken|session|token|secret|password|authorization)"?\s*[:=]\s*")[^"]*(")/gi,
    "$1[REDACTED]$2"
  );
  s = s.replace(/(session=)[^&\s"']+/gi, "$1[REDACTED]");
  s = s.replace(/\b[A-Za-z0-9_-]{80,}\b/g, "[REDACTED_TOKEN]");
  return s;
}

/**
 * Support-log roots: known VOA / SkyMP / SKSE locations only (no drive walk).
 * Read-only; redacted later. Opt-in upload only.
 */
function collectSupportCandidateGameRoots(store: Store): string[] {
  const out: string[] = [];
  const add = (p: string | null | undefined) => {
    if (!p) return;
    try {
      const r = path.resolve(p);
      if (!fs.existsSync(r)) return;
      if (!out.some((x) => x.toLowerCase() === r.toLowerCase())) out.push(r);
    } catch {
      /* ignore */
    }
  };
  add(store.voaInstancePath);
  add(store.skyrimPath);
  // Launcher default instance under userData
  add(path.join(app.getPath("userData"), "Game", "Skyrim Special Edition - VOA"));
  // Common Steam sibling VOA folders (no full-disk scan)
  const steamCommon = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common",
    "C:\\Program Files\\Steam\\steamapps\\common",
    process.env.STEAM_LIBRARY &&
      path.join(process.env.STEAM_LIBRARY, "steamapps", "common"),
  ].filter(Boolean) as string[];
  if (store.skyrimPath) {
    try {
      steamCommon.push(path.dirname(path.resolve(store.skyrimPath)));
    } catch {
      /* ignore */
    }
  }
  for (const common of steamCommon) {
    add(path.join(common, "Skyrim Special Edition"));
    add(path.join(common, "Skyrim Special Edition - Visions of Aetherius"));
    add(path.join(common, "Skyrim Special Edition - VOA"));
  }
  return out;
}

/** My Games / SKSE log directories where Skyrim Platform writes logs. */
function collectSupportSkseLogDirs(): string[] {
  const out: string[] = [];
  const add = (p: string | null | undefined) => {
    if (!p) return;
    try {
      const r = path.resolve(p);
      if (!out.some((x) => x.toLowerCase() === r.toLowerCase())) out.push(r);
    } catch {
      /* ignore */
    }
  };
  const myGames = (docs: string) =>
    path.join(docs, "My Games", "Skyrim Special Edition", "SKSE");

  // System Documents (may be redirected; still where SP often writes)
  try {
    add(myGames(app.getPath("documents")));
  } catch {
    /* ignore */
  }
  if (process.env.USERPROFILE) {
    add(myGames(path.join(process.env.USERPROFILE, "Documents")));
    // Common school/work OneDrive Documents layout (read-only for support)
    try {
      const home = process.env.USERPROFILE;
      const od = path.join(home, "OneDrive");
      if (fs.existsSync(od)) {
        add(myGames(path.join(od, "Documents")));
        // "OneDrive - OrgName/Documents"
        try {
          for (const ent of fs.readdirSync(od, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            if (!/^onedrive/i.test(ent.name) && !ent.name.includes(" - ")) {
              // still check Documents under any OneDrive-* folder
            }
            add(myGames(path.join(od, ent.name, "Documents")));
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  for (const key of ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]) {
    const od = process.env[key];
    if (od) add(myGames(path.join(od, "Documents")));
  }
  // Local fallbacks used by VOA when Documents is cloud-backed
  for (const d of getLocalSkyrimMyGamesDirs()) {
    add(path.join(d, "SKSE"));
  }
  add(path.join(app.getPath("userData"), "My Games", "Skyrim Special Edition", "SKSE"));
  if (process.env.LOCALAPPDATA) {
    add(
      path.join(
        process.env.LOCALAPPDATA,
        "VOA",
        "My Games",
        "Skyrim Special Edition",
        "SKSE"
      )
    );
  }
  return out;
}

function collectSupportLogBundle(): { text: string; files: string[] } {
  const parts: string[] = [];
  const files: string[] = [];
  const seenPaths = new Set<string>();
  const maxPerFile = 180_000;
  const pushFile = (label: string, p: string) => {
    try {
      if (!p || !fs.existsSync(p)) return;
      const resolved = path.resolve(p);
      const key = resolved.toLowerCase();
      if (seenPaths.has(key)) return;
      const st = fs.statSync(resolved);
      if (!st.isFile() || st.size <= 0) return;
      // Skip huge binaries (dmp/pak) — logs only
      if (st.size > 8_000_000 && !/\.log$/i.test(resolved)) return;
      seenPaths.add(key);
      let raw = fs.readFileSync(resolved, "utf8");
      if (raw.length > maxPerFile) raw = raw.slice(raw.length - maxPerFile);
      parts.push(
        `\n\n======== ${label} (${resolved}) size=${st.size} ========\n`
      );
      parts.push(raw);
      files.push(label);
    } catch {
      /* ignore missing / unreadable */
    }
  };

  const pushRecentLogsInDir = (
    dir: string,
    labelPrefix: string,
    maxFiles = 8
  ) => {
    try {
      if (!dir || !fs.existsSync(dir)) return;
      const logs = fs
        .readdirSync(dir)
        .filter((n) => /\.log$/i.test(n))
        .map((n) => {
          try {
            return {
              n,
              t: fs.statSync(path.join(dir, n)).mtimeMs,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as { n: string; t: number }[];
      logs.sort((a, b) => b.t - a.t);
      for (const L of logs.slice(0, maxFiles)) {
        pushFile(`${labelPrefix}/${L.n}`, path.join(dir, L.n));
      }
    } catch {
      /* ignore */
    }
  };

  // --- SKSE / Skyrim Platform logs (all known My Games SKSE dirs) ---
  const skseDirs = collectSupportSkseLogDirs();
  parts.push(
    `\n\n======== SKSE log dirs scanned (${skseDirs.length}) ========\n` +
      skseDirs.map((d) => (fs.existsSync(d) ? `OK ${d}` : `miss ${d}`)).join("\n") +
      "\n"
  );
  for (const docsSkse of skseDirs) {
    pushFile("skyrim-platform.log", path.join(docsSkse, "skyrim-platform.log"));
    pushFile("skse64.log", path.join(docsSkse, "skse64.log"));
    pushFile("skse64_loader.log", path.join(docsSkse, "skse64_loader.log"));
    pushRecentLogsInDir(docsSkse, "SKSE", 8);
  }

  // --- Launcher logs ---
  const ud = app.getPath("userData");
  pushFile("voa-play.log", path.join(ud, "voa-play.log"));
  pushRecentLogsInDir(ud, "launcher-userData", 6);
  // electron / crashpad style logs if present (names only, small)
  for (const name of [
    "main.log",
    "renderer.log",
    "crash.log",
    "voa-mod-installs.json",
  ]) {
    pushFile(name, path.join(ud, name));
  }

  // --- VOA game folders / Steam Skyrim roots ---
  const store = readStore();
  const roots = collectSupportCandidateGameRoots(store);
  parts.push(
    `\n\n======== Game roots scanned (${roots.length}) ========\n` +
      roots.join("\n") +
      "\n"
  );
  for (const root of roots) {
    const short = path.basename(root);
    pushFile(
      `${short}/SkyrimPlatform.ini`,
      path.join(root, "Data", "SKSE", "Plugins", "SkyrimPlatform.ini")
    );
    pushFile(
      `${short}/skse64_loader.log`,
      path.join(root, "skse64_loader.log")
    );
    pushFile(`${short}/skse64.log`, path.join(root, "skse64.log"));
    pushFile(
      `${short}/.voa-instance.json`,
      path.join(root, ".voa-instance.json")
    );
    // Logs next to game exe (rare)
    pushRecentLogsInDir(root, short, 4);
    pushRecentLogsInDir(path.join(root, "Data", "SKSE"), `${short}/Data/SKSE`, 6);
    try {
      const plugins = path.join(root, "Data", "Platform", "Plugins");
      if (fs.existsSync(plugins)) {
        const list = fs
          .readdirSync(plugins)
          .map((n) => {
            try {
              const st = fs.statSync(path.join(plugins, n));
              return `${n}\t${st.size}\t${st.mtime.toISOString()}`;
            } catch {
              return n;
            }
          })
          .join("\n");
        parts.push(
          `\n\n======== Platform/Plugins listing (${root}) ========\n${list}\n`
        );
        files.push("Platform/Plugins listing");
        // settings file is small and useful
        pushFile(
          `${short}/skymp5-client-settings.txt`,
          path.join(plugins, "skymp5-client-settings.txt")
        );
      }
    } catch {
      /* ignore */
    }
    try {
      const client = path.join(
        root,
        "Data",
        "Platform",
        "Plugins",
        "skymp5-client.js"
      );
      if (fs.existsSync(client)) {
        const st = fs.statSync(client);
        parts.push(
          `\n\n======== skymp5-client.js meta ========\npath=${client}\nsize=${st.size}\nmtime=${st.mtime.toISOString()}\n`
        );
        files.push("skymp5-client.js meta");
      }
    } catch {
      /* ignore */
    }
    // SKSE Plugins dir listing (dll sizes — diagnose SP stack without dumping binaries)
    try {
      const sksePlug = path.join(root, "Data", "SKSE", "Plugins");
      if (fs.existsSync(sksePlug)) {
        const list = fs
          .readdirSync(sksePlug)
          .filter((n) => !n.startsWith("_"))
          .map((n) => {
            try {
              const st = fs.statSync(path.join(sksePlug, n));
              if (!st.isFile()) return `${n}/`;
              return `${n}\t${st.size}`;
            } catch {
              return n;
            }
          })
          .join("\n");
        parts.push(
          `\n\n======== Data/SKSE/Plugins listing (${root}) ========\n${list}\n`
        );
        files.push("SKSE/Plugins listing");
      }
    } catch {
      /* ignore */
    }
  }

  parts.unshift(
    `VOA support log bundle\ncollectedAt=${new Date().toISOString()}\nlauncher=${app.getVersion()}\napi=${API_BASE}\nplatform=${process.platform}\narch=${process.arch}\nfilesIncluded=${files.length}\n`
  );

  let text = redactSupportLogText(parts.join(""));
  const maxTotal = 500_000;
  if (text.length > maxTotal) text = text.slice(text.length - maxTotal);
  return { text, files: [...new Set(files)] };
}

ipcMain.handle("voa:getSupportLogDisclaimer", () => ({
  disclaimer: SUPPORT_LOG_DISCLAIMER,
  retentionDays: 30,
  maxBytes: 512 * 1024,
}));

ipcMain.handle(
  "voa:uploadSupportLogs",
  async (
    _e,
    payload: { consent?: boolean; reason?: string }
  ) => {
    try {
      if (payload?.consent !== true) {
        return {
          ok: false,
          error: "Consent required. Check the disclaimer box first.",
        };
      }
      const store = readStore();
      if (!store.accessToken) {
        return { ok: false, error: "Log in with Discord first." };
      }
      const bundle = collectSupportLogBundle();
      if (!bundle.text || bundle.text.length < 40) {
        return {
          ok: false,
          error: "No log files found. Play once or open the game so logs exist.",
        };
      }
      const res = await apiRequest("POST", "/v1/support/logs", {
        token: store.accessToken,
        body: {
          consent: true,
          consentText: "user_checked_disclaimer_and_consented",
          reason: String(payload.reason || "").slice(0, 200),
          launcherVersion: app.getVersion(),
          text: bundle.text,
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: (res.data as any)?.error || res.raw || "upload failed",
        };
      }
      const data = res.data as any;
      return {
        ok: true,
        id: data?.id,
        sizeBytes: data?.sizeBytes,
        expiresAt: data?.expiresAt,
        files: bundle.files,
        message: data?.message,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
);

ipcMain.handle(
  "voa:updateBugReport",
  async (
    _e,
    payload: { id: number; status: string; staffNote?: string | null }
  ) => {
    try {
      const store = readStore();
      if (!store.accessToken) return { ok: false, error: "Not logged in" };
      const res = await apiRequest("PATCH", `/v1/bug-reports/${Number(payload.id)}`, {
        token: store.accessToken,
        body: {
          status: payload.status,
          staffNote: payload.staffNote,
        },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: (res.data as any)?.error || res.raw || "update failed",
        };
      }
      return { ok: true, report: (res.data as any)?.report };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
);

ipcMain.handle("voa:deleteBugReport", async (_e, id: number) => {
  try {
    const store = readStore();
    if (!store.accessToken) return { ok: false, error: "Not logged in" };
    const res = await apiRequest("DELETE", `/v1/bug-reports/${Number(id)}`, {
      token: store.accessToken,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: (res.data as any)?.error || res.raw || "delete failed",
      };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle(
  "voa:getAdminCharacters",
  async (_e, opts?: { q?: string; includeEmpty?: boolean }) => {
    try {
      const store = readStore();
      if (!store.accessToken) {
        return { ok: false, error: "Not logged in", characters: [] };
      }
      const params = new URLSearchParams();
      if (opts?.q) params.set("q", opts.q);
      if (opts?.includeEmpty) params.set("includeEmpty", "1");
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiRequest("GET", `/v1/admin/characters${qs}`, {
        token: store.accessToken,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: (res.data as any)?.error || res.raw || "list failed",
          characters: [],
        };
      }
      return {
        ok: true,
        characters: (res.data as any)?.characters ?? [],
        actions: (res.data as any)?.actions ?? [],
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e), characters: [] };
    }
  }
);

ipcMain.handle(
  "voa:adminCharacterAction",
  async (
    _e,
    payload: { characterId: number; action: string; note?: string }
  ) => {
    try {
      const store = readStore();
      if (!store.accessToken) return { ok: false, error: "Not logged in" };
      const res = await apiRequest(
        "POST",
        `/v1/admin/characters/${Number(payload.characterId)}/action`,
        {
          token: store.accessToken,
          body: { action: payload.action, note: payload.note },
        }
      );
      if (!res.ok) {
        return {
          ok: false,
          error: (res.data as any)?.error || res.raw || "action failed",
        };
      }
      return { ok: true, ...(res.data as object) };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
);

ipcMain.handle("voa:setAuth", (_e, payload: { accessToken: string; refreshToken: string; user: unknown }) => {
  writeStore({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  });
  return true;
});

ipcMain.handle("voa:logout", () => {
  writeStore({ accessToken: "", refreshToken: "", user: null });
  const p = storePath();
  if (fs.existsSync(p)) {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    delete raw.accessToken;
    delete raw.refreshToken;
    delete raw.encAccess;
    delete raw.encRefresh;
    raw.user = null;
    fs.writeFileSync(p, JSON.stringify(raw, null, 2));
  }
  return true;
});

ipcMain.handle("voa:getDiscordSetup", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return {
        error: "Cannot reach API",
        requiredRedirects: [
          "http://127.0.0.1:47821/auth/discord/callback",
          "http://localhost:47821/auth/discord/callback",
        ],
      };
    }
    const res = await apiRequest<{
      clientId?: string;
      requiredRedirects?: string[];
      portalUrl?: string;
      hint?: string;
    }>("GET", "/v1/auth/discord-setup");
    if (!res.ok) return { error: res.raw || "setup failed" };
    return res.data;
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
});

ipcMain.handle("voa:openDiscordSetupPage", async () => {
  await shell.openExternal(`${API_BASE}/auth/discord/setup`);
  return true;
});

ipcMain.handle("voa:openDiscordLogin", async () => {
  await ensureApiRunning();
  startAuthLoopback();

  let authorizeUrl = "";
  let state = "";
  try {
    // Desktop custom protocol (voa://callback) — must match Discord OAuth2 Redirects.
    const pathAndQuery = `/auth/discord?format=json&redirect_uri=${encodeURIComponent(
      AUTH_REDIRECT
    )}`;
    const res = await apiRequest<{ authorizeUrl: string; state: string }>(
      "GET",
      pathAndQuery
    );
    if (!res.ok || !res.data?.authorizeUrl) {
      return {
        ok: false,
        error:
          res.raw ||
          "Could not start Discord login. Open API setup page and register redirect voa://callback",
      };
    }
    authorizeUrl = res.data.authorizeUrl;
    state = res.data.state;
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  // Copy the exact redirect Discord must list
  try {
    clipboard.writeText(AUTH_REDIRECT);
  } catch {
    /* ignore */
  }
  // Setup instructions first (contains portal link + exact redirects)
  shell.openExternal(`${API_BASE}/auth/discord/setup`).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  await shell.openExternal(authorizeUrl);

  // Wait until loopback callback (or poll handoff) delivers tokens — 5 min for 2FA
  const deadline = Date.now() + 300_000;
  const before = readStore().accessToken || "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));

    // Loopback path applied tokens directly
    const now = readStore().accessToken || "";
    if (now && now !== before) {
      const s = readStore();
      return { ok: true, user: s.user };
    }

    // Backup: poll API handoff (remote callback path)
    try {
      const poll = await apiRequest<{
        accessToken?: string;
        refreshToken?: string;
        user?: unknown;
      }>("GET", `/v1/auth/poll/${encodeURIComponent(state)}`);
      if (poll.status === 204) continue;
      if (poll.ok && poll.data?.accessToken && poll.data?.refreshToken) {
        applyAuthPayload({
          accessToken: poll.data.accessToken,
          refreshToken: poll.data.refreshToken,
          user: poll.data.user,
        });
        return { ok: true, user: poll.data.user };
      }
      if (poll.status === 410) {
        return { ok: false, error: "Login expired — try again" };
      }
    } catch {
      // keep waiting
    }
  }
  return {
    ok: false,
    error:
      "Timed out waiting for Discord login (5 min). Finish 2FA, then allow the browser to open the launcher (voa://). Also ensure Discord OAuth2 Redirects includes: voa://callback",
  };
});

ipcMain.handle("voa:pickSkyrimPath", async () => {
  const res = await dialog.showOpenDialog({
    title: "Select your Skyrim Special Edition folder (local disk only — not OneDrive)",
    properties: ["openDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  const od = rejectOneDrivePath(dir, "Skyrim folder");
  if (od) return { error: od };
  if (!fs.existsSync(path.join(dir, "SkyrimSE.exe")) && !fs.existsSync(path.join(dir, "skse64_loader.exe"))) {
    return { error: "Folder does not look like Skyrim SE" };
  }
  let instancePath = defaultInstancePath(dir, app.getPath("userData"));
  if (isOneDrivePath(instancePath) || pathLooksLikeProgramFiles(instancePath)) {
    instancePath = path.join(
      app.getPath("userData"),
      "Game",
      "Skyrim Special Edition - VOA"
    );
  }
  // Source only — instance path is derived next Play (or Rebuild)
  writeStore({
    skyrimPath: dir,
    voaInstancePath: instancePath,
  });
  return { path: dir };
});

ipcMain.handle("voa:setSkyrimPath", (_e, p: string) => {
  const od = rejectOneDrivePath(p, "Skyrim folder");
  if (od) return { ok: false, error: od };
  writeStore({ skyrimPath: p });
  return true;
});

/**
 * Download + extract a local VOA CDN mod package into skyrim root.
 * Used by Play auto-install (does not require Nexus).
 */
async function installLocalModPackage(
  packageId: string,
  skyrim: string
): Promise<{ ok: boolean; error?: string }> {
  const tmpRoot = path.join(app.getPath("temp"), "voa-mods-auto", packageId);
  const zipPath = path.join(tmpRoot, "package.zip");
  const extractDir = path.join(tmpRoot, "extract");
  try {
    if (!(await ensureApiRunning())) {
      return { ok: false, error: `Cannot reach API at ${API_BASE}` };
    }
    const catRes = await apiRequest<{ packages: CatalogPackage[] }>("GET", "/v1/mods");
    if (!catRes.ok) return { ok: false, error: catRes.raw || "mod catalog failed" };
    const pkg = (catRes.data?.packages || []).find((p) => p.id === packageId);
    if (!pkg) return { ok: false, error: `package ${packageId} not in catalog` };
    if (pkg.source === "nexus" || !pkg.downloadUrl) {
      return { ok: false, error: `${packageId} is not a local CDN package` };
    }
    if (pkg.available === false) {
      return { ok: false, error: `${packageId} archive not available on server` };
    }

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
    playLog(`auto-mod download ${packageId} ${pkg.downloadUrl}`);
    const dl = await downloadFile(pkg.downloadUrl, zipPath, packageId, pkg.size);
    if (pkg.sha256 && dl.sha256.toLowerCase() !== pkg.sha256.toLowerCase()) {
      return {
        ok: false,
        error: `checksum mismatch for ${packageId}`,
      };
    }
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    // Copy all files under extract into skyrim (preserve structure)
    const walk = (dir: string, base: string): string[] => {
      const out: string[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(abs, base));
        else out.push(path.relative(base, abs));
      }
      return out;
    };
    const files = walk(extractDir, extractDir);
    const installedRels: string[] = [];
    for (const rel of files) {
      const from = path.join(extractDir, rel);
      // Normalize zip paths that used backslashes
      const relNorm = rel.replace(/\\/g, "/");
      const to = path.join(skyrim, ...relNorm.split("/"));
      try {
        copyBreakHardlink(from, to);
      } catch {
        // Fallback plain copy
        fs.mkdirSync(path.dirname(to), { recursive: true });
        try {
          fs.unlinkSync(to);
        } catch {
          /* ignore */
        }
        fs.copyFileSync(from, to);
      }
      installedRels.push(relNorm);
    }
    const installs = readInstalls();
    installs.packages[packageId] = {
      id: packageId,
      name: pkg.name || packageId,
      version: pkg.version || "0",
      installedAt: new Date().toISOString(),
      files: installedRels,
      size: dl.size,
      sha256: dl.sha256,
    } as InstalledModRecord;
    writeInstalls(installs);
    playLog(`auto-mod installed ${packageId} files=${installedRels.length}`);
    return { ok: true };
  } catch (e: any) {
    playLog(`auto-mod fail ${packageId}: ${e?.message || e}`);
    return { ok: false, error: e?.message || String(e) };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ensure SKSE + Address Library + VOA MP core exist before launch.
 * Auto-installs missing LOCAL packages so friends don't need manual Mods tab.
 */
async function ensureRequiredLocalRuntime(
  skyrim: string
): Promise<{ ok: boolean; error?: string; installed: string[] }> {
  const installed: string[] = [];
  // Friends often have wrong AE build — SP console never appears (REL crash).
  const exeVer = getSkyrimExeVersion(skyrim);
  if (exeVer) {
    playLog(`SkyrimSE.exe FileVersion=${exeVer}`);
    if (!exeVer.startsWith("1.6.1170")) {
      return {
        ok: false,
        error:
          `Skyrim SE version is ${exeVer}, but VOA multiplayer requires Anniversary Edition 1.6.1170. ` +
          "Update Skyrim SE via Steam (no downgrade/beta), then Rebuild VOA folder in Settings and Play.",
        installed,
      };
    }
  } else {
    playLog("SkyrimSE.exe version could not be read (continuing)");
  }
  // Loader alone is not enough — lean VOA clone skips Data/Scripts, so Actor.pex etc.
  // go missing while skse64_loader.exe remains. SP then logs "Missing files: Actor.pex…".
  const needSkse =
    !fs.existsSync(path.join(skyrim, "skse64_loader.exe")) ||
    !hasSksePapyrusScripts(skyrim);
  // Missing files OR mixed pack sizes (SP dll + Impl from different builds) → REL crash
  const needSp = needsVoaMpCoreReinstall(skyrim);
  const needAl = !fs.existsSync(
    path.join(skyrim, "Data", "SKSE", "Plugins", "versionlib-1-6-1170-0.bin")
  );
  if (needSp) {
    playLog("voa-mp-core reinstall required (missing or mismatched SP stack)");
  }
  if (needSkse && fs.existsSync(path.join(skyrim, "skse64_loader.exe"))) {
    playLog("SKSE scripts missing (Actor.pex/etc) — reinstalling skse-ae package");
  }

  if (needSkse) {
    const r = await installLocalModPackage("skse-ae-2.2.6", skyrim);
    if (!r.ok) {
      return {
        ok: false,
        error: r.error || "Failed to auto-install SKSE",
        installed,
      };
    }
    installed.push("skse-ae-2.2.6");
    if (!hasSksePapyrusScripts(skyrim)) {
      return {
        ok: false,
        error:
          "SKSE Papyrus scripts still missing after install (Data/Scripts/Actor.pex). " +
          "Install SKSE64 AE 2.2.6 from the Mods tab, then Play again.",
        installed,
      };
    }
  }
  if (needSp) {
    // Hardlinks / partial installs leave mixed SP builds → REL crash, no console.
    wipeVoaMpCoreFiles(skyrim);
    const r = await installLocalModPackage("voa-mp-core", skyrim);
    if (!r.ok) {
      return {
        ok: false,
        error:
          (r.error || "Failed to auto-install VOA Multiplayer Core (Skyrim Platform)") +
          " If your game folder is under Program Files, run the launcher as Administrator once, then Play.",
        installed,
      };
    }
    installed.push("voa-mp-core");
    if (!isPreferredSpStack(skyrim) || !hasCompleteRuntimeDeps(skyrim)) {
      const p = spStackPaths(skyrim);
      playLog(
        `voa-mp-core still bad after install sp=${fileSizeOr0(p.spDll)} mp=${fileSizeOr0(p.mpDll)} impl=${fileSizeOr0(p.impl)} rd=${hasCompleteRuntimeDeps(skyrim)}`
      );
      return {
        ok: false,
        error:
          "Skyrim Platform install incomplete (mixed or locked files). In Settings → Rebuild VOA game folder, " +
          "then Play again. Or run launcher as Admin if the folder is under Program Files. " +
          `Need Impl size ${VOA_SP_STACK.skyrimPlatformImpl}, got ${fileSizeOr0(p.impl)}.`,
        installed,
      };
    }
    playLog("voa-mp-core stack OK after wipe+reinstall");
  }
  if (needAl) {
    // Prefer local VOA address-library package (no Nexus login)
    let r = await installLocalModPackage("voa-address-library", skyrim);
    if (!r.ok) {
      // Fallback catalog id if server not redeployed yet
      r = await installLocalModPackage("address-library-ae", skyrim);
    }
    if (!r.ok) {
      return {
        ok: false,
        error:
          r.error ||
          "Failed to auto-install Address Library. Install it from Mods (VOA Address Library).",
        installed,
      };
    }
    installed.push("voa-address-library");
  }
  return { ok: true, installed };
}

ipcMain.handle("voa:play", async (_e, opts?: { characterSlot?: number }) => {
  try {
    if (!(await ensureApiRunning())) {
      return {
        ok: false,
        error: app.isPackaged
          ? `Cannot reach the Visions of Aetherius servers (${API_BASE}). Check your internet connection or try again later.`
          : `Cannot reach API at ${API_BASE}. Start the local API (npm run dev:api) or set VOA_API_URL.`,
      };
    }

    const store = readStore();
    if (!store.accessToken || !store.refreshToken) {
      return { ok: false, error: "Not logged in — use Login with Discord first" };
    }

    // Dedicated VOA game folder (default) — never writes into the main Skyrim install
    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return { ok: false, error: playRoot.error || "VOA game folder not ready" };
    }
    const skyrim = playRoot.path;
    playLog(
      `play root=${skyrim} instance=${Boolean(playRoot.usingInstance)} source=${playRoot.sourcePath || "?"}`
    );

    // Always pull authoritative client + password from VPS API (matches ClientVerify)
    const clientInstall = await installVoaGameFiles(skyrim);
    if (!clientInstall.ok) {
      return {
        ok: false,
        error: clientInstall.error || "Failed to install multiplayer client files",
      };
    }

    const characterSlot =
      typeof opts?.characterSlot === "number"
        ? opts.characterSlot
        : typeof store.characterSlot === "number"
          ? store.characterSlot
          : 0;
    if (characterSlot !== 0 && characterSlot !== 1) {
      return { ok: false, error: "Select a character slot (0 or 1)" };
    }
    writeStore({ characterSlot });

    let token = store.accessToken;

    // Create game session entirely in main process (Node http)
    let sessRes = await apiRequest<{
      session: string;
      profileId: number;
      serverIp: string;
      serverPort: number;
      master: string;
      characterSlot?: number;
    }>("POST", "/v1/sessions", { token, body: { characterSlot } });

    if (sessRes.status === 401 && store.refreshToken) {
      const refresh = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: unknown;
      }>("POST", "/v1/auth/refresh", {
        body: { refreshToken: store.refreshToken },
      });
      if (!refresh.ok) {
        return { ok: false, error: "Session expired — log in with Discord again" };
      }
      writeStore({
        accessToken: refresh.data.accessToken,
        refreshToken: refresh.data.refreshToken,
        user: refresh.data.user as Store["user"],
      });
      token = refresh.data.accessToken;
      mainWindow?.webContents.send("auth:updated", {
        accessToken: refresh.data.accessToken,
        refreshToken: refresh.data.refreshToken,
        user: refresh.data.user,
      });
      sessRes = await apiRequest("POST", "/v1/sessions", {
        token,
        body: { characterSlot },
      });
    }

    // Auto-create character if slot is empty (old UI / first Play)
    const sessErr = String((sessRes.data as any)?.error || "");
    if (
      !sessRes.ok &&
      sessRes.status === 400 &&
      /character|slot/i.test(sessErr)
    ) {
      // Placeholder until race menu / look.name reports the real in-game name
      const create = await apiRequest("POST", "/v1/characters", {
        token,
        body: {
          slot: characterSlot,
          name: `New Character ${characterSlot + 1}`,
        },
      });
      if (!create.ok) {
        return {
          ok: false,
          error:
            (create.data as any)?.error ||
            create.raw ||
            "Create character failed — open Characters tab",
        };
      }
      sessRes = await apiRequest("POST", "/v1/sessions", {
        token,
        body: { characterSlot },
      });
    }

    if (!sessRes.ok) {
      const d = sessRes.data as any;
      if (sessRes.status === 403 && (d?.error === "community_required" || /community/i.test(String(d?.message || d?.error || "")))) {
        const invite = d?.inviteUrl ? ` Join: ${d.inviteUrl}` : "";
        return {
          ok: false,
          error:
            (d?.message ||
              "You must be in the Visions of Aetherius Discord community to play.") + invite,
        };
      }
      return {
        ok: false,
        error: `Session failed (${sessRes.status}): ${
          d?.message || d?.error || sessRes.raw || "unknown"
        }`,
      };
    }

    const session = sessRes.data as {
      session: string;
      profileId: number;
      serverIp: string;
      serverPort: number;
      master: string;
      characterSlot?: number;
    };

    const settingsDir = path.join(skyrim, "Data", "Platform", "Plugins");
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, "skymp5-client-settings.txt");

    let existing: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      } catch {
        existing = {};
      }
    }

    // Always rewrite clean settings pointing at the official VOA server.
    // offlineMode server uses profileId; session is included for master compatibility.
    const serverIp = session.serverIp || PUBLIC_GAME.ip;
    const serverPort = Number(session.serverPort) || PUBLIC_GAME.port;
    const profileId = Number(session.profileId);
    if (!Number.isFinite(profileId)) {
      return {
        ok: false,
        error:
          "Session did not return a valid profileId. Log out, Discord Login again, then Play.",
      };
    }
    const next = {
      "server-ip": serverIp,
      "server-port": serverPort,
      master: String(session.master || API_BASE).replace(/\/$/, ""),
      gameData: {
        profileId,
        session: String(session.session || ""),
        characterSlot: Number(session.characterSlot ?? characterSlot) || 0,
      },
    };

    // No BOM — Skyrim Platform JSON settings parse is picky; exclusive write breaks hardlinks
    writeFileExclusive(settingsPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    playLog(
      `settings written ${settingsPath} ip=${serverIp} port=${serverPort} profileId=${profileId} client=${clientInstall.source}/${clientInstall.clientBytes}`
    );

    // Re-assert password after settings write
    try {
      const distDir = path.join(skyrim, "Data", "Platform", "Distribution");
      fs.mkdirSync(distDir, { recursive: true });
      writeFileExclusive(path.join(distDir, "password"), "2", "utf8");
    } catch {
      /* ignore */
    }

    // Auto-install required LOCAL runtime packages if missing (friends often skip Mods tab).
    // SKSE + VOA MP core + Address Library bin — all hosted on VOA CDN (no Nexus login).
    const autoNotes: string[] = [];
    try {
      const autoRes = await ensureRequiredLocalRuntime(skyrim);
      if (autoRes.installed.length) {
        autoNotes.push(...autoRes.installed);
        playLog(`auto-installed: ${autoRes.installed.join(", ")}`);
      }
      if (!autoRes.ok) {
        return {
          ok: false,
          error:
            autoRes.error ||
            "Could not auto-install multiplayer runtime. Open Mods → Install All Required, then Play.",
        };
      }
      // voa-mp-core zip may reintroduce fmt/spdlog into SKSE Plugins — strip again
      if (autoRes.installed.length) {
        const lean = ensureLeanSpStack(skyrim);
        if (lean.length) playLog(`post-auto lean: ${lean.join(", ")}`);
      }
    } catch (eAuto: any) {
      playLog(`auto-install err: ${eAuto?.message || eAuto}`);
    }

    if (pathLooksLikeProgramFiles(skyrim)) {
      playLog(`WARN play path still under Program Files: ${skyrim}`);
      return {
        ok: false,
        error:
          "VOA game folder is under Program Files, which blocks multiplayer (UAC). " +
          "In Settings → Rebuild VOA game folder (or clear the VOA path). " +
          "The new folder will be under your user AppData (writable). Then Play again. " +
          `Current: ${skyrim}`,
      };
    }

    const loader = path.join(skyrim, "skse64_loader.exe");
    if (!fs.existsSync(loader)) {
      return {
        ok: false,
        error: `skse64_loader.exe not found in ${skyrim}. Install SKSE64 AE 2.2.6 from the Mods tab (or use Play again to auto-install).`,
      };
    }

    // Hard requirements for multiplayer (SKSE plugins)
    const spDll = path.join(skyrim, "Data", "SKSE", "Plugins", "SkyrimPlatform.dll");
    const mpDll = path.join(skyrim, "Data", "SKSE", "Plugins", "MpClientPlugin.dll");
    const spImpl = path.join(
      skyrim,
      "Data",
      "Platform",
      "Distribution",
      "RuntimeDependencies",
      "SkyrimPlatformImpl.dll"
    );
    if (!fs.existsSync(spDll) || !fs.existsSync(spImpl)) {
      return {
        ok: false,
        error:
          "Skyrim Platform is not installed correctly (missing SkyrimPlatform.dll / SkyrimPlatformImpl.dll). Open Mods → install VOA Multiplayer Core, then Play again.",
      };
    }
    if (!fs.existsSync(mpDll)) {
      return {
        ok: false,
        error:
          "MpClientPlugin.dll is missing under Data\\SKSE\\Plugins. Open Mods → install VOA Multiplayer Core.",
      };
    }

    // Help SKSE/Steam when launching outside Steam UI
    try {
      writeFileExclusive(path.join(skyrim, "steam_appid.txt"), "489830", "utf8");
    } catch {
      /* ignore */
    }

    // Prefer skse64_loader (SKSE injects); never launch bare SkyrimSE.exe for MP.
    const al1170 = path.join(skyrim, "Data", "SKSE", "Plugins", "versionlib-1-6-1170-0.bin");
    if (!fs.existsSync(al1170)) {
      return {
        ok: false,
        error:
          "Address Library is missing versionlib-1-6-1170-0.bin. Open Mods → install Address Library (AE 1.6.1170), then Play again.",
      };
    }

    // SP loads every file under Plugins (except *-settings.txt); keep PluginsDev present
    // so DirectoryMonitor does not spam "code 2".
    try {
      fs.mkdirSync(path.join(skyrim, "Data", "Platform", "PluginsDev"), {
        recursive: true,
      });
    } catch {
      /* ignore */
    }

    // Launch SKSE → game (writes session/settings above so client joins VPS).
    const launched = await launchSkseMultiplayer(skyrim, loader);
    if (!launched.ok) {
      return { ok: false, error: launched.error || "Failed to start SKSE" };
    }

    return {
      ok: true,
      settingsPath,
      profileId,
      serverIp,
      serverPort,
      clientSource: clientInstall.source,
      clientBytes: clientInstall.clientBytes,
      launchMethod: launched.method,
      cleanedPlugins: clientInstall.cleanedPlugins || [],
      playPath: skyrim,
      sourcePath: playRoot.sourcePath,
      usingInstance: Boolean(playRoot.usingInstance),
      instanceCreated: Boolean(playRoot.created),
      mpHint:
        "In-game: open the Skyrim Platform console (bottom of screen). You should see: Hello Multiplayer → Connecting → Logging in. Multiplayer files live in the VOA game folder so your main Skyrim install stays clean.",
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ---------------------------------------------------------------------------
// Mods: single-package download with progress + tracked uninstall
// ---------------------------------------------------------------------------

type InstalledModRecord = {
  id: string;
  version: string;
  name: string;
  installedAt: string;
  files: string[];
};

type ModInstallsFile = {
  packages: Record<string, InstalledModRecord>;
};

type CatalogPackage = {
  id: string;
  name: string;
  description: string;
  version: string;
  size: number;
  sha256?: string;
  downloadUrl: string;
  required?: boolean;
  tags?: string[];
  available?: boolean;
  source?: "local" | "nexus";
  nexusGame?: string;
  nexusModId?: number;
  nexusFileId?: number;
  remapSkseToData?: boolean;
};

type NexusDownloadLink = {
  URI: string;
  name?: string;
  short_name?: string;
};

/**
 * Resolve a short-lived Nexus CDN URL using the player's OAuth access token.
 * Free vs Premium follows the logged-in Nexus account (Bearer), not a VOA key.
 * Premium gets direct download_link; Free may be limited by Nexus policy.
 */
async function getNexusDownloadUriWithOAuth(
  accessToken: string,
  gameDomain: string,
  modId: number,
  fileId: number
): Promise<string> {
  const url = `https://api.nexusmods.com/v1/games/${encodeURIComponent(
    gameDomain
  )}/mods/${modId}/files/${fileId}/download_link.json`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Application-Name": "VisionsOfAetherius",
      "Application-Version": app.getVersion() || "0.2.0",
      accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Nexus rejected your session. Log in again under Account → Nexus Mods."
      );
    }
    if (res.status === 429) {
      throw new Error(
        "Nexus rate limit reached. Free accounts have download limits — wait a bit or use Premium, then try again."
      );
    }
    throw new Error(
      `Nexus download_link failed (HTTP ${res.status}): ${text.slice(0, 180)}`
    );
  }
  let links: NexusDownloadLink[] = [];
  try {
    links = JSON.parse(text) as NexusDownloadLink[];
  } catch {
    throw new Error("Invalid response from Nexus download_link API");
  }
  if (!Array.isArray(links) || !links.length || !links[0]?.URI) {
    throw new Error(
      "Nexus returned no download links. Premium accounts get direct downloads; Free may need to open the mod page on nexusmods.com once, or upgrade."
    );
  }
  const raw = links[0].URI;
  try {
    const u = new URL(raw);
    u.pathname = u.pathname
      .split("/")
      .map((p) => encodeURIComponent(decodeURIComponent(p)))
      .join("/");
    return u.toString();
  } catch {
    return raw.replace(/ /g, "%20");
  }
}

/** Map Address Library-style SKSE/ roots to Data/SKSE/ under the game install. */
function remapNexusInstallRel(rel: string, remapSkseToData: boolean): string {
  if (!remapSkseToData) return rel;
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  if (!parts.length) return rel;
  const first = parts[0].toLowerCase();
  if (first === "skse") {
    return path.join("Data", ...parts);
  }
  if (
    first === "data" &&
    parts.length >= 2 &&
    parts[1].toLowerCase() === "skse"
  ) {
    return path.join(...parts);
  }
  // Bare .bin versionlib files → Data/SKSE/Plugins/
  if (
    parts.length === 1 &&
    parts[0].toLowerCase().endsWith(".bin")
  ) {
    return path.join("Data", "SKSE", "Plugins", parts[0]);
  }
  return rel;
}

const activeDownloads = new Set<string>();

function installsPath(): string {
  return path.join(app.getPath("userData"), "voa-mod-installs.json");
}

function readInstalls(): ModInstallsFile {
  try {
    const p = installsPath();
    if (!fs.existsSync(p)) return { packages: {} };
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as ModInstallsFile;
    return { packages: raw.packages || {} };
  } catch {
    return { packages: {} };
  }
}

function writeInstalls(data: ModInstallsFile): void {
  fs.mkdirSync(path.dirname(installsPath()), { recursive: true });
  fs.writeFileSync(installsPath(), JSON.stringify(data, null, 2), "utf8");
}

function emitModProgress(payload: {
  packageId: string;
  phase: "download" | "verify" | "extract" | "install" | "done" | "error";
  received: number;
  total: number;
  percent: number;
  message?: string;
}): void {
  mainWindow?.webContents.send("mods:progress", payload);
}

function downloadFile(
  urlStr: string,
  destPath: string,
  packageId: string,
  expectedSize?: number
): Promise<{ size: number; sha256: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const file = fs.createWriteStream(destPath);
    const hash = crypto.createHash("sha256");
    let received = 0;
    let total = expectedSize || 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      file.close(() => {
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        } catch {
          /* ignore */
        }
      });
      reject(err);
    };

    const req = lib.get(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Accept: "application/zip,*/*" },
        timeout: 120_000,
      },
      (res) => {
        // Follow one redirect
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          try {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          } catch {
            /* ignore */
          }
          const next = new URL(res.headers.location, url).toString();
          downloadFile(next, destPath, packageId, expectedSize).then(resolve, reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          fail(new Error(`Download failed (HTTP ${res.statusCode || 0})`));
          res.resume();
          return;
        }
        const cl = Number(res.headers["content-length"] || 0);
        if (cl > 0) total = cl;

        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          hash.update(chunk);
          const percent =
            total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0;
          if (packageId === "__launcher__") {
            emitLauncherUpdateProgress({
              phase: "download",
              received,
              total,
              percent,
              message: total
                ? `Downloading… ${percent}%`
                : `Downloading… ${(received / (1024 * 1024)).toFixed(1)} MB`,
            });
            return;
          }
          emitModProgress({
            packageId,
            phase: "download",
            received,
            total,
            percent,
            message: `Downloading… ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ""}`,
          });
        });

        res.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            if (settled) return;
            settled = true;
            resolve({ size: received, sha256: hash.digest("hex") });
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      fail(new Error("Download timed out"));
    });
    req.on("error", (err) => fail(err));
    file.on("error", (err) => fail(err));
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  // Windows 10+ ships tar which extracts zip archives
  try {
    await execFileAsync("tar", ["-xf", zipPath, "-C", destDir], {
      windowsHide: true,
      timeout: 120_000,
    });
  } catch {
    // Fallback: PowerShell Expand-Archive
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, timeout: 120_000 }
    );
  }
  // Nexus §6 — validate every path after extract (zip-slip), before any install copy
  validateExtractedTree(destDir, destDir);
}

function listFilesRecursive(dir: string, base = dir): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

function copyFileEnsuringDir(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Break hardlinks so mod installs never mutate the main Skyrim install
  try {
    const st = fs.lstatSync(dest);
    if (st.isFile() && st.nlink > 1) fs.unlinkSync(dest);
  } catch {
    /* missing ok */
  }
  fs.copyFileSync(src, dest);
}

/** Remove empty parent directories up to (but not including) root */
function pruneEmptyDirs(filePath: string, root: string): void {
  let dir = path.dirname(filePath);
  const rootNorm = path.resolve(root);
  while (dir && path.resolve(dir).startsWith(rootNorm) && path.resolve(dir) !== rootNorm) {
    try {
      const entries = fs.readdirSync(dir);
      if (entries.length > 0) break;
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    } catch {
      break;
    }
  }
}

ipcMain.handle("voa:getMods", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return { error: `Cannot reach API at ${API_BASE}`, packages: [], installed: [] };
    }
    const res = await apiRequest<{ packages: CatalogPackage[] }>("GET", "/v1/mods");
    if (!res.ok) {
      return { error: res.raw || `mods ${res.status}`, packages: [], installed: [] };
    }
    const installs = readInstalls();
    const installed = Object.values(installs.packages);
    return {
      packages: res.data?.packages ?? [],
      installed,
    };
  } catch (e: any) {
    return { error: e?.message || String(e), packages: [], installed: [] };
  }
});

ipcMain.handle("voa:getInstalledMods", () => {
  return { installed: Object.values(readInstalls().packages) };
});

ipcMain.handle(
  "voa:installMod",
  async (
    _e,
    packageId: string
  ): Promise<{ ok: boolean; error?: string; installed?: InstalledModRecord }> => {
    if (!packageId || typeof packageId !== "string") {
      return { ok: false, error: "Invalid package id" };
    }
    if (activeDownloads.has(packageId)) {
      return { ok: false, error: "Download already in progress for this package" };
    }

    const store = readStore();
    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return {
        ok: false,
        error: playRoot.error || "Set your base Skyrim folder in Settings first",
      };
    }
    const skyrim = playRoot.path;
    if (!fs.existsSync(path.join(skyrim, "SkyrimSE.exe"))) {
      return { ok: false, error: "VOA game folder looks invalid (SkyrimSE.exe missing)" };
    }

    activeDownloads.add(packageId);
    const tmpRoot = path.join(app.getPath("temp"), "voa-mods", packageId);
    const zipPath = path.join(tmpRoot, "package.zip");
    const extractDir = path.join(tmpRoot, "extract");

    try {
      if (!(await ensureApiRunning())) {
        throw new Error(`Cannot reach API at ${API_BASE}`);
      }

      // Fetch catalog entry for URL / size / hash / nexus metadata
      const catRes = await apiRequest<{ packages: CatalogPackage[] }>("GET", "/v1/mods");
      if (!catRes.ok) throw new Error(catRes.raw || "Failed to load mod catalog");
      const pkg = (catRes.data?.packages || []).find((p) => p.id === packageId);
      if (!pkg) throw new Error("Package not found in catalog");

      // Known Nexus packages (fallback if older API catalog omits ids)
      const NEXUS_FALLBACKS: Record<
        string,
        {
          nexusGame: string;
          nexusModId: number;
          nexusFileId: number;
          remapSkseToData: boolean;
        }
      > = {
        "address-library-ae": {
          nexusGame: "skyrimspecialedition",
          nexusModId: 32444,
          nexusFileId: 720756,
          remapSkseToData: true,
        },
      };
      const nexusFallback = NEXUS_FALLBACKS[packageId];
      const nexusGame = pkg.nexusGame || nexusFallback?.nexusGame;
      const nexusModId = pkg.nexusModId || nexusFallback?.nexusModId;
      const nexusFileId = pkg.nexusFileId || nexusFallback?.nexusFileId;
      const remapSkse =
        Boolean(pkg.remapSkseToData) ||
        Boolean(nexusFallback?.remapSkseToData);
      const isNexus =
        pkg.source === "nexus" ||
        Boolean(nexusModId && nexusFileId && nexusGame) ||
        Boolean(nexusFallback);

      // Local packages need the VOA archive; Nexus packages need the user's key only.
      if (pkg.available === false && !isNexus) {
        throw new Error("Package archive is not available on the server");
      }

      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.mkdirSync(tmpRoot, { recursive: true });

      let size = 0;
      let sha256 = "";

      if (isNexus) {
        // =====================================================================
        // NEXUS COMPLIANCE §1–§2 (letter of the law):
        // ONLY user-initiated OAuth Bearer token → download_link → direct CDN.
        // NO server personal apikey. NO VOA proxy of Nexus file bytes.
        // =====================================================================
        if (!nexusGame || !nexusModId || !nexusFileId) {
          throw new Error("Catalog is missing Nexus file ids for this package");
        }

        emitModProgress({
          packageId,
          phase: "download",
          received: 0,
          total: pkg.size || 0,
          percent: 0,
          message: store.nexusUser?.isPremium
            ? "Requesting Nexus Premium download link (user OAuth)…"
            : "Requesting Nexus download link (user OAuth / Free)…",
        });

        const accessToken = await getValidNexusAccessToken();
        const cdnUri = await getNexusDownloadUriWithOAuth(
          accessToken,
          nexusGame,
          nexusModId,
          nexusFileId
        );
        if (!String(cdnUri).startsWith("https://")) {
          throw new Error(
            "[VOA compliance] Nexus CDN URI must be HTTPS (direct download only)"
          );
        }

        emitModProgress({
          packageId,
          phase: "download",
          received: 0,
          total: pkg.size || 0,
          percent: 0,
          message: "Downloading from Nexus CDN…",
        });

        const dl = await downloadFile(cdnUri, zipPath, packageId, pkg.size);
        size = dl.size;
        sha256 = dl.sha256;

        emitModProgress({
          packageId,
          phase: "verify",
          received: size,
          total: size,
          percent: 100,
          message: "Downloaded from Nexus (checksum skipped)",
        });
      } else {
        if (!pkg.downloadUrl) {
          throw new Error("Package has no download URL");
        }

        emitModProgress({
          packageId,
          phase: "download",
          received: 0,
          total: pkg.size || 0,
          percent: 0,
          message: "Starting download…",
        });

        const dl = await downloadFile(
          pkg.downloadUrl,
          zipPath,
          packageId,
          pkg.size
        );
        size = dl.size;
        sha256 = dl.sha256;

        if (pkg.sha256 && sha256.toLowerCase() !== pkg.sha256.toLowerCase()) {
          emitModProgress({
            packageId,
            phase: "error",
            received: size,
            total: pkg.size || size,
            percent: 0,
            message: "Checksum mismatch",
          });
          throw new Error(
            `Package checksum mismatch (expected ${pkg.sha256.slice(0, 12)}…, got ${sha256.slice(0, 12)}…)`
          );
        }

        emitModProgress({
          packageId,
          phase: "verify",
          received: size,
          total: size,
          percent: 100,
          message: "Verified package integrity",
        });
      }

      emitModProgress({
        packageId,
        phase: "extract",
        received: size,
        total: size,
        percent: 100,
        message: "Extracting package…",
      });

      fs.mkdirSync(extractDir, { recursive: true });
      await extractZip(zipPath, extractDir);

      // If the previous version of this package is installed, remove its files first
      const installs = readInstalls();
      const previous = installs.packages[packageId];
      if (previous?.files?.length) {
        for (const rel of previous.files) {
          const abs = path.join(skyrim, rel);
          try {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
            pruneEmptyDirs(abs, skyrim);
          } catch {
            /* best-effort */
          }
        }
      }

      emitModProgress({
        packageId,
        phase: "install",
        received: size,
        total: size,
        percent: 100,
        message: "Installing files…",
      });

      // Nexus §6 — reject zip-slip / absolute paths before any install
      const staged = validateExtractedTree(extractDir, extractDir);
      const installedFiles: string[] = [];

      for (const rel of staged) {
        // Skip internal package metadata from being required at runtime,
        // but still install it under Data/VOA/Packages for reference.
        let destRel = rel;
        if (
          path.basename(rel).toLowerCase() === "voa_package.json" ||
          path.basename(rel).toLowerCase() === "voa-package.json"
        ) {
          destRel = path.join("Data", "VOA", "Packages", packageId, "VOA_PACKAGE.json");
        } else if (isNexus) {
          destRel = remapNexusInstallRel(rel, remapSkse);
        }
        // Final destination must remain under skyrim root
        destRel = assertSafeArchiveRelPath(destRel, skyrim);
        const destAbs = path.join(skyrim, destRel);
        const srcAbs = path.join(extractDir, rel);
        copyFileEnsuringDir(srcAbs, destAbs);
        installedFiles.push(destRel.split(path.sep).join("/"));
      }

      const record: InstalledModRecord = {
        id: packageId,
        version: pkg.version,
        name: pkg.name,
        installedAt: new Date().toISOString(),
        files: installedFiles,
      };
      installs.packages[packageId] = record;
      writeInstalls(installs);

      emitModProgress({
        packageId,
        phase: "done",
        received: size,
        total: size,
        percent: 100,
        message: `Installed ${installedFiles.length} file(s)`,
      });

      return { ok: true, installed: record };
    } catch (e: any) {
      emitModProgress({
        packageId,
        phase: "error",
        received: 0,
        total: 0,
        percent: 0,
        message: e?.message || String(e),
      });
      return { ok: false, error: e?.message || String(e) };
    } finally {
      activeDownloads.delete(packageId);
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
);

function removeTrackedPackageFiles(
  skyrim: string,
  rec: InstalledModRecord
): { removed: number; errors: string[] } {
  let removed = 0;
  const errors: string[] = [];
  for (const rel of rec.files || []) {
    const abs = path.join(skyrim, rel);
    try {
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        removed++;
      }
      pruneEmptyDirs(abs, skyrim);
    } catch (e: any) {
      errors.push(`${rel}: ${e?.message || e}`);
    }
  }
  return { removed, errors };
}

ipcMain.handle(
  "voa:uninstallMod",
  async (
    _e,
    packageId: string
  ): Promise<{ ok: boolean; error?: string; removed?: number }> => {
    if (!packageId) return { ok: false, error: "Invalid package id" };

    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return { ok: false, error: playRoot.error || "Skyrim path not set" };
    }
    const skyrim = playRoot.path;

    const installs = readInstalls();
    const rec = installs.packages[packageId];
    if (!rec) return { ok: false, error: "Package is not installed" };

    const { removed, errors } = removeTrackedPackageFiles(skyrim, rec);
    if (errors.length) {
      return {
        ok: false,
        error: `Failed to remove some files: ${errors[0]}`,
        removed,
      };
    }

    delete installs.packages[packageId];
    writeInstalls(installs);

    return { ok: true, removed };
  }
);

/** Verify tracked mod files under the VOA game folder; report missing paths. */
ipcMain.handle("voa:verifyMods", async () => {
  try {
    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return { ok: false, error: playRoot.error || "Skyrim path not set" };
    }
    const skyrim = playRoot.path;
    const installs = readInstalls();
    const ids = Object.keys(installs.packages);
    if (!ids.length) {
      return {
        ok: true,
        packagesChecked: 0,
        packagesOk: 0,
        packagesBroken: 0,
        filesChecked: 0,
        filesMissing: 0,
        broken: [] as Array<{
          id: string;
          name: string;
          missing: string[];
          present: number;
          total: number;
        }>,
        message: "No packages installed to verify.",
      };
    }

    let filesChecked = 0;
    let filesMissing = 0;
    let packagesOk = 0;
    const broken: Array<{
      id: string;
      name: string;
      missing: string[];
      present: number;
      total: number;
    }> = [];

    for (const id of ids) {
      const rec = installs.packages[id];
      const missing: string[] = [];
      let present = 0;
      const files = rec.files || [];
      for (const rel of files) {
        filesChecked++;
        const abs = path.join(skyrim, rel);
        try {
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            present++;
          } else {
            missing.push(rel);
            filesMissing++;
          }
        } catch {
          missing.push(rel);
          filesMissing++;
        }
      }
      if (missing.length === 0 && files.length > 0) {
        packagesOk++;
      } else if (files.length === 0) {
        // Empty file list — treat as broken so user can reinstall
        broken.push({
          id,
          name: rec.name || id,
          missing: ["(no tracked files — reinstall recommended)"],
          present: 0,
          total: 0,
        });
      } else {
        broken.push({
          id,
          name: rec.name || id,
          missing,
          present,
          total: files.length,
        });
      }
    }

    const packagesBroken = broken.length;
    const message =
      packagesBroken === 0
        ? `All good: ${packagesOk} package(s), ${filesChecked} file(s) present in VOA game folder.`
        : `Found ${packagesBroken} package(s) with missing files (${filesMissing} missing of ${filesChecked}). Use Download All or reinstall those packages.`;

    playLog(
      `verifyMods checked=${ids.length} ok=${packagesOk} broken=${packagesBroken} missingFiles=${filesMissing}`
    );

    return {
      ok: true,
      packagesChecked: ids.length,
      packagesOk,
      packagesBroken,
      filesChecked,
      filesMissing,
      broken,
      playPath: skyrim,
      message,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

/**
 * Deep check of the VOA playable folder (SKSE + Address Library + SP stack + CEF + client).
 * Read-only — does not reinstall or rebuild. Safe for players to run anytime.
 */
ipcMain.handle("voa:verifyGameFolder", async () => {
  type Check = {
    id: string;
    label: string;
    ok: boolean;
    detail: string;
    severity: "error" | "warn" | "ok";
  };
  try {
    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return {
        ok: false,
        error: playRoot.error || "VOA game folder not ready. Set base Skyrim path in Settings.",
      };
    }
    const skyrim = playRoot.path;
    const checks: Check[] = [];
    const add = (
      id: string,
      label: string,
      ok: boolean,
      detail: string,
      severity: "error" | "warn" | "ok" = ok ? "ok" : "error"
    ) => {
      checks.push({ id, label, ok, detail, severity: ok ? "ok" : severity });
    };

    const exists = (rel: string) => {
      try {
        return fs.existsSync(path.join(skyrim, rel));
      } catch {
        return false;
      }
    };
    const sizeOf = (rel: string) => fileSizeOr0(path.join(skyrim, rel));

    add(
      "path",
      "VOA game folder",
      true,
      skyrim,
      "ok"
    );
    if (pathLooksLikeProgramFiles(skyrim)) {
      add(
        "program-files",
        "Folder location",
        false,
        "Under Program Files — multiplayer often fails (UAC). Use Settings → Rebuild only if staff ask; the new launcher moves VOA under AppData automatically.",
        "error"
      );
    } else if (isOneDrivePath(skyrim)) {
      add(
        "onedrive",
        "Folder location",
        false,
        "Path is on OneDrive — not allowed for VOA.",
        "error"
      );
    } else {
      add("location", "Folder location", true, "Writable local path (not Program Files / OneDrive)");
    }

    add(
      "skyrimse",
      "SkyrimSE.exe",
      exists("SkyrimSE.exe"),
      exists("SkyrimSE.exe")
        ? `present${(() => {
            const v = getSkyrimExeVersion(skyrim);
            return v ? ` (FileVersion ${v})` : "";
          })()}`
        : "missing — set the real Steam Skyrim SE folder in Settings"
    );
    const exeVer = getSkyrimExeVersion(skyrim);
    if (exeVer && !exeVer.startsWith("1.6.1170")) {
      add(
        "exe-version",
        "Skyrim version",
        false,
        `${exeVer} — VOA needs AE 1.6.1170`,
        "error"
      );
    } else if (exeVer) {
      add("exe-version", "Skyrim version", true, exeVer);
    }

    add(
      "skse-loader",
      "skse64_loader.exe",
      exists("skse64_loader.exe"),
      exists("skse64_loader.exe")
        ? `present (${sizeOf("skse64_loader.exe")} bytes)`
        : "missing — Play auto-installs SKSE, or use Mods → SKSE64 AE 2.2.6"
    );
    add(
      "skse-dll",
      "skse64_1_6_1170.dll",
      exists("skse64_1_6_1170.dll"),
      exists("skse64_1_6_1170.dll")
        ? `present (${sizeOf("skse64_1_6_1170.dll")} bytes)`
        : "missing — reinstall SKSE package"
    );

    const alPath = path.join("Data", "SKSE", "Plugins", "versionlib-1-6-1170-0.bin");
    add(
      "address-library",
      "Address Library (1.6.1170)",
      exists(alPath),
      exists(alPath)
        ? `versionlib-1-6-1170-0.bin (${sizeOf(alPath)} bytes)`
        : "missing — Play auto-installs VOA Address Library"
    );

    const p = spStackPaths(skyrim);
    const spSz = fileSizeOr0(p.spDll);
    const mpSz = fileSizeOr0(p.mpDll);
    const implSz = fileSizeOr0(p.impl);
    const preferred = isPreferredSpStack(skyrim);
    const matched = isMatchedSpStack(skyrim);
    if (preferred) {
      add(
        "sp-stack",
        "Skyrim Platform stack",
        true,
        `preferred A matched (sp=${spSz} mp=${mpSz} impl=${implSz})`
      );
    } else if (matched) {
      add(
        "sp-stack",
        "Skyrim Platform stack",
        false,
        `legacy B sizes (sp=${spSz} mp=${mpSz} impl=${implSz}) — Play will upgrade to preferred stack; or install VOA Multiplayer Core from Mods`,
        "warn"
      );
    } else {
      add(
        "sp-stack",
        "Skyrim Platform stack",
        false,
        `missing or mismatched (sp=${spSz} mp=${mpSz} impl=${implSz}; want ${VOA_SP_STACK.skyrimPlatformDll}/${VOA_SP_STACK.mpClientDll}/${VOA_SP_STACK.skyrimPlatformImpl})`,
        "error"
      );
    }

    const rdOk = hasCompleteRuntimeDeps(skyrim);
    add(
      "runtime-deps",
      "RuntimeDependencies + CEF",
      rdOk,
      rdOk
        ? "Impl, libcef, ChakraCore, fmt, spdlog, resources.pak present"
        : "incomplete CEF/Impl pack — install VOA Multiplayer Core (Play auto-installs)"
    );

    // Official Plugins: no fmt/spdlog as SKSE plugins
    const plugFmt = exists(path.join("Data", "SKSE", "Plugins", "fmt.dll"));
    const plugSpd = exists(path.join("Data", "SKSE", "Plugins", "spdlog.dll"));
    if (plugFmt || plugSpd) {
      add(
        "plugins-layout",
        "SKSE Plugins layout",
        false,
        "fmt.dll/spdlog.dll should not live under Data/SKSE/Plugins (Play lean-strip removes them)",
        "warn"
      );
    } else {
      add(
        "plugins-layout",
        "SKSE Plugins layout",
        true,
        "only SP + MpClient + Address Library expected"
      );
    }

    const clientPath = path.join("Data", "Platform", "Plugins", "skymp5-client.js");
    const clientSz = sizeOf(clientPath);
    add(
      "client",
      "skymp5-client.js",
      clientSz > 10_000,
      clientSz > 10_000
        ? `present (${clientSz} bytes)`
        : "missing or too small — Play downloads the live client"
    );

    const spIni = path.join("Data", "SKSE", "Plugins", "SkyrimPlatform.ini");
    let iniOk = false;
    let iniDetail = "missing — Play writes Cmd=true";
    if (exists(spIni)) {
      try {
        const txt = fs.readFileSync(path.join(skyrim, spIni), "utf8");
        const cmdOn = /Cmd\s*=\s*true/i.test(txt);
        iniOk = cmdOn;
        iniDetail = cmdOn
          ? "Cmd = true (console enabled)"
          : "Cmd is not true — Play rewrites this; if console still missing, contact staff";
      } catch {
        iniDetail = "unreadable";
      }
    }
    add("sp-ini", "SkyrimPlatform.ini", iniOk, iniDetail, iniOk ? "ok" : "warn");

    const scriptsOk = hasSksePapyrusScripts(skyrim);
    add(
      "skse-scripts",
      "SKSE Papyrus scripts (Data/Scripts)",
      scriptsOk,
      scriptsOk
        ? "Actor.pex / Form.pex / skse.pex present"
        : "missing Actor.pex (and friends) — Play will reinstall SKSE scripts; causes SP “Missing files” exception"
    );

    const errors = checks.filter((c) => !c.ok && c.severity === "error");
    const warns = checks.filter((c) => !c.ok && c.severity === "warn");
    const allOk = errors.length === 0;
    let message: string;
    if (allOk && warns.length === 0) {
      message =
        "VOA game folder looks healthy. If multiplayer still fails, upload Support logs — do not Rebuild unless staff ask.";
    } else if (allOk) {
      message = `Folder OK with ${warns.length} warning(s). Prefer Play (auto-fix) over Rebuild unless staff instruct you.`;
    } else {
      message = `Found ${errors.length} problem(s)${warns.length ? ` and ${warns.length} warning(s)` : ""}. Press Play to auto-repair when possible. Only use Rebuild VOA game folder if staff tell you to.`;
    }

    playLog(
      `verifyGameFolder path=${skyrim} ok=${allOk} errors=${errors.length} warns=${warns.length}`
    );

    return {
      ok: true,
      healthy: allOk,
      playPath: skyrim,
      sourcePath: playRoot.sourcePath || null,
      usingInstance: Boolean(playRoot.usingInstance),
      preferredStack: preferred,
      matchedStack: matched,
      checks,
      errorCount: errors.length,
      warnCount: warns.length,
      message,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

/** Remove every tracked VOA mod package from the playable game folder. */
ipcMain.handle("voa:uninstallAllMods", async () => {
  try {
    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return { ok: false, error: playRoot.error || "Skyrim path not set" };
    }
    const skyrim = playRoot.path;
    const installs = readInstalls();
    const ids = Object.keys(installs.packages);
    if (!ids.length) {
      return {
        ok: true,
        packagesRemoved: 0,
        filesRemoved: 0,
        message: "No VOA packages were installed.",
      };
    }

    let filesRemoved = 0;
    const packageErrors: string[] = [];
    for (const id of ids) {
      const rec = installs.packages[id];
      const { removed, errors } = removeTrackedPackageFiles(skyrim, rec);
      filesRemoved += removed;
      if (errors.length) {
        packageErrors.push(`${rec.name || id}: ${errors[0]}`);
      }
      delete installs.packages[id];
    }
    writeInstalls(installs);
    playLog(
      `uninstallAllMods packages=${ids.length} filesRemoved=${filesRemoved} errors=${packageErrors.length}`
    );

    if (packageErrors.length) {
      return {
        ok: false,
        error: `Removed most packages, but some files failed: ${packageErrors[0]}`,
        packagesRemoved: ids.length,
        filesRemoved,
      };
    }

    return {
      ok: true,
      packagesRemoved: ids.length,
      filesRemoved,
      playPath: skyrim,
      message: `Uninstalled ${ids.length} package(s) (${filesRemoved} files) from the VOA game folder.`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

/**
 * TEMP workaround until Nexus OAuth client is registered:
 * User downloads the zip themselves from nexusmods.com in a browser,
 * then picks it here. We extract + remap SKSE/ → Data/SKSE/ (no rehost).
 */
ipcMain.handle(
  "voa:installModFromZip",
  async (
    _e,
    payload?: { packageId?: string; name?: string; version?: string; remapSkseToData?: boolean }
  ): Promise<{ ok: boolean; error?: string; installed?: InstalledModRecord; canceled?: boolean }> => {
    const packageId = String(payload?.packageId || "manual-package").trim() || "manual-package";
    const displayName = String(payload?.name || packageId);
    const version = String(payload?.version || "manual");
    const remapSkse = payload?.remapSkseToData !== false; // default true for Address Library style zips

    const playRoot = resolvePlayableSkyrim();
    if (!playRoot.ok || !playRoot.path) {
      return {
        ok: false,
        error: playRoot.error || "Set your base Skyrim folder in Settings first",
      };
    }
    const skyrim = playRoot.path;
    if (!fs.existsSync(path.join(skyrim, "SkyrimSE.exe"))) {
      return { ok: false, error: "VOA game folder looks invalid (SkyrimSE.exe missing)" };
    }

    const pick = await dialog.showOpenDialog({
      title: `Select ${displayName} zip (from Nexus Mods download)`,
      properties: ["openFile"],
      filters: [{ name: "Zip archives", extensions: ["zip", "7z"] }],
    });
    if (pick.canceled || !pick.filePaths[0]) {
      return { ok: false, canceled: true, error: "Canceled" };
    }
    const zipPath = pick.filePaths[0];
    if (!/\.zip$/i.test(zipPath)) {
      return {
        ok: false,
        error: "Please select a .zip file (download the All-in-one package from Nexus, then pick it here).",
      };
    }

    const tmpRoot = path.join(app.getPath("temp"), "voa-mods-manual", packageId);
    const extractDir = path.join(tmpRoot, "extract");
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.mkdirSync(extractDir, { recursive: true });

      emitModProgress({
        packageId,
        phase: "extract",
        received: 0,
        total: 0,
        percent: 100,
        message: "Extracting local zip…",
      });
      await extractZip(zipPath, extractDir);

      const installs = readInstalls();
      const previous = installs.packages[packageId];
      if (previous?.files?.length) {
        for (const rel of previous.files) {
          const abs = path.join(skyrim, rel);
          try {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
            pruneEmptyDirs(abs, skyrim);
          } catch {
            /* best-effort */
          }
        }
      }

      emitModProgress({
        packageId,
        phase: "install",
        received: 0,
        total: 0,
        percent: 100,
        message: "Installing files…",
      });

      const staged = validateExtractedTree(extractDir, extractDir);
      const installedFiles: string[] = [];
      for (const rel of staged) {
        const destRel = assertSafeArchiveRelPath(
          remapNexusInstallRel(rel, remapSkse),
          skyrim
        );
        const destAbs = path.join(skyrim, destRel);
        const srcAbs = path.join(extractDir, rel);
        copyFileEnsuringDir(srcAbs, destAbs);
        installedFiles.push(destRel.split(path.sep).join("/"));
      }

      const record: InstalledModRecord = {
        id: packageId,
        version,
        name: displayName,
        installedAt: new Date().toISOString(),
        files: installedFiles,
      };
      installs.packages[packageId] = record;
      writeInstalls(installs);

      emitModProgress({
        packageId,
        phase: "done",
        received: installedFiles.length,
        total: installedFiles.length,
        percent: 100,
        message: `Installed ${installedFiles.length} file(s) from zip`,
      });

      return { ok: true, installed: record };
    } catch (e: any) {
      emitModProgress({
        packageId,
        phase: "error",
        received: 0,
        total: 0,
        percent: 0,
        message: e?.message || String(e),
      });
      return { ok: false, error: e?.message || String(e) };
    } finally {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
);
