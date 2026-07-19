/* VOA in-game chat — lower-left box, /l local, /g admin global, typing indicator, admin slash */
System.register("skymp5-client/src/front/voaChat", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/messages"], function (exports_ch, context_ch) {
    "use strict";
    var sp, messages_ch, setupVoaChat;
    var __moduleName = context_ch && context_ch.id;
    return {
        setters: [
            function (sp_1) { sp = sp_1; },
            function (m) { messages_ch = m; }
        ],
        execute: function () {
            exports_ch("setupVoaChat", setupVoaChat = function (getSend, remoteIdToLocalId) {
                try {
                    if (sp.storage["voaChatReady"])
                        return;
                    sp.storage["voaChatReady"] = true;
                }
                catch (e0) { return; }

                var chatFocused = false;
                var typingSent = false;
                var lastTypingPing = 0;
                var openCooldown = false;
                var lines = [];
                var typingTexts = {}; // remoteId -> textId
                var MAX_LINES = 60;

                var sendChat = function (action, a1, a2) {
                    try {
                        var send = getSend && getSend();
                        if (!send) {
                            sp.printConsole("VOA chat: no send");
                            return;
                        }
                        var args = [action];
                        if (a1 !== undefined) args.push(a1);
                        if (a2 !== undefined) args.push(a2);
                        send({
                            t: messages_ch.MsgType.CustomEvent,
                            eventName: "_voaChat",
                            args: args,
                        }, true);
                    }
                    catch (e) {
                        sp.printConsole("VOA chat send err " + e);
                    }
                };

                var ensureBrowser = function () {
                    try { sp.browser.setVisible(true); } catch (e) {}
                };

                var injectShell = function () {
                    ensureBrowser();
                    var js = "(function(){try{if(!document.body)return;" +
                        "if(document.getElementById('voa-chat'))return;" +
                        "var s=document.getElementById('voa-chat-style');if(!s){s=document.createElement('style');s.id='voa-chat-style';" +
                        "s.textContent=" +
                        JSON.stringify(
                            "#voa-chat{position:fixed;left:14px;bottom:14px;z-index:2147483645;width:min(420px,42vw);pointer-events:none;" +
                            "font-family:Segoe UI,Tahoma,sans-serif;color:#e8e6e3;text-shadow:0 1px 2px rgba(0,0,0,.85)}" +
                            "#voa-chat.focused{pointer-events:auto}" +
                            "#voa-chat-log{max-height:220px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;" +
                            "background:linear-gradient(180deg,rgba(0,0,0,0),rgba(8,10,14,.72));border-radius:10px 10px 0 0;padding:10px 12px 6px;" +
                            "border:1px solid rgba(201,162,39,.25);border-bottom:none}" +
                            "#voa-chat-log .ln{font-size:13px;line-height:1.35;margin:2px 0;word-wrap:break-word}" +
                            "#voa-chat-log .ch-g{color:#e0c04a}#voa-chat-log .ch-l{color:#c8d4e8}#voa-chat-log .ch-sys{color:#9ad}#voa-chat-log .nm{font-weight:700;opacity:.95}" +
                            "#voa-chat-bar{display:none;background:rgba(8,10,14,.9);border:1px solid rgba(201,162,39,.55);border-radius:0 0 10px 10px;padding:8px;" +
                            "pointer-events:auto}" +
                            "#voa-chat.focused #voa-chat-bar{display:block}" +
                            "#voa-chat-input{width:100%;box-sizing:border-box;border:none;outline:none;background:rgba(255,255,255,.06);color:#f2efe8;" +
                            "border-radius:6px;padding:8px 10px;font-size:14px}" +
                            "#voa-chat-hint{font-size:11px;opacity:.65;margin-top:4px}"
                        ) +
                        ";document.head.appendChild(s);}" +
                        "var el=document.createElement('div');el.id='voa-chat';" +
                        "el.innerHTML='<div id=\"voa-chat-log\"></div><div id=\"voa-chat-bar\">" +
                        "<input id=\"voa-chat-input\" type=\"text\" maxlength=\"280\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"/l local · /g admin global · Enter send · Esc close\"/>" +
                        "<div id=\"voa-chat-hint\">Local by default · Admin: /announce /tp /summon /listplayers /additem</div></div>';" +
                        "document.body.appendChild(el);" +
                        "var inp=document.getElementById('voa-chat-input');" +
                        "inp.addEventListener('keydown',function(ev){" +
                        "if(ev.key==='Enter'){ev.preventDefault();var t=inp.value;inp.value='';" +
                        "try{window.skyrimPlatform.sendMessage(['voaChat','send',t]);}catch(e1){try{window.skyrimPlatform.sendMessage('voaChat','send',t);}catch(e2){}}" +
                        "}if(ev.key==='Escape'){ev.preventDefault();try{window.skyrimPlatform.sendMessage(['voaChat','close']);}catch(e3){}}" +
                        "});" +
                        "inp.addEventListener('input',function(){try{window.skyrimPlatform.sendMessage(['voaChat','typing',1]);}catch(e){}});" +
                        "}catch(e0){}})();";
                    try { sp.browser.executeJavaScript(js); } catch (e) {}
                };

                var setFocusedUi = function (on) {
                    chatFocused = !!on;
                    ensureBrowser();
                    injectShell();
                    var js = on
                        ? "(function(){try{var el=document.getElementById('voa-chat');if(!el)return;el.classList.add('focused');" +
                          "var inp=document.getElementById('voa-chat-input');if(inp){inp.focus();inp.select&&inp.select();}" +
                          "}catch(e){}})();"
                        : "(function(){try{var el=document.getElementById('voa-chat');if(!el)return;el.classList.remove('focused');" +
                          "var inp=document.getElementById('voa-chat-input');if(inp)inp.blur();" +
                          "}catch(e){}})();";
                    try { sp.browser.executeJavaScript(js); } catch (e) {}
                    try { sp.browser.setFocused(!!on); } catch (e2) {}
                    if (on) {
                        sendChat("typing", true);
                        typingSent = true;
                        lastTypingPing = Date.now();
                    }
                    else if (typingSent) {
                        sendChat("typing", false);
                        typingSent = false;
                    }
                };

                var renderLog = function () {
                    injectShell();
                    var slice = lines.slice(-40);
                    var html = slice.map(function (ln) {
                        var ch = ln.channel === "g" ? "g" : (ln.channel === "sys" ? "sys" : "l");
                        var tag = ch === "g" ? "[G]" : (ch === "sys" ? "[!]" : "[L]");
                        var nm = (ln.name || "").replace(/</g, "");
                        var tx = (ln.text || "").replace(/</g, "");
                        return "<div class=\"ln ch-" + ch + "\"><span class=\"nm\">" + tag + " " + nm + (ch === "sys" ? "" : ":") + "</span> " + tx + "</div>";
                    }).join("");
                    var js = "(function(){try{var log=document.getElementById('voa-chat-log');if(!log)return;log.innerHTML=" +
                        JSON.stringify(html) + ";log.scrollTop=log.scrollHeight;}catch(e){}})();";
                    try { sp.browser.executeJavaScript(js); } catch (e) {}
                };

                var pushLine = function (line) {
                    if (!line) return;
                    lines.push(line);
                    if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
                    renderLog();
                    // subtle notification for global
                    try {
                        if (line.channel === "g")
                            sp.Debug.notification("[Global] " + (line.name || "") + ": " + (line.text || ""));
                    } catch (eN) {}
                };

                try {
                    sp.storage._voaChatPush = pushLine;
                } catch (eP) {}

                // Drain queue set by eval before handler ready
                try {
                    var q = sp.storage["voaChatQueue"];
                    if (q && q.length) {
                        for (var i = 0; i < q.length; i++) pushLine(q[i]);
                        sp.storage["voaChatQueue"] = [];
                    }
                } catch (eQ) {}

                // browser messages
                try {
                    sp.on("browserMessage", function (e) {
                        try {
                            var args = (e && e.arguments) ? e.arguments : e;
                            if (!args) return;
                            var a0 = args[0];
                            if (a0 && typeof a0 !== "string" && a0.length) {
                                args = a0;
                                a0 = args[0];
                            }
                            if (a0 !== "voaChat") return;
                            var op = String(args[1] || "");
                            if (op === "send") {
                                var text = String(args[2] != null ? args[2] : "").trim();
                                setFocusedUi(false);
                                if (!text) return;
                                // staff-only /g guard client-side too
                                if (/^\/(g|global)\b/i.test(text) && sp.storage["voaIsStaff"] !== true) {
                                    pushLine({ channel: "sys", name: "System", text: "Global chat is Admin only. Use /l or plain text for local.", system: true });
                                    return;
                                }
                                sendChat("say", text);
                                // echo local immediately for responsiveness if plain /l
                                // server will re-broadcast including self
                            }
                            else if (op === "close") {
                                setFocusedUi(false);
                            }
                            else if (op === "typing") {
                                if (chatFocused) {
                                    var now = Date.now();
                                    if (now - lastTypingPing > 800) {
                                        lastTypingPing = now;
                                        sendChat("typing", true);
                                        typingSent = true;
                                    }
                                }
                            }
                        }
                        catch (err) { /* ignore */ }
                    });
                } catch (eBm) {}

                // Open chat: T key (when not in menus). Enter while focused is handled in CEF.
                sp.on("update", function () {
                    try {
                        // eval-delivered lines
                        var q2 = sp.storage["voaChatQueue"];
                        if (q2 && q2.length) {
                            for (var j = 0; j < q2.length; j++) pushLine(q2[j]);
                            sp.storage["voaChatQueue"] = [];
                        }

                        // typing indicators above heads
                        var typing = sp.storage["voaTyping"] || {};
                        var nowT = Date.now();
                        var seen = {};
                        var keys = Object.keys(typing);
                        for (var ki = 0; ki < keys.length; ki++) {
                            var rid = Number(keys[ki]);
                            var at = Number(typing[rid]) || 0;
                            if (!rid || nowT - at > 4000) {
                                try { delete typing[rid]; } catch (eD) {}
                                if (typingTexts[rid] != null) {
                                    try { sp.destroyText(typingTexts[rid]); } catch (eX) {}
                                    delete typingTexts[rid];
                                }
                                continue;
                            }
                            var lid = 0;
                            try {
                                lid = remoteIdToLocalId ? remoteIdToLocalId(rid) : 0;
                            } catch (eR) { lid = 0; }
                            if (!lid) continue;
                            var ac = sp.Actor.from(sp.Game.getFormEx(lid));
                            if (!ac) continue;
                            var headPos = [
                                sp.NetImmerse.getNodeWorldPositionX(ac, "NPC Head [Head]", false),
                                sp.NetImmerse.getNodeWorldPositionY(ac, "NPC Head [Head]", false),
                                sp.NetImmerse.getNodeWorldPositionZ(ac, "NPC Head [Head]", false) + 22,
                            ];
                            if (!headPos[0] && !headPos[1]) {
                                headPos = [ac.getPositionX(), ac.getPositionY(), ac.getPositionZ() + 120];
                            }
                            var scr = sp.worldPointToScreenPoint(headPos)[0];
                            if (!scr || scr[2] <= 0 || scr[0] < 0 || scr[0] > 1 || scr[1] < 0 || scr[1] > 1) {
                                if (typingTexts[rid] != null) {
                                    try { sp.destroyText(typingTexts[rid]); } catch (eY) {}
                                    delete typingTexts[rid];
                                }
                                continue;
                            }
                            var x = scr[0] * 100;
                            var y = (1 - scr[1]) * 100 - 2;
                            var label = "...";
                            if (typingTexts[rid] == null) {
                                try {
                                    typingTexts[rid] = sp.createText(x, y, label, [0.75, 0.85, 1, 1], "Tavern");
                                    try { sp.setTextSize(typingTexts[rid], 1.0); } catch (eS) {}
                                    try { sp.setTextOrigin(typingTexts[rid], [0.5, 1]); } catch (eO) {}
                                } catch (eC) {}
                            }
                            else {
                                try {
                                    sp.setTextPos(typingTexts[rid], x, y);
                                    sp.setTextString(typingTexts[rid], label);
                                } catch (eU) {}
                            }
                            seen[rid] = true;
                        }
                        for (var rid2 in typingTexts) {
                            if (!seen[rid2]) {
                                try { sp.destroyText(typingTexts[rid2]); } catch (eZ) {}
                                delete typingTexts[rid2];
                            }
                        }

                        // key open
                        if (chatFocused) return;
                        try {
                            if (sp.Ui.isMenuOpen("Console") || sp.Ui.isMenuOpen("InventoryMenu") ||
                                sp.Ui.isMenuOpen("MapMenu") || sp.Ui.isMenuOpen("Loading Menu") ||
                                sp.Ui.isMenuOpen("RaceSex Menu") || sp.Ui.isMenuOpen("Journal Menu"))
                                return;
                        } catch (eM) {}
                        // T = 20
                        var tDown = false;
                        try { tDown = sp.Input.isKeyPressed(20 /* T */); } catch (eK) {}
                        if (tDown) {
                            if (!openLatch) {
                                openLatch = true;
                                setFocusedUi(true);
                                injectShell();
                                renderLog();
                            }
                        }
                        else {
                            openLatch = false;
                        }
                    }
                    catch (eAll) { /* ignore */ }
                });

                // Keep shell present
                try {
                    sp.once("update", function () {
                        injectShell();
                        pushLine({ channel: "sys", name: "System", text: "Chat ready. Press T · /l local · /g admin global", system: true });
                    });
                } catch (e1) {}

                sp.printConsole("VOA: chat ready (T to type · /l /g · admin slash)");
            });
        }
    };
});
