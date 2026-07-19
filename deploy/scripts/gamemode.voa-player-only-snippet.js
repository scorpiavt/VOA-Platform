/* === VOA player-only + chat start (server-side, Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;

    function log(msg) {
      try {
        console.log("[VOA-player-only] " + msg);
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

    function getName(formId) {
      try {
        var n = mp.get(formId, "voaCharName");
        if (n) return String(n);
      } catch (e0) {}
      try {
        var app = mp.get(formId, "appearance");
        if (app && app.name) return String(app.name);
      } catch (e1) {}
      return "Traveler";
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

    /** Push a chat line into the client CEF log (SP-safe JSON queue only). */
    function sendChatLine(viewerId, lineObj) {
      var js =
        "(function(){try{" +
        "var line=" +
        JSON.stringify(lineObj) +
        ";" +
        "var raw=ctx.sp.storage['voaChatQueueJson'];var q=[];" +
        "try{if(typeof raw==='string'&&raw.length)q=JSON.parse(raw);}catch(e0){q=[];}" +
        "if(!q||!q.length)q=[];q.push(line);if(q.length>80)q=q.slice(-80);" +
        "ctx.sp.storage['voaChatQueueJson']=JSON.stringify(q);" +
        "}catch(e){}})()";
      pushEval(viewerId, js);
    }

    /**
     * Server-side NPC policy:
     * - isVanillaSpawn:false (server-options.json) stops streaming vanilla ACHR
     * - changeForms purge on start keeps world player-only
     * - drop any non-player form that still has profileId missing if API allows
     */
    function scrubNonPlayerForm(formId) {
      try {
        var id = Number(formId) || 0;
        if (!id) return false;
        // Never touch player forms (0xff......)
        if ((id >>> 0) >= 0xff000000) return false;
        // Dynamic high forms only; never delete base world statics by id guess
        return false;
      } catch (e) {
        return false;
      }
    }

    var welcomed = {};
    var prevOnline = {};

    function onPlayerSeen(formId) {
      var id = Number(formId) || 0;
      if (!id || welcomed[id]) return;
      welcomed[id] = Date.now();
      var name = getName(id);
      // Server-owned chat start (no client grace / client welcome)
      sendChatLine(id, {
        channel: "sys",
        name: "System",
        text:
          "Welcome, " +
          name +
          ". Chat is live (Enter/T). Local = nearby players. Global = /g (staff).",
        fromId: 0,
        system: true,
      });
      // Clear any leftover client grace flag via eval
      pushEval(
        id,
        "(function(){try{ctx.sp.storage['voaSpawnGraceUntil']=0;ctx.sp.printConsole('VOA: server chat ready (no grace)');}catch(e){}})()"
      );
      log("chat-start form=0x" + id.toString(16) + " name=" + name);
    }

    function tick() {
      try {
        var list = onlinePlayers();
        var now = {};
        for (var i = 0; i < list.length; i++) {
          var id = Number(list[i]) || 0;
          if (!id) continue;
          now[id] = true;
          if (!prevOnline[id]) {
            log("ONLINE 0x" + id.toString(16) + " " + getName(id));
            // slight delay so client UI/eval property is ready
            (function (fid) {
              try {
                setTimeout(function () {
                  onPlayerSeen(fid);
                }, 1500);
              } catch (eT) {
                onPlayerSeen(fid);
              }
            })(id);
          }
          scrubNonPlayerForm(id);
        }
        for (var oldId in prevOnline) {
          if (!now[oldId]) {
            log("OFFLINE 0x" + Number(oldId).toString(16));
            delete welcomed[oldId];
          }
        }
        prevOnline = now;
      } catch (eTick) {
        log("tick " + eTick);
      }
      try {
        setTimeout(tick, 2000);
      } catch (e2) {}
    }

    try {
      setTimeout(tick, 1000);
    } catch (e3) {
      log("setTimeout missing — player-only poll disabled");
    }

    // Expose for other snippets (chat) if needed
    try {
      mp["_voaSendChatLine"] = sendChatLine;
      mp["_voaChatStart"] = onPlayerSeen;
    } catch (eX) {}

    log(
      "active (server NPC policy + chat start). Client world-cleaner off. isVanillaSpawn should be false."
    );
  } catch (eAll) {
    try {
      console.log("[VOA-player-only] fail " + eAll);
    } catch (e2) {}
  }
})();
