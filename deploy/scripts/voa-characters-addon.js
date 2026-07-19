/**
 * VOA character DB bridge (gamemode addon).
 *
 * - Polls API for pending character wipes (launcher delete) → destroyActor
 * - On spawnAllowed: bind slot → actor via API (never reuse deleted Roman)
 * - Periodically + on disconnect: save name/pos/equipment/inventory to API
 *
 * Env (process / server settings):
 *   VOA_API_BASE=http://127.0.0.1:3100
 *   VOA_GAME_SECRET=...   (must match API GAME_SERVER_SECRET)
 *
 * Load from gamemode.js: require("./addons/voa-characters-addon.js")
 * or drop into gamemode and call from index.
 *
 * NOTE: destroyActor / getActorsByProfileId live on ctx.svr (systems), not mp.
 * This file registers mp custom events + a timer; spawn still needs spawn.js
 * patch that calls the same API. Expose helpers on global.voaCharacters.
 */
(function () {
  var API_BASE = String(
    (typeof process !== "undefined" &&
      process.env &&
      process.env.VOA_API_BASE) ||
      "http://127.0.0.1:3100"
  ).replace(/\/$/, "");
  var SECRET = String(
    (typeof process !== "undefined" &&
      process.env &&
      process.env.VOA_GAME_SECRET) ||
      (typeof process !== "undefined" &&
        process.env &&
        process.env.GAME_SERVER_SECRET) ||
      ""
  );

  function log(msg) {
    try {
      console.log("[VOA-chars] " + msg);
    } catch (e) {}
  }

  function httpJson(method, path, body) {
    return new Promise(function (resolve, reject) {
      try {
        var http = require("http");
        var https = require("https");
        var u = new URL(API_BASE + path);
        var lib = u.protocol === "https:" ? https : http;
        var payload = body != null ? JSON.stringify(body) : null;
        var headers = {
          Accept: "application/json",
          "X-VOA-Game-Secret": SECRET,
        };
        if (payload) {
          headers["Content-Type"] = "application/json";
          headers["Content-Length"] = Buffer.byteLength(payload);
        }
        var req = lib.request(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === "https:" ? 443 : 80),
            path: u.pathname + u.search,
            method: method,
            headers: headers,
            timeout: 8000,
          },
          function (res) {
            var chunks = [];
            res.on("data", function (c) {
              chunks.push(c);
            });
            res.on("end", function () {
              var text = Buffer.concat(chunks).toString("utf8");
              var data = null;
              try {
                data = text ? JSON.parse(text) : null;
              } catch (e) {
                data = { raw: text };
              }
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(data);
              } else {
                reject(
                  new Error(
                    method +
                      " " +
                      path +
                      " => " +
                      res.statusCode +
                      " " +
                      text.slice(0, 200)
                  )
                );
              }
            });
          }
        );
        req.on("error", reject);
        req.on("timeout", function () {
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

  /**
   * Best-effort synchronous POST for disconnect / process exit.
   * Async requests are often killed when the peer drops or PM2 restarts.
   */
  function httpJsonSync(method, path, body) {
    if (!SECRET) return false;
    try {
      var { execFileSync } = require("child_process");
      var url = API_BASE + path;
      var payload = body != null ? JSON.stringify(body) : "";
      var args = [
        "-sS",
        "-X",
        method,
        "-H",
        "Content-Type: application/json",
        "-H",
        "X-VOA-Game-Secret: " + SECRET,
        "--max-time",
        "4",
        "--connect-timeout",
        "2",
      ];
      if (payload) {
        args.push("-d", payload);
      }
      args.push(url);
      execFileSync("curl", args, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      return true;
    } catch (eCurl) {
      // Fall back to async (may still complete if process lives)
      try {
        httpJson(method, path, body).catch(function () {});
      } catch (e2) {}
      return false;
    }
  }

  /** Snapshot actor via gamemode mp API */
  function snapshotActor(actorId) {
    var out = {
      actorFormId: actorId,
      name: null,
      pos: null,
      angleZ: null,
      worldOrCell: null,
      equipment: null,
      inventory: null,
      appearance: null,
    };
    if (typeof mp === "undefined" || !mp) return out;
    try {
      var app = mp.get(actorId, "appearance");
      if (app && typeof app === "object") {
        out.appearance = app;
        if (typeof app.name === "string") out.name = app.name;
      }
    } catch (e0) {}
    try {
      var pos = mp.get(actorId, "pos");
      if (Array.isArray(pos) && pos.length >= 3) {
        out.pos = [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0];
      }
    } catch (e1) {}
    try {
      var ang = mp.get(actorId, "angle");
      if (Array.isArray(ang) && ang.length >= 3) {
        out.angleZ = Number(ang[2]) || 0;
      }
    } catch (e2) {}
    try {
      // Some builds expose worldOrCell / cellOrWorld as props
      var w =
        mp.get(actorId, "worldOrCell") ||
        mp.get(actorId, "cellOrWorld") ||
        mp.get(actorId, "worldOrCellDesc");
      if (typeof w === "number") out.worldOrCell = w;
    } catch (e3) {}
    try {
      out.equipment = mp.get(actorId, "equipment");
    } catch (e4) {}
    try {
      out.inventory = mp.get(actorId, "inventory");
    } catch (e5) {}
    return out;
  }

  // profileId+slot → actorFormId for online savers
  var live = Object.create(null);
  // actorFormId → { profileId, slot }
  var byActor = Object.create(null);

  function trackLive(profileId, slot, actorFormId) {
    var key = profileId + ":" + slot;
    live[key] = actorFormId;
    byActor[actorFormId] = { profileId: profileId, slot: slot };
  }

  function untrackActor(actorFormId) {
    var meta = byActor[actorFormId];
    if (meta) {
      delete live[meta.profileId + ":" + meta.slot];
      delete byActor[actorFormId];
    }
  }

  function buildStateBody(profileId, slot, actorFormId) {
    var snap = snapshotActor(actorFormId);
    return {
      profileId: profileId,
      slot: slot,
      actorFormId: actorFormId,
      name: snap.name,
      worldOrCell: snap.worldOrCell,
      pos: snap.pos,
      angleZ: snap.angleZ,
      equipment: snap.equipment,
      inventory: snap.inventory,
      appearance: snap.appearance,
      reason: "periodic",
    };
  }

  function saveActor(profileId, slot, actorFormId, opts) {
    opts = opts || {};
    if (!SECRET) return Promise.resolve(false);
    if (!(actorFormId > 0)) return Promise.resolve(false);
    var body = buildStateBody(profileId, slot, actorFormId);
    if (opts.reason) body.reason = opts.reason;

    // Disconnect / forced exit: block until flush so state is not lost
    if (opts.sync) {
      body.reason = opts.reason || "disconnect";
      var ok = httpJsonSync("POST", "/v1/game/character-state", body);
      log(
        (ok ? "sync-saved" : "sync-save-fallback") +
          " p" +
          profileId +
          " s" +
          slot +
          " actor=" +
          actorFormId.toString(16) +
          " reason=" +
          body.reason
      );
      return Promise.resolve(ok);
    }

    return httpJson("POST", "/v1/game/character-state", body)
      .then(function () {
        log(
          "saved p" +
            profileId +
            " s" +
            slot +
            " actor=" +
            actorFormId.toString(16) +
            (body.name ? " name=" + body.name : "")
        );
        return true;
      })
      .catch(function (e) {
        log("save failed: " + e);
        return false;
      });
  }

  function saveAllLive(opts) {
    opts = opts || {};
    var keys = Object.keys(live);
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      var parts = keys[i].split(":");
      var pid = Number(parts[0]);
      var sl = Number(parts[1]);
      var aid = live[keys[i]];
      try {
        saveActor(pid, sl, aid, opts);
        n++;
      } catch (e) {
        log("saveAll live key " + keys[i] + ": " + e);
      }
    }
    if (n) log("saveAllLive n=" + n + " reason=" + (opts.reason || "batch"));
    return n;
  }

  /**
   * Process wipe queue. Needs destroyActor from systems context.
   * Call from spawn.js: global.voaCharacters.processWipes(ctx.svr)
   */
  function processWipes(svr) {
    if (!SECRET || !svr || typeof svr.destroyActor !== "function") {
      return Promise.resolve(0);
    }
    return httpJson("GET", "/v1/game/pending-wipes")
      .then(function (data) {
        var wipes = (data && data.wipes) || [];
        if (!wipes.length) return 0;
        var doneIds = [];
        for (var i = 0; i < wipes.length; i++) {
          var w = wipes[i];
          var formId = Number(w.actorFormId);
          try {
            if (formId > 0) {
              // Disable first so no user stays attached
              try {
                if (typeof svr.setEnabled === "function") {
                  svr.setEnabled(formId, false);
                }
              } catch (e0) {}
              try {
                var uid =
                  typeof svr.getUserByActor === "function"
                    ? svr.getUserByActor(formId)
                    : 0;
                if (uid && typeof svr.kick === "function") {
                  try {
                    svr.kick(uid);
                  } catch (eK) {}
                }
              } catch (e1) {}
              svr.destroyActor(formId);
              log(
                "destroyActor " +
                  formId.toString(16) +
                  " profile=" +
                  w.profileId +
                  " wipeId=" +
                  w.id
              );
              untrackActor(formId);
            }
            doneIds.push(Number(w.id));
          } catch (e) {
            log("destroy failed " + formId + ": " + e);
            // still ack to avoid infinite loop on missing forms
            doneIds.push(Number(w.id));
          }
        }
        if (doneIds.length) {
          return httpJson("POST", "/v1/game/pending-wipes/ack", {
            ids: doneIds,
          }).then(function () {
            return doneIds.length;
          });
        }
        return 0;
      })
      .catch(function (e) {
        log("wipe poll failed: " + e);
        return 0;
      });
  }

  /**
   * Resolve which actor to load for profile+slot. Creates if needed.
   * Call from spawn.js with ctx.svr + startPoints.
   */
  function resolveSpawn(svr, userId, profileId, slot, startPoints) {
    slot = slot >= 0 && slot <= 1 ? slot : 0;
    return processWipes(svr)
      .then(function () {
        // Report orphans so deleted slots can't leave ghosts
        var all = [];
        try {
          all = svr.getActorsByProfileId(profileId) || [];
        } catch (e) {
          all = [];
        }
        return httpJson("POST", "/v1/game/orphan-actors", {
          profileId: profileId,
          actorFormIds: all,
        })
          .then(function () {
            return processWipes(svr);
          })
          .then(function () {
            return httpJson(
              "GET",
              "/v1/game/character-binding?profileId=" +
                encodeURIComponent(profileId) +
                "&slot=" +
                encodeURIComponent(slot)
            );
          });
      })
      .then(function (data) {
        var binding = data && data.binding;
        if (!binding || binding.empty) {
          throw new Error(
            "Launcher slot empty for profile " + profileId + " slot " + slot
          );
        }
        var want = binding.actorFormId ? Number(binding.actorFormId) : 0;
        var allSlots = (data && data.allSlots) || [];
        var boundSet = {};
        for (var bi = 0; bi < allSlots.length; bi++) {
          var af = allSlots[bi] && allSlots[bi].actorFormId;
          if (af) boundSet[Number(af)] = true;
        }
        var actors = [];
        try {
          actors = (svr.getActorsByProfileId(profileId) || [])
            .slice()
            .sort(function (a, b) {
              return (a >>> 0) - (b >>> 0);
            });
        } catch (e2) {
          actors = [];
        }
        var actorId = 0;
        if (want > 0 && actors.indexOf(want) >= 0) {
          actorId = want;
        } else if (want > 0) {
          log(
            "bound actor missing " +
              want.toString(16) +
              " — creating new for slot " +
              slot
          );
        }

        // One-time migration: slot has no actor_form_id yet — claim ordered[slot]
        // only if that form is not already bound to another slot.
        if (!actorId && !want) {
          var candidate = actors[slot];
          if (candidate && !boundSet[candidate]) {
            actorId = candidate;
            log(
              "migrate-bind slot " +
                slot +
                " → " +
                actorId.toString(16) +
                " (legacy unbound actor)"
            );
            return httpJson("POST", "/v1/game/character-bind", {
              profileId: profileId,
              slot: slot,
              actorFormId: actorId,
            }).then(function () {
              return { actorId: actorId, isNew: false, binding: binding };
            });
          }
        }

        if (!actorId) {
          var sp = startPoints && startPoints.length ? startPoints : null;
          var idx = sp ? Math.floor(Math.random() * sp.length) : 0;
          var pos = sp
            ? sp[idx].pos
            : [22659, -8697, -3594];
          var angleZ = sp ? sp[idx].angleZ : 0;
          var world = sp ? +sp[idx].worldOrCell : 0x3c;
          actorId = svr.createActor(0, pos, angleZ, world, profileId);
          log(
            "createActor " +
              actorId.toString(16) +
              " p" +
              profileId +
              " s" +
              slot
          );
          return httpJson("POST", "/v1/game/character-bind", {
            profileId: profileId,
            slot: slot,
            actorFormId: actorId,
          }).then(function () {
            return { actorId: actorId, isNew: true, binding: binding };
          });
        }
        return { actorId: actorId, isNew: false, binding: binding };
      })
      .then(function (res) {
        var actorId = res.actorId;
        svr.setEnabled(actorId, true);
        svr.setUserActor(userId, actorId);
        try {
          svr.setRaceMenuOpen(actorId, !!res.isNew);
        } catch (e3) {}
        // Apply saved position if we have it and not brand new
        if (!res.isNew && res.binding && res.binding.pos && res.binding.worldOrCell) {
          try {
            if (typeof mp !== "undefined" && mp) {
              mp.set(actorId, "pos", res.binding.pos);
              if (typeof res.binding.angleZ === "number") {
                mp.set(actorId, "angle", [0, 0, res.binding.angleZ]);
              }
            }
          } catch (e4) {}
        }
        // Apply saved inventory/equipment if present
        if (!res.isNew && res.binding) {
          try {
            if (res.binding.inventory && typeof mp !== "undefined") {
              mp.set(actorId, "inventory", res.binding.inventory);
            }
          } catch (e5) {}
          try {
            if (res.binding.equipment && typeof mp !== "undefined") {
              mp.set(actorId, "equipment", res.binding.equipment);
            }
          } catch (e6) {}
        }
        trackLive(profileId, slot, actorId);
        log(
          "spawn user=" +
            userId +
            " p" +
            profileId +
            " s" +
            slot +
            " actor=" +
            actorId.toString(16) +
            (res.isNew ? " NEW" : " LOAD")
        );
        return res;
      });
  }

  // CustomEvent from client: full state + map markers
  if (typeof mp !== "undefined" && mp) {
    mp["_voaCharacterState"] = function (
      senderFormId,
      profileId,
      slot,
      stateJson
    ) {
      try {
        var pid = Number(profileId) || 0;
        var sl = Number(slot);
        if (!(sl >= 0 && sl <= 1)) sl = 0;
        var state = {};
        if (typeof stateJson === "string") {
          try {
            state = JSON.parse(stateJson);
          } catch (e) {
            state = {};
          }
        } else if (stateJson && typeof stateJson === "object") {
          state = stateJson;
        }
        var actorId = Number(senderFormId) || 0;
        if (!pid && byActor[actorId]) {
          pid = byActor[actorId].profileId;
          sl = byActor[actorId].slot;
        }
        if (!pid) return;
        trackLive(pid, sl, actorId);
        var snap = snapshotActor(actorId);
        httpJson("POST", "/v1/game/character-state", {
          profileId: pid,
          slot: sl,
          actorFormId: actorId,
          name: state.name || snap.name,
          worldOrCell: state.worldOrCell || snap.worldOrCell,
          pos: state.pos || snap.pos,
          angleZ:
            typeof state.angleZ === "number" ? state.angleZ : snap.angleZ,
          equipment: state.equipment || snap.equipment,
          inventory: state.inventory || snap.inventory,
          appearance: state.appearance || snap.appearance,
          mapMarkers: state.mapMarkers,
        }).catch(function (e) {
          log("client state save failed: " + e);
        });
      } catch (eAll) {
        log("state handler: " + eAll);
      }
    };
  }

  // Periodic save of live characters (also covers soft disconnect races)
  setInterval(function () {
    if (!SECRET) return;
    saveAllLive({ reason: "interval" });
  }, 20000);

  /**
   * Staff moderation queue: wipe inv/eq/spells, kick banned, etc.
   */
  function processAdminActions(svr) {
    if (!SECRET) return Promise.resolve(0);
    return httpJson("GET", "/v1/game/pending-admin-actions")
      .then(function (data) {
        var actions = (data && data.actions) || [];
        if (!actions.length) return 0;
        var doneIds = [];
        for (var i = 0; i < actions.length; i++) {
          var a = actions[i];
          var formId = Number(a.actorFormId) || 0;
          try {
            if (
              (a.action === "wipe_inventory" ||
                a.action === "wipe_equipment") &&
              formId > 0 &&
              typeof mp !== "undefined" &&
              mp
            ) {
              try {
                mp.set(formId, "inventory", { entries: [] });
              } catch (eInv) {}
              if (a.action === "wipe_equipment") {
                try {
                  mp.set(formId, "equipment", {
                    inv: { entries: [] },
                    numChanges: 0,
                  });
                } catch (eEq) {}
              }
              log("admin " + a.action + " actor=" + formId.toString(16));
            } else if (a.action === "wipe_spells" && formId > 0 && typeof mp !== "undefined" && mp) {
              // Clear learnedSpells prop if present
              try {
                mp.set(formId, "learnedSpells", []);
              } catch (eSp) {
                try {
                  var app = mp.get(formId, "appearance") || {};
                  if (app && typeof app === "object") {
                    app.learnedSpells = [];
                    mp.set(formId, "appearance", app);
                  }
                } catch (eSp2) {}
              }
              log("admin wipe_spells actor=" + formId.toString(16));
            } else if (
              (a.action === "ban" || a.action === "delete_character") &&
              svr &&
              formId > 0
            ) {
              try {
                var uid =
                  typeof svr.getUserByActor === "function"
                    ? svr.getUserByActor(formId)
                    : 0;
                if (uid && typeof svr.kick === "function") {
                  svr.kick(uid);
                  log("admin kick user=" + uid + " action=" + a.action);
                }
              } catch (eK) {}
              if (a.action === "delete_character" && typeof svr.destroyActor === "function") {
                try {
                  svr.setEnabled(formId, false);
                } catch (eEn) {}
                try {
                  svr.destroyActor(formId);
                  log("admin destroyActor " + formId.toString(16));
                } catch (eD) {}
              }
            } else if (a.action === "reset_position" && formId > 0 && typeof mp !== "undefined") {
              // Gamemode may re-apply start point on next spawn; no-op if offline
              log("admin reset_position noted for " + formId.toString(16));
            }
            doneIds.push(Number(a.id));
          } catch (eA) {
            log("admin action failed " + a.id + ": " + eA);
            doneIds.push(Number(a.id));
          }
        }
        if (doneIds.length) {
          return httpJson("POST", "/v1/game/pending-admin-actions/ack", {
            ids: doneIds,
          }).then(function () {
            return doneIds.length;
          });
        }
        return 0;
      })
      .catch(function (e) {
        log("admin actions poll: " + e);
        return 0;
      });
  }

  // Wipe poll + admin actions even without spawns
  setInterval(function () {
    // needs svr — skip if not injected
    if (global.voaCharactersSvr) {
      processWipes(global.voaCharactersSvr);
      processAdminActions(global.voaCharactersSvr);
    } else {
      processAdminActions(null);
    }
  }, 15000);

  function saveByActorFormId(actorFormId, opts) {
    var meta = byActor[actorFormId];
    if (!meta) return Promise.resolve(false);
    return saveActor(meta.profileId, meta.slot, actorFormId, opts || {});
  }

  /**
   * Player disconnect (network drop, Alt+F4 after TCP dies, kick).
   * Always sync-flush before setEnabled(false).
   */
  function onPlayerDisconnect(userId, svr) {
    try {
      if (svr && typeof svr.getUserActor === "function") {
        var actorId = svr.getUserActor(userId);
        if (actorId) {
          saveByActorFormId(actorId, { sync: true, reason: "disconnect" });
        }
      }
    } catch (e) {
      log("onPlayerDisconnect: " + e);
    }
  }

  // Process-level flush (PM2 restart, SIGTERM, crash handlers)
  function installProcessFlush() {
    var flushing = false;
    function flush(reason) {
      if (flushing) return;
      flushing = true;
      try {
        saveAllLive({ sync: true, reason: reason || "process-exit" });
      } catch (e) {
        log("process flush: " + e);
      }
    }
    try {
      process.on("SIGTERM", function () {
        flush("SIGTERM");
      });
      process.on("SIGINT", function () {
        flush("SIGINT");
      });
      process.on("beforeExit", function () {
        flush("beforeExit");
      });
      process.on("exit", function () {
        // last chance — sync only
        try {
          saveAllLive({ sync: true, reason: "exit" });
        } catch (e) {}
      });
      // Uncaught errors: still try to persist players
      process.on("uncaughtException", function (err) {
        log("uncaughtException — flushing characters: " + err);
        flush("uncaughtException");
      });
    } catch (eInst) {
      log("process handlers: " + eInst);
    }
  }
  installProcessFlush();

  // Hook scamp connect/disconnect if svr is already present later via setServer
  function hookServerEvents(svr) {
    if (!svr || svr._voaCharsHooked) return;
    try {
      if (typeof svr.on === "function") {
        svr.on("disconnect", function (userId) {
          onPlayerDisconnect(userId, svr);
        });
        svr._voaCharsHooked = true;
        log("hooked svr disconnect for character flush");
      }
    } catch (eH) {
      log("hookServerEvents: " + eH);
    }
  }

  global.voaCharacters = {
    processWipes: processWipes,
    resolveSpawn: resolveSpawn,
    saveActor: saveActor,
    saveByActorFormId: saveByActorFormId,
    saveAllLive: saveAllLive,
    onPlayerDisconnect: onPlayerDisconnect,
    trackLive: trackLive,
    setServer: function (svr) {
      global.voaCharactersSvr = svr;
      hookServerEvents(svr);
    },
    API_BASE: API_BASE,
    hasSecret: !!SECRET,
  };

  log(
    "loaded api=" +
      API_BASE +
      " secret=" +
      (SECRET ? "yes" : "NO — set VOA_GAME_SECRET") +
      " (save on disconnect/exit enabled)"
  );
})();
