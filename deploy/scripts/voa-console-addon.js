/**
 * VOA: Discord-staff console commands (server side).
 *
 * Client sends CustomEvent _voaConsole [profileId, commandName, argsJson]
 * instead of native ConsoleCommand (VPS scamp only allows ancient hardcoded profileIds).
 *
 * Staff list is refreshed from API (Founder / SGM / GM roles or allow-list).
 *
 * Env: VOA_API_BASE, VOA_GAME_SECRET (same as character addon)
 */
(function () {
  var API_BASE = String(
    (typeof process !== "undefined" && process.env && process.env.VOA_API_BASE) ||
      "http://127.0.0.1:3100"
  ).replace(/\/$/, "");
  var SECRET = String(
    (typeof process !== "undefined" && process.env && process.env.VOA_GAME_SECRET) ||
      (typeof process !== "undefined" && process.env && process.env.GAME_SERVER_SECRET) ||
      ""
  );

  /** profileId -> { isStaff, at } */
  var staffCache = Object.create(null);
  var STAFF_TTL_MS = 60 * 1000;

  function log(msg) {
    try {
      console.log("[VOA-console] " + msg);
    } catch (e) {}
  }

  function httpGetJson(path) {
    return new Promise(function (resolve, reject) {
      try {
        var http = require("http");
        var https = require("https");
        var u = new URL(API_BASE + path);
        var lib = u.protocol === "https:" ? https : http;
        var req = lib.request(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === "https:" ? 443 : 80),
            path: u.pathname + u.search,
            method: "GET",
            headers: {
              Accept: "application/json",
              "X-VOA-Game-Secret": SECRET,
            },
            timeout: 5000,
          },
          function (res) {
            var chunks = [];
            res.on("data", function (c) {
              chunks.push(c);
            });
            res.on("end", function () {
              var text = Buffer.concat(chunks).toString("utf8");
              try {
                resolve({ status: res.statusCode, data: text ? JSON.parse(text) : null });
              } catch (e) {
                reject(e);
              }
            });
          }
        );
        req.on("error", reject);
        req.on("timeout", function () {
          req.destroy();
          reject(new Error("timeout"));
        });
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  function isStaffCached(profileId) {
    var e = staffCache[profileId];
    if (!e) return null;
    if (Date.now() - e.at > STAFF_TTL_MS) return null;
    return e.isStaff;
  }

  function checkStaff(profileId) {
    var cached = isStaffCached(profileId);
    if (cached != null) return Promise.resolve(cached);
    if (!SECRET && !profileId) return Promise.resolve(false);
    var path =
      "/v1/game/is-staff?profileId=" +
      encodeURIComponent(String(profileId)) +
      (SECRET ? "&secret=" + encodeURIComponent(SECRET) : "");
    // Prefer secret header path
    var qs =
      "/v1/game/is-staff?profileId=" +
      encodeURIComponent(String(profileId)) +
      (SECRET ? "&secret=" + encodeURIComponent(SECRET) : "");
    return httpGetJson(qs)
      .then(function (res) {
        var ok = !!(res.data && res.data.isStaff === true);
        staffCache[profileId] = { isStaff: ok, at: Date.now() };
        return ok;
      })
      .catch(function () {
        return false;
      });
  }

  function addItem(actorId, itemId, count) {
    if (typeof mp === "undefined" || !mp) return;
    count = count > 0 ? count : 1;
    var inv = { entries: [] };
    try {
      inv = mp.get(actorId, "inventory") || { entries: [] };
    } catch (e0) {
      inv = { entries: [] };
    }
    if (!inv.entries) inv.entries = [];
    var found = false;
    for (var i = 0; i < inv.entries.length; i++) {
      if (Number(inv.entries[i].baseId) === Number(itemId)) {
        inv.entries[i].count = Number(inv.entries[i].count || 0) + count;
        found = true;
        break;
      }
    }
    if (!found) {
      inv.entries.push({ baseId: Number(itemId), count: count });
    }
    mp.set(actorId, "inventory", inv);
  }

  if (typeof mp === "undefined" || !mp) {
    log("mp missing — skip");
    return;
  }

  mp["_voaConsole"] = function (senderFormId, profileId, commandName, argsJson) {
    try {
      var pid = Number(profileId) || 0;
      var actorId = Number(senderFormId) || 0;
      var cmd = String(commandName || "").toLowerCase();
      var args = [];
      try {
        args = typeof argsJson === "string" ? JSON.parse(argsJson) : argsJson || [];
      } catch (e) {
        args = [];
      }
      if (!actorId) return;

      checkStaff(pid).then(function (ok) {
        if (!ok) {
          log("DENIED p" + pid + " cmd=" + cmd);
          return;
        }
        log("ALLOW p" + pid + " cmd=" + cmd + " args=" + JSON.stringify(args));
        try {
          if (cmd === "additem") {
            // args: [targetRef, itemBaseId, count]
            var itemId = Number(args[1]);
            var count = Number(args[2]) || 1;
            var target = Number(args[0]);
            // 0x14 or self remote id → actor
            if (!target || target === 0x14) target = actorId;
            addItem(target === 0x14 ? actorId : target, itemId, count);
            // If target was player remote id equal to self
            if (target !== actorId && target > 0xff000000) {
              try {
                addItem(target, itemId, count);
              } catch (eT) {}
            }
            // Always ensure player gets item when targeting self forms
            addItem(actorId, itemId, count);
          } else if (cmd === "disable") {
            // Best-effort: cannot fully disable arbitrary refs from gamemode on all builds
            log("disable requested (no-op / limited on this server build)");
          } else if (cmd === "placeatme") {
            log("placeatme requested (limited — use additem for items)");
          } else if (cmd === "mp") {
            log("mp subcommand: " + JSON.stringify(args));
          } else {
            log("unknown cmd " + cmd);
          }
        } catch (eRun) {
          log("execute error: " + eRun);
        }
      });
    } catch (eAll) {
      log("handler: " + eAll);
    }
  };

  // Warm staff cache when actors go online (optional)
  setInterval(function () {
    // nothing heavy
  }, 60000);

  log("loaded — console locked to Discord staff via _voaConsole");
})();
