import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NewsPost, ServerStatus, User } from "@voa/shared";

type Tab = "home" | "characters" | "mods" | "bugs" | "admin" | "settings" | "account";

type BugReport = {
  id: number;
  title: string;
  body: string;
  category: string;
  status: string;
  launcherVersion?: string | null;
  gameVersion?: string | null;
  characterSlot?: number | null;
  characterName?: string | null;
  staffNote?: string | null;
  createdAt: string;
  updatedAt: string;
  username?: string;
  profileId?: number;
  discordId?: string;
};

type AdminCharacter = {
  characterId: number;
  userId: number;
  profileId: number;
  username: string;
  discordId: string;
  banned: boolean;
  slot: number;
  name: string;
  empty: boolean;
  actorFormId: number | null;
  worldOrCell: number | null;
  pos: number[] | null;
  lastPlayedAt: string | null;
  createdAt: string;
  hasInventory: boolean;
  hasEquipment: boolean;
  warningCount: number;
};

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
  source?: "local" | "nexus";
  nexusGame?: string;
  nexusModId?: number;
  nexusFileId?: number;
  remapSkseToData?: boolean;
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
        voaInstancePath?: string | null;
        useVoaInstance?: boolean;
        hasTokens: boolean;
        accessToken: string | null;
        refreshToken: string | null;
        musicVolume?: number;
        musicMuted?: boolean;
      }>;
      setUseVoaInstance: (enabled: boolean) => Promise<{
        ok: boolean;
        useVoaInstance: boolean;
      }>;
      rebuildInstance: () => Promise<{
        ok: boolean;
        error?: string;
        path?: string;
        hardlinked?: number;
        copied?: number;
      }>;
      getInstanceInfo: () => Promise<{
        sourcePath: string | null;
        instancePath: string | null;
        useVoaInstance: boolean;
        instanceReady: boolean;
      }>;
      onInstanceProgress: (
        cb: (p: {
          phase: string;
          current: number;
          total: number;
          percent: number;
          message?: string;
        }) => void
      ) => () => void;
      setMusicPrefs: (prefs: {
        volume?: number;
        muted?: boolean;
      }) => Promise<{ ok: boolean; musicVolume: number; musicMuted: boolean }>;
      getMusicSrc: () => Promise<{
        ok: boolean;
        src: string | null;
        error?: string;
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
        clientSource?: string;
        clientBytes?: number;
        launchMethod?: string;
        cleanedPlugins?: string[];
        mpHint?: string;
        playPath?: string;
        sourcePath?: string;
        usingInstance?: boolean;
        instanceCreated?: boolean;
      }>;
      setCharacterSlot: (slot: number) => Promise<{ ok: boolean; error?: string }>;
      getCharacters: () => Promise<{ characters?: CharacterSlot[]; error?: string }>;
      createCharacter: (p: {
        slot: number;
        name?: string;
      }) => Promise<{ ok: boolean; error?: string; character?: CharacterSlot }>;
      deleteCharacter: (id: number) => Promise<{ ok: boolean; error?: string }>;
      getBugReports: (opts?: { all?: boolean; status?: string }) => Promise<{
        reports?: BugReport[];
        admin?: boolean;
        staffRoles?: string[];
        categories?: string[];
        error?: string;
      }>;
      submitBugReport: (payload: {
        title: string;
        body: string;
        category?: string;
        characterSlot?: number | null;
        characterName?: string | null;
        gameVersion?: string;
      }) => Promise<{ ok: boolean; error?: string; report?: unknown }>;
      getSupportLogDisclaimer: () => Promise<{
        disclaimer: string;
        retentionDays: number;
        maxBytes: number;
      }>;
      uploadSupportLogs: (payload: {
        consent: boolean;
        reason?: string;
      }) => Promise<{
        ok: boolean;
        error?: string;
        id?: number;
        sizeBytes?: number;
        expiresAt?: string;
        files?: string[];
        message?: string;
      }>;
      updateBugReport: (payload: {
        id: number;
        status: string;
        staffNote?: string | null;
      }) => Promise<{ ok: boolean; error?: string; report?: unknown }>;
      deleteBugReport: (id: number) => Promise<{ ok: boolean; error?: string }>;
      getAdminCharacters: (opts?: {
        q?: string;
        includeEmpty?: boolean;
      }) => Promise<{
        ok: boolean;
        error?: string;
        characters?: AdminCharacter[];
        actions?: string[];
      }>;
      adminCharacterAction: (payload: {
        characterId: number;
        action: string;
        note?: string;
      }) => Promise<{
        ok: boolean;
        error?: string;
        action?: string;
        queued?: boolean;
        detail?: string;
      }>;
      getStaffInfo: () => Promise<{
        isStaff: boolean;
        roleLabels: string[];
        roleIds?: string[];
      }>;
      getAdminSummary: () => Promise<{
        ok: boolean;
        error?: string;
        staffRoles?: string[];
        bugs?: Record<string, number>;
        users?: number;
        characters?: number;
        server?: {
          gameOnline?: boolean;
          playersOnline?: number | null;
          maxPlayers?: number;
          maintenance?: boolean;
          message?: string;
        };
        recentBugs?: BugReport[];
      }>;
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
      installModFromZip: (payload: {
        packageId: string;
        name?: string;
        version?: string;
        remapSkseToData?: boolean;
      }) => Promise<{
        ok: boolean;
        error?: string;
        canceled?: boolean;
        installed?: InstalledMod;
      }>;
      uninstallMod: (packageId: string) => Promise<{
        ok: boolean;
        error?: string;
        removed?: number;
      }>;
      verifyMods: () => Promise<{
        ok: boolean;
        error?: string;
        packagesChecked?: number;
        packagesOk?: number;
        packagesBroken?: number;
        filesChecked?: number;
        filesMissing?: number;
        broken?: Array<{
          id: string;
          name: string;
          missing: string[];
          present: number;
          total: number;
        }>;
        message?: string;
      }>;
      uninstallAllMods: () => Promise<{
        ok: boolean;
        error?: string;
        packagesRemoved?: number;
        filesRemoved?: number;
        message?: string;
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
      windowClose: () => Promise<boolean>;
      windowMinimize: () => Promise<boolean>;
      getNexusAccount: () => Promise<{
        linked: boolean;
        user: {
          userId?: number;
          name?: string;
          isPremium?: boolean;
          isSupporter?: boolean;
        } | null;
      }>;
      openNexusLogin: () => Promise<{
        ok: boolean;
        error?: string;
        user?: {
          userId?: number;
          name?: string;
          isPremium?: boolean;
          isSupporter?: boolean;
        };
      }>;
      unlinkNexusAccount: () => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<boolean>;
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
  const [voaInstancePath, setVoaInstancePath] = useState<string | null>(null);
  const [useVoaInstance, setUseVoaInstance] = useState(true);
  const [instanceReady, setInstanceReady] = useState(false);
  const [instanceBusy, setInstanceBusy] = useState(false);
  const [instanceProgress, setInstanceProgress] = useState<{
    percent: number;
    message?: string;
  } | null>(null);
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

  // Bug reports
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [bugAdmin, setBugAdmin] = useState(false);
  const [bugBusy, setBugBusy] = useState(false);
  const [bugTitle, setBugTitle] = useState("");
  const [bugBody, setBugBody] = useState("");
  const [bugCategory, setBugCategory] = useState("multiplayer");
  const [bugSelectedId, setBugSelectedId] = useState<number | null>(null);
  const [bugStaffNote, setBugStaffNote] = useState("");
  const [bugViewAll, setBugViewAll] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [staffRoles, setStaffRoles] = useState<string[]>([]);
  // Opt-in support logs
  const [supportConsent, setSupportConsent] = useState(false);
  const [supportReason, setSupportReason] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportDisclaimer, setSupportDisclaimer] = useState("");
  const [adminSummary, setAdminSummary] = useState<{
    bugs?: Record<string, number>;
    users?: number;
    characters?: number;
    server?: {
      gameOnline?: boolean;
      playersOnline?: number | null;
      maxPlayers?: number;
      maintenance?: boolean;
      message?: string;
    };
    recentBugs?: BugReport[];
    staffRoles?: string[];
  } | null>(null);
  const [adminFilter, setAdminFilter] = useState<string>("open");
  const [adminReports, setAdminReports] = useState<BugReport[]>([]);
  const [adminCharacters, setAdminCharacters] = useState<AdminCharacter[]>([]);
  const [adminCharQ, setAdminCharQ] = useState("");
  const [adminCharSelected, setAdminCharSelected] = useState<number | null>(null);
  const [adminActionNote, setAdminActionNote] = useState("");
  const [adminCharBusy, setAdminCharBusy] = useState(false);

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
  const [nexusLinked, setNexusLinked] = useState(false);
  const [nexusUser, setNexusUser] = useState<{
    userId?: number;
    name?: string;
    isPremium?: boolean;
    isSupporter?: boolean;
  } | null>(null);
  const [nexusBusy, setNexusBusy] = useState(false);

  /** Launcher BGM — "Akatosh, Father of Time" (file:// from main process) */
  const [musicVolume, setMusicVolume] = useState(40);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicReady, setMusicReady] = useState(false);
  const [musicSrc, setMusicSrc] = useState<string | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicVolSaveTimer = useRef<number | null>(null);

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

  /** Coroutine: poll update API for new launcher UI builds. */
  const checkUpdate = useCallback(async (opts?: { quiet?: boolean }) => {
    try {
      const res = await window.voa.checkLauncherUpdate();
      setAppVersion(res.currentVersion || "");
      const next = {
        currentVersion: res.currentVersion,
        updateAvailable: Boolean(res.updateAvailable),
        forced: res.forced,
        latest: res.latest ?? null,
      };
      setLauncherUpdate(next);
      if (!opts?.quiet && next.updateAvailable && next.latest?.version) {
        setInfo(
          `Launcher update available: v${next.currentVersion || "?"} → v${next.latest.version}` +
            (next.latest.notes ? ` — ${next.latest.notes}` : "") +
            " (Play button becomes Update, or use Settings → Update launcher)"
        );
      }
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
    // Refresh staff Admin tab (roles cached at Discord login on API)
    void window.voa.getStaffInfo().then((s) => {
      setIsStaff(Boolean(s.isStaff));
      setStaffRoles(s.roleLabels || []);
      if (s.isStaff) {
        setInfo(
          `Logged in as ${(payload.user as User)?.username || "Discord user"}` +
            (s.roleLabels?.length ? ` · Staff: ${s.roleLabels.join(", ")}` : "")
        );
      }
    });
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
      setVoaInstancePath(store.voaInstancePath ?? null);
      setUseVoaInstance(store.useVoaInstance !== false);
      try {
        const info = await window.voa.getInstanceInfo();
        setVoaInstancePath(info.instancePath);
        setUseVoaInstance(info.useVoaInstance);
        setInstanceReady(info.instanceReady);
      } catch {
        /* ignore */
      }
      if (typeof store.musicVolume === "number") {
        setMusicVolume(Math.max(0, Math.min(100, store.musicVolume)));
      }
      if (typeof store.musicMuted === "boolean") {
        setMusicMuted(store.musicMuted);
      }
      await loadPublic();
      await checkUpdate();
    })();

    const off = window.voa.onAuthUpdated((payload: any) => {
      applyAuth(payload);
    });
    const offInst = window.voa.onInstanceProgress?.((p) => {
      setInstanceProgress({
        percent: p.percent,
        message: p.message,
      });
      if (p.phase === "clone" || p.phase === "scan") {
        setInstanceBusy(true);
        setInfo(p.message || "Preparing VOA game folder…");
      }
      if (p.phase === "done") {
        setInstanceBusy(false);
        setInstanceReady(true);
        setInstanceProgress(null);
      }
      if (p.phase === "error") {
        setInstanceBusy(false);
        setInstanceProgress(null);
      }
    });
    return () => {
      off();
      offInst?.();
    };
  }, [loadPublic, applyAuth, checkUpdate]);

  // Resolve BGM path from main (extraResources file:// — works packaged)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.voa.getMusicSrc();
        if (cancelled) return;
        if (res.ok && res.src) {
          setMusicSrc(res.src);
          setMusicError(null);
        } else {
          setMusicError(res.error || "Music file missing");
        }
      } catch (e: any) {
        if (!cancelled) setMusicError(e?.message || "Could not load music path");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tryPlayMusic = useCallback(() => {
    const el = musicRef.current;
    if (!el || musicMuted) return;
    el.volume = Math.max(0, Math.min(1, musicVolume / 100));
    el.muted = false;
    if (el.paused) {
      void el.play().catch(() => {
        /* still blocked — next gesture retries */
      });
    }
  }, [musicMuted, musicVolume]);

  // Apply mute/volume + attempt play when ready
  useEffect(() => {
    const el = musicRef.current;
    if (!el || !musicSrc) return;
    el.volume = Math.max(0, Math.min(1, musicVolume / 100));
    el.muted = musicMuted;
    if (!musicMuted) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [musicVolume, musicMuted, musicReady, musicSrc]);

  // Retry play on any early interaction (title-bar buttons, nav, etc.)
  useEffect(() => {
    const onGesture = () => tryPlayMusic();
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    return () => {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
  }, [tryPlayMusic]);

  const persistMusicPrefs = useCallback(
    (next: { volume?: number; muted?: boolean }) => {
      void window.voa.setMusicPrefs(next).catch(() => {
        /* ignore offline store write */
      });
    },
    []
  );

  const onToggleMusicMute = () => {
    setMusicMuted((prev) => {
      const next = !prev;
      persistMusicPrefs({ muted: next });
      // Unmute is a user gesture — start BGM immediately
      if (!next) {
        queueMicrotask(() => {
          const el = musicRef.current;
          if (el) {
            el.muted = false;
            el.volume = Math.max(0, Math.min(1, musicVolume / 100));
            void el.play().catch(() => {});
          }
        });
      } else {
        musicRef.current?.pause();
      }
      return next;
    });
  };

  const onMusicVolumeChange = (value: number) => {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    setMusicVolume(v);
    if (v > 0 && musicMuted) {
      setMusicMuted(false);
      persistMusicPrefs({ volume: v, muted: false });
    } else {
      if (musicVolSaveTimer.current != null) {
        window.clearTimeout(musicVolSaveTimer.current);
      }
      musicVolSaveTimer.current = window.setTimeout(() => {
        persistMusicPrefs({ volume: v });
      }, 180);
    }
    if (v > 0) {
      queueMicrotask(() => {
        const el = musicRef.current;
        if (!el) return;
        el.muted = false;
        el.volume = Math.max(0, Math.min(1, v / 100));
        void el.play().catch(() => {});
      });
    }
  };

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

  // Live status every 10s; launcher UI update coroutine every 2 min (+ on focus)
  useEffect(() => {
    const id = window.setInterval(() => {
      loadPublic({ quiet: true });
    }, 10_000);
    const id2 = window.setInterval(() => {
      void checkUpdate({ quiet: true });
    }, 2 * 60_000);
    const onFocus = () => {
      void checkUpdate({ quiet: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    return () => {
      window.clearInterval(id);
      window.clearInterval(id2);
      window.removeEventListener("focus", onFocus);
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

  const loadNexusAccount = useCallback(async () => {
    try {
      const res = await window.voa.getNexusAccount();
      setNexusLinked(Boolean(res.linked));
      setNexusUser(res.user || null);
    } catch {
      setNexusLinked(false);
      setNexusUser(null);
    }
  }, []);

  const loadBugReports = useCallback(async () => {
    if (!loggedIn) {
      setBugReports([]);
      setBugAdmin(false);
      return;
    }
    try {
      const res = await window.voa.getBugReports({ all: bugViewAll });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBugReports(res.reports || []);
      setBugAdmin(Boolean(res.admin));
      if (res.staffRoles?.length) setStaffRoles(res.staffRoles);
      if (res.admin) setIsStaff(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [loggedIn, bugViewAll]);

  const loadStaffInfo = useCallback(async () => {
    if (!loggedIn) {
      setIsStaff(false);
      setStaffRoles([]);
      return;
    }
    try {
      const res = await window.voa.getStaffInfo();
      setIsStaff(Boolean(res.isStaff));
      setStaffRoles(res.roleLabels || []);
    } catch {
      setIsStaff(false);
      setStaffRoles([]);
    }
  }, [loggedIn]);

  const loadAdminPanel = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const [sum, reports, chars] = await Promise.all([
        window.voa.getAdminSummary(),
        window.voa.getBugReports({ all: true, status: adminFilter }),
        window.voa.getAdminCharacters({ q: adminCharQ || undefined }),
      ]);
      if (!sum.ok) {
        if (sum.error) setError(sum.error);
        setAdminSummary(null);
        return;
      }
      setIsStaff(true);
      setAdminSummary({
        bugs: sum.bugs,
        users: sum.users,
        characters: sum.characters,
        server: sum.server,
        recentBugs: (sum.recentBugs as BugReport[]) || [],
        staffRoles: sum.staffRoles,
      });
      if (sum.staffRoles?.length) setStaffRoles(sum.staffRoles);
      setAdminReports(reports.reports || []);
      setBugAdmin(Boolean(reports.admin));
      if (chars.ok) setAdminCharacters(chars.characters || []);
      else if (chars.error) setError(chars.error);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [loggedIn, adminFilter, adminCharQ]);

  // Load mods / characters / Nexus / bugs / admin when opening tabs
  useEffect(() => {
    if (tab === "mods") {
      loadMods();
    }
    if (tab === "characters" || tab === "home") {
      loadCharacters();
    }
    if (tab === "bugs") {
      void loadBugReports();
    }
    if (tab === "admin") {
      void loadAdminPanel();
    }
    if (tab === "account") {
      void loadNexusAccount();
    }
  }, [tab, loadMods, loadCharacters, loadNexusAccount, loadBugReports, loadAdminPanel]);

  // Refresh staff badge when login changes
  useEffect(() => {
    void loadStaffInfo();
  }, [loadStaffInfo]);

  useEffect(() => {
    void loadNexusAccount();
  }, [loadNexusAccount]);

  const onNexusLogin = async () => {
    setError(null);
    setInfo(null);
    setNexusBusy(true);
    try {
      setInfo("Opening browser for Nexus Mods login…");
      const res = await window.voa.openNexusLogin();
      if (!res.ok) throw new Error(res.error || "Nexus login failed");
      setNexusLinked(true);
      setNexusUser(res.user || null);
      setInfo(
        `Logged in to Nexus as ${res.user?.name || "user"}` +
          (res.user?.isPremium ? " (Premium)" : " (Free)") +
          ". Address Library downloads use your Nexus session."
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setNexusBusy(false);
    }
  };

  const onUnlinkNexus = async () => {
    setNexusBusy(true);
    try {
      await window.voa.unlinkNexusAccount();
      setNexusLinked(false);
      setNexusUser(null);
      setInfo("Logged out of Nexus Mods");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setNexusBusy(false);
    }
  };

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
        try {
          const s = await window.voa.getStaffInfo();
          setIsStaff(Boolean(s.isStaff));
          setStaffRoles(s.roleLabels || []);
          if (s.isStaff) {
            setInfo(
              `Logged in as ${store.user.username}` +
                (s.roleLabels?.length ? ` · Staff: ${s.roleLabels.join(", ")}` : "")
            );
          }
        } catch {
          /* ignore */
        }
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
    setIsStaff(false);
    setStaffRoles([]);
    setAdminSummary(null);
    setAdminReports([]);
    setBugAdmin(false);
    if (tab === "admin") setTab("home");
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
    setInfo(
      "Skyrim folder saved. Visions of Aetherius will use its own separate game folder so your main install stays as-is."
    );
    try {
      const info = await window.voa.getInstanceInfo();
      setVoaInstancePath(info.instancePath);
      setInstanceReady(info.instanceReady);
    } catch {
      /* ignore */
    }
  };

  const onToggleInstance = async (enabled: boolean) => {
    setUseVoaInstance(enabled);
    await window.voa.setUseVoaInstance(enabled);
    setInfo(
      enabled
        ? "Separate game folder enabled — recommended so VOA files stay out of your main Skyrim install."
        : "Warning: VOA will install files into your main Skyrim folder again."
    );
  };

  const onRebuildInstance = async () => {
    setError(null);
    setInstanceBusy(true);
    setInstanceProgress({ percent: 0, message: "Rebuilding VOA game folder…" });
    try {
      const res = await window.voa.rebuildInstance();
      if (!res.ok) throw new Error(res.error || "Rebuild failed");
      setVoaInstancePath(res.path || null);
      setInstanceReady(true);
      setInfo(
        `VOA game folder ready: ${res.path}` +
          (res.hardlinked != null
            ? ` (${res.hardlinked} hardlinks, ${res.copied ?? 0} copies)`
            : "")
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setInstanceBusy(false);
      setInstanceProgress(null);
    }
  };

  const loadSupportDisclaimer = useCallback(async () => {
    try {
      if (!window.voa.getSupportLogDisclaimer) return;
      const d = await window.voa.getSupportLogDisclaimer();
      if (d?.disclaimer) setSupportDisclaimer(d.disclaimer);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (tab === "settings") void loadSupportDisclaimer();
  }, [tab, loadSupportDisclaimer]);

  const onUploadSupportLogs = async () => {
    setError(null);
    setInfo(null);
    if (!accessToken) {
      setError("Log in with Discord before uploading support logs.");
      return;
    }
    if (!supportConsent) {
      setError("Check “I understand and consent” after reading the disclaimer.");
      return;
    }
    setSupportBusy(true);
    try {
      const res = await window.voa.uploadSupportLogs({
        consent: true,
        reason: supportReason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error || "Upload failed");
      setSupportConsent(false);
      setSupportReason("");
      setInfo(
        `Support log uploaded (#${res.id ?? "?"}, ${formatBytes(res.sizeBytes || 0)}). ` +
          (res.expiresAt
            ? `Staff can use it until ${new Date(res.expiresAt).toLocaleDateString()}. `
            : "") +
          (res.files?.length ? `Included: ${res.files.join(", ")}.` : "")
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSupportBusy(false);
    }
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
      const how = playRes.launchMethod ? ` [${playRes.launchMethod}]` : "";
      const cleaned =
        playRes.cleanedPlugins && playRes.cleanedPlugins.length
          ? ` Moved junk scripts out of Plugins: ${playRes.cleanedPlugins.slice(0, 5).join(", ")}.`
          : "";
      const instNote = playRes.usingInstance
        ? ` Isolated VOA folder${playRes.instanceCreated ? " (built)" : ""}: ${playRes.playPath || "…"}`
        : " (direct base folder)";
      setInfo(
        `Game started as ${charName} (slot ${selectedSlot + 1}) → ${playRes.serverIp}:${playRes.serverPort}${how}. ` +
          `Client ${playRes.clientSource || "?"} ${playRes.clientBytes || 0}b.${cleaned}${instNote}. ` +
          (playRes.mpHint ||
            "SP console should show: Hello Multiplayer → Connecting to server → Logging in.")
      );
      if (playRes.playPath) {
        setVoaInstancePath(playRes.playPath);
        setInstanceReady(true);
      }
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
        ? "Connect: write VPS session + launch SKSE multiplayer"
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

  const onSubmitBug = async () => {
    if (!loggedIn) {
      setError("Log in with Discord to submit a bug report");
      setTab("account");
      return;
    }
    setBugBusy(true);
    setError(null);
    setInfo(null);
    try {
      const ch = characters.find((c) => c.slot === selectedSlot && !c.empty);
      const res = await window.voa.submitBugReport({
        title: bugTitle,
        body: bugBody,
        category: bugCategory,
        characterSlot: selectedSlot,
        characterName: ch?.name || null,
      });
      if (!res.ok) throw new Error(res.error || "Submit failed");
      setBugTitle("");
      setBugBody("");
      setInfo("Bug report submitted. Thank you — staff can review it in the launcher.");
      await loadBugReports();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBugBusy(false);
    }
  };

  const onUpdateBugStatus = async (id: number, status: string) => {
    setBugBusy(true);
    setError(null);
    try {
      const res = await window.voa.updateBugReport({
        id,
        status,
        staffNote: bugStaffNote.trim() || null,
      });
      if (!res.ok) throw new Error(res.error || "Update failed");
      setInfo(`Report #${id} → ${status}`);
      await loadBugReports();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBugBusy(false);
    }
  };

  const onDeleteBugReport = async (id: number) => {
    if (!confirm(`Permanently delete bug report #${id}?`)) return;
    setBugBusy(true);
    setError(null);
    try {
      const res = await window.voa.deleteBugReport(id);
      if (!res.ok) throw new Error(res.error || "Delete failed");
      setInfo(`Deleted bug report #${id}`);
      setBugSelectedId(null);
      await loadAdminPanel();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBugBusy(false);
    }
  };

  const onAdminCharAction = async (characterId: number, action: string) => {
    const labels: Record<string, string> = {
      ban: "BAN this account",
      unban: "unban this account",
      warn: "WARN this player",
      delete_character: "DELETE this character (world wipe)",
      wipe_inventory: "wipe inventory",
      wipe_equipment: "wipe equipment + inventory",
      wipe_spells: "wipe spells",
      wipe_map_markers: "wipe map markers",
      reset_position: "reset saved position",
    };
    const label = labels[action] || action;
    if (action === "warn" && !adminActionNote.trim()) {
      setError("Warn requires a staff note");
      return;
    }
    if (!confirm(`Confirm: ${label}?`)) return;
    setAdminCharBusy(true);
    setError(null);
    try {
      const res = await window.voa.adminCharacterAction({
        characterId,
        action,
        note: adminActionNote.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error || "Action failed");
      setInfo(res.detail || `${action} ok`);
      setAdminActionNote("");
      await loadAdminPanel();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setAdminCharBusy(false);
    }
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
    if (!confirm(`Delete character "${ch.name}" in slot ${ch.slot + 1}? This clears the slot and permanently removes the world character (name, position, gear, inventory) on the server.`)) {
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

  const isNexusPackage = (pkg: CatalogPackage) =>
    pkg.source === "nexus" || Boolean(pkg.nexusModId && pkg.nexusFileId);

  /** TEMP until Nexus OAuth app is approved: user downloads zip in browser, we install it. */
  const onInstallModFromZip = async (pkg: CatalogPackage) => {
    setError(null);
    setInfo(null);
    if (!skyrimPath) {
      setError("Set your Skyrim SE folder in Settings first");
      setTab("settings");
      return;
    }
    setModActionId(pkg.id);
    try {
      const res = await window.voa.installModFromZip({
        packageId: pkg.id,
        name: pkg.name,
        version: pkg.version,
        remapSkseToData: true,
      });
      if (res.canceled) {
        setInfo("Install canceled");
        return;
      }
      if (!res.ok) throw new Error(res.error || "Install from zip failed");
      if (res.installed) {
        setInstalledMods((prev) => ({ ...prev, [pkg.id]: res.installed! }));
      }
      setInfo(
        `Installed ${pkg.name} from local zip (${res.installed?.files.length ?? 0} files). Temp path until Nexus app OAuth is approved.`
      );
      await loadMods({ quiet: true });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setModActionId(null);
    }
  };

  const openAddressLibraryNexusPage = () => {
    void window.voa.openExternal(
      "https://www.nexusmods.com/skyrimspecialedition/mods/32444?tab=files"
    );
  };

  const onInstallMod = async (pkg: CatalogPackage, opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setError(null);
      setInfo(null);
    }
    if (!skyrimPath) {
      setError("Set your Skyrim SE folder in Settings before installing mods");
      setTab("settings");
      return false;
    }
    if (isNexusPackage(pkg) && !nexusLinked) {
      const msg =
        "Log in to Nexus Mods under Account (browser login, like Discord) to download this package. VOA does not proxy Nexus files.";
      if (!opts?.quiet) {
        setError(msg);
        setTab("account");
      } else {
        throw new Error(msg);
      }
      return false;
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
      if (!opts?.quiet) {
        setInfo(
          `Installed ${pkg.name} v${pkg.version} (${res.installed?.files.length ?? 0} files)`
        );
        await loadMods({ quiet: true });
      }
      return true;
    } catch (e: any) {
      if (!opts?.quiet) setError(e?.message || String(e));
      else throw e;
      return false;
    } finally {
      if (!opts?.quiet) setModActionId(null);
    }
  };

  /** Install missing packages and update outdated ones (skips unavailable). */
  const onDownloadAllMods = async () => {
    setError(null);
    setInfo(null);
    if (!skyrimPath) {
      setError("Set your Skyrim SE folder in Settings before installing mods");
      setTab("settings");
      return;
    }
    const needsNexusLink = modPackages.some((pkg) => {
      if (!isNexusPackage(pkg)) return false;
      if (pkg.available === false) return false;
      const installed = installedMods[pkg.id];
      if (!installed) return true;
      return installed.version !== pkg.version;
    });
    if (needsNexusLink && !nexusLinked) {
      setError(
        "Some packages (e.g. Address Library) need a Nexus Mods login. Open Account → Log in with Nexus, then run Download All again."
      );
      setTab("account");
      return;
    }
    const queue = modPackages.filter((pkg) => {
      if (pkg.available === false) return false;
      if (isNexusPackage(pkg) && !nexusLinked) return false;
      const installed = installedMods[pkg.id];
      if (!installed) return true;
      return installed.version !== pkg.version;
    });
    if (queue.length === 0) {
      setInfo("All available packages are already installed and up to date.");
      return;
    }
    let ok = 0;
    const failures: string[] = [];
    try {
      for (const pkg of queue) {
        try {
          const success = await onInstallMod(pkg, { quiet: true });
          if (success) ok += 1;
          else failures.push(`${pkg.name}: failed`);
        } catch (e: any) {
          failures.push(`${pkg.name}: ${e?.message || String(e)}`);
        }
      }
      await loadMods({ quiet: true });
      const parts = [
        `Download All finished: ${ok}/${queue.length} package(s) installed or updated.`,
      ];
      if (failures.length) {
        setError(failures.join(" · "));
        parts.push(`${failures.length} failed.`);
      }
      setInfo(parts.join(" "));
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

  const onVerifyMods = async () => {
    setError(null);
    setInfo(null);
    if (!skyrimPath) {
      setError("Set your base Skyrim folder in Settings first");
      setTab("settings");
      return;
    }
    setModActionId("__verify__");
    try {
      const res = await window.voa.verifyMods();
      if (!res.ok) throw new Error(res.error || "Verify failed");
      if (res.packagesBroken && res.packagesBroken > 0 && res.broken?.length) {
        const names = res.broken
          .slice(0, 5)
          .map((b) => `${b.name} (${b.missing.length} missing)`)
          .join(", ");
        setError(
          `${res.message || "Some packages are incomplete."} Broken: ${names}` +
            (res.broken.length > 5 ? "…" : "") +
            " — use Download All or reinstall those packages."
        );
      } else {
        setInfo(res.message || "All package files verified.");
      }
      await loadMods({ quiet: true });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setModActionId(null);
    }
  };

  const onUninstallAllMods = async () => {
    setError(null);
    setInfo(null);
    if (!skyrimPath) {
      setError("Set your base Skyrim folder in Settings first");
      setTab("settings");
      return;
    }
    const n = Object.keys(installedMods).length;
    if (n === 0) {
      setInfo("No VOA packages installed.");
      return;
    }
    const ok = window.confirm(
      `Uninstall all ${n} Visions of Aetherius package(s)?\n\nOnly files the launcher installed into the VOA game folder are removed. Your main Skyrim install is left alone.`
    );
    if (!ok) return;
    setModActionId("__uninstall_all__");
    try {
      const res = await window.voa.uninstallAllMods();
      if (!res.ok) throw new Error(res.error || "Uninstall all failed");
      setInstalledMods({});
      setModProgress({});
      setInfo(
        res.message ||
          `Uninstalled ${res.packagesRemoved ?? n} package(s) (${res.filesRemoved ?? 0} files).`
      );
      await loadMods({ quiet: true });
    } catch (e: any) {
      setError(e?.message || String(e));
      await loadMods({ quiet: true });
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
      {/* Full-window cosmic background + animated magic VFX */}
      <div className="bg-stage" aria-hidden>
        <div className="bg-art" />
        <div className="bg-vignette" />
        <div className="magic-vfx">
          <div className="magic-glow magic-glow-a" />
          <div className="magic-glow magic-glow-b" />
          <div className="magic-glow magic-glow-c" />
          <div className="magic-ring magic-ring-outer" />
          <div className="magic-ring magic-ring-inner" />
          <div className="magic-beam" />
          <div className="magic-sparks">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className={`spark spark-${i + 1}`} />
            ))}
          </div>
          <div className="magic-dust">
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i} className={`dust dust-${i + 1}`} />
            ))}
          </div>
        </div>
      </div>
      {/* BGM: Akatosh — src is file:// from main (resources/music/), not /music absolute */}
      {musicSrc ? (
        <audio
          ref={musicRef}
          className="launcher-bgm"
          loop
          autoPlay
          preload="auto"
          src={musicSrc}
          onLoadedData={() => {
            setMusicReady(true);
            tryPlayMusic();
          }}
          onCanPlayThrough={() => {
            setMusicReady(true);
            tryPlayMusic();
          }}
          onPlay={() => setMusicReady(true)}
          onError={() => {
            setMusicReady(false);
            setMusicError("Could not decode/play music file");
          }}
        />
      ) : null}
      <div className="window-chrome" aria-label="Window controls">
        <div className="window-drag-strip" />
        <div
          className="window-audio"
          aria-label="Launcher music"
          title={
            musicError
              ? musicError
              : musicReady
                ? "Akatosh, Father of Time"
                : musicSrc
                  ? "Launcher music (loading…)"
                  : "Launcher music (resolving…)"
          }
        >
          <button
            type="button"
            className={`window-btn window-btn-audio${musicMuted || musicVolume === 0 ? " is-muted" : ""}`}
            title={musicMuted || musicVolume === 0 ? "Unmute music" : "Mute music"}
            aria-pressed={musicMuted || musicVolume === 0}
            onClick={onToggleMusicMute}
          >
            {musicMuted || musicVolume === 0 ? (
              <span className="audio-icon" aria-hidden>
                🔇
              </span>
            ) : musicVolume < 40 ? (
              <span className="audio-icon" aria-hidden>
                🔈
              </span>
            ) : (
              <span className="audio-icon" aria-hidden>
                🔊
              </span>
            )}
          </button>
          <input
            type="range"
            className="window-volume"
            min={0}
            max={100}
            step={1}
            value={musicMuted ? 0 : musicVolume}
            aria-label="Music volume"
            title={`Volume ${musicMuted ? 0 : musicVolume}%`}
            onChange={(e) => onMusicVolumeChange(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="window-btn window-btn-min"
          title="Minimize"
          onClick={() => void window.voa.windowMinimize()}
        >
          −
        </button>
        <button
          type="button"
          className="window-btn window-btn-close"
          title="Close launcher"
          onClick={() => void window.voa.windowClose()}
        >
          ×
        </button>
      </div>
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
          <button className={tab === "bugs" ? "active" : ""} onClick={() => setTab("bugs")}>
            Bug Reports
          </button>
          {isStaff && (
            <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
              Admin
            </button>
          )}
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
                <div className="row" style={{ gap: 8, margin: 0 }}>
                  <button
                    className="primary"
                    disabled={
                      modsLoading ||
                      !!modActionId ||
                      !skyrimPath ||
                      modPackages.length === 0
                    }
                    title={
                      !skyrimPath
                        ? "Set your Skyrim folder in Settings first"
                        : "Download missing packages and update installed ones"
                    }
                    onClick={() => onDownloadAllMods()}
                  >
                    {modActionId && modActionId !== "__verify__" && modActionId !== "__uninstall_all__"
                      ? "Working…"
                      : "Download All"}
                  </button>
                  <button
                    className="secondary"
                    disabled={modsLoading || !!modActionId || !skyrimPath}
                    title="Check that every installed package file still exists in the VOA game folder"
                    onClick={() => void onVerifyMods()}
                  >
                    {modActionId === "__verify__" ? "Verifying…" : "Verify Files"}
                  </button>
                  <button
                    className="secondary"
                    disabled={modsLoading || !!modActionId}
                    onClick={() => loadMods()}
                  >
                    {modsLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </div>
              <p className="muted">
                Each mod is a <strong>single package archive</strong>. Download installs everything from that
                package; uninstall removes only those files.{" "}
                <strong>Download All</strong> installs missing packages and updates outdated ones.{" "}
                <strong>Verify Files</strong> checks that tracked package files still exist on disk. Nexus
                packages (Address Library) use <strong>your</strong> Nexus browser login (Free/Premium) — not
                the VOA server.{" "}
                {installedCount > 0 && (
                  <span>
                    · {installedCount} package{installedCount === 1 ? "" : "s"} installed
                  </span>
                )}
              </p>
              {!skyrimPath && (
                <p className="error" style={{ marginTop: 10 }}>
                  Set your Skyrim folder in Settings before installing packages.
                </p>
              )}
              {modPackages.some((p) => p.source === "nexus" || p.id === "address-library-ae") && (
                <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                  <strong>Temp (Nexus app pending approval):</strong> download Address Library{" "}
                  <em>All in one</em> zip in your browser, then use <strong>Install from ZIP</strong> on that
                  package. Nexus in-launcher login will return after VOA is registered as an OAuth client.
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
              const fromNexus =
                isNexusPackage(pkg) || pkg.id === "address-library-ae";
              const needsNexus = fromNexus && !nexusLinked;
              // Local VOA packages need the CDN archive; Nexus can use ZIP install as temp path.
              const unavailable = !fromNexus && pkg.available === false;
              const downloadLabel = busyThis
                ? "Installing…"
                : fromNexus && !nexusLinked
                  ? "Install from ZIP"
                  : "Download";

              return (
                <div key={pkg.id} className="panel mod-card">
                  <div className="mod-header">
                    <div className="mod-title-block">
                      <h3 className="mod-name">
                        {pkg.name}
                        {pkg.required && <span className="mod-tag required">Required</span>}
                        {fromNexus && <span className="mod-tag">Nexus</span>}
                        {installed && !needsUpdate && (
                          <span className="mod-tag installed">Installed</span>
                        )}
                        {needsUpdate && <span className="mod-tag update">Update available</span>}
                        {pkg.available === false && !fromNexus && (
                          <span className="mod-tag missing">Unavailable</span>
                        )}
                        {fromNexus && !nexusLinked && (
                          <span className="mod-tag missing">Manual ZIP (temp)</span>
                        )}
                      </h3>
                      <div className="mod-meta">
                        v{pkg.version}
                        {installed ? ` · installed v${installed.version}` : ""}
                        {" · "}
                        {formatBytes(pkg.size)}
                        {fromNexus
                          ? nexusLinked
                            ? ` · your Nexus (${nexusUser?.isPremium ? "Premium" : "Free"})`
                            : " · temp: browser download → Install from ZIP"
                          : ""}
                        {pkg.tags && pkg.tags.length > 0
                          ? ` · ${pkg.tags.filter((t) => t !== "required" && t !== "nexus").join(", ")}`
                          : ""}
                      </div>
                    </div>
                    <div className="mod-actions">
                      {fromNexus && (
                        <>
                          <button
                            className="ghost"
                            type="button"
                            disabled={busyThis}
                            onClick={openAddressLibraryNexusPage}
                            title="Open Nexus Files tab in browser"
                          >
                            Open Nexus
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={busyThis || !skyrimPath}
                            onClick={() => onInstallModFromZip(pkg)}
                          >
                            {busyThis ? "Installing…" : "Install from ZIP"}
                          </button>
                        </>
                      )}
                      {installed ? (
                        <>
                          {needsUpdate && !fromNexus && (
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
                      ) : !fromNexus ? (
                        <button
                          className="primary"
                          disabled={busyThis || unavailable || !skyrimPath}
                          onClick={() => onInstallMod(pkg)}
                        >
                          {downloadLabel}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="mod-desc">{pkg.description}</p>
                  {fromNexus && (
                    <p className="muted" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                      {nexusLinked
                        ? "Nexus OAuth linked — Download can use your session when the VOA client is approved."
                        : "Workaround: 1) Open Nexus → Files → download “All in one (all game versions)”. 2) Install from ZIP and pick that file. No rehost on VOA servers."}
                    </p>
                  )}

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
              <strong>Your Skyrim install</strong> — the folder that already has SkyrimSE.exe.
              When the separate VOA folder is enabled, we only use this as a source and leave it alone.
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" readOnly value={skyrimPath ?? ""} placeholder="Not set" />
              <button className="secondary" onClick={onPickPath}>
                Browse…
              </button>
            </div>

            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>VOA game folder</h3>
              <p className="muted" style={{ margin: "0 0 10px" }}>
                Play and Mods use a dedicated multiplayer-safe copy (vanilla game files + SKSE essentials).
                Extra single-player mods from your main install are not included — that avoids crashes.
              </p>
              <label
                className="row"
                style={{ gap: 8, alignItems: "center", marginBottom: 10, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={useVoaInstance}
                  disabled={instanceBusy}
                  onChange={(e) => void onToggleInstance(e.target.checked)}
                />
                <span>Use a separate VOA game folder (recommended)</span>
              </label>
              <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>
                Status {instanceReady ? "· ready" : "· created automatically on first Play"}
              </p>
              <input
                className="input"
                readOnly
                value={voaInstancePath ?? ""}
                placeholder="Created next to your Skyrim install"
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="secondary"
                  disabled={!skyrimPath || instanceBusy}
                  onClick={() => void onRebuildInstance()}
                >
                  {instanceBusy ? "Building…" : "Rebuild VOA game folder (vanilla)"}
                </button>
              </div>
              {(instanceBusy || instanceProgress) && (
                <div className="progress-block" style={{ marginTop: 10 }}>
                  <div className="progress-bar" role="progressbar">
                    <div
                      className="progress-fill"
                      style={{ width: `${instanceProgress?.percent ?? 0}%` }}
                    />
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                    {instanceProgress?.message || "Working…"}
                  </p>
                </div>
              )}
            </div>

            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Official server</h3>
              <p className="muted" style={{ margin: 0 }}>
                Visions of Aetherius · 178.156.158.116:10000
              </p>
              <p className="muted" style={{ margin: "8px 0 0" }}>
                Play prepares the VOA game folder, installs the multiplayer client there, and starts
                the game with SKSE.
              </p>
              {apiBase && (
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.7 }}>
                  Platform: {apiBase.includes("127.0.0.1") ? "local (developer)" : "official"}
                </p>
              )}
            </div>

            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Support logs (opt-in)</h3>
              <p className="muted" style={{ margin: "0 0 10px" }}>
                Optional. Only upload if staff asks, or you want help with a crash / multiplayer issue.
                Nothing is sent until you consent and click Upload.
              </p>
              <textarea
                className="input"
                readOnly
                value={
                  supportDisclaimer ||
                  "Loading disclaimer… (rebuild launcher if this stays empty)"
                }
                rows={12}
                style={{
                  width: "100%",
                  fontSize: 12,
                  lineHeight: 1.4,
                  resize: "vertical",
                  fontFamily: "ui-monospace, Consolas, monospace",
                }}
              />
              <input
                className="input"
                style={{ marginTop: 10, width: "100%" }}
                value={supportReason}
                onChange={(e) => setSupportReason(e.target.value)}
                placeholder="Optional: short reason (e.g. crash on door, no SP console)"
                maxLength={200}
                disabled={supportBusy}
              />
              <label
                className="row"
                style={{
                  gap: 8,
                  alignItems: "flex-start",
                  marginTop: 12,
                  cursor: accessToken ? "pointer" : "not-allowed",
                  opacity: accessToken ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={supportConsent}
                  disabled={!accessToken || supportBusy}
                  onChange={(e) => setSupportConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 13 }}>
                  <strong>I understand and consent</strong> to uploading redacted diagnostic logs to
                  VOA staff for support, under the notice above. This is voluntary.
                </span>
              </label>
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  className="primary"
                  disabled={!accessToken || !supportConsent || supportBusy}
                  onClick={() => void onUploadSupportLogs()}
                >
                  {supportBusy ? "Uploading…" : "Upload support logs"}
                </button>
              </div>
              {!accessToken && (
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                  Discord login required so staff know who sent the log.
                </p>
              )}
            </div>

            <p className="muted" style={{ marginTop: 14 }}>
              Mod packages install into the <strong>VOA game folder</strong> and are tracked so
              uninstall only removes what this launcher added.
            </p>

            <div className="panel" style={{ marginTop: 16, padding: 12 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Danger zone</h3>
              <p className="muted" style={{ margin: "0 0 10px" }}>
                Remove every package this launcher installed into the VOA game folder. Your main
                Skyrim install is not changed.
              </p>
              <button
                className="ghost danger"
                disabled={!!modActionId || installedCount === 0}
                title={
                  installedCount === 0
                    ? "No packages installed"
                    : `Uninstall all ${installedCount} tracked package(s)`
                }
                onClick={() => void onUninstallAllMods()}
              >
                {modActionId === "__uninstall_all__"
                  ? "Uninstalling…"
                  : `Uninstall All (${installedCount})`}
              </button>
            </div>
          </div>
        )}

        {tab === "admin" && (
          <>
            {!loggedIn || !isStaff ? (
              <div className="panel">
                <h2>Admin</h2>
                <p className="muted">
                  Staff only. Requires Discord roles: <strong>Founder</strong>,{" "}
                  <strong>Senior Gamemaster</strong>, or <strong>Gamemaster</strong> in the VOA
                  community server. Log in again after roles are assigned.
                </p>
              </div>
            ) : (
              <>
                <div className="panel">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>Staff dashboard</h2>
                    <button className="ghost" type="button" onClick={() => void loadAdminPanel()}>
                      Refresh
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>
                    Access via Discord roles
                    {staffRoles.length ? `: ${staffRoles.join(", ")}` : ""}.
                  </p>
                  <div
                    className="row"
                    style={{
                      marginTop: 14,
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {[
                      { label: "Open bugs", value: adminSummary?.bugs?.open ?? "—" },
                      { label: "In progress", value: adminSummary?.bugs?.in_progress ?? "—" },
                      { label: "Resolved", value: adminSummary?.bugs?.resolved ?? "—" },
                      { label: "Total reports", value: adminSummary?.bugs?.total ?? "—" },
                      { label: "Accounts", value: adminSummary?.users ?? "—" },
                      { label: "Characters", value: adminSummary?.characters ?? "—" },
                      {
                        label: "Players online",
                        value:
                          adminSummary?.server?.playersOnline == null
                            ? "—"
                            : `${adminSummary.server.playersOnline}/${adminSummary.server.maxPlayers ?? 50}`,
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        style={{
                          minWidth: 120,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "rgba(0,0,0,0.25)",
                        }}
                      >
                        <div className="muted" style={{ fontSize: 11 }}>
                          {card.label}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{card.value}</div>
                      </div>
                    ))}
                  </div>
                  {adminSummary?.server?.maintenance && (
                    <p style={{ color: "var(--bad)", marginTop: 12 }}>
                      Maintenance mode is ON
                      {adminSummary.server.message ? `: ${adminSummary.server.message}` : ""}
                    </p>
                  )}
                  <div className="row" style={{ marginTop: 14, gap: 8 }}>
                    <button className="secondary" type="button" onClick={() => setTab("bugs")}>
                      Open player bug form
                    </button>
                  </div>
                </div>

                <div className="panel">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>All bug reports</h2>
                    <select
                      value={adminFilter}
                      onChange={(e) => setAdminFilter(e.target.value)}
                      style={{ minWidth: 140 }}
                    >
                      <option value="open">Open</option>
                      <option value="triaged">Triaged</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="wont_fix">Won&apos;t fix</option>
                      <option value="all">All statuses</option>
                    </select>
                  </div>
                  {adminReports.length === 0 ? (
                    <p className="muted" style={{ marginTop: 10 }}>
                      No reports for this filter.
                    </p>
                  ) : (
                    <ul className="bug-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                      {adminReports.map((r) => {
                        const open = bugSelectedId === r.id;
                        return (
                          <li
                            key={r.id}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              padding: "10px 12px",
                              marginBottom: 8,
                              background: "rgba(0,0,0,0.22)",
                            }}
                          >
                            <button
                              type="button"
                              className="linkish"
                              style={{
                                width: "100%",
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                color: "inherit",
                                cursor: "pointer",
                                padding: 0,
                              }}
                              onClick={() => {
                                setBugSelectedId(open ? null : r.id);
                                setBugStaffNote(r.staffNote || "");
                              }}
                            >
                              <div style={{ fontWeight: 600 }}>
                                #{r.id} · {r.title}
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                {r.username || "?"} · p{r.profileId ?? "?"} · {r.category} · {r.status} ·{" "}
                                {new Date(r.createdAt).toLocaleString()}
                              </div>
                            </button>
                            {open && (
                              <div style={{ marginTop: 10 }}>
                                <pre
                                  style={{
                                    whiteSpace: "pre-wrap",
                                    fontFamily: "inherit",
                                    fontSize: 13,
                                    margin: 0,
                                  }}
                                >
                                  {r.body}
                                </pre>
                                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                                  {r.launcherVersion ? `Launcher ${r.launcherVersion}` : ""}
                                  {r.characterName
                                    ? ` · ${r.characterName}${
                                        r.characterSlot != null ? ` (slot ${r.characterSlot + 1})` : ""
                                      }`
                                    : ""}
                                </p>
                                <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                                  <input
                                    type="text"
                                    value={bugStaffNote}
                                    onChange={(e) => setBugStaffNote(e.target.value)}
                                    placeholder="Staff note"
                                    style={{ flex: 1, minWidth: 160 }}
                                  />
                                  {["open", "triaged", "in_progress", "resolved", "wont_fix"].map(
                                    (st) => (
                                      <button
                                        key={st}
                                        type="button"
                                        className="secondary"
                                        disabled={bugBusy || r.status === st}
                                        onClick={async () => {
                                          await onUpdateBugStatus(r.id, st);
                                          void loadAdminPanel();
                                        }}
                                      >
                                        {st}
                                      </button>
                                    )
                                  )}
                                  <button
                                    type="button"
                                    className="ghost"
                                    style={{ color: "var(--bad)" }}
                                    disabled={bugBusy}
                                    onClick={() => void onDeleteBugReport(r.id)}
                                  >
                                    Delete report
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="panel">
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ margin: 0 }}>Character list</h2>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <input
                        type="text"
                        value={adminCharQ}
                        onChange={(e) => setAdminCharQ(e.target.value)}
                        placeholder="Search name / user / pID"
                        style={{ minWidth: 180 }}
                      />
                      <button
                        className="secondary"
                        type="button"
                        disabled={adminCharBusy}
                        onClick={() => void loadAdminPanel()}
                      >
                        Search / refresh
                      </button>
                    </div>
                  </div>
                  <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Every non-empty launcher character linked to the account DB (and world actor id when bound).
                    Actions update the API immediately; inventory/spell wipes also queue the game server.
                  </p>
                  {adminCharacters.length === 0 ? (
                    <p className="muted" style={{ marginTop: 10 }}>
                      No characters found.
                    </p>
                  ) : (
                    <ul className="bug-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                      {adminCharacters.map((ch) => {
                        const open = adminCharSelected === ch.characterId;
                        return (
                          <li
                            key={ch.characterId}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              padding: "10px 12px",
                              marginBottom: 8,
                              background: ch.banned
                                ? "rgba(120,20,20,0.25)"
                                : "rgba(0,0,0,0.22)",
                            }}
                          >
                            <button
                              type="button"
                              className="linkish"
                              style={{
                                width: "100%",
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                color: "inherit",
                                cursor: "pointer",
                                padding: 0,
                              }}
                              onClick={() =>
                                setAdminCharSelected(open ? null : ch.characterId)
                              }
                            >
                              <div style={{ fontWeight: 600 }}>
                                {ch.name}
                                {ch.banned ? " · BANNED" : ""}
                                {ch.warningCount > 0 ? ` · ${ch.warningCount} warn` : ""}
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                p{ch.profileId} · {ch.username} · slot {ch.slot + 1}
                                {ch.actorFormId != null
                                  ? ` · actor 0x${(ch.actorFormId >>> 0).toString(16)}`
                                  : " · no world actor"}
                                {ch.hasInventory ? " · inv" : ""}
                                {ch.hasEquipment ? " · eq" : ""}
                                {ch.lastPlayedAt
                                  ? ` · played ${new Date(ch.lastPlayedAt).toLocaleString()}`
                                  : ""}
                              </div>
                            </button>
                            {open && (
                              <div style={{ marginTop: 10 }}>
                                {ch.pos && (
                                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                                    Pos [{ch.pos.map((n) => Math.round(n)).join(", ")}]
                                    {ch.worldOrCell != null
                                      ? ` · cell 0x${(ch.worldOrCell >>> 0).toString(16)}`
                                      : ""}
                                  </p>
                                )}
                                <input
                                  type="text"
                                  value={adminActionNote}
                                  onChange={(e) => setAdminActionNote(e.target.value)}
                                  placeholder="Staff note (required for Warn)"
                                  style={{ width: "100%", marginBottom: 8 }}
                                />
                                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                                  {(
                                    [
                                      ["warn", "Warn"],
                                      ["ban", "Ban"],
                                      ["unban", "Unban"],
                                      ["delete_character", "Delete char"],
                                      ["wipe_inventory", "Wipe inv"],
                                      ["wipe_equipment", "Wipe gear"],
                                      ["wipe_spells", "Wipe spells"],
                                      ["wipe_map_markers", "Wipe map"],
                                      ["reset_position", "Reset pos"],
                                    ] as const
                                  ).map(([act, label]) => (
                                    <button
                                      key={act}
                                      type="button"
                                      className={
                                        act === "ban" || act === "delete_character"
                                          ? "ghost"
                                          : "secondary"
                                      }
                                      style={
                                        act === "ban" || act === "delete_character"
                                          ? { color: "var(--bad)" }
                                          : undefined
                                      }
                                      disabled={adminCharBusy}
                                      onClick={() =>
                                        void onAdminCharAction(ch.characterId, act)
                                      }
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === "bugs" && (
          <>
            <div className="panel">
              <h2>Report a bug</h2>
              <p className="muted">
                Submit issues from the launcher — crashes, multiplayer, characters, mods. Reports are
                stored on the VOA server so staff can review them without Discord digs.
              </p>
              {!loggedIn ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  <button className="linkish" type="button" onClick={() => setTab("account")}>
                    Log in with Discord
                  </button>{" "}
                  to submit a report.
                </p>
              ) : (
                <div className="bug-form" style={{ marginTop: 12 }}>
                  <label className="muted" style={{ display: "block", marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={bugCategory}
                    onChange={(e) => setBugCategory(e.target.value)}
                    style={{ width: "100%", marginBottom: 10 }}
                  >
                    <option value="multiplayer">Multiplayer</option>
                    <option value="crash">Crash / CTD</option>
                    <option value="character">Character / slots</option>
                    <option value="launcher">Launcher</option>
                    <option value="mods">Mods / install</option>
                    <option value="other">Other</option>
                  </select>
                  <label className="muted" style={{ display: "block", marginBottom: 6 }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    placeholder="Short summary (e.g. Stuck in building, cannot exit door)"
                    maxLength={120}
                    style={{ width: "100%", marginBottom: 10 }}
                  />
                  <label className="muted" style={{ display: "block", marginBottom: 6 }}>
                    What happened?
                  </label>
                  <textarea
                    value={bugBody}
                    onChange={(e) => setBugBody(e.target.value)}
                    placeholder={
                      "Steps to reproduce, what you expected, what you saw.\n" +
                      "Include character name/slot if relevant. Paste SP console lines if you have them."
                    }
                    rows={7}
                    maxLength={8000}
                    style={{ width: "100%", resize: "vertical", marginBottom: 10 }}
                  />
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="primary"
                      disabled={bugBusy || bugTitle.trim().length < 3 || bugBody.trim().length < 10}
                      onClick={() => void onSubmitBug()}
                    >
                      {bugBusy ? "Sending…" : "Submit report"}
                    </button>
                    <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                      Includes launcher v{appVersion || "?"} · slot {selectedSlot + 1}
                      {characters.find((c) => c.slot === selectedSlot && !c.empty)?.name
                        ? ` (${characters.find((c) => c.slot === selectedSlot && !c.empty)!.name})`
                        : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ margin: 0 }}>{bugAdmin && bugViewAll ? "All reports" : "Your reports"}</h2>
                <div className="row" style={{ gap: 8 }}>
                  {bugAdmin && (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setBugViewAll((v) => {
                          const next = !v;
                          // loadBugReports depends on bugViewAll; flip then refresh after paint
                          queueMicrotask(() => {
                            void window.voa.getBugReports({ all: next }).then((res) => {
                              if (!res.error) {
                                setBugReports(res.reports || []);
                                setBugAdmin(Boolean(res.admin));
                              }
                            });
                          });
                          return next;
                        });
                      }}
                    >
                      {bugViewAll ? "Show mine only" : "Staff: view all"}
                    </button>
                  )}
                  <button
                    className="ghost"
                    type="button"
                    disabled={!loggedIn || bugBusy}
                    onClick={() => void loadBugReports()}
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {!loggedIn ? (
                <p className="muted" style={{ marginTop: 10 }}>
                  Log in to see your reports.
                </p>
              ) : bugReports.length === 0 ? (
                <p className="muted" style={{ marginTop: 10 }}>
                  No reports yet.
                </p>
              ) : (
                <ul className="bug-list" style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                  {bugReports.map((r) => {
                    const open = bugSelectedId === r.id;
                    return (
                      <li
                        key={r.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          marginBottom: 8,
                          background: "rgba(0,0,0,0.22)",
                        }}
                      >
                        <button
                          type="button"
                          className="linkish"
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            color: "inherit",
                            cursor: "pointer",
                            padding: 0,
                          }}
                          onClick={() => {
                            setBugSelectedId(open ? null : r.id);
                            setBugStaffNote(r.staffNote || "");
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            #{r.id} · {r.title}
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {r.category} · {r.status}
                            {r.username ? ` · ${r.username}` : ""}
                            {" · "}
                            {new Date(r.createdAt).toLocaleString()}
                          </div>
                        </button>
                        {open && (
                          <div style={{ marginTop: 10 }}>
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                fontFamily: "inherit",
                                fontSize: 13,
                                margin: 0,
                                opacity: 0.95,
                              }}
                            >
                              {r.body}
                            </pre>
                            {(r.launcherVersion || r.characterName || r.staffNote) && (
                              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                                {r.launcherVersion ? `Launcher ${r.launcherVersion}` : ""}
                                {r.characterName
                                  ? ` · Char ${r.characterName}${
                                      r.characterSlot != null ? ` (slot ${r.characterSlot + 1})` : ""
                                    }`
                                  : ""}
                                {r.staffNote ? ` · Staff: ${r.staffNote}` : ""}
                              </p>
                            )}
                            {bugAdmin && (
                              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                                <input
                                  type="text"
                                  value={bugStaffNote}
                                  onChange={(e) => setBugStaffNote(e.target.value)}
                                  placeholder="Staff note (optional)"
                                  style={{ flex: 1, minWidth: 160 }}
                                />
                                {["open", "triaged", "in_progress", "resolved", "wont_fix"].map(
                                  (st) => (
                                    <button
                                      key={st}
                                      type="button"
                                      className="secondary"
                                      disabled={bugBusy || r.status === st}
                                      onClick={() => void onUpdateBugStatus(r.id, st)}
                                    >
                                      {st}
                                    </button>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "account" && (
          <>
            <div className="panel">
              <h2>Discord (VOA multiplayer)</h2>
              {!loggedIn ? (
                <>
                  <p className="muted">
                    Discord login is required to create a game session and join the VOA server.
                  </p>
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
                      Log out of Discord
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="panel">
              <h2>Nexus Mods</h2>
              <p className="muted">
                Nexus browser login (OAuth) will work after VOA is registered as a Nexus application.
                Until then you may see “unknown client” — that is expected.{" "}
                <strong>Temp workaround:</strong> Mods → Address Library → Open Nexus (download zip) →
                Install from ZIP. Free vs Premium will apply once OAuth is approved.
              </p>
              {nexusLinked && nexusUser ? (
                <>
                  <div className="row" style={{ marginTop: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{nexusUser.name}</div>
                      <div className="muted">
                        Nexus user #{nexusUser.userId ?? "?"}
                        {" · "}
                        <strong>
                          {nexusUser.isPremium
                            ? "Premium"
                            : nexusUser.isSupporter
                              ? "Supporter"
                              : "Free"}
                        </strong>
                      </div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        OAuth session stored on this PC only. Downloads use your{" "}
                        {nexusUser.isPremium ? "Premium" : "Free"} entitlements.
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ marginTop: 16, gap: 8 }}>
                    <button className="primary" disabled={nexusBusy} onClick={onNexusLogin}>
                      {nexusBusy ? "Waiting for browser…" : "Re-login with Nexus"}
                    </button>
                    <button className="ghost" disabled={nexusBusy} onClick={onUnlinkNexus}>
                      Log out of Nexus
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="primary"
                      disabled={nexusBusy}
                      onClick={onNexusLogin}
                    >
                      {nexusBusy ? "Waiting for browser…" : "Log in with Nexus Mods"}
                    </button>
                  </div>
                  <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    Opens your browser to sign in on nexusmods.com, then returns here — just like
                    Discord OAuth. Tokens stay on this PC; Free and Premium both work (Premium gets
                    full direct downloads per Nexus policy).
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
