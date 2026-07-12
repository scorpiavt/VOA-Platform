import net from "net";
import { API_VERSION } from "@voa/shared";
import { config } from "./config";

function checkTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function fetchRemotePlayers(): Promise<{
  playersOnline: number | null;
  maxPlayers: number | null;
  gameOnline?: boolean;
  characterNames?: Record<string, Record<string, string>>;
}> {
  if (!config.gameStatusUrl) {
    return { playersOnline: null, maxPlayers: config.maxPlayers };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(config.gameStatusUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { playersOnline: null, maxPlayers: config.maxPlayers };
    const data = (await res.json()) as {
      playersOnline?: number;
      maxPlayers?: number;
      gameOnline?: boolean;
      characterNames?: Record<string, Record<string, string>>;
    };
    return {
      playersOnline:
        typeof data.playersOnline === "number" ? data.playersOnline : null,
      maxPlayers:
        typeof data.maxPlayers === "number" ? data.maxPlayers : config.maxPlayers,
      gameOnline: data.gameOnline,
      characterNames:
        data.characterNames && typeof data.characterNames === "object"
          ? data.characterNames
          : undefined,
    };
  } catch {
    return { playersOnline: null, maxPlayers: config.maxPlayers };
  }
}

/** Best-effort: UI port (main+1) is TCP and proves the process is listening. */
export async function getServerStatus() {
  const [tcpOnline, remote] = await Promise.all([
    checkTcp(config.gameServerIp, config.gameServerPort + 1),
    fetchRemotePlayers(),
  ]);

  const gameOnline =
    typeof remote.gameOnline === "boolean" ? remote.gameOnline || tcpOnline : tcpOnline;

  return {
    gameOnline,
    maintenance: config.maintenance,
    message: config.statusMessage || undefined,
    serverName: config.gameServerName,
    serverIp: config.gameServerIp,
    serverPort: config.gameServerPort,
    apiVersion: API_VERSION,
    playersOnline: remote.playersOnline,
    maxPlayers: remote.maxPlayers ?? config.maxPlayers,
    characterNames: remote.characterNames,
  };
}
