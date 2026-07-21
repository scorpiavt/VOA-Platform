# VOA proximity voice (Keizaal-style, in-game)

## Player experience

- **In Skyrim** — no separate voice app, no Discord required for proximity
- **Push-to-talk** only
- **Whisper / Normal / Shout** distance tiers
- **Rebindable** PTT and mode keys
- Same cell/world only; volume falls off with distance

## Architecture

```
Skyrim Platform plugin  →  CEF voice page (LiveKit JS)
        │                         │
        │ HttpClient              │ WebRTC audio
        ▼                         ▼
   VOA API (/v1/voice/*)      LiveKit SFU (VPS)
```

| Component | Path |
|-----------|------|
| Token mint | `services/api/src/voice.ts` |
| Routes | `GET /v1/voice/config`, `POST /v1/voice/token` |
| In-game client | `deploy/scripts/client-voa-voice.js` |
| CEF UI | `deploy/scripts/voice-ui/` (injected / CDN) |
| LiveKit deploy | `deploy/livekit/` |

Identity on LiveKit is always **`String(profileId)`**.

## Ranges (Skyrim units)

| Mode | Max distance |
|------|----------------|
| Whisper | 800 |
| Normal | 2200 |
| Shout | 6000 |

## Operator setup

### 1. Generate LiveKit keys

```bash
docker run --rm livekit/livekit-server generate-keys
```

### 2. Configure SFU

Edit `deploy/livekit/livekit.yaml` — set `keys:` to the generated pair.  
Start:

```bash
cd /path/to/voa-platform/deploy/livekit
docker compose up -d
```

Open firewall: **TCP 7880, 7881** and **UDP 50000–50100**.

### 3. Configure VOA API `.env`

```env
LIVEKIT_URL=wss://voice.visionsofaetherius.com
# Dev only (not for public players without TLS):
# LIVEKIT_URL=ws://178.156.158.116:7880
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxx
LIVEKIT_ROOM=voa-main
LIVEKIT_TOKEN_TTL_SEC=7200
```

If any of URL/key/secret is missing, voice stays **disabled** and Play still works.

### 4. TLS (production)

Terminate WSS on `voice.yourdomain` → `127.0.0.1:7880` (same HTTPS story as the API).  
Set `LIVEKIT_URL=wss://voice.yourdomain`.

## Client API

**Config**

```http
GET /v1/voice/config
```

**Token** (game session preferred)

```http
POST /v1/voice/token
Content-Type: application/json

{ "session": "<game session from settings>", "characterSlot": 0 }
```

Or launcher JWT: `Authorization: Bearer <accessToken>`.

## Defaults keybinds

| Action | Key |
|--------|-----|
| PTT (hold) | V |
| Mode cycle | B |

Mode cycle order (starts at **Normal**):

**Normal → Shout → Whisper → Normal → …**

## Security

- Tokens only for valid non-banned sessions
- Room join limited to configured room name
- No Discord tokens inside Skyrim
- PTT-only (no open mic in v1)
