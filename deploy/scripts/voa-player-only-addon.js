// VOA player-only mode (temporary) — server-side
// Reinforces no vanilla NPC spawn; logs player connect for sync debugging.
// isVanillaSpawn should already be false in data/server-options.json.
(function () {
  try {
    if (typeof mp === "undefined" || !mp) {
      console.log("[VOA-player-only] mp missing, skip");
      return;
    }

    function log(msg) {
      try {
        console.log("[VOA-player-only] " + msg);
      } catch (e) {}
    }

    // Confirm server options when gamemode loads
    try {
      // no official API to re-read options; log intent only
      log("active — focus: player connect + visibility. Vanilla NPC spawn should be off (isVanillaSpawn:false).");
    } catch (e) {}

    // Log when a form becomes a player character (useful for multi-player tests)
    var prevOnline = {};
    function pollOnline() {
      try {
        var list = mp.get(0, "onlinePlayers") || [];
        var now = {};
        for (var i = 0; i < list.length; i++) {
          var id = list[i];
          now[id] = true;
          if (!prevOnline[id]) {
            var name = "?";
            try {
              var app = mp.get(id, "appearance");
              if (app && app.name) name = String(app.name);
            } catch (e2) {}
            log("player ONLINE formId=0x" + Number(id).toString(16) + " name=" + name);
          }
        }
        for (var oldId in prevOnline) {
          if (!now[oldId]) {
            log("player OFFLINE formId=0x" + Number(oldId).toString(16));
          }
        }
        prevOnline = now;
      } catch (e) {}
      try {
        setTimeout(pollOnline, 3000);
      } catch (e3) {
        // no setTimeout in some VMs — ignore
      }
    }

    try {
      setTimeout(pollOnline, 2000);
    } catch (e) {
      log("setTimeout unavailable — online poll disabled");
    }

    log("loaded");
  } catch (e) {
    try {
      console.log("[VOA-player-only] failed: " + (e && e.message ? e.message : e));
    } catch (e2) {}
  }
})();
