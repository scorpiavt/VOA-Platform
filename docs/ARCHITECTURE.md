# VOA Platform Architecture

See the approved plan for full detail. Summary:

- **`services/api`** — Fastify + SQLite: Discord OAuth, JWT, news, status, SkyMP master sessions
- **`apps/launcher`** — Electron + React: login, news, Play → write settings + SKSE
- **`packages/shared`** — shared Zod types / constants
- **CDN** — Phase 5 under `/var/www/voa-cdn` (not fully wired yet)

## Auth flow

1. Launcher opens `{API}/auth/discord`
2. Discord callback → HTML page posts tokens to `http://127.0.0.1:47821/auth/complete`
3. Play calls `POST /v1/sessions` then writes `skymp5-client-settings.txt` with `session` + `master`
4. Game server (when `offlineMode: false`) validates via  
   `GET /api/servers/{addr}/sessions/{session}`
