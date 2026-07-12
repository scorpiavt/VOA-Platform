import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  safeStorage,
  clipboard,
} from "electron";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { spawn, execFile } from "child_process";
import { URL } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Official public platform API (players). Override with VOA_API_URL for local dev. */
const PUBLIC_API_URL = "http://178.156.158.116:3100";
const PUBLIC_GAME = {
  ip: "178.156.158.116",
  port: 10000,
  name: "Visions of Aetherius",
} as const;

function resolveApiBase(): string {
  if (process.env.VOA_API_URL) return process.env.VOA_API_URL.replace(/\/$/, "");
  // Packaged player builds always hit the official VPS — never a local monorepo API
  if (app.isPackaged) return PUBLIC_API_URL;
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

/** Bundled SkyMP client plugin shipped with the player launcher */
function bundledClientDir(): string | null {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, "client") : "",
    path.resolve(__dirname, "../../../client-dist"),
    path.resolve(__dirname, "../../client-dist"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "skymp5-client.js"))) return c;
  }
  return null;
}

/**
 * Install / refresh the VOA multiplayer client plugin into Skyrim.
 * Safe for public players — only writes known client files under Platform/Plugins.
 */
function ensureClientPlugin(skyrim: string): { ok: boolean; error?: string; path?: string } {
  const srcDir = bundledClientDir();
  if (!srcDir) {
    return {
      ok: false,
      error:
        "Launcher is missing the VOA client package. Re-download the official release.",
    };
  }
  const destDir = path.join(skyrim, "Data", "Platform", "Plugins");
  try {
    fs.mkdirSync(destDir, { recursive: true });
    const srcJs = path.join(srcDir, "skymp5-client.js");
    const destJs = path.join(destDir, "skymp5-client.js");
    fs.copyFileSync(srcJs, destJs);
    return { ok: true, path: destJs };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

const storePath = () => path.join(app.getPath("userData"), "voa-store.json");

type Store = {
  accessToken?: string;
  refreshToken?: string;
  user?: unknown;
  skyrimPath?: string;
  /** Selected character slot 0|1 for next Play */
  characterSlot?: number;
};

function readStore(): Store {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Store & {
      encAccess?: string;
      encRefresh?: string;
    };
    const out: Store = { ...raw };
    if (raw.encAccess && safeStorage.isEncryptionAvailable()) {
      out.accessToken = safeStorage.decryptString(Buffer.from(raw.encAccess, "base64"));
    }
    if (raw.encRefresh && safeStorage.isEncryptionAvailable()) {
      out.refreshToken = safeStorage.decryptString(Buffer.from(raw.encRefresh, "base64"));
    }
    delete (out as { encAccess?: string }).encAccess;
    delete (out as { encRefresh?: string }).encRefresh;
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
  };
  if (typeof next.characterSlot === "number") {
    toWrite.characterSlot = next.characterSlot;
  }

  const access = next.accessToken || "";
  const refresh = next.refreshToken || "";

  if (safeStorage.isEncryptionAvailable()) {
    if (access) {
      toWrite.encAccess = safeStorage.encryptString(access).toString("base64");
    }
    if (refresh) {
      toWrite.encRefresh = safeStorage.encryptString(refresh).toString("base64");
    }
  } else {
    if (access) toWrite.accessToken = access;
    if (refresh) toWrite.refreshToken = refresh;
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
    if (fs.existsSync(path.join(c, "SkyrimSE.exe"))) return c;
  }
  return null;
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
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f1115",
    title: "Visions of Aetherius",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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
            `Discord returned: ${err}. Close this tab and try Login again in the launcher.`
          )
        );
        return;
      }
      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          htmlAuthPage("Login failed", "Missing code/state. Close this tab and try again.")
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
                " Close this tab and try again from the launcher."
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
  sha256?: string;
  size?: number;
  notes?: string;
  minVersion?: string;
  channel?: string;
};

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

