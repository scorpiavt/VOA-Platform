import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("voa", {
  getApiBase: () => ipcRenderer.invoke("voa:getApiBase") as Promise<string>,
  getAppVersion: () => ipcRenderer.invoke("voa:getAppVersion") as Promise<string>,
  checkLauncherUpdate: () =>
    ipcRenderer.invoke("voa:checkLauncherUpdate") as Promise<{
      currentVersion: string;
      updateAvailable: boolean;
      forced?: boolean;
      latest?: {
        version: string;
        downloadUrl: string;
        sha256?: string;
        size?: number;
        notes?: string;
        minVersion?: string;
      } | null;
      error?: string;
    }>,
  applyLauncherUpdate: () =>
    ipcRenderer.invoke("voa:applyLauncherUpdate") as Promise<{
      ok: boolean;
      error?: string;
      version?: string;
    }>,
  getStatus: () =>
    ipcRenderer.invoke("voa:getStatus") as Promise<{ status?: unknown; error?: string }>,
  getNews: () =>
    ipcRenderer.invoke("voa:getNews") as Promise<{ items?: unknown[]; error?: string }>,
  getStore: () =>
    ipcRenderer.invoke("voa:getStore") as Promise<{
      user: unknown;
      skyrimPath: string | null;
      voaInstancePath?: string | null;
      useVoaInstance?: boolean;
      hasTokens: boolean;
      accessToken: string | null;
      refreshToken: string | null;
      musicVolume?: number;
      musicMuted?: boolean;
    }>,
  setUseVoaInstance: (enabled: boolean) =>
    ipcRenderer.invoke("voa:setUseVoaInstance", enabled) as Promise<{
      ok: boolean;
      useVoaInstance: boolean;
    }>,
  rebuildInstance: () =>
    ipcRenderer.invoke("voa:rebuildInstance") as Promise<{
      ok: boolean;
      error?: string;
      path?: string;
      sourcePath?: string;
      hardlinked?: number;
      copied?: number;
      created?: boolean;
    }>,
  getInstanceInfo: () =>
    ipcRenderer.invoke("voa:getInstanceInfo") as Promise<{
      sourcePath: string | null;
      instancePath: string | null;
      useVoaInstance: boolean;
      instanceReady: boolean;
    }>,
  setMusicPrefs: (prefs: { volume?: number; muted?: boolean }) =>
    ipcRenderer.invoke("voa:setMusicPrefs", prefs) as Promise<{
      ok: boolean;
      musicVolume: number;
      musicMuted: boolean;
    }>,
  /** file:// URL to BGM on disk (extraResources) — not a broken /music path */
  getMusicSrc: () =>
    ipcRenderer.invoke("voa:getMusicSrc") as Promise<{
      ok: boolean;
      src: string | null;
      error?: string;
    }>,
  setAuth: (payload: { accessToken: string; refreshToken: string; user: unknown }) =>
    ipcRenderer.invoke("voa:setAuth", payload) as Promise<boolean>,
  logout: () => ipcRenderer.invoke("voa:logout") as Promise<boolean>,
  openDiscordLogin: () =>
    ipcRenderer.invoke("voa:openDiscordLogin") as Promise<{
      ok: boolean;
      error?: string;
      user?: unknown;
    }>,
  getDiscordSetup: () =>
    ipcRenderer.invoke("voa:getDiscordSetup") as Promise<{
      clientId?: string | null;
      requiredRedirects?: string[];
      portalUrl?: string;
      hint?: string;
      error?: string;
    }>,
  openDiscordSetupPage: () =>
    ipcRenderer.invoke("voa:openDiscordSetupPage") as Promise<boolean>,
  pickSkyrimPath: () =>
    ipcRenderer.invoke("voa:pickSkyrimPath") as Promise<
      { path: string } | { error: string } | null
    >,
  setSkyrimPath: (p: string) => ipcRenderer.invoke("voa:setSkyrimPath", p) as Promise<boolean>,
  /** Full Play flow runs in main process (session + write settings + SKSE) */
  play: (opts?: { characterSlot?: number }) =>
    ipcRenderer.invoke("voa:play", opts) as Promise<{
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
    }>,
  setCharacterSlot: (slot: number) =>
    ipcRenderer.invoke("voa:setCharacterSlot", slot) as Promise<{ ok: boolean; error?: string }>,
  getCharacters: () =>
    ipcRenderer.invoke("voa:getCharacters") as Promise<{
      characters?: Array<{
        id: number;
        slot: number;
        name: string;
        empty: boolean;
        lastPlayedAt?: string | null;
        createdAt: string;
      }>;
      error?: string;
    }>,
  createCharacter: (payload: { slot: number; name?: string }) =>
    ipcRenderer.invoke("voa:createCharacter", payload) as Promise<{
      ok: boolean;
      error?: string;
      character?: unknown;
    }>,
  deleteCharacter: (characterId: number) =>
    ipcRenderer.invoke("voa:deleteCharacter", characterId) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  getBugReports: (opts?: { all?: boolean; status?: string }) =>
    ipcRenderer.invoke("voa:getBugReports", opts) as Promise<{
      reports?: Array<{
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
      }>;
      admin?: boolean;
      staffRoles?: string[];
      categories?: string[];
      error?: string;
    }>,
  getStaffInfo: () =>
    ipcRenderer.invoke("voa:getStaffInfo") as Promise<{
      isStaff: boolean;
      roleLabels: string[];
      roleIds?: string[];
    }>,
  getAdminSummary: () =>
    ipcRenderer.invoke("voa:getAdminSummary") as Promise<{
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
      recentBugs?: unknown[];
    }>,
  submitBugReport: (payload: {
    title: string;
    body: string;
    category?: string;
    characterSlot?: number | null;
    characterName?: string | null;
    gameVersion?: string;
  }) =>
    ipcRenderer.invoke("voa:submitBugReport", payload) as Promise<{
      ok: boolean;
      error?: string;
      report?: unknown;
    }>,
  getSupportLogDisclaimer: () =>
    ipcRenderer.invoke("voa:getSupportLogDisclaimer") as Promise<{
      disclaimer: string;
      retentionDays: number;
      maxBytes: number;
    }>,
  uploadSupportLogs: (payload: { consent: boolean; reason?: string }) =>
    ipcRenderer.invoke("voa:uploadSupportLogs", payload) as Promise<{
      ok: boolean;
      error?: string;
      id?: number;
      sizeBytes?: number;
      expiresAt?: string;
      files?: string[];
      message?: string;
    }>,
  updateBugReport: (payload: {
    id: number;
    status: string;
    staffNote?: string | null;
  }) =>
    ipcRenderer.invoke("voa:updateBugReport", payload) as Promise<{
      ok: boolean;
      error?: string;
      report?: unknown;
    }>,
  deleteBugReport: (id: number) =>
    ipcRenderer.invoke("voa:deleteBugReport", id) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  getAdminCharacters: (opts?: { q?: string; includeEmpty?: boolean }) =>
    ipcRenderer.invoke("voa:getAdminCharacters", opts) as Promise<{
      ok: boolean;
      error?: string;
      characters?: Array<{
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
      }>;
      actions?: string[];
    }>,
  adminCharacterAction: (payload: {
    characterId: number;
    action: string;
    note?: string;
  }) =>
    ipcRenderer.invoke("voa:adminCharacterAction", payload) as Promise<{
      ok: boolean;
      error?: string;
      action?: string;
      queued?: boolean;
      detail?: string;
    }>,
  getMods: () =>
    ipcRenderer.invoke("voa:getMods") as Promise<{
      packages?: Array<{
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
      }>;
      installed?: Array<{
        id: string;
        version: string;
        name: string;
        installedAt: string;
        files: string[];
      }>;
      error?: string;
    }>,
  getInstalledMods: () =>
    ipcRenderer.invoke("voa:getInstalledMods") as Promise<{
      installed: Array<{
        id: string;
        version: string;
        name: string;
        installedAt: string;
        files: string[];
      }>;
    }>,
  installMod: (packageId: string) =>
    ipcRenderer.invoke("voa:installMod", packageId) as Promise<{
      ok: boolean;
      error?: string;
      installed?: {
        id: string;
        version: string;
        name: string;
        installedAt: string;
        files: string[];
      };
    }>,
  /** TEMP: pick a Nexus zip you downloaded in browser (until OAuth app is approved) */
  installModFromZip: (payload: {
    packageId: string;
    name?: string;
    version?: string;
    remapSkseToData?: boolean;
  }) =>
    ipcRenderer.invoke("voa:installModFromZip", payload) as Promise<{
      ok: boolean;
      error?: string;
      canceled?: boolean;
      installed?: {
        id: string;
        version: string;
        name: string;
        installedAt: string;
        files: string[];
      };
    }>,
  uninstallMod: (packageId: string) =>
    ipcRenderer.invoke("voa:uninstallMod", packageId) as Promise<{
      ok: boolean;
      error?: string;
      removed?: number;
    }>,
  verifyMods: () =>
    ipcRenderer.invoke("voa:verifyMods") as Promise<{
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
      playPath?: string;
      message?: string;
    }>,
  uninstallAllMods: () =>
    ipcRenderer.invoke("voa:uninstallAllMods") as Promise<{
      ok: boolean;
      error?: string;
      packagesRemoved?: number;
      filesRemoved?: number;
      playPath?: string;
      message?: string;
    }>,
  windowClose: () => ipcRenderer.invoke("voa:windowClose") as Promise<boolean>,
  windowMinimize: () =>
    ipcRenderer.invoke("voa:windowMinimize") as Promise<boolean>,
  getNexusAccount: () =>
    ipcRenderer.invoke("voa:getNexusAccount") as Promise<{
      linked: boolean;
      user: {
        userId?: number;
        name?: string;
        isPremium?: boolean;
        isSupporter?: boolean;
      } | null;
    }>,
  /** Browser OAuth login (like Discord) — no API key paste */
  openNexusLogin: () =>
    ipcRenderer.invoke("voa:openNexusLogin") as Promise<{
      ok: boolean;
      error?: string;
      user?: {
        userId?: number;
        name?: string;
        isPremium?: boolean;
        isSupporter?: boolean;
      };
    }>,
  unlinkNexusAccount: () =>
    ipcRenderer.invoke("voa:unlinkNexusAccount") as Promise<{ ok: boolean }>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("voa:openExternal", url) as Promise<boolean>,
  onAuthUpdated: (cb: (payload: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("auth:updated", listener);
    return () => ipcRenderer.removeListener("auth:updated", listener);
  },
  onModProgress: (
    cb: (payload: {
      packageId: string;
      phase: string;
      received: number;
      total: number;
      percent: number;
      message?: string;
    }) => void
  ) => {
    const listener = (
      _: unknown,
      payload: {
        packageId: string;
        phase: string;
        received: number;
        total: number;
        percent: number;
        message?: string;
      }
    ) => cb(payload);
    ipcRenderer.on("mods:progress", listener);
    return () => ipcRenderer.removeListener("mods:progress", listener);
  },
  onLauncherUpdateProgress: (
    cb: (payload: {
      phase: string;
      received: number;
      total: number;
      percent: number;
      message?: string;
    }) => void
  ) => {
    const listener = (
      _: unknown,
      payload: {
        phase: string;
        received: number;
        total: number;
        percent: number;
        message?: string;
      }
    ) => cb(payload);
    ipcRenderer.on("launcher:update-progress", listener);
    return () => ipcRenderer.removeListener("launcher:update-progress", listener);
  },
  onInstanceProgress: (
    cb: (payload: {
      phase: string;
      current: number;
      total: number;
      percent: number;
      message?: string;
    }) => void
  ) => {
    const listener = (
      _: unknown,
      payload: {
        phase: string;
        current: number;
        total: number;
        percent: number;
        message?: string;
      }
    ) => cb(payload);
    ipcRenderer.on("instance:progress", listener);
    return () => ipcRenderer.removeListener("instance:progress", listener);
  },
});
