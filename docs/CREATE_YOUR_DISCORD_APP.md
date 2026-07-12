# Create *your* Discord application for VOA login

## What was wrong

| ID | What it is | Who owns it |
|----|------------|-------------|
| `1523833068186632263` | **Application Client ID** (OAuth “which app is asking”) | **Not your Developer Portal account** → “Application not found” |
| `Aetherius` bot in the server | Bot user tied to *some* application | Can be different from OAuth app |
| Your Discord user | The person who logs in | You (e.g. admin id `124305949681909760`) |
| Guild `1521246992158822450` | Community server | Your VOA server |

The launcher uses **Application Client ID + Secret** so Discord can ask **you** to authorize **that app**.  
It does **not** log you in as the bot. Players always authorize as **themselves**.

If the app ID is not under **your** Developer Portal login, you cannot add Redirects → login always fails.

---

## Create a new application (under your Discord account)

1. Log into Discord in the browser with the **same account** that owns the VOA server (and should own the launcher app).
2. Open: https://discord.com/developers/applications  
3. Click **New Application** → name: `Visions of Aetherius` (or `VOA Launcher`) → Create.
4. Left sidebar → **OAuth2**
5. Copy:
   - **Client ID**
   - **Client Secret** (Reset Secret if needed; copy once)
6. Under **Redirects**, click **Add Redirect** and add **exactly**:

```text
voa://callback
http://127.0.0.1:47821/auth/discord/callback
http://localhost:47821/auth/discord/callback
```

7. Click **Save Changes**.

Optional (bot in server for Play-time membership re-check later):

- **Bot** → Add Bot  
- Invite bot to guild `1521246992158822450`  
- Enable **Server Members Intent** if you use `DISCORD_BOT_TOKEN`

---

## Put credentials into VOA API

Edit `voa-platform/services/api/.env`:

```env
DISCORD_CLIENT_ID=<paste new Client ID>
DISCORD_CLIENT_SECRET=<paste new Client Secret>
DISCORD_GUILD_ID=1521246992158822450
REQUIRE_DISCORD_GUILD=true
ADMIN_DISCORD_IDS=124305949681909760
```

Then redeploy the API to the VPS (or ask Grok to redeploy after you save `.env`).

Do **not** commit `.env` to git.

---

## Test

1. Restart `voa-api` / redeploy.
2. Run latest launcher: `VOA-Public\VisionsOfAetherius-LOGIN-FIX.exe`
3. **Login with Discord** → authorize as **your user** (not the bot).
4. If the browser asks to open `voa://`, click Open.
