// VOA Downed / Revive / Temple Respawn — SERVER AUTHORITATIVE
// Client only sends CustomEvents; teleport/heal/isDead live on the server so MP syncs.
(function () {
  try {
    if (typeof mp === "undefined" || !mp) {
      console.log("[VOA-downed] mp missing, skip");
      return;
    }

    var DOWNED_MS = 60000;
    var timers = {};
    var downedAt = {};
    var TAMRIEL = 0x3c;
    // Outdoor temple / city shrines (Tamriel exterior)
    var TEMPLES = [
      { name: "Whiterun", pos: [22645, -10335, -3550] },
      { name: "Solitude", pos: [-55648, 102080, -8448] },
      { name: "Riften", pos: [174176, -90432, 11008] },
      { name: "Markarth", pos: [-172416, 4656, -4608] },
      { name: "Windhelm", pos: [133696, 36112, -12224] },
      { name: "Falkreath", pos: [-31872, -75008, -3200] },
      { name: "Morthal", pos: [-39296, 59904, -13600] },
      { name: "Dawnstar", pos: [30112, 102080, -13440] },
      { name: "Winterhold", pos: [114816, 102272, -13440] }
    ];

    function log(msg) {
      try {
        console.log("[VOA-downed] " + msg);
      } catch (e) {}
    }

    function getPos(formId) {
      try {
        var p = mp.get(formId, "pos");
        if (p && p.length >= 3) return [Number(p[0]), Number(p[1]), Number(p[2])];
      } catch (e) {}
      return [22645, -10335, -3550];
    }

    function nearestTemple(pos) {
      var best = TEMPLES[0];
      var bestD = 1e300;
      for (var i = 0; i < TEMPLES.length; i++) {
        var t = TEMPLES[i];
        var dx = t.pos[0] - pos[0];
        var dy = t.pos[1] - pos[1];
        var d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      return best;
    }

    function clearTimer(formId) {
      if (timers[formId] != null) {
        try {
          clearTimeout(timers[formId]);
        } catch (e) {}
        delete timers[formId];
      }
    }

    function markDowned(formId) {
      formId = Number(formId);
      if (!formId) return;
      try {
        mp.set(formId, "isDead", true);
      } catch (e) {}
      // Force 0 health so clients see downed state
      try {
        mp.set(formId, "healthPercentage", 0);
      } catch (eH) {}
      downedAt[formId] = Date.now();
      scheduleDowned(formId);
      log("downed " + formId.toString(16));
    }

    function scheduleDowned(formId) {
      clearTimer(formId);
      if (typeof setTimeout !== "function") {
        log("no setTimeout — client will fire _voaTempleRespawn after 60s");
        return;
      }
      timers[formId] = setTimeout(function () {
        templeRespawn(formId, "timer");
      }, DOWNED_MS);
    }

    function healAtTemple(formId) {
      try {
        mp.set(formId, "isDead", false);
      } catch (e1) {}
      try {
        if (typeof mp.onResurrect === "function") mp.onResurrect(formId);
      } catch (e2) {}
      // Percent-based restore (most reliable for MP)
      try {
        mp.set(formId, "healthPercentage", 0.75);
      } catch (e3) {}
      try {
        mp.set(formId, "magickaPercentage", 0.5);
      } catch (e4) {}
      try {
        mp.set(formId, "staminaPercentage", 0.5);
      } catch (e5) {}
      try {
        var maxH = mp.get(formId, "avHealth");
        if (typeof maxH === "number" && maxH > 0) {
          mp.set(formId, "avHealthRestore", maxH * 0.75);
          mp.set(formId, "avHealthDamage", 0);
        }
      } catch (e6) {}
    }

    function templeRespawn(formId, reason) {
      formId = Number(formId);
      if (!formId) return;
      clearTimer(formId);
      delete downedAt[formId];

      var temple = nearestTemple(getPos(formId));
      log(
        "temple respawn " +
          formId.toString(16) +
          " -> " +
          temple.name +
          " (" +
          (reason || "?") +
          ")"
      );

      // World + position so neighbors see the move, then resurrect
      try {
        if (typeof mp.getDescFromId === "function") {
          mp.set(formId, "worldOrCellDesc", mp.getDescFromId(TAMRIEL));
        }
      } catch (eW) {
        log("worldOrCellDesc err " + eW);
      }
      try {
        mp.set(formId, "pos", [temple.pos[0], temple.pos[1], temple.pos[2]]);
      } catch (eP) {
        log("pos err " + eP);
      }
      try {
        mp.set(formId, "angle", [0, 0, 0]);
      } catch (eA) {}

      healAtTemple(formId);
    }

    function revivePlayer(reviverId, targetId) {
      targetId = Number(targetId);
      reviverId = Number(reviverId);
      if (!targetId) return;
      clearTimer(targetId);
      delete downedAt[targetId];
      log(
        "revive " +
          targetId.toString(16) +
          " by " +
          (reviverId ? reviverId.toString(16) : "?")
      );
      healAtTemple(targetId);
    }

    // Client reports local downed (deferred kill never hits native onDeath)
    mp["_voaDowned"] = function (senderFormId) {
      markDowned(senderFormId);
    };

    mp["_voaRevive"] = function (senderFormId, arg0) {
      var target = arg0;
      if (arg0 && typeof arg0 === "object" && arg0.length) target = arg0[0];
      revivePlayer(senderFormId, target);
    };

    // Client 60s timer OR button/key request — server performs teleport
    mp["_voaTempleRespawn"] = function (senderFormId) {
      templeRespawn(senderFormId, "client-request");
    };

    var prevOnDeath = mp.onDeath;
    mp.onDeath = function (pcFormId, agressorFormId) {
      if (typeof prevOnDeath === "function") {
        try {
          prevOnDeath(pcFormId, agressorFormId);
        } catch (e) {
          log("prevOnDeath err " + e);
        }
      } else {
        try {
          mp.set(pcFormId, "isDead", true);
        } catch (e2) {}
      }
      markDowned(pcFormId);
    };

    log("loaded SERVER-SIDE — downed/revive/temple (isDead+pos+world authoritative)");
  } catch (err) {
    try {
      console.error("[VOA-downed] failed " + err);
    } catch (e) {}
  }
})();
