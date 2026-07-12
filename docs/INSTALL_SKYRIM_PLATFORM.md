# Install Skyrim Platform for VOA (required)

Your game is **Skyrim AE 1.6.1170** + **SKSE 2.2.6**.

The GitHub `SP-AE.zip` (Platform **2.6**) only supports **&lt; 1.6.629**. That is why SKSE showed:

> `SkyrimPlatform.dll: disabled, only compatible with versions earlier than 1.6.629`

## Download the correct build

1. Open: https://www.nexusmods.com/skyrimspecialedition/mods/54909?tab=files  
2. Download **Skyrim Platform 2.9.0** (or newer) marked for **1.6.640 / 1.6.1170** (Anniversary / Steam latest).  
   - Do **not** use the 1.5.97-only file.  
3. Extract the archive.

## Install

Copy into your Skyrim SE folder so paths match:

```
Skyrim Special Edition\
  Data\
    SKSE\Plugins\SkyrimPlatform.dll   ← required
    SKSE\Plugins\SkyrimPlatform.ini
    Platform\...                      ← Distribution, Fonts, Modules, etc.
    Scripts\TESModPlatform.pex
```

Keep these VOA files (do not overwrite with empty defaults if prompted):

```
Data\Platform\Plugins\skymp5-client.js
Data\Platform\Plugins\skymp5-client-settings.txt
Data\Platform\Plugins\skymp5-activity.js   (optional)
```

## Verify

1. Launch with **skse64_loader.exe** (VOA Play).  
2. You should **not** get the “disabled, only compatible with versions earlier than 1.6.629” popup.  
3. On the main menu press **`~`** and look for:  
   `Hello Multiplayer`  
   `Connecting to 178.156.158.116:10000`

## After Platform works

- Do **not** use vanilla New Game for multiplayer.  
- Stay on the main menu until the client connects; spawn uses `loadGame` (no Helgen cart).  
- **F2** = multiplayer browser UI.

## Already done on your PC

- Old incompatible `SkyrimPlatform.dll` renamed to  
  `SkyrimPlatform.dll.incompatible-pre-1.6.629`  
- Address Library version bins for 1.6.1170 are present.  
- `skymp5-client` settings still point at the VOA server.
