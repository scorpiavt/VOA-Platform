# Visions of Aetherius Platform

Type C stack: **Electron launcher**, **Discord auth API**, **news/status**, **SkyMP master sessions**, CDN-ready layout.

```
voa-platform/
  apps/launcher      # Electron + React
  services/api       # Fastify + SQLite
  packages/shared
  deploy/
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

See [docs/DISCORD_APP_SETUP.md](docs/DISCORD_APP_SETUP.md).

## Phases

| Phase | Status |
|-------|--------|
| 0 Scaffold | Done |
| 1 API + Discord OAuth + JWT | Done (needs Discord secrets) |
| 2 SkyMP master sessions | Done (endpoints) |
| 3 News + status | Done |
| 4 Launcher shell | Done (dev) |
| 5 Client CDN updates | Stub only |
| 6 TLS / public harden | Pending |

## VPS game server

API default target: `178.156.158.116:10000`.  
Game server remains on PM2; flip `offlineMode`/`master` when ready (see docs/RELEASE.md).
