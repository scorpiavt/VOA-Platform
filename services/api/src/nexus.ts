/**
 * =============================================================================
 * NEXUS MODS — DOWNLOAD ARCHITECTURE (MANDATORY / NON-NEGOTIABLE)
 * =============================================================================
 *
 * Nexus code-review requirements (letter of the law):
 *   1. Remove the production server-side personal API key path.
 *   2. Make the OAuth/user-initiated direct-download architecture unambiguous.
 *
 * THIS MODULE IS INTENTIONALLY NOT A DOWNLOAD CLIENT.
 * The VOA API server never calls api.nexusmods.com for file downloads,
 * never sends an `apikey` header, and never rehosts Nexus archive bytes.
 *
 * Production download path (launcher only — see apps/launcher/electron/main.ts):
 *   a) User explicitly starts Install on a Nexus-catalog package.
 *   b) User completes Nexus OAuth (PKCE + loopback) in the browser.
 *   c) Launcher holds the user's access_token (encrypted at rest).
 *   d) Launcher calls download_link.json with Authorization: Bearer <user token>.
 *   e) Launcher downloads the returned HTTPS CDN URI directly from Nexus.
 *
 * First-party / non-Nexus packages (SKSE silverlock, VOA CDN) never use Nexus API.
 *
 * See docs/NEXUS_COMPLIANCE.md
 * =============================================================================
 */

/**
 * Call at process startup. Hard-refuses any personal Nexus API key configuration.
 * There is no alternate production path that uses NEXUS_API_KEY / apikey.
 */
export function assertNoNexusPersonalApiKey(): void {
  const raw = String(process.env.NEXUS_API_KEY || "").trim();
  if (raw) {
    throw new Error(
      "[VOA compliance] NEXUS_API_KEY is set. Production server-side personal " +
        "API keys are forbidden. Remove NEXUS_API_KEY from the environment. " +
        "Player Nexus downloads use launcher user OAuth only " +
        "(docs/NEXUS_COMPLIANCE.md §1–§2)."
    );
  }
  // Defense in depth: refuse other common misnames that would reintroduce the path.
  for (const name of [
    "NEXUS_PERSONAL_KEY",
    "NEXUS_PERSONAL_API_KEY",
    "NEXUSMODS_API_KEY",
  ] as const) {
    if (String(process.env[name] || "").trim()) {
      throw new Error(
        `[VOA compliance] ${name} is set. Personal Nexus API keys are forbidden on the server.`
      );
    }
  }
}
