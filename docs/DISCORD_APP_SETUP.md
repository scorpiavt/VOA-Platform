# Discord Application Setup

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it `Visions of Aetherius`.
2. **OAuth2 → General**
   - Copy **Client ID** and **Client Secret**
3. **OAuth2 → Redirects** — add **exactly** these (Save Changes after):

```text
http://127.0.0.1:47821/auth/discord/callback
```

That is the **desktop launcher** redirect (required). Discord accepts loopback `127.0.0.1` for native apps.

Optional extras:

```text
http://127.0.0.1:3100/auth/discord/callback
http://178.156.158.116:3100/auth/discord/callback
```

> Do **not** rely on the VPS IP redirect alone — Discord often rejects non-localhost `http://` redirects with **Invalid OAuth2 redirect_uri**.

4. Put secrets only in server env (never commit):

```env
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
ADMIN_DISCORD_IDS=your_discord_user_id
DISCORD_GUILD_ID=your_server_id
DISCORD_INVITE_URL=https://discord.gg/your-invite
```

5. Your Discord user ID: enable Developer Mode → right-click yourself → Copy User ID.
6. **Server ID** (community gate): Developer Mode → right-click the VOA server → **Copy Server ID**.

## How launcher login works

1. Launcher starts a tiny HTTP server on `127.0.0.1:47821`.
2. Browser opens Discord OAuth with `redirect_uri=http://127.0.0.1:47821/auth/discord/callback`.
3. After 2FA, Discord redirects to that loopback URL (on **your** PC).
4. Launcher forwards `code` + `state` to the public API (`POST /v1/auth/discord/exchange`).
5. API exchanges the code (holds client secret), checks community guild membership, returns tokens.

## Scopes

| Scope | Purpose |
|-------|---------|
| `identify` | Username + avatar |
| `guilds` | Confirm membership in the VOA community server |

## Community membership

1. **At login** — OAuth `guilds` scope; must be in `DISCORD_GUILD_ID`.
2. **At Play** — optional bot re-check via `DISCORD_BOT_TOKEN`.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Invalid OAuth2 redirect_uri` | Add `http://127.0.0.1:47821/auth/discord/callback` exactly; Save; retry with a **new** Login click |
| Authenticator too slow | Just request a new code; login wait is 5 minutes |
| Community required | Join the VOA Discord server first |
