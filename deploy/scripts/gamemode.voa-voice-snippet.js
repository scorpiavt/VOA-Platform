/* === VOA proximity voice: publish profileId map to clients (Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;
    if (mp._voaVoiceSnippet) return;
    mp._voaVoiceSnippet = true;

    function log(msg) {
      try {
        console.log("[VOA-voice] " + msg);
      } catch (e) {}
    }

    function onlinePlayers() {
      try {
        var list = mp.get(0, "onlinePlayers");
        return list && list.length ? list : [];
      } catch (e) {
        return [];
      }
    }

    function pushEval(formId, js) {
      try {
        var prev = null;
        try {
          prev = mp.get(formId, "eval");
        } catch (e0) {}
        var n = prev && typeof prev.n === "number" ? prev.n + 1 : 1;
        mp.set(formId, "eval", { n: n, f: String(js || "") });
        return true;
      } catch (e) {
        return false;
      }
    }

    /**
     * Build { remoteActorFormId: profileId } for all online players.
     * LiveKit identity is profileId; clients need remote form -> profile.
     */
    function buildProfileMap() {
      var map = {};
      var online = onlinePlayers();

      // Reverse map via getActorsByProfileId when available (scamp)
      try {
        if (typeof mp.getActorsByProfileId === "function") {
          // Probe a reasonable profileId range from recent logins is hard;
          // instead walk online and use getUserByActor if present.
        }
      } catch (e0) {}

      for (var i = 0; i < online.length; i++) {
        var formId = Number(online[i]);
        if (!formId) continue;
        var pid = 0;
        try {
          pid = Number(mp.get(formId, "profileId")) || 0;
        } catch (e1) {}
        if (!pid) {
          try {
            // Some builds store user id on actor
            var u = mp.get(formId, "private") || mp.get(formId, "baseDesc");
          } catch (e2) {}
        }
        if (!pid) {
          try {
            if (mp._voaLiveByActor && mp._voaLiveByActor[formId]) {
              pid = Number(mp._voaLiveByActor[formId].profileId) || 0;
            }
          } catch (e3) {}
        }
        if (pid > 0) map[formId] = pid;
      }

      // Merge staff/characters live maps if set by Node addons into global mp
      try {
        if (mp._voaActorForProfile) {
          var keys = Object.keys(mp._voaActorForProfile);
          for (var k = 0; k < keys.length; k++) {
            var p = Number(keys[k]);
            var a = Number(mp._voaActorForProfile[p]);
            if (p > 0 && a > 0) map[a] = p;
          }
        }
      } catch (eM) {}
      try {
        if (mp._voaLive) {
          var lk = Object.keys(mp._voaLive);
          for (var j = 0; j < lk.length; j++) {
            var parts = String(lk[j]).split(":");
            var pp = Number(parts[0]);
            var aa = Number(mp._voaLive[lk[j]]);
            if (pp > 0 && aa > 0) map[aa] = pp;
          }
        }
      } catch (eL) {}

      // Brute: for each online actor, try matching via getActorsByProfileId for known online set
      // Use appearance name storage is not reliable; try scamp getUserIdFromActor if any
      try {
        for (var oi = 0; oi < online.length; oi++) {
          var fid = Number(online[oi]);
          if (!fid || map[fid]) continue;
          if (typeof mp.getUserByActor === "function") {
            var user = mp.getUserByActor(fid);
            if (user && user.profileId) map[fid] = Number(user.profileId);
          }
        }
      } catch (eU) {}

      return map;
    }

    function broadcastMap() {
      var map = buildProfileMap();
      var keys = Object.keys(map);
      if (!keys.length) return;
      var json = JSON.stringify(map);
      // Keep payload small
      if (json.length > 8000) {
        log("map too large, skip " + json.length);
        return;
      }
      var js =
        "(function(){try{var m=" +
        json +
        ";var s=ctx.sp.storage;if(!s.voaProfileByRemote)s.voaProfileByRemote={};" +
        "for(var k in m){if(m.hasOwnProperty(k))s.voaProfileByRemote[k]=m[k];s.voaProfileByRemote[String(k)]=m[k];}" +
        "}catch(e){}})()";
      var online = onlinePlayers();
      for (var i = 0; i < online.length; i++) {
        pushEval(Number(online[i]), js);
      }
    }

    // Also try to fill from onlinePlayers + getUserByActor if scamp exposes it
    function enrichFromUserIds() {
      try {
        var online = onlinePlayers();
        for (var i = 0; i < online.length; i++) {
          var formId = Number(online[i]);
          if (!formId) continue;
          try {
            // Some builds store owner profile on actor
            var owner = mp.get(formId, "actorOwner") || mp.get(formId, "owner");
            if (owner && owner.profileId) {
              if (!mp._voaActorForProfile) mp._voaActorForProfile = {};
              mp._voaActorForProfile[Number(owner.profileId)] = formId;
            }
          } catch (e) {}
        }
      } catch (e2) {}
    }

    // Chakra has no setInterval — recursive setTimeout
    function tick() {
      try {
        enrichFromUserIds();
        broadcastMap();
      } catch (e) {
        log("tick err " + (e && e.message ? e.message : e));
      }
      try {
        if (typeof setTimeout === "function") setTimeout(tick, 3000);
        else if (typeof mp !== "undefined" && mp.setTimeout) mp.setTimeout(tick, 3000);
      } catch (eT) {}
    }
    try {
      if (typeof setTimeout === "function") setTimeout(tick, 2000);
      else if (typeof mp !== "undefined" && mp.setTimeout) mp.setTimeout(tick, 2000);
      else tick();
    } catch (e0) {
      tick();
    }

    log("proximity voice profile map snippet loaded");
  } catch (eTop) {
    try {
      console.log("[VOA-voice] init fail " + (eTop && eTop.message));
    } catch (e) {}
  }
})();
