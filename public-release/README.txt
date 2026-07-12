# Visions of Aetherius — Player Launcher

Welcome. This package is for **players only**. It connects to the official public server.

## Requirements

1. **Skyrim Special Edition** (Steam) with a matching **SKSE64**
2. **Skyrim Platform** installed (SKSE plugin)
3. Windows 10/11 x64
4. Internet access

## Quick start

1. Run **`VisionsOfAetherius.exe`** (or the versioned `VisionsOfAetherius-*-portable.exe`)
2. Open **Settings** → set your Skyrim SE folder (the one with `SkyrimSE.exe` / `skse64_loader.exe`)
3. Click **Login with Discord**
4. Open **Characters**, create or pick a slot
5. Click **Play**

The launcher will:

- Talk only to the official VOA platform (not a local developer API)
- Install / refresh the multiplayer client plugin into your Skyrim folder
- Write connection settings for the public game server
- Launch Skyrim through SKSE

## Official server

| | |
|---|---|
| Name | Visions of Aetherius |
| Address | `178.156.158.116:10000` |

Stay on the main menu after SKSE starts and wait for multiplayer connect (do **not** use vanilla New Game for multiplayer).

## What this is not

- Not a server host package
- Not a developer monorepo
- No local API / no dev login
- Do not use Keizaal client bundles or unrelated RP plugins

## Troubleshooting

| Symptom | What to try |
|--------|-------------|
| Cannot reach official server | Check internet; server may be in maintenance |
| Login fails | Confirm Discord OAuth completes in the browser; try again |
| SKSE not found | Install SKSE64 into the same folder as `SkyrimSE.exe` |
| Stuck on main menu | Confirm Skyrim Platform + that Play wrote settings; press `~` for console |
| Wrong game version | SKSE / Skyrim Platform must match your SE/AE runtime |

## Support

Use your community Discord for player support. Admins handle bans, maintenance, and wipes.
