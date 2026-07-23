"use strict";
/**
 * VOA Spawn: durable character hardlink (profile+slot → actor_form_id) + look restore.
 *
 * Race menu only for truly empty / no-appearance slots.
 * After restarts/world rebuilds, recreate actor and re-apply appearance_json from SQLite.
 */
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.Spawn = void 0;
const settings_1 = require("../settings");
const http = require("http");

const API = (process.env.VOA_API_BASE || "http://127.0.0.1:3100").replace(
  /\/$/,
  ""
);
const SECRET =
  process.env.VOA_GAME_SECRET || process.env.GAME_SERVER_SECRET || "";

function randomInteger(min, max) {
  const rand = min + Math.random() * (max + 1 - min);
  return Math.floor(rand);
}

function httpJson(method, path, body) {
  return new Promise((resolve, reject) => {
    try {
      if (!SECRET) return reject(new Error("no GAME secret"));
      const u = new URL(API + path);
      const payload = body != null ? JSON.stringify(body) : null;
      const headers = {
        Accept: "application/json",
        "X-VOA-Game-Secret": SECRET,
      };
      if (payload) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(payload);
      }
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + u.search,
          method,
          headers,
          timeout: 8000,
        },
        (res) => {
          let b = "";
          res.on("data", (c) => (b += c));
          res.on("end", () => {
            try {
              const j = b ? JSON.parse(b) : null;
              if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
              else
                reject(
                  new Error(
                    method +
                      " " +
                      path +
                      " => " +
                      res.statusCode +
                      " " +
                      b.slice(0, 160)
                  )
                );
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout " + path));
      });
      if (payload) req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** NativeGameServer wraps ScampServer as .svr — both may expose Chakra. */
function runChakra(ctx, js) {
  try {
    if (typeof ctx.svr.executeJavaScriptOnChakra === "function") {
      ctx.svr.executeJavaScriptOnChakra(js);
      return true;
    }
  } catch (e0) {}
  try {
    if (ctx.svr.svr && typeof ctx.svr.svr.executeJavaScriptOnChakra === "function") {
      ctx.svr.svr.executeJavaScriptOnChakra(js);
      return true;
    }
  } catch (e1) {}
  return false;
}

function hasValidAppearance(app) {
  if (!app || typeof app !== "object") return false;
  const raceId = Number(app.raceId) || 0;
  return raceId > 0;
}

function sanitizeAppearance(appearance) {
  const app = JSON.parse(JSON.stringify(appearance || {}));
  if (typeof app.name === "string") {
    app.name = app.name.replace(/[^\x20-\x7E]/g, "?").slice(0, 48);
  }
  if (!app.name) app.name = "Traveler";
  if (Array.isArray(app.tints)) {
    for (let i = 0; i < app.tints.length; i++) {
      const t = app.tints[i];
      if (t && typeof t.texturePath === "string") {
        // ASCII-only paths; forward slashes (backslash escapes confuse some parsers)
        t.texturePath = t.texturePath
          .replace(/[^\x20-\x7E]/g, "?")
          .replace(/\\/g, "/");
      }
    }
  }
  return app;
}

function applyAppearance(ctx, actorId, appearance, log) {
  if (!hasValidAppearance(appearance)) return false;
  try {
    const app = sanitizeAppearance(appearance);
    const json = JSON.stringify(app);
    const js =
      "try{if(typeof mp!=='undefined'&&mp){" +
      "mp.set(" +
      Number(actorId) +
      ",'appearance'," +
      json +
      ");" +
      "console.log('[VOA-spawn] appearance applied actor=" +
      Number(actorId).toString(16) +
      " race='+((" +
      Number(app.raceId) +
      ")||0).toString(16));" +
      "}}catch(e){console.log('[VOA-spawn] appearance fail '+e);}";
    const ok = runChakra(ctx, js);
    if (ok && log) log("VOA: applied appearance on " + actorId.toString(16));
    return ok;
  } catch (e) {
    if (log) log("VOA: appearance apply err " + e);
    return false;
  }
}

function applyInv(ctx, actorId, inventory, equipment, log) {
  try {
    const parts = [];
    if (inventory && typeof inventory === "object") {
      parts.push(
        "try{mp.set(" +
          Number(actorId) +
          ",'inventory'," +
          JSON.stringify(inventory) +
          ");}catch(eI){}"
      );
    }
    // equipment set may throw on some builds — skip if unsupported
    if (equipment && typeof equipment === "object") {
      parts.push(
        "try{mp.set(" +
          Number(actorId) +
          ",'equipment'," +
          JSON.stringify(equipment) +
          ");}catch(eE){}"
      );
    }
    if (!parts.length) return;
    runChakra(
      ctx,
      "try{if(typeof mp!=='undefined'&&mp){" + parts.join("") + "}}catch(e){}"
    );
  } catch (e) {
    if (log) log("VOA: inv apply err " + e);
  }
}

function applyPos(ctx, actorId, binding, log) {
  if (!binding || !binding.pos || !binding.worldOrCell) return;
  try {
    const pos = binding.pos;
    const ang =
      typeof binding.angleZ === "number" ? Number(binding.angleZ) : 0;
    // worldOrCellDesc as form id number — scamp may want desc string; try both via mp
    const cell = Number(binding.worldOrCell) || 0;
    const js =
      "try{if(typeof mp!=='undefined'&&mp){" +
      "var id=" +
      Number(actorId) +
      ";" +
      "try{mp.set(id,'worldOrCellDesc',String(" +
      cell +
      "));}catch(eW){}" +
      "try{mp.set(id,'pos',[" +
      Number(pos[0]) +
      "," +
      Number(pos[1]) +
      "," +
      Number(pos[2]) +
      "]);}catch(eP){}" +
      "try{mp.set(id,'angle',[0,0," +
      ang +
      "]);}catch(eA){}" +
      "}}catch(e){}";
    runChakra(ctx, js);
  } catch (e) {
    if (log) log("VOA: pos apply err " + e);
  }
}

function starterKit(ctx, actorId) {
  const js =
    "try{if(typeof mp!=='undefined'&&mp){" +
    "var id=" +
    Number(actorId) +
    ";" +
    "var entries=[{baseId:0x3c9fe,count:1,worn:true},{baseId:0x3ca00,count:1,worn:true}];" +
    "mp.set(id,'inventory',{entries:entries});" +
    "try{mp.set(id,'equipment',{inv:{entries:entries},numChanges:1});}catch(eE){}" +
    "if(typeof mp._voaStarterKit==='function'){mp._voaStarterKit(id);}" +
    "console.log('[VOA-starter] spawn '+id.toString(16));" +
    "}}catch(e){console.log('[VOA-starter] spawn fail '+e);}";
  runChakra(ctx, js);
}

class Spawn {
  constructor(log) {
    this.log = log;
    this.systemName = "Spawn";
  }

  initAsync(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
      ctx.gm.on("spawnAllowed", (userId, userProfileId, characterSlot) => {
        // async path — never throw into scamp
        this.spawnPlayer(ctx, userId, userProfileId, characterSlot).catch(
          (e) => {
            this.log("VOA: spawnAllowed FATAL " + e);
            console.error("VOA spawnAllowed error", e);
          }
        );
      });
    });
  }

  spawnPlayer(ctx, userId, userProfileId, characterSlot) {
    return __awaiter(this, void 0, void 0, function* () {
      const { startPoints } = settings_1.Settings.get();
      const slot =
        typeof characterSlot === "number" &&
        characterSlot >= 0 &&
        characterSlot <= 1
          ? characterSlot
          : 0;
      const profileId = Number(userProfileId) || 0;

      // 1) Durable binding from SQLite
      let binding = null;
      try {
        const data = yield httpJson(
          "GET",
          "/v1/game/character-binding?profileId=" +
            encodeURIComponent(profileId) +
            "&slot=" +
            encodeURIComponent(slot)
        );
        binding = data && data.binding;
      } catch (eB) {
        this.log("VOA: character-binding fetch fail " + eB);
      }

      const actors = (ctx.svr.getActorsByProfileId(profileId) || [])
        .map((a) => Number(a) || 0)
        .filter(Boolean);
      const ordered = actors.slice().sort((a, b) => (a >>> 0) - (b >>> 0));

      const want =
        binding && binding.actorFormId ? Number(binding.actorFormId) : 0;
      let actorId = 0;
      let isNew = false;

      if (want > 0 && actors.indexOf(want) >= 0) {
        actorId = want;
        this.log(
          "Loading HARD-LINKED character",
          actorId.toString(16),
          "profile",
          profileId,
          "slot",
          slot
        );
      } else if (want > 0) {
        this.log(
          "VOA: hardlink actor missing from world",
          want.toString(16),
          "— will recreate + rebind (look from DB)"
        );
      } else if (ordered[slot]) {
        actorId = ordered[slot];
        this.log(
          "Loading character by slot order",
          actorId.toString(16),
          "profile",
          profileId,
          "slot",
          slot,
          "of",
          ordered.length
        );
      } else if (ordered.length === 1) {
        // single actor for profile — use it for either slot if unbound
        actorId = ordered[0];
        this.log(
          "Loading sole profile actor",
          actorId.toString(16),
          "profile",
          profileId,
          "slot",
          slot
        );
      }

      const empty = !binding || binding.empty === true;
      const hasApp = hasValidAppearance(binding && binding.appearance);

      // 2) Create if needed
      if (!actorId) {
        const idx = randomInteger(0, Math.max(0, startPoints.length - 1));
        const sp = startPoints[idx] || {
          pos: [0, 0, 0],
          angleZ: 0,
          worldOrCell: 0x3c,
        };
        actorId = ctx.svr.createActor(
          0,
          sp.pos,
          sp.angleZ,
          +sp.worldOrCell,
          profileId
        );
        isNew = true;
        this.log(
          "Creating NEW character",
          actorId.toString(16),
          "profile",
          profileId,
          "slot",
          slot,
          hasApp ? "(will restore look from DB)" : "(race menu)"
        );
      } else {
        try {
          ctx.svr.setEnabled(actorId, true);
        } catch (eEn) {
          this.log("VOA: setEnabled failed", actorId.toString(16), String(eEn));
        }
      }

      // 3) Restore look BEFORE setUserActor so createActor packet includes look
      // Race menu only when slot empty OR no appearance anywhere
      const needRace = empty || !hasApp;
      if (hasApp) {
        applyAppearance(ctx, actorId, binding.appearance, this.log.bind(this));
      }
      try {
        ctx.svr.setRaceMenuOpen(actorId, needRace);
      } catch (eRm) {}

      // 4) Attach user
      try {
        ctx.svr.setUserActor(userId, actorId);
        this.log(
          "VOA: setUserActor ok user",
          userId,
          "actor",
          actorId.toString(16),
          needRace ? "RACE" : "NO-RACE"
        );
      } catch (eUa) {
        this.log(
          "VOA: setUserActor FAILED",
          userId,
          actorId.toString(16),
          String(eUa)
        );
        try {
          ctx.svr.setEnabled(actorId, true);
          ctx.svr.setUserActor(userId, actorId);
        } catch (e2) {
          this.log("VOA: setUserActor retry fail " + e2);
        }
      }

      // 5) Hardlink slot → actor (idempotent)
      if (SECRET && !empty) {
        try {
          yield httpJson("POST", "/v1/game/character-bind", {
            profileId,
            slot,
            actorFormId: actorId,
          });
          this.log(
            "VOA: hardlink p" +
              profileId +
              " s" +
              slot +
              " → " +
              actorId.toString(16)
          );
        } catch (eBind) {
          this.log("VOA: hardlink fail " + eBind);
        }
      }

      // 6) One delayed look re-apply only (spam was thrashing ChangeForms + UTF-8 tick errors)
      if (hasApp && !needRace) {
        const app = binding.appearance;
        const aid = actorId;
        const self = this;
        setTimeout(function () {
          applyAppearance(ctx, aid, app, self.log.bind(self));
          try {
            ctx.svr.setRaceMenuOpen(aid, false);
          } catch (e) {}
        }, 800);
      }

      // 7) Pos / inventory from durable DB
      // Never re-apply iron chargen leftovers after a wipe/new actor.
      // Starter kit owns gear for brand-new characters.
      if (!empty && binding && !isNew) {
        applyPos(ctx, actorId, binding, this.log.bind(this));
        applyInv(
          ctx,
          actorId,
          binding.inventory,
          binding.equipment,
          this.log.bind(this)
        );
      } else if (!empty && binding && isNew) {
        // New world actor: still restore position if we have one, never old iron kit
        applyPos(ctx, actorId, binding, this.log.bind(this));
      }

      // 8) Starter kit: race menu OR brand-new world actor (even if look restored from DB).
      // Previously only needRace — so "NEW character + appearance from DB" kept iron armor.
      if (needRace || isNew) {
        starterKit(ctx, actorId);
        const aid = actorId;
        setTimeout(() => starterKit(ctx, aid), 1500);
        setTimeout(() => starterKit(ctx, aid), 5000);
        setTimeout(() => starterKit(ctx, aid), 12000);
      }

      // 9) Persist hardlink only — do NOT re-post appearance/name here
      // (was overwriting good names like Paarthurnax with stale "Prisoner" from look dump)
      if (SECRET && !empty) {
        try {
          yield httpJson("POST", "/v1/game/character-state", {
            profileId,
            slot,
            actorFormId: actorId,
            reason: "spawn-hardlink",
          });
        } catch (eSt) {
          // non-fatal
        }
      }
    });
  }

  disconnect(userId, ctx) {
    const actorId = ctx.svr.getUserActor(userId);
    if (actorId !== 0) ctx.svr.setEnabled(actorId, false);
  }
}
exports.Spawn = Spawn;
