/* === VOA chat: local/global + typing + admin slash (Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;

    var LOCAL_R = 2200;
    var LOCAL_R2 = LOCAL_R * LOCAL_R;

    function log(msg) {
      try {
        console.log("[VOA-chat] " + msg);
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

    function getPos(formId) {
      try {
        var p = mp.get(formId, "pos");
        if (p && p.length >= 3)
          return [Number(p[0]), Number(p[1]), Number(p[2])];
      } catch (e) {}
      return null;
    }

    function dist2(a, b) {
      var dx = a[0] - b[0];
      var dy = a[1] - b[1];
      var dz = a[2] - b[2];
      return dx * dx + dy * dy + dz * dz;
    }

    function isStaff(formId) {
      try {
        return mp.get(formId, "voaStaff") === true;
      } catch (e) {
        return false;
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

    function escapeJs(s) {
      return String(s == null ? "" : s)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, " ")
        .replace(/\n/g, "\\n")
        .replace(/</g, "\\u003c");
    }

    function sendChatLine(viewerId, lineObj) {
      // lineObj: { channel, name, text, fromId, system? }
      // SP-safe: only push plain JSON into a string queue (never call storage functions)
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

    function setTyping(viewerId, whoId, typing) {
      var js =
        "(function(){try{" +
        "var m=ctx.sp.storage['voaTyping'];if(!m||typeof m!=='object'){m={};ctx.sp.storage['voaTyping']=m;}" +
        "if(" +
        (typing ? "true" : "false") +
        "){m[" +
        Number(whoId) +
        "]=Date.now();}else{delete m[" +
        Number(whoId) +
        "];}" +
        "}catch(e){}})()";
      pushEval(viewerId, js);
    }

    function nearbyPlayers(fromId) {
      var sp0 = getPos(fromId);
      var out = [];
      if (!sp0) return out;
      var online = onlinePlayers();
      for (var i = 0; i < online.length; i++) {
        var oid = Number(online[i]);
        if (!oid) continue;
        var op = getPos(oid);
        if (!op) continue;
        if (dist2(sp0, op) <= LOCAL_R2) out.push(oid);
      }
      return out;
    }

    function parseAdminSlash(text) {
      // returns { cmd, args[] } or null
      if (!text || text.charAt(0) !== "/") return null;
      var body = text.slice(1).trim();
      if (!body) return null;
      var parts = body.split(/\s+/);
      var head = String(parts[0] || "").toLowerCase();
      // channel prefixes are not admin cmds
      if (head === "g" || head === "l" || head === "global" || head === "local")
        return null;
      var aliases = {
        announce: "announce",
        a: "announce",
        tp: "tp",
        tpto: "tp",
        goto: "tp",
        summon: "summon",
        bring: "summon",
        giveplayerspell: "giveplayerspell",
        givespell: "giveplayerspell",
        addspell: "giveplayerspell",
        listplayers: "listplayers",
        players: "listplayers",
        additem: "additem",
      };
      var cmd = aliases[head];
      if (!cmd) return null;
      var rest = parts.slice(1);
      return { cmd: cmd, args: rest };
    }

    function runAdmin(sender, profileId, cmd, args) {
      if (typeof mp["_voaConsole"] === "function") {
        try {
          mp["_voaConsole"](
            sender,
            profileId || 0,
            cmd,
            JSON.stringify(args || [])
          );
          return true;
        } catch (e) {
          log("admin via chat fail " + e);
        }
      }
      return false;
    }

    mp["_voaChat"] = function (senderFormId, action, a1, a2, a3) {
      try {
        var sender = Number(senderFormId) || 0;
        if (!sender) return;
        var act = String(action || "").toLowerCase();

        if (act === "typing") {
          var typing = a1 === true || a1 === "true" || a1 === 1 || a1 === "1";
          var near = nearbyPlayers(sender);
          for (var ti = 0; ti < near.length; ti++) {
            if (near[ti] === sender) continue;
            setTyping(near[ti], sender, typing);
          }
          // self sees own indicator optional - skip
          return;
        }

        if (act === "say" || act === "msg" || act === "message") {
          var raw = String(a1 != null ? a1 : "").trim();
          if (!raw) return;
          // truncate
          if (raw.length > 280) raw = raw.slice(0, 280);

          var channel = "l";
          var text = raw;
          var m = raw.match(/^\/([gl]|global|local)\s+([\s\S]+)$/i);
          if (m) {
            var ch = m[1].toLowerCase();
            channel = ch === "g" || ch === "global" ? "g" : "l";
            text = String(m[2] || "").trim();
          } else if (raw.charAt(0) === "/") {
            // admin slash or unknown
            var staff = isStaff(sender);
            var adm = parseAdminSlash(raw);
            if (adm) {
              if (!staff) {
                sendChatLine(sender, {
                  channel: "sys",
                  name: "System",
                  text: "Admin only command",
                  fromId: 0,
                  system: true,
                });
                return;
              }
              var pid = 0;
              try {
                pid = Number(mp.get(sender, "voaProfileId")) || 0;
              } catch (eP) {}
              // special: announce rest joined
              if (adm.cmd === "announce") {
                runAdmin(sender, pid, "announce", [adm.args.join(" ")]);
              } else if (adm.cmd === "listplayers") {
                runAdmin(sender, pid, "listplayers", []);
              } else if (adm.cmd === "additem") {
                // /additem <formId> <count?>  -> player self
                var itemId = parseInt(adm.args[0], 0) || parseInt(adm.args[0], 16) || 0;
                var count = parseInt(adm.args[1], 10) || 1;
                runAdmin(sender, pid, "additem", [0x14, itemId, count]);
              } else if (adm.cmd === "giveplayerspell") {
                runAdmin(sender, pid, "giveplayerspell", adm.args);
              } else if (adm.cmd === "tp" || adm.cmd === "summon") {
                runAdmin(sender, pid, adm.cmd, [adm.args.join(" ")]);
              } else {
                runAdmin(sender, pid, adm.cmd, adm.args);
              }
              sendChatLine(sender, {
                channel: "sys",
                name: "System",
                text: "Admin: /" + adm.cmd + " " + adm.args.join(" "),
                fromId: 0,
                system: true,
              });
              return;
            }
            // unknown slash - treat as local text without slash strip? show help
            if (staff) {
              sendChatLine(sender, {
                channel: "sys",
                name: "System",
                text:
                  "Unknown cmd. Chat: /l /g | Admin: /announce /tp /summon /giveplayerspell /listplayers /additem",
                fromId: 0,
                system: true,
              });
              return;
            }
          }

          if (!text) return;

          if (channel === "g") {
            if (!isStaff(sender)) {
              sendChatLine(sender, {
                channel: "sys",
                name: "System",
                text: "Global chat is Admin only. Use /l for local.",
                fromId: 0,
                system: true,
              });
              return;
            }
            var gName = getName(sender);
            var gLine = {
              channel: "g",
              name: gName,
              text: text,
              fromId: sender,
              system: false,
            };
            var all = onlinePlayers();
            for (var gi = 0; gi < all.length; gi++) {
              sendChatLine(Number(all[gi]), gLine);
            }
            log("GLOBAL " + gName + ": " + text);
            return;
          }

          // local
          var lName = getName(sender);
          var lLine = {
            channel: "l",
            name: lName,
            text: text,
            fromId: sender,
            system: false,
          };
          var near2 = nearbyPlayers(sender);
          if (near2.indexOf(sender) < 0) near2.push(sender);
          for (var li = 0; li < near2.length; li++) {
            sendChatLine(near2[li], lLine);
          }
          log("LOCAL " + lName + " ->" + near2.length + ": " + text);
          return;
        }

        log("unknown act " + act);
      } catch (eAll) {
        log("" + eAll);
      }
    };

    log("chat ready (local/global/typing/admin slash)");
  } catch (e) {
    try {
      console.log("[VOA-chat] init fail " + e);
    } catch (e2) {}
  }
})();
