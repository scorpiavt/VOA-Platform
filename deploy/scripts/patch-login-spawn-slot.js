/**
 * Patch VPS dist_back login.js + spawn.js to honor gameData.characterSlot (0|1).
 * Run on VPS: node patch-login-spawn-slot.js
 */
const fs = require("fs");
const path = require("path");

const base = "/home/skymp/voa-server/dist_back";

// --- login.js: pass characterSlot to spawnAllowed ---
const loginPath = path.join(base, "systems/login.js");
let login = fs.readFileSync(loginPath, "utf8");

if (!login.includes("characterSlot")) {
  // offlineMode path: emit("spawnAllowed", userId, profileId)
  // Replace with emit including characterSlot from gameData
  const patterns = [
    {
      // minified-ish
      find: 'this.log(userId + " logged as " + profileId)',
      // leave log as-is
    },
  ];

  // Common compiled form from TS:
  // ctx.gm.emit("spawnAllowed", userId, profileId);
  if (login.includes('emit("spawnAllowed"')) {
    login = login.replace(
      /ctx\.gm\.emit\("spawnAllowed",\s*userId,\s*profileId\)/g,
      'ctx.gm.emit("spawnAllowed", userId, profileId, (gameData && typeof gameData.characterSlot === "number") ? gameData.characterSlot : 0)'
    );
    // also online master path may use res.data.user.id as profile
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

// --- spawn.js: pick actor by slot index ---
const spawnPath = path.join(base, "systems/spawn.js");
let spawn = fs.readFileSync(spawnPath, "utf8");

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
            // VOA: third arg characterSlot 0|1 from gameData
            ctx.gm.on("spawnAllowed", (userId, userProfileId, characterSlot) => {
                const { startPoints } = settings_1.Settings.get();
                const slot = (typeof characterSlot === "number" && characterSlot >= 0 && characterSlot <= 1)
                    ? characterSlot
                    : 0;
                const actors = ctx.svr.getActorsByProfileId(userProfileId) || [];
                // Stable order: sort ascending so slot indices stay consistent
                const ordered = actors.slice().sort((a, b) => a - b);
                let actorId = ordered[slot];
                if (actorId) {
                    this.log("Loading character", actorId.toString(16), "profile", userProfileId, "slot", slot);
                    ctx.svr.setEnabled(actorId, true);
                    ctx.svr.setUserActor(userId, actorId);
                    try { ctx.svr.setRaceMenuOpen(actorId, false); } catch (e) {}
                }
                else {
                    // Only create if this is the next free slot (no holes beyond length)
                    // If slot 1 requested but only 0 exists, create as actors[1]
                    // If slot 0 empty but slot 1 exists (deleted 0), create new for slot 0 at end — index by ordered length
                    const idx = randomInteger(0, startPoints.length - 1);
                    actorId = ctx.svr.createActor(0, startPoints[idx].pos, startPoints[idx].angleZ, +startPoints[idx].worldOrCell, userProfileId);
                    this.log("Creating character", actorId.toString(16), "profile", userProfileId, "slot", slot);
                    ctx.svr.setUserActor(userId, actorId);
                    ctx.svr.setRaceMenuOpen(actorId, true);
                }
            });
        });
    }
    disconnect(userId, ctx) {
        const actorId = ctx.svr.getUserActor(userId);
        if (actorId !== 0)
            ctx.svr.setEnabled(actorId, false);
    }
}
exports.Spawn = Spawn;
//# sourceMappingURL=spawn.js.map
`;
fs.writeFileSync(spawnPath, spawnNew);
console.log("spawn.js rewritten for multi-slot");

// Also patch login carefully for any remaining emit patterns
login = fs.readFileSync(loginPath, "utf8");
if (!login.includes("characterSlot")) {
  // try more patterns from compiled login
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

console.log("done");
