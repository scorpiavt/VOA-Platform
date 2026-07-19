/* VOA: overhead names + hold-E radial (give name / trade) — injected into skymp5-client */
System.register("skymp5-client/src/front/playerInteract", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/messages", "skymp5-client/src/front/components/inventory"], function (exports_pi, context_pi) {
    "use strict";
    var sp, messages_pi, inventory_pi, setupPlayerInteract;
    var __moduleName = context_pi && context_pi.id;
    return {
        setters: [
            function (sp_1) { sp = sp_1; },
            function (m) { messages_pi = m; },
            function (inv) { inventory_pi = inv; }
        ],
        execute: function () {
            /**
             * Overhead nameplates (hidden until revealed), hold-E radial on other players,
             * give-name / nearby intro, and 2-player trade UI.
             */
            exports_pi("setupPlayerInteract", setupPlayerInteract = function (getSend, localIdToRemoteId, remoteIdToLocalId) {
                try {
                    if (sp.storage["voaPlayerInteractReady"])
                        return;
                    sp.storage["voaPlayerInteractReady"] = true;
                }
                catch (e0) { return; }

                var HOLD_MS = 450;
                var NAME_RANGE = 1800;
                var eHeldSince = 0;
                var menuOpen = false;
                var tradeOpen = false;
                var focusRemoteId = 0;
                var nameTexts = {}; // remoteId -> textId
                var lastPlateAt = 0;

                // --- helpers ---
                var sendInteract = function (action, targetRemoteId, payload) {
                    try {
                        var send = getSend && getSend();
                        if (!send) {
                            sp.printConsole("VOA interact: no send yet");
                            return;
                        }
                        send({
                            t: messages_pi.MsgType.CustomEvent,
                            eventName: "_voaInteract",
                            args: [
                                action,
                                Number(targetRemoteId) || 0,
                                JSON.stringify(payload || {}),
                            ],
                        }, true);
                        sp.printConsole("VOA interact send " + action + " -> " + (targetRemoteId || 0).toString(16));
                    }
                    catch (eS) {
                        sp.printConsole("VOA interact send err " + eS);
                    }
                };

                var myRemoteId = function () {
                    try {
                        // owner form from world model isn't easy; use 0 and let server use sender
                        return 0;
                    }
                    catch (e) { return 0; }
                };

                var getTrueName = function (remoteId) {
                    try {
                        var map = sp.storage["voaTrueNames"] || {};
                        if (map[remoteId]) return String(map[remoteId]);
                    }
                    catch (e) {}
                    return "";
                };

                var getDisplayName = function (remoteId) {
                    try {
                        var rev = sp.storage["voaRevealedNames"] || {};
                        if (rev[remoteId]) return String(rev[remoteId]);
                    }
                    catch (e) {}
                    return "???";
                };

                var rememberTrueName = function (remoteId, name) {
                    if (!remoteId || !name) return;
                    try {
                        var map = sp.storage["voaTrueNames"];
                        if (!map || typeof map !== "object") {
                            map = {};
                            sp.storage["voaTrueNames"] = map;
                        }
                        map[remoteId] = String(name);
                    }
                    catch (e) {}
                };

                // --- CEF UI builders ---
                var ensureBrowser = function () {
                    try {
                        sp.browser.setVisible(true);
                    }
                    catch (e) {}
                };

                var injectCssOnce = function () {
                    if (sp.storage["voaUiCss"]) return;
                    sp.storage["voaUiCss"] = true;
                    ensureBrowser();
                    var css = "(function(){try{if(document.getElementById('voa-ui-style'))return;" +
                        "var s=document.createElement('style');s.id='voa-ui-style';s.textContent=" +
                        JSON.stringify(
                            "#voa-radial,#voa-trade,#voa-trade-req{font-family:Segoe UI,Tahoma,sans-serif;color:#e8e6e3}" +
                            "#voa-radial{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}" +
                            "#voa-radial .ring{position:relative;width:280px;height:280px}" +
                            "#voa-radial .btn{position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid rgba(201,162,39,.85);" +
                            "background:radial-gradient(circle at 30% 25%,#2a3344,#12161e);color:#f0e6c8;font-weight:700;font-size:12px;letter-spacing:.04em;" +
                            "text-transform:uppercase;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.55);padding:10px;line-height:1.25}" +
                            "#voa-radial .btn:hover{border-color:#e0c04a;transform:scale(1.05)}" +
                            "#voa-radial .c{left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:72px;font-size:11px;opacity:.9}" +
                            "#voa-radial .b0{left:50%;top:8px;transform:translateX(-50%)}" +
                            "#voa-radial .b1{right:8px;top:50%;transform:translateY(-50%)}" +
                            "#voa-radial .b2{left:8px;top:50%;transform:translateY(-50%)}" +
                            "#voa-trade{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}" +
                            "#voa-trade .panel{width:min(920px,94vw);max-height:86vh;overflow:auto;background:linear-gradient(180deg,#1a1f2a,#0e1218);" +
                            "border:2px solid rgba(201,162,39,.75);border-radius:14px;padding:16px 18px;box-shadow:0 16px 48px rgba(0,0,0,.7)}" +
                            "#voa-trade h2{margin:0 0 10px;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#c9a227}" +
                            "#voa-trade .cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}" +
                            "#voa-trade .col{background:rgba(255,255,255,.04);border-radius:10px;padding:10px;min-height:200px}" +
                            "#voa-trade .item{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;margin:4px 0;border-radius:6px;background:rgba(0,0,0,.25);cursor:pointer;font-size:13px}" +
                            "#voa-trade .item:hover{background:rgba(201,162,39,.15)}" +
                            "#voa-trade .actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}" +
                            "#voa-trade button,#voa-trade-req button{cursor:pointer;border:none;border-radius:8px;padding:10px 14px;font-weight:700;font-size:13px;" +
                            "background:linear-gradient(180deg,#e0c04a,#a8841c);color:#1a1408}" +
                            "#voa-trade button.secondary{background:#2a3344;color:#e8e6e3;border:1px solid rgba(255,255,255,.15)}" +
                            "#voa-trade-req{position:fixed;left:50%;bottom:14%;transform:translateX(-50%);z-index:2147483646;background:rgba(8,10,14,.92);" +
                            "border:2px solid rgba(201,162,39,.75);border-radius:12px;padding:14px 18px;min-width:280px;text-align:center}"
                        ) +
                        ";document.head.appendChild(s);}catch(e){}})();";
                    try { sp.browser.executeJavaScript(css); } catch (e) {}
                };

                var closeRadial = function () {
                    menuOpen = false;
                    try {
                        sp.browser.executeJavaScript("(function(){var e=document.getElementById('voa-radial');if(e)e.remove();try{window.skyrimPlatform&&window.skyrimPlatform.sendMessage(['voaRadialClose']);}catch(x){}})();");
                    } catch (e) {}
                    try { sp.browser.setFocused(false); } catch (e2) {}
                };

                var openRadial = function (remoteId, label) {
                    injectCssOnce();
                    ensureBrowser();
                    menuOpen = true;
                    focusRemoteId = remoteId;
                    var title = label || "Player";
                    var js = "(function(){try{if(!document.body)return;" +
                        "var old=document.getElementById('voa-radial');if(old)old.remove();" +
                        "var el=document.createElement('div');el.id='voa-radial';" +
                        "el.innerHTML='<div class=\"ring\">" +
                        "<button class=\"btn b0\" data-a=\"givename\">Give Name<br/>to Player</button>" +
                        "<button class=\"btn b1\" data-a=\"givename_nearby\">Give Name<br/>Nearby</button>" +
                        "<button class=\"btn b2\" data-a=\"trade_request\">Trade</button>" +
                        "<button class=\"btn c\" data-a=\"close\">Close</button>" +
                        "</div><div style=\"position:absolute;bottom:18%;left:50%;transform:translateX(-50%);opacity:.85;font-size:13px\">" +
                        title.replace(/'/g, "") + " — hold menu</div>';" +
                        "document.body.appendChild(el);" +
                        "el.querySelectorAll('button').forEach(function(b){b.onclick=function(){" +
                        "var a=b.getAttribute('data-a');" +
                        "try{window.skyrimPlatform.sendMessage(['voaRadial',a," + remoteId + "]);}catch(e1){" +
                        "try{window.skyrimPlatform.sendMessage('voaRadial',a," + remoteId + ");}catch(e2){}}" +
                        "};});" +
                        "el.addEventListener('click',function(ev){if(ev.target===el){try{window.skyrimPlatform.sendMessage(['voaRadial','close',0]);}catch(e){}}});" +
                        "}catch(e0){}})();";
                    try {
                        sp.browser.executeJavaScript(js);
                        sp.browser.setFocused(true);
                    } catch (e) {
                        sp.printConsole("VOA radial open fail " + e);
                    }
                    sp.printConsole("VOA: radial open target=" + remoteId.toString(16));
                };

                var hideTrade = function () {
                    tradeOpen = false;
                    try {
                        sp.browser.executeJavaScript("(function(){var e=document.getElementById('voa-trade');if(e)e.remove();})();");
                    } catch (e) {}
                    try { sp.browser.setFocused(false); } catch (e2) {}
                };

                var showTrade = function (ui) {
                    if (!ui) return;
                    injectCssOnce();
                    ensureBrowser();
                    tradeOpen = true;
                    sp.storage["voaTradeState"] = ui;
                    // Build inventory list from local player
                    var invItems = [];
                    try {
                        var inv = inventory_pi.getInventory(sp.Game.getPlayer());
                        if (inv && inv.entries) {
                            for (var i = 0; i < inv.entries.length; i++) {
                                var e = inv.entries[i];
                                if (!e || e.worn) continue;
                                var bid = Number(e.baseId) || 0;
                                var cnt = Number(e.count) || 0;
                                if (!bid || !cnt) continue;
                                var nm = e.name || ("#" + bid.toString(16));
                                invItems.push({ baseId: bid, count: cnt, name: String(nm) });
                            }
                        }
                    } catch (eI) {}
                    var myOffer = ui.myOffer || [];
                    var theirOffer = ui.theirOffer || [];
                    var payload = {
                        tradeId: ui.tradeId,
                        partnerName: ui.partnerName || "Player",
                        readyMe: !!ui.readyMe,
                        readyThem: !!ui.readyThem,
                        inv: invItems.slice(0, 40),
                        myOffer: myOffer,
                        theirOffer: theirOffer,
                    };
                    var js = "(function(){try{if(!document.body)return;" +
                        "var d=" + JSON.stringify(payload) + ";" +
                        "var old=document.getElementById('voa-trade');if(old)old.remove();" +
                        "var el=document.createElement('div');el.id='voa-trade';" +
                        "function esc(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;');}" +
                        "function list(arr,cls,clickable){return (arr||[]).map(function(it,idx){" +
                        "return '<div class=\"item\" data-cls=\"'+cls+'\" data-i=\"'+idx+'\" data-b=\"'+it.baseId+'\" data-c=\"'+it.count+'\" data-n=\"'+esc(it.name||'')+'\">'+esc(it.name||('#'+it.baseId))+' <span>x'+it.count+'</span></div>';}).join('');}" +
                        "el.innerHTML='<div class=\"panel\"><h2>Trade with '+esc(d.partnerName)+'</h2>" +
                        "<div class=\"cols\">" +
                        "<div class=\"col\"><div style=\"opacity:.7;margin-bottom:6px\">Your inventory</div><div id=\"voa-inv\">'+list(d.inv,'inv',true)+'</div></div>" +
                        "<div class=\"col\"><div style=\"opacity:.7;margin-bottom:6px\">Your offer</div><div id=\"voa-my\">'+list(d.myOffer,'my',true)+'</div></div>" +
                        "<div class=\"col\"><div style=\"opacity:.7;margin-bottom:6px\">Their offer</div><div id=\"voa-their\">'+list(d.theirOffer,'their',false)+'</div></div>" +
                        "</div>" +
                        "<div style=\"margin-top:10px;font-size:13px\">You: '+(d.readyMe?'READY':'…')+' &nbsp;|&nbsp; Them: '+(d.readyThem?'READY':'…')+'</div>" +
                        "<div class=\"actions\">" +
                        "<button id=\"voa-ready\">'+(d.readyMe?'Unready':'Ready')+'</button>" +
                        "<button class=\"secondary\" id=\"voa-cancel\">Cancel</button>" +
                        "</div><div style=\"margin-top:8px;opacity:.65;font-size:12px\">Click inventory items to add to offer · click offer to remove</div></div>';" +
                        "document.body.appendChild(el);" +
                        "var myOffer=JSON.parse(JSON.stringify(d.myOffer||[]));" +
                        "function syncOffer(){try{window.skyrimPlatform.sendMessage(['voaTrade','offer',d.tradeId,JSON.stringify(myOffer)]);}catch(e){}}" +
                        "el.querySelectorAll('.item').forEach(function(node){node.onclick=function(){" +
                        "var cls=node.getAttribute('data-cls');var b=+node.getAttribute('data-b');var c=+node.getAttribute('data-c');var n=node.getAttribute('data-n')||'';" +
                        "if(cls==='inv'){var found=null;for(var i=0;i<myOffer.length;i++){if(myOffer[i].baseId===b){found=myOffer[i];break;}}" +
                        "if(found){if(found.count<c)found.count++;}else myOffer.push({baseId:b,count:1,name:n});syncOffer();}" +
                        "if(cls==='my'){myOffer=myOffer.filter(function(x){return x.baseId!==b;});syncOffer();}" +
                        "};});" +
                        "document.getElementById('voa-ready').onclick=function(){try{window.skyrimPlatform.sendMessage(['voaTrade','ready',d.tradeId,d.readyMe?0:1]);}catch(e){}};" +
                        "document.getElementById('voa-cancel').onclick=function(){try{window.skyrimPlatform.sendMessage(['voaTrade','cancel',d.tradeId]);}catch(e){}};" +
                        "}catch(e0){}})();";
                    try {
                        sp.browser.executeJavaScript(js);
                        sp.browser.setFocused(true);
                    } catch (eT) {
                        sp.printConsole("VOA trade UI fail " + eT);
                    }
                };

                var showTradeRequest = function (req) {
                    injectCssOnce();
                    ensureBrowser();
                    var js = "(function(){try{if(!document.body)return;" +
                        "var old=document.getElementById('voa-trade-req');if(old)old.remove();" +
                        "var el=document.createElement('div');el.id='voa-trade-req';" +
                        "el.innerHTML='<div style=\"font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#c9a227;margin-bottom:6px\">Trade request</div>" +
                        "<div style=\"margin-bottom:12px\">'+(" + JSON.stringify(String(req.fromName || "Player")) + ")+' wants to trade</div>" +
                        "<button id=\"voa-tr-yes\">Accept</button> <button id=\"voa-tr-no\" style=\"margin-left:8px;background:#333;color:#eee;border:1px solid #666;border-radius:8px;padding:10px 14px\">Decline</button>';" +
                        "document.body.appendChild(el);" +
                        "document.getElementById('voa-tr-yes').onclick=function(){try{window.skyrimPlatform.sendMessage(['voaTrade','accept'," + Number(req.id) + "]);}catch(e){};el.remove();};" +
                        "document.getElementById('voa-tr-no').onclick=function(){try{window.skyrimPlatform.sendMessage(['voaTrade','decline'," + Number(req.id) + "]);}catch(e){};el.remove();};" +
                        "}catch(e0){}})();";
                    try {
                        sp.browser.executeJavaScript(js);
                        sp.browser.setFocused(true);
                    } catch (e) {}
                };

                // Expose for server-driven eval updates
                try {
                    sp.storage._voaShowTrade = showTrade;
                    sp.storage._voaHideTrade = hideTrade;
                    sp.storage._voaShowTradeRequest = showTradeRequest;
                } catch (eX) {}

                // browserMessage from CEF
                try {
                    sp.on("browserMessage", function (e) {
                        try {
                            var args = (e && e.arguments) ? e.arguments : e;
                            if (!args) return;
                            // flatten nested
                            var a0 = args[0];
                            if (a0 && a0.length && typeof a0 !== "string") {
                                args = a0;
                                a0 = args[0];
                            }
                            if (a0 === "voaRadial" || a0 === "voaRadialClose") {
                                if (a0 === "voaRadialClose" || args[1] === "close") {
                                    closeRadial();
                                    return;
                                }
                                var action = String(args[1] || "");
                                var tid = Number(args[2]) || focusRemoteId;
                                closeRadial();
                                if (action === "givename")
                                    sendInteract("giveName", tid, {});
                                else if (action === "givename_nearby")
                                    sendInteract("giveName_nearby", 0, {});
                                else if (action === "trade_request")
                                    sendInteract("trade_request", tid, {});
                                return;
                            }
                            if (a0 === "voaTrade") {
                                var op = String(args[1] || "");
                                var tradeId = Number(args[2]) || 0;
                                if (op === "accept")
                                    sendInteract("trade_accept", 0, { tradeId: tradeId });
                                else if (op === "decline")
                                    sendInteract("trade_decline", 0, { tradeId: tradeId });
                                else if (op === "cancel") {
                                    hideTrade();
                                    sendInteract("trade_cancel", 0, { tradeId: tradeId });
                                }
                                else if (op === "ready") {
                                    var ready = Number(args[3]) === 1;
                                    sendInteract("trade_ready", 0, { tradeId: tradeId, ready: ready });
                                }
                                else if (op === "offer") {
                                    var offer = [];
                                    try { offer = JSON.parse(String(args[3] || "[]")); } catch (eJ) { offer = []; }
                                    sendInteract("trade_offer", 0, { tradeId: tradeId, offer: offer });
                                }
                            }
                        }
                        catch (err) {
                            sp.printConsole("VOA browserMessage " + err);
                        }
                    });
                }
                catch (eBm) {}

                // Hook createActor/look storage: remember true names from model updates via world view
                // We scan storage each frame for form views via crosshair + nearby actors with 0xff ids

                var destroyPlate = function (rid) {
                    try {
                        if (nameTexts[rid] != null) {
                            sp.destroyText(nameTexts[rid]);
                            delete nameTexts[rid];
                        }
                    } catch (e) {}
                };

                var updateNameplates = function () {
                    var now = Date.now();
                    if (now - lastPlateAt < 50) return; // ~20fps plates
                    lastPlateAt = now;
                    if (menuOpen || tradeOpen) return;
                    try {
                        if (sp.Ui.isMenuOpen("Loading Menu") || sp.Ui.isMenuOpen("MapMenu") || sp.Ui.isMenuOpen("InventoryMenu"))
                            return;
                    } catch (eM) {}

                    var player = sp.Game.getPlayer();
                    if (!player) return;
                    var seen = {};
                    var px = player.getPositionX();
                    var py = player.getPositionY();
                    var pz = player.getPositionZ();

                    // Collect nearby MP players via form views remote ids stored when we see looks
                    var trueNames = sp.storage["voaTrueNames"] || {};
                    var keys = Object.keys(trueNames);
                    for (var ki = 0; ki < keys.length; ki++) {
                        var rid = Number(keys[ki]);
                        if (!rid || rid < 0xff000000) continue;
                        var localId = 0;
                        try {
                            localId = remoteIdToLocalId ? remoteIdToLocalId(rid) : 0;
                        } catch (eR) { localId = 0; }
                        if (!localId) continue;
                        var ac = sp.Actor.from(sp.Game.getFormEx(localId));
                        if (!ac || ac.isDisabled()) {
                            destroyPlate(rid);
                            continue;
                        }
                        var dx = ac.getPositionX() - px;
                        var dy = ac.getPositionY() - py;
                        var dz = ac.getPositionZ() - pz;
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (dist > NAME_RANGE) {
                            destroyPlate(rid);
                            continue;
                        }
                        var headPos = [
                            sp.NetImmerse.getNodeWorldPositionX(ac, "NPC Head [Head]", false),
                            sp.NetImmerse.getNodeWorldPositionY(ac, "NPC Head [Head]", false),
                            sp.NetImmerse.getNodeWorldPositionZ(ac, "NPC Head [Head]", false) + 12,
                        ];
                        if (!headPos[0] && !headPos[1] && !headPos[2]) {
                            headPos = [ac.getPositionX(), ac.getPositionY(), ac.getPositionZ() + 100];
                        }
                        var scr = sp.worldPointToScreenPoint(headPos)[0];
                        if (!scr || scr[2] <= 0 || scr[0] < 0 || scr[0] > 1 || scr[1] < 0 || scr[1] > 1) {
                            destroyPlate(rid);
                            continue;
                        }
                        var label = getDisplayName(rid);
                        // screen coords: SP createText uses roughly percentage 0-100?
                        // red-house used x1*100, y1*100 for UI; createText docs say xPos yPos
                        var x = scr[0] * 100;
                        var y = (1 - scr[1]) * 100; // flip Y for top-left origin texts often
                        // Some SP builds use -1..1 with center origin — try 0-1 mapped to screen percent
                        if (nameTexts[rid] == null) {
                            try {
                                nameTexts[rid] = sp.createText(x, y, label, [1, 0.9, 0.55, 1], "Tavern");
                                try { sp.setTextSize(nameTexts[rid], 0.9); } catch (eSz) {}
                                try { sp.setTextOrigin(nameTexts[rid], [0.5, 1]); } catch (eO) {}
                            } catch (eC) {
                                nameTexts[rid] = null;
                            }
                        }
                        else {
                            try {
                                sp.setTextPos(nameTexts[rid], x, y);
                                sp.setTextString(nameTexts[rid], label);
                            } catch (eU) {
                                destroyPlate(rid);
                            }
                        }
                        seen[rid] = true;
                    }
                    // cleanup
                    for (var rid2 in nameTexts) {
                        if (!seen[rid2]) destroyPlate(Number(rid2));
                    }
                };

                // Hold E on player under crosshair
                sp.on("update", function () {
                    try {
                        // Poll trade UI updates from storage (set by eval)
                        if (sp.storage["voaTradeUi"] && !tradeOpen) {
                            showTrade(sp.storage["voaTradeUi"]);
                            sp.storage["voaTradeUi"] = null;
                        }
                        if (sp.storage["voaTradeRequest"]) {
                            showTradeRequest(sp.storage["voaTradeRequest"]);
                            sp.storage["voaTradeRequest"] = null;
                        }

                        updateNameplates();

                        if (menuOpen || tradeOpen) {
                            eHeldSince = 0;
                            return;
                        }
                        // Don't fight activation while menus open
                        try {
                            if (sp.Ui.isMenuOpen("Console") || sp.Ui.isMenuOpen("InventoryMenu") || sp.Ui.isMenuOpen("MapMenu"))
                            {
                                eHeldSince = 0;
                                return;
                            }
                        } catch (eUi) {}

                        var eDown = false;
                        try { eDown = sp.Input.isKeyPressed(18 /* E */); } catch (eK) {}
                        if (!eDown) {
                            eHeldSince = 0;
                            return;
                        }
                        var cross = sp.Game.getCurrentCrosshairRef();
                        if (!cross) {
                            eHeldSince = 0;
                            return;
                        }
                        var localId = cross.getFormID();
                        if (!localId || localId === 0x14) {
                            eHeldSince = 0;
                            return;
                        }
                        // Must be an actor (other player clone)
                        var ac = sp.Actor.from(cross);
                        if (!ac) {
                            eHeldSince = 0;
                            return;
                        }
                        var remoteId = 0;
                        try {
                            remoteId = localIdToRemoteId ? localIdToRemoteId(localId) : 0;
                        } catch (eL) { remoteId = 0; }
                        // Only MP players (0xff*)
                        if (!remoteId || remoteId < 0xff000000) {
                            eHeldSince = 0;
                            return;
                        }
                        if (!eHeldSince) eHeldSince = Date.now();
                        if (Date.now() - eHeldSince >= HOLD_MS) {
                            eHeldSince = Date.now() + 100000; // prevent re-fire until release
                            var label = getDisplayName(remoteId);
                            if (label === "???") label = "Unknown traveler";
                            openRadial(remoteId, label);
                        }
                    }
                    catch (eAll) {
                        // silent
                    }
                });

                // Store true names when FormView models update — hook via periodic scan of createActor looks is hard;
                // instead patch storage from look when remoteServer createActor runs — we monkey via storage callback
                try {
                    var prev = sp.storage._voaOnPlayerLook;
                    sp.storage._voaOnPlayerLook = function (remoteId, name) {
                        rememberTrueName(remoteId, name);
                        if (typeof prev === "function") try { prev(remoteId, name); } catch (e) {}
                    };
                } catch (eH) {}

                sp.printConsole("VOA: player interact ready (hold E on player · nameplates · trade)");
            });
        }
    };
});
