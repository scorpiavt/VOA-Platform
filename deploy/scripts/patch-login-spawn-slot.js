/**
 * Patch VPS dist_back login.js + spawn.js to honor gameData.characterSlot (0|1)
 * and use VOA character DB binding (no resurrecting deleted Roman).
 *
 * Requires:
 *   - voa-characters-addon.js loaded (global.voaCharacters)
 *   - VOA_GAME_SECRET + VOA_API_BASE on game server process
 *
 * Run on VPS: node patch-login-spawn-slot.js
 */
const fs = require("fs");
const path = require("path");

const base = process.env.VOA_DIST_BACK || "/home/skymp/voa-server/dist_back";

// --- login.js: pass characterSlot to spawnAllowed ---
const loginPath = path.join(base, "systems/login.js");
let login = fs.readFileSync(loginPath, "utf8");

if (!login.includes("characterSlot")) {
  if (login.includes('emit("spawnAllowed"')) {
    login = login.replace(
      /ctx\.gm\.emit\("spawnAllowed",\s*userId,\s*profileId\)/g,
      'ctx.gm.emit("spawnAllowed", userId, profileId, (gameData && typeof gameData.characterSlot === "number") ? gameData.characterSlot : 0)'
    );
    login = login.replace(
      /ctx\.gm\.emit\("spawnAllowed",\s*userId,\s*res\.data\.user\.id\)/g,
      'ctx.gm.emit("spawnAllowed", userId, res.data.user.id, (gameData && typeof gameData.characterSlot === "number") ? gameData.characterSlot : 0)'
    );
    fs.writeFileSync(loginPath, login);
    console.log("login.js patched for characterSlot");
  } else {
    console.log("login.js: spawnAllowed emit not found");
    const i = login.indexOf("spawnAllowed");
    console.log(login.slice(Math.max(0, i - 80), i + 120));
  }
} else {
  console.log("login.js already has characterSlot");
}

