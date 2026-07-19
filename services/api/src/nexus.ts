import { config } from "./config";

export type NexusDownloadLink = {
  URI: string;
  name?: string;
  short_name?: string;
};

function nexusHeaders(): Record<string, string> {
  if (!config.nexusApiKey) {
    throw new Error("NEXUS_API_KEY is not configured on the server");
  }
  return {
    apikey: config.nexusApiKey,
    "Application-Name": config.nexusAppName || "VisionsOfAetherius",
    "Application-Version": "0.1.0",
    accept: "application/json",
  };
}

export function nexusConfigured(): boolean {
  return Boolean(config.nexusApiKey);
}

/** Resolve a short-lived Nexus CDN download URL for a mod file. */
export async function getNexusFileDownloadUri(
  gameDomain: string,
  modId: number,
  fileId: number
): Promise<string> {
  const url = `https://api.nexusmods.com/v1/games/${encodeURIComponent(
    gameDomain
  )}/mods/${modId}/files/${fileId}/download_link.json`;

  const res = await fetch(url, { headers: nexusHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Nexus download_link failed HTTP ${res.status}: ${body.slice(0, 200)}`
    );
  }
  const links = (await res.json()) as NexusDownloadLink[];
  if (!Array.isArray(links) || !links.length || !links[0]?.URI) {
    throw new Error("Nexus returned no download links (Premium key required?)");
  }
  // Encode spaces in path segment for Node fetch
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

export async function fetchNexusFileInfo(
  gameDomain: string,
  modId: number,
  fileId: number
): Promise<{ size_in_bytes?: number; size_kb?: number; version?: string; file_name?: string } | null> {
  try {
    const url = `https://api.nexusmods.com/v1/games/${encodeURIComponent(
      gameDomain
    )}/mods/${modId}/files/${fileId}.json`;
    const res = await fetch(url, { headers: nexusHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as {
      size_in_bytes?: number;
      size_kb?: number;
      version?: string;
      file_name?: string;
    };
  } catch {
    return null;
  }
}
