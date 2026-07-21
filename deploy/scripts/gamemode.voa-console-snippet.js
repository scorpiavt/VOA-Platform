/* === VOA console staff lock + admin commands (Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;

    function log(msg) {
      try {
        console.log("[VOA-console] " + msg);
      } catch (e) {}
    }

    // ActorId -> true (fallback when mp property voaStaff does not stick)
    var staffActors = Object.create(null);
    var staffProfiles = Object.create(null);

    // Register custom props so Node VoaStaffConsole mp.set/get works across systems
    try {
      if (typeof mp.makeProperty === "function") {
        mp.makeProperty("voaStaff", {
          isVisibleByOwner: true,
          isVisibleByNeighbors: false,
          updateOwner: "",
          updateNeighbor: "",
        });
        mp.makeProperty("voaProfileId", {
          isVisibleByOwner: true,
          isVisibleByNeighbors: false,
          updateOwner: "",
          updateNeighbor: "",
        });
        log("registered voaStaff + voaProfileId properties");
      }
    } catch (eProp) {
      log("makeProperty skip: " + eProp);
    }

    /** Called from Node via executeJavaScriptOnChakra */
    mp["_voaSetStaffFlag"] = function (actorId, profileId, isStaff) {
      try {
        actorId = Number(actorId) || 0;
        profileId = Number(profileId) || 0;
        var ok = isStaff === true || isStaff === "true" || isStaff === 1;
        if (actorId) {
          staffActors[actorId] = ok;
          try {
            mp.set(actorId, "voaStaff", ok);
          } catch (e0) {}
        }
        if (profileId) {
          staffProfiles[profileId] = ok;
          if (actorId) {
            try {
              mp.set(actorId, "voaProfileId", profileId);
            } catch (e1) {}
          }
        }
        log(
          "staff flag set actor=" +
            (actorId ? actorId.toString(16) : "?") +
            " p=" +
            profileId +
            " staff=" +
            ok
        );
      } catch (eSet) {
        log("staff flag err " + eSet);
      }
    };

    function isActorStaff(actorId, profileId) {
      actorId = Number(actorId) || 0;
      profileId = Number(profileId) || 0;
      try {
        if (actorId && mp.get(actorId, "voaStaff") === true) return true;
      } catch (e0) {}
      if (actorId && staffActors[actorId] === true) return true;
      if (profileId && staffProfiles[profileId] === true) return true;
      try {
        if (actorId) {
          var pid = mp.get(actorId, "voaProfileId");
          if (pid != null && staffProfiles[Number(pid)] === true) return true;
        }
      } catch (e1) {}
      return false;
    }

    function onlinePlayers() {
      try {
        var list = mp.get(0, "onlinePlayers");
        return list && list.length ? list : [];
      } catch (e) {
        return [];
      }
    }

    function playerName(formId) {
      try {
        var n = mp.get(formId, "voaCharName");
        if (n) return String(n);
      } catch (e0) {}
      try {
        var app = mp.get(formId, "appearance");
        if (app && app.name) return String(app.name);
      } catch (e1) {}
      try {
        var pid = mp.get(formId, "voaProfileId");
        if (pid != null) return "p" + pid;
      } catch (e2) {}
      return "player#" + formId.toString(16);
    }

    function findPlayer(query) {
      if (query == null || query === "") return 0;
      var q = String(query).trim();
      if (!q) return 0;
      // strip surrounding quotes
      if (
        (q.charAt(0) === '"' && q.charAt(q.length - 1) === '"') ||
        (q.charAt(0) === "'" && q.charAt(q.length - 1) === "'")
      ) {
        q = q.slice(1, -1).trim();
      }
      // Direct form id (hex or decimal) including high ff00000x player ids
      if (/^0x[0-9a-f]+$/i.test(q) || /^[0-9]+$/.test(q)) {
        var asId = parseInt(q, 0);
        if (asId > 0) {
          var online0 = onlinePlayers();
          for (var zi = 0; zi < online0.length; zi++) {
            if (Number(online0[zi]) === asId) return asId;
          }
          try {
            if (mp.get(asId, "type") === "MpActor") return asId;
          } catch (eT) {}
        }
      }
      var ql = q.toLowerCase();
      var online = onlinePlayers();
      var partial = 0;
      var contains = 0;
      for (var i = 0; i < online.length; i++) {
        var id = Number(online[i]);
        if (!id) continue;
        var name = playerName(id).toLowerCase();
        if (name === ql) return id;
        // profile id match: p1000 / 1000
        try {
          var pid = mp.get(id, "voaProfileId");
          if (pid != null) {
            var ps = String(pid);
            if (ps === q || ("p" + ps).toLowerCase() === ql) return id;
          }
        } catch (eP) {}
        if (!partial && name.indexOf(ql) === 0) partial = id;
        if (!contains && name.indexOf(ql) >= 0) contains = id;
      }
      return partial || contains;
    }

    function getLoc(formId) {
      var pos = [0, 0, 0];
      var angle = [0, 0, 0];
      var world = null;
      try {
        var p = mp.get(formId, "pos");
        if (p && p.length >= 3) pos = [Number(p[0]), Number(p[1]), Number(p[2])];
      } catch (e0) {}
      try {
        var a = mp.get(formId, "angle");
        if (a && a.length >= 3) angle = [Number(a[0]), Number(a[1]), Number(a[2])];
      } catch (e1) {}
      try {
        world = mp.get(formId, "worldOrCellDesc");
      } catch (e2) {}
      return { pos: pos, angle: angle, world: world };
    }

    function setLoc(formId, loc, offsetXY) {
      offsetXY = offsetXY || 0;
      try {
        if (loc.world != null && loc.world !== undefined) {
          mp.set(formId, "worldOrCellDesc", loc.world);
        }
      } catch (eW) {
        log("set world fail " + eW);
      }
      try {
        mp.set(formId, "pos", [
          loc.pos[0] + offsetXY,
          loc.pos[1],
          loc.pos[2],
        ]);
      } catch (eP) {
        log("set pos fail " + eP);
      }
      try {
        if (loc.angle) mp.set(formId, "angle", loc.angle);
      } catch (eA) {}
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
        log("eval fail " + formId.toString(16) + " " + e);
        return false;
      }
    }

    function escapeJs(s) {
      return String(s == null ? "" : s)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, " ")
        .replace(/\n/g, "\\n")
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e");
    }

    // Exposed for Node HTTP staff path (voa-staff-console)
    mp["_voaAnnounceAll"] = function (message, fromName) {
      try {
        return announceAll(message, fromName);
      } catch (eA) {
        log("announceAll err " + eA);
        return 0;
      }
    };

    function announceAll(message, fromName) {
      message = String(message || "").trim();
      if (!message) return 0;
      fromName = String(fromName || "Staff");
      var title = "Server Announcement";
      var body = message;
      var fromLine = "- " + fromName;
      // Build a safe CEF overlay script (no nested template literals)
      var t = escapeJs(title);
      var b = escapeJs(body);
      var f = escapeJs(fromLine);
      var cef =
        "(function(){try{if(!document.body)return;" +
        "var old=document.getElementById('voa-announce');if(old)old.remove();" +
        "var el=document.createElement('div');el.id='voa-announce';" +
        "el.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);font-family:Segoe UI,Tahoma,sans-serif;';" +
        "var box=document.createElement('div');" +
        "box.style.cssText='max-width:520px;width:90%;background:linear-gradient(180deg,#1a1f2a,#0e1218);border:2px solid rgba(201,162,39,0.8);border-radius:14px;padding:22px 24px;box-shadow:0 16px 48px rgba(0,0,0,0.7);color:#e8e6e3;';" +
        "var h=document.createElement('div');h.textContent='" +
        t +
        "';h.style.cssText='font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c9a227;margin-bottom:8px';" +
        "var p=document.createElement('div');p.textContent='" +
        b +
        "';p.style.cssText='font-size:18px;line-height:1.45;white-space:pre-wrap;margin-bottom:14px';" +
        "var s=document.createElement('div');s.textContent='" +
        f +
        "';s.style.cssText='font-size:13px;opacity:0.75;margin-bottom:16px';" +
        "var btn=document.createElement('button');btn.type='button';btn.textContent='Close';" +
        "btn.style.cssText='cursor:pointer;border:none;border-radius:8px;padding:12px 18px;width:100%;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;background:linear-gradient(180deg,#e0c04a,#a8841c);color:#1a1408';" +
        "btn.onclick=function(){try{el.remove();}catch(e){}};" +
        "box.appendChild(h);box.appendChild(p);box.appendChild(s);box.appendChild(btn);" +
        "el.appendChild(box);el.addEventListener('click',function(ev){if(ev.target===el){try{el.remove();}catch(e2){}}});" +
        "document.body.appendChild(el);}catch(e0){}})();";
      var js =
        "(function(){try{" +
        "try{ctx.sp.browser.setVisible(true);}catch(eV){}" +
        "try{ctx.sp.browser.executeJavaScript(" +
        JSON.stringify(cef) +
        ");}catch(eB){}" +
        "try{ctx.sp.Debug.messageBox('" +
        t +
        "\\n\\n" +
        b +
        "\\n\\n" +
        f +
        "');}catch(eM){}" +
        "try{ctx.sp.Debug.notification('ANNOUNCE: " +
        b +
        "');}catch(eN){}" +
        "try{ctx.sp.printConsole('VOA announce: " +
        b +
        "');}catch(eP){}" +
        "}catch(eAll){}})()";

      var online = onlinePlayers();
      var n = 0;
      for (var i = 0; i < online.length; i++) {
        if (pushEval(Number(online[i]), js)) n++;
      }
      log("announce to " + n + " players: " + message);
      return n;
    }

    function giveSpell(targetId, spellId) {
      spellId = Number(spellId) || 0;
      if (!targetId || !spellId) return false;
      var js =
        "(function(){try{" +
        "var id=" +
        spellId +
        ";" +
        "var form=ctx.sp.Game.getFormEx(id);" +
        "if(!form){ctx.sp.printConsole('VOA: spell form not found '+id.toString(16));return;}" +
        "var spell=ctx.sp.Spell.from(form);" +
        "if(!spell){ctx.sp.printConsole('VOA: form is not a Spell '+id.toString(16));try{ctx.sp.Debug.notification('Not a spell: '+id.toString(16));}catch(e1){}return;}" +
        "var player=ctx.sp.Game.getPlayer();" +
        "if(!player)return;" +
        "var ok=player.addSpell(spell,true);" +
        "ctx.sp.printConsole('VOA: addSpell '+id.toString(16)+' => '+ok);" +
        "try{ctx.sp.Debug.notification('Spell granted: '+(spell.getName?spell.getName():id.toString(16)));}catch(e2){}" +
        "}catch(e){try{ctx.sp.printConsole('VOA giveSpell err '+e);}catch(e3){}}})()";
      return pushEval(targetId, js);
    }

    function notify(formId, text) {
      text = String(text || "");
      // 1) native notification + console
      var js =
        "(function(){try{ctx.sp.Debug.notification('" +
        escapeJs(text) +
        "');ctx.sp.printConsole('VOA admin: " +
        escapeJs(text) +
        "');}catch(e){}})()";
      pushEval(formId, js);
      // 2) VOA chat UI line (same path as nearby chat — more reliable than toast alone)
      try {
        var line = {
          channel: "sys",
          name: "System",
          text: text,
          fromId: 0,
          system: true,
        };
        var jsChat =
          "(function(){try{" +
          "var line=" +
          JSON.stringify(line) +
          ";" +
          "var raw=ctx.sp.storage['voaChatQueueJson'];var q=[];" +
          "try{if(typeof raw==='string'&&raw.length)q=JSON.parse(raw);}catch(e0){q=[];}" +
          "if(!q||!q.length)q=[];q.push(line);if(q.length>80)q=q.slice(-80);" +
          "ctx.sp.storage['voaChatQueueJson']=JSON.stringify(q);" +
          "try{ctx.sp.storage['voaForceBrowser']=true;ctx.sp.storage['voaChatLogUntil']=Date.now()+120000;}catch(e1){}" +
          "}catch(e){}})()";
        pushEval(formId, jsChat);
      } catch (eChat) {}
    }

    /** Parse decimal/hex form ids from chat or console args (Chakra-safe, top-level). */
    function parseFormId(v) {
      if (v == null || v === "") return 0;
      if (typeof v === "number" && isFinite(v)) {
        return v >>> 0 ? v >>> 0 : Number(v) || 0;
      }
      var s = String(v).trim();
      if (!s) return 0;
      var n = parseInt(s, 0);
      if (!n && /^[0-9a-f]+$/i.test(s)) n = parseInt(s, 16);
      return n || 0;
    }

    // Remember character names when client reports them
    var prevNameHandler = mp["_voaCharacterName"];
    mp["_voaCharacterName"] = function (senderFormId, a0, a1, a2) {
      try {
        if (typeof prevNameHandler === "function") {
          try {
            prevNameHandler(senderFormId, a0, a1, a2);
          } catch (ePrev) {}
        }
        var name = "";
        if (typeof a0 === "object" && a0 && a0.length != null) {
          name = a0.length >= 3 ? a0[2] : a0[1];
        } else if (a2 != null) name = a2;
        else if (a1 != null && typeof a1 === "string") name = a1;
        else name = a0;
        name = String(name || "")
          .trim()
          .slice(0, 48);
        var actorId = Number(senderFormId) || 0;
        if (actorId && name) {
          try {
            mp.set(actorId, "voaCharName", name);
          } catch (eS) {}
        }
      } catch (e) {}
    };

    mp["_voaConsole"] = function (senderFormId, profileId, commandName, argsJson) {
      try {
        var actorId = +senderFormId || 0;
        log(
          "rx form=" +
            (actorId ? actorId.toString(16) : "?") +
            " rawArgs=" +
            JSON.stringify([profileId, commandName, argsJson]).slice(0, 200)
        );
        if (!actorId) return;
        // SkyMP CustomEvent arg packing can vary (flat args vs array). Normalize.
        var pid = Number(profileId);
        var cmdRaw = commandName;
        var argsRaw = argsJson;
        if (
          profileId != null &&
          typeof profileId === "object" &&
          profileId.length != null
        ) {
          // args arrived as single array: [profileId, cmd, argsJson]
          var arr = profileId;
          pid = Number(arr[0]) || 0;
          cmdRaw = arr[1];
          argsRaw = arr[2];
        }
        // aliases
        var cmd = String(cmdRaw || "").toLowerCase();
        if (cmd === "bring") cmd = "summon";
        if (cmd === "tpto" || cmd === "goto") cmd = "tp";
        if (cmd === "players") cmd = "listplayers";
        if (!isActorStaff(actorId, pid)) {
          log(
            "DENIED form=" +
              actorId.toString(16) +
              " p=" +
              pid +
              " (voaStaff not set — wait for staff flag or rejoin)"
          );
          notify(actorId, "Console: Admin only (staff flag not ready — wait 5s / rejoin)");
          return;
        }
        var args = [];
        try {
          args =
            typeof argsRaw === "string"
              ? JSON.parse(argsRaw)
              : argsRaw || [];
        } catch (e1) {
          args = [];
        }
        if (!Array.isArray(args)) args = [args];
        // if single string like "Roman Molag" from join, keep as one query
        log("ALLOW p" + pid + " " + cmd + " " + JSON.stringify(args));

        // --- stock item command ---
        // Accept both layouts:
        //   console-style: [targetRef, itemId, count]  (args[1]/args[2])
        //   chat/HTTP:     [itemId, count]             (args[0]/args[1])
        //   chat packed:   [0x14, itemId, count]
        if (cmd === "additem") {
          var itemId = 0;
          var count = 1;
          if (args.length >= 3) {
            // [target, item, count] — ignore target, apply to staff actor
            itemId = parseFormId(args[1]);
            count = parseInt(String(args[2]), 10) || 1;
          } else if (args.length === 2) {
            var a0 = parseFormId(args[0]);
            var a1 = parseFormId(args[1]);
            // If first looks like player self-ref (0x14) treat second as item... no count
            if (a0 === 0x14 || a0 === 20) {
              itemId = a1;
              count = 1;
            } else {
              // [itemId, count]
              itemId = a0;
              count = parseInt(String(args[1]), 10) || 1;
            }
          } else if (args.length === 1) {
            itemId = parseFormId(args[0]);
            count = 1;
          }
          if (!itemId) {
            notify(actorId, "Usage: /additem <formId> [count]  e.g. /additem 0000f 1");
            return;
          }
          if (count < 1) count = 1;
          if (count > 10000) count = 10000;
          var inv = { entries: [] };
          try {
            inv = mp.get(actorId, "inventory") || { entries: [] };
          } catch (e2) {}
          if (!inv.entries) inv.entries = [];
          var found = false;
          for (var i = 0; i < inv.entries.length; i++) {
            if (+inv.entries[i].baseId === itemId) {
              inv.entries[i].count = (+inv.entries[i].count || 0) + count;
              found = true;
              break;
            }
          }
          if (!found) inv.entries.push({ baseId: itemId, count: count });
          try {
            mp.set(actorId, "inventory", inv);
          } catch (e3) {
            log("set inv fail " + e3);
          }
          log("additem actor=" + actorId.toString(16) + " item=" + itemId.toString(16) + " x" + count);
          notify(actorId, "additem " + itemId.toString(16) + " x" + count);
          return;
        }

        // --- VOA admin commands ---
        if (cmd === "announce") {
          var msg = args
            .map(function (a) {
              return String(a);
            })
            .join(" ")
            .trim();
          // strip optional quotes
          if (
            (msg.charAt(0) === '"' && msg.charAt(msg.length - 1) === '"') ||
            (msg.charAt(0) === "'" && msg.charAt(msg.length - 1) === "'")
          ) {
            msg = msg.slice(1, -1);
          }
          if (!msg) {
            notify(actorId, "Usage: announce <message>");
            return;
          }
          var n = announceAll(msg, playerName(actorId));
          notify(actorId, "Announcement sent to " + n + " player(s)");
          return;
        }

        if (cmd === "listplayers" || cmd === "players") {
          var online = onlinePlayers();
          var lines = [];
          for (var pi = 0; pi < online.length; pi++) {
            var oid = Number(online[pi]);
            lines.push(playerName(oid) + " [" + oid.toString(16) + "]");
          }
          var listMsg =
            online.length === 0
              ? "No players online"
              : "Online (" + online.length + "): " + lines.join(", ");
          log(listMsg);
          notify(actorId, listMsg);
          // also messageBox for long lists
          pushEval(
            actorId,
            "(function(){try{ctx.sp.Debug.messageBox('" +
              escapeJs(listMsg) +
              "');}catch(e){}})()"
          );
          return;
        }

        if (cmd === "tp" || cmd === "tpto" || cmd === "goto") {
          var targetQ = args
            .map(function (a) {
              return String(a);
            })
            .join(" ")
            .trim();
          if (!targetQ) {
            notify(actorId, "Usage: tp <playerName|p1000|formId>");
            return;
          }
          var target = findPlayer(targetQ);
          if (!target) {
            notify(actorId, "Player not found: " + targetQ);
            return;
          }
          if (target === actorId) {
            notify(actorId, "Already at target");
            return;
          }
          setLoc(actorId, getLoc(target), 40);
          notify(actorId, "Teleported to " + playerName(target));
          notify(target, playerName(actorId) + " teleported to you");
          return;
        }

        if (cmd === "summon" || cmd === "bring") {
          var targetQ2 = args
            .map(function (a) {
              return String(a);
            })
            .join(" ")
            .trim();
          if (!targetQ2) {
            notify(actorId, "Usage: summon <playerName|p1000|formId>");
            return;
          }
          var target2 = findPlayer(targetQ2);
          if (!target2) {
            notify(actorId, "Player not found: " + targetQ2);
            return;
          }
          if (target2 === actorId) {
            notify(actorId, "Cannot summon yourself");
            return;
          }
          setLoc(target2, getLoc(actorId), 60);
          notify(actorId, "Summoned " + playerName(target2));
          notify(target2, "You were summoned by " + playerName(actorId));
          return;
        }

        if (
          cmd === "giveplayerspell" ||
          cmd === "givespell" ||
          cmd === "addspell"
        ) {
          // args: [playerName|player|self, spellFormId] OR [spellFormId] (self)
          var tQuery = "";
          var spellId = 0;
          if (args.length >= 2) {
            tQuery = String(args[0]);
            spellId = parseInt(String(args[1]), 0);
            if (!spellId) spellId = parseInt(String(args[1]), 16);
          } else if (args.length === 1) {
            tQuery = "self";
            spellId = parseInt(String(args[0]), 0);
            if (!spellId) spellId = parseInt(String(args[0]), 16);
          }
          if (!spellId) {
            notify(
              actorId,
              "Usage: giveplayerspell <player|self> <spellFormId>"
            );
            return;
          }
          var tId = actorId;
          var tq = tQuery.toLowerCase();
          if (tq && tq !== "self" && tq !== "me" && tq !== "player") {
            // if first arg is pure form id and only one meaningful target, treat as self spell
            if (
              args.length === 1 ||
              ((/^0x[0-9a-f]+$/i.test(tQuery) || /^[0-9]+$/.test(tQuery)) &&
                args.length === 1)
            ) {
              tId = actorId;
            } else {
              tId = findPlayer(tQuery);
              if (!tId) {
                notify(actorId, "Player not found: " + tQuery);
                return;
              }
            }
          }
          if (giveSpell(tId, spellId)) {
            notify(
              actorId,
              "Gave spell " +
                spellId.toString(16) +
                " to " +
                playerName(tId)
            );
            if (tId !== actorId) {
              notify(tId, "You received a spell from staff");
            }
          } else {
            notify(actorId, "Failed to grant spell");
          }
          return;
        }

        if (cmd === "placeatme" || cmd === "disable" || cmd === "mp") {
          log(cmd + " requested (limited on this build)");
          notify(actorId, cmd + ": limited / use VOA commands");
          return;
        }

        notify(
          actorId,
          "Unknown admin cmd. Try: announce, tp, summon, giveplayerspell, listplayers, additem"
        );
      } catch (eAll) {
        log("" + eAll);
      }
    };

    log("Chakra handler ready (announce/tp/summon/giveplayerspell/listplayers)");
  } catch (e) {
    try {
      console.log("[VOA-console] init fail " + e);
    } catch (e2) {}
  }
})();
