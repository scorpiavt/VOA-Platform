# Nexus Mods application compliance (letter of the requirements)

This document maps **each** Nexus code-review requirement to an **enforced** implementation. There is no alternate production path.

---

## Requirement 1 — Remove the production server-side personal API key path

| Status | **Enforced** |
|--------|----------------|
| Code | `services/api/src/nexus.ts` — **no** download client, **no** `apikey` header, **no** `NEXUS_API_KEY` usage |
| Startup | `assertNoNexusPersonalApiKey()` in `index.ts` — process **refuses to start** if `NEXUS_API_KEY` (or aliases) is set |
| Config | `config.ts` does **not** expose a personal Nexus API key |
| Routes | `GET /v1/mods/:id/download` returns **400** for `source: "nexus"` (never streams Nexus bytes) |
| Env example | `NEXUS_API_KEY` **removed** from `.env.example` (comment forbids it) |

**Production download path (only):** user OAuth Bearer token in the **launcher**, never on the VOA API server for file downloads.

---

## Requirement 2 — OAuth / user-initiated direct-download architecture (unambiguous)

```
User clicks Install on a Nexus-catalog package
  → Launcher requires explicit Nexus OAuth login (PKCE + loopback)
  → User authenticates at Nexus in the browser (Free or Premium)
  → Launcher stores access_token via Electron safeStorage (encrypted)
  → Launcher calls https://api.nexusmods.com/.../download_link.json
       with Authorization: Bearer <user access_token>
  → Launcher downloads the returned HTTPS CDN URI directly
  → VOA API never fetches or rehosts those bytes for players
```

| Status | **Enforced** |
|--------|----------------|
| Launcher | `apps/launcher/electron/main.ts` — `getNexusDownloadUriWithOAuth` / `getValidNexusAccessToken` |
| Catalog | Nexus packages have `source: "nexus"` and empty VOA `downloadUrl` |
| Local packages | SKSE / VOA CDN only — explicitly non-Nexus |

---

## Requirement 3 — Replace all public HTTP endpoints with HTTPS

| Status | **Enforced** |
|--------|----------------|
| API | `PUBLIC_URL` for non-local hosts **must** be `https://` or process **refuses to start** |
| API | `CDN_BASE_URL` same rule |
| Launcher (packaged) | Default `PUBLIC_API_URL` is **`https://`**; HTTP public API is **rejected** |
| Localhost | `http://127.0.0.1` allowed for development only |

Operators must terminate TLS (Caddy/nginx) in front of the API. There is **no** production insecure-HTTP flag.

---

## Requirement 4 — Require signed update manifests and signed launcher binaries

| Status | **Enforced** |
|--------|----------------|
| Manifest | Must include `version`, `downloadUrl` (**https**), **`sha256` (required)**, **`signature` (required)** |
| Signature | Ed25519 over canonical payload; verified with public key embedded in launcher |
| Apply update | Aborts if sha256 missing/mismatch **or** signature missing/invalid |
| Signing | `scripts/sign-launcher-update.mjs` with offline `VOA_UPDATE_SIGNING_KEY` |

---

## Requirement 5 — Remove default production secrets

| Status | **Enforced** |
|--------|----------------|
| `JWT_SECRET` | Required in production; placeholders **rejected** |
| `GAME_SERVER_SECRET` | Required in production; placeholders **rejected**; min length 24 |
| Dev | Local-only synthetic secrets if unset — **never** for non-local `PUBLIC_URL` |

---

## Requirement 6 — Validate archive contents and paths before installation

| Status | **Enforced** |
|--------|----------------|
| Helper | `assertSafeArchiveRelPath` / `validateExtractedTree` |
| Rules | Reject `..`, absolute paths, drive letters, NUL; dest must stay under install root |
| When | After extract, **before** any file is copied into Skyrim/VOA |

---

## Operator production checklist

1. `PUBLIC_URL=https://your.domain` (TLS terminated).
2. `CDN_BASE_URL=https://your.domain/cdn` (or omit to derive from PUBLIC_URL).
3. Strong unique `JWT_SECRET` and `GAME_SERVER_SECRET` (≥24 chars).
4. Discord OAuth app; Nexus OAuth public client (loopback PKCE).
5. Publish launcher updates with `sha256` + Ed25519 `signature` via signing script.
6. Never set personal Nexus API keys on the server for player downloads.
