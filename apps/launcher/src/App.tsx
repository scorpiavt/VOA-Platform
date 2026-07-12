import { useCallback, useEffect, useMemo, useState } from "react";
import type { NewsPost, ServerStatus, User } from "@voa/shared";

type Tab = "home" | "characters" | "mods" | "settings" | "account";

type CharacterSlot = {
  id: number;
  slot: number;
  name: string;
  empty: boolean;
  lastPlayedAt?: string | null;
  createdAt: string;
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

type InstalledMod = {
  id: string;
  version: string;
  name: string;
  installedAt: string;
  files: string[];
};

type ModProgress = {
  packageId: string;
  phase: string;
  received: number;
  total: number;
  percent: number;
  message?: string;
};

type LauncherUpdateState = {
  currentVersion: string;
  updateAvailable: boolean;
  forced?: boolean;
  latest?: {
    version: string;
    downloadUrl: string;
    notes?: string;
    minVersion?: string;
    size?: number;
  } | null;
};

declare global {
  interface Window {
    voa: {
      getApiBase: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      checkLauncherUpdate: () => Promise<
        LauncherUpdateState & { error?: string }
      >;
      applyLauncherUpdate: () => Promise<{
        ok: boolean;
        error?: string;
        version?: string;
      }>;
      getStatus: () => Promise<{ status?: ServerStatus; error?: string }>;
      getNews: () => Promise<{ items?: NewsPost[]; error?: string }>;
      getStore: () => Promise<{
        user: User | null;
        skyrimPath: string | null;
        hasTokens: boolean;
        accessToken: string | null;
        refreshToken: string | null;
      }>;
      setAuth: (p: { accessToken: string; refreshToken: string; user: User }) => Promise<boolean>;
      logout: () => Promise<boolean>;
      openDiscordLogin: () => Promise<{ ok: boolean; error?: string; user?: unknown }>;
      getDiscordSetup: () => Promise<{
        clientId?: string | null;
        requiredRedirects?: string[];
        portalUrl?: string;
        hint?: string;
        error?: string;
      }>;
      openDiscordSetupPage: () => Promise<boolean>;
      pickSkyrimPath: () => Promise<{ path: string } | { error: string } | null>;
      play: (opts?: { characterSlot?: number }) => Promise<{
        ok: boolean;
        error?: string;
        settingsPath?: string;
        profileId?: number;
        serverIp?: string;
        serverPort?: number;
      }>;
      setCharacterSlot: (slot: number) => Promise<{ ok: boolean; error?: string }>;
      getCharacters: () => Promise<{ characters?: CharacterSlot[]; error?: string }>;
      createCharacter: (p: {
        slot: number;
        name?: string;
      }) => Promise<{ ok: boolean; error?: string; character?: CharacterSlot }>;
      deleteCharacter: (id: number) => Promise<{ ok: boolean; error?: string }>;
      getMods: () => Promise<{
        packages?: CatalogPackage[];
        installed?: InstalledMod[];
        error?: string;
      }>;
      getInstalledMods: () => Promise<{ installed: InstalledMod[] }>;
      installMod: (packageId: string) => Promise<{
        ok: boolean;
        error?: string;
        installed?: InstalledMod;
      }>;
      uninstallMod: (packageId: string) => Promise<{
        ok: boolean;
        error?: string;
        removed?: number;
      }>;
      onAuthUpdated: (cb: (payload: unknown) => void) => () => void;
      onModProgress: (cb: (payload: ModProgress) => void) => () => void;
      onLauncherUpdateProgress: (
        cb: (payload: {
          phase: string;
          received: number;
          total: number;
          percent: number;
          message?: string;
        }) => void
      ) => () => void;
    };
  }
}

function formatBytes(n: number): string {
  if (!n || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [apiBase, setApiBase] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [skyrimPath, setSkyrimPath] = useState<string | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [statusAge, setStatusAge] = useState<Date | null>(null);
  const [characters, setCharacters] = useState<CharacterSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [charBusy, setCharBusy] = useState(false);
  const [createName, setCreateName] = useState("");

  // Mods state
  const [modPackages, setModPackages] = useState<CatalogPackage[]>([]);
  const [installedMods, setInstalledMods] = useState<Record<string, InstalledMod>>({});
  const [modsLoading, setModsLoading] = useState(false);
  const [modActionId, setModActionId] = useState<string | null>(null);
  const [modProgress, setModProgress] = useState<Record<string, ModProgress>>({});
  const [appVersion, setAppVersion] = useState("");
  const [launcherUpdate, setLauncherUpdate] = useState<LauncherUpdateState | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{
    percent: number;
    message?: string;
  } | null>(null);

  const loggedIn = Boolean(user && accessToken);
  const updateAvailable = Boolean(launcherUpdate?.updateAvailable);

  const loadPublic = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setError(null);
    const [s, n] = await Promise.all([window.voa.getStatus(), window.voa.getNews()]);
    if (s.error) {
      if (!opts?.quiet) setError(s.error);
      setStatus(null);
    } else if (s.status) {
      setStatus(s.status);
      setStatusAge(new Date());
      if (!opts?.quiet) setError(null);
    }
    if (n.items) setNews(n.items);
  }, []);

  const checkUpdate = useCallback(async () => {
    try {
      const res = await window.voa.checkLauncherUpdate();
      setAppVersion(res.currentVersion || "");
      setLauncherUpdate({
        currentVersion: res.currentVersion,
        updateAvailable: Boolean(res.updateAvailable),
        forced: res.forced,
        latest: res.latest ?? null,
      });
    } catch {
      /* ignore offline update check */
    }
  }, []);

  const loadMods = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setModsLoading(true);
    try {
      const res = await window.voa.getMods();
      if (res.error && !opts?.quiet) setError(res.error);
      setModPackages(res.packages || []);
      const map: Record<string, InstalledMod> = {};
      for (const m of res.installed || []) map[m.id] = m;
      setInstalledMods(map);
    } finally {
      if (!opts?.quiet) setModsLoading(false);
    }
  }, []);

  const applyAuth = useCallback((payload: any) => {
    if (!payload?.accessToken) return;
    setAccessToken(payload.accessToken);
    if (payload.user) setUser(payload.user as User);
    setInfo(`Logged in as ${(payload.user as User)?.username || "Discord user"}`);
    setLoginBusy(false);
    setError(null);
    setTab("home");
  }, []);

  useEffect(() => {
    (async () => {
      const base = await window.voa.getApiBase();
      setApiBase(base);
      try {
        setAppVersion(await window.voa.getAppVersion());
      } catch {
        /* ignore */
      }
      const store = await window.voa.getStore();
      setUser(store.user);
      setAccessToken(store.accessToken);
      setSkyrimPath(store.skyrimPath);
      await loadPublic();
      await checkUpdate();
    })();

    const off = window.voa.onAuthUpdated((payload: any) => {
      applyAuth(payload);
    });
    return off;
  }, [loadPublic, applyAuth, checkUpdate]);

  useEffect(() => {
    const off = window.voa.onModProgress((p) => {
      setModProgress((prev) => ({ ...prev, [p.packageId]: p }));
    });
    return off;
  }, []);

  useEffect(() => {
    const off = window.voa.onLauncherUpdateProgress((p) => {
      setUpdateProgress({ percent: p.percent, message: p.message });
    });
    return off;
  }, []);

  // Live status refresh every 10s; update check every 5 min
  useEffect(() => {
    const id = window.setInterval(() => {
      loadPublic({ quiet: true });
    }, 10_000);
    const id2 = window.setInterval(() => {
      checkUpdate();
    }, 5 * 60_000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(id2);
    };
  }, [loadPublic, checkUpdate]);

  const loadCharacters = useCallback(async () => {
    if (!accessToken) {
      setCharacters([]);
      return;
    }
    try {
      const res = await window.voa.getCharacters();
      if (res.error) {
        // soft fail
      }
      const list = res.characters || [];
      setCharacters(list);
      const store = await window.voa.getStore();
      const slot =
        typeof (store as any).characterSlot === "number" ? (store as any).characterSlot : 0;
      setSelectedSlot(slot);
    } catch {
      /* ignore */
    }
  }, [accessToken]);

  // Load mods / characters when opening tabs
  useEffect(() => {
    if (tab === "mods") {
      loadMods();
    }
    if (tab === "characters" || tab === "home") {
      loadCharacters();
    }
  }, [tab, loadMods, loadCharacters]);

  const onLogin = async () => {
    setError(null);
    setLoginBusy(true);
    setInfo(
      "Opening setup + Discord… If you see Invalid OAuth2 redirect_uri, paste the copied redirect into Discord Developer Portal → OAuth2 → Redirects, Save, then Login again."
    );
    try {
      const res = await window.voa.openDiscordLogin();
      if (!res.ok) {
        setError(
          (res.error || "Discord login failed") +
            " — Add http://127.0.0.1:47821/auth/discord/callback under Discord OAuth2 Redirects (Save Changes). Use VisionsOfAetherius-NEW.exe if you have an old build."
        );
        setInfo(null);
        setLoginBusy(false);
        return;
      }
      const store = await window.voa.getStore();
      if (store.accessToken && store.user) {
        setAccessToken(store.accessToken);
        setUser(store.user);
        setInfo(`Logged in as ${store.user.username}`);
      } else if (res.user) {
        applyAuth({ accessToken: store.accessToken, user: res.user });
      }
    } catch (e: any) {
      setError(e?.message || String(e));
      setInfo(null);
    } finally {
      setLoginBusy(false);
    }
  };

  const onDiscordSetup = async () => {
    setError(null);
    try {
      const setup = await window.voa.getDiscordSetup();
      if (setup.error) setError(setup.error);
      else {
        const list = (setup.requiredRedirects || []).join("\n");
        setInfo(
          `Discord Client ID: ${setup.clientId || "?"}\nAdd these Redirects (exact), then Save:\n${list}`
        );
      }
      await window.voa.openDiscordSetupPage();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const onLogout = async () => {
    await window.voa.logout();
    setUser(null);
    setAccessToken(null);
    setInfo("Logged out");
  };

  const onPickPath = async () => {
    const res = await window.voa.pickSkyrimPath();
    if (!res) return;
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSkyrimPath(res.path);
    setInfo("Skyrim path saved");
  };

  const onApplyUpdate = async () => {
    setError(null);
    setInfo(null);
    setUpdateBusy(true);
    setUpdateProgress({ percent: 0, message: "Starting update…" });
    try {
      const res = await window.voa.applyLauncherUpdate();
      if (!res.ok) throw new Error(res.error || "Update failed");
      setInfo(
        `Updating to v${res.version || launcherUpdate?.latest?.version || "…"} — launcher will restart…`
      );
    } catch (e: any) {
      setError(e?.message || String(e));
      setUpdateBusy(false);
      setUpdateProgress(null);
    }
  };

  const onPlay = async () => {
    setError(null);
    setInfo(null);
    if (updateAvailable) {
      await onApplyUpdate();
      return;
    }
    if (!accessToken || !user) {
      setError("Log in with Discord first");
      return;
    }
    if (!skyrimPath) {
      setError("Set your Skyrim SE folder in Settings");
      setTab("settings");
      return;
    }
    if (status?.maintenance) {
      setError("Server is in maintenance — Play is disabled.");
      return;
    }
    setBusy(true);
    try {
      // Ensure selected slot has a character (auto-create empty slot on Play)
      let selected = characters.find((c) => c.slot === selectedSlot);
      if (!selected || selected.empty) {
        const name =
          createName.trim() || `New Character ${selectedSlot + 1}`;
        const res = await window.voa.createCharacter({ slot: selectedSlot, name });
        if (!res.ok) throw new Error(res.error || "Could not create character for this slot");
        await loadCharacters();
        selected = res.character || { ...selected!, empty: false, name };
        setInfo(`Created character "${name}" in slot ${selectedSlot + 1}`);
      }
      await window.voa.setCharacterSlot(selectedSlot);
      const playRes = await window.voa.play({ characterSlot: selectedSlot });
      if (!playRes.ok) throw new Error(playRes.error || "Launch failed");
      const charName =
        (selected && !selected.empty && selected.name) ||
        characters.find((c) => c.slot === selectedSlot && !c.empty)?.name ||
        "character";
      setInfo(
        `Launching as ${charName} (slot ${selectedSlot + 1}) → ${playRes.serverIp}:${playRes.serverPort}`
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Primary CTA: Update (always enabled if update pending) or Play (gated). */
  const playButton = useMemo(() => {
    if (updateAvailable) {
      const ver = launcherUpdate?.latest?.version;
      const label = updateBusy
        ? updateProgress?.message || "Updating…"
        : ver
          ? `Update to v${ver}`
          : "Update";
      return {
        label,
        disabled: updateBusy,
        className: "primary update-cta",
        title: launcherUpdate?.latest?.notes || "A new launcher version is available",
        mode: "update" as const,
      };
    }

    const reasons: string[] = [];
    if (!loggedIn) reasons.push("Log in with Discord");
    if (!skyrimPath) reasons.push("Set Skyrim folder in Settings");
    if (status?.maintenance) reasons.push("Server is in maintenance");
    if (loginBusy) reasons.push("Waiting for Discord login");
    if (busy) reasons.push("Starting…");

    const canPlay =
      loggedIn && Boolean(skyrimPath) && !status?.maintenance && !loginBusy && !busy && !updateBusy;

    let label = "Play";
    if (busy) label = "Starting…";
    else if (!loggedIn) label = "Play";
    else if (!skyrimPath) label = "Play";

    return {
      label,
      disabled: !canPlay,
      className: "primary",
      title: canPlay
        ? "Launch Skyrim multiplayer"
        : reasons.join(" · ") || "Play unavailable",
      mode: "play" as const,
    };
  }, [
    updateAvailable,
    launcherUpdate,
    updateBusy,
    updateProgress,
    loggedIn,
    skyrimPath,
    status?.maintenance,
    loginBusy,
    busy,
  ]);

  const onSelectSlot = async (slot: number) => {
    setSelectedSlot(slot);
    await window.voa.setCharacterSlot(slot);
  };

  const onCreateCharacter = async (slot: number) => {
    setCharBusy(true);
    setError(null);
    try {
      const name = createName.trim() || undefined;
      const res = await window.voa.createCharacter({ slot, name });
      if (!res.ok) throw new Error(res.error || "Create failed");
      setCreateName("");
      setSelectedSlot(slot);
      await window.voa.setCharacterSlot(slot);
      setInfo(`Character slot ${slot + 1} ready — press Play to enter the world (race menu on first join)`);
      await loadCharacters();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCharBusy(false);
    }
  };

  const onDeleteCharacter = async (ch: CharacterSlot) => {
    if (ch.empty) return;
    if (!confirm(`Delete character "${ch.name}" in slot ${ch.slot + 1}? This clears the launcher slot (in-world data may remain until wiped).`)) {
      return;
    }
    setCharBusy(true);
    setError(null);
    try {
      const res = await window.voa.deleteCharacter(ch.id);
      if (!res.ok) throw new Error(res.error || "Delete failed");
      setInfo(`Deleted slot ${ch.slot + 1}`);
      await loadCharacters();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCharBusy(false);
    }
  };

  const onInstallMod = async (pkg: CatalogPackage) => {
    setError(null);
    setInfo(null);
    if (!skyrimPath) {
      setError("Set your Skyrim SE folder in Settings before installing mods");
      setTab("settings");
      return;
    }
    setModActionId(pkg.id);
    setModProgress((prev) => ({
      ...prev,
      [pkg.id]: {
        packageId: pkg.id,
        phase: "download",
        received: 0,
        total: pkg.size || 0,
        percent: 0,
        message: "Starting…",
      },
    }));
    try {
      const res = await window.voa.installMod(pkg.id);
      if (!res.ok) throw new Error(res.error || "Install failed");
      if (res.installed) {
        setInstalledMods((prev) => ({ ...prev, [pkg.id]: res.installed! }));
      }
      setInfo(`Installed ${pkg.name} v${pkg.version} (${res.installed?.files.length ?? 0} files)`);
      await loadMods({ quiet: true });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setModActionId(null);
    }
  };

  const onUninstallMod = async (pkg: CatalogPackage) => {
    setError(null);
    setInfo(null);
    setModActionId(pkg.id);
    try {
      const res = await window.voa.uninstallMod(pkg.id);
      if (!res.ok) throw new Error(res.error || "Uninstall failed");
      setInstalledMods((prev) => {
        const next = { ...prev };
        delete next[pkg.id];
        return next;
      });
      setModProgress((prev) => {
        const next = { ...prev };
        delete next[pkg.id];
        return next;
      });
      setInfo(`Uninstalled ${pkg.name} (${res.removed ?? 0} files removed)`);
      await loadMods({ quiet: true });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setModActionId(null);
    }
  };

  const statusBadge = useMemo(() => {
    if (!status) return <span className="badge warn">Checking server...</span>;
    if (status.maintenance) return <span className="badge warn">Maintenance</span>;
    if (status.gameOnline) return <span className="badge ok">Server online</span>;
    return <span className="badge bad">Server offline</span>;
  }, [status]);

  const installedCount = Object.keys(installedMods).length;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden title="Visions of Aetherius" />
          <h1>VISIONS OF<br />AETHERIUS</h1>
          <p>SkyMP Launcher</p>
        </div>
        <nav className="nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
            Home
          </button>
          <button
            className={tab === "characters" ? "active" : ""}
            onClick={() => setTab("characters")}
          >
            Characters
          </button>
          <button className={tab === "mods" ? "active" : ""} onClick={() => setTab("mods")}>
            Mods
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            Settings
          </button>
          <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>
            Account
          </button>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <div className="players-pill" title="Players currently on the game server">
            <span className="players-label">In game</span>
            <span className="players-count">
              {status?.playersOnline == null ? "—" : status.playersOnline}
              <span className="players-max">
                {" "}
                / {status?.maxPlayers ?? 50}
              </span>
            </span>
          </div>
          <div className="profile-card">
            {loggedIn && user ? (
              <>
                <div className="profile-row">
                  {user.avatarUrl ? (
                    <img className="profile-avatar" src={user.avatarUrl} alt="" />
                  ) : (
                    <div className="profile-avatar placeholder">
                      {(user.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="profile-meta">
                    <div className="profile-name">{user.username}</div>
                    <div className="profile-sub">Profile #{user.profileId}</div>
                    <div className="profile-sub muted-xs">Connected via Discord</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="profile-empty">
                <div className="profile-name">Not connected</div>
                <div className="profile-sub">Log in with Discord to link your account</div>
              </div>
            )}
          </div>
          <div className="row" style={{ marginBottom: 8, marginTop: 10 }}>
            {statusBadge}
          </div>
          {updateAvailable && (
            <p className="update-banner" title={launcherUpdate?.latest?.notes || ""}>
              Launcher update available
              {launcherUpdate?.latest?.version
                ? ` (v${appVersion || "?"} → v${launcherUpdate.latest.version})`
                : ""}
            </p>
          )}
          {updateBusy && updateProgress && (
            <div className="progress-block" style={{ marginBottom: 8 }}>
              <div className="progress-bar" role="progressbar">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.max(2, updateProgress.percent || 0)}%` }}
                />
              </div>
            </div>
          )}
          <button
            className={playButton.className}
            style={{ width: "100%" }}
            disabled={playButton.disabled}
            title={playButton.title}
            onClick={onPlay}
          >
            {playButton.label}
          </button>
          {!updateAvailable && playButton.disabled && !busy && (
            <p className="play-hint">{playButton.title}</p>
          )}
        </div>
      </aside>

      <main className="main">
        {error && <p className="error">{error}</p>}
        {info && <p className="success">{info}</p>}

        {tab === "home" && (
          <>
            <div className="hero-banner">
              <div className="hero-banner-inner">
                <h2>Visions of Aetherius</h2>
                <p>
                  Multiplayer Skyrim — sign in, pick a character, and step into the same
                  world with your companions.
                </p>
              </div>
            </div>
            <div className="panel">
              <h2>Play</h2>
              <p className="muted">
                {loggedIn
                  ? `Signed in as ${user?.username} (profile #${user?.profileId})`
                  : "Sign in with Discord to receive a session and launch Skyrim via SKSE."}
              </p>
              {loggedIn && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Character:{" "}
                  <strong>
                    {characters.find((c) => c.slot === selectedSlot && !c.empty)?.name ||
                      "none selected"}
                  </strong>{" "}
                  (slot {selectedSlot + 1}/2) — manage in{" "}
                  <button className="linkish" type="button" onClick={() => setTab("characters")}>
                    Characters
                  </button>
                </p>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {!loggedIn && !updateAvailable ? (
                  <button className="primary" disabled={loginBusy} onClick={onLogin}>
                    {loginBusy ? "Waiting for Discord..." : "Login with Discord"}
                  </button>
                ) : (
                  <button
                    className={playButton.className}
                    disabled={playButton.disabled}
                    title={playButton.title}
                    onClick={onPlay}
                  >
                    {playButton.mode === "update"
                      ? playButton.label
                      : busy
                        ? "Starting…"
                        : "Launch game"}
                  </button>
                )}
                <button className="secondary" onClick={() => loadPublic()}>
                  Refresh status
                </button>
                <button className="secondary" onClick={() => setTab("characters")}>
                  Characters
                </button>
                <button className="secondary" onClick={() => setTab("mods")}>
                  Mods
                </button>
              </div>
              {status?.message && (
                <p className="muted" style={{ marginTop: 10 }}>
                  {status.message}
                </p>
              )}
              <p className="muted" style={{ marginTop: 10 }}>
                Target: {status?.serverIp ?? "…"}:{status?.serverPort ?? "…"}
                {statusAge ? ` · updated ${statusAge.toLocaleTimeString()}` : ""}
                {appVersion ? ` · launcher v${appVersion}` : ""}
              </p>
            </div>

            <div className="panel">
              <h2>News</h2>
              {news.length === 0 && <p className="muted">No news yet.</p>}
              {news.map((n) => (
                <article key={n.id} className="news-item">
                  <h3>
                    {n.pinned ? "📌 " : ""}
                    {n.title}
                  </h3>
                  <div className="meta">{new Date(n.publishedAt).toLocaleString()}</div>
                  <div className="body">{n.body}</div>
                </article>
              ))}
            </div>
          </>
        )}

        {tab === "characters" && (
          <>
            <div className="panel">
              <h2>Character select</h2>
              <p className="muted">
                Choose a slot before connecting to the game server. Two characters per account.
                Create a slot here, then Play — first join opens race menu in-world; later joins
                reload that character.
              </p>
              {!loggedIn && (
                <p className="error" style={{ marginTop: 10 }}>
                  Log in with Discord to manage characters.
                </p>
              )}
              {loggedIn && (
                <div className="row" style={{ marginTop: 12 }}>
                  <input
                    className="input"
                    placeholder="Name for new character (optional)"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    maxLength={32}
                  />
                </div>
              )}
            </div>

            {[0, 1].map((slot) => {
              const ch = characters.find((c) => c.slot === slot);
              const selected = selectedSlot === slot;
              const empty = !ch || ch.empty;
              return (
                <div
                  key={slot}
                  className={`panel char-card${selected ? " selected" : ""}`}
                >
                  <div className="mod-header">
                    <div className="mod-title-block">
                      <h3 className="mod-name">
                        {empty ? `Slot ${slot + 1}` : ch!.name}
                        <span className="mod-tag" style={{ opacity: 0.8 }}>
                          Slot {slot + 1}
                        </span>
                        {selected && <span className="mod-tag installed">Selected</span>}
                        {empty ? (
                          <span className="mod-tag missing">Empty</span>
                        ) : (
                          <span className="mod-tag installed">Ready</span>
                        )}
                      </h3>
                      <div className="mod-meta">
                        {empty
                          ? "No character — create one to use this slot"
                          : ch!.lastPlayedAt
                            ? `Last play ${new Date(ch!.lastPlayedAt).toLocaleString()}`
                            : "In-game name (from race menu / look)"}
                      </div>
                    </div>
                    <div className="mod-actions">
                      {!empty && (
                        <button
                          className={selected ? "primary" : "secondary"}
                          disabled={charBusy}
                          onClick={() => onSelectSlot(slot)}
                        >
                          {selected ? "Selected" : "Select"}
                        </button>
                      )}
                      {empty && loggedIn && (
                        <button
                          className="primary"
                          disabled={charBusy}
                          onClick={() => onCreateCharacter(slot)}
                        >
                          Create
                        </button>
                      )}
                      {!empty && loggedIn && (
                        <button
                          className="ghost danger"
                          disabled={charBusy}
                          onClick={() => onDeleteCharacter(ch!)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {(loggedIn || updateAvailable) && (
              <div className="panel">
                <button
                  className={playButton.className}
                  disabled={playButton.disabled || charBusy}
                  title={playButton.title}
                  onClick={onPlay}
                >
                  {playButton.mode === "update"
                    ? playButton.label
                    : busy
                      ? "Starting…"
                      : "Play with selected character"}
                </button>
              </div>
            )}
          </>
        )}

        {tab === "mods" && (
          <>
            <div className="panel">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <h2 style={{ margin: 0 }}>Mods</h2>
                <button className="secondary" disabled={modsLoading || !!modActionId} onClick={() => loadMods()}>
                  {modsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
              <p className="muted">
                Each mod is a <strong>single package archive</strong>. Download installs everything from that
                package; uninstall removes only those files. {installedCount > 0 && (
                  <span>
                    {" "}
                    · {installedCount} package{installedCount === 1 ? "" : "s"} installed
                  </span>
                )}
              </p>
              {!skyrimPath && (
                <p className="error" style={{ marginTop: 10 }}>
                  Set your Skyrim folder in Settings before installing packages.
                </p>
              )}
            </div>

            {modsLoading && modPackages.length === 0 && (
              <div className="panel">
                <p className="muted">Loading package catalog…</p>
              </div>
            )}

            {!modsLoading && modPackages.length === 0 && (
              <div className="panel">
                <p className="muted">No packages available yet.</p>
              </div>
            )}

            {modPackages.map((pkg) => {
              const installed = installedMods[pkg.id];
              const progress = modProgress[pkg.id];
              const busyThis = modActionId === pkg.id;
              const downloading =
                busyThis &&
                progress &&
                (progress.phase === "download" ||
                  progress.phase === "verify" ||
                  progress.phase === "extract" ||
                  progress.phase === "install");
              const needsUpdate =
                installed && installed.version !== pkg.version;
              const unavailable = pkg.available === false;

              return (
                <div key={pkg.id} className="panel mod-card">
                  <div className="mod-header">
                    <div className="mod-title-block">
                      <h3 className="mod-name">
                        {pkg.name}
                        {pkg.required && <span className="mod-tag required">Required</span>}
                        {installed && !needsUpdate && (
                          <span className="mod-tag installed">Installed</span>
                        )}
                        {needsUpdate && <span className="mod-tag update">Update available</span>}
                        {unavailable && <span className="mod-tag missing">Unavailable</span>}
                      </h3>
                      <div className="mod-meta">
                        v{pkg.version}
                        {installed ? ` · installed v${installed.version}` : ""}
                        {" · "}
                        {formatBytes(pkg.size)}
                        {pkg.tags && pkg.tags.length > 0
                          ? ` · ${pkg.tags.filter((t) => t !== "required").join(", ")}`
                          : ""}
                      </div>
                    </div>
                    <div className="mod-actions">
                      {installed ? (
                        <>
                          {needsUpdate && (
                            <button
                              className="primary"
                              disabled={busyThis || unavailable || !skyrimPath}
                              onClick={() => onInstallMod(pkg)}
                            >
                              {busyThis ? "Updating…" : "Update"}
                            </button>
                          )}
                          <button
                            className="ghost danger"
                            disabled={busyThis}
                            onClick={() => onUninstallMod(pkg)}
                          >
                            {busyThis && !downloading ? "Removing…" : "Uninstall"}
                          </button>
                        </>
                      ) : (
                        <button
                          className="primary"
                          disabled={busyThis || unavailable || !skyrimPath}
                          onClick={() => onInstallMod(pkg)}
                        >
                          {busyThis ? "Installing…" : "Download"}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mod-desc">{pkg.description}</p>

                  {(downloading || (progress && progress.phase === "done" && busyThis)) && (
                    <div className="progress-block">
                      <div className="progress-row">
                        <span className="progress-label">
                          {progress?.message ||
                            (progress?.phase === "download"
                              ? "Downloading…"
                              : progress?.phase === "extract"
                                ? "Extracting…"
                                : progress?.phase === "install"
                                  ? "Installing…"
                                  : "Working…")}
                        </span>
                        <span className="progress-pct">
                          {progress?.phase === "download"
                            ? `${progress.percent}%`
                            : progress?.phase === "done"
                              ? "100%"
                              : "…"}
                        </span>
                      </div>
                      <div className="progress-bar" role="progressbar" aria-valuenow={progress?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                        <div
                          className={`progress-fill${progress?.phase === "download" ? "" : " indeterminate"}`}
                          style={{
                            width:
                              progress?.phase === "download"
                                ? `${Math.max(2, progress?.percent ?? 0)}%`
                                : progress?.phase === "done"
                                  ? "100%"
                                  : "40%",
                          }}
                        />
                      </div>
                      {progress?.phase === "download" && progress.total > 0 && (
                        <div className="progress-bytes">
                          {formatBytes(progress.received)} / {formatBytes(progress.total)}
                        </div>
                      )}
                    </div>
                  )}

                  {progress?.phase === "error" && (
                    <p className="error" style={{ marginTop: 8, marginBottom: 0 }}>
                      {progress.message || "Install failed"}
                    </p>
                  )}

                  {installed && (
                    <div className="mod-install-info">
                      Installed {new Date(installed.installedAt).toLocaleString()} ·{" "}
                      {installed.files.length} file{installed.files.length === 1 ? "" : "s"} tracked for
                      clean uninstall
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === "settings" && (
          <div className="panel">
            <h2>Settings</h2>
            <p className="muted" style={{ marginBottom: 10 }}>
              Launcher version: <strong>v{appVersion || "…"}</strong>
              {updateAvailable && launcherUpdate?.latest?.version && (
                <span className="badge warn" style={{ marginLeft: 8 }}>
                  Update to v{launcherUpdate.latest.version}
                </span>
              )}
            </p>
            {updateAvailable && (
              <div className="row" style={{ marginBottom: 14 }}>
                <button
                  className="primary update-cta"
                  disabled={updateBusy}
                  onClick={onApplyUpdate}
                >
                  {updateBusy ? "Updating…" : "Update launcher"}
                </button>
                <button className="secondary" disabled={updateBusy} onClick={() => checkUpdate()}>
                  Check again
                </button>
              </div>
            )}
            <p className="muted">
              Skyrim Special Edition install folder (contains SkyrimSE.exe / skse64_loader.exe)
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" readOnly value={skyrimPath ?? ""} placeholder="Not set" />
              <button className="secondary" onClick={onPickPath}>
                Browse…
              </button>
            </div>
            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Official server</h3>
              <p className="muted" style={{ margin: 0 }}>
                Visions of Aetherius · 178.156.158.116:10000
              </p>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Play connects as a player only. Requires SKSE + Skyrim Platform, then Login with
                Discord and Play. The multiplayer client is installed automatically when you launch.
              </p>
              {apiBase && (
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.7 }}>
                  Platform: {apiBase.includes("127.0.0.1") ? "local (developer)" : "official"}
                </p>
              )}
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
              Mod packages install into this folder and are tracked so uninstall removes only package
              files.
            </p>
          </div>
        )}

        {tab === "account" && (
          <div className="panel">
            <h2>Account</h2>
            {!loggedIn ? (
              <>
                <p className="muted">Not signed in.</p>
                <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                  <button className="primary" disabled={loginBusy} onClick={onLogin}>
                    {loginBusy ? "Waiting for Discord..." : "Login with Discord"}
                  </button>
                  <button className="secondary" onClick={onDiscordSetup}>
                    Fix Discord redirect…
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 14 }}>
                  If Discord shows <strong>Invalid OAuth2 redirect_uri</strong>, open{" "}
                  <strong>Fix Discord redirect…</strong> and add this exact URL under OAuth2 →
                  Redirects, then Save:
                </p>
                <pre
                  style={{
                    marginTop: 8,
                    padding: "0.65rem 0.75rem",
                    background: "rgba(0,0,0,0.35)",
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: "auto",
                  }}
                >
                  {`voa://callback
http://127.0.0.1:47821/auth/discord/callback`}
                </pre>
              </>
            ) : (
              <>
                <div className="row">
                  {user?.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      width={48}
                      height={48}
                      style={{ borderRadius: 10 }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>{user?.username}</div>
                    <div className="muted">Profile ID {user?.profileId}</div>
                    <div className="muted">Discord {user?.discordId}</div>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="ghost" onClick={onLogout}>
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