/** Download portable launcher and swap via helper bat, then quit. */
ipcMain.handle("voa:applyLauncherUpdate", async () => {
  try {
    if (!(await ensureApiRunning())) {
      return { ok: false, error: "Cannot reach update server" };
    }
    const res = await apiRequest<LauncherUpdateInfo>(
      "GET",
      "/v1/updates/launcher/latest"
    );
    if (!res.ok || !res.data?.downloadUrl) {
      return { ok: false, error: res.raw || "No update available" };
    }
    const latest = res.data;
    const currentVersion = app.getVersion();
    if (cmpSemver(currentVersion, latest.version) >= 0) {
      return { ok: false, error: "Already up to date" };
    }

    const tmpDir = path.join(app.getPath("temp"), "voa-launcher-update");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpExe = path.join(tmpDir, "VisionsOfAetherius-update.exe");
    if (fs.existsSync(tmpExe)) fs.unlinkSync(tmpExe);

    emitLauncherUpdateProgress({
      phase: "download",
      received: 0,
      total: latest.size || 0,
      percent: 0,
      message: `Downloading launcher v${latest.version}…`,
    });

    // Reuse mod download helper (progress re-tagged below via packageId)
    const { size, sha256 } = await downloadFile(
      latest.downloadUrl,
      tmpExe,
      "__launcher__",
      latest.size
    );

    if (latest.sha256 && sha256.toLowerCase() !== latest.sha256.toLowerCase()) {
      return {
        ok: false,
        error: `Update checksum mismatch (got ${sha256.slice(0, 12)}…)`,
      };
    }
    if (size < 1_000_000) {
      return { ok: false, error: "Downloaded update looks too small — aborted" };
    }

    emitLauncherUpdateProgress({
      phase: "install",
      received: size,
      total: size,
      percent: 100,
      message: "Installing update…",
    });

    const target = process.execPath;
    const batPath = path.join(tmpDir, "apply-update.bat");
    // Escape for batch: wrap paths in quotes; use delayed retry while exe unlocks
    const bat = [
      "@echo off",
      "setlocal",
      `set "SRC=${tmpExe.replace(/"/g, "")}"`,
      `set "TARGET=${target.replace(/"/g, "")}"`,
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
  return {
    user: s.user ?? null,
    skyrimPath: s.skyrimPath ?? null,
    hasTokens: Boolean(s.accessToken && s.refreshToken),
    accessToken: s.accessToken ?? null,
    refreshToken: s.refreshToken ?? null,
    characterSlot: typeof s.characterSlot === "number" ? s.characterSlot : 0,
  };
});

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
    title: "Select Skyrim Special Edition folder",
    properties: ["openDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const dir = res.filePaths[0];
  if (!fs.existsSync(path.join(dir, "SkyrimSE.exe")) && !fs.existsSync(path.join(dir, "skse64_loader.exe"))) {
    return { error: "Folder does not look like Skyrim SE" };
  }
  writeStore({ skyrimPath: dir });
  return { path: dir };
});

ipcMain.handle("voa:setSkyrimPath", (_e, p: string) => {
  writeStore({ skyrimPath: p });
  return true;
});

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
    const skyrim = store.skyrimPath || detectSkyrimPath();
    if (!skyrim) return { ok: false, error: "Skyrim path not set" };
    if (!store.accessToken || !store.refreshToken) {
      return { ok: false, error: "Not logged in — use Login with Discord first" };
    }

    const clientInstall = ensureClientPlugin(skyrim);
    if (!clientInstall.ok) {
      return { ok: false, error: clientInstall.error || "Failed to install multiplayer client" };
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

    const next = {
      ...existing,
      "server-ip": session.serverIp,
      "server-port": session.serverPort,
      master: session.master,
      gameData: {
        profileId: session.profileId,
        session: session.session,
        characterSlot: session.characterSlot ?? characterSlot,
      },
    };
    delete (next as { "server-master-key"?: string })["server-master-key"];

    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), "utf8");

    const loader = path.join(skyrim, "skse64_loader.exe");
    if (!fs.existsSync(loader)) {
      return { ok: false, error: `skse64_loader.exe not found in ${skyrim}` };
    }

    spawn(loader, [], {
      cwd: skyrim,
      detached: true,
      stdio: "ignore",
    }).unref();

    return {
      ok: true,
      settingsPath,
      profileId: session.profileId,
      serverIp: session.serverIp,
      serverPort: session.serverPort,
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
};

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
    return;
  } catch {
    // Fallback: PowerShell Expand-Archive
  }
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
    const skyrim = store.skyrimPath || detectSkyrimPath();
    if (!skyrim) {
      return { ok: false, error: "Set your Skyrim SE folder in Settings first" };
    }
    if (!fs.existsSync(path.join(skyrim, "SkyrimSE.exe"))) {
      return { ok: false, error: "Skyrim path looks invalid (SkyrimSE.exe missing)" };
    }

    activeDownloads.add(packageId);
    const tmpRoot = path.join(app.getPath("temp"), "voa-mods", packageId);
    const zipPath = path.join(tmpRoot, "package.zip");
    const extractDir = path.join(tmpRoot, "extract");

    try {
      if (!(await ensureApiRunning())) {
        throw new Error(`Cannot reach API at ${API_BASE}`);
      }

      // Fetch catalog entry for URL / size / hash
      const catRes = await apiRequest<{ packages: CatalogPackage[] }>("GET", "/v1/mods");
      if (!catRes.ok) throw new Error(catRes.raw || "Failed to load mod catalog");
      const pkg = (catRes.data?.packages || []).find((p) => p.id === packageId);
      if (!pkg) throw new Error("Package not found in catalog");
      if (pkg.available === false) throw new Error("Package archive is not available on the server");

      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.mkdirSync(tmpRoot, { recursive: true });

      emitModProgress({
        packageId,
        phase: "download",
        received: 0,
        total: pkg.size || 0,
        percent: 0,
        message: "Starting download…",
      });

      const { size, sha256 } = await downloadFile(
        pkg.downloadUrl,
        zipPath,
        packageId,
        pkg.size
      );

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

      const staged = listFilesRecursive(extractDir);
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
        }
        // Normalize to forward-slash storage, Windows path ops use path.join
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

ipcMain.handle(
  "voa:uninstallMod",
  async (
    _e,
    packageId: string
  ): Promise<{ ok: boolean; error?: string; removed?: number }> => {
    if (!packageId) return { ok: false, error: "Invalid package id" };

    const store = readStore();
    const skyrim = store.skyrimPath || detectSkyrimPath();
    if (!skyrim) return { ok: false, error: "Skyrim path not set" };

    const installs = readInstalls();
    const rec = installs.packages[packageId];
    if (!rec) return { ok: false, error: "Package is not installed" };

    let removed = 0;
    for (const rel of rec.files || []) {
      const abs = path.join(skyrim, rel);
      try {
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs);
          removed++;
        }
        pruneEmptyDirs(abs, skyrim);
      } catch (e: any) {
        return {
          ok: false,
          error: `Failed to remove ${rel}: ${e?.message || e}`,
        };
      }
    }

    delete installs.packages[packageId];
    writeInstalls(installs);

    return { ok: true, removed };
  }
);
