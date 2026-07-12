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
      hasTokens: boolean;
      accessToken: string | null;
      refreshToken: string | null;
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
  uninstallMod: (packageId: string) =>
    ipcRenderer.invoke("voa:uninstallMod", packageId) as Promise<{
      ok: boolean;
      error?: string;
      removed?: number;
    }>,
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
});
