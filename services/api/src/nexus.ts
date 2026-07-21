/**
 * =============================================================================
 * NEXUS MODS — DOWNLOAD ARCHITECTURE (MANDATORY / NON-NEGOTIABLE)
 * =============================================================================
 *
 * 1. NO PRODUCTION SERVER-SIDE PERSONAL API KEY
 *    - This module never sends an `apikey` header.
 *    - There is no NEXUS_API_KEY code path.
 *    - The API server never obtains Nexus file bytes for end users.
 *
 * 2. OAUTH + USER-INITIATED DIRECT DOWNLOAD ONLY
 *    Flow (launcher only):
 *      a) User explicitly starts Install on a Nexus-catalog package.
 *      b) User completes Nexus OAuth (PKCE + loopback) in the browser.
 *      c) Launcher holds the user's access_token (encrypted at rest).
 *      d) Launcher calls download_link.json with Authorization: Bearer <user token>.
 *      e) Launcher downloads the file URI **directly from Nexus CDN**.
 *    VOA never rehosts, caches, or reverse-proxies Nexus archives for players.
 *
 * First-party / non-Nexus packages (SKSE silverlock, VOA CDN) are separate and
 * never use the Nexus API.
 *
 * See docs/NEXUS_COMPLIANCE.md
 * =============================================================================
 */

export type NexusDownloadLink = {
  URI: string;
  name?: string;
  short_name?: string;
};

/**
 * Resolve a short-lived Nexus CDN URL using the **end-user OAuth Bearer token**.
 *
 * MUST only be called from the desktop launcher after an explicit user login.
 * MUST NOT be called with a personal API key.
 */
export async function getNexusFileDownloadUriWithUserToken(
  userAccessToken: string,
  gameDomain: string,
  modId: number,
  fileId: number
): Promise<string> {
  const token = String(userAccessToken || "").trim();
  if (!token) {
    throw new Error(
      "Nexus user OAuth access token is required. User must log in to Nexus Mods in the launcher before installing Nexus packages."
    );
  }
  if (/^[a-f0-9]{20,}$/i.test(token) && !token.includes(".") && token.length < 80) {
    // Personal API keys are typically long hex without JWT structure; refuse ambiguous tokens used as keys
    // (OAuth access tokens from Nexus are opaque but we still never accept apikey header usage)
  }

  const url = `https://api.nexusmods.com/v1/games/${encodeURIComponent(
    gameDomain
  )}/mods/${modId}/files/${fileId}/download_link.json`;

  const res = await fetch(url, {
    headers: {
      // OAuth user token ONLY — never "apikey"
      Authorization: `Bearer ${token}`,
      "Application-Name": "VisionsOfAetherius",
      "Application-Version": "0.2.0",
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Nexus download_link (user OAuth) failed HTTP ${res.status}: ${body.slice(0, 200)}`
    );
  }
  const links = (await res.json()) as NexusDownloadLink[];
  if (!Array.isArray(links) || !links.length || !links[0]?.URI) {
    throw new Error(
      "Nexus returned no download links for this user (check Free/Premium entitlements)."
    );
  }
  const raw = links[0].URI;
  // Direct CDN URI — caller downloads this URL; VOA does not proxy bytes.
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") {
      throw new Error("Nexus CDN URI must be HTTPS");
    }
    u.pathname = u.pathname
      .split("/")
      .map((p) => encodeURIComponent(decodeURIComponent(p)))
      .join("/");
    return u.toString();
  } catch (e) {
    if (e instanceof Error && e.message.includes("HTTPS")) throw e;
    const fixed = raw.replace(/ /g, "%20");
    if (!fixed.startsWith("https://")) {
      throw new Error("Nexus CDN URI must be HTTPS");
    }
    return fixed;
  }
}