// --- spawn.js: VOA character DB binding ---
const spawnPath = path.join(base, "systems/spawn.js");
const spawnNew = `"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spawn = void 0;
const settings_1 = require("../settings");
function randomInteger(min, max) {
    const rand = min + Math.random() * (max + 1 - min);
    return Math.floor(rand);
}
class Spawn {
    constructor(log) {
        this.log = log;
        this.systemName = "Spawn";
    }
    initAsync(ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            // Expose svr for wipe polling in voa-characters-addon
            try {
                if (global.voaCharacters && typeof global.voaCharacters.setServer === "function") {
                    global.voaCharacters.setServer(ctx.svr);
                }
                else {
                    global.voaCharactersSvr = ctx.svr;
                }
            } catch (eSet) {}

            // VOA: third arg characterSlot 0|1 from gameData
            ctx.gm.on("spawnAllowed", (userId, userProfileId, characterSlot) => {
                const { startPoints } = settings_1.Settings.get();
                const slot = (typeof characterSlot === "number" && characterSlot >= 0 && characterSlot <= 1)
                    ? characterSlot
                    : 0;

                const fallbackLegacy = () => {
                    // Legacy path only if character addon/API unavailable.
                    // Prefer bound form via ordered list BUT process wipes first if possible.
                    const actors = ctx.svr.getActorsByProfileId(userProfileId) || [];
                    const ordered = actors.slice().sort((a, b) => (a >>> 0) - (b >>> 0));
                    this.log("VOA spawn LEGACY profile", userProfileId, "slot", slot, "actors", ordered.map((id) => id.toString(16)).join(","));
                    let actorId = ordered[slot];
                    if (actorId) {
                        this.log("Loading character", actorId.toString(16), "profile", userProfileId, "slot", slot);
                        ctx.svr.setEnabled(actorId, true);
                        ctx.svr.setUserActor(userId, actorId);
                        try { ctx.svr.setRaceMenuOpen(actorId, false); } catch (e) {}
                    }
                    else {
                        const idx = randomInteger(0, startPoints.length - 1);
                        actorId = ctx.svr.createActor(0, startPoints[idx].pos, startPoints[idx].angleZ, +startPoints[idx].worldOrCell, userProfileId);
                        this.log("Creating character", actorId.toString(16), "profile", userProfileId, "slot", slot);
                        ctx.svr.setUserActor(userId, actorId);
                        ctx.svr.setRaceMenuOpen(actorId, true);
                    }
                };

                if (global.voaCharacters && typeof global.voaCharacters.resolveSpawn === "function") {
                    global.voaCharacters.resolveSpawn(ctx.svr, userId, userProfileId, slot, startPoints)
                        .then(() => {
                            this.log("VOA spawn via character DB ok p" + userProfileId + " s" + slot);
                        })
                        .catch((err) => {
                            this.log("VOA spawn DB failed, fallback: " + err);
                            fallbackLegacy();
                        });
                }
                else {
                    this.log("VOA characters addon missing — legacy spawn");
                    fallbackLegacy();
                }
            });
        });
    }
    disconnect(userId, ctx) {
        // VOA: flush character DB BEFORE disabling actor (covers Alt+F4 / link drop)
        try {
            if (global.voaCharacters && typeof global.voaCharacters.onPlayerDisconnect === "function") {
                global.voaCharacters.onPlayerDisconnect(userId, ctx.svr);
            }
            else {
                const actorId = ctx.svr.getUserActor(userId);
                if (actorId !== 0 && global.voaCharacters && typeof global.voaCharacters.saveByActorFormId === "function") {
                    global.voaCharacters.saveByActorFormId(actorId, { sync: true, reason: "disconnect" });
                }
            }
        } catch (e) {
            try { this.log("VOA disconnect save failed: " + e); } catch (e2) {}
        }
        const actorId = ctx.svr.getUserActor(userId);
        if (actorId !== 0) {
            ctx.svr.setEnabled(actorId, false);
        }
    }
}
exports.Spawn = Spawn;
//# sourceMappingURL=spawn.js.map
`;
fs.writeFileSync(spawnPath, spawnNew);
console.log("spawn.js rewritten for multi-slot + character DB");

// Also patch login carefully for any remaining emit patterns
login = fs.readFileSync(loginPath, "utf8");
if (!login.includes("characterSlot")) {
  const before = login;
  login = login.replace(
    /\.emit\(["']spawnAllowed["']\s*,\s*([^,]+)\s*,\s*([^)]+)\)/g,
    (m, a, b) => {
      if (m.includes("characterSlot")) return m;
      return `.emit("spawnAllowed", ${a}, ${b}, (typeof gameData !== "undefined" && gameData && typeof gameData.characterSlot === "number") ? gameData.characterSlot : 0)`;
    }
  );
  if (login !== before) {
    fs.writeFileSync(loginPath, login);
    console.log("login.js emit patterns patched");
  } else {
    console.log("WARN: could not patch login emit — dump:");
    const i = login.indexOf("spawnAllowed");
    console.log(login.slice(Math.max(0, i - 100), i + 200));
  }
}

// Copy addon next to gamemode if path exists
const addonSrc = path.join(__dirname, "voa-characters-addon.js");
const addonDests = [
  path.join(base, "..", "gamemode", "addons", "voa-characters-addon.js"),
  path.join(base, "addons", "voa-characters-addon.js"),
  "/home/skymp/voa-server/gamemode/addons/voa-characters-addon.js",
];
for (const d of addonDests) {
  try {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(addonSrc, d);
    console.log("copied addon →", d);
  } catch (e) {
    console.log("skip addon copy", d, e.message);
  }
}

console.log("done");
console.log("Remember: require('./addons/voa-characters-addon.js') from gamemode index");
console.log("And set VOA_API_BASE + VOA_GAME_SECRET on voa-server process");
