// VOA: starter kit — only ragged robes (ClothesPrisonerClothes 0x3C9FE).
// Safe, minimal Chakra gamemode addon (no chat UI / timers thrash).
// Merge into stock: cat gamemode.stock.js voa-starter-addon.js > gamemode.js
(function () {
  try {
    if (typeof mp === "undefined" || !mp) {
      console.log("[VOA-starter] mp missing, skip");
      return;
    }

    var ROBES = 0x3c9fe;
    var applied = {};

    function log(msg) {
      try {
        console.log("[VOA-starter] " + msg);
      } catch (e) {}
    }

    function invHasOnlyRobes(inv) {
      if (!inv || !inv.entries || !inv.entries.length) return false;
      if (inv.entries.length !== 1) return false;
      var e = inv.entries[0];
      return Number(e.baseId) === ROBES && Number(e.count) >= 1;
    }

    function setRobesOnly(formId) {
      formId = Number(formId);
      if (!formId) return false;
      try {
        mp.set(formId, "inventory", {
          entries: [{ baseId: ROBES, count: 1 }],
        });
        applied[formId] = true;
        log("set robes-only inv for " + formId.toString(16));
        return true;
      } catch (e) {
        log("set inventory failed " + formId.toString(16) + ": " + e);
        return false;
      }
    }

    // Client race-menu close → force starter kit (authoritative)
    mp["_voaStarterKit"] = function (senderFormId) {
      try {
        setRobesOnly(senderFormId);
      } catch (e) {
        log("_voaStarterKit err: " + e);
      }
    };

    // New characters often spawn with empty inventory; give robes once.
    // Also strip accidental multi-item kits if somehow present before first look.
    function tickStarters() {
      try {
        var online = mp.get(0, "onlinePlayers") || [];
        for (var i = 0; i < online.length; i++) {
          var id = Number(online[i]);
          if (!id || applied[id]) continue;
          var inv = null;
          try {
            inv = mp.get(id, "inventory");
          } catch (eG) {
            continue;
          }
          var empty =
            !inv || !inv.entries || inv.entries.length === 0;
          if (empty) {
            // Only auto-grant while still in / just after chargen (no appearance yet)
            var appearance = null;
            try {
              appearance = mp.get(id, "appearance");
            } catch (eA) {}
            if (!appearance) {
              setRobesOnly(id);
            }
          } else if (invHasOnlyRobes(inv)) {
            applied[id] = true;
          }
        }
      } catch (eT) {
        log("tick err: " + eT);
      }
    }

    // Light poll — only inventory set, no papyrus/UI
    try {
      setInterval(tickStarters, 4000);
    } catch (eI) {
      log("setInterval unavailable: " + eI);
    }
    tickStarters();

    log("loaded (ragged robes starter)");
  } catch (err) {
    try {
      console.error("[VOA-starter] failed " + err);
    } catch (e) {}
  }
})();
