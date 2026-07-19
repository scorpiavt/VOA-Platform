/* VOA native chat — createText log + keyboard capture (no CEF required) */
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
                    if (sp.storage["voaChatReady"]) return;
                    sp.storage["voaChatReady"] = true;
                } catch (e0) { return; }

                var chatFocused = false;
                var typingSent = false;
                var lastTypingPing = 0;
                var openLatch = false;
                var lines = [];
                var draft = "";
                var typingTexts = {};
                var logTextIds = [];
                var draftTextId = null;
                var hintTextId = null;
                var MAX_LINES = 8;
                var MAX_DRAFT = 200;

                var KEY_CHARS = {
                    2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
                    12: "-", 13: "=",
                    16: "q", 17: "w", 18: "e", 19: "r", 20: "t", 21: "y", 22: "u", 23: "i", 24: "o", 25: "p",
                    26: "[", 27: "]",
                    30: "a", 31: "s", 32: "d", 33: "f", 34: "g", 35: "h", 36: "j", 37: "k", 38: "l",
                    39: ";", 40: "'",
                    44: "z", 45: "x", 46: "c", 47: "v", 48: "b", 49: "n", 50: "m",
                    51: ",", 52: ".", 53: "/",
                    57: " "
                };
                var KEY_SHIFT = {
                    2: "!", 3: "@", 4: "#", 5: "$", 6: "%", 7: "^", 8: "&", 9: "*", 10: "(", 11: ")",
                    12: "_", 13: "+", 26: "{", 27: "}", 39: ":", 40: "\"", 51: "<", 52: ">", 53: "?"
                };

                var sendChat = function (action, a1, a2) {
                    try {
                        var send = getSend && getSend();
                        if (!send) { sp.printConsole("VOA chat: no send"); return; }
                        var args = [action];
                        if (a1 !== undefined) args.push(a1);
                        if (a2 !== undefined) args.push(a2);
                        send({ t: messages_ch.MsgType.CustomEvent, eventName: "_voaChat", args: args }, true);
                    } catch (e) { sp.printConsole("VOA chat send err " + e); }
                };

                var destroyTextSafe = function (id) {
                    if (id == null) return;
                    try { sp.destroyText(id); } catch (e) {}
                };

                var paintLog = function () {
                    for (var i = 0; i < logTextIds.length; i++) destroyTextSafe(logTextIds[i]);
                    logTextIds = [];
                    var slice = lines.slice(-MAX_LINES);
                    var baseY = chatFocused ? 72 : 78;
                    for (var li = 0; li < slice.length; li++) {
                        var ln = slice[li];
                        var ch = ln.channel === "g" ? "G" : (ln.channel === "sys" ? "!" : "L");
                        var label = "[" + ch + "] " + (ln.name || "") + (ln.system ? " " : ": ") + (ln.text || "");
                        if (label.length > 90) label = label.slice(0, 87) + "...";
                        var col = ln.channel === "g" ? [0.95, 0.8, 0.25, 1] :
                            (ln.channel === "sys" ? [0.55, 0.75, 0.95, 1] : [0.88, 0.9, 0.92, 1]);
                        try {
                            var tid = sp.createText(2, baseY + li * 2.4, label, col, "Tavern");
                            try { sp.setTextSize(tid, 0.72); } catch (eS) {}
                            try { sp.setTextOrigin(tid, [0, 0]); } catch (eO) {}
                            logTextIds.push(tid);
                        } catch (eC) {}
                    }
                    destroyTextSafe(draftTextId); destroyTextSafe(hintTextId);
                    draftTextId = null; hintTextId = null;
                    if (chatFocused) {
                        try {
                            var dlab = "> " + draft + "_";
                            if (dlab.length > 95) dlab = dlab.slice(dlab.length - 95);
                            draftTextId = sp.createText(2, 94, dlab, [1, 0.95, 0.7, 1], "Tavern");
                            try { sp.setTextSize(draftTextId, 0.85); } catch (e1) {}
                            hintTextId = sp.createText(2, 97, "Enter=send  Esc=cancel  /l local  /g admin  /announce ...", [0.7, 0.7, 0.7, 1], "Tavern");
                            try { sp.setTextSize(hintTextId, 0.6); } catch (e2) {}
                        } catch (eD) {}
                    }
                };

                var closeChat = function () {
                    chatFocused = false;
                    draft = "";
                    try { sp.storage["voaForceBrowser"] = false; } catch (e) {}
                    if (typingSent) { sendChat("typing", false); typingSent = false; }
                    paintLog();
                };

                var openChat = function (reason) {
                    chatFocused = true;
                    draft = "";
                    try { sp.storage["voaForceBrowser"] = true; } catch (e) {}
                    sendChat("typing", true);
                    typingSent = true;
                    lastTypingPing = Date.now();
                    paintLog();
                    try { sp.Debug.notification("CHAT — type then Enter. Esc cancel."); } catch (eN) {}
                    sp.printConsole("VOA chat open (" + reason + ")");
                };

                var submitDraft = function () {
                    var text = String(draft || "").trim();
                    closeChat();
                    if (!text) return;
                    if (/^\/(g|global)\b/i.test(text) && sp.storage["voaIsStaff"] !== true) {
                        pushLine({ channel: "sys", name: "System", text: "Global chat is Admin only.", system: true });
                        return;
                    }
                    sendChat("say", text);
                    sp.printConsole("VOA chat >> " + text);
                };

                var pushLine = function (line) {
                    if (!line) return;
                    lines.push(line);
                    if (lines.length > 40) lines = lines.slice(-40);
                    paintLog();
                    try {
                        if (line.channel === "g")
                            sp.Debug.notification("[G] " + (line.name || "") + ": " + (line.text || ""));
                        else
                            sp.printConsole("[" + (line.channel || "L") + "] " + (line.name || "") + ": " + (line.text || ""));
                    } catch (eN) {}
                };

                try { sp.storage._voaChatPush = pushLine; } catch (eP) {}
                try {
                    var q = sp.storage["voaChatQueue"];
                    if (q && q.length) {
                        for (var i = 0; i < q.length; i++) pushLine(q[i]);
                        sp.storage["voaChatQueue"] = [];
                    }
                } catch (eQ) {}

                try {
                    sp.on("buttonEvent", function (e) {
                        try {
                            if (!e || !e.isDown) return;
                            if (typeof e.device === "number" && e.device !== 0) return;
                            var code = e.code;

                            if (!chatFocused) {
                                if (code === 20 || code === 21) {
                                    try {
                                        if (sp.Ui.isMenuOpen("Console") || sp.Ui.isMenuOpen("InventoryMenu") ||
                                            sp.Ui.isMenuOpen("MapMenu") || sp.Ui.isMenuOpen("Loading Menu") ||
                                            sp.Ui.isMenuOpen("RaceSex Menu") || sp.Ui.isMenuOpen("Journal Menu"))
                                            return;
                                    } catch (eM) {}
                                    openChat("btn-" + code);
                                }
                                return;
                            }

                            if (code === 1) { closeChat(); return; }
                            if (code === 28) { submitDraft(); return; }
                            if (code === 14) { draft = draft.slice(0, -1); paintLog(); return; }

                            var shift = false;
                            try { shift = sp.Input.isKeyPressed(42) || sp.Input.isKeyPressed(54); } catch (eSh) {}
                            var ch = null;
                            if (shift && KEY_SHIFT[code] != null) ch = KEY_SHIFT[code];
                            else if (KEY_CHARS[code] != null) {
                                ch = KEY_CHARS[code];
                                if (shift && ch.length === 1 && ch >= "a" && ch <= "z") ch = ch.toUpperCase();
                            }
                            if (ch != null && draft.length < MAX_DRAFT) {
                                draft += ch;
                                paintLog();
                                var now = Date.now();
                                if (now - lastTypingPing > 900) {
                                    lastTypingPing = now;
                                    sendChat("typing", true);
                                }
                            }
                        } catch (eB) {}
                    });
                } catch (eBe) {
                    sp.printConsole("VOA chat: buttonEvent failed " + eBe);
                }

                sp.on("update", function () {
                    try {
                        var q2 = sp.storage["voaChatQueue"];
                        if (q2 && q2.length) {
                            for (var j = 0; j < q2.length; j++) pushLine(q2[j]);
                            sp.storage["voaChatQueue"] = [];
                        }

                        var typing = sp.storage["voaTyping"] || {};
                        var nowT = Date.now();
                        var seen = {};
                        var keys = Object.keys(typing);
                        for (var ki = 0; ki < keys.length; ki++) {
                            var rid = Number(keys[ki]);
                            var at = Number(typing[rid]) || 0;
                            if (!rid || nowT - at > 4000) {
                                try { delete typing[rid]; } catch (eD) {}
                                if (typingTexts[rid] != null) { destroyTextSafe(typingTexts[rid]); delete typingTexts[rid]; }
                                continue;
                            }
                            var lid = 0;
                            try { lid = remoteIdToLocalId ? remoteIdToLocalId(rid) : 0; } catch (eR) { lid = 0; }
                            if (!lid) continue;
                            var ac = sp.Actor.from(sp.Game.getFormEx(lid));
                            if (!ac) continue;
                            var headPos = [
                                sp.NetImmerse.getNodeWorldPositionX(ac, "NPC Head [Head]", false),
                                sp.NetImmerse.getNodeWorldPositionY(ac, "NPC Head [Head]", false),
                                sp.NetImmerse.getNodeWorldPositionZ(ac, "NPC Head [Head]", false) + 22
                            ];
                            if (!headPos[0] && !headPos[1]) headPos = [ac.getPositionX(), ac.getPositionY(), ac.getPositionZ() + 120];
                            var scr = sp.worldPointToScreenPoint(headPos)[0];
                            if (!scr || scr[2] <= 0 || scr[0] < 0 || scr[0] > 1 || scr[1] < 0 || scr[1] > 1) {
                                if (typingTexts[rid] != null) { destroyTextSafe(typingTexts[rid]); delete typingTexts[rid]; }
                                continue;
                            }
                            var x = scr[0] * 100, y = (1 - scr[1]) * 100 - 2;
                            if (typingTexts[rid] == null) {
                                try {
                                    typingTexts[rid] = sp.createText(x, y, "...", [0.75, 0.85, 1, 1], "Tavern");
                                    try { sp.setTextSize(typingTexts[rid], 1.0); } catch (eS) {}
                                    try { sp.setTextOrigin(typingTexts[rid], [0.5, 1]); } catch (eO) {}
                                } catch (eC) {}
                            } else {
                                try { sp.setTextPos(typingTexts[rid], x, y); sp.setTextString(typingTexts[rid], "..."); } catch (eU) {}
                            }
                            seen[rid] = true;
                        }
                        for (var rid2 in typingTexts) {
                            if (!seen[rid2]) { destroyTextSafe(typingTexts[rid2]); delete typingTexts[rid2]; }
                        }

                        if (chatFocused) return;
                        try {
                            if (sp.Ui.isMenuOpen("Console") || sp.Ui.isMenuOpen("InventoryMenu") ||
                                sp.Ui.isMenuOpen("MapMenu") || sp.Ui.isMenuOpen("Loading Menu") ||
                                sp.Ui.isMenuOpen("RaceSex Menu") || sp.Ui.isMenuOpen("Journal Menu"))
                                return;
                        } catch (eM) {}
                        var tDown = false;
                        try { tDown = sp.Input.isKeyPressed(20) || sp.Input.isKeyPressed(21); } catch (eK) {}
                        if (tDown) {
                            if (!openLatch) { openLatch = true; openChat("iskey"); }
                        } else openLatch = false;
                    } catch (eAll) {}
                });

                try {
                    sp.once("update", function () {
                        pushLine({ channel: "sys", name: "System", text: "Chat ready — T to type, Enter send, Esc cancel. /l /g /announce", system: true });
                    });
                } catch (e1) {}
                sp.printConsole("VOA: chat ready (native createText — T type, Enter send)");
            });
        }
    };
});
