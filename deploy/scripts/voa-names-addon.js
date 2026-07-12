// VOA: in-game character names for launcher slots
// Client CustomEvent _voaCharacterName args: [profileId, slot, name]
(function () {
  try {
    if (typeof mp === "undefined" || !mp) {
      console.log("[VOA-names] mp missing");
      return;
    }

    function log(msg) {
      try {
        console.log("[VOA-names] " + msg);
      } catch (e) {}
    }

    mp["_voaCharacterName"] = function (senderFormId, a0, a1, a2) {
      var profileId = 0;
      var slot = 0;
      var name = "";
      // Flexible arg shapes: (profileId, slot, name) | ([profileId, slot, name]) | (slot, name)
      if (typeof a0 === "object" && a0 && a0.length != null) {
        if (a0.length >= 3) {
          profileId = Number(a0[0]) || 0;
          slot = Number(a0[1]) || 0;
          name = a0[2];
        } else {
          slot = Number(a0[0]) || 0;
          name = a0[1];
        }
      } else if (a2 != null) {
        profileId = Number(a0) || 0;
        slot = Number(a1) || 0;
        name = a2;
      } else if (a1 != null) {
        slot = Number(a0) || 0;
        name = a1;
      } else {
        name = a0;
      }
      name = String(name || "")
        .trim()
        .slice(0, 48);
      if (!name) return;
      if (slot < 0 || slot > 1) slot = 0;
      // Log line parsed by voa-status → launcher
      console.log(
        "[VOA-names] NAME profile=" +
          profileId +
          " slot=" +
          slot +
          " name=" +
          JSON.stringify(name)
      );
      log("p" + profileId + " s" + slot + " => " + name);
    };

    log("loaded");
  } catch (err) {
    try {
      console.error("[VOA-names] failed " + err);
    } catch (e) {}
  }
})();
