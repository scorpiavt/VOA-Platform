# Release / Ops notes

## Local API

```bash
cd voa-platform
npm install
cp services/api/.env.example services/api/.env
# edit .env — set JWT_SECRET, Discord keys, ALLOW_DEV_LOGIN=true for offline testing
npm run dev:api
```

Dev login without Discord:

```bash
curl -X POST http://127.0.0.1:3100/v1/auth/dev-login -H "Content-Type: application/json" -d "{\"username\":\"Tester\"}"
```

## Launcher

```bash
npm run dev:launcher
```

## VPS deploy (API)

See `deploy/scripts/setup-vps.sh` and `deploy/systemd/voa-api.service`.

## Game server master mode

With public API online (`voa-api` on port 3100):

```json
"offlineMode": false,
"master": "http://127.0.0.1:3100",
"ip": "178.156.158.116",
"port": 10000
```

- `master` should be the API as seen **from the game server host** (loopback is best on the VPS).
- `ip:port` must match `GAME_SERVER_ADDR` on the API (`178.156.158.116:10000`).
- Stock `settings.js` used to wipe `master` from JSON when CLI args omit it — the runtime
  `dist_back/settings.js` on the VPS is patched: `res.master = args["master"] || res.master`.

Then `pm2 restart voa-server`. Confirm logs:

- `Using master server on http://127.0.0.1:3100`
- `Login system assumed that 178.156.158.116:10000 is our address on master`

Clients must use the launcher (Discord → session). Offline profileId-only login is rejected.

Prefer HTTPS + domain before broader public launch.

## Publishing a launcher update

1. Bump `apps/launcher/package.json` version (e.g. `0.1.1`).
2. `npm run dist:public` (or `npm run dist:public` from monorepo root).
3. Copy portable to VPS:
   - `/home/skymp/voa-platform-data/cdn/launcher/VisionsOfAetherius.exe`
4. Edit `/home/skymp/voa-platform-data/launcher-update.json`:

```json
{
  "version": "0.1.1",
  "downloadUrl": "https://api.visionsofaetherius.com/cdn/launcher/VisionsOfAetherius-update.zip",
  "sha256": "<64-char hex of the zip/exe>",
  "signature": "<Ed25519 base64 from scripts/sign-launcher-update.mjs>",
  "size": 12345678,
  "notes": "What changed",
  "minVersion": "0.1.1",
  "channel": "stable",
  "format": "zip"
}
```

**Required (Nexus §3–§4):** `downloadUrl` must be **HTTPS** for public hosts; **`sha256` and `signature` are mandatory**. Generate with:

```bash
# Private key offline only — never commit
export VOA_UPDATE_SIGNING_KEY=...
node scripts/sign-launcher-update.mjs --artifact path/to/VisionsOfAetherius-update.zip --version 0.1.1 --url https://api.visionsofaetherius.com/cdn/launcher/VisionsOfAetherius-update.zip
```

Unsigned or HTTP public manifests are **refused** by the API and launcher.

5. No API restart required (manifest is read from disk each request).

Players with an older launcher see **Update** instead of **Play** until they apply it.
