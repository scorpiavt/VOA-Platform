# Visions of Aetherius Platform

**GitHub:** [https://github.com/scorpiavt/VOA-Platform](https://github.com/scorpiavt/VOA-Platform)

TypeScript stack for the VOA multiplayer project:

- **Electron launcher** — Discord login, Play/update, mods catalog, characters, Nexus link UI  
- **Fastify API** — auth, sessions, CDN client, mods, support logs, Nexus download helpers  
- **SkyMP client** (`client-dist/skymp5-client.js`) — multiplayer client plugin for SSE AE  
- **Deploy scripts** — VPS gamemode snippets, player-only world, chat, console staff tools  

```
voa-platform/
  apps/launcher      # Electron + React
  services/api       # Fastify + SQLite
  packages/shared
  client-dist/       # skymp5-client.js (game plugin)
  deploy/            # VPS scripts + gamemode snippets
  docs/
```

## Quick start (Windows)

```powershell
cd C:\Users\wehrm\Desktop\ProjectAetherius\voa-platform
npm install
copy services\api\.env.example services\api\.env
# Edit .env — set JWT_SECRET; for testing without Discord:
# ALLOW_DEV_LOGIN=true
npm run dev:api
```

Second terminal:

```powershell
npm run dev:launcher
```

## Discord

See [docs/DISCORD_APP_SETUP.md](docs/DISCORD_APP_SETUP.md) (and `docs/CREATE_YOUR_DISCORD_APP.md`).

Redirects used by the launcher:

```
voa://callback
http://127.0.0.1:47821/auth/discord/callback
http://localhost:47821/auth/discord/callback
```

## Nexus Mods API (registration)

Public launcher mod installs require a **registered application** (not a personal API key in production).

Policy: [API Acceptable Use Policy](https://help.nexusmods.com/article/114-api-acceptable-use-policy)  
OAuth guide: [modding.wiki OAuth2](https://modding.wiki/en/api/oauth2-guide)  
GraphQL (metadata only): [graphql.nexusmods.com](https://graphql.nexusmods.com/#introduction)

### Values to send Nexus Support

| Field | Value |
|--------|--------|
| **App name** | Visions of Aetherius Launcher |
| **GitHub** | https://github.com/scorpiavt/VOA-Platform |
| **Compliance doc** | [`docs/NEXUS_COMPLIANCE.md`](docs/NEXUS_COMPLIANCE.md) |
| **Callback / loopback** | Vortex-style loopback + PKCE (`http://127.0.0.1:<port>` for Nexus OAuth; Discord uses `voa://callback`) |
| **Download architecture** | **User OAuth only** → `download_link.json` with **Bearer user token** → **direct Nexus CDN HTTPS**. No server personal `apikey`. No VOA rehost of Nexus files. |
| **Headers** | `Application-Name: VisionsOfAetherius`, `Application-Version: <semver>` |

**There is no `NEXUS_API_KEY` production path.** See `services/api/src/nexus.ts` and `docs/NEXUS_COMPLIANCE.md`.

## Current iteration (high level)

| Area | Status |
|------|--------|
| Launcher + Discord OAuth + guild gate | Live |
| SkyMP session / Play | Live |
| CDN client (`skymp5-client.js`) | Live |
| Nexus OAuth user-initiated direct download | **Enforced** (no personal key) |
| HTTPS public API / CDN | **Enforced** in config + packaged launcher |
| Signed launcher updates (sha256 + Ed25519) | **Enforced** |
| Archive path validation (zip-slip) | **Enforced** |
| No default production secrets | **Enforced** |

## VPS game server

Game UDP: `178.156.158.116:10000`  
Public HTTP API must be served as **HTTPS** (reverse proxy). See `docs/NEXUS_COMPLIANCE.md` §3.

## License / secrets

Do **not** commit `.env`, API keys, signing private keys, or SSH keys. Use `.env.example` only.
