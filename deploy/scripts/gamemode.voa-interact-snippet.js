/* === VOA player interact: name reveal + trade (Chakra) === */
(function () {
  try {
    if (typeof mp === "undefined" || !mp) return;

    function log(msg) {
      try {
        console.log("[VOA-interact] " + msg);
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
        .replace(/\n/g, "\\n");
    }

    function notify(formId, text) {
      pushEval(
        formId,
        "(function(){try{ctx.sp.Debug.notification('" +
          escapeJs(text) +
          "');ctx.sp.printConsole('" +
          escapeJs(text) +
          "');}catch(e){}})()"
      );
    }

    /** Tell viewer that actorId's name is `name` */
    function sendNameReveal(viewerId, actorId, name) {
      var js =
        "(function(){try{" +
        "var map=ctx.sp.storage['voaRevealedNames'];" +
        "if(!map||typeof map!=='object'){map={};ctx.sp.storage['voaRevealedNames']=map;}" +
        "map[" +
        Number(actorId) +
        "]='" +
        escapeJs(name) +
        "';" +
        "ctx.sp.printConsole('VOA: learned name of '+" +
        Number(actorId) +
        ".toString(16)+' => " +
        escapeJs(name) +
        "');" +
        "try{ctx.sp.Debug.notification('You learned a name: " +
        escapeJs(name) +
        "');}catch(eN){}" +
        "}catch(e){}})()";
      pushEval(viewerId, js);
    }

    // --- Trade sessions ---
    var trades = Object.create(null);
    var nextTradeId = 1;
    var NEARBY_R = 600; // game units ~ small circle
    var NEARBY_R2 = NEARBY_R * NEARBY_R;

    function findTradeByPlayer(formId) {
      for (var k in trades) {
        var t = trades[k];
        if (t && (t.a === formId || t.b === formId)) return t;
      }
      return null;
    }

    function invEntries(formId) {
      try {
        var inv = mp.get(formId, "inventory") || { entries: [] };
        return inv.entries || [];
      } catch (e) {
        return [];
      }
    }

    function setInv(formId, entries) {
      mp.set(formId, "inventory", { entries: entries || [] });
    }

    function removeItems(entries, removeList) {
      // removeList: [{baseId, count}]
      var out = entries.map(function (e) {
        return {
          baseId: Number(e.baseId),
          count: Number(e.count) || 0,
          worn: !!e.worn,
          name: e.name,
        };
      });
      for (var r = 0; r < removeList.length; r++) {
        var need = Number(removeList[r].count) || 0;
        var bid = Number(removeList[r].baseId);
        if (!need || !bid) continue;
        for (var i = 0; i < out.length && need > 0; i++) {
          if (out[i].baseId !== bid || out[i].worn) continue;
          var take = Math.min(out[i].count, need);
          out[i].count -= take;
          need -= take;
        }
        if (need > 0) return null; // not enough
      }
      return out.filter(function (e) {
        return e.count > 0;
      });
    }

    function addItems(entries, addList) {
      var out = entries.map(function (e) {
        return {
          baseId: Number(e.baseId),
          count: Number(e.count) || 0,
          worn: !!e.worn,
          name: e.name,
        };
      });
      for (var a = 0; a < addList.length; a++) {
        var bid = Number(addList[a].baseId);
        var cnt = Number(addList[a].count) || 0;
        if (!bid || !cnt) continue;
        var found = false;
        for (var i = 0; i < out.length; i++) {
          if (out[i].baseId === bid && !out[i].worn) {
            out[i].count += cnt;
            found = true;
            break;
          }
        }
        if (!found) out.push({ baseId: bid, count: cnt });
      }
      return out;
    }

    function pushTradeUi(formId, payload) {
      var js =
        "(function(){try{" +
        "ctx.sp.storage['voaTradeUi']=" +
        JSON.stringify(payload) +
        ";" +
        "if(typeof ctx.sp.storage._voaShowTrade==='function')ctx.sp.storage._voaShowTrade(" +
        JSON.stringify(payload) +
        ");" +
        "}catch(e){}})()";
      pushEval(formId, js);
    }

    function closeTradeUi(formId) {
      pushEval(
        formId,
        "(function(){try{ctx.sp.storage['voaTradeUi']=null;if(typeof ctx.sp.storage._voaHideTrade==='function')ctx.sp.storage._voaHideTrade();}catch(e){}})()"
      );
    }

    mp["_voaInteract"] = function (senderFormId, action, targetFormId, payloadJson) {
      try {
        var sender = Number(senderFormId) || 0;
        var target = Number(targetFormId) || 0;
        var act = String(action || "").toLowerCase();
        var payload = {};
        try {
          payload =
            typeof payloadJson === "string"
              ? JSON.parse(payloadJson || "{}")
              : payloadJson || {};
        } catch (eP) {
          payload = {};
        }
        if (!sender) return;
        log("act=" + act + " from=" + sender.toString(16) + " to=" + target.toString(16));

        if (act === "givename") {
          if (!target) {
            notify(sender, "No target");
            return;
          }
          var myName = getName(sender);
          sendNameReveal(target, sender, myName);
          notify(sender, "You shared your name with " + getName(target));
          notify(target, getName(sender) + " shared their name with you");
          return;
        }

        if (act === "givename_nearby") {
          var sp = getPos(sender);
          if (!sp) {
            notify(sender, "Could not find your position");
            return;
          }
          var myName2 = getName(sender);
          var online = onlinePlayers();
          var n = 0;
          for (var i = 0; i < online.length; i++) {
            var oid = Number(online[i]);
            if (!oid || oid === sender) continue;
            var op = getPos(oid);
            if (!op) continue;
            if (dist2(sp, op) > NEARBY_R2) continue;
            sendNameReveal(oid, sender, myName2);
            notify(oid, myName2 + " introduced themselves nearby");
            n++;
          }
          notify(sender, "Name shared with " + n + " nearby player(s)");
          return;
        }

        if (act === "trade_request") {
          if (!target || target === sender) {
            notify(sender, "Invalid trade target");
            return;
          }
          if (findTradeByPlayer(sender) || findTradeByPlayer(target)) {
            notify(sender, "Already in a trade");
            return;
          }
          var tid = nextTradeId++;
          trades[tid] = {
            id: tid,
            a: sender,
            b: target,
            offerA: [],
            offerB: [],
            readyA: false,
            readyB: false,
            at: Date.now(),
          };
          notify(sender, "Trade request sent to " + getName(target));
          // Target gets accept prompt
          var jsReq =
            "(function(){try{" +
            "ctx.sp.storage['voaTradeRequest']={id:" +
            tid +
            ",fromId:" +
            sender +
            ",fromName:'" +
            escapeJs(getName(sender)) +
            "'};" +
            "if(typeof ctx.sp.storage._voaShowTradeRequest==='function')ctx.sp.storage._voaShowTradeRequest(ctx.sp.storage['voaTradeRequest']);" +
            "try{ctx.sp.Debug.notification('" +
            escapeJs(getName(sender)) +
            " wants to trade (Hold E menu or wait for prompt)');}catch(eN){}" +
            "}catch(e){}})()";
          pushEval(target, jsReq);
          return;
        }

        if (act === "trade_accept") {
          var idA = Number(payload.tradeId) || 0;
          var tA = trades[idA];
          if (!tA || tA.b !== sender) {
            notify(sender, "Trade not found");
            return;
          }
          // Open trade UI both sides
          var openPayloadA = {
            tradeId: idA,
            partnerId: tA.b,
            partnerName: getName(tA.b),
            myOffer: [],
            theirOffer: [],
            readyMe: false,
            readyThem: false,
            role: "a",
          };
          var openPayloadB = {
            tradeId: idA,
            partnerId: tA.a,
            partnerName: getName(tA.a),
            myOffer: [],
            theirOffer: [],
            readyMe: false,
            readyThem: false,
            role: "b",
          };
          pushTradeUi(tA.a, openPayloadA);
          pushTradeUi(tA.b, openPayloadB);
          notify(tA.a, "Trade started with " + getName(tA.b));
          notify(tA.b, "Trade started with " + getName(tA.a));
          return;
        }

        if (act === "trade_decline") {
          var idD = Number(payload.tradeId) || 0;
          var tD = trades[idD];
          if (tD) {
            notify(tD.a, getName(sender) + " declined the trade");
            delete trades[idD];
          }
          notify(sender, "Trade declined");
          return;
        }

        if (act === "trade_offer") {
          var idO = Number(payload.tradeId) || 0;
          var tO = trades[idO];
          if (!tO) {
            notify(sender, "Trade expired");
            return;
          }
          var offer = Array.isArray(payload.offer) ? payload.offer : [];
          // sanitize
          var clean = [];
          for (var oi = 0; oi < offer.length; oi++) {
            var bi = Number(offer[oi].baseId) || 0;
            var ct = Number(offer[oi].count) || 0;
            if (bi > 0 && ct > 0)
              clean.push({
                baseId: bi,
                count: ct,
                name: String(offer[oi].name || ""),
              });
          }
          if (sender === tO.a) {
            tO.offerA = clean;
            tO.readyA = false;
            tO.readyB = false;
          } else if (sender === tO.b) {
            tO.offerB = clean;
            tO.readyA = false;
            tO.readyB = false;
          } else return;
          // sync both UIs
          pushTradeUi(tO.a, {
            tradeId: idO,
            partnerId: tO.b,
            partnerName: getName(tO.b),
            myOffer: tO.offerA,
            theirOffer: tO.offerB,
            readyMe: tO.readyA,
            readyThem: tO.readyB,
            role: "a",
          });
          pushTradeUi(tO.b, {
            tradeId: idO,
            partnerId: tO.a,
            partnerName: getName(tO.a),
            myOffer: tO.offerB,
            theirOffer: tO.offerA,
            readyMe: tO.readyB,
            readyThem: tO.readyA,
            role: "b",
          });
          return;
        }

        if (act === "trade_ready") {
          var idR = Number(payload.tradeId) || 0;
          var tR = trades[idR];
          if (!tR) return;
          var ready = payload.ready === true;
          if (sender === tR.a) tR.readyA = ready;
          else if (sender === tR.b) tR.readyB = ready;
          else return;
          pushTradeUi(tR.a, {
            tradeId: idR,
            partnerId: tR.b,
            partnerName: getName(tR.b),
            myOffer: tR.offerA,
            theirOffer: tR.offerB,
            readyMe: tR.readyA,
            readyThem: tR.readyB,
            role: "a",
          });
          pushTradeUi(tR.b, {
            tradeId: idR,
            partnerId: tR.a,
            partnerName: getName(tR.a),
            myOffer: tR.offerB,
            theirOffer: tR.offerA,
            readyMe: tR.readyB,
            readyThem: tR.readyA,
            role: "b",
          });
          if (tR.readyA && tR.readyB) {
            // Execute swap
            var invA = invEntries(tR.a);
            var invB = invEntries(tR.b);
            var afterA = removeItems(invA, tR.offerA);
            var afterB = removeItems(invB, tR.offerB);
            if (!afterA || !afterB) {
              notify(tR.a, "Trade failed: missing items");
              notify(tR.b, "Trade failed: missing items");
              tR.readyA = false;
              tR.readyB = false;
              return;
            }
            afterA = addItems(afterA, tR.offerB);
            afterB = addItems(afterB, tR.offerA);
            try {
              setInv(tR.a, afterA);
              setInv(tR.b, afterB);
            } catch (eSet) {
              log("trade setInv fail " + eSet);
              notify(tR.a, "Trade failed");
              notify(tR.b, "Trade failed");
              return;
            }
            notify(tR.a, "Trade complete!");
            notify(tR.b, "Trade complete!");
            closeTradeUi(tR.a);
            closeTradeUi(tR.b);
            delete trades[idR];
            log("trade " + idR + " complete");
          }
          return;
        }

        if (act === "trade_cancel") {
          var idC = Number(payload.tradeId) || 0;
          var tC = trades[idC] || findTradeByPlayer(sender);
          if (tC) {
            closeTradeUi(tC.a);
            closeTradeUi(tC.b);
            notify(tC.a, "Trade cancelled");
            notify(tC.b, "Trade cancelled");
            delete trades[tC.id];
          }
          return;
        }

        log("unknown act " + act);
      } catch (eAll) {
        log("handler " + eAll);
      }
    };

    // expire stale trades
    if (typeof setInterval === "function") {
      setInterval(function () {
        var now = Date.now();
        for (var k in trades) {
          if (trades[k] && now - trades[k].at > 120000) {
            try {
              closeTradeUi(trades[k].a);
              closeTradeUi(trades[k].b);
            } catch (e) {}
            delete trades[k];
          }
        }
      }, 30000);
    }

    log("interact ready (giveName / giveNameNearby / trade)");
  } catch (e) {
    try {
      console.log("[VOA-interact] init fail " + e);
    } catch (e2) {}
  }
})();
