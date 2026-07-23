var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
/* eslint-disable @typescript-eslint/adjacent-overload-signatures */
/* eslint-disable @typescript-eslint/no-namespace */
// Generated automatically. Do not edit.
System.register("build/dist/client/Data/Platform/Modules/skyrimPlatform", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/browser", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/networking"], function (exports_2, context_2) {
    "use strict";
    var skyrimPlatform_1, networking_br, main;
    var __moduleName = context_2 && context_2.id;
    return {
        setters: [
            function (skyrimPlatform_1_1) {
                skyrimPlatform_1 = skyrimPlatform_1_1;
            },
            function (networking_br_1) {
                networking_br = networking_br_1;
            }
        ],
        execute: function () {
            // Keizaal/Red-House style: CEF always on in world; Enter/T opens chat input
            exports_2("main", main = function () {
                var sp = skyrimPlatform_1;
                var badMenus = [
                    "BarterMenu", "Book Menu", "ContainerMenu", "Crafting Menu", "GiftMenu",
                    "InventoryMenu", "Journal Menu", "Lockpicking Menu", "Loading Menu", "MapMenu",
                    "RaceSex Menu", "StatsMenu", "TweenMenu", "Console", "Main Menu"
                ];
                var browserVisibleState = false;
                var browserFocusedState = false;
                var badMenuOpen = true;
                var isInputFocused = false;
                var lastBadMenuCheck = 0;
                var bridgeInstalled = false;
                var keyWasDown = {};
                var lastOpenAt = 0;
                var lastCloseAt = 0;

                sp.browser.setVisible(false);

                var setBrowserVisible = function (state) {
                    browserVisibleState = !!state;
                    try { sp.browser.setVisible(browserVisibleState); } catch (e) {}
                };
                var setBrowserFocused = function (state) {
                    browserFocusedState = !!state;
                    try { sp.browser.setFocused(browserFocusedState); } catch (e) {}
                    try { sp.storage["voaChatFocused"] = browserFocusedState; } catch (e2) {}
                    if (browserFocusedState) {
                        try { sp.storage["voaForceBrowser"] = true; } catch (e3) {}
                    }
                };
                // Rising-edge key detect (avoids spam while held / CEF key echo)
                var keyEdge = function (code) {
                    var now = false;
                    try { now = !!sp.Input.isKeyPressed(code); } catch (e) { now = false; }
                    var was = !!keyWasDown[code];
                    keyWasDown[code] = now;
                    return now && !was;
                };

                // Dispatch Redux actions into the Red House / stock front (window.storage)
                var dispatch = function (commandType, dataObj) {
                    var payload = "{}";
                    try {
                        if (dataObj != null) payload = JSON.stringify(dataObj).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                    } catch (eJ) { payload = "{}"; }
                    var src =
                        "try{if(window.storage&&window.storage.dispatch){window.storage.dispatch({type:'COMMAND',data:{commandType:'" +
                        commandType + "',alter:['" + payload + "']}});}}catch(e){}";
                    try { sp.browser.executeJavaScript(src); } catch (e) {}
                };
                try { sp.storage._voaFrontDispatch = dispatch; } catch (eD) {}

                // Bridge cef::chat:send -> native once (never re-wrap / nest)
                var installChatBridge = function () {
                    // Single install script: wrap mp.send exactly once; re-apply only if front replaced mp.send
                    var js =
                        "(function(){try{" +
                        "if(!window.mp)window.mp={};" +
                        "if(window.mp.__voaHooked===1&&typeof window.mp.send==='function')return 'already';" +
                        "var prev=window.mp.send;" +
                        "var lastMeta='';" +
                        "var lastMetaAt=0;" +
                        "window.mp.send=function(type,data){" +
                        "try{" +
                        "if(type==='cef::chat:send'){" +
                        "var d=(typeof data==='string')?data:(data&&data.text!=null?String(data.text):String(data));" +
                        // Meta: only notify native when value CHANGES (front may spam every frame)
                        "if(d.indexOf('/focusInputField')===0||d.indexOf('/browserFocused')===0){" +
                        "if(d===lastMeta)return;" +
                        "lastMeta=d;lastMetaAt=Date.now();" +
                        "try{window.skyrimPlatform.sendMessage('voaRhChat',d);}catch(em){}" +
                        "return;" +
                        "}" +
                        // Real chat text
                        "try{window.skyrimPlatform.sendMessage('voaRhChat',d);}catch(e1){}" +
                        "return;" +
                        "}" +
                        "}catch(e){}" +
                        "try{if(typeof prev==='function'&&!prev.__voaHooked)return prev(type,data);}catch(e2){}" +
                        "try{if(window.skymp&&window.skymp.send)window.skymp.send({type:type,data:data});}catch(e3){}" +
                        "};" +
                        "window.mp.send.__voaHooked=1;" +
                        "window.mp.__voaHooked=1;" +
                        "window.__voaChatBridge=1;" +
                        "return 'ok';" +
                        "}catch(e0){return 'err:'+e0;}})();";
                    try {
                        sp.browser.executeJavaScript(js);
                        if (!bridgeInstalled) {
                            bridgeInstalled = true;
                            sp.printConsole("VOA: CEF chat bridge installed (single-wrap)");
                        }
                    } catch (e) {
                        try { sp.printConsole("VOA: chat bridge fail " + e); } catch (e2) {}
                    }
                };
                try { sp.storage._voaInstallChatBridge = installChatBridge; } catch (eB) {}

                var openChat = function (why) {
                    if (badMenuOpen) return;
                    if (browserFocusedState) return; // already open
                    if (Date.now() - lastCloseAt < 200) return; // ignore bounce after close
                    // Block only hard menus (no spawn-grace delay Ã¢â‚¬â€ chat is server-ready)
                    try {
                        if (sp.Ui.isMenuOpen("Loading Menu") || sp.Ui.isMenuOpen("Main Menu") ||
                            sp.Ui.isMenuOpen("RaceSex Menu"))
                            return;
                    } catch (eLoad) {}
                    lastOpenAt = Date.now();
                    setBrowserVisible(true);
                    setBrowserFocused(true);
                    dispatch("CHAT_SHOW");
                    installChatBridge();
                    try { sp.printConsole("VOA chat open (" + why + ") CHAT_SHOW+focus"); } catch (e) {}
                    try { sp.Debug.notification("Chat open - type then Enter"); } catch (eN) {}
                };
                var closeChat = function (why) {
                    if (!browserFocusedState && !isInputFocused) return; // already closed
                    if (Date.now() - lastOpenAt < 250) return; // ignore meta spam right after open
                    if (Date.now() - lastCloseAt < 200) return; // debounce
                    lastCloseAt = Date.now();
                    isInputFocused = false;
                    dispatch("CHAT_HIDE");
                    setBrowserFocused(false);
                    try { sp.printConsole("VOA chat close (" + (why || "?") + ")"); } catch (e) {}
                };
                try { sp.storage._voaOpenChat = openChat; sp.storage._voaCloseChat = closeChat; } catch (eS) {}

                // Delay CEF show until after main menu / first world frame - less loadGame race
                sp.once("update", function () {
                    try {
                        sp.Utility.wait(2.0).then(function () {
                            browserVisibleState = true;
                            try { sp.browser.setFocused(false); } catch (eF) {}
                            try { sp.browser.setVisible(true); } catch (eV) {}
                            installChatBridge();
                            try { sp.printConsole("VOA browser: visible + chat bridge (Enter/T open chat)"); } catch (eL) {}
                        });
                    } catch (eW) {
                        browserVisibleState = true;
                        try { sp.browser.setVisible(true); } catch (eV2) {}
                        installChatBridge();
                    }
                });

                // Chat fully handled here (browser always loads). Do not depend on voaChat setup
                // flags that can stick in co-save and skip drain handlers.

                var queueUiLine = function (msg) {
                    try {
                        var arr = [];
                        var raw = sp.storage["voaChatUiPendingJson"];
                        if (typeof raw === "string" && raw.length) {
                            try { arr = JSON.parse(raw); } catch (eP) { arr = []; }
                        }
                        if (!arr || !arr.length) arr = [];
                        arr.push(String(msg || ""));
                        if (arr.length > 40) arr = arr.slice(-40);
                        sp.storage["voaChatUiPendingJson"] = JSON.stringify(arr);
                    } catch (eQ) {}
                };
                var makeVoaCustomEvent = function (eventName, rawArgs) {
                    // Dual-format: older VOA scamp wants `args`; newer builds want `argsJsonDumps`
                    var list = rawArgs || [];
                    var dumps = [];
                    for (var di = 0; di < list.length; di++)
                        dumps.push(JSON.stringify(list[di]));
                    return {
                        t: 15 /* CustomEvent */,
                        eventName: eventName,
                        args: list,
                        argsJsonDumps: dumps,
                    };
                };
                var sendChatNet = function (text) {
                    var packet = makeVoaCustomEvent("_voaChat", ["say", String(text || "")]);
                    // 1) Preferred: RemoteServer.send via host hook (sets msg.idx)
                    try {
                        if (typeof sp._voaEmit === "function") {
                            var okEmit = sp._voaEmit(packet, true);
                            if (okEmit !== false) {
                                try { sp.printConsole("VOA chat net: emit"); } catch (e0) {}
                                return true;
                            }
                        }
                    } catch (eEm) {
                        try { sp.printConsole("VOA chat emit err " + eEm); } catch (e1) {}
                    }
                    // 2) networking module
                    try {
                        if (networking_br && typeof networking_br.send === "function") {
                            networking_br.send(packet, true);
                            try { sp.printConsole("VOA chat net: networking"); } catch (e2) {}
                            return true;
                        }
                    } catch (eN) {
                        try { sp.printConsole("VOA chat net err " + eN); } catch (e3) {}
                    }
                    // 3) raw plugin
                    try {
                        if (sp.mpClientPlugin && typeof sp.mpClientPlugin.send === "function") {
                            sp.mpClientPlugin.send(JSON.stringify(packet), true);
                            try { sp.printConsole("VOA chat net: plugin"); } catch (e4) {}
                            return true;
                        }
                    } catch (eP) {
                        try { sp.printConsole("VOA chat plugin err " + eP); } catch (e5) {}
                    }
                    try {
                        sp.printConsole("VOA chat net: FAIL emit=" + (typeof sp._voaEmit) +
                            " net=" + (networking_br ? typeof networking_br.send : "null"));
                    } catch (e6) {}
                    return false;
                };
                var parseAdminChatSlash = function (raw) {
                    raw = String(raw != null ? raw : "").trim();
                    if (!raw || raw.charAt(0) !== "/") return null;
                    var body = raw.slice(1).trim();
                    if (!body) return null;
                    var parts = body.split(/\s+/);
                    var head = String(parts[0] || "").toLowerCase();
                    // channel prefixes â€” normal chat, not admin
                    if (head === "g" || head === "l" || head === "global" || head === "local")
                        return null;
                    var aliases = {
                        announce: "announce", a: "announce",
                        tp: "tp", tpto: "tp", goto: "tp",
                        summon: "summon", bring: "summon",
                        giveplayerspell: "giveplayerspell", givespell: "giveplayerspell", addspell: "giveplayerspell",
                        listplayers: "listplayers", players: "listplayers",
                        additem: "additem",
                    };
                    var cmd = aliases[head];
                    if (!cmd) return null;
                    return { cmd: cmd, rest: parts.slice(1) };
                };
                var processChatText = function (text) {
                    text = String(text != null ? text : "").trim();
                    if (!text) return;
                    try { sp.printConsole("VOA chat >> " + text); } catch (eL) {}
                    // Admin via VOA chat: /summon Name, /tp Name, /listplayers, /announce â€¦
                    var adm = parseAdminChatSlash(text);
                    if (adm) {
                        var isStaffChat = sp.storage["voaIsStaff"] === true;
                        if (!isStaffChat) {
                            queueUiLine("#{8ec8ff}[!] System: #{f0ebe3}Admin only (staff Discord roles).");
                            try {
                                sp.storage["voaForceBrowser"] = true;
                                sp.storage["voaChatLogUntil"] = Date.now() + 60000;
                                sp.storage["voaChatCloseReq"] = "sent";
                                sp.storage["voaChatCloseAt"] = Date.now() + 700;
                            } catch (eSt) {}
                            return;
                        }
                        var outArgs = adm.rest || [];
                        if (adm.cmd === "announce" || adm.cmd === "tp" || adm.cmd === "summon") {
                            outArgs = [outArgs.join(" ").trim()].filter(function (s) { return !!s; });
                            if ((adm.cmd === "tp" || adm.cmd === "summon") && !outArgs.length) {
                                queueUiLine("#{8ec8ff}[!] System: #{f0ebe3}Usage: /" + adm.cmd + " PlayerName");
                                try {
                                    sp.storage["voaChatCloseReq"] = "sent";
                                    sp.storage["voaChatCloseAt"] = Date.now() + 500;
                                } catch (eU) {}
                                return;
                            }
                        }
                        else if (adm.cmd === "listplayers") {
                            outArgs = [];
                        }
                        queueUiLine("#{8ec8ff}[!] System: #{f0ebe3}Admin: /" + adm.cmd +
                            (outArgs.length ? " " + outArgs.join(" ") : "") + " â€¦");
                        try {
                            if (typeof sp._voaAdminCommand === "function") {
                                sp._voaAdminCommand(adm.cmd, outArgs);
                            }
                            else {
                                queueUiLine("#{8ec8ff}[!] System: #{f0ebe3}Admin bridge not ready â€” wait a few seconds after spawn.");
                            }
                        }
                        catch (eAd) {
                            try { sp.printConsole("VOA chat admin err " + eAd); } catch (e2) {}
                        }
                        try {
                            sp.storage["voaForceBrowser"] = true;
                            sp.storage["voaChatLogUntil"] = Date.now() + 180000;
                            sp.storage["voaChatCloseReq"] = "sent";
                            sp.storage["voaChatCloseAt"] = Date.now() + 700;
                        } catch (eC) {}
                        return;
                    }
                    var msg = "#{efc94a}[L] You: #{f0ebe3}" + text;
                    queueUiLine(msg);
                    var ok = sendChatNet(text);
                    if (!ok) {
                        queueUiLine("#{8ec8ff}[!] System: #{f0ebe3}Message not sent (not connected yet).");
                    }
                    try {
                        sp.storage["voaForceBrowser"] = true;
                        sp.storage["voaChatLogUntil"] = Date.now() + 180000;
                        sp.storage["voaChatCloseReq"] = "sent";
                        sp.storage["voaChatCloseAt"] = Date.now() + 700;
                    } catch (eC) {}
                };

                // Keep browser visible when not in blocking menus; force while chat focused / recent log
                sp.on("update", function () {
                    // 1) Drain CEF-typed text (queued from browserMessage) Ã¢â‚¬â€ primary path
                    try {
                        var rxRaw = sp.storage["voaRhChatPendingJson"];
                        if (rxRaw && typeof rxRaw === "string" && rxRaw !== "[]" && rxRaw.length > 2) {
                            sp.storage["voaRhChatPendingJson"] = "[]";
                            var rxItems = [];
                            try { rxItems = JSON.parse(rxRaw); } catch (eR) { rxItems = []; }
                            for (var ri = 0; ri < rxItems.length; ri++) {
                                try { processChatText(rxItems[ri]); } catch (ePt) {
                                    try { sp.printConsole("VOA chat process err " + ePt); } catch (e3) {}
                                }
                            }
                        }
                    } catch (eRx) {}
                    // 2) Drain server push queue (JSON)
                    try {
                        var srvRaw = sp.storage["voaChatQueueJson"];
                        if (srvRaw && typeof srvRaw === "string" && srvRaw !== "[]" && srvRaw.length > 2) {
                            sp.storage["voaChatQueueJson"] = "[]";
                            var srvLines = [];
                            try { srvLines = JSON.parse(srvRaw); } catch (eS) { srvLines = []; }
                            for (var sj = 0; sj < srvLines.length; sj++) {
                                var line = srvLines[sj] || {};
                                var ch = line.channel || "l";
                                var nm = String(line.name || "");
                                var tx = String(line.text || "");
                                var color = ch === "g" ? "efc94a" : (ch === "sys" ? "8ec8ff" : "f0ebe3");
                                var prefix = ch === "g" ? "[G] " : (ch === "sys" ? "[!] " : "[L] ");
                                var built = "#{efc94a}" + prefix + (nm ? nm + (ch === "sys" ? " " : ": ") : "") + "#{" + color + "}" + tx;
                                queueUiLine(built);
                                try { sp.printConsole("[" + ch + "] " + nm + ": " + tx); } catch (ePr) {}
                            }
                        }
                    } catch (eSrv) {}
                    // 3) Drain CEF chat UI lines using the SAME dispatch() as CHAT_SHOW
                    try {
                        var uiRaw = sp.storage["voaChatUiPendingJson"];
                        if (uiRaw && typeof uiRaw === "string" && uiRaw !== "[]" && uiRaw.length > 2) {
                            sp.storage["voaChatUiPendingJson"] = "[]";
                            var uiLines = [];
                            try { uiLines = JSON.parse(uiRaw); } catch (eU) { uiLines = []; }
                            if (uiLines && uiLines.length) {
                                try { sp.browser.setVisible(true); } catch (eV0) {}
                                for (var ui = 0; ui < uiLines.length; ui++) {
                                    var m = String(uiLines[ui] != null ? uiLines[ui] : "");
                                    if (!m) continue;
                                    dispatch("CHAT_ADD_MESSAGE", { message: m });
                                    try {
                                        sp.browser.executeJavaScript(
                                            "(function(){try{" +
                                            "var ok=!!(window.storage&&window.storage.dispatch);" +
                                            "var list=!!document.querySelector('#chat .list');" +
                                            "if(window.skyrimPlatform)window.skyrimPlatform.sendMessage('voaChatUi',(ok?'store':'nostore')+':'+(list?'list':'nolist'));" +
                                            "}catch(e){}})();"
                                        );
                                    } catch (eAck) {}
                                    try { sp.printConsole("VOA chat UI dispatch: " + m.slice(0, 60)); } catch (eL) {}
                                }
                            }
                        }
                    } catch (eUi) {
                        try { sp.printConsole("VOA chat UI drain err " + eUi); } catch (e2) {}
                    }
                    // Deferred close from chat send (safe on update)
                    try {
                        var closeWhy = sp.storage["voaChatCloseReq"];
                        if (closeWhy) {
                            var closeAt = Number(sp.storage["voaChatCloseAt"]) || 0;
                            if (!closeAt) {
                                sp.storage["voaChatCloseAt"] = Date.now() + 400;
                            } else if (Date.now() >= closeAt) {
                                sp.storage["voaChatCloseReq"] = null;
                                sp.storage["voaChatCloseAt"] = 0;
                                closeChat(String(closeWhy));
                            }
                        }
                    } catch (eCr) {}
                    if (Date.now() - lastBadMenuCheck > 150) {
                        lastBadMenuCheck = Date.now();
                        badMenuOpen = false;
                        try {
                            for (var i = 0; i < badMenus.length; i++) {
                                if (sp.Ui.isMenuOpen(badMenus[i])) { badMenuOpen = true; break; }
                            }
                        } catch (eM) { badMenuOpen = false; }
                        var force = false;
                        var logUntil = 0;
                        try {
                            force = sp.storage["voaForceBrowser"] === true || sp.storage["voaChatFocused"] === true;
                            logUntil = Number(sp.storage["voaChatLogUntil"]) || 0;
                        } catch (eF) {}
                        // Always show CEF when chat log recently updated (messages must stay visible)
                        if (force || browserFocusedState || (logUntil && Date.now() < logUntil)) {
                            try { sp.browser.setVisible(true); } catch (eV) {}
                        } else {
                            try { sp.browser.setVisible(browserVisibleState && !badMenuOpen); } catch (eV2) {}
                        }
                    }
                });

                // browserMessage from CEF - handle several sendMessage shapes
                var lastFocusMeta = "";
                var lastFocusMetaAt = 0;
                var handleRhPayload = function (text, why) {
                    text = String(text != null ? text : "").trim();
                    if (!text) return;
                    // Meta: silent, de-duped, no chat path
                    if (text.indexOf("/focusInputField") === 0) {
                        var want = text.indexOf("true") >= 0;
                        if (isInputFocused === want) return;
                        isInputFocused = want;
                        return;
                    }
                    if (text.indexOf("/browserFocused") === 0) {
                        if (text.indexOf("false") >= 0) {
                            // Ignore spam / bounce right after open
                            if (Date.now() - lastOpenAt < 500) return;
                            closeChat("front-unfocus");
                        }
                        return;
                    }
                    if (/^\/(anim|Craft|Trade|Interaction|SelectBox)\b/i.test(text)) return;
                    // Real chat only. SP forbids calling storage *functions* from browserMessage.
                    // Also: SP storage does NOT persist in-place array mutations Ã¢â‚¬â€ must reassign.
                    // Use a JSON string queue so the next update tick can drain reliably.
                    try { sp.printConsole("VOA chat rx (" + why + "): " + text.slice(0, 80)); } catch (eL) {}
                    try {
                        var arr = [];
                        try {
                            var rawQ = sp.storage["voaRhChatPendingJson"];
                            if (typeof rawQ === "string" && rawQ.length)
                                arr = JSON.parse(rawQ);
                        } catch (eParse) { arr = []; }
                        if (!arr || !arr.length) arr = [];
                        arr.push(text);
                        if (arr.length > 40) arr = arr.slice(-40);
                        sp.storage["voaRhChatPendingJson"] = JSON.stringify(arr);
                    } catch (eSend) {
                        try { sp.printConsole("VOA chat queue err " + eSend); } catch (e2) {}
                    }
                };

                sp.on("browserMessage", function (event) {
                    try {
                        if (!event || !event.arguments || !event.arguments.length) return;
                        var args = event.arguments;
                        var a0 = args[0];
                        var a1 = args.length > 1 ? args[1] : undefined;

                        // sendMessage('voaRhChat', text)
                        if (a0 === "voaRhChat") {
                            handleRhPayload(a1, "str");
                            return;
                        }
                        // sendMessage(['voaRhChat', text]) as single arg
                        if (a0 && (Object.prototype.toString.call(a0) === "[object Array]" || (typeof a0 === "object" && a0.length != null && typeof a0 !== "string"))) {
                            if (a0[0] === "voaRhChat") {
                                handleRhPayload(a0[1], "arr");
                                return;
                            }
                            if (a0[0] === "voaChat") {
                                if (a0[1] === "send") handleRhPayload(a0[2], "legacy");
                                if (a0[1] === "close") closeChat("legacy");
                                return;
                            }
                            // some CEF builds flatten: arguments = ['voaRhChat', text] already as multi - handled above
                        }
                        // sendMessage({type:'voaRhChat', data:text})
                        if (a0 && typeof a0 === "object" && a0.type) {
                            if (a0.type === "voaRhChat") {
                                handleRhPayload(a0.data != null ? a0.data : a0.text, "obj");
                                return;
                            }
                            if (a0.type === "focusInputField") isInputFocused = !!a0.data;
                            else if (a0.type === "browserFocused") {
                                if (a0.data === false || a0.data === 0 || a0.data === "false")
                                    closeChat("obj-unfocus");
                            }
                            else if (a0.type === "browserVisible") setBrowserVisible(!!a0.data);
                            else if (a0.type === "front-loaded") installChatBridge();
                            return;
                        }
                        if (a0 === "front-loaded") installChatBridge();
                        // CEF UI push ack
                        if (a0 === "voaChatUi") {
                            try { sp.printConsole("VOA chat UI cef: " + String(a1)); } catch (eAck) {}
                            return;
                        }
                    } catch (eBm) {
                        try { sp.printConsole("VOA browserMessage err " + eBm); } catch (e3) {}
                    }
                });

                // Edge-triggered keys (no hold / CEF echo spam)
                sp.on("update", function () {
                    var esc = keyEdge(1);
                    var f2 = keyEdge(60);
                    var f6 = keyEdge(64);
                    var enter = keyEdge(28);
                    var tKey = keyEdge(20);
                    var yKey = keyEdge(21);

                    // While focused: only Esc from game; CEF owns typing
                    if (browserFocusedState) {
                        if (esc) closeChat("esc");
                        return;
                    }
                    if (f2) {
                        setBrowserVisible(!browserVisibleState);
                        return;
                    }
                    if (f6 && !badMenuOpen) {
                        openChat("F6");
                        return;
                    }
                    if (!badMenuOpen && !isInputFocused) {
                        if (enter) openChat("Enter");
                        else if (tKey || yKey) openChat("T");
                    }
                });

                var cfg = {
                    ip: sp.settings["skymp5-client"]["server-ip"],
                    port: sp.settings["skymp5-client"]["server-port"],
                };
                sp.printConsole({ cfg: cfg });
                var uiPort = cfg.port === 7777 ? 3000 : cfg.port + 1;
                var url = "http://" + cfg.ip + ":" + uiPort + "/ui/index.html";
                sp.printConsole("loading url " + url);
                sp.browser.loadUrl(url);
                // Install bridge after page load (idempotent single-wrap)
                try {
                    sp.Utility.wait(2.0).then(function () { installChatBridge(); });
                    sp.Utility.wait(6.0).then(function () { installChatBridge(); });
                } catch (eW) {}
            });
        }
    };
});
System.register("skymp5-client/src/lib/structures/movement", [], function (exports_3, context_3) {
    "use strict";
    var __moduleName = context_3 && context_3.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/lib/structures/look", [], function (exports_4, context_4) {
    "use strict";
    var __moduleName = context_4 && context_4.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/lib/structures/animation", [], function (exports_5, context_5) {
    "use strict";
    var __moduleName = context_5 && context_5.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/lib/structures/inventory", [], function (exports_6, context_6) {
    "use strict";
    var __moduleName = context_6 && context_6.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/lib/structures/equipment", [], function (exports_7, context_7) {
    "use strict";
    var __moduleName = context_7 && context_7.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/spSnippet", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_8, context_8) {
    "use strict";
    var skyrimPlatform_2, sp, spAny, deserializeArg, runMethod, runStatic, run;
    var __moduleName = context_8 && context_8.id;
    return {
        setters: [
            function (skyrimPlatform_2_1) {
                skyrimPlatform_2 = skyrimPlatform_2_1;
                sp = skyrimPlatform_2_1;
            }
        ],
        execute: function () {
            spAny = sp;
            deserializeArg = function (arg) {
                if (typeof arg === "object") {
                    var form = skyrimPlatform_2.Game.getFormEx(arg.formId);
                    var gameObject = spAny[arg.type].from(form);
                    return gameObject;
                }
                return arg;
            };
            runMethod = function (snippet) { return __awaiter(void 0, void 0, void 0, function () {
                var self, selfCasted, f;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            self = skyrimPlatform_2.Game.getFormEx(snippet.selfId);
                            if (!self)
                                throw new Error("Unable to find form with id " + snippet.selfId.toString(16));
                            selfCasted = spAny[snippet.class].from(self);
                            if (!selfCasted)
                                throw new Error("Form " + snippet.selfId.toString(16) + " is not instance of " + snippet.class);
                            f = selfCasted[snippet.function];
                            return [4 /*yield*/, f.apply(selfCasted, snippet.arguments.map(function (arg) { return deserializeArg(arg); }))];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            }); };
            runStatic = function (snippet) { return __awaiter(void 0, void 0, void 0, function () {
                var papyrusClass;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            papyrusClass = spAny[snippet.class];
                            return [4 /*yield*/, papyrusClass[snippet.function].apply(papyrusClass, snippet.arguments.map(function (arg) { return deserializeArg(arg); }))];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                });
            }); };
            exports_8("run", run = function (snippet) { return __awaiter(void 0, void 0, void 0, function () {
                var form, sign, count, soundId;
                return __generator(this, function (_a) {
                    if (snippet.class === "SkympHacks") {
                        if (snippet.function === "AddItem" || snippet.function === "RemoveItem") {
                            form = skyrimPlatform_2.Form.from(deserializeArg(snippet.arguments[0]));
                            sign = snippet.function === "AddItem" ? "+" : "-";
                            count = snippet.arguments[1];
                            soundId = 0x334ab;
                            if (form.getFormID() !== 0xf)
                                soundId = 0x14115;
                            sp.Sound.from(skyrimPlatform_2.Game.getFormEx(soundId)).play(skyrimPlatform_2.Game.getPlayer());
                            if (count > 0)
                                sp.Debug.notification(sign + " " + form.getName() + " (" + count + ")");
                        }
                        else
                            throw new Error("Unknown SkympHack - " + snippet.function);
                        return [2 /*return*/];
                    }
                    return [2 /*return*/, snippet.selfId ? runMethod(snippet) : runStatic(snippet)];
                });
            }); });
        }
    };
});
System.register("skymp5-client/src/lib/structures/actorvalues", [], function (exports_9, context_9) {
    "use strict";
    var __moduleName = context_9 && context_9.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/messages", [], function (exports_10, context_10) {
    "use strict";
    var MsgType;
    var __moduleName = context_10 && context_10.id;
    return {
        setters: [],
        execute: function () {
            (function (MsgType) {
                MsgType[MsgType["CustomPacket"] = 1] = "CustomPacket";
                MsgType[MsgType["UpdateMovement"] = 2] = "UpdateMovement";
                MsgType[MsgType["UpdateAnimation"] = 3] = "UpdateAnimation";
                MsgType[MsgType["UpdateLook"] = 4] = "UpdateLook";
                MsgType[MsgType["UpdateEquipment"] = 5] = "UpdateEquipment";
                MsgType[MsgType["Activate"] = 6] = "Activate";
                MsgType[MsgType["UpdateProperty"] = 7] = "UpdateProperty";
                MsgType[MsgType["PutItem"] = 8] = "PutItem";
                MsgType[MsgType["TakeItem"] = 9] = "TakeItem";
                MsgType[MsgType["FinishSpSnippet"] = 10] = "FinishSpSnippet";
                MsgType[MsgType["OnEquip"] = 11] = "OnEquip";
                MsgType[MsgType["ConsoleCommand"] = 12] = "ConsoleCommand";
                MsgType[MsgType["CraftItem"] = 13] = "CraftItem";
                MsgType[MsgType["Host"] = 14] = "Host";
                MsgType[MsgType["CustomEvent"] = 15] = "CustomEvent";
                MsgType[MsgType["ChangeValues"] = 16] = "ChangeValues";
                MsgType[MsgType["OnHit"] = 17] = "OnHit";
            })(MsgType || (MsgType = {}));
            exports_10("MsgType", MsgType);
        }
    };
});
System.register("skymp5-client/src/front/console", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/messages"], function (exports_11, context_11) {
    "use strict";
    var skyrimPlatform_3, messages_1, CmdArgument, schemas, immuneSchema, nonVanilaCommands, getCommandExecutor, setUpConsoleCommands;
    var __moduleName = context_11 && context_11.id;
    return {
        setters: [
            function (skyrimPlatform_3_1) {
                skyrimPlatform_3 = skyrimPlatform_3_1;
            },
            function (messages_1_1) {
                messages_1 = messages_1_1;
            }
        ],
        execute: function () {
            (function (CmdArgument) {
                CmdArgument[CmdArgument["ObjectReference"] = 0] = "ObjectReference";
                CmdArgument[CmdArgument["BaseForm"] = 1] = "BaseForm";
                CmdArgument[CmdArgument["Int"] = 2] = "Int";
                CmdArgument[CmdArgument["String"] = 3] = "String";
            })(CmdArgument || (CmdArgument = {}));
            schemas = {
                additem: [CmdArgument.ObjectReference, CmdArgument.BaseForm, CmdArgument.Int],
                placeatme: [CmdArgument.ObjectReference, CmdArgument.BaseForm],
                disable: [CmdArgument.ObjectReference],
                mp: [CmdArgument.ObjectReference, CmdArgument.String],
                announce: [CmdArgument.String],
                tp: [CmdArgument.String],
                summon: [CmdArgument.String],
                giveplayerspell: [CmdArgument.String, CmdArgument.Int],
                listplayers: [],
            };
            immuneSchema = ["mp", "announce", "tp", "summon", "giveplayerspell", "listplayers"];
            nonVanilaCommands = ["mp", "announce", "tp", "summon", "giveplayerspell", "listplayers"];
            var STEAL_POOL = ["ToggleAI", "ToggleCollision", "ShowVars", "ShowAnim", "DumpTextureList", "TestFade", "DumpNiUpdates", "ToggleGodMode", "StartMasterFileSeekData", "PreloadExterior"];
            // VOA: console locked to Discord staff (Founder / SGM / GM) ??? refreshed from API
            var refreshStaffFlag = function () {
                try {
                    var gd = skyrimPlatform_3.settings["skymp5-client"]["gameData"] || {};
                    var session = typeof gd.session === "string" ? gd.session : "";
                    var profileId = typeof gd.profileId === "number" ? gd.profileId : 0;
                    var master = skyrimPlatform_3.settings["skymp5-client"]["master"] || "http://127.0.0.1:3100";
                    if (typeof master !== "string" || !master)
                        master = "http://127.0.0.1:3100";
                    master = master.replace(/\/$/, "");
                    if (!session && !profileId)
                        return;
                    var path = "/v1/game/is-staff?";
                    if (session)
                        path += "session=" + encodeURIComponent(session);
                    else
                        path += "profileId=" + encodeURIComponent(String(profileId));
                    var client = new skyrimPlatform_3.HttpClient(master);
                    client.get(path).then(function (res) {
                        try {
                            if (!res || res.status !== 200 || !res.body)
                                return;
                            var data = JSON.parse(res.body);
                            skyrimPlatform_3.storage["voaIsStaff"] = data && data.isStaff === true;
                            skyrimPlatform_3.storage["voaStaffRoles"] = (data && data.roles) || [];
                            skyrimPlatform_3.printConsole("VOA console staff=" + !!skyrimPlatform_3.storage["voaIsStaff"] +
                                (data && data.roles && data.roles.length ? (" roles=" + data.roles.join(",")) : ""));
                        }
                        catch (e0) { /* ignore */ }
                    }).catch(function () { /* ignore */ });
                }
                catch (e1) { /* ignore */ }
            };
            var staffGate = function () {
                if (skyrimPlatform_3.storage["voaIsStaff"] === true)
                    return true;
                skyrimPlatform_3.printConsole("VOA: console command blocked ??? Admin only (Founder / Senior Gamemaster / Gamemaster)");
                try {
                    skyrimPlatform_3.Debug.notification("Console: Admin only");
                }
                catch (eN) { /* ignore */ }
                try {
                    var now = Date.now();
                    if (!skyrimPlatform_3.storage["voaStaffCheckAt"] || now - skyrimPlatform_3.storage["voaStaffCheckAt"] > 30000) {
                        skyrimPlatform_3.storage["voaStaffCheckAt"] = now;
                        refreshStaffFlag();
                    }
                }
                catch (eR) { /* ignore */ }
                return false;
            };
            var sendVoaConsole = function (commandName, args, send) {
                skyrimPlatform_3.printConsole("VOA admin: " + commandName + " " + JSON.stringify(args));
                try {
                    skyrimPlatform_3.Debug.notification("Admin: " + commandName + "â€¦");
                }
                catch (eN0) { /* ignore */ }
                try {
                    var gd2 = skyrimPlatform_3.settings["skymp5-client"]["gameData"] || {};
                    var profileId2 = typeof gd2.profileId === "number" ? gd2.profileId : 0;
                    var session2 = typeof gd2.session === "string" ? gd2.session : "";
                    // 1) HTTP queue (reliable) â€” used by chat /summon and console
                    try {
                        var master2 = skyrimPlatform_3.settings["skymp5-client"]["master"] || "http://127.0.0.1:3100";
                        if (typeof master2 !== "string" || !master2)
                            master2 = "http://127.0.0.1:3100";
                        master2 = master2.replace(/\/$/, "");
                        if (session2) {
                            var httpClient = new skyrimPlatform_3.HttpClient(master2);
                            var bodyHttp = JSON.stringify({
                                session: session2,
                                profileId: profileId2,
                                command: commandName,
                                args: args || [],
                            });
                            httpClient.post("/v1/game/console-command", {
                                body: bodyHttp,
                                contentType: "application/json",
                            }).then(function (res) {
                                try {
                                    var okH = res && res.status === 200;
                                    var parsed = null;
                                    try {
                                        parsed = res && res.body ? JSON.parse(res.body) : null;
                                    }
                                    catch (eP) { parsed = null; }
                                    skyrimPlatform_3.printConsole(
                                        "VOA admin HTTP " + commandName + " status=" + (res ? res.status : "?") +
                                        " queued=" + !!(parsed && parsed.queued)
                                    );
                                    if (okH && parsed && parsed.queued) {
                                        try {
                                            skyrimPlatform_3.Debug.notification("Admin queued: " + commandName);
                                        }
                                        catch (eN1) { /* ignore */ }
                                    }
                                    else if (res && res.status === 403) {
                                        skyrimPlatform_3.printConsole("VOA admin HTTP denied (not staff)");
                                        try {
                                            skyrimPlatform_3.Debug.notification("Admin: not staff");
                                        }
                                        catch (eN2) { /* ignore */ }
                                    }
                                }
                                catch (eR) {
                                    skyrimPlatform_3.printConsole("VOA admin HTTP parse err " + eR);
                                }
                            }).catch(function (eH) {
                                try {
                                    skyrimPlatform_3.printConsole("VOA admin HTTP fail " + eH);
                                }
                                catch (e2) { /* ignore */ }
                            });
                        }
                        else {
                            skyrimPlatform_3.printConsole("VOA admin HTTP skip (no session)");
                        }
                    }
                    catch (eHttp) {
                        try {
                            skyrimPlatform_3.printConsole("VOA admin HTTP err " + eHttp);
                        }
                        catch (e3) { /* ignore */ }
                    }
                    // 2) Best-effort CustomEvent (optional; may fail on this scamp build)
                    var argList = [profileId2, commandName, JSON.stringify(args || [])];
                    var dumps = [];
                    for (var di = 0; di < argList.length; di++)
                        dumps.push(JSON.stringify(argList[di]));
                    var msg = {
                        t: messages_1.MsgType.CustomEvent,
                        eventName: "_voaConsole",
                        args: argList,
                        argsJsonDumps: dumps,
                    };
                    var sent = false;
                    if (typeof send === "function") {
                        try {
                            send(msg, true);
                            sent = true;
                        }
                        catch (eRel) {
                            try {
                                send(msg);
                                sent = true;
                            }
                            catch (e2) { /* ignore */ }
                        }
                    }
                    if (!sent && typeof skyrimPlatform_3._voaEmit === "function") {
                        try {
                            sent = skyrimPlatform_3._voaEmit(msg, true) !== false;
                        }
                        catch (eEm) { /* ignore */ }
                    }
                    skyrimPlatform_3.printConsole(
                        "VOA admin net=" + sent + " staff=" + !!skyrimPlatform_3.storage["voaIsStaff"] +
                        " p=" + profileId2 + " cmd=" + commandName
                    );
                }
                catch (eC) {
                    skyrimPlatform_3.printConsole("VOA admin send err " + eC);
                }
            };
            // Chat module calls this for /summon /tp /listplayers /announce
            skyrimPlatform_3._voaAdminCommand = function (commandName, args) {
                sendVoaConsole(commandName, args || [], null);
            };
            var tryParseMpVoa = function (args) {
                if (!args || args.length < 2)
                    return null;
                var raw = String(args[1] != null ? args[1] : "").trim();
                if (!raw)
                    return null;
                var s = raw;
                if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
                    (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
                    s = s.slice(1, -1);
                var parts = s.split(/\s+/).filter(Boolean);
                if (!parts.length)
                    return null;
                var head = parts[0].toLowerCase();
                var voa = ["announce", "tp", "tpto", "goto", "summon", "bring", "giveplayerspell", "givespell", "addspell", "listplayers", "players"];
                if (voa.indexOf(head) < 0)
                    return null;
                var cmd = head;
                if (cmd === "tpto" || cmd === "goto")
                    cmd = "tp";
                if (cmd === "bring")
                    cmd = "summon";
                if (cmd === "givespell" || cmd === "addspell")
                    cmd = "giveplayerspell";
                if (cmd === "players")
                    cmd = "listplayers";
                return { cmd: cmd, rest: parts.slice(1) };
            };
            getCommandExecutor = function (commandName, send, localIdToRemoteId) {
                return function () {
                    var _a;
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    if (!staffGate())
                        return false;
                    if (commandName === "mp") {
                        var parsed = tryParseMpVoa(args);
                        if (parsed) {
                            sendVoaConsole(parsed.cmd, parsed.rest, send);
                            return false;
                        }
                    }
                    var schema = schemas[commandName] || [];
                    if (args.length !== schema.length && immuneSchema.indexOf(commandName) < 0) {
                        skyrimPlatform_3.printConsole("Mismatch found in the schema of '" + commandName + "' command");
                        return false;
                    }
                    for (var i = 0; i < args.length; ++i) {
                        if (schema[i] === CmdArgument.ObjectReference)
                            args[i] = localIdToRemoteId(parseInt("" + args[i]));
                    }
                    var outArgs = args;
                    if (commandName === "announce" || commandName === "tp" || commandName === "summon" || commandName === "bring") {
                        outArgs = [args.map(function (a) { return String(a); }).join(" ").trim()];
                        // Stolen console cmds often pass 0 when the name wasn't parsed â€” tell staff the right syntax
                        var qCheck = String(outArgs[0] || "").trim();
                        if ((commandName === "tp" || commandName === "summon" || commandName === "bring") &&
                            (!qCheck || qCheck === "0" || qCheck === "undefined" || qCheck === "null")) {
                            skyrimPlatform_3.printConsole("VOA usage: mp . \"" + (commandName === "bring" ? "summon" : commandName) + " PlayerName\"");
                            skyrimPlatform_3.printConsole("VOA usage: mp . \"listplayers\"   |   mp . \"announce hello\"");
                            try {
                                skyrimPlatform_3.Debug.notification("Use: mp . \"" + commandName + " Name\"");
                            }
                            catch (eU) { /* ignore */ }
                            return false;
                        }
                    }
                    else if (commandName === "giveplayerspell") {
                        outArgs = args.length === 1 ? ["self", args[0]] : args;
                    }
                    else if (commandName === "listplayers") {
                        outArgs = [];
                    }
                    // bring is alias of summon on the wire
                    var wireCmd = commandName === "bring" ? "summon" : commandName;
                    sendVoaConsole(wireCmd, outArgs, send);
                    if (skyrimPlatform_3.storage["_api_onConsoleCommand"] &&
                        skyrimPlatform_3.storage["_api_onConsoleCommand"]["callback"]) {
                        if (commandName === "mp") {
                            try {
                                (_a = skyrimPlatform_3.storage["_api_onConsoleCommand"])["callback"].apply(_a, args);
                            }
                            catch (e) {
                                skyrimPlatform_3.printConsole("'_api_onConsoleCommand' - ", e);
                            }
                        }
                    }
                    return false;
                };
            };
            var bindNamedCommand = function (name, send, localIdToRemoteId, usedSources) {
                var command = skyrimPlatform_3.findConsoleCommand(name);
                if (!command) {
                    for (var si = 0; si < STEAL_POOL.length; si++) {
                        var src = STEAL_POOL[si];
                        if (usedSources[src])
                            continue;
                        var c = skyrimPlatform_3.findConsoleCommand(src);
                        if (c) {
                            command = c;
                            usedSources[src] = true;
                            try {
                                command.shortName = name;
                                command.longName = name;
                            }
                            catch (eB) { /* ignore */ }
                            break;
                        }
                    }
                }
                if (!command) {
                    skyrimPlatform_3.printConsole("VOA: could not bind console command " + name);
                    return false;
                }
                command.execute = getCommandExecutor(name, send, localIdToRemoteId);
                skyrimPlatform_3.printConsole("VOA: bound console command " + name);
                return true;
            };
            exports_11("setUpConsoleCommands", setUpConsoleCommands = function (send, localIdToRemoteId) {
                // Default locked until API confirms staff
                try {
                    if (skyrimPlatform_3.storage["voaIsStaff"] == null)
                        skyrimPlatform_3.storage["voaIsStaff"] = false;
                }
                catch (e0) { /* ignore */ }
                refreshStaffFlag();
                // Re-check shortly after spawn (session ready)
                try {
                    skyrimPlatform_3.once("update", function () {
                        skyrimPlatform_3.Utility.wait(2.0).then(function () { refreshStaffFlag(); });
                        skyrimPlatform_3.Utility.wait(8.0).then(function () { refreshStaffFlag(); });
                    });
                }
                catch (e1) { /* ignore */ }
                var command = skyrimPlatform_3.findConsoleCommand(" ConfigureUM") || skyrimPlatform_3.findConsoleCommand("test");
                if (command) {
                    command.shortName = "mp";
                    command.execute = getCommandExecutor("mp", send, localIdToRemoteId);
                }
                ["additem", "placeatme", "disable"].forEach(function (commandName) {
                    var c = skyrimPlatform_3.findConsoleCommand(commandName);
                    if (!c)
                        return;
                    c.execute = getCommandExecutor(commandName, send, localIdToRemoteId);
                });
                var used = {};
                // bind bring as alias of summon (separate console name)
                ["announce", "tp", "summon", "bring", "giveplayerspell", "listplayers"].forEach(function (n) {
                    bindNamedCommand(n, send, localIdToRemoteId, used);
                });
                // bring uses summon executor
                try {
                    var bringCmd = skyrimPlatform_3.findConsoleCommand("bring");
                    if (bringCmd)
                        bringCmd.execute = getCommandExecutor("summon", send, localIdToRemoteId);
                }
                catch (eBr) { /* ignore */ }
                skyrimPlatform_3.printConsole("VOA admin via chat: /summon Name | /tp Name | /listplayers | /announce msg | /bring Name");
            });
        }
    };
});
System.register("skymp5-client/src/front/deathSystem", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_12, context_12) {
    "use strict";
    var skyrimPlatform_4, gAllowGetUp, isDowned, downedSince, DOWNED_MS, lastNotify, lastTempleRequest, lastDownedNotify, lastHudSec, pendingSendFn, spawnProtectUntil, update, makeActorImmortal, enterDowned, reviveLocal, isPlayerDowned, secondsLeft, requestTempleRespawn, setDownedHud, hideDownedHud, grantSpawnProtection, isSpawnProtected;
    var __moduleName = context_12 && context_12.id;
    return {
        setters: [
            function (skyrimPlatform_4_1) {
                skyrimPlatform_4 = skyrimPlatform_4_1;
            }
        ],
        execute: function () {
            gAllowGetUp = true;
            isDowned = false;
            downedSince = 0;
            DOWNED_MS = 60000;
            lastNotify = 0;
            lastTempleRequest = 0;
            lastDownedNotify = 0;
            lastHudSec = -1;
            pendingSendFn = null;
            spawnProtectUntil = 0;
            exports_12("isPlayerDowned", isPlayerDowned = function () { return isDowned; });
            exports_12("isSpawnProtected", isSpawnProtected = function () { return Date.now() < spawnProtectUntil; });
            exports_12("grantSpawnProtection", grantSpawnProtection = function (ms) {
                // Short protect: long protect was healing away all PvP damage for 45s
                var dur = typeof ms === "number" && ms > 0 ? ms : 12000;
                spawnProtectUntil = Date.now() + dur;
                try {
                    var p = skyrimPlatform_4.Game.getPlayer();
                    if (p) {
                        p.startDeferredKill();
                        p.restoreActorValue("health", 99999);
                        p.restoreActorValue("magicka", 99999);
                        p.restoreActorValue("stamina", 99999);
                        // Soft tankiness for brand-new ragged-robe characters
                        try {
                            if (p.getActorValue("health") < 150)
                                p.setActorValue("health", 150);
                            p.restoreActorValue("health", 99999);
                        }
                        catch (eH) { /* ignore */ }
                    }
                }
                catch (e) { /* ignore */ }
                try {
                    skyrimPlatform_4.Debug.notification("Spawn protection active for " + Math.round(dur / 1000) + "s.");
                }
                catch (eN) { /* ignore */ }
                skyrimPlatform_4.printConsole("VOA: spawn protection " + Math.round(dur / 1000) + "s");
            });
            exports_12("secondsLeft", secondsLeft = function () {
                if (!isDowned)
                    return 0;
                return Math.max(0, Math.ceil((downedSince + DOWNED_MS - Date.now()) / 1000));
            });
            hideDownedHud = function () {
                try {
                    skyrimPlatform_4.browser.executeJavaScript("(function(){var e=document.getElementById('voa-downed-hud');if(e)e.remove();})();");
                }
                catch (e) { /* ignore */ }
                lastHudSec = -1;
            };
            setDownedHud = function (sec) {
                if (sec === lastHudSec)
                    return;
                lastHudSec = sec;
                // Force CEF visible ??? default browser UI may be hidden / failed to load server UI
                try {
                    skyrimPlatform_4.browser.setVisible(true);
                }
                catch (eV) { /* ignore */ }
                var js = "(function(){" +
                    "try{if(!document.body)return;}" +
                    "catch(e0){return;}" +
                    "var el=document.getElementById('voa-downed-hud');" +
                    "if(!el){el=document.createElement('div');el.id='voa-downed-hud';" +
                    "el.style.cssText='position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:2147483646;" +
                    "font-family:Segoe UI,Tahoma,sans-serif;text-align:center;pointer-events:auto;" +
                    "background:rgba(8,10,14,0.88);border:2px solid rgba(201,162,39,0.75);border-radius:12px;" +
                    "padding:16px 24px;min-width:300px;box-shadow:0 8px 28px rgba(0,0,0,0.65);color:#e8e6e3';" +
                    "document.body.appendChild(el);}" +
                    "var s=" + sec + ";" +
                    "el.innerHTML='<div style=\"font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;margin-bottom:6px\">You are downed</div>" +
                    "<div style=\"font-size:48px;font-weight:700;line-height:1;color:#fff;margin:4px 0 10px\">'+s+'</div>" +
                    "<div style=\"font-size:13px;opacity:0.9;margin-bottom:12px\">seconds until temple respawn</div>" +
                    "<button id=\"voa-temple-btn\" type=\"button\" style=\"cursor:pointer;border:none;border-radius:8px;padding:12px 16px;" +
                    "font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;" +
                    "background:linear-gradient(180deg,#e0c04a,#a8841c);color:#1a1408;width:100%\">" +
                    "Respawn at nearest temple</button>" +
                    "<div style=\"font-size:12px;opacity:0.75;margin-top:10px\">or press <b>R</b></div>';" +
                    "var b=document.getElementById('voa-temple-btn');" +
                    "if(b){b.onclick=function(){try{window.skyrimPlatform.sendMessage('voaTemple');}catch(e1){" +
                    "try{window.skyrimPlatform.sendMessage(['voaTemple']);}catch(e2){}}}};" +
                    "})();";
                try {
                    skyrimPlatform_4.browser.executeJavaScript(js);
                }
                catch (e) { /* ignore if CEF not ready */ }
                // Always also surface countdown via native notification (works without CEF UI)
                if (sec % 5 === 0 || sec <= 10) {
                    try {
                        skyrimPlatform_4.Debug.notification("DOWNED ??? " + sec + "s  |  Press R to respawn at temple");
                    }
                    catch (eN) { /* ignore */ }
                }
            };
            // Client visual/ragdoll only. Server owns isDead / pos / temple / heal for MP sync.
            exports_12("enterDowned", enterDowned = function (reason, sendFn) {
                var player = skyrimPlatform_4.Game.getPlayer();
                if (!player || isDowned)
                    return;
                // Don't down during spawn protection ??? heal instead
                if (Date.now() < spawnProtectUntil) {
                    try {
                        player.restoreActorValue("health", 99999);
                        player.startDeferredKill();
                    }
                    catch (eSp) { /* ignore */ }
                    return;
                }
                isDowned = true;
                downedSince = Date.now();
                gAllowGetUp = false;
                pendingSendFn = sendFn || pendingSendFn;
                try {
                    // Stay connected: deferred kill + ragdoll, never real death menu disconnect
                    player.startDeferredKill();
                    // Keep a sliver of HP so engine doesn't hard-kill while deferred
                    try {
                        var hpNow = player.getActorValuePercentage("health");
                        if (hpNow < 0.02)
                            player.restoreActorValue("health", Math.max(1, player.getBaseActorValue("health") * 0.02));
                    }
                    catch (eHp) { /* ignore */ }
                    player.pushActorAway(player, 0);
                }
                catch (e) { /* ignore */ }
                // Tell server immediately so neighbors see isDead and server starts 60s timer
                if (typeof sendFn === "function") {
                    try {
                        sendFn({ t: 15 /* CustomEvent */, eventName: "_voaDowned", args: [], argsJsonDumps: [] }, true);
                    }
                    catch (eSend) { /* ignore */ }
                }
                // Do NOT use messageBox (modal freezes input ??? R key would not work)
                try {
                    skyrimPlatform_4.Debug.notification("DOWNED! Press R for temple respawn (60s countdown).");
                }
                catch (e2) { /* ignore */ }
                setDownedHud(secondsLeft());
                skyrimPlatform_4.printConsole("VOA: DOWNED (" + (reason || "combat") + ") ??? press R for temple");
            });
            exports_12("reviveLocal", reviveLocal = function (note) {
                // Only clear local UX state; actual HP/isDead must come from server props
                var player = skyrimPlatform_4.Game.getPlayer();
                if (!player)
                    return;
                isDowned = false;
                downedSince = 0;
                gAllowGetUp = true;
                hideDownedHud();
                try {
                    skyrimPlatform_4.Debug.sendAnimationEvent(player, "GetUpBegin");
                }
                catch (e) { /* ignore */ }
                try {
                    skyrimPlatform_4.Debug.notification(note || "You have been revived!");
                }
                catch (e2) { /* ignore */ }
                skyrimPlatform_4.printConsole("VOA: REVIVED (local UX) ??? " + (note || "ok"));
            });
            // Prefer server _voaTempleRespawn; if server addon offline, local temple TP+heal.
            var TEMPLES = [
                { name: "Whiterun", pos: [22645, -10335, -3550] },
                { name: "Solitude", pos: [-55648, 102080, -8448] },
                { name: "Riften", pos: [174176, -90432, 11008] },
                { name: "Markarth", pos: [-172416, 4656, -4608] },
                { name: "Windhelm", pos: [133696, 36112, -12224] },
                { name: "Falkreath", pos: [-31872, -75008, -3200] },
                { name: "Morthal", pos: [-39296, 59904, -13600] },
                { name: "Dawnstar", pos: [30112, 102080, -13440] },
                { name: "Winterhold", pos: [114816, 102272, -13440] },
            ];
            var localTempleRespawn = function () {
                var player = skyrimPlatform_4.Game.getPlayer();
                if (!player)
                    return;
                var p = [player.getPositionX(), player.getPositionY(), player.getPositionZ()];
                var best = TEMPLES[0];
                var bestD = 1e300;
                for (var i = 0; i < TEMPLES.length; i++) {
                    var t = TEMPLES[i];
                    var dx = t.pos[0] - p[0];
                    var dy = t.pos[1] - p[1];
                    var d = dx * dx + dy * dy;
                    if (d < bestD) {
                        bestD = d;
                        best = t;
                    }
                }
                try {
                    var ws = skyrimPlatform_4.WorldSpace.from(skyrimPlatform_4.Game.getFormEx(0x3c));
                    skyrimPlatform_4.TESModPlatform.moveRefrToPosition(player, null, ws, best.pos[0], best.pos[1], best.pos[2], 0, 0, 0);
                }
                catch (eM) {
                    try {
                        player.setPosition(best.pos[0], best.pos[1], best.pos[2]);
                    }
                    catch (eP) { /* ignore */ }
                }
                try {
                    player.restoreActorValue("health", 99999);
                    player.restoreActorValue("magicka", 99999);
                    player.restoreActorValue("stamina", 99999);
                }
                catch (eH) { /* ignore */ }
                try {
                    player.endDeferredKill();
                }
                catch (eD) { /* ignore */ }
                isDowned = false;
                downedSince = 0;
                gAllowGetUp = true;
                hideDownedHud();
                try {
                    skyrimPlatform_4.Debug.sendAnimationEvent(player, "GetUpBegin");
                }
                catch (eA) { /* ignore */ }
                try {
                    skyrimPlatform_4.Debug.notification("You awaken at " + best.name + " temple.");
                }
                catch (eN) { /* ignore */ }
                skyrimPlatform_4.printConsole("VOA: LOCAL temple respawn -> " + best.name);
            };
            requestTempleRespawn = function (sendFn) {
                if (Date.now() - lastTempleRequest < 2500)
                    return;
                lastTempleRequest = Date.now();
                var fn = sendFn || pendingSendFn;
                if (typeof fn === "function") {
                    try {
                        fn({ t: 15 /* CustomEvent */, eventName: "_voaTempleRespawn", args: [], argsJsonDumps: [] }, true);
                    }
                    catch (e) { /* ignore */ }
                }
                skyrimPlatform_4.printConsole("VOA: temple respawn requested (server + local fallback)");
                try {
                    skyrimPlatform_4.Debug.notification("Returning to the nearest temple...");
                }
                catch (e2) { /* ignore */ }
                // Always perform local teleport/heal so revive works even if server addon is offline
                skyrimPlatform_4.Utility.wait(0.35).then(function () {
                    localTempleRespawn();
                }).catch(function () {
                    localTempleRespawn();
                });
            };
            exports_12("requestTempleRespawn", requestTempleRespawn);
            // Browser click ??? temple
            try {
                skyrimPlatform_4.on("browserMessage", function (e) {
                    try {
                        var args = e && e.arguments ? e.arguments : e;
                        var a0 = args && args[0] != null ? args[0] : args;
                        if (a0 === "voaTemple" || (a0 && a0[0] === "voaTemple")) {
                            if (isDowned)
                                requestTempleRespawn(pendingSendFn);
                        }
                    }
                    catch (err) { /* ignore */ }
                });
            }
            catch (eBm) { /* older SP */ }
            // R key while downed ??? temple (always works even if CEF click fails)
            skyrimPlatform_4.on("update", function () {
                if (!isDowned)
                    return;
                try {
                    if (skyrimPlatform_4.Input.isKeyPressed(19 /* R */)) {
                        requestTempleRespawn(pendingSendFn);
                    }
                }
                catch (eK) { /* ignore */ }
            });
            exports_12("update", update = function (sendFn) {
                pendingSendFn = sendFn || pendingSendFn;
                var player = skyrimPlatform_4.Game.getPlayer();
                if (!player)
                    return;
                // Bridge: remoteServer / race menu set storage["voaGrantSpawnProtect"] = until timestamp
                try {
                    var grantUntil = skyrimPlatform_4.storage["voaGrantSpawnProtect"];
                    if (typeof grantUntil === "number" && grantUntil > spawnProtectUntil) {
                        spawnProtectUntil = grantUntil;
                        skyrimPlatform_4.storage["voaGrantSpawnProtect"] = 0;
                        try {
                            player.startDeferredKill();
                            player.restoreActorValue("health", 99999);
                            if (player.getActorValue("health") < 150)
                                player.setActorValue("health", 150);
                            player.restoreActorValue("health", 99999);
                        }
                        catch (eG) { /* ignore */ }
                        skyrimPlatform_4.printConsole("VOA: spawn protection until " + new Date(spawnProtectUntil).toISOString());
                    }
                }
                catch (eBr) { /* ignore */ }
                // Continuous deferred kill while spawn-protected or downed
                if (Date.now() < spawnProtectUntil || isDowned) {
                    try {
                        player.startDeferredKill();
                    }
                    catch (eDk) { /* ignore */ }
                }
                if (Date.now() < spawnProtectUntil) {
                    // Soft heal during protect so mudcrabs can't delete new chars
                    try {
                        var hpProt = player.getActorValuePercentage("health");
                        if (hpProt < 0.35)
                            player.restoreActorValue("health", 99999);
                    }
                    catch (ePr) { /* ignore */ }
                }
                var hp = 1;
                var engineDead = false;
                try {
                    hp = player.getActorValuePercentage("health");
                }
                catch (eHp) {
                    hp = 1;
                }
                try {
                    engineDead = !!player.isDead();
                }
                catch (eD) {
                    engineDead = false;
                }
                // Enter downed when HP is gone OR engine marks dead ??? before real death menu
                if (!isDowned && (hp <= 0.02 || engineDead)) {
                    enterDowned(engineDead ? "isDead" : "health", sendFn);
                }
                // Server/local resurrected ??? HP came back (not just the 2% sliver we keep while downed)
                if (isDowned && hp > 0.15 && !engineDead) {
                    isDowned = false;
                    downedSince = 0;
                    gAllowGetUp = true;
                    hideDownedHud();
                    try {
                        skyrimPlatform_4.Debug.notification("You rise again!");
                    }
                    catch (eR) { /* ignore */ }
                    skyrimPlatform_4.printConsole("VOA: HP restored ??? clearing local downed");
                }
                if (isDowned) {
                    gAllowGetUp = false;
                    // Keep deferred kill so we never disconnect / death menu
                    try {
                        player.startDeferredKill();
                    }
                    catch (e) { /* ignore */ }
                    var left = secondsLeft();
                    setDownedHud(left);
                    if (Date.now() - lastNotify > 10000 && left > 0) {
                        lastNotify = Date.now();
                        try {
                            skyrimPlatform_4.Debug.notification("Downed ??? " + left + "s ??? PRESS R for temple");
                        }
                        catch (e3) { /* ignore */ }
                    }
                    // Auto temple when timer ends
                    if (Date.now() - downedSince >= DOWNED_MS) {
                        requestTempleRespawn(sendFn);
                    }
                }
                else {
                    gAllowGetUp = hp >= 0.05;
                    if (lastHudSec !== -1)
                        hideDownedHud();
                }
            });
            skyrimPlatform_4.hooks.sendAnimationEvent.add({
                enter: function (ctx) {
                    if (ctx.animEventName.toLowerCase().includes("killmove")) {
                        ctx.animEventName = "";
                    }
                    if (ctx.selfId !== 0x14)
                        return;
                    if ((!gAllowGetUp || isDowned) && ctx.animEventName === "GetUpBegin") {
                        ctx.animEventName = "";
                    }
                },
                leave: function () {
                    return;
                },
            });
            exports_12("makeActorImmortal", makeActorImmortal = function (act) {
                act.startDeferredKill();
            });
        }
    };
});
System.register("skymp5-client/src/front/hostAttempts", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_13, context_13) {
    "use strict";
    var skyrimPlatform_5, tryHost, nextHostAttempt;
    var __moduleName = context_13 && context_13.id;
    return {
        setters: [
            function (skyrimPlatform_5_1) {
                skyrimPlatform_5 = skyrimPlatform_5_1;
            }
        ],
        execute: function () {
            skyrimPlatform_5.storage["hostAttempts"] = [];
            exports_13("tryHost", tryHost = function (targetRemoteId) {
                skyrimPlatform_5.storage["hostAttempts"].push(targetRemoteId);
            });
            exports_13("nextHostAttempt", nextHostAttempt = function () {
                var arr = skyrimPlatform_5.storage["hostAttempts"];
                if (arr.length === 0)
                    return undefined;
                return arr.shift();
            });
        }
    };
});
System.register("skymp5-client/src/front/components/movementApply", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_14, context_14) {
    "use strict";
    var skyrimPlatform_6, applyMovement, keepOffsetFromActor, getOffsetZ, applySprinting, applyBlocking, applySneaking, applyWeapDrawn, applyHealthPercentage, translateTo, teleportIfNeed, cellWidth, isInDifferentExteriorCell, isInDifferentWorldOrCell, getPos, getDistance;
    var __moduleName = context_14 && context_14.id;
    return {
        setters: [
            function (skyrimPlatform_6_1) {
                skyrimPlatform_6 = skyrimPlatform_6_1;
            }
        ],
        execute: function () {
            exports_14("applyMovement", applyMovement = function (refr, m) {
                // VOA: teleportIfNeed throws to signal FormView must destroy+respawn (stock SkyMP pattern).
                // Must NOT become an uncaught [Exception] on the console.
                if (teleportIfNeed(refr, m))
                    return;
                translateTo(refr, m);
                var ac = skyrimPlatform_6.Actor.from(refr);
                if (ac) {
                    var lookAt = undefined;
                    if (m.lookAt) {
                        try {
                            lookAt = skyrimPlatform_6.Game.findClosestActor(m.lookAt[0], m.lookAt[1], m.lookAt[2], 128);
                        }
                        catch (e) {
                            lookAt = null;
                        }
                    }
                    if (lookAt) {
                        ac.setHeadTracking(true);
                        ac.setLookAt(lookAt, false);
                    }
                    else {
                        ac.setHeadTracking(false);
                    }
                    // ac.stopCombat();
                    ac.blockActivation(true);
                    keepOffsetFromActor(ac, m);
                    applySprinting(ac, m.runMode === "Sprinting");
                    applyBlocking(ac, m);
                    applySneaking(ac, m.isSneaking);
                    applyWeapDrawn(ac, m.isWeapDrawn);
                    applyHealthPercentage(ac, m.healthPercentage);
                }
            });
            keepOffsetFromActor = function (ac, m) {
                var offsetAngle = m.rot[2] - ac.getAngleZ();
                if (Math.abs(offsetAngle) < 5)
                    offsetAngle = 0;
                if (m.runMode === "Standing") {
                    return ac.keepOffsetFromActor(ac, 0, 0, 0, 0, 0, offsetAngle, 1, 1);
                }
                var offset = [
                    3 * Math.sin((m.direction / 180) * Math.PI),
                    3 * Math.cos((m.direction / 180) * Math.PI),
                    getOffsetZ(m.runMode),
                ];
                ac.keepOffsetFromActor(ac, offset[0], offset[1], offset[2], 0, 0, offsetAngle, m.runMode === "Walking" ? 2048 : 1, 1);
            };
            getOffsetZ = function (runMode) {
                switch (runMode) {
                    case "Walking":
                        return -512;
                    case "Running":
                        return -1024;
                }
                return 0;
            };
            applySprinting = function (ac, isSprinting) {
                if (ac.isSprinting() != isSprinting) {
                    skyrimPlatform_6.Debug.sendAnimationEvent(ac, isSprinting ? "SprintStart" : "SprintStop");
                }
            };
            applyBlocking = function (ac, m) {
                if (ac.getAnimationVariableBool("IsBlocking") != m.isBlocking) {
                    skyrimPlatform_6.Debug.sendAnimationEvent(ac, m.isBlocking ? "BlockStart" : "BlockStop");
                    skyrimPlatform_6.Debug.sendAnimationEvent(ac, m.isSneaking ? "SneakStart" : "SneakStop");
                }
            };
            applySneaking = function (ac, isSneaking) {
                var currentIsSneaking = ac.isSneaking() || ac.getAnimationVariableBool("IsSneaking");
                if (currentIsSneaking != isSneaking) {
                    skyrimPlatform_6.Debug.sendAnimationEvent(ac, isSneaking ? "SneakStart" : "SneakStop");
                }
            };
            exports_14("applyWeapDrawn", applyWeapDrawn = function (ac, isWeapDrawn) {
                if (ac.isWeaponDrawn() !== isWeapDrawn) {
                    skyrimPlatform_6.TESModPlatform.setWeaponDrawnMode(ac, isWeapDrawn ? 1 : 0);
                }
            });
            applyHealthPercentage = function (ac, healthPercentage) {
                var currentPercentage = ac.getActorValuePercentage('health');
                if (currentPercentage === healthPercentage)
                    return;
                var currentMax = ac.getBaseActorValue('health');
                if (!currentMax || currentMax <= 0)
                    currentMax = 100;
                var deltaPercentage = healthPercentage - currentPercentage;
                var k = 0.25;
                var amount = Math.abs(deltaPercentage * currentMax * k);
                if (deltaPercentage > 0) {
                    ac.restoreActorValue('health', amount);
                }
                else if (deltaPercentage < 0) {
                    ac.damageActorValue('health', amount);
                }
            };
            translateTo = function (refr, m) {
                var distance = getDistance(getPos(refr), m.pos);
                var time = 0.1;
                if (m.isInJumpState)
                    time = 0.2;
                if (m.runMode !== "Standing")
                    time = 0.2;
                var speed = distance / time;
                // VOA: cap translate speed ??? failed movement packets + rehost caused
                // huge distance/time ratios ??? animals zip around at "lightspeed"
                if (speed > 600)
                    speed = 600;
                if (distance > 512) {
                    // Snap instead of hyper-speed slide for big corrections
                    try {
                        refr.setPosition(m.pos[0], m.pos[1], m.pos[2]);
                        refr.setAngle(m.rot[0], m.rot[1], m.rot[2]);
                    }
                    catch (eSnap) { /* fall through to translate */ }
                    return;
                }
                var angleDiff = Math.abs(m.rot[2] - refr.getAngleZ());
                if (m.runMode != "Standing" ||
                    m.isInJumpState ||
                    distance > 64 ||
                    angleDiff > 80) {
                    var actor = skyrimPlatform_6.Actor.from(refr);
                    if (actor && actor.getActorValue("Variable10") < -999)
                        return;
                    if (!actor || !actor.isDead()) {
                        refr.translateTo(m.pos[0], m.pos[1], m.pos[2], m.rot[0], m.rot[1], m.rot[2], speed, 0);
                    }
                }
            };
            teleportIfNeed = function (refr, m) {
                try {
                    if (isInDifferentWorldOrCell(refr, m.worldOrCell) ||
                        (!refr.is3DLoaded() && isInDifferentExteriorCell(refr, m.pos))) {
                        throw new Error("needs to be respawned");
                    }
                }
                catch (eCell) {
                    // Re-throw only the intentional respawn signal; swallow null world/cell races
                    if (eCell && String(eCell).indexOf("needs to be respawned") !== -1)
                        throw eCell;
                    throw new Error("needs to be respawned");
                }
                return false;
            };
            cellWidth = 4096;
            isInDifferentExteriorCell = function (refr, pos) {
                var currentPos = getPos(refr);
                var playerPos = getPos(skyrimPlatform_6.Game.getPlayer());
                var targetDistanceToPlayer = getDistance(playerPos, pos);
                var currentDistanceToPlayer = getDistance(playerPos, currentPos);
                return (currentDistanceToPlayer > cellWidth && targetDistanceToPlayer <= cellWidth);
            };
            isInDifferentWorldOrCell = function (refr, worldOrCell) {
                return (worldOrCell !== (refr.getWorldSpace() || refr.getParentCell()).getFormID());
            };
            getPos = function (refr) {
                return [refr.getPositionX(), refr.getPositionY(), refr.getPositionZ()];
            };
            getDistance = function (a, b) {
                var r = 0;
                a.forEach(function (v, i) { return (r += Math.pow(a[i] - b[i], 2)); });
                return Math.sqrt(r);
            };
        }
    };
});
System.register("skymp5-client/src/front/components/movementGet", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_15, context_15) {
    "use strict";
    var skyrimPlatform_7, getMovement, isSneaking, getRunMode;
    var __moduleName = context_15 && context_15.id;
    return {
        setters: [
            function (skyrimPlatform_7_1) {
                skyrimPlatform_7 = skyrimPlatform_7_1;
            }
        ],
        execute: function () {
            exports_15("getMovement", getMovement = function (refr) {
                // VOA: ALWAYS return every MpClientPlugin field (isDead/speed required by .at())
                var safe = {
                    worldOrCell: 0,
                    pos: [0, 0, 0],
                    rot: [0, 0, 0],
                    runMode: "Standing",
                    direction: 0,
                    isInJumpState: false,
                    isSneaking: false,
                    isBlocking: false,
                    isWeapDrawn: false,
                    isDead: false,
                    healthPercentage: 1,
                    speed: 0,
                };
                try {
                    var ac = skyrimPlatform_7.Actor.from(refr);
                    var runMode = ac ? getRunMode(ac) : "Running";
                    var healthPercentage = ac ? ac.getActorValuePercentage("health") : 1;
                    var dead = false;
                    try {
                        dead = !!(ac && ac.isDead());
                    }
                    catch (_d) {
                        dead = false;
                    }
                    if (dead)
                        healthPercentage = 0;
                    var lookAt = undefined;
                    if (ac && ac.getFormID() !== 0x14) {
                        var combatTarget = ac.getCombatTarget();
                        if (combatTarget) {
                            lookAt = [
                                combatTarget.getPositionX(),
                                combatTarget.getPositionY(),
                                combatTarget.getPositionZ(),
                            ];
                        }
                    }
                    var wocForm = refr.getWorldSpace() || refr.getParentCell();
                    var out = {
                        worldOrCell: wocForm ? wocForm.getFormID() : 0,
                        pos: [refr.getPositionX(), refr.getPositionY(), refr.getPositionZ()],
                        rot: [refr.getAngleX(), refr.getAngleY(), refr.getAngleZ()],
                        runMode: runMode || "Standing",
                        direction: runMode !== "Standing"
                            ? 360 * refr.getAnimationVariableFloat("Direction")
                            : 0,
                        isInJumpState: !!(ac && ac.getAnimationVariableBool("bInJumpState")),
                        isSneaking: !!(ac && isSneaking(ac)),
                        isBlocking: !!(ac && ac.getAnimationVariableBool("IsBlocking")),
                        isWeapDrawn: !!(ac && ac.isWeaponDrawn()),
                        isDead: dead,
                        healthPercentage: typeof healthPercentage === "number" ? healthPercentage : 1,
                        speed: (ac ? ac.getAnimationVariableFloat("SpeedSampled") : 0) || 0,
                    };
                    if (lookAt)
                        out.lookAt = lookAt;
                    // Final hard guarantees (never undefined / never missing)
                    if (typeof out.isDead !== "boolean")
                        out.isDead = false;
                    if (typeof out.speed !== "number" || isNaN(out.speed))
                        out.speed = 0;
                    return out;
                }
                catch (e) {
                    try {
                        safe.pos = [refr.getPositionX(), refr.getPositionY(), refr.getPositionZ()];
                        safe.rot = [refr.getAngleX(), refr.getAngleY(), refr.getAngleZ()];
                    }
                    catch (_e) { /* ignore */ }
                    return safe;
                }
            });
            isSneaking = function (ac) {
                return ac.isSneaking() || ac.getAnimationVariableBool("IsSneaking");
            };
            getRunMode = function (ac) {
                if (ac.isSprinting())
                    return "Sprinting";
                var speed = ac.getAnimationVariableFloat("SpeedSampled");
                if (!speed)
                    return "Standing";
                var isRunning = true;
                if (ac.getFormID() == 0x14) {
                    if (!skyrimPlatform_7.TESModPlatform.isPlayerRunningEnabled() || speed < 150)
                        isRunning = false;
                }
                else {
                    if (!ac.isRunning() || speed < 150)
                        isRunning = false;
                }
                if (ac.getAnimationVariableFloat("IsBlocking")) {
                    isRunning = isSneaking(ac);
                }
                var carryWeight = ac.getActorValue("CarryWeight");
                var totalItemWeight = ac.getTotalItemWeight();
                if (carryWeight < totalItemWeight)
                    isRunning = false;
                return isRunning ? "Running" : "Walking";
            };
        }
    };
});
System.register("skymp5-client/src/front/components/movement", ["skymp5-client/src/front/components/movementApply", "skymp5-client/src/front/components/movementGet"], function (exports_16, context_16) {
    "use strict";
    var movementApply, applyMovement, movementGet, getMovement;
    var __moduleName = context_16 && context_16.id;
    return {
        setters: [
            function (movementApply_1) {
                movementApply = movementApply_1;
            },
            function (movementGet_1) {
                movementGet = movementGet_1;
            }
        ],
        execute: function () {
            exports_16("applyMovement", applyMovement = movementApply.applyMovement);
            exports_16("getMovement", getMovement = movementGet.getMovement);
        }
    };
});
System.register("skymp5-client/src/front/components/animation", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/components/movementApply"], function (exports_17, context_17) {
    "use strict";
    var skyrimPlatform_8, movementApply_2, allowedIdles, refsWithDefaultAnimsDisabled, allowedAnims, isIdle, applyAnimation, setDefaultAnimsDisabled, AnimationSource, ignoredAnims, setupHooks;
    var __moduleName = context_17 && context_17.id;
    return {
        setters: [
            function (skyrimPlatform_8_1) {
                skyrimPlatform_8 = skyrimPlatform_8_1;
            },
            function (movementApply_2_1) {
                movementApply_2 = movementApply_2_1;
            }
        ],
        execute: function () {
            allowedIdles = new Array();
            refsWithDefaultAnimsDisabled = new Set();
            allowedAnims = new Set();
            isIdle = function (animEventName) {
                return (animEventName === "MotionDrivenIdle" ||
                    (animEventName.startsWith("Idle") &&
                        animEventName !== "IdleStop" &&
                        animEventName !== "IdleForceDefaultState"));
            };
            exports_17("applyAnimation", applyAnimation = function (refr, anim, state) {
                if (state.lastNumChanges === anim.numChanges)
                    return;
                state.lastNumChanges = anim.numChanges;
                if (isIdle(anim.animEventName)) {
                    allowedIdles.push([refr.getFormID(), anim.animEventName]);
                }
                if (anim.animEventName === "SkympFakeEquip") {
                    var ac = skyrimPlatform_8.Actor.from(refr);
                    if (ac)
                        movementApply_2.applyWeapDrawn(ac, true);
                }
                else if (anim.animEventName === "SkympFakeUnequip") {
                    var ac = skyrimPlatform_8.Actor.from(refr);
                    if (ac)
                        movementApply_2.applyWeapDrawn(ac, false);
                }
                else if (anim.animEventName === "Ragdoll") {
                    var ac = skyrimPlatform_8.Actor.from(refr);
                    if (ac) {
                        ac.pushActorAway(ac, 0);
                        ac.setActorValue("Variable10", -1000);
                    }
                }
                else {
                    if (refsWithDefaultAnimsDisabled.has(refr.getFormID())) {
                        if (anim.animEventName.toLowerCase().includes("attack")) {
                            allowedAnims.add(refr.getFormID() + ":" + anim.animEventName);
                        }
                    }
                    skyrimPlatform_8.Debug.sendAnimationEvent(refr, anim.animEventName);
                    if (anim.animEventName === "GetUpBegin") {
                        var refrId_1 = refr.getFormID();
                        skyrimPlatform_8.Utility.wait(1).then(function () {
                            var ac = skyrimPlatform_8.Actor.from(skyrimPlatform_8.Game.getFormEx(refrId_1));
                            if (ac)
                                ac.setActorValue("Variable10", 1000);
                        });
                    }
                }
            });
            exports_17("setDefaultAnimsDisabled", setDefaultAnimsDisabled = function (refrId, disabled) {
                if (disabled)
                    refsWithDefaultAnimsDisabled.add(refrId);
                else
                    refsWithDefaultAnimsDisabled.delete(refrId);
            });
            AnimationSource = /** @class */ (function () {
                function AnimationSource(refr) {
                    var _this = this;
                    this.refrId = 0;
                    this.numChanges = 0;
                    this.animEventName = "";
                    this.weapNonDrawnBlocker = 0;
                    this.weapDrawnBlocker = 0;
                    this.sneakBlocker = null;
                    this.refrId = refr.getFormID();
                    skyrimPlatform_8.hooks.sendAnimationEvent.add({
                        enter: function () { },
                        leave: function (ctx) {
                            if (ctx.selfId !== _this.refrId)
                                return;
                            if (!ctx.animationSucceeded)
                                return;
                            _this.onSendAnimationEvent(ctx.animEventName);
                        },
                    });
                }
                AnimationSource.prototype.filterMovement = function (mov) {
                    if (this.weapDrawnBlocker >= Date.now())
                        mov.isWeapDrawn = true;
                    if (this.weapNonDrawnBlocker >= Date.now())
                        mov.isWeapDrawn = false;
                    if (this.sneakBlocker === mov.isSneaking)
                        this.sneakBlocker = null;
                    else if (this.sneakBlocker === true)
                        mov.isSneaking = true;
                    else if (this.sneakBlocker === false)
                        mov.isSneaking = false;
                    return mov;
                };
                AnimationSource.prototype.getAnimation = function () {
                    var _a = this, numChanges = _a.numChanges, animEventName = _a.animEventName;
                    return { numChanges: numChanges, animEventName: animEventName };
                };
                AnimationSource.prototype.onSendAnimationEvent = function (animEventName) {
                    if (ignoredAnims.has(animEventName))
                        return;
                    var lower = animEventName.toLowerCase();
                    var isTorchEvent = lower.includes("torch");
                    if (animEventName.toLowerCase().includes("unequip") && !isTorchEvent) {
                        this.weapNonDrawnBlocker = Date.now() + 300;
                        animEventName = "SkympFakeUnequip";
                    }
                    else if (animEventName.toLowerCase().includes("equip") && !isTorchEvent) {
                        this.weapDrawnBlocker = Date.now() + 300;
                        animEventName = "SkympFakeEquip";
                    }
                    if (animEventName === "SneakStart") {
                        this.sneakBlocker = true;
                        return;
                    }
                    if (animEventName === "SneakStop") {
                        this.sneakBlocker = false;
                        return;
                    }
                    //if (animEventName === "Ragdoll") return;
                    if (animEventName === "IdleForceDefaultState")
                        return;
                    this.numChanges++;
                    this.animEventName = animEventName;
                };
                return AnimationSource;
            }());
            exports_17("AnimationSource", AnimationSource);
            ignoredAnims = new Set([
                "moveStart",
                "moveStop",
                "turnStop",
                "CyclicCrossBlend",
                "CyclicFreeze",
                "TurnLeft",
                "TurnRight",
            ]);
            exports_17("setupHooks", setupHooks = function () {
                skyrimPlatform_8.hooks.sendAnimationEvent.add({
                    enter: function (ctx) {
                        if (refsWithDefaultAnimsDisabled.has(ctx.selfId)) {
                            if (ctx.animEventName.toLowerCase().includes("attack")) {
                                var animKey = ctx.selfId + ":" + ctx.animEventName;
                                if (allowedAnims.has(animKey)) {
                                    allowedAnims.delete(animKey);
                                }
                                else {
                                    skyrimPlatform_8.printConsole("block anim " + ctx.animEventName);
                                    return (ctx.animEventName = "");
                                }
                            }
                        }
                        // ShowRaceMenu forces this anim
                        if (ctx.animEventName === "OffsetBoundStandingPlayerInstant") {
                            return (ctx.animEventName = "");
                        }
                        // Disable idle animations for 0xff actors
                        if (ctx.selfId < 0xff000000)
                            return;
                        if (isIdle(ctx.animEventName)) {
                            var i = allowedIdles.findIndex(function (pair) {
                                return pair[0] === ctx.selfId && pair[1] === ctx.animEventName;
                            });
                            i === -1 ? (ctx.animEventName = "") : allowedIdles.splice(i, 1);
                        }
                    },
                    leave: function () { },
                });
            });
        }
    };
});
System.register("skymp5-client/src/front/components/look", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/deathSystem"], function (exports_18, context_18) {
    "use strict";
    var skyrimPlatform_9, deathSystem, getLook, isVisible, applyTints, silentVoiceTypeId, applyLookCommon, applyLook, applyLookToPlayer;
    var __moduleName = context_18 && context_18.id;
    return {
        setters: [
            function (skyrimPlatform_9_1) {
                skyrimPlatform_9 = skyrimPlatform_9_1;
            },
            function (deathSystem_1) {
                deathSystem = deathSystem_1;
            }
        ],
        execute: function () {
            exports_18("getLook", getLook = function (actor) {
                var base = skyrimPlatform_9.ActorBase.from(actor.getBaseObject());
                var hairColor = base.getHairColor();
                var skinColor = skyrimPlatform_9.TESModPlatform.getSkinColor(base);
                var newLook = {
                    isFemale: base.getSex() === 1,
                    raceId: base.getRace() ? base.getRace().getFormID() : 0,
                    weight: base.getWeight(),
                    hairColor: hairColor ? hairColor.getColor() : 0,
                    headpartIds: [],
                    headTextureSetId: base.getFaceTextureSet()
                        ? base.getFaceTextureSet().getFormID()
                        : 0,
                    options: new Array(19),
                    presets: new Array(4),
                    tints: [],
                    skinColor: skinColor ? skinColor.getColor() : 0,
                    name: actor.getBaseObject().getName(),
                };
                var numHeadparts = base.getNumHeadParts();
                for (var i = 0; i < numHeadparts; ++i) {
                    var part = base.getNthHeadPart(i);
                    if (part)
                        newLook.headpartIds.push(part.getFormID());
                }
                for (var i = 0; i < newLook.options.length; ++i) {
                    newLook.options[i] = base.getFaceMorph(i);
                }
                for (var i = 0; i < newLook.presets.length; ++i) {
                    newLook.presets[i] = base.getFacePreset(i);
                }
                var numTints = skyrimPlatform_9.Game.getPlayer().getFormID() === actor.getFormID()
                    ? skyrimPlatform_9.Game.getNumTintMasks()
                    : 0;
                for (var i = 0; i < numTints; ++i) {
                    var tint = {
                        texturePath: skyrimPlatform_9.Game.getNthTintMaskTexturePath(i),
                        type: skyrimPlatform_9.Game.getNthTintMaskType(i),
                        argb: skyrimPlatform_9.Game.getNthTintMaskColor(i),
                    };
                    newLook.tints.push(tint);
                }
                return newLook;
            });
            isVisible = function (argb) { return argb > 0x00ffffff || argb < 0; };
            exports_18("applyTints", applyTints = function (actor, look) {
                if (!look)
                    throw new Error("null look has been passed to applyTints");
                var tints = look.tints.filter(function (t) { return isVisible(t.argb); });
                var raceWarPaintRegex = /.*Head.+WarPaint.*/;
                var uniWarPaintRegex = /.*HeadWarPaint.*/;
                var raceSpecificWarPaint = tints.filter(function (t) { return isVisible(t.argb) && t.texturePath.match(raceWarPaintRegex); }).length; // MaleHeadNordWarPaint
                var uniWarPaint = tints.filter(function (t) { return isVisible(t.argb) && t.texturePath.match(uniWarPaintRegex); }).length; // MaleHeadWarPaint
                if (raceSpecificWarPaint + uniWarPaint > 1) {
                    // If visible war paints of these two types present, then Skyrim crashes
                    skyrimPlatform_9.printConsole("bad warpaint!", raceSpecificWarPaint, uniWarPaint);
                    return;
                }
                skyrimPlatform_9.TESModPlatform.clearTintMasks(actor);
                tints.forEach(function (tint) {
                    skyrimPlatform_9.TESModPlatform.pushTintMask(actor, tint.type, tint.argb, tint.texturePath);
                });
                var playerBaseId = skyrimPlatform_9.Game.getPlayer().getBaseObject().getFormID();
                if (actor)
                    skyrimPlatform_9.TESModPlatform.setFormIdUnsafe(actor.getBaseObject(), playerBaseId);
            });
            exports_18("silentVoiceTypeId", silentVoiceTypeId = 0x0002f7c3);
            applyLookCommon = function (look, npc) {
                var race = skyrimPlatform_9.Race.from(skyrimPlatform_9.Game.getFormEx(look.raceId));
                var headparts = look.headpartIds
                    .map(function (id) { return skyrimPlatform_9.HeadPart.from(skyrimPlatform_9.Game.getFormEx(id)); })
                    .filter(function (headpart) { return !!headpart; });
                skyrimPlatform_9.TESModPlatform.setNpcSex(npc, look.isFemale ? 1 : 0);
                if (race)
                    skyrimPlatform_9.TESModPlatform.setNpcRace(npc, race);
                npc.setWeight(look.weight);
                skyrimPlatform_9.TESModPlatform.setNpcSkinColor(npc, look.skinColor);
                skyrimPlatform_9.TESModPlatform.setNpcHairColor(npc, look.hairColor);
                skyrimPlatform_9.TESModPlatform.resizeHeadpartsArray(npc, headparts.length);
                headparts.forEach(function (v, i) { return npc.setNthHeadPart(v, i); });
                npc.setFaceTextureSet(skyrimPlatform_9.TextureSet.from(skyrimPlatform_9.Game.getFormEx(look.headTextureSetId))); // setFaceTextureSet supports null argument
                npc.setVoiceType(skyrimPlatform_9.VoiceType.from(skyrimPlatform_9.Game.getFormEx(silentVoiceTypeId)));
                look.options.forEach(function (v, i) { return npc.setFaceMorph(v, i); });
                look.presets.forEach(function (v, i) { return npc.setFacePreset(v, i); });
                if (look.name) {
                    npc.setName(look.name);
                }
                else {
                    // for undefined or empty name
                    npc.setName(" ");
                }
            };
            exports_18("applyLook", applyLook = function (look) {
                var npc = skyrimPlatform_9.TESModPlatform.createNpc();
                if (!npc)
                    throw new Error("createNpc returned null");
                applyLookCommon(look, npc);
                // VOA: hide true name on other-player clones; overhead plates reveal after "Give Name"
                try {
                    npc.setName(" ");
                }
                catch (eHide) { /* ignore */ }
                return npc;
            });
            exports_18("applyLookToPlayer", applyLookToPlayer = function (look) {
                applyLookCommon(look, skyrimPlatform_9.ActorBase.from(skyrimPlatform_9.Game.getPlayer().getBaseObject()));
                applyTints(null, look);
                skyrimPlatform_9.Game.getPlayer().queueNiNodeUpdate();
                skyrimPlatform_9.Utility.wait(0.0625).then(function () {
                    skyrimPlatform_9.once("update", function () {
                        deathSystem.makeActorImmortal(skyrimPlatform_9.Game.getPlayer());
                    });
                });
            });
        }
    };
});
System.register("skymp5-client/src/front/components/inventory", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_19, context_19) {
    "use strict";
    var skyrimPlatform_10, getRealName, cropName, checkIfNameIsGeneratedByGame, namesEqual, extrasEqual, hasExtras, extractExtraData, squash, getExtraContainerChangesAsInventory, getBaseContainerAsInventory, sumInventories, getDiff, getInventory, basesReset, resetBase, applyInventory;
    var __moduleName = context_19 && context_19.id;
    return {
        setters: [
            function (skyrimPlatform_10_1) {
                skyrimPlatform_10 = skyrimPlatform_10_1;
            }
        ],
        execute: function () {
            // 'loxsword (Legendary)' => 'loxsword'
            getRealName = function (s) {
                if (!s)
                    return s;
                var arr = s.split(" ");
                if (arr.length && arr[arr.length - 1].match(/^\(.*\)$/))
                    arr.pop();
                return arr.join(" ");
            };
            // 'aaaaaaaaaaaaaaaa' => 'aaa...'
            cropName = function (s) {
                if (!s)
                    return s;
                var max = 128;
                return s.length >= max
                    ? s
                        .split("")
                        .filter(function (x, i) { return i < max; })
                        .join("")
                        .concat("...")
                    : s;
            };
            checkIfNameIsGeneratedByGame = function (aStr, bStr, formName) {
                if (!aStr.length && bStr.startsWith(formName)) {
                    var bEnding = bStr.substr(formName.length);
                    if (bEnding.match(/^\s\(.*\)$/)) {
                        return true;
                    }
                }
                return false;
            };
            namesEqual = function (a, b) {
                var aStr = a.name || "";
                var bStr = b.name || "";
                if (cropName(getRealName(aStr)) === cropName(getRealName(bStr)))
                    return true;
                if (a.baseId === b.baseId) {
                    var form = skyrimPlatform_10.Game.getFormEx(a.baseId);
                    if (form) {
                        var formName = form.getName();
                        if (checkIfNameIsGeneratedByGame(aStr, bStr, formName) ||
                            checkIfNameIsGeneratedByGame(bStr, aStr, formName))
                            return true;
                    }
                }
                return false;
            };
            extrasEqual = function (a, b, ignoreWorn) {
                if (ignoreWorn === void 0) { ignoreWorn = false; }
                return (a.health === b.health &&
                    a.enchantmentId === b.enchantmentId &&
                    a.maxCharge === b.maxCharge &&
                    !!a.removeEnchantmentOnUnequip === !!b.removeEnchantmentOnUnequip &&
                    a.chargePercent === b.chargePercent &&
                    //namesEqual(a, b) &&
                    a.soul === b.soul &&
                    a.poisonId === b.poisonId &&
                    a.poisonCount === b.poisonCount &&
                    ((!!a.worn === !!b.worn && !!a.wornLeft === !!b.wornLeft) || ignoreWorn));
            };
            hasExtras = function (e) {
                return !extrasEqual(e, { baseId: 0, count: 0 });
            };
            extractExtraData = function (refr, extraList, out) {
                // I see that ExtraWorn is not emitted for 0xFF actors when arrows are equipped. Fixing
                var item = skyrimPlatform_10.Game.getFormEx(out.baseId);
                if (skyrimPlatform_10.Ammo.from(item)) {
                    var actor = skyrimPlatform_10.Actor.from(refr);
                    if (actor && actor.isEquipped(item)) {
                        out.worn = true;
                    }
                }
                (extraList || []).forEach(function (extra) {
                    switch (extra.type) {
                        case "Health":
                            out.health = Math.round(extra.health * 10) / 10;
                            // TESModPlatform::AddItemEx makes all items at least 1.01 health
                            if (out.health === 1) {
                                delete out.health;
                            }
                            break;
                        case "Count":
                            out.count = extra.count;
                            break;
                        case "Enchantment":
                            out.enchantmentId = extra.enchantmentId;
                            out.maxCharge = extra.maxCharge;
                            out.removeEnchantmentOnUnequip = extra.removeOnUnequip;
                            break;
                        case "Charge":
                            out.chargePercent = extra.charge;
                            break;
                        case "Poison":
                            out.poisonId = extra.poisonId;
                            out.poisonCount = extra.count;
                            break;
                        case "Soul":
                            out.soul = extra.soul;
                            break;
                        case "TextDisplayData":
                            out.name = extra.name;
                            break;
                        case "Worn":
                            out.worn = true;
                            break;
                        case "WornLeft":
                            out.wornLeft = true;
                            break;
                    }
                });
            };
            squash = function (inv) {
                var res = new Array();
                inv.entries.forEach(function (e) {
                    var same = res.find(function (x) { return e.baseId === x.baseId && extrasEqual(x, e); });
                    if (same) {
                        same.count += e.count;
                    }
                    else {
                        res.push(JSON.parse(JSON.stringify(e)));
                    }
                });
                return { entries: res.filter(function (x) { return x.count !== 0; }) };
            };
            getExtraContainerChangesAsInventory = function (refr) {
                var extraContainerChanges = skyrimPlatform_10.getExtraContainerChanges(refr.getFormID());
                var entries = new Array();
                extraContainerChanges.forEach(function (changesEntry) {
                    var entry = {
                        baseId: changesEntry.baseId,
                        count: changesEntry.countDelta,
                    };
                    (changesEntry.extendDataList || []).forEach(function (extraList) {
                        var e = {
                            baseId: entry.baseId,
                            count: 1,
                        };
                        extractExtraData(refr, extraList, e);
                        entries.push(e);
                        entry.count -= e.count;
                    });
                    if (entry.count !== 0)
                        entries.push(entry);
                });
                var res = { entries: entries };
                res = squash(res);
                return res;
            };
            getBaseContainerAsInventory = function (refr) {
                return { entries: skyrimPlatform_10.getContainer(refr.getBaseObject().getFormID()) };
            };
            sumInventories = function (lhs, rhs) {
                var leftEntriesWithExtras = lhs.entries.filter(function (e) { return hasExtras(e); });
                var rightEntriesWithExtras = rhs.entries.filter(function (e) { return hasExtras(e); });
                var leftEntriesSimple = lhs.entries.filter(function (e) { return !hasExtras(e); });
                var rightEntriesSimple = rhs.entries.filter(function (e) { return !hasExtras(e); });
                leftEntriesSimple.forEach(function (e) {
                    var matching = rightEntriesSimple.find(function (x) { return x.baseId === e.baseId; });
                    if (matching) {
                        e.count += matching.count;
                        matching.count = 0;
                    }
                });
                return {
                    entries: leftEntriesWithExtras
                        .concat(rightEntriesWithExtras)
                        .concat(leftEntriesSimple)
                        .concat(rightEntriesSimple)
                        .filter(function (e) { return e.count !== 0; }),
                };
            };
            exports_19("getDiff", getDiff = function (lhs, rhs, ignoreWorn) {
                var lhsCopy = JSON.parse(JSON.stringify(lhs));
                var rhsCopy = JSON.parse(JSON.stringify(rhs));
                rhsCopy.entries.forEach(function (e) {
                    var sameFromLeft = lhsCopy.entries.find(function (x) { return x.baseId === e.baseId && extrasEqual(x, e, ignoreWorn); });
                    if (sameFromLeft) {
                        sameFromLeft.count -= e.count;
                    }
                    else {
                        lhsCopy.entries.push(e);
                        lhsCopy.entries[lhsCopy.entries.length - 1].count *= -1;
                    }
                });
                return { entries: lhsCopy.entries.filter(function (x) { return x.count !== 0; }) };
            });
            exports_19("getInventory", getInventory = function (refr) {
                return squash(sumInventories(getBaseContainerAsInventory(refr), getExtraContainerChangesAsInventory(refr)));
            });
            basesReset = function () {
                if (skyrimPlatform_10.storage["basesResetExists"] !== true) {
                    skyrimPlatform_10.storage["basesResetExists"] = true;
                    skyrimPlatform_10.storage["basesReset"] = new Set();
                }
                return skyrimPlatform_10.storage["basesReset"];
            };
            resetBase = function (refr) {
                var base = refr.getBaseObject();
                var baseId = base ? base.getFormID() : 0;
                if (!basesReset().has(baseId)) {
                    basesReset().add(baseId);
                    skyrimPlatform_10.TESModPlatform.resetContainer(base);
                    refr.removeAllItems(null, false, true);
                }
            };
            exports_19("applyInventory", applyInventory = function (refr, newInventory, enableCrashProtection, ignoreWorn) {
                if (ignoreWorn === void 0) { ignoreWorn = false; }
                resetBase(refr);
                var diff = getDiff(newInventory, getInventory(refr), ignoreWorn).entries;
                var res = true;
                diff.sort(function (a, b) { return (a.count < b.count ? -1 : 1); });
                diff.forEach(function (e, i) {
                    if (i > 0 && enableCrashProtection) {
                        res = false;
                        return;
                    }
                    var absCount = Math.abs(e.count);
                    var queueNiNodeUpdateNeeded = false;
                    var worn = !!e.worn;
                    var wornLeft = !!e.wornLeft;
                    var oneStepCount = e.count / absCount;
                    if (absCount > 1000) {
                        absCount = 1;
                        oneStepCount = 1;
                        // Also for arrows with strange count
                        if (worn && e.count < 0)
                            absCount = 0;
                    }
                    if (e.count > 1 && skyrimPlatform_10.Ammo.from(skyrimPlatform_10.Game.getFormEx(e.baseId))) {
                        absCount = 1;
                        oneStepCount = e.count;
                        if (e.count > 60000) {
                            // Why would actor have 60k arrows?
                            e.count = 1;
                        }
                    }
                    for (var i_1 = 0; i_1 < absCount; ++i_1) {
                        if (worn || wornLeft) {
                            skyrimPlatform_10.TESModPlatform.pushWornState(!!worn, !!wornLeft);
                            queueNiNodeUpdateNeeded = true;
                        }
                        var f = skyrimPlatform_10.Game.getFormEx(e.baseId);
                        if (!f)
                            skyrimPlatform_10.printConsole("Bad form ID " + e.baseId.toString(16));
                        else
                            skyrimPlatform_10.TESModPlatform.addItemEx(refr, f, oneStepCount, e.health ? e.health : 1, e.enchantmentId
                                ? skyrimPlatform_10.Enchantment.from(skyrimPlatform_10.Game.getFormEx(e.enchantmentId))
                                : null, e.maxCharge ? e.maxCharge : 0, !!e.removeEnchantmentOnUnequip, e.chargePercent ? e.chargePercent : 0, e.name ? cropName(e.name) : f.getName(), e.soul ? e.soul : 0, e.poisonId ? skyrimPlatform_10.Potion.from(skyrimPlatform_10.Game.getFormEx(e.poisonId)) : null, e.poisonCount ? e.poisonCount : 0);
                    }
                    if (queueNiNodeUpdateNeeded) {
                        var ac = skyrimPlatform_10.Actor.from(refr);
                        if (ac) {
                            ac.queueNiNodeUpdate();
                        }
                    }
                });
                return res;
            });
        }
    };
});
System.register("skymp5-client/src/front/components/equipment", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/components/inventory"], function (exports_20, context_20) {
    "use strict";
    var skyrimPlatform_11, inventory_1, filterWorn, removeUnnecessaryExtra, getEquipment, applyEquipment, isBadMenuShown;
    var __moduleName = context_20 && context_20.id;
    return {
        setters: [
            function (skyrimPlatform_11_1) {
                skyrimPlatform_11 = skyrimPlatform_11_1;
            },
            function (inventory_1_1) {
                inventory_1 = inventory_1_1;
            }
        ],
        execute: function () {
            filterWorn = function (inv) {
                return { entries: inv.entries.filter(function (x) { return x.worn || x.wornLeft; }) };
            };
            removeUnnecessaryExtra = function (inv) {
                return {
                    entries: inv.entries.map(function (x) {
                        var r = JSON.parse(JSON.stringify(x));
                        r.chargePercent = r.maxCharge;
                        r.count = skyrimPlatform_11.Ammo.from(skyrimPlatform_11.Game.getFormEx(x.baseId)) ? 1000 : 1;
                        delete r.name;
                        return r;
                    }),
                };
            };
            exports_20("getEquipment", getEquipment = function (ac, numChanges) {
                // Strip display names Ã¢â‚¬â€ TextDisplayData can be non-UTF-8 and crash
                // server simdjson ("The input is not valid UTF-8") Ã¢â€ â€™ disconnect.
                var inv = inventory_1.getInventory(ac);
                try {
                    if (inv && Array.isArray(inv.entries)) {
                        inv = {
                            entries: inv.entries.map(function (x) {
                                var r = JSON.parse(JSON.stringify(x));
                                delete r.name;
                                return r;
                            }),
                        };
                    }
                }
                catch (eStrip) { /* keep raw inv */ }
                return { inv: inv, numChanges: numChanges };
            });
            exports_20("applyEquipment", applyEquipment = function (ac, eq) {
                return inventory_1.applyInventory(ac, removeUnnecessaryExtra(filterWorn(eq.inv)), true);
            });
            exports_20("isBadMenuShown", isBadMenuShown = function () {
                return (skyrimPlatform_11.Ui.isMenuOpen("InventoryMenu") ||
                    skyrimPlatform_11.Ui.isMenuOpen("FavoritesMenu") ||
                    skyrimPlatform_11.Ui.isMenuOpen("MagicMenu") ||
                    skyrimPlatform_11.Ui.isMenuOpen("ContainerMenu") ||
                    skyrimPlatform_11.Ui.isMenuOpen("Crafting Menu") // Actually I don't think it causes crashes
                );
            });
        }
    };
});
System.register("skymp5-client/src/front/model", [], function (exports_21, context_21) {
    "use strict";
    var __moduleName = context_21 && context_21.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/worldCleaner", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_22, context_22) {
    "use strict";
    var skyrimPlatform_12, protection, isUnsafeMenu, isMpProtectedForm, muteAndHide, stripActor, processOneActor, CLEAN_RADII, FINDS_BURST, FINDS_STEADY, BURST_MS, START_DELAY_MS, loggedOnce, waitingLogged, hooksReady, strippedCount, lastStatus, lastLoggedCount, liveSinceMs, radiusIdx, frameSkip, strippedIds, pendingAttachIds;
    var __moduleName = context_22 && context_22.id;
    /**
     * VOA player-only: hide local vanilla NPCs/animals (client-side).
     * CTD-safe mode (no disable / no setPosition Ã¢â‚¬â€ those race MovementControllerNPC).
     * Soft only: AI off, ghost, alpha 0, scale down, no dialogue.
     * cellAttach only queues IDs; all work runs on update after START_DELAY_MS.
     */
    function processOneActor(radius) {
        var pc = skyrimPlatform_12.Game.getPlayer();
        if (!pc)
            return;
        var actor = skyrimPlatform_12.Game.findRandomActor(pc.getPositionX(), pc.getPositionY(), pc.getPositionZ(), radius);
        if (!actor)
            return;
        var actorId = 0;
        try {
            actorId = actor.getFormID();
        }
        catch (eId) {
            return;
        }
        if (!actorId || actorId === 0x14 || actorId === 0x100014)
            return;
        if (isMpProtectedForm(actorId))
            return;
        if ((protection.get(actorId) || 0) > 0)
            return;
        try {
            if (actor.isDeleted())
                return;
        }
        catch (eChk) {
            return;
        }
        stripActor(actor, actorId);
    }
    function processPendingAttaches(budget) {
        if (!pendingAttachIds || !pendingAttachIds.length)
            return;
        var n = Math.min(budget, pendingAttachIds.length);
        for (var i = 0; i < n; i++) {
            var id = pendingAttachIds.shift();
            if (!id)
                continue;
            if (isMpProtectedForm(id))
                continue;
            if ((protection.get(id) || 0) > 0)
                continue;
            try {
                var form = skyrimPlatform_12.Game.getFormEx(id);
                if (!form)
                    continue;
                var ac = skyrimPlatform_12.Actor.from(form);
                if (!ac)
                    continue;
                stripActor(ac, id);
            }
            catch (eP) { }
        }
    }
    function updateWc() {
        var now = Date.now();
        // Start the settle clock as soon as we get update ticks (do not reset forever
        // when Main/Loading menu flickers Ã¢â‚¬â€ that prevented ACTIVE from ever logging).
        if (!liveSinceMs)
            liveSinceMs = now;
        if (isUnsafeMenu()) {
            if (!waitingLogged) {
                waitingLogged = true;
                try {
                    skyrimPlatform_12.printConsole("VOA: world cleaner waiting (main/loading menu)");
                }
                catch (eW) { }
            }
            return;
        }
        // Wait after first live ticks before touching actors (join CTD window)
        if (now - liveSinceMs < START_DELAY_MS) {
            if (!waitingLogged) {
                waitingLogged = true;
                try {
                    skyrimPlatform_12.printConsole("VOA: world cleaner arming (" + Math.ceil((START_DELAY_MS - (now - liveSinceMs)) / 1000) + "s)");
                }
                catch (eA) { }
            }
            return;
        }
        if (!loggedOnce) {
            loggedOnce = true;
            waitingLogged = false;
            try {
                skyrimPlatform_12.printConsole("VOA: world cleaner ACTIVE (soft mute only, no disable)");
            }
            catch (e) { }
        }
        if (!hooksReady) {
            hooksReady = true;
            try {
                skyrimPlatform_12.on("cellAttach", function (e) {
                    try {
                        // Never strip inside cellAttach callback (engine mid-attach = CTD).
                        // Queue form id for next update ticks.
                        if (!e || !e.refr)
                            return;
                        var id = 0;
                        try {
                            id = e.refr.getFormID();
                        }
                        catch (eId) {
                            return;
                        }
                        if (!id || id === 0x14 || id === 0x100014)
                            return;
                        if (isMpProtectedForm(id))
                            return;
                        if ((protection.get(id) || 0) > 0)
                            return;
                        if (pendingAttachIds.length < 400)
                            pendingAttachIds.push(id);
                    }
                    catch (eAtt) { }
                });
            }
            catch (eCell) { }
            try {
                skyrimPlatform_12.on("menuOpen", function (e) {
                    try {
                        if (!e || e.name !== "Dialogue Menu")
                            return;
                        if (isUnsafeMenu())
                            return;
                        try {
                            skyrimPlatform_12.Ui.closeMenu("Dialogue Menu");
                        }
                        catch (eClose) { }
                        var pc = skyrimPlatform_12.Game.getPlayer();
                        if (pc) {
                            try {
                                var dt = pc.getDialogueTarget();
                                if (dt) {
                                    var ac = skyrimPlatform_12.Actor.from(dt);
                                    if (ac)
                                        stripActor(ac, ac.getFormID());
                                }
                            }
                            catch (eDt) { }
                        }
                    }
                    catch (eMenu) { }
                });
            }
            catch (eHook) { }
            try {
                skyrimPlatform_12.printConsole("VOA: player-only soft-mute ON (no disable/setPos)");
            }
            catch (eLog) { }
        }
        try {
            if (skyrimPlatform_12.Ui.isMenuOpen("Dialogue Menu")) {
                try {
                    skyrimPlatform_12.Ui.closeMenu("Dialogue Menu");
                }
                catch (eC2) { }
            }
        }
        catch (eDlg) { }
        processPendingAttaches(12);
        var inBurst = (now - liveSinceMs) < (START_DELAY_MS + BURST_MS);
        frameSkip++;
        if (!inBurst && frameSkip % 3 === 0)
            return;
        var budget = inBurst ? FINDS_BURST : FINDS_STEADY;
        for (var i = 0; i < budget; i++) {
            var radius = CLEAN_RADII[radiusIdx % CLEAN_RADII.length];
            radiusIdx++;
            processOneActor(radius);
        }
        // Log only when count changes (was spamming every 15s)
        if (now - lastStatus > 30000 && strippedCount !== lastLoggedCount) {
            lastStatus = now;
            lastLoggedCount = strippedCount;
            try {
                skyrimPlatform_12.printConsole("VOA: world cleaner soft-muted ~" + strippedCount + " locals");
            }
            catch (e2) { }
        }
    }
    exports_22("updateWc", updateWc);
    function modWcProtection(actorId, mod) {
        var currentProtection = protection.get(actorId);
        protection.set(actorId, currentProtection ? currentProtection + mod : mod);
    }
    exports_22("modWcProtection", modWcProtection);
    return {
        setters: [
            function (skyrimPlatform_12_1) {
                skyrimPlatform_12 = skyrimPlatform_12_1;
            }
        ],
        execute: function () {
            protection = new Map();
            strippedIds = new Map();
            pendingAttachIds = [];
            CLEAN_RADII = [1024, 2048, 4096, 8192, 16384, 32768];
            FINDS_BURST = 28;
            FINDS_STEADY = 16;
            BURST_MS = 45000;
            // After first update ticks, short settle before actor soft-mute
            START_DELAY_MS = 4000;
            loggedOnce = false;
            waitingLogged = false;
            hooksReady = false;
            strippedCount = 0;
            lastStatus = 0;
            lastLoggedCount = -1;
            liveSinceMs = 0;
            radiusIdx = 0;
            frameSkip = 0;
            isUnsafeMenu = function () {
                try {
                    // Only hard-block during true load / character gen. Do NOT treat
                    // UI API errors as forever-unsafe (that disabled the cleaner).
                    return !!(skyrimPlatform_12.Ui.isMenuOpen("Loading Menu") ||
                        skyrimPlatform_12.Ui.isMenuOpen("RaceSex Menu"));
                }
                catch (e) {
                    return false;
                }
            };
            isMpProtectedForm = function (actorId) {
                var id = actorId >>> 0;
                if (id >= 0xff000000)
                    return true;
                return false;
            };
            // Soft only Ã¢â‚¬â€ NEVER disable() or setPosition (MovementController CTD)
            muteAndHide = function (actor) {
                try {
                    if (typeof actor.allowPCDialogue === "function")
                        actor.allowPCDialogue(false);
                }
                catch (e1) { }
                try {
                    if (typeof actor.allowBleedoutDialogue === "function")
                        actor.allowBleedoutDialogue(false);
                }
                catch (e2) { }
                try {
                    if (typeof actor.enableAI === "function")
                        actor.enableAI(false);
                }
                catch (e3) { }
                try {
                    if (typeof actor.setRestrained === "function")
                        actor.setRestrained(true);
                }
                catch (e4) { }
                try {
                    if (typeof actor.setGhost === "function")
                        actor.setGhost(true);
                }
                catch (e5) { }
                try {
                    if (typeof actor.blockActivation === "function")
                        actor.blockActivation(true);
                }
                catch (e6) { }
                try {
                    if (typeof actor.stopCombat === "function")
                        actor.stopCombat();
                }
                catch (e7) { }
                try {
                    if (typeof actor.clearLookAt === "function")
                        actor.clearLookAt();
                }
                catch (e8) { }
                try {
                    if (typeof actor.setAlpha === "function")
                        actor.setAlpha(0);
                }
                catch (e9) { }
                try {
                    if (typeof actor.setScale === "function")
                        actor.setScale(0.01);
                }
                catch (e10) { }
            };
            stripActor = function (actor, actorId) {
                if (!actor || !actorId)
                    return;
                if (isMpProtectedForm(actorId))
                    return;
                if ((protection.get(actorId) || 0) > 0)
                    return;
                try {
                    var already = strippedIds.get(actorId);
                    var now = Date.now();
                    // Re-apply soft mute every 4s (engine re-enables AI)
                    if (already && now - already < 4000)
                        return;
                    muteAndHide(actor);
                    if (!already)
                        strippedCount++;
                    strippedIds.set(actorId, now);
                }
                catch (eAll) { }
            };
        }
    };
});
System.register("skymp5-client/src/front/view", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/components/movement", "skymp5-client/src/front/components/animation", "skymp5-client/src/front/components/look", "skymp5-client/src/front/components/equipment", "skymp5-client/src/front/worldCleaner", "skymp5-client/src/front/components/inventory", "skymp5-client/src/front/hostAttempts", "skymp5-client/src/front/components/movementGet", "skymp5-client/src/front/deathSystem"], function (exports_23, context_23) {
    "use strict";
    var skyrimPlatform_13, sp, movement_1, animation_1, look_1, equipment_1, worldCleaner_1, inventory_2, hostAttempts_1, movementGet_2, deathSystem, gCrosshairRefId, gPcInJumpState, gPcWorldOrCellId, gUpdateNeighborFunctionsKeys, gUpdateNeighborFunctions, getFormEx, lastTryHost, tryHostIfNeed, SpawnProcess, getDefaultEquipState, getDefaultLookState, undefinedRefr, unknownValue, undefinedFormModel, undefinedObject, undefinedView, ctx, FormView, FormViewArray, WorldView, getViewFromStorage, localIdToRemoteId, remoteIdToLocalId;
    var __moduleName = context_23 && context_23.id;
    function isItem(t) {
        var isAmmo = t === 42;
        var isArmor = t === 26;
        var isBook = t === 27;
        var isIngredient = t === 30;
        var isLight = t === 31;
        var isPotion = t === 46;
        var isScroll = t === 23;
        var isSoulGem = t === 52;
        var isWeapon = t === 41;
        var isMisc = t === 32;
        var isItem = isAmmo ||
            isArmor ||
            isBook ||
            isIngredient ||
            isLight ||
            isPotion ||
            isScroll ||
            isSoulGem ||
            isWeapon ||
            isMisc;
        return isItem;
    }
    function dealWithRef(ref, base) {
        var t = base.getType();
        var isContainer = t === 28;
        var isFlora = t === 39;
        var isTree = t === 38;
        var isIngredientSource = isFlora || isTree;
        var isMovableStatic = t === 36;
        var isNpc = t === 43;
        var isDoor = t === 29;
        // VOA player-only: do NOT block doors.
        // Stock SkyMP blocks doors for server-authoritative cell travel, but with
        // isVanillaSpawn=false / no door FormViews, Activate often never yields a
        // Teleport Ã¢â‚¬â€ players enter via local load then cannot leave (exit door dead).
        // Keep containers/items/furniture blocked; doors stay locally usable + still
        // send Activate for server sync when possible.
        if (isContainer || isItem(t) || isIngredientSource || isNpc) {
            ref.blockActivation(true);
        }
        else {
            ref.blockActivation(false);
        }
        if (ref.isLocked()) {
            ref.lock(false, false);
        }
        if (isItem(t)) {
            ref.setMotionType(4 /* Keyframed */, false);
        }
        // https://github.com/skyrim-multiplayer/issue-tracker/issues/36
        if (isFlora) {
            var hasIngr = sp.Flora.from(base).getIngredient() != null;
            if (hasIngr)
                ref.setMotionType(4 /* Keyframed */, false);
        }
    }
    return {
        setters: [
            function (skyrimPlatform_13_1) {
                skyrimPlatform_13 = skyrimPlatform_13_1;
                sp = skyrimPlatform_13_1;
            },
            function (movement_1_1) {
                movement_1 = movement_1_1;
            },
            function (animation_1_1) {
                animation_1 = animation_1_1;
            },
            function (look_1_1) {
                look_1 = look_1_1;
            },
            function (equipment_1_1) {
                equipment_1 = equipment_1_1;
            },
            function (worldCleaner_1_1) {
                worldCleaner_1 = worldCleaner_1_1;
            },
            function (inventory_2_1) {
                inventory_2 = inventory_2_1;
            },
            function (hostAttempts_1_1) {
                hostAttempts_1 = hostAttempts_1_1;
            },
            function (movementGet_2_1) {
                movementGet_2 = movementGet_2_1;
            },
            function (deathSystem_2) {
                deathSystem = deathSystem_2;
            }
        ],
        execute: function () {
            gCrosshairRefId = 0;
            gPcInJumpState = false;
            gPcWorldOrCellId = 0;
            gUpdateNeighborFunctionsKeys = new Array();
            gUpdateNeighborFunctions = {};
            skyrimPlatform_13.on("tick", function () {
                var keys = skyrimPlatform_13.storage["updateNeighborFunctions_keys"];
                if (keys && Array.isArray(keys)) {
                    gUpdateNeighborFunctionsKeys = keys;
                }
                else {
                    gUpdateNeighborFunctionsKeys = [];
                }
                gUpdateNeighborFunctions = skyrimPlatform_13.storage["updateNeighborFunctions"];
            });
            getFormEx = skyrimPlatform_13.Game.getFormEx;
            lastTryHost = {};
            tryHostIfNeed = function (ac, remoteId) {
                // VOA player-only: never host vanilla cell actors (animals/NPCs) ??? only MP dynamic forms
                if (!remoteId || (remoteId >>> 0) < 0xff000000)
                    return;
                // VOA: host attempts were 1/s per actor ??? NPC enable/disable thrash ("fading")
                // Only retry every 12s, and skip if already hosting this remote id.
                var last = lastTryHost[remoteId];
                if (last && Date.now() - last < 12000)
                    return;
                try {
                    var hosted = skyrimPlatform_13.storage["hosted"];
                    if (hosted && Array.isArray(hosted)) {
                        var hex = remoteId.toString(16);
                        for (var hi = 0; hi < hosted.length; hi++) {
                            if (hosted[hi] === hex || hosted[hi] === remoteId || Number(hosted[hi]) === remoteId)
                                return;
                        }
                    }
                }
                catch (eH) { /* ignore */ }
                lastTryHost[remoteId] = Date.now();
                if (movementGet_2.getMovement(ac).worldOrCell ===
                    movementGet_2.getMovement(skyrimPlatform_13.Game.getPlayer()).worldOrCell) {
                    return hostAttempts_1.tryHost(remoteId);
                }
            };
            SpawnProcess = /** @class */ (function () {
                function SpawnProcess(look, pos, refrId, callback) {
                    var _this = this;
                    this.callback = callback;
                    var refr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(refrId));
                    if (!refr || refr.getFormID() !== refrId)
                        return;
                    refr.setPosition.apply(refr, pos).then(function () { return _this.enable(look, refrId); });
                }
                SpawnProcess.prototype.enable = function (look, refrId) {
                    var _this = this;
                    var refr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(refrId));
                    if (!refr || refr.getFormID() !== refrId)
                        return;
                    var ac = skyrimPlatform_13.Actor.from(refr);
                    if (look && ac)
                        look_1.applyTints(ac, look);
                    refr.enable(false).then(function () { return _this.resurrect(look, refrId); });
                };
                SpawnProcess.prototype.resurrect = function (look, refrId) {
                    var _this = this;
                    var refr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(refrId));
                    if (!refr || refr.getFormID() !== refrId)
                        return;
                    var ac = skyrimPlatform_13.Actor.from(refr);
                    if (ac) {
                        return ac.resurrect().then(function () {
                            _this.callback();
                        });
                    }
                    return refr.setMotionType(4 /* Keyframed */, true).then(this.callback);
                };
                return SpawnProcess;
            }());
            getDefaultEquipState = function () {
                return { lastNumChanges: 0, isBadMenuShown: false, lastEqMoment: 0 };
            };
            getDefaultLookState = function () {
                return { lastNumChanges: 0, look: null };
            };
            undefinedRefr = undefined;
            unknownValue = undefined;
            undefinedFormModel = undefined;
            undefinedObject = undefined;
            undefinedView = undefined;
            ctx = {
                refr: undefinedRefr,
                value: unknownValue,
                _model: undefinedFormModel,
                sp: sp,
                state: undefinedObject,
                _view: undefinedView,
                i: -1,
                getFormIdInServerFormat: function (clientsideFormId) {
                    return localIdToRemoteId(clientsideFormId);
                },
                getFormIdInClientFormat: function (serversideFormId) {
                    return remoteIdToLocalId(serversideFormId);
                },
                get: function (propName) {
                    return this._model[propName];
                },
                respawn: function () {
                    this._view.destroyForm(this.i);
                },
            };
            FormView = /** @class */ (function () {
                function FormView(remoteRefrId) {
                    this.remoteRefrId = remoteRefrId;
                    this.lastHarvestedApply = 0;
                    this.lastOpenApply = 0;
                    this.refrId = 0;
                    this.ready = false;
                    this.animState = { lastNumChanges: 0 };
                    this.movState = {
                        lastNumChanges: 0,
                        lastApply: 0,
                        lastRehost: 0,
                        everApplied: false,
                    };
                    this.lookState = getDefaultLookState();
                    this.eqState = getDefaultEquipState();
                    this.lookBasedBaseId = 0;
                    this.isOnScreen = false;
                    this.lastPcWorldOrCell = 0;
                    this.lastWorldOrCell = 0;
                    this.spawnMoment = 0;
                    this.wasHostedByOther = undefined;
                    this.state = {};
                    this.localImmortal = false;
                }
                FormView.prototype.update = function (model) {
                    var _this = this;
                    var _a, _b, _c;
                    // Other players mutate into PC clones when moving to another location
                    if (model.movement && model.movement.worldOrCell) {
                        if (!this.lastWorldOrCell)
                            this.lastWorldOrCell = model.movement.worldOrCell;
                        // VOA: ignore junk/zero cell from bad packets (was destroying NPCs every frame)
                        if (this.lastWorldOrCell &&
                            model.movement.worldOrCell &&
                            this.lastWorldOrCell !== model.movement.worldOrCell) {
                            skyrimPlatform_13.printConsole("[1] worldOrCell changed, destroying FormView " + this.lastWorldOrCell.toString(16) + " => " + model.movement.worldOrCell.toString(16));
                            this.lastWorldOrCell = model.movement.worldOrCell;
                            this.destroy();
                            this.refrId = 0;
                            this.lookBasedBaseId = 0;
                            return;
                        }
                    }
                    // Players with different worldOrCell should be invisible
                    if (model.movement && model.movement.worldOrCell) {
                        var worldOrCell = skyrimPlatform_13.Game.getPlayer().getWorldSpace() ||
                            skyrimPlatform_13.Game.getPlayer().getParentCell();
                        if (worldOrCell &&
                            model.movement.worldOrCell !== worldOrCell.getFormID()) {
                            this.destroy();
                            this.refrId = 0;
                            return;
                        }
                    }
                    // Apply look before base form selection to prevent double-spawn
                    if (model.look) {
                        if (!this.lookState.look ||
                            model.numLookChanges !== this.lookState.lastNumChanges) {
                            this.lookState.look = model.look;
                            this.lookState.lastNumChanges = model.numLookChanges;
                            this.lookBasedBaseId = 0;
                        }
                        // VOA: remember true name for plates / reveal (hidden on actor base)
                        // SP storage: always reassign object (in-place mutation is dropped)
                        try {
                            if (this.remoteRefrId && this.remoteRefrId >= 0xff000000) {
                                var lookNm = model.look && model.look.name ? String(model.look.name) : "";
                                if (typeof skyrimPlatform_13.storage._voaOnPlayerLook === "function")
                                    skyrimPlatform_13.storage._voaOnPlayerLook(this.remoteRefrId, lookNm);
                                else {
                                    var tn = {};
                                    var prevTn = skyrimPlatform_13.storage["voaTrueNames"];
                                    if (prevTn && typeof prevTn === "object") {
                                        for (var tk in prevTn) {
                                            if (Object.prototype.hasOwnProperty.call(prevTn, tk))
                                                tn[tk] = prevTn[tk];
                                        }
                                    }
                                    if (lookNm) tn[this.remoteRefrId] = lookNm;
                                    skyrimPlatform_13.storage["voaTrueNames"] = tn;
                                    var kn = {};
                                    var prevKn = skyrimPlatform_13.storage["voaKnownPlayers"];
                                    if (prevKn && typeof prevKn === "object") {
                                        for (var kk in prevKn) {
                                            if (Object.prototype.hasOwnProperty.call(prevKn, kk))
                                                kn[kk] = prevKn[kk];
                                        }
                                    }
                                    kn[this.remoteRefrId] = 1;
                                    skyrimPlatform_13.storage["voaKnownPlayers"] = kn;
                                }
                            }
                        }
                        catch (eName) { /* ignore */ }
                    }
                    var refId = model.refrId && model.refrId < 0xff000000 ? model.refrId : undefined;
                    if (refId) {
                        if (this.refrId !== refId) {
                            this.destroy();
                            this.refrId = model.refrId;
                            this.ready = true;
                            var refr_1 = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(this.refrId));
                            if (refr_1) {
                                var base = refr_1.getBaseObject();
                                if (base)
                                    dealWithRef(refr_1, base);
                            }
                        }
                    }
                    else {
                        var base = getFormEx(+model.baseId) ||
                            getFormEx(this.getLookBasedBase());
                        if (!base)
                            return;
                        var refr_2 = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(this.refrId));
                        var respawnRequired = !refr_2 ||
                            !refr_2.getBaseObject() ||
                            refr_2.getBaseObject().getFormID() !== base.getFormID();
                        if (respawnRequired) {
                            this.destroy();
                            refr_2 = skyrimPlatform_13.Game.getPlayer().placeAtMe(base, 1, true, true);
                            this.state = {};
                            delete this.wasHostedByOther;
                            var kTypeNpc = 43;
                            if (base.getType() !== kTypeNpc) {
                                refr_2.setAngle(((_a = model.movement) === null || _a === void 0 ? void 0 : _a.rot[0]) || 0, ((_b = model.movement) === null || _b === void 0 ? void 0 : _b.rot[1]) || 0, ((_c = model.movement) === null || _c === void 0 ? void 0 : _c.rot[2]) || 0);
                            }
                            worldCleaner_1.modWcProtection(refr_2.getFormID(), 1);
                            // TODO: reset all states?
                            this.eqState = getDefaultEquipState();
                            this.ready = false;
                            new SpawnProcess(this.lookState.look, model.movement
                                ? model.movement.pos
                                : [
                                    skyrimPlatform_13.Game.getPlayer().getPositionX(),
                                    skyrimPlatform_13.Game.getPlayer().getPositionY(),
                                    skyrimPlatform_13.Game.getPlayer().getPositionZ(),
                                ], refr_2.getFormID(), function () {
                                _this.ready = true;
                                _this.spawnMoment = Date.now();
                            });
                            if (model.look && model.look.name)
                                refr_2.setDisplayName("" + model.look.name, true);
                        }
                        this.refrId = refr_2.getFormID();
                    }
                    if (!this.ready)
                        return;
                    var refr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(this.refrId));
                    if (refr) {
                        var actor = skyrimPlatform_13.Actor.from(refr);
                        if (actor && !this.localImmortal) {
                            // VOA: deferred-kill only (no 1e6 HP) so host combat + death work
                            deathSystem.makeActorImmortal(actor);
                            this.localImmortal = true;
                        }
                        this.applyAll(refr, model);
                        for (var _i = 0, gUpdateNeighborFunctionsKeys_1 = gUpdateNeighborFunctionsKeys; _i < gUpdateNeighborFunctionsKeys_1.length; _i++) {
                            var key = gUpdateNeighborFunctionsKeys_1[_i];
                            var v = model[key];
                            // From docs:
                            // In `updateOwner`/`updateNeighbor` equals to a value of a currently processed property.
                            // Can't be `undefined` here, since updates are not received for `undefined` property values.
                            // In other contexts is always `undefined`.
                            if (v !== undefined) {
                                if (this.refrId >= 0xff000000) {
                                    /*printConsole(
                                      "upd",
                                      this.refrId.toString(16),
                                      `${key}=${JSON.stringify(v)}`
                                    );*/
                                }
                                ctx.refr = refr;
                                ctx.value = v;
                                ctx._model = model;
                                ctx.state = this.state;
                                var f = gUpdateNeighborFunctions[key];
                                // Actually, 'f' should always be a valid function, but who knows
                                try {
                                    if (f)
                                        f(ctx);
                                }
                                catch (e) {
                                    skyrimPlatform_13.printConsole("'updateNeighbor." + key + "' - ", e);
                                }
                            }
                        }
                    }
                };
                FormView.prototype.destroy = function () {
                    this.isOnScreen = false;
                    this.spawnMoment = 0;
                    var refr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(this.refrId));
                    if (this.refrId >= 0xff000000) {
                        if (refr)
                            refr.delete();
                        worldCleaner_1.modWcProtection(this.refrId, -1);
                        var ac = skyrimPlatform_13.Actor.from(refr);
                        if (ac) {
                            sp.TESModPlatform.setWeaponDrawnMode(ac, -1);
                        }
                    }
                    this.localImmortal = false;
                };
                FormView.prototype.applyHarvested = function (refr, isHarvested) {
                    var base = refr.getBaseObject();
                    if (base) {
                        var t = base.getType();
                        if (t >= 38 && t <= 39) {
                            var wasHarvested = refr.isHarvested();
                            if (isHarvested != wasHarvested) {
                                var ac = undefined;
                                if (isHarvested)
                                    for (var i = 0; i < 20; ++i) {
                                        ac = skyrimPlatform_13.Game.findRandomActor(refr.getPositionX(), refr.getPositionY(), refr.getPositionZ(), 10000);
                                        if (ac && ac.getFormID() !== 0x14) {
                                            break;
                                        }
                                    }
                                if (isHarvested && ac && ac.getFormID() !== 0x14) {
                                    refr.activate(ac, true);
                                }
                                else {
                                    refr.setHarvested(isHarvested);
                                    var id_1 = refr.getFormID();
                                    refr.disable(false).then(function () {
                                        var restoredRefr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(id_1));
                                        if (restoredRefr)
                                            restoredRefr.enable(false);
                                    });
                                }
                            }
                        }
                        else {
                            var wasHarvested = refr.isDisabled();
                            if (isHarvested != wasHarvested) {
                                if (isHarvested) {
                                    var id_2 = refr.getFormID();
                                    refr.disable(false).then(function () {
                                        var restoredRefr = skyrimPlatform_13.ObjectReference.from(skyrimPlatform_13.Game.getFormEx(id_2));
                                        if (restoredRefr && !restoredRefr.isDisabled()) {
                                            restoredRefr.delete();
                                            // Deletion takes time, so in practice this would be called a lot of times
                                        }
                                    });
                                }
                                else
                                    refr.enable(true);
                            }
                        }
                    }
                };
                FormView.prototype.applyAll = function (refr, model) {
                    var forcedWeapDrawn = null;
                    if (gCrosshairRefId === this.refrId) {
                        this.lastHarvestedApply = 0;
                        this.lastOpenApply = 0;
                    }
                    var now = Date.now();
                    // VOA: never run harvest disable/enable on actors (animals were flickering)
                    if (now - this.lastHarvestedApply > 666) {
                        this.lastHarvestedApply = now;
                        if (!skyrimPlatform_13.Actor.from(refr))
                            this.applyHarvested(refr, !!model.isHarvested);
                    }
                    if (now - this.lastOpenApply > 133) {
                        this.lastOpenApply = now;
                        refr.setOpen(!!model.isOpen);
                    }
                    if (model.inventory &&
                        gCrosshairRefId == this.refrId &&
                        !equipment_1.isBadMenuShown()) {
                        // Do not let actors breaking their equipment via inventory apply
                        // However, actually, actors do not have inventory in their models
                        // Except your clone.
                        if (!skyrimPlatform_13.Actor.from(refr)) {
                            inventory_2.applyInventory(refr, model.inventory, false, true);
                        }
                    }
                    if (model.animation) {
                        if (model.animation.animEventName === "SkympFakeUnequip") {
                            forcedWeapDrawn = false;
                        }
                        else if (model.animation.animEventName === "SkympFakeEquip") {
                            forcedWeapDrawn = true;
                        }
                    }
                    if (model.movement) {
                        var ac = skyrimPlatform_13.Actor.from(refr);
                        if (ac) {
                            if (model.isHostedByOther !== this.wasHostedByOther) {
                                this.wasHostedByOther = model.isHostedByOther;
                                this.movState.lastApply = 0;
                                if (model.isHostedByOther) {
                                    animation_1.setDefaultAnimsDisabled(ac.getFormID(), true);
                                }
                                else {
                                    animation_1.setDefaultAnimsDisabled(ac.getFormID(), false);
                                }
                            }
                        }
                        // VOA: only rehost after long silence (was 1.5s/1s ??? animals flicker)
                        if (this.movState.lastApply &&
                            Date.now() - this.movState.lastApply > 8000) {
                            if (Date.now() - this.movState.lastRehost > 12000) {
                                this.movState.lastRehost = Date.now();
                                var remoteId = this.remoteRefrId;
                                if (ac && ac.is3DLoaded()) {
                                    tryHostIfNeed(ac, remoteId);
                                }
                            }
                        }
                        if (+model.numMovementChanges !==
                            this.movState.lastNumChanges ||
                            Date.now() - this.movState.lastApply > 2000) {
                            this.movState.lastApply = Date.now();
                            if (model.isHostedByOther || !this.movState.everApplied) {
                                var backup = model.movement.isWeapDrawn;
                                if (forcedWeapDrawn === true || forcedWeapDrawn === false) {
                                    model.movement.isWeapDrawn = forcedWeapDrawn;
                                }
                                try {
                                    movement_1.applyMovement(refr, model.movement);
                                    model.movement.isWeapDrawn = backup;
                                    this.movState.lastNumChanges = +model.numMovementChanges;
                                    this.movState.everApplied = true;
                                }
                                catch (eMov) {
                                    model.movement.isWeapDrawn = backup;
                                    // Stock SkyMP: cell mismatch ??? destroy FormView so next update respawns cleanly
                                    if (String(eMov).indexOf("needs to be respawned") !== -1) {
                                        this.destroy();
                                        this.refrId = 0;
                                        this.lookBasedBaseId = 0;
                                        this.ready = false;
                                        return;
                                    }
                                    throw eMov;
                                }
                            }
                            else {
                                if (ac)
                                    ac.clearKeepOffsetFromActor();
                                if (ac)
                                    sp.TESModPlatform.setWeaponDrawnMode(ac, -1);
                                // VOA: host attempts throttled inside tryHostIfNeed (no per-frame spam)
                                var remoteId2 = this.remoteRefrId;
                                if (ac && remoteId2 && ac.is3DLoaded())
                                    tryHostIfNeed(ac, remoteId2);
                            }
                        }
                    }
                    if (model.animation)
                        animation_1.applyAnimation(refr, model.animation, this.animState);
                    if (model.look) {
                        var actor = skyrimPlatform_13.Actor.from(refr);
                        if (actor && !gPcInJumpState) {
                            if (gPcWorldOrCellId) {
                                if (this.lastPcWorldOrCell &&
                                    gPcWorldOrCellId !== this.lastPcWorldOrCell) {
                                    // Redraw tints if PC world/cell changed
                                    this.isOnScreen = false;
                                }
                                this.lastPcWorldOrCell = gPcWorldOrCellId;
                            }
                            var headPos = [
                                skyrimPlatform_13.NetImmerse.getNodeWorldPositionX(actor, "NPC Head [Head]", false),
                                skyrimPlatform_13.NetImmerse.getNodeWorldPositionY(actor, "NPC Head [Head]", false),
                                skyrimPlatform_13.NetImmerse.getNodeWorldPositionZ(actor, "NPC Head [Head]", false),
                            ];
                            var screenPoint = skyrimPlatform_13.worldPointToScreenPoint(headPos)[0];
                            var isOnScreen = screenPoint[0] > 0 &&
                                screenPoint[1] > 0 &&
                                screenPoint[2] > 0 &&
                                screenPoint[0] < 1 &&
                                screenPoint[1] < 1 &&
                                screenPoint[2] < 1;
                            if (isOnScreen != this.isOnScreen) {
                                this.isOnScreen = isOnScreen;
                                if (isOnScreen) {
                                    actor.queueNiNodeUpdate();
                                    skyrimPlatform_13.Game.getPlayer().queueNiNodeUpdate();
                                }
                            }
                        }
                    }
                    if (model.equipment) {
                        var isShown = equipment_1.isBadMenuShown();
                        if (this.eqState.isBadMenuShown !== isShown) {
                            this.eqState.isBadMenuShown = isShown;
                            if (!isShown)
                                this.eqState.lastNumChanges = -1;
                        }
                        if (this.eqState.lastNumChanges !== model.equipment.numChanges) {
                            var ac = skyrimPlatform_13.Actor.from(refr);
                            // If we do not block inventory here, we will be able to reproduce the bug:
                            // 1. Place ~90 bots and force them to reequip iron swords to the left hand (rate should be ~50ms)
                            // 2. Open your inventory and reequip different items fast
                            // 3. After 1-2 minutes close your inventory and see that HUD disappeared
                            if (ac &&
                                !equipment_1.isBadMenuShown() &&
                                Date.now() - this.eqState.lastEqMoment > 500 &&
                                Date.now() - this.spawnMoment > -1 &&
                                this.spawnMoment > 0) {
                                //if (this.spawnMoment > 0 && Date.now() - this.spawnMoment > 5000) {
                                if (equipment_1.applyEquipment(ac, model.equipment)) {
                                    this.eqState.lastNumChanges = model.equipment.numChanges;
                                }
                                this.eqState.lastEqMoment = Date.now();
                                //}
                                //const res: boolean = applyEquipment(ac, model.equipment);
                                //if (res) this.eqState.lastNumChanges = model.equipment.numChanges;
                            }
                        }
                    }
                };
                FormView.prototype.getLookBasedBase = function () {
                    var base = skyrimPlatform_13.ActorBase.from(skyrimPlatform_13.Game.getFormEx(this.lookBasedBaseId));
                    if (!base && this.lookState.look) {
                        this.lookBasedBaseId = look_1.applyLook(this.lookState.look).getFormID();
                    }
                    return this.lookBasedBaseId;
                };
                FormView.prototype.getLocalRefrId = function () {
                    return this.refrId;
                };
                FormView.prototype.getRemoteRefrId = function () {
                    return this.remoteRefrId;
                };
                return FormView;
            }());
            exports_23("FormView", FormView);
            FormViewArray = /** @class */ (function () {
                function FormViewArray() {
                    this.formViews = new Array();
                }
                FormViewArray.prototype.updateForm = function (form, i) {
                    var view = this.formViews[i];
                    if (!view) {
                        this.formViews[i] = new FormView(form.refrId);
                    }
                    else {
                        view.update(form);
                    }
                };
                FormViewArray.prototype.destroyForm = function (i) {
                    if (!this.formViews[i])
                        return;
                    this.formViews[i].destroy();
                    this.formViews[i] = undefined;
                };
                FormViewArray.prototype.resize = function (newSize) {
                    if (this.formViews.length > newSize) {
                        this.formViews.slice(newSize).forEach(function (v) { return v && v.destroy(); });
                    }
                    this.formViews.length = newSize;
                };
                FormViewArray.prototype.updateAll = function (model, showMe, isCloneView) {
                    ctx._view = this;
                    var forms = model.forms;
                    var n = forms.length;
                    for (var i = 0; i < n; ++i) {
                        if (!forms[i] || (model.playerCharacterFormIdx === i && !showMe)) {
                            this.destroyForm(i);
                            continue;
                        }
                        var form = forms[i];
                        var realPos = undefined;
                        var offset = form.movement && (model.playerCharacterFormIdx === i || isCloneView);
                        if (offset) {
                            realPos = form.movement.pos;
                            form.movement.pos = [
                                realPos[0] + 128,
                                realPos[1] + 128,
                                realPos[2],
                            ];
                        }
                        if (isCloneView) {
                            // Prevent using the same refr by normal and clone views
                            if (!form.refrId || form.refrId >= 0xff000000) {
                                var backup = form.isHostedByOther;
                                form.isHostedByOther = true;
                                this.updateForm(form, i);
                                form.isHostedByOther = backup;
                            }
                        }
                        else {
                            ctx.i = i;
                            this.updateForm(form, i);
                        }
                        if (offset) {
                            form.movement.pos = realPos;
                        }
                    }
                };
                FormViewArray.prototype.getRemoteRefrId = function (clientsideRefrId) {
                    if (clientsideRefrId < 0xff000000)
                        throw new Error("This function is only for 0xff forms");
                    var formView = this.formViews.find(function (formView) {
                        return formView && formView.getLocalRefrId() === clientsideRefrId;
                    });
                    return formView ? formView.getRemoteRefrId() : 0;
                };
                FormViewArray.prototype.getLocalRefrId = function (remoteRefrId) {
                    if (remoteRefrId < 0xff000000)
                        throw new Error("This function is only for 0xff forms");
                    var formView = this.formViews.find(function (formView) {
                        return formView && formView.getRemoteRefrId() === remoteRefrId;
                    });
                    return formView ? formView.getLocalRefrId() : 0;
                };
                return FormViewArray;
            }());
            WorldView = /** @class */ (function () {
                function WorldView() {
                    var _this = this;
                    this.formViews = new FormViewArray();
                    this.cloneFormViews = new FormViewArray();
                    this.allowUpdate = false;
                    this.pcWorldOrCell = 0;
                    this.counter = false;
                    // Work around showRaceMenu issue
                    // Default nord in Race Menu will have very ugly face
                    // If other players are spawning when we show this menu
                    skyrimPlatform_13.on("update", function () {
                        var pc = skyrimPlatform_13.Game.getPlayer();
                        var pcWorldOrCell = (pc.getWorldSpace() || pc.getParentCell()).getFormID();
                        if (_this.pcWorldOrCell !== pcWorldOrCell) {
                            if (_this.pcWorldOrCell) {
                                // VOA: remember local cell leave so stale server Teleports
                                // cannot yank us back into the interior we just exited.
                                try {
                                    skyrimPlatform_13.storage["voaLastCellLeave"] = {
                                        from: _this.pcWorldOrCell,
                                        to: pcWorldOrCell,
                                        at: Date.now(),
                                    };
                                    var pend = skyrimPlatform_13.storage["voaPendingTeleport"];
                                    if (pend && !pend.done && Number(pend.worldOrCell) === _this.pcWorldOrCell) {
                                        pend.done = true;
                                        skyrimPlatform_13.storage["voaPendingTeleport"] = null;
                                        skyrimPlatform_13.printConsole(
                                            "VOA: cancelled pending TP to " +
                                                _this.pcWorldOrCell.toString(16) +
                                                " (local cell leave -> " +
                                                pcWorldOrCell.toString(16) +
                                                ")"
                                        );
                                    }
                                }
                                catch (eLeave) { /* ignore */ }
                                skyrimPlatform_13.printConsole("Reset all form views");
                                _this.formViews.resize(0);
                                _this.cloneFormViews.resize(0);
                            }
                            _this.pcWorldOrCell = pcWorldOrCell;
                        }
                    });
                    skyrimPlatform_13.once("update", function () {
                        // Wait 1s game time (time spent in Race Menu isn't counted)
                        skyrimPlatform_13.Utility.wait(1).then(function () {
                            _this.allowUpdate = true;
                            skyrimPlatform_13.printConsole("Update is now allowed"); try { skyrimPlatform_13.storage["voaChatUiAllowed"] = true; } catch (eChatUi) {}
                        });
                    });
                }
                WorldView.prototype.getRemoteRefrId = function (clientsideRefrId) {
                    return this.formViews.getRemoteRefrId(clientsideRefrId);
                };
                WorldView.prototype.getLocalRefrId = function (remoteRefrId) {
                    return this.formViews.getLocalRefrId(remoteRefrId);
                };
                WorldView.prototype.update = function (model) {
                    if (!this.allowUpdate)
                        return;
                    // Skip 50% of updates
                    this.counter = !this.counter;
                    if (this.counter)
                        return;
                    this.formViews.resize(model.forms.length);
                    var showMe = skyrimPlatform_13.settings["skymp5-client"]["show-me"];
                    var showClones = skyrimPlatform_13.settings["skymp5-client"]["show-clones"];
                    var crosshair = skyrimPlatform_13.Game.getCurrentCrosshairRef();
                    gCrosshairRefId = crosshair ? crosshair.getFormID() : 0;
                    gPcInJumpState = skyrimPlatform_13.Game.getPlayer().getAnimationVariableBool("bInJumpState");
                    var pcWorldOrCell = skyrimPlatform_13.Game.getPlayer().getWorldSpace() ||
                        skyrimPlatform_13.Game.getPlayer().getParentCell();
                    gPcWorldOrCellId = pcWorldOrCell ? pcWorldOrCell.getFormID() : 0;
                    this.formViews.updateAll(model, showMe, false);
                    if (showClones) {
                        this.cloneFormViews.updateAll(model, false, true);
                    }
                    else {
                        this.cloneFormViews.resize(0);
                    }
                };
                WorldView.prototype.destroy = function () {
                    this.formViews.resize(0);
                };
                return WorldView;
            }());
            exports_23("WorldView", WorldView);
            exports_23("getViewFromStorage", getViewFromStorage = function () {
                var res = skyrimPlatform_13.storage.view;
                if (typeof res === "object")
                    return res;
                return undefined;
            });
            exports_23("localIdToRemoteId", localIdToRemoteId = function (localFormId) {
                if (localFormId >= 0xff000000) {
                    var view = getViewFromStorage();
                    if (!view)
                        return 0;
                    localFormId = view.getRemoteRefrId(localFormId);
                    if (!localFormId)
                        return 0;
                    // serverside ids are 64bit
                    if (localFormId >= 0x100000000) {
                        localFormId -= 0x100000000;
                    }
                }
                return localFormId;
            });
            exports_23("remoteIdToLocalId", remoteIdToLocalId = function (remoteFormId) {
                if (remoteFormId >= 0xff000000) {
                    var view = getViewFromStorage();
                    if (!view)
                        return 0;
                    remoteFormId = view.getLocalRefrId(remoteFormId);
                    if (!remoteFormId)
                        return 0;
                }
                return remoteFormId;
            });
        }
    };
});
System.register("skymp5-client/src/front/msgHandler", [], function (exports_24, context_24) {
    "use strict";
    var __moduleName = context_24 && context_24.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/modelSource", [], function (exports_25, context_25) {
    "use strict";
    var __moduleName = context_25 && context_25.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/networking", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_26, context_26) {
    "use strict";
    var skyrimPlatform_14, sp, handlersMap, lastHostname, lastPort, createClientSafe, connect, close, on, send, reconnect;
    var __moduleName = context_26 && context_26.id;
    return {
        setters: [
            function (skyrimPlatform_14_1) {
                skyrimPlatform_14 = skyrimPlatform_14_1;
                sp = skyrimPlatform_14_1;
            }
        ],
        execute: function () {
            handlersMap = new Map();
            lastHostname = "";
            lastPort = 0;
            createClientSafe = function (hostname, port) {
                sp.printConsole("createClientSafe " + hostname + ":" + port);
                // VOA: use the port argument (not only lastPort) so first connect always fires
                if (hostname !== "" && port !== 0) {
                    try {
                        skyrimPlatform_14.mpClientPlugin.destroyClient();
                    }
                    catch (e) { }
                    skyrimPlatform_14.mpClientPlugin.createClient(hostname, port);
                }
            };
            sp.on("tick", function () {
                // VOA: wrap native tick ??? MpClientPlugin can throw nlohmann
                // [json.exception.out_of_range.403] key 'refrId' not found when the server
                // emits UpdateProperty without refrId (door isOpen). Without this catch,
                // door traffic can leave the client in a bad state.
                try {
                    skyrimPlatform_14.mpClientPlugin.tick(function (packetType, jsonContent, error) {
                        var handlers = handlersMap.get(packetType) || [];
                        handlers.forEach(function (handler) {
                            try {
                                var parse = function () {
                                    try {
                                        return JSON.parse(jsonContent);
                                    }
                                    catch (e) {
                                        var preview = (jsonContent && jsonContent.length > 180) ? (jsonContent.slice(0, 180) + "???") : jsonContent;
                                        skyrimPlatform_14.printConsole("VOA: bad packet JSON (" + packetType + "): " + e + " body=" + preview);
                                        return null;
                                    }
                                };
                                if (!jsonContent || !jsonContent.length) {
                                    handler(error);
                                    return;
                                }
                                var parsed = parse();
                                if (parsed)
                                    handler(parsed);
                            }
                            catch (eTick) {
                                try {
                                    skyrimPlatform_14.printConsole("VOA: packet handler error: " + eTick);
                                }
                                catch (e2) { /* ignore */ }
                            }
                        });
                    });
                }
                catch (eNativeTick) {
                    try {
                        var nowT = Date.now();
                        if (!sp._voaLastTickErr || nowT - sp._voaLastTickErr > 3000) {
                            sp._voaLastTickErr = nowT;
                            skyrimPlatform_14.printConsole("VOA: mpClientPlugin.tick threw: " + eNativeTick);
                        }
                    }
                    catch (_t) { /* ignore */ }
                }
            });
            exports_26("connect", connect = function (hostname, port) {
                lastHostname = hostname;
                lastPort = port;
                createClientSafe(hostname, port);
            });
            exports_26("close", close = function () {
                skyrimPlatform_14.mpClientPlugin.destroyClient();
            });
            exports_26("on", on = function (packetType, handler) {
                var arr = handlersMap.get(packetType);
                arr = (arr ? arr : []).concat([handler]);
                handlersMap.set(packetType, arr);
            });
            // VOA: force strings safe for server simdjson (rejects invalid UTF-8 Ã¢â€ â€™ tick error Ã¢â€ â€™ disconnect).
            var voaSafeString = function (s) {
                s = String(s == null ? "" : s);
                var out = "";
                for (var i = 0; i < s.length; i++) {
                    var c = s.charCodeAt(i);
                    // Valid surrogate pair
                    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
                        var c2 = s.charCodeAt(i + 1);
                        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
                            out += s.charAt(i) + s.charAt(i + 1);
                            i++;
                            continue;
                        }
                        out += "?";
                        continue;
                    }
                    // Lone surrogates / C0 controls (except tab/lf/cr)
                    if (c >= 0xd800 && c <= 0xdfff) {
                        out += "?";
                        continue;
                    }
                    if (c < 0x09 || (c > 0x0d && c < 0x20) || c === 0x7f) {
                        continue;
                    }
                    out += s.charAt(i);
                }
                // Cap runaway strings (texture paths / names)
                if (out.length > 512)
                    out = out.slice(0, 512);
                return out;
            };
            var voaSanitizeMsg = function (v, depth) {
                if (depth > 12)
                    return null;
                if (v == null)
                    return v;
                var t = typeof v;
                if (t === "string")
                    return voaSafeString(v);
                if (t === "number")
                    return isFinite(v) ? v : 0;
                if (t === "boolean")
                    return v;
                if (t === "function" || t === "undefined")
                    return undefined;
                if (Array.isArray(v)) {
                    var arr = [];
                    for (var i = 0; i < v.length; i++) {
                        var el = voaSanitizeMsg(v[i], depth + 1);
                        if (el !== undefined)
                            arr.push(el);
                    }
                    return arr;
                }
                if (t === "object") {
                    var o = {};
                    for (var k in v) {
                        if (!Object.prototype.hasOwnProperty.call(v, k))
                            continue;
                        // Client-only bookkeeping Ã¢â‚¬â€ never send to server
                        if (k === "_refrId" || k === "_voa" || k.charAt(0) === "$")
                            continue;
                        // Inventory display names crash simdjson when non-UTF-8
                        if (k === "name" && v.baseId != null)
                            continue;
                        var sv = voaSanitizeMsg(v[k], depth + 1);
                        if (sv !== undefined)
                            o[k] = sv;
                    }
                    return o;
                }
                return undefined;
            };
            exports_26("send", send = function (msg, reliable) {
                // VOA last-mile: rebuild UpdateMovement as a plain object so MpClientPlugin
                // never throws [json.exception.out_of_range.403] key 'isDead' not found.
                // Mutating the original msg was not reliable under Chakra (host thrash / animal flicker).
                try {
                    var tNum = msg && (typeof msg.t === "number" ? msg.t : parseInt(msg.t, 10));
                    if (msg && tNum === 2) {
                        var src = (msg.data && typeof msg.data === "object") ? msg.data : {};
                        var pos = (Array.isArray(src.pos) && src.pos.length >= 3)
                            ? [Number(src.pos[0]) || 0, Number(src.pos[1]) || 0, Number(src.pos[2]) || 0]
                            : [0, 0, 0];
                        var rot = (Array.isArray(src.rot) && src.rot.length >= 3)
                            ? [Number(src.rot[0]) || 0, Number(src.rot[1]) || 0, Number(src.rot[2]) || 0]
                            : [0, 0, 0];
                        var dataOut = {
                            worldOrCell: Number(src.worldOrCell) || 0,
                            pos: pos,
                            rot: rot,
                            runMode: (typeof src.runMode === "string" && src.runMode) ? src.runMode : "Standing",
                            direction: typeof src.direction === "number" && !isNaN(src.direction) ? src.direction : 0,
                            healthPercentage: typeof src.healthPercentage === "number" && !isNaN(src.healthPercentage) ? src.healthPercentage : 1,
                            speed: typeof src.speed === "number" && !isNaN(src.speed) ? src.speed : 0,
                            isInJumpState: src.isInJumpState === true,
                            isSneaking: src.isSneaking === true,
                            isBlocking: src.isBlocking === true,
                            isWeapDrawn: src.isWeapDrawn === true,
                            isDead: src.isDead === true,
                        };
                        if (Array.isArray(src.lookAt) && src.lookAt.length >= 3) {
                            dataOut.lookAt = [
                                Number(src.lookAt[0]) || 0,
                                Number(src.lookAt[1]) || 0,
                                Number(src.lookAt[2]) || 0,
                            ];
                        }
                        msg = {
                            t: 2,
                            idx: typeof msg.idx === "number" ? msg.idx : Number(msg.idx) || 0,
                            data: dataOut,
                        };
                    }
                    // VOA: rebuild Activate so data is always complete (doors / containers).
                    if (msg && tNum === 6) {
                        var aSrc = (msg.data && typeof msg.data === "object") ? msg.data : {};
                        var actiOut = {
                            t: 6,
                            data: {
                                caster: Number(aSrc.caster) || 0,
                                target: Number(aSrc.target) || 0,
                                isSecondActivation: aSrc.isSecondActivation === true,
                            },
                        };
                        if (typeof msg.idx === "number" || (msg.idx != null && msg.idx !== "")) {
                            actiOut.idx = typeof msg.idx === "number" ? msg.idx : Number(msg.idx) || 0;
                        }
                        msg = actiOut;
                    }
                }
                catch (_s) { /* ignore */ }
                // Sanitize ALL outbound JSON so server simdjson never sees bad UTF-8 / broken structure
                try {
                    msg = voaSanitizeMsg(msg, 0);
                }
                catch (_san) { /* keep msg */ }
                var payload;
                try {
                    payload = JSON.stringify(msg);
                }
                catch (eJs) {
                    try {
                        skyrimPlatform_14.printConsole("VOA: JSON.stringify failed t=" + (msg && msg.t) + " " + eJs);
                    }
                    catch (_e0) { /* ignore */ }
                    return;
                }
                // Never ship empty / non-object JSON
                if (!payload || payload.charAt(0) !== "{") {
                    try {
                        skyrimPlatform_14.printConsole("VOA: drop non-object packet");
                    }
                    catch (_e1) { /* ignore */ }
                    return;
                }
                try {
                    skyrimPlatform_14.mpClientPlugin.send(payload, reliable);
                }
                catch (eSend) {
                    // Native MpClientPlugin can throw nlohmann out_of_range (e.g. missing keys).
                    // Swallow so one bad packet (door Activate / property echo) never freezes input.
                    try {
                        var nowS = Date.now();
                        if (!send._voaLastSendErr || nowS - send._voaLastSendErr > 2000) {
                            send._voaLastSendErr = nowS;
                            skyrimPlatform_14.printConsole("VOA: mpClientPlugin.send threw: " + eSend + " t=" + (msg && msg.t));
                        }
                    }
                    catch (_e2) { /* ignore */ }
                }
            });
            // Reconnect with backoff ??? tight reconnect loops freeze Skyrim (black screen / unresponsive)
            var reconnectAttempts = 0;
            var reconnectTimer = 0;
            var maxReconnectAttempts = 8;
            exports_26("reconnect", reconnect = function () {
                if (!lastHostname)
                    return;
                if (reconnectAttempts >= maxReconnectAttempts) {
                    skyrimPlatform_14.printConsole("VOA: stopped reconnecting after " + maxReconnectAttempts + " attempts ??? check server/session/settings");
                    return;
                }
                var now = Date.now();
                var waitMs = Math.min(15000, 2000 * Math.pow(1.5, reconnectAttempts));
                if (reconnectTimer && now < reconnectTimer) {
                    return;
                }
                reconnectTimer = now + waitMs;
                reconnectAttempts++;
                skyrimPlatform_14.printConsole("VOA: reconnect attempt " + reconnectAttempts + "/" + maxReconnectAttempts + " in " + Math.round(waitMs) + "ms");
                // Delay via tick (safe on main menu; no Papyrus wait required)
                var start = Date.now();
                var id = skyrimPlatform_14.on("tick", function () {
                    if (Date.now() - start < waitMs)
                        return;
                    try {
                        skyrimPlatform_14.unsubscribe(id);
                    }
                    catch (_u) { /* ignore */ }
                    createClientSafe(lastHostname, lastPort);
                });
            });
            on("connectionFailed", function () {
                skyrimPlatform_14.printConsole("VOA: connectionFailed");
                reconnect();
            });
            on("connectionDenied", function () {
                skyrimPlatform_14.printConsole("VOA: connectionDenied");
                reconnect();
            });
            on("connectionAccepted", function () {
                reconnectAttempts = 0;
                reconnectTimer = 0;
            });
            // VOA: on disconnect, attempt reconnect (character is also flushed by SkympClient).
            // Previously this was a no-op, which forced main-menu after any brief drop.
            on("disconnect", function () {
                try {
                    skyrimPlatform_14.printConsole("VOA: net disconnect — scheduling reconnect");
                }
                catch (e0) { /* ignore */ }
                reconnect();
            });
            // Expose for RemoteServer handleDisconnect
            try {
                skyrimPlatform_14.storage._voaReconnect = reconnect;
            }
            catch (eR) { /* ignore */ }
        }
    };
});
System.register("skymp5-client/src/front/sendTarget", [], function (exports_27, context_27) {
    "use strict";
    var __moduleName = context_27 && context_27.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/loadGameManager", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_28, context_28) {
    "use strict";
    var sp, isCausedBySkyrimPlatform, addLoadGameListener, loadGame;
    var __moduleName = context_28 && context_28.id;
    return {
        setters: [
            function (sp_1) {
                sp = sp_1;
            }
        ],
        execute: function () {
            isCausedBySkyrimPlatform = false;
            exports_28("addLoadGameListener", addLoadGameListener = function (onGameLoad) {
                sp.on("loadGame", function () {
                    var causedByUs = isCausedBySkyrimPlatform;
                    try {
                        onGameLoad({ isCausedBySkyrimPlatform: causedByUs });
                    }
                    catch (e) {
                        // VOA: keep flag longer so delayed loadGame still counts as SP-caused
                        sp.once("update", function () {
                            sp.once("update", function () {
                                isCausedBySkyrimPlatform = false;
                            });
                        });
                        throw e;
                    }
                    // VOA: race menu/spawn loadGame can fire after several frames; don't clear same tick
                    sp.once("update", function () {
                        sp.once("update", function () {
                            sp.once("update", function () {
                                isCausedBySkyrimPlatform = false;
                            });
                        });
                    });
                });
            });
            exports_28("loadGame", loadGame = function (pos, rot, worldOrCell, changeFormNpc) {
                isCausedBySkyrimPlatform = true;
                sp.loadGame(pos, rot, worldOrCell, changeFormNpc);
            });
        }
    };
});
System.register("skymp5-client/src/lib/idManager", [], function (exports_29, context_29) {
    "use strict";
    var IdManager;
    var __moduleName = context_29 && context_29.id;
    return {
        setters: [],
        execute: function () {
            IdManager = /** @class */ (function () {
                function IdManager() {
                    this.idByValue = new Array();
                    this.valueById = new Array();
                    this.minimumUnusedId = 0;
                }
                IdManager.prototype.allocateIdFor = function (value) {
                    if (this.idByValue.length <= value) {
                        this.idByValue.length = value + 1;
                    }
                    this.idByValue[value] = this.minimumUnusedId;
                    if (this.valueById.length <= this.minimumUnusedId) {
                        this.valueById.length = this.minimumUnusedId + 1;
                    }
                    this.valueById[this.minimumUnusedId] = value;
                    var res = this.minimumUnusedId;
                    this.minimumUnusedId++;
                    while (this.valueById.length > this.minimumUnusedId &&
                        typeof this.valueById[this.minimumUnusedId] === "number") {
                        this.minimumUnusedId++;
                    }
                    return res;
                };
                IdManager.prototype.freeIdFor = function (value) {
                    var id = this.idByValue[value];
                    if (id < this.minimumUnusedId) {
                        this.minimumUnusedId = id;
                    }
                    this.idByValue[value] = undefined;
                    this.valueById[id] = undefined;
                    return;
                };
                IdManager.prototype.getId = function (value) {
                    var r = this.idByValue[value];
                    return typeof r === "number" ? r : -1;
                };
                IdManager.prototype.getValueById = function (id) {
                    return this.valueById[id];
                };
                return IdManager;
            }());
            exports_29("IdManager", IdManager);
        }
    };
});
System.register("skymp5-client/src/front/updateOwner", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/view"], function (exports_30, context_30) {
    "use strict";
    var sp, view, setOwnerModel, setup;
    var __moduleName = context_30 && context_30.id;
    return {
        setters: [
            function (sp_2) {
                sp = sp_2;
            },
            function (view_1) {
                view = view_1;
            }
        ],
        execute: function () {
            exports_30("setOwnerModel", setOwnerModel = function (ownerModel) {
                sp.storage["ownerModel"] = ownerModel;
                sp.storage["ownerModelSet"] = true;
            });
            exports_30("setup", setup = function () {
                var ctx = {
                    sp: sp,
                    refr: undefined,
                    value: undefined,
                    _model: undefined,
                    getFormIdInServerFormat: function (clientsideFormId) {
                        return view.localIdToRemoteId(clientsideFormId);
                    },
                    getFormIdInClientFormat: function (serversideFormId) {
                        return view.remoteIdToLocalId(serversideFormId);
                    },
                    get: function (propName) {
                        return this._model[propName];
                    },
                    state: {},
                };
                sp.on("update", function () {
                    var keys = sp.storage["updateOwnerFunctions_keys"];
                    if (!keys || !Array.isArray(keys)) {
                        keys = [];
                    }
                    var funcs = sp.storage["updateOwnerFunctions"];
                    if (sp.storage["ownerModelSet"] !== true)
                        return;
                    var ownerModel = sp.storage["ownerModel"];
                    for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
                        var propName = keys_1[_i];
                        var f = funcs[propName];
                        // Actually, must always be a valid funciton, but who knows
                        if (!f)
                            continue;
                        ctx._model = ownerModel;
                        if (!ctx._model)
                            continue;
                        ctx.value = ctx._model[propName];
                        if (ctx.value === undefined)
                            continue;
                        ctx.refr = sp.ObjectReference.from(sp.Game.getPlayer());
                        ctx._model = ownerModel;
                        try {
                            if (f)
                                f(ctx);
                        }
                        catch (e) {
                            sp.printConsole("'updateOwner." + propName + "' - ", e);
                        }
                    }
                });
            });
        }
    };
});
System.register("skymp5-client/src/front/components/actorvalues", [], function (exports_31, context_31) {
    "use strict";
    var getActorValues, setActorValuePercentage;
    var __moduleName = context_31 && context_31.id;
    return {
        setters: [],
        execute: function () {
            exports_31("getActorValues", getActorValues = function (ac) {
                if (!ac)
                    return { health: 0, stamina: 0, magicka: 0 };
                var healthPercentage = (ac.isDead()) ? 0 : ac.getActorValuePercentage("health");
                var staminaPercentage = ac.getActorValuePercentage("stamina");
                var magickaPercentage = ac.getActorValuePercentage("magicka");
                var resultActorValue = {
                    health: healthPercentage,
                    stamina: staminaPercentage,
                    magicka: magickaPercentage,
                };
                return resultActorValue;
            });
            exports_31("setActorValuePercentage", setActorValuePercentage = function (ac, avName, percentage) {
                var currentPercentage = ac.getActorValuePercentage(avName);
                if (currentPercentage === percentage)
                    return;
                var currentMax = ac.getBaseActorValue(avName);
                if (!currentMax || currentMax <= 0)
                    currentMax = 100;
                var deltaPercentage = percentage - currentPercentage;
                var amount = Math.abs(deltaPercentage * currentMax);
                if (deltaPercentage > 0) {
                    ac.restoreActorValue(avName, amount);
                }
                else if (deltaPercentage < 0) {
                    // damageActorValue expects a positive damage amount
                    ac.damageActorValue(avName, amount);
                }
            });
        }
    };
});
System.register("skymp5-client/src/front/remoteServer", ["skymp5-client/src/front/networking", "skymp5-client/src/front/messages", "build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/loadGameManager", "skymp5-client/src/front/components/inventory", "skymp5-client/src/front/components/equipment", "skymp5-client/src/lib/idManager", "skymp5-client/src/front/components/look", "skymp5-client/src/front/spSnippet", "skymp5-client/src/front/view", "skymp5-client/src/front/updateOwner", "skymp5-client/src/front/components/actorvalues"], function (exports_32, context_32) {
    "use strict";
    var networking, messages, skyrimPlatform_15, loadGameManager, inventory_3, equipment_2, idManager_1, look_2, spSnippet, sp, view_2, updateOwner, actorvalues_1, setupEventSource, maxVerifyDelayDefault, verifyStartMoment, loggingStartMoment, maxVerifyDelay, loginAttempted, SpawnTask, sendBrowserToken, verifySourceCode, loginWithSkympIoCredentials, taskVerifySourceCode, getPcInventory, setPcInventory, pcInvLastApply, RemoteServer;
    var __moduleName = context_32 && context_32.id;
    return {
        setters: [
            function (networking_1) {
                networking = networking_1;
            },
            function (messages_2) {
                messages = messages_2;
            },
            function (skyrimPlatform_15_1) {
                skyrimPlatform_15 = skyrimPlatform_15_1;
                sp = skyrimPlatform_15_1;
            },
            function (loadGameManager_1) {
                loadGameManager = loadGameManager_1;
            },
            function (inventory_3_1) {
                inventory_3 = inventory_3_1;
            },
            function (equipment_2_1) {
                equipment_2 = equipment_2_1;
            },
            function (idManager_1_1) {
                idManager_1 = idManager_1_1;
            },
            function (look_2_1) {
                look_2 = look_2_1;
            },
            function (spSnippet_1) {
                spSnippet = spSnippet_1;
            },
            function (view_2_1) {
                view_2 = view_2_1;
            },
            function (updateOwner_1) {
                updateOwner = updateOwner_1;
            },
            function (actorvalues_1_1) {
                actorvalues_1 = actorvalues_1_1;
            }
        ],
        execute: function () {
            //
            // eventSource system
            //
            setupEventSource = function (ctx) {
                skyrimPlatform_15.once("update", function () {
                    try {
                        ctx._fn(ctx);
                        skyrimPlatform_15.printConsole("'eventSources." + ctx._eventName + "' - Added");
                    }
                    catch (e) {
                        skyrimPlatform_15.printConsole("'eventSources." + ctx._eventName + "' -", e);
                    }
                });
            };
            // Handle hot reload for eventSoucres
            if (Array.isArray(skyrimPlatform_15.storage["eventSourceContexts"])) {
                skyrimPlatform_15.storage["eventSourceContexts"] = skyrimPlatform_15.storage["eventSourceContexts"].filter(function (ctx) { return !ctx._expired; });
                skyrimPlatform_15.storage["eventSourceContexts"].forEach(function (ctx) {
                    setupEventSource(ctx);
                });
            }
            //
            //
            //
            maxVerifyDelayDefault = 3000;
            verifyStartMoment = 0;
            loggingStartMoment = 0;
            maxVerifyDelay = maxVerifyDelayDefault;
            loginAttempted = false;
            skyrimPlatform_15.on("tick", function () {
                var maxLoggingDelay = 90000;
                // VOA: if server is slow/recovering, skip verify and login with session instead of reconnect storm
                if (verifyStartMoment && Date.now() - verifyStartMoment > maxVerifyDelay) {
                    skyrimPlatform_15.printConsole("VOA: verify timeout ??? logging in with session credentials");
                    verifyStartMoment = 0;
                    maxVerifyDelay = maxVerifyDelayDefault;
                    try {
                        loginWithSkympIoCredentials();
                    }
                    catch (e) {
                        skyrimPlatform_15.printConsole("VOA: login after verify timeout failed: " + e);
                        networking.reconnect();
                    }
                }
                if (loggingStartMoment && Date.now() - loggingStartMoment > maxLoggingDelay) {
                    skyrimPlatform_15.printConsole("VOA: login timed out ??? will retry with backoff (not immediate reconnect)");
                    loggingStartMoment = 0;
                    loginAttempted = false;
                    try { skyrimPlatform_15.storage["voaLoggingIn"] = 0; } catch (eClr) { /* ignore */ }
                    networking.reconnect();
                }
            });
            SpawnTask = /** @class */ (function () {
                function SpawnTask() {
                    this.running = false;
                }
                return SpawnTask;
            }());
            sendBrowserToken = function () {
                networking.send({
                    t: messages.MsgType.CustomPacket,
                    content: {
                        customPacketType: "browserToken",
                        token: skyrimPlatform_15.browser.getToken(),
                    },
                }, true);
            };
            verifySourceCode = function () {
                verifyStartMoment = Date.now();
                var src = skyrimPlatform_15.getPluginSourceCode("skymp5-client");
                skyrimPlatform_15.printConsole("Verifying current source code (" + src.length + " bytes)");
                networking.send({
                    t: messages.MsgType.CustomPacket,
                    content: {
                        customPacketType: "clientVersion",
                        src: src,
                    },
                }, true);
            };
            loginWithSkympIoCredentials = function () {
                if (loginAttempted && loggingStartMoment) {
                    skyrimPlatform_15.printConsole("VOA: login already in flight ??? skip duplicate");
                    return;
                }
                loginAttempted = true;
                loggingStartMoment = Date.now();
                try {
                    skyrimPlatform_15.storage["voaLoggingIn"] = loggingStartMoment;
                }
                catch (eSt) { /* ignore */ }
                var gd = null;
                try {
                    gd = skyrimPlatform_15.settings["skymp5-client"]["gameData"];
                }
                catch (eGd) { gd = null; }
                skyrimPlatform_15.printConsole("Logging in as skymp.io user profileId=" + (gd && gd.profileId));
                networking.send({
                    t: messages.MsgType.CustomPacket,
                    content: {
                        customPacketType: "loginWithSkympIo",
                        gameData: gd,
                    },
                }, true);
            };
            taskVerifySourceCode = function () {
                skyrimPlatform_15.storage["taskVerifySourceCode"] = true;
            };
            if (skyrimPlatform_15.storage["taskVerifySourceCode"] === true) {
                skyrimPlatform_15.once("tick", function () {
                    verifySourceCode();
                });
                skyrimPlatform_15.storage["taskVerifySourceCode"] = false;
            }
            exports_32("getPcInventory", getPcInventory = function () {
                var res = skyrimPlatform_15.storage["pcInv"];
                if (typeof res === "object" && res["entries"]) {
                    return res;
                }
                return null;
            });
            setPcInventory = function (inv) {
                skyrimPlatform_15.storage["pcInv"] = inv;
            };
            pcInvLastApply = 0;
            skyrimPlatform_15.on("update", function () {
                if (equipment_2.isBadMenuShown())
                    return;
                if (Date.now() - pcInvLastApply > 5000) {
                    pcInvLastApply = Date.now();
                    var pcInv = getPcInventory();
                    if (pcInv)
                        inventory_3.applyInventory(skyrimPlatform_15.Game.getPlayer(), pcInv, false, true);
                }
            });
            RemoteServer = /** @class */ (function () {
                function RemoteServer() {
                    this.worldModel = { forms: [], playerCharacterFormIdx: -1 };
                    this.idManager_ = new idManager_1.IdManager();
                }
                RemoteServer.prototype.setInventory = function (msg) {
                    skyrimPlatform_15.once("update", function () {
                        setPcInventory(msg.inventory);
                        pcInvLastApply = 0;
                    });
                };
                RemoteServer.prototype.openContainer = function (msg) {
                    var _this = this;
                    skyrimPlatform_15.once("update", function () { return __awaiter(_this, void 0, void 0, function () {
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, skyrimPlatform_15.Utility.wait(0.1)];
                                case 1:
                                    _a.sent(); // Give a chance to update inventory
                                    skyrimPlatform_15.ObjectReference.from(skyrimPlatform_15.Game.getFormEx(msg.target)).activate(skyrimPlatform_15.Game.getPlayer(), true);
                                    (function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0:
                                                    if (!!skyrimPlatform_15.Ui.isMenuOpen("ContainerMenu")) return [3 /*break*/, 2];
                                                    return [4 /*yield*/, skyrimPlatform_15.Utility.wait(0.1)];
                                                case 1:
                                                    _a.sent();
                                                    return [3 /*break*/, 0];
                                                case 2:
                                                    if (!skyrimPlatform_15.Ui.isMenuOpen("ContainerMenu")) return [3 /*break*/, 4];
                                                    return [4 /*yield*/, skyrimPlatform_15.Utility.wait(0.1)];
                                                case 3:
                                                    _a.sent();
                                                    return [3 /*break*/, 2];
                                                case 4:
                                                    networking.send({
                                                        t: messages.MsgType.Activate,
                                                        data: {
                                                            caster: 0x14,
                                                            target: msg.target,
                                                            isSecondActivation: false,
                                                        },
                                                    }, true);
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); })();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                };
                // VOA: reliable door/cell teleports ??? once("update") dies during Loading Menu.
                // Queue pending TP and re-apply via loadGame / moveRefr with retries until cell matches.
                var applyVoaPendingTeleport = function (reason) {
                    try {
                        var tp = skyrimPlatform_15.storage["voaPendingTeleport"];
                        if (!tp || tp.done)
                            return;
                        if (Date.now() - tp.at > 25000) {
                            skyrimPlatform_15.printConsole("VOA: teleport expired after 25s");
                            skyrimPlatform_15.storage["voaPendingTeleport"] = null;
                            return;
                        }
                        // Don't thrash while loading menu is open (except first attempt)
                        try {
                            if (tp.tries > 0 && skyrimPlatform_15.Ui.isMenuOpen("Loading Menu"))
                                return;
                        }
                        catch (eL) { /* ignore */ }
                        var now = Date.now();
                        if (tp.lastTryAt && now - tp.lastTryAt < 400)
                            return;
                        tp.lastTryAt = now;
                        tp.tries = (tp.tries || 0) + 1;
                        var player = skyrimPlatform_15.Game.getPlayer();
                        if (!player)
                            return;
                        var curWoc = 0;
                        try {
                            var woc = player.getWorldSpace() || player.getParentCell();
                            curWoc = woc ? woc.getFormID() : 0;
                        }
                        catch (eW) { /* ignore */ }
                        var targetWoc = Number(tp.worldOrCell) || 0;
                        var dx = player.getPositionX() - tp.pos[0];
                        var dy = player.getPositionY() - tp.pos[1];
                        var dz = player.getPositionZ() - tp.pos[2];
                        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (curWoc === targetWoc && dist < 256) {
                            try {
                                player.setAngle(tp.rot[0], tp.rot[1], tp.rot[2]);
                            }
                            catch (eA) { /* ignore */ }
                            tp.done = true;
                            tp.completedAt = Date.now();
                            // Keep brief record for coalesce (don't wipe worldOrCell identity)
                            skyrimPlatform_15.storage["voaPendingTeleport"] = tp;
                            skyrimPlatform_15.printConsole(
                                "VOA: teleport complete try=" +
                                    tp.tries +
                                    " reason=" +
                                    reason +
                                    " cell=" +
                                    targetWoc.toString(16)
                            );
                            return;
                        }
                        skyrimPlatform_15.printConsole("VOA: teleport apply try=" + tp.tries + " reason=" + reason +
                            " cur=" + curWoc.toString(16) + " -> " + targetWoc.toString(16) + " dist=" + Math.round(dist));
                        // Cross-cell: loadGame is reliable; same-cell: moveRefr is enough
                        var needLoad = (curWoc !== targetWoc) || tp.tries <= 2 || tp.forceLoad;
                        if (needLoad) {
                            try {
                                loadGameManager.loadGame(tp.pos, tp.rot, targetWoc);
                                tp.forceLoad = false;
                            }
                            catch (eLg) {
                                skyrimPlatform_15.printConsole("VOA: loadGame teleport failed: " + eLg);
                                needLoad = false;
                            }
                        }
                        if (!needLoad || tp.tries > 1) {
                            try {
                                skyrimPlatform_15.TESModPlatform.moveRefrToPosition(player, skyrimPlatform_15.Cell.from(skyrimPlatform_15.Game.getFormEx(targetWoc)), skyrimPlatform_15.WorldSpace.from(skyrimPlatform_15.Game.getFormEx(targetWoc)), tp.pos[0], tp.pos[1], tp.pos[2], tp.rot[0], tp.rot[1], tp.rot[2]);
                            }
                            catch (eMv) {
                                skyrimPlatform_15.printConsole("VOA: moveRefr teleport failed: " + eMv);
                            }
                        }
                        try {
                            player.setAngle(tp.rot[0], tp.rot[1], tp.rot[2]);
                        }
                        catch (eA2) { /* ignore */ }
                    }
                    catch (eAll) {
                        try {
                            skyrimPlatform_15.printConsole("VOA: applyPendingTeleport err " + eAll);
                        }
                        catch (e2) { /* ignore */ }
                    }
                };
                // Retry pending door/cell teleports every update (throttled inside)
                if (!skyrimPlatform_15.storage["voaTpRetryHooked"]) {
                    skyrimPlatform_15.storage["voaTpRetryHooked"] = true;
                    skyrimPlatform_15.on("update", function () {
                        applyVoaPendingTeleport("update");
                    });
                    try {
                        skyrimPlatform_15.on("menuClose", function (e) {
                            var name = (e && (e.name || e.menuName)) || "";
                            if (String(name) === "Loading Menu") {
                                skyrimPlatform_15.printConsole("VOA: Loading Menu closed ??? reapply pending teleport");
                                // Give engine a frame after load, then force loadGame if still wrong
                                skyrimPlatform_15.once("update", function () {
                                    var tp = skyrimPlatform_15.storage["voaPendingTeleport"];
                                    if (tp && !tp.done)
                                        tp.forceLoad = true;
                                    applyVoaPendingTeleport("loading-close");
                                });
                            }
                        });
                    }
                    catch (eMc) { /* older SP */ }
                    try {
                        skyrimPlatform_15.on("loadGame", function () {
                            skyrimPlatform_15.once("update", function () {
                                applyVoaPendingTeleport("loadGame");
                            });
                        });
                    }
                    catch (eLgH) { /* ignore */ }
                }
                RemoteServer.prototype.teleport = function (msg) {
                    if (!msg || !msg.pos)
                        return;
                    var targetWoc = Number(msg.worldOrCell) || 0;
                    // VOA: after local door exit, server often still thinks we are inside and
                    // re-sends Teleport into that interior (cur=3c -> 161ee). Ignore those yanks.
                    try {
                        var left = skyrimPlatform_15.storage["voaLastCellLeave"];
                        if (left && left.from && targetWoc === Number(left.from) && (Date.now() - left.at) < 10000) {
                            var pcNow = skyrimPlatform_15.Game.getPlayer();
                            var curForm = pcNow ? (pcNow.getWorldSpace() || pcNow.getParentCell()) : null;
                            var curId = curForm ? curForm.getFormID() : 0;
                            // Only ignore if we are no longer in the old cell (we successfully left)
                            if (curId && curId !== targetWoc) {
                                skyrimPlatform_15.printConsole(
                                    "VOA: ignoring stale re-entry teleport to " +
                                        targetWoc.toString(16) +
                                        " (left " +
                                        (Date.now() - left.at) +
                                        "ms ago, cur=" +
                                        curId.toString(16) +
                                        ")"
                                );
                                return;
                            }
                        }
                    }
                    catch (eStale) { /* ignore */ }
                    // Coalesce spam: same cell within 2.5s Ã¢â‚¬â€ refresh coords, do not re-queue load storms
                    try {
                        var existing = skyrimPlatform_15.storage["voaPendingTeleport"];
                        if (
                            existing &&
                            Number(existing.worldOrCell) === targetWoc &&
                            (Date.now() - (existing.at || 0)) < 2500
                        ) {
                            existing.pos = [
                                Number(msg.pos[0]) || 0,
                                Number(msg.pos[1]) || 0,
                                Number(msg.pos[2]) || 0,
                            ];
                            if (Array.isArray(msg.rot)) {
                                existing.rot = [
                                    Number(msg.rot[0]) || 0,
                                    Number(msg.rot[1]) || 0,
                                    Number(msg.rot[2]) || 0,
                                ];
                            }
                            if (!existing.done) {
                                existing.at = Date.now();
                                return;
                            }
                            // Already completed same cell recently Ã¢â‚¬â€ ignore re-teleport noise
                            if ((Date.now() - (existing.completedAt || existing.at || 0)) < 2500)
                                return;
                        }
                    }
                    catch (eCoal) { /* ignore */ }
                    var pending = {
                        pos: [Number(msg.pos[0]) || 0, Number(msg.pos[1]) || 0, Number(msg.pos[2]) || 0],
                        rot: Array.isArray(msg.rot)
                            ? [Number(msg.rot[0]) || 0, Number(msg.rot[1]) || 0, Number(msg.rot[2]) || 0]
                            : [0, 0, 0],
                        worldOrCell: targetWoc,
                        at: Date.now(),
                        tries: 0,
                        lastTryAt: 0,
                        done: false,
                        forceLoad: true,
                    };
                    skyrimPlatform_15.storage["voaPendingTeleport"] = pending;
                    // Keizaal-style: Teleporting id <idx> refrId 14 ... [pos] cell/world is <hex>
                    try {
                        skyrimPlatform_15.printConsole(
                            "Teleporting id " +
                                (msg.idx != null ? msg.idx : 0) +
                                " refrId 14 ... [" +
                                pending.pos[0] +
                                "," +
                                pending.pos[1] +
                                "," +
                                pending.pos[2] +
                                "] cell/world is " +
                                pending.worldOrCell.toString(16)
                        );
                    }
                    catch (eLog) {
                        skyrimPlatform_15.printConsole(
                            "Teleporting (queued)...",
                            pending.pos,
                            "cell/world is",
                            pending.worldOrCell.toString(16)
                        );
                    }
                    // Try immediately on next update; retries continue via hooks above
                    skyrimPlatform_15.once("update", function () {
                        applyVoaPendingTeleport("queue");
                    });
                    // Delayed retries that survive Loading Menu (Keizaal uses loadGame + TP stack)
                    try {
                        skyrimPlatform_15.Utility.wait(0.5).then(function () {
                            applyVoaPendingTeleport("wait-0.5");
                        });
                        skyrimPlatform_15.Utility.wait(1.5).then(function () {
                            applyVoaPendingTeleport("wait-1.5");
                        });
                        skyrimPlatform_15.Utility.wait(3.0).then(function () {
                            var tp = skyrimPlatform_15.storage["voaPendingTeleport"];
                            if (tp && !tp.done)
                                tp.forceLoad = true;
                            applyVoaPendingTeleport("wait-3");
                        });
                    }
                    catch (eW) { /* ignore */ }
                };
                RemoteServer.prototype.createActor = function (msg) {
                    // early hook for nameplates / interact registry
                    try {
                        if (msg && !msg.isMe && msg.refrId && msg.refrId >= 0xff000000) {
                            var nm0 = msg.look && msg.look.name ? String(msg.look.name) : "";
                            var kn0 = {};
                            var pk0 = skyrimPlatform_15.storage["voaKnownPlayers"];
                            if (pk0 && typeof pk0 === "object") {
                                for (var k0 in pk0) {
                                    if (Object.prototype.hasOwnProperty.call(pk0, k0))
                                        kn0[k0] = pk0[k0];
                                }
                            }
                            kn0[msg.refrId] = 1;
                            skyrimPlatform_15.storage["voaKnownPlayers"] = kn0;
                            if (nm0) {
                                var tn0 = {};
                                var pt0 = skyrimPlatform_15.storage["voaTrueNames"];
                                if (pt0 && typeof pt0 === "object") {
                                    for (var t0 in pt0) {
                                        if (Object.prototype.hasOwnProperty.call(pt0, t0))
                                            tn0[t0] = pt0[t0];
                                    }
                                }
                                tn0[msg.refrId] = nm0;
                                skyrimPlatform_15.storage["voaTrueNames"] = tn0;
                            }
                        }
                    } catch (eReg) { /* ignore */ }
                    var _this = this;
                    loggingStartMoment = 0;
                    loginAttempted = false;
                    try {
                        skyrimPlatform_15.storage["voaLoggingIn"] = 0;
                    }
                    catch (eSt2) { /* ignore */ }
                    if (!msg || !msg.transform || !msg.transform.pos) {
                        skyrimPlatform_15.printConsole("VOA: createActor ABORT ??? missing transform " + (msg ? JSON.stringify(Object.keys(msg)) : "null"));
                        return;
                    }
                    // VOA player-only: NEVER spawn server world actors (NPCs/animals/furniture ACHR).
                    // Only self (isMe) or dynamic MP forms (0xff......). No exceptions for lookDump.
                    var refrIdNum = (msg.refrId != null) ? Number(msg.refrId) : 0;
                    if (!msg.isMe) {
                        var ridU = refrIdNum >>> 0;
                        if (!ridU || ridU < 0xff000000) {
                            return;
                        }
                    }
                    try {
                        if (msg.isMe || (refrIdNum >>> 0) >= 0xff000000) {
                            skyrimPlatform_15.printConsole("VOA: createActor idx=" + (msg && msg.idx) + " isMe=" + (msg && msg.isMe) + " refrId=" + (msg && msg.refrId) + " hasLook=" + !!(msg && msg.look));
                        }
                    }
                    catch (eLog) { /* ignore */ }
                    var i = this.getIdManager().allocateIdFor(msg.idx);
                    if (this.worldModel.forms.length <= i)
                        this.worldModel.forms.length = i + 1;
                    var movement = null;
                    if (msg.refrId >= 0xff000000) {
                        movement = {
                            pos: msg.transform.pos,
                            rot: msg.transform.rot,
                            worldOrCell: msg.transform.worldOrCell,
                            runMode: "Standing",
                            direction: 0,
                            isInJumpState: false,
                            isSneaking: false,
                            isBlocking: false,
                            isWeapDrawn: false,
                            isDead: false,
                            healthPercentage: 1.0,
                            speed: 0,
                        };
                    }
                    this.worldModel.forms[i] = {
                        idx: msg.idx,
                        movement: movement,
                        numMovementChanges: 0,
                        numLookChanges: 0,
                        baseId: msg.baseId,
                        refrId: msg.refrId,
                    };
                    if (msg.isMe) {
                        updateOwner.setOwnerModel(this.worldModel.forms[i]);
                    }
                    if (msg.look) {
                        this.worldModel.forms[i].look = msg.look;
                    }
                    if (msg.equipment) {
                        this.worldModel.forms[i].equipment = msg.equipment;
                    }
                    if (msg.props) {
                        for (var propName in msg.props) {
                            var i_2 = this.getIdManager().getId(msg.idx);
                            this.worldModel.forms[i_2][propName] =
                                msg.props[propName];
                        }
                    }
                    if (msg.isMe)
                        this.worldModel.playerCharacterFormIdx = i;
                    // VOA: hardlink remote form id for character-state flushes
                    if (msg.isMe && msg.refrId) {
                        try {
                            skyrimPlatform_15.storage["voaSelfRemoteId"] = Number(msg.refrId) || 0;
                        }
                        catch (eSelf) { /* ignore */ }
                    }
                    // TODO: move to a separate module
                    if (msg.props && !msg.props.isHostedByOther) {
                    }
                    // VOA: only open race menu for *new* characters (no look yet).
                    // Existing saved characters must never re-enter character creator.
                    // Server SetLook often does NOT live-update createActor (hasLook=false) —
                    // restore look from SQLite via HTTP before showing race menu.
                    if (msg.isMe && msg.look) {
                        this.setRaceMenuOpen({ type: "setRaceMenuOpen", open: false });
                        try {
                            skyrimPlatform_15.storage["voaConnected"] = true;
                            skyrimPlatform_15.storage["voaReconnectGraceUntil"] = 0;
                        }
                        catch (eOk) { /* ignore */ }
                    }
                    else if (msg.isMe && !msg.look) {
                        var selfLook = this;
                        try {
                            skyrimPlatform_15.storage["voaConnected"] = true;
                            skyrimPlatform_15.storage["voaReconnectGraceUntil"] = 0;
                            // Hold race menu closed until restore finishes (avoid flash + CTD race)
                            skyrimPlatform_15.storage["voaLookRestorePending"] = true;
                        }
                        catch (eOk2) { /* ignore */ }
                        // Do NOT open race menu yet. Fetch DB look AFTER loadGame settles —
                        // applyLookToPlayer during loadGame CTDs Skyrim.
                        selfLook.setRaceMenuOpen({ type: "setRaceMenuOpen", open: false });
                        var restoreStarted = Date.now();
                        var restoreTries = 0;
                        var restoreId = skyrimPlatform_15.on("update", function () {
                            try {
                                restoreTries++;
                                // Wait out loadGame / Loading Menu (min 2s, max ~12s)
                                if (Date.now() - restoreStarted < 2000)
                                    return;
                                try {
                                    if (skyrimPlatform_15.Ui.isMenuOpen("Loading Menu") ||
                                        skyrimPlatform_15.Ui.isMenuOpen("Main Menu")) {
                                        if (Date.now() - restoreStarted < 12000)
                                            return;
                                    }
                                }
                                catch (eMenu) { /* ignore */ }
                                var pl = skyrimPlatform_15.Game.getPlayer();
                                if (!pl) {
                                    if (Date.now() - restoreStarted < 12000)
                                        return;
                                }
                                try { skyrimPlatform_15.unsubscribe(restoreId); } catch (eU) { /* ignore */ }
                                var gdL = skyrimPlatform_15.settings["skymp5-client"]["gameData"] || {};
                                var sessionL = typeof gdL.session === "string" ? gdL.session : "";
                                var slotL = typeof gdL.characterSlot === "number" ? gdL.characterSlot : 0;
                                var masterL = skyrimPlatform_15.settings["skymp5-client"]["master"] || "http://127.0.0.1:3100";
                                masterL = String(masterL).replace(/\/$/, "");
                                var finishNoLook = function () {
                                    try { skyrimPlatform_15.storage["voaLookRestorePending"] = false; } catch (e0) { }
                                    if (msg.props && msg.props.isRaceMenuOpen) {
                                        try {
                                            skyrimPlatform_15.storage["voaNeedStarterKit"] = true;
                                            skyrimPlatform_15.storage["voaStarterGraceUntil"] = Date.now() + 90000;
                                        }
                                        catch (eSk) { /* ignore */ }
                                        selfLook.setRaceMenuOpen({ type: "setRaceMenuOpen", open: true });
                                        skyrimPlatform_15.printConsole("VOA: no DB look — opening race menu");
                                    }
                                    else {
                                        selfLook.setRaceMenuOpen({ type: "setRaceMenuOpen", open: false });
                                    }
                                };
                                if (!sessionL) {
                                    finishNoLook();
                                    return;
                                }
                                var clientL = new skyrimPlatform_15.HttpClient(masterL);
                                clientL.get("/v1/game/character-binding?session=" + encodeURIComponent(sessionL) + "&slot=" + encodeURIComponent(String(slotL)), {
                                    headers: { Accept: "application/json" },
                                }).then(function (res) {
                                    try {
                                        var body = res && res.body != null ? res.body : "";
                                        if (typeof body !== "string")
                                            body = JSON.stringify(body);
                                        var data = body ? JSON.parse(body) : null;
                                        var app = data && data.binding && data.binding.appearance;
                                        var hasRace = app && typeof app === "object" && Number(app.raceId) > 0;
                                        if (!hasRace) {
                                            finishNoLook();
                                            return;
                                        }
                                        // Sanitize look for wire (ASCII texture paths only — avoids simdjson UTF-8 kills)
                                        try {
                                            if (Array.isArray(app.tints)) {
                                                for (var ti = 0; ti < app.tints.length; ti++) {
                                                    if (app.tints[ti] && typeof app.tints[ti].texturePath === "string") {
                                                        app.tints[ti].texturePath = String(app.tints[ti].texturePath)
                                                            .replace(/[^\x20-\x7E]/g, "?")
                                                            .replace(/\\/g, "/");
                                                    }
                                                }
                                            }
                                            if (typeof app.name === "string")
                                                app.name = String(app.name).replace(/[^\x20-\x7E]/g, "?").slice(0, 48);
                                        }
                                        catch (eSan) { /* ignore */ }
                                        // Model only first
                                        try {
                                            var iMe = selfLook.worldModel.playerCharacterFormIdx;
                                            if (iMe >= 0 && selfLook.worldModel.forms[iMe]) {
                                                selfLook.worldModel.forms[iMe].look = app;
                                                selfLook.worldModel.forms[iMe].numLookChanges =
                                                    (selfLook.worldModel.forms[iMe].numLookChanges || 0) + 1;
                                            }
                                        }
                                        catch (eWm) { /* ignore */ }
                                        // Server lookDump (next join hasLook=true) — do this before local mesh surgery
                                        try {
                                            networking.send({
                                                t: messages.MsgType.UpdateLook,
                                                data: app,
                                                _refrId: undefined,
                                            }, true);
                                        }
                                        catch (eUl) { /* ignore */ }
                                        // Local apply AFTER loadGame — one more frame delay
                                        skyrimPlatform_15.once("update", function () {
                                            try {
                                                var p2 = skyrimPlatform_15.Game.getPlayer();
                                                if (p2 && look_2 && typeof look_2.applyLookToPlayer === "function") {
                                                    look_2.applyLookToPlayer(app);
                                                }
                                            }
                                            catch (eAl) {
                                                skyrimPlatform_15.printConsole("VOA: applyLookToPlayer fail " + eAl);
                                            }
                                            selfLook.setRaceMenuOpen({ type: "setRaceMenuOpen", open: false });
                                            try { skyrimPlatform_15.storage["voaLookRestorePending"] = false; } catch (eF) { }
                                            skyrimPlatform_15.printConsole("VOA: restored look from DB (raceId=" + Number(app.raceId).toString(16) + ") — race menu skipped");
                                            if (app.name) {
                                                try {
                                                    skyrimPlatform_15.storage["voaLocalPlayerName"] = String(app.name);
                                                }
                                                catch (eNm) { /* ignore */ }
                                            }
                                        });
                                    }
                                    catch (eParse) {
                                        skyrimPlatform_15.printConsole("VOA: look restore parse fail " + eParse);
                                        finishNoLook();
                                    }
                                }).catch(function (err) {
                                    skyrimPlatform_15.printConsole("VOA: look restore HTTP fail " + err);
                                    finishNoLook();
                                });
                            }
                            catch (eFetch) {
                                try { skyrimPlatform_15.unsubscribe(restoreId); } catch (eU2) { }
                                skyrimPlatform_15.printConsole("VOA: look restore setup fail " + eFetch);
                                try { skyrimPlatform_15.storage["voaLookRestorePending"] = false; } catch (e3) { }
                                if (msg.props && msg.props.isRaceMenuOpen) {
                                    selfLook.setRaceMenuOpen({ type: "setRaceMenuOpen", open: true });
                                }
                            }
                        });
                    }
                    // VOA: unlock all map markers by default on every join + spawn protection
                    if (msg.isMe) {
                        skyrimPlatform_15.once("update", function () {
                            skyrimPlatform_15.Utility.wait(1.0).then(function () {
                                try {
                                    // Brief protect on every join (mudcrabs / wolves at spawn)
                                    // deathSystem is loaded via view ??? available through storage bridge below
                                    skyrimPlatform_15.storage["voaGrantSpawnProtect"] = Date.now() + 12000;
                                }
                                catch (eProt) { /* ignore */ }
                                try {
                                    // Papyrus Game.ShowAllMapMarkers(bool) ??? single bool arg via callNative
                                    skyrimPlatform_15.callNative("Game", "ShowAllMapMarkers", true);
                                    skyrimPlatform_15.printConsole("VOA: ShowAllMapMarkers(true)");
                                }
                                catch (eMap) {
                                    try {
                                        if (skyrimPlatform_15.Game && typeof skyrimPlatform_15.Game.showAllMapMarkers === "function") {
                                            skyrimPlatform_15.Game.showAllMapMarkers(true);
                                        }
                                    }
                                    catch (eMap2) {
                                        // Non-fatal; map markers are optional
                                    }
                                }
                            });
                        });
                    }
                    // VOA: report saved in-game name for launcher slot labels
                    if (msg.isMe && msg.look && msg.look.name) {
                        try {
                            var selfRs = this;
                            skyrimPlatform_15.once("update", function () {
                                try {
                                    // send via networking after login is fully up
                                    var slot = 0;
                                    var profileId = 0;
                                    try {
                                        var gd2 = skyrimPlatform_15.settings["skymp5-client"]["gameData"] || {};
                                        if (typeof gd2.characterSlot === "number")
                                            slot = gd2.characterSlot;
                                        if (typeof gd2.profileId === "number")
                                            profileId = gd2.profileId;
                                    }
                                    catch (e0) { }
                                    networking.send({
                                        t: messages.MsgType.CustomEvent,
                                        eventName: "_voaCharacterName",
                                        args: [profileId, slot, msg.look.name],
                                        argsJsonDumps: [JSON.stringify(profileId), JSON.stringify(slot), JSON.stringify(msg.look.name)],
                                    }, true);
                                    skyrimPlatform_15.printConsole("VOA loaded name p" + profileId + " slot " + slot + " => " + msg.look.name + " refrId=" + (msg.refrId != null ? msg.refrId : "?"));
                                    try {
                                        skyrimPlatform_15.storage["voaLocalPlayerName"] = String(msg.look.name);
                                    }
                                    catch (eLn2) { /* ignore */ }
                                }
                                catch (e1) { }
                            });
                        }
                        catch (e2) { }
                    }
                    else if (msg.isMe) {
                        // Help diagnose "wrong character on slot 2" ??? spawn without look = new/empty form
                        try {
                            var gd3 = skyrimPlatform_15.settings["skymp5-client"]["gameData"] || {};
                            var slot3 = (typeof gd3.characterSlot === "number") ? gd3.characterSlot : 0;
                            skyrimPlatform_15.printConsole("VOA: isMe spawn has NO look (slot " + slot3 + " refrId=" + (msg.refrId != null ? msg.refrId : "?") + ") ??? expect race menu or wrong actor");
                        }
                        catch (eNoLook) { /* ignore */ }
                    }
                    var applyPcInv = function () {
                        inventory_3.applyInventory(skyrimPlatform_15.Game.getPlayer(), msg.equipment
                            ? {
                                entries: msg.equipment.inv.entries.filter(function (x) { return !!skyrimPlatform_15.Armor.from(skyrimPlatform_15.Game.getFormEx(x.baseId)); }),
                            }
                            : { entries: [] }, false);
                        if (msg.props && msg.props.inventory)
                            _this.setInventory({
                                type: "setInventory",
                                inventory: msg.props.inventory,
                            });
                    };
                    if (msg.isMe) {
                        // Keizaal-style dual spawn race:
                        //   SpawnPath2-tick  (preferred): wait two SP ticks Ã¢â€ â€™ loadGame
                        //   SpawnPath1-update (fallback): delayed moveRefr if tick path lost
                        // First path to set spawnTask.running wins; the other logs LOST THE RACE.
                        var task_1 = new SpawnTask();
                        var applyBaseAVs = function () {
                            if (!msg.props)
                                return;
                            try {
                                var baseActorValues_1 = new Map([
                                    ["healRate", msg.props.healRate],
                                    ["healRateMult", msg.props.healRateMult],
                                    ["health", msg.props.health],
                                    ["magickaRate", msg.props.magickaRate],
                                    ["magickaRateMult", msg.props.magickaRateMult],
                                    ["magicka", msg.props.magicka],
                                    ["staminaRate", msg.props.staminaRate],
                                    ["staminaRateMult", msg.props.staminaRateMult],
                                    ["stamina", msg.props.stamina],
                                    ["healthPercentage", msg.props.healthPercentage],
                                    ["staminaPercentage", msg.props.staminaPercentage],
                                    ["magickaPercentage", msg.props.magickaPercentage],
                                ]);
                                var player_1 = skyrimPlatform_15.Game.getPlayer();
                                if (player_1) {
                                    baseActorValues_1.forEach(function (value, key) {
                                        if (typeof value === "number") {
                                            if (key.includes("Percentage")) {
                                                var subKey = key.replace("Percentage", "");
                                                var subValue = baseActorValues_1.get(subKey);
                                                if (typeof subValue === "number") {
                                                    actorvalues_1.setActorValuePercentage(player_1, subKey, value);
                                                }
                                            }
                                            else {
                                                player_1.setActorValue(key, value);
                                            }
                                        }
                                    });
                                }
                            }
                            catch (eAv) { /* ignore */ }
                        };
                        var runLoadGameSpawn = function () {
                            skyrimPlatform_15.printConsole(
                                "VOA: [SpawnPath2-tick] WON THE RACE - will use loadGame cell=0x" +
                                    (Number(msg.transform.worldOrCell) || 0).toString(16)
                            );
                            skyrimPlatform_15.printConsole("Using loadGame to spawn player");
                            _this._voaSpawnGraceUntil = 0;
                            try {
                                skyrimPlatform_15.storage["voaSpawnGraceUntil"] = 0;
                            }
                            catch (eGr) { /* ignore */ }
                            try {
                                skyrimPlatform_15.browser.setFocused(false);
                                skyrimPlatform_15.storage["voaChatFocused"] = false;
                                skyrimPlatform_15.storage["voaForceBrowser"] = false;
                            }
                            catch (eBf) { /* ignore */ }
                            var skin = msg.look &&
                                (msg.look.skinColor != null
                                    ? msg.look.skinColor
                                    : msg.look.bodySkinColor);
                            skyrimPlatform_15.printConsole(
                                "skinColorFromServer:",
                                skin != null ? Number(skin).toString(16) : undefined
                            );
                            try {
                                loadGameManager.loadGame(
                                    msg.transform.pos,
                                    msg.transform.rot,
                                    msg.transform.worldOrCell,
                                    msg.look
                                        ? {
                                            name: msg.look.name,
                                            raceId: msg.look.raceId,
                                            face: {
                                                hairColor: msg.look.hairColor,
                                                bodySkinColor: skin,
                                                headTextureSetId: msg.look.headTextureSetId,
                                                headPartIds:
                                                    msg.look.headpartIds || msg.look.headPartIds,
                                                presets: msg.look.presets,
                                            },
                                        }
                                        : undefined
                                );
                            }
                            catch (eLgSpawn) {
                                try {
                                    skyrimPlatform_15.printConsole(
                                        "VOA: loadGame spawn failed " + eLgSpawn
                                    );
                                }
                                catch (e2) { /* ignore */ }
                            }
                            // Seed pending TP so mid-load corrections stay consistent
                            try {
                                skyrimPlatform_15.storage["voaPendingTeleport"] = {
                                    pos: [
                                        Number(msg.transform.pos[0]) || 0,
                                        Number(msg.transform.pos[1]) || 0,
                                        Number(msg.transform.pos[2]) || 0,
                                    ],
                                    rot: Array.isArray(msg.transform.rot)
                                        ? [
                                            Number(msg.transform.rot[0]) || 0,
                                            Number(msg.transform.rot[1]) || 0,
                                            Number(msg.transform.rot[2]) || 0,
                                        ]
                                        : [0, 0, 0],
                                    worldOrCell: Number(msg.transform.worldOrCell) || 0,
                                    at: Date.now(),
                                    tries: 0,
                                    lastTryAt: 0,
                                    done: false,
                                    forceLoad: false,
                                    fromSpawn: true,
                                };
                            }
                            catch (eSeed) { /* ignore */ }
                            skyrimPlatform_15.once("update", function () {
                                try {
                                    skyrimPlatform_15.browser.setFocused(false);
                                }
                                catch (eF2) { /* ignore */ }
                                applyPcInv();
                                applyBaseAVs();
                                skyrimPlatform_15.Utility.wait(0.5).then(applyPcInv);
                                skyrimPlatform_15.Utility.wait(1.0).then(applyPcInv);
                                if (msg.look) {
                                    try {
                                        look_2.applyLookToPlayer(msg.look);
                                    }
                                    catch (eLook) {
                                        try {
                                            skyrimPlatform_15.printConsole(
                                                "VOA: applyLook failed " + eLook
                                            );
                                        }
                                        catch (e3) { /* ignore */ }
                                    }
                                    if (msg.look.isFemale) {
                                        skyrimPlatform_15.Utility.wait(3.0).then(function () {
                                            try {
                                                var pl = skyrimPlatform_15.Game.getPlayer();
                                                if (
                                                    pl &&
                                                    !skyrimPlatform_15.Ui.isMenuOpen("Loading Menu")
                                                )
                                                    pl.resurrect();
                                            }
                                            catch (eRes) { /* ignore */ }
                                        });
                                    }
                                }
                            });
                        };
                        var runMoveRefrFallback = function () {
                            skyrimPlatform_15.printConsole(
                                "VOA: [SpawnPath1-update] FALLBACK moveRefrToPosition (tick path lost)"
                            );
                            skyrimPlatform_15.printConsole(
                                "Using moveRefrToPosition to spawn player"
                            );
                            try {
                                skyrimPlatform_15.TESModPlatform.moveRefrToPosition(
                                    skyrimPlatform_15.Game.getPlayer(),
                                    skyrimPlatform_15.Cell.from(
                                        skyrimPlatform_15.Game.getFormEx(msg.transform.worldOrCell)
                                    ),
                                    skyrimPlatform_15.WorldSpace.from(
                                        skyrimPlatform_15.Game.getFormEx(msg.transform.worldOrCell)
                                    ),
                                    msg.transform.pos[0],
                                    msg.transform.pos[1],
                                    msg.transform.pos[2],
                                    msg.transform.rot[0],
                                    msg.transform.rot[1],
                                    msg.transform.rot[2]
                                );
                            }
                            catch (eMv) {
                                try {
                                    skyrimPlatform_15.printConsole(
                                        "VOA: moveRefr spawn failed " + eMv
                                    );
                                }
                                catch (e2) { /* ignore */ }
                            }
                            skyrimPlatform_15.Utility.wait(1).then(function () {
                                applyPcInv();
                                applyBaseAVs();
                            });
                            skyrimPlatform_15.Utility.wait(1.3).then(applyPcInv);
                        };
                        // Preferred path: two ticks then loadGame (Keizaal SpawnPath2)
                        skyrimPlatform_15.once("tick", function () {
                            skyrimPlatform_15.printConsole(
                                "VOA: [SpawnPath2-tick] first tick received, waiting for second tick"
                            );
                            skyrimPlatform_15.once("tick", function () {
                                skyrimPlatform_15.printConsole(
                                    "VOA: [SpawnPath2-tick] second tick received, checking spawnTask.running=" +
                                        task_1.running
                                );
                                if (task_1.running) {
                                    skyrimPlatform_15.printConsole(
                                        "VOA: [SpawnPath2-tick] LOST THE RACE - spawnTask already running, skipping loadGame"
                                    );
                                    return;
                                }
                                task_1.running = true;
                                runLoadGameSpawn();
                            });
                        });
                        // Fallback: delayed so tick path almost always wins first
                        skyrimPlatform_15.once("update", function () {
                            applyBaseAVs(); // AVs can apply early without claiming the race
                            skyrimPlatform_15.Utility.wait(0.75).then(function () {
                                skyrimPlatform_15.printConsole(
                                    "VOA: [SpawnPath1-update] checking spawnTask.running=" +
                                        task_1.running
                                );
                                if (task_1.running) {
                                    skyrimPlatform_15.printConsole(
                                        "VOA: [SpawnPath1-update] LOST THE RACE - spawnTask already running, skipping moveRefrToPosition"
                                    );
                                    return;
                                }
                                task_1.running = true;
                                runMoveRefrFallback();
                            });
                        });
                    }
                };
                RemoteServer.prototype.destroyActor = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    this.worldModel.forms[i] = null;
                    // Shrink to fit
                    while (1) {
                        var length = this.worldModel.forms.length;
                        if (!length)
                            break;
                        if (this.worldModel.forms[length - 1])
                            break;
                        this.worldModel.forms.length = length - 1;
                    }
                    if (this.worldModel.playerCharacterFormIdx === i) {
                        this.worldModel.playerCharacterFormIdx = -1;
                        // VOA: do not immediately dump to main menu — server may have recycled
                        // the actor during restart/save. Prefer reconnect; quit only if grace ends.
                        skyrimPlatform_15.printConsole("VOA: local player destroyActor from server — reconnecting instead of main menu");
                        try {
                            this._voaReconnectGraceUntil = Date.now() + 120000;
                            skyrimPlatform_15.storage["voaReconnectGraceUntil"] = this._voaReconnectGraceUntil;
                        }
                        catch (eG) { /* ignore */ }
                        try {
                            if (typeof skyrimPlatform_15.storage._voaReconnect === "function")
                                skyrimPlatform_15.storage._voaReconnect();
                        }
                        catch (eR) { /* ignore */ }
                        // If still no PC after grace, quit
                        var selfDa = this;
                        var startDa = Date.now();
                        var idDa = skyrimPlatform_15.on("update", function () {
                            if (Date.now() - startDa < 120000) {
                                if (selfDa.worldModel && selfDa.worldModel.playerCharacterFormIdx >= 0) {
                                    try { skyrimPlatform_15.unsubscribe(idDa); } catch (eU) { }
                                }
                                return;
                            }
                            try { skyrimPlatform_15.unsubscribe(idDa); } catch (eU2) { }
                            if (selfDa.worldModel && selfDa.worldModel.playerCharacterFormIdx < 0) {
                                skyrimPlatform_15.printConsole("VOA: player actor gone after reconnect window — main menu");
                                try { skyrimPlatform_15.Game.quitToMainMenu(); } catch (eQ) { }
                            }
                        });
                    }
                    this.getIdManager().freeIdFor(msg.idx);
                };
                RemoteServer.prototype.UpdateMovement = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    this.worldModel.forms[i].movement = msg.data;
                    if (!this.worldModel.forms[i].numMovementChanges) {
                        this.worldModel.forms[i].numMovementChanges = 0;
                    }
                    this.worldModel.forms[i].numMovementChanges++;
                };
                RemoteServer.prototype.UpdateAnimation = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    this.worldModel.forms[i].animation = msg.data;
                };
                RemoteServer.prototype.UpdateLook = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    this.worldModel.forms[i].look = msg.data;
                    if (!this.worldModel.forms[i].numLookChanges) {
                        this.worldModel.forms[i].numLookChanges = 0;
                    }
                    this.worldModel.forms[i].numLookChanges++;
                };
                RemoteServer.prototype.UpdateEquipment = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    this.worldModel.forms[i].equipment = msg.data;
                };
                RemoteServer.prototype.UpdateProperty = function (msg) {
                    var i = this.getIdManager().getId(msg.idx);
                    if (!this.worldModel.forms[i])
                        return;
                    this.worldModel.forms[i][msg.propName] =
                        msg.data;
                    // VOA: healthPercentage / isDead from mp.set must apply to local PC + neighbor bars
                    var prop = msg.propName;
                    if (prop !== "healthPercentage" && prop !== "isDead")
                        return;
                    var selfUp = this;
                    skyrimPlatform_15.once("update", function () {
                        try {
                            var isMeProp = selfUp.worldModel.playerCharacterFormIdx === i;
                            var formP = selfUp.worldModel.forms[i];
                            if (prop === "healthPercentage" && formP && formP.movement) {
                                formP.movement.healthPercentage = msg.data;
                            }
                            if (isMeProp) {
                                var pl = skyrimPlatform_15.Game.getPlayer();
                                if (!pl)
                                    return;
                                try {
                                    skyrimPlatform_15.storage["voaGrantSpawnProtect"] = 0;
                                }
                                catch (e0) { /* ignore */ }
                                if (prop === "healthPercentage" && typeof msg.data === "number") {
                                    actorvalues_1.setActorValuePercentage(pl, "health", msg.data);
                                    skyrimPlatform_15.printConsole("VOA: UpdateProperty self health=" + msg.data);
                                    if (msg.data <= 0.02) {
                                        try {
                                            pl.startDeferredKill();
                                            pl.pushActorAway(pl, 0);
                                        }
                                        catch (eD) { /* ignore */ }
                                    }
                                }
                                if (prop === "isDead" && msg.data) {
                                    try {
                                        pl.startDeferredKill();
                                        pl.pushActorAway(pl, 0);
                                    }
                                    catch (eD2) { /* ignore */ }
                                }
                            }
                            else if (formP && formP.refrId && prop === "healthPercentage" && typeof msg.data === "number") {
                                var lid = view_2.remoteIdToLocalId(formP.refrId);
                                var refrN = skyrimPlatform_15.Actor.from(skyrimPlatform_15.Game.getFormEx(lid));
                                if (refrN)
                                    actorvalues_1.setActorValuePercentage(refrN, "health", msg.data);
                            }
                        }
                        catch (eUp) {
                            skyrimPlatform_15.printConsole("VOA: UpdateProperty apply err " + eUp);
                        }
                    });
                };
                RemoteServer.prototype.handleConnectionAccepted = function () {
                    this.worldModel.forms = [];
                    this.worldModel.playerCharacterFormIdx = -1;
                    try {
                        skyrimPlatform_15.storage["voaConnected"] = true;
                        this._voaReconnectGraceUntil = 0;
                        skyrimPlatform_15.storage["voaReconnectGraceUntil"] = 0;
                    }
                    catch (eC) { /* ignore */ }
                    verifySourceCode();
                    sendBrowserToken();
                };
                RemoteServer.prototype.handleDisconnect = function () {
                // VOA: flush character DB, then RECONNECT — do not hard-boot to main menu on brief drops.
                // (Previously: flush → quitToMainMenu after spawn grace, which felt like "flush kick".)
                try {
                    try {
                        if (skyrimPlatform_15.storage &&
                            typeof skyrimPlatform_15.storage._voaForceCharSave === "function") {
                            skyrimPlatform_15.storage._voaForceCharSave("handleDisconnect");
                        }
                    }
                    catch (eSave) { /* ignore */ }

                    var now = Date.now();
                    // Open a reconnect window (2 minutes) after any disconnect
                    this._voaReconnectGraceUntil = now + 120000;
                    try {
                        skyrimPlatform_15.storage["voaReconnectGraceUntil"] = this._voaReconnectGraceUntil;
                    }
                    catch (eG) { /* ignore */ }

                    var spawnGrace = this._voaSpawnGraceUntil || 0;
                    if (spawnGrace && now < spawnGrace) {
                        skyrimPlatform_15.printConsole("VOA: disconnect during spawn grace — keeping world, reconnecting");
                    }
                    else {
                        skyrimPlatform_15.printConsole("VOA: disconnected — state flushed; keeping world and reconnecting (not main menu)");
                    }

                    // Do NOT clear worldModel here — allows seamless rejoin if server comes back.
                    // Trigger reconnect via networking module
                    try {
                        if (typeof skyrimPlatform_15.storage._voaReconnect === "function") {
                            skyrimPlatform_15.storage._voaReconnect();
                        }
                    }
                    catch (eRec) { /* ignore */ }

                    // Only quit to main menu if reconnect window expires without recovery
                    var self = this;
                    var tickId = null;
                    try {
                        tickId = skyrimPlatform_15.on("update", function () {
                            try {
                                // Connected again?
                                try {
                                    if (skyrimPlatform_15.storage["voaConnected"] === true) {
                                        try { skyrimPlatform_15.unsubscribe(tickId); } catch (eU) { }
                                        return;
                                    }
                                }
                                catch (eC) { }
                                var until = Number(skyrimPlatform_15.storage["voaReconnectGraceUntil"]) ||
                                    self._voaReconnectGraceUntil || 0;
                                // Extend grace while reconnect attempts are still scheduled
                                if (until && Date.now() < until)
                                    return;
                                // Also wait if player form already restored mid-reconnect
                                if (self.worldModel && self.worldModel.playerCharacterFormIdx >= 0) {
                                    try {
                                        if (skyrimPlatform_15.storage["voaConnected"] === true) {
                                            try { skyrimPlatform_15.unsubscribe(tickId); } catch (eU2) { }
                                            return;
                                        }
                                    }
                                    catch (eC2) { }
                                }
                                skyrimPlatform_15.printConsole("VOA: reconnect window expired — returning to main menu");
                                self.worldModel.forms = [];
                                self.worldModel.playerCharacterFormIdx = -1;
                                try { skyrimPlatform_15.unsubscribe(tickId); } catch (eU3) { }
                                try { skyrimPlatform_15.Game.quitToMainMenu(); } catch (eQ) { }
                            }
                            catch (eTick) { /* ignore */ }
                        });
                    }
                    catch (eOn) {
                        skyrimPlatform_15.printConsole("VOA: disconnect fallback timer");
                    }
                }
                catch (e) {
                    skyrimPlatform_15.printConsole("VOA: handleDisconnect error " + e);
                }
            };
                RemoteServer.prototype.ChangeValues = function (msg) {
                var self = this;
                skyrimPlatform_15.once("update", function () {
                    var data = msg.data || {};
                    var ac = skyrimPlatform_15.Game.getPlayer();
                    var applyToActor = function (actor) {
                        if (!actor) return;
                        if (data.health != null) actorvalues_1.setActorValuePercentage(actor, "health", data.health);
                        if (data.stamina != null) actorvalues_1.setActorValuePercentage(actor, "stamina", data.stamina);
                        if (data.magicka != null) actorvalues_1.setActorValuePercentage(actor, "magicka", data.magicka);
                    };
                    // Resolve whether this ChangeValues is for *me* (server idx of our PC)
                    var isForMe = false;
                    var form = null;
                    if (typeof msg.idx === "number" && self.worldModel && self.worldModel.forms) {
                        try {
                            var i = self.getIdManager().getId(msg.idx);
                            form = self.worldModel.forms[i];
                            if (form && form.movement && data.health != null) {
                                form.movement.healthPercentage = data.health;
                            }
                            if (typeof self.worldModel.playerCharacterFormIdx === "number" &&
                                self.worldModel.playerCharacterFormIdx === i) {
                                isForMe = true;
                            }
                        }
                        catch (eIdx) { /* ignore */ }
                    }
                    // No idx / unknown ??? treat as self (stock SkyMP path)
                    if (typeof msg.idx !== "number")
                        isForMe = true;

                    if (isForMe) {
                        // Server authority: cancel soft spawn-heal so damage sticks
                        try {
                            skyrimPlatform_15.storage["voaGrantSpawnProtect"] = 0;
                        }
                        catch (eSp) { /* ignore */ }
                        applyToActor(ac);
                        skyrimPlatform_15.printConsole("VOA: ChangeValues self health=" + data.health);
                        if (data.health === 0 || data.health === 0.0 || (typeof data.health === "number" && data.health <= 0.02)) {
                            try {
                                ac.startDeferredKill();
                                ac.pushActorAway(ac, 0);
                            }
                            catch (e) { /* ignore */ }
                        }
                        return;
                    }

                    // Neighbor / remote form visual HP bar
                    if (form && form.refrId) {
                        try {
                            var localId = view_2.remoteIdToLocalId(form.refrId);
                            var refr = skyrimPlatform_15.Actor.from(skyrimPlatform_15.Game.getFormEx(localId));
                            if (refr) {
                                applyToActor(refr);
                                return;
                            }
                        }
                        catch (eRem) {
                            skyrimPlatform_15.printConsole("ChangeValues remote: " + eRem);
                        }
                    }
                });
            };
                RemoteServer.prototype.setRaceMenuOpen = function (msg) {
                    if (msg.open) {
                        try {
                            skyrimPlatform_15.storage["voaNeedStarterKit"] = true;
                            skyrimPlatform_15.storage["voaStarterGraceUntil"] = Date.now() + 90000;
                        }
                        catch (eG) { /* ignore */ }
                        // wait 0.3s cause we can see visual bugs when teleporting
                        // and showing this menu at the same time in onConnect
                        skyrimPlatform_15.once("update", function () {
                            return skyrimPlatform_15.Utility.wait(0.3).then(function () {
                                try {
                                    var playerRm = skyrimPlatform_15.Game.getPlayer();
                                    if (playerRm) {
                                        // Strip default iron kit before chargen so players never keep it
                                        playerRm.removeAllItems(null, false, true);
                                    }
                                }
                                catch (eStrip) { /* ignore */ }
                                try {
                                    var ironHelment = skyrimPlatform_15.Armor.from(skyrimPlatform_15.Game.getFormEx(0x00012e4d));
                                    if (ironHelment)
                                        skyrimPlatform_15.Game.getPlayer().unequipItem(ironHelment, false, true);
                                }
                                catch (eHelm) { /* ignore */ }
                                skyrimPlatform_15.Game.showRaceMenu();
                            });
                        });
                    }
                    else {
                        // TODO: Implement closeMenu in SkyrimPlatform
                    }
                };
                RemoteServer.prototype.customPacket = function (msg) {
                    switch (msg.content.customPacketType) {
                        case "loginRequired":
                            verifyStartMoment = 0;
                            maxVerifyDelay = maxVerifyDelayDefault;
                            loginWithSkympIoCredentials();
                            break;
                        case "newClientVersion":
                            if (typeof msg.content.src !== "string")
                                throw new Error("'" + msg.content.src + "' is not a string");
                            var src = msg.content.src;
                            // Force reconnecting after hot reload (see skympClient.ts)
                            //networking.close();
                            //storage.targetIp = "";
                            taskVerifySourceCode();
                            skyrimPlatform_15.printConsole("writing new version (" + src + " bytes)");
                            if (src.length > 0)
                                skyrimPlatform_15.writePlugin("skymp5-client", src);
                            break;
                    }
                };
                RemoteServer.prototype.spSnippet = function (msg) {
                    var _this = this;
                    skyrimPlatform_15.once("update", function () { return __awaiter(_this, void 0, void 0, function () {
                        var _this = this;
                        return __generator(this, function (_a) {
                            spSnippet
                                .run(msg)
                                .then(function (res) {
                                if (res === undefined)
                                    res = null;
                                _this.send({
                                    t: messages.MsgType.FinishSpSnippet,
                                    returnValue: res,
                                    snippetIdx: msg.snippetIdx,
                                }, true);
                            })
                                .catch(function (e) { return skyrimPlatform_15.printConsole("!!! SpSnippet failed", e); });
                            return [2 /*return*/];
                        });
                    }); });
                };
                RemoteServer.prototype.updateGamemodeUpdateFunctions = function (storageVar, functionSources) {
                    skyrimPlatform_15.storage[storageVar] = JSON.parse(JSON.stringify(functionSources));
                    for (var _i = 0, _a = Object.keys(functionSources); _i < _a.length; _i++) {
                        var propName = _a[_i];
                        try {
                            skyrimPlatform_15.storage[storageVar][propName] = new Function("ctx", skyrimPlatform_15.storage[storageVar][propName]);
                            var emptyFunction = functionSources[propName] === "";
                            if (emptyFunction) {
                                delete skyrimPlatform_15.storage[storageVar][propName];
                                skyrimPlatform_15.printConsole("'" + storageVar + "." + propName + "' -", "Added empty");
                            }
                            else {
                                skyrimPlatform_15.printConsole("'" + storageVar + "." + propName + "' -", "Added");
                            }
                        }
                        catch (e) {
                            skyrimPlatform_15.printConsole("'" + storageVar + "." + propName + "' -", e);
                        }
                    }
                    skyrimPlatform_15.storage[storageVar + "_keys"] = Object.keys(skyrimPlatform_15.storage[storageVar]);
                };
                RemoteServer.prototype.updateGamemodeData = function (msg) {
                    var _this = this;
                    skyrimPlatform_15.storage["_api_onAnimationEvent"] = { callback: function () { } };
                    //
                    // updateOwnerFunctions/updateNeighborFunctions
                    //
                    skyrimPlatform_15.storage["updateNeighborFunctions"] = undefined;
                    skyrimPlatform_15.storage["updateOwnerFunctions"] = undefined;
                    this.updateGamemodeUpdateFunctions("updateNeighborFunctions", msg.updateNeighborFunctions || {});
                    this.updateGamemodeUpdateFunctions("updateOwnerFunctions", msg.updateOwnerFunctions || {});
                    //
                    // EventSource
                    //
                    if (!Array.isArray(skyrimPlatform_15.storage["eventSourceContexts"])) {
                        skyrimPlatform_15.storage["eventSourceContexts"] = [];
                    }
                    else {
                        skyrimPlatform_15.storage["eventSourceContexts"].forEach(function (ctx) {
                            ctx.sendEvent = function () { };
                            ctx._expired = true;
                        });
                    }
                    var eventNames = Object.keys(msg.eventSources);
                    eventNames.forEach(function (eventName) {
                        try {
                            var fn = new Function("ctx", msg.eventSources[eventName]);
                            var ctx = {
                                sp: sp,
                                sendEvent: function () {
                                    var args = [];
                                    for (var _i = 0; _i < arguments.length; _i++) {
                                        args[_i] = arguments[_i];
                                    }
                                    _this.send({
                                        t: messages.MsgType.CustomEvent,
                                        args: args,
                                        argsJsonDumps: (args || []).map(function (arg) {
                                            return JSON.stringify(arg);
                                        }),
                                        eventName: eventName,
                                    }, true);
                                },
                                getFormIdInServerFormat: function (clientsideFormId) {
                                    return view_2.localIdToRemoteId(clientsideFormId);
                                },
                                getFormIdInClientFormat: function (serversideFormId) {
                                    return view_2.remoteIdToLocalId(serversideFormId);
                                },
                                _fn: fn,
                                _eventName: eventName,
                                state: {},
                            };
                            skyrimPlatform_15.storage["eventSourceContexts"].push(ctx);
                            setupEventSource(ctx);
                        }
                        catch (e) {
                            skyrimPlatform_15.printConsole("'eventSources." + eventName + "' -", e);
                        }
                    });
                };
                /** Packet handlers end **/
                RemoteServer.prototype.getWorldModel = function () {
                    return this.worldModel;
                };
                RemoteServer.prototype.getMyActorIndex = function () {
                    return this.worldModel.playerCharacterFormIdx;
                };
                RemoteServer.prototype.send = function (msg, reliable) {
                    if (this.worldModel.playerCharacterFormIdx === -1)
                        return;
                    var refrId = msg._refrId;
                    var idxInModel = refrId
                        ? this.worldModel.forms.findIndex(function (f) { return f && f.refrId === refrId; })
                        : this.worldModel.playerCharacterFormIdx;
                    // Guard missing forms (disconnect race)
                    if (idxInModel < 0 || !this.worldModel.forms[idxInModel])
                        return;
                    msg.idx = this.worldModel.forms[idxInModel].idx;
                    delete msg._refrId;
                    // VOA: rebuild UpdateMovement as plain JSON-safe object (fixes isDead key errors)
                    if (msg.t === messages.MsgType.UpdateMovement || msg.t === 2 || Number(msg.t) === 2) {
                        var src = (msg.data && typeof msg.data === "object") ? msg.data : {};
                        var pos = (Array.isArray(src.pos) && src.pos.length >= 3)
                            ? [Number(src.pos[0]) || 0, Number(src.pos[1]) || 0, Number(src.pos[2]) || 0]
                            : [0, 0, 0];
                        var rot = (Array.isArray(src.rot) && src.rot.length >= 3)
                            ? [Number(src.rot[0]) || 0, Number(src.rot[1]) || 0, Number(src.rot[2]) || 0]
                            : [0, 0, 0];
                        var dataOut = {
                            worldOrCell: Number(src.worldOrCell) || 0,
                            pos: pos,
                            rot: rot,
                            runMode: (typeof src.runMode === "string" && src.runMode) ? src.runMode : "Standing",
                            direction: typeof src.direction === "number" && !isNaN(src.direction) ? src.direction : 0,
                            healthPercentage: typeof src.healthPercentage === "number" && !isNaN(src.healthPercentage) ? src.healthPercentage : 1,
                            speed: typeof src.speed === "number" && !isNaN(src.speed) ? src.speed : 0,
                            isInJumpState: src.isInJumpState === true,
                            isSneaking: src.isSneaking === true,
                            isBlocking: src.isBlocking === true,
                            isWeapDrawn: src.isWeapDrawn === true,
                            isDead: src.isDead === true,
                        };
                        if (Array.isArray(src.lookAt) && src.lookAt.length >= 3) {
                            dataOut.lookAt = [Number(src.lookAt[0]) || 0, Number(src.lookAt[1]) || 0, Number(src.lookAt[2]) || 0];
                        }
                        msg = { t: 2, idx: msg.idx, data: dataOut };
                    }
                    try {
                        networking.send(msg, reliable);
                    }
                    catch (e) {
                        // Throttle spam ??? was flooding console and freezing frames
                        var nowE = Date.now();
                        if (!this._voaLastSendErr || nowE - this._voaLastSendErr > 3000) {
                            this._voaLastSendErr = nowE;
                            skyrimPlatform_15.printConsole("send failed: " + e);
                        }
                    }
                };
                RemoteServer.prototype.getIdManager = function () {
                    if (!this.idManager_)
                        this.idManager_ = new idManager_1.IdManager();
                    return this.idManager_;
                };
                return RemoteServer;
            }());
            exports_32("RemoteServer", RemoteServer);
        }
    };
});
System.register("skymp5-client/src/lib/structures/hit", [], function (exports_33, context_33) {
    "use strict";
    var __moduleName = context_33 && context_33.id;
    return {
        setters: [],
        execute: function () {
        }
    };
});
System.register("skymp5-client/src/front/components/hit", ["skymp5-client/src/front/view"], function (exports_34, context_34) {
    "use strict";
    var view_3, getHitData;
    var __moduleName = context_34 && context_34.id;
    return {
        setters: [
            function (view_3_1) {
                view_3 = view_3_1;
            }
        ],
        execute: function () {
            exports_34("getHitData", getHitData = function (e) {
                var hitData = {
                    agressor: view_3.localIdToRemoteId(e.agressor.getFormID()),
                    isBashAttack: e.isBashAttack,
                    isHitBlocked: e.isHitBlocked,
                    isPowerAttack: e.isPowerAttack,
                    isSneakAttack: e.isSneakAttack,
                    projectile: e.projectile ? e.projectile.getFormID() : 0,
                    source: e.source ? e.source.getFormID() : 0,
                    target: view_3.localIdToRemoteId(e.target.getFormID())
                };
                return hitData;
            });
        }
    };
});
System.register("skymp5-client/src/front/skympClient", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/view", "skymp5-client/src/front/components/movement", "skymp5-client/src/front/components/look", "skymp5-client/src/front/components/animation", "skymp5-client/src/front/components/equipment", "skymp5-client/src/front/components/inventory", "skymp5-client/src/front/messages", "skymp5-client/src/front/remoteServer", "skymp5-client/src/front/networking", "skymp5-client/src/front/loadGameManager", "skymp5-client/src/front/deathSystem", "skymp5-client/src/front/console", "skymp5-client/src/front/hostAttempts", "skymp5-client/src/front/updateOwner", "skymp5-client/src/front/components/actorvalues", "skymp5-client/src/front/components/hit"], function (exports_35, context_35) {
    "use strict";
    var skyrimPlatform_16, view_4, movement_2, look_3, animation_2, equipment_3, inventory_4, messages_3, remoteServer_1, networking, sp, loadGameManager, deathSystem, console_1, hostAttempts_2, updateOwner, actorvalues_2, hit_1, handleMessage, targetIp, targetPort, SkympClient;
    var __moduleName = context_35 && context_35.id;
    return {
        setters: [
            function (skyrimPlatform_16_1) {
                skyrimPlatform_16 = skyrimPlatform_16_1;
                sp = skyrimPlatform_16_1;
            },
            function (view_4_1) {
                view_4 = view_4_1;
            },
            function (movement_2_1) {
                movement_2 = movement_2_1;
            },
            function (look_3_1) {
                look_3 = look_3_1;
            },
            function (animation_2_1) {
                animation_2 = animation_2_1;
            },
            function (equipment_3_1) {
                equipment_3 = equipment_3_1;
            },
            function (inventory_4_1) {
                inventory_4 = inventory_4_1;
            },
            function (messages_3_1) {
                messages_3 = messages_3_1;
            },
            function (remoteServer_1_1) {
                remoteServer_1 = remoteServer_1_1;
            },
            function (networking_2) {
                networking = networking_2;
            },
            function (loadGameManager_2) {
                loadGameManager = loadGameManager_2;
            },
            function (deathSystem_3) {
                deathSystem = deathSystem_3;
            },
            function (console_1_1) {
                console_1 = console_1_1;
            },
            function (hostAttempts_2_1) {
                hostAttempts_2 = hostAttempts_2_1;
            },
            function (updateOwner_2) {
                updateOwner = updateOwner_2;
            },
            function (actorvalues_2_1) {
                actorvalues_2 = actorvalues_2_1;
            },
            function (hit_1_1) {
                hit_1 = hit_1_1;
            }
        ],
        execute: function () {
            handleMessage = function (msgAny, handler_) {
                try {
                var msgType = msgAny && (msgAny.type || messages_3.MsgType[msgAny.t]);
                var handler = handler_;
                var f = handler && handler[msgType];
                // VOA: while waiting for spawn, log every inbound message type (helps diagnose login stuck)
                try {
                    var loggingIn = skyrimPlatform_16.storage["voaLoggingIn"];
                    if (loggingIn && msgType && msgType !== "UpdateMovement") {
                        skyrimPlatform_16.printConsole("VOA: rx during login: " + msgType + (msgAny && msgAny.isMe ? " isMe" : "") + (f ? "" : " (NO HANDLER)"));
                    }
                }
                catch (eRx) { /* ignore */ }
                /*if (msgType !== "UpdateMovement") {
                  printConsole();
                  for (const key in msgAny) {
                    const v = (msgAny as Record<string, any>)[key];
                    printConsole(`${key}=${JSON.stringify(v)}`);
                  }
                }*/
                if (msgType === "hostStart") {
                    var msg = msgAny;
                    var target = msg.target;
                    skyrimPlatform_16.printConsole("hostStart", target.toString(16));
                    var hosted = skyrimPlatform_16.storage["hosted"];
                    if (typeof hosted !== typeof []) {
                        // if you try to switch to Set checkout .concat usage.
                        // concat compiles but doesn't work as expected
                        hosted = new Array();
                        skyrimPlatform_16.storage["hosted"] = hosted;
                    }
                    if (!hosted.includes(target)) {
                        hosted.push(target);
                    }
                }
                if (msgType === "hostStop") {
                    var msg = msgAny;
                    var target_1 = msg.target;
                    skyrimPlatform_16.printConsole("hostStop", target_1.toString(16));
                    var hosted = skyrimPlatform_16.storage["hosted"];
                    if (typeof hosted === typeof []) {
                        skyrimPlatform_16.storage["hosted"] = hosted.filter(function (x) { return x !== target_1; });
                    }
                }
                if (f && typeof f === "function")
                    handler[msgType](msgAny);
                else if (msgType && msgType !== "UpdateMovement" && skyrimPlatform_16.storage["voaLoggingIn"]) {
                    skyrimPlatform_16.printConsole("VOA: unhandled msg type during login: " + msgType);
                }
                }
                catch (eHm) {
                    try {
                        skyrimPlatform_16.printConsole("VOA: handleMessage error: " + eHm + " stack=" + (eHm && eHm.stack));
                    }
                    catch (e2) { /* ignore */ }
                }
            };
            for (var i = 0; i < 100; ++i)
                skyrimPlatform_16.printConsole();
            skyrimPlatform_16.printConsole("Hello Multiplayer");
            skyrimPlatform_16.printConsole("settings:", skyrimPlatform_16.settings["skymp5-client"]);
            targetIp = skyrimPlatform_16.settings["skymp5-client"]["server-ip"];
            targetPort = skyrimPlatform_16.settings["skymp5-client"]["server-port"];
            // VOA: always connect on plugin load (storage skip left players stuck on main menu)
            skyrimPlatform_16.storage.targetIp = targetIp;
            skyrimPlatform_16.storage.targetPort = targetPort;
            skyrimPlatform_16.printConsole("Connecting to " + targetIp + ":" + targetPort + " (forced)");
            networking.connect(targetIp, targetPort);
            SkympClient = /** @class */ (function () {
                function SkympClient() {
                    var _this = this;
                    this.playerAnimSource = new Map();
                    this.lastSendMovementMoment = new Map();
                    this.lastAnimationSent = new Map();
                    this.msgHandler = undefined;
                    this.sendTarget = undefined;
                    this.isRaceSexMenuShown = false;
                    this.singlePlayer = false;
                    this.equipmentChanged = false;
                    this.numEquipmentChanges = 0;
                    this.prevValues = { health: 0, stamina: 0, magicka: 0 };
                    this.prevActorValuesUpdateTime = 0;
                    this.actorValuesNeedUpdate = false;
                    this.resetView();
                    this.resetRemoteServer();
                    animation_2.setupHooks();
                    updateOwner.setup();
                    sp.printConsole("SkympClient ctor");
                    // VOA: expose send + id maps for playerInteract (names / radial / trade)
                    try {
                        var self = this;
                        // Host property (NOT storage) Ã¢â‚¬â€ safe to call from browser module
                        skyrimPlatform_16._voaEmit = function (msg, reliable) {
                            try {
                                if (self.sendTarget && typeof self.sendTarget.send === "function") {
                                    self.sendTarget.send(msg, reliable !== false);
                                    return true;
                                }
                            }
                            catch (eS) { /* ignore */ }
                            return false;
                        };
                        skyrimPlatform_16.storage._voaSendFn = function (msg, reliable) {
                            try {
                                if (self.sendTarget)
                                    self.sendTarget.send(msg, reliable !== false);
                            }
                            catch (eS) { /* ignore */ }
                        };
                        skyrimPlatform_16.storage._voaLocalToRemote = function (localId) {
                            try {
                                return self.localIdToRemoteId(localId);
                            }
                            catch (e) {
                                return 0;
                            }
                        };
                        skyrimPlatform_16.storage._voaRemoteToLocal = function (remoteId) {
                            try {
                                return self.remoteIdToLocalId(remoteId);
                            }
                            catch (e) {
                                return 0;
                            }
                        };
                    }
                    catch (eMap) { /* ignore */ }
                    networking.on("connectionFailed", function () {
                        skyrimPlatform_16.printConsole("Connection failed");
                    });
                    networking.on("connectionDenied", function (err) {
                        skyrimPlatform_16.printConsole("Connection denied: ", err);
                    });
                    networking.on("connectionAccepted", function () {
                        try {
                            skyrimPlatform_16.storage["voaConnected"] = true;
                        }
                        catch (eAc) { /* ignore */ }
                        _this.msgHandler.handleConnectionAccepted();
                    });
                    networking.on("disconnect", function () {
                        try {
                            skyrimPlatform_16.storage["voaConnected"] = false;
                        }
                        catch (eDc) { /* ignore */ }
                        // Force-save BEFORE teardown — covers Alt+F4 after TCP dies, kick, server stop
                        try {
                            _this.reportCharacterState(true, "net-disconnect");
                        }
                        catch (eDisc) { /* ignore */ }
                        _this.msgHandler.handleDisconnect();
                    });
                    networking.on("message", function (msgAny) {
                        handleMessage(msgAny, _this.msgHandler);
                    });
                    // Expose force-save for RemoteServer handleDisconnect / other modules
                    try {
                        skyrimPlatform_16.storage._voaForceCharSave = function (reason) {
                            try {
                                _this.reportCharacterState(true, reason || "force");
                            }
                            catch (eF) { /* ignore */ }
                        };
                    }
                    catch (eStor) { /* ignore */ }
                    // Quit / main menu / pause Ã¢â‚¬â€ best chance to persist before forced process kill.
                    // NEVER flush on Loading Menu (door/cell travel) Ã¢â‚¬â€ that was kicking players
                    // via huge CustomEvent packets mid-teleport.
                    skyrimPlatform_16.on("menuOpen", function (e) {
                        try {
                            var name = (e && (e.name || e.menuName)) || "";
                            name = String(name);
                            if (name === "Loading Menu")
                                return;
                            if (name === "Quit Game" ||
                                name === "Main Menu" ||
                                name === "Journal Menu" ||
                                name === "Pause Menu" ||
                                name.indexOf("Quit") >= 0) {
                                _this.reportCharacterState(true, "menu:" + name);
                            }
                        }
                        catch (eMenu) { /* ignore */ }
                    });
                    // Inventory/gear changes — debounced HTTP flush (not on every equip during combat)
                    // NOTE: server starter-kit / property sets can spam containerChanged; 45s debounce
                    // avoids constant "VOA state flush" while standing still.
                    skyrimPlatform_16.on("containerChanged", function () {
                        try {
                            _this._voaInvDirty = true;
                        }
                        catch (eInv) { /* ignore */ }
                    });
                    skyrimPlatform_16.on("equip", function () {
                        try {
                            _this._voaInvDirty = true;
                        }
                        catch (eEq) { /* ignore */ }
                    });
                    skyrimPlatform_16.on("unequip", function () {
                        try {
                            _this._voaInvDirty = true;
                        }
                        catch (eUeq) { /* ignore */ }
                    });
                    skyrimPlatform_16.on("update", function () {
                        if (!_this.singlePlayer) {
                            _this.sendInputs();
                            // Dirty inventory flush (max once / 45s) — HTTP only, safe UTF-8
                            if (_this._voaInvDirty) {
                                var nowInv = Date.now();
                                if (!_this._voaLastInvFlush || nowInv - _this._voaLastInvFlush > 45000) {
                                    _this._voaInvDirty = false;
                                    _this._voaLastInvFlush = nowInv;
                                    try {
                                        _this.reportCharacterState(true, "inv-dirty");
                                    }
                                    catch (eFlush) { /* ignore */ }
                                }
                            }
                        }
                    });
                    var lastInv;
                    skyrimPlatform_16.once("update", function () {
                        var send = function (msg) {
                            _this.sendTarget.send(msg, true);
                        };
                        var localIdToRemoteId = function (localId) {
                            return _this.localIdToRemoteId(localId);
                        };
                        console_1.setUpConsoleCommands(send, localIdToRemoteId);
                    });
                    skyrimPlatform_16.on("activate", function (e) {
                        lastInv = inventory_4.getInventory(skyrimPlatform_16.Game.getPlayer());
                        var caster = e.caster ? e.caster.getFormID() : 0;
                        var target = e.target ? e.target.getFormID() : 0;
                        if (!target || !caster)
                            return;
                        // Actors never have non-ff ids locally in skymp
                        if (caster !== 0x14 && caster < 0xff000000)
                            return;
                        // VOA: detect load doors before id remap (for openState + fallback)
                        var isDoor = false;
                        try {
                            var baseDoor = e.target.getBaseObject && e.target.getBaseObject();
                            isDoor = !!(baseDoor && baseDoor.getType && baseDoor.getType() === 29);
                        }
                        catch (eIsDoor) { /* ignore */ }
                        // Keep door usable even if a prior dealWithRef blocked it
                        if (isDoor) {
                            try {
                                e.target.blockActivation(false);
                            }
                            catch (eUnb) { /* ignore */ }
                        }
                        target = _this.localIdToRemoteId(target);
                        if (!target)
                            return skyrimPlatform_16.printConsole("localIdToRemoteId returned 0 (target)");
                        caster = _this.localIdToRemoteId(caster);
                        if (!caster)
                            return skyrimPlatform_16.printConsole("localIdToRemoteId returned 0 (caster)");
                        var openState = e.target.getOpenState();
                        // Stock skips Opening/Closing Ã¢â‚¬â€ that permanently blocks exit doors stuck mid-anim.
                        // Still skip for non-doors; always allow door Activate packets.
                        if (!isDoor && (openState === 2 /* Opening */ || openState === 4 /* Closing */))
                            return;
                        // VOA: full Activate payload (idx added by RemoteServer.send).
                        // isSecondActivation required by modern MpClientPlugin schemas.
                        var actiMsg = {
                            t: messages_3.MsgType.Activate,
                            data: {
                                caster: caster,
                                target: target,
                                isSecondActivation: false,
                            },
                        };
                        try {
                            _this.sendTarget.send(actiMsg, true);
                            skyrimPlatform_16.printConsole("sendActi", actiMsg.data, isDoor ? "(door)" : "");
                        }
                        catch (eActi) {
                            skyrimPlatform_16.printConsole("sendActi FAILED: " + eActi + " data=" + JSON.stringify(actiMsg.data));
                        }
                        // VOA door fallback: if server never queues a Teleport, force local activate
                        // so players are not trapped in interiors (player-only world).
                        if (isDoor) {
                            try {
                                var doorLocalId = e.target.getFormID();
                                var markAt = Date.now();
                                skyrimPlatform_16.storage["voaDoorActiAt"] = markAt;
                                skyrimPlatform_16.storage["voaDoorActiId"] = doorLocalId;
                                var tryLocalDoor = function (label) {
                                    try {
                                        var pending = skyrimPlatform_16.storage["voaPendingTeleport"];
                                        if (pending && !pending.done && (Date.now() - (pending.at || 0)) < 5000)
                                            return; // server TP in flight
                                        if (skyrimPlatform_16.storage["voaDoorActiAt"] !== markAt)
                                            return;
                                        var form = skyrimPlatform_16.Game.getFormEx(doorLocalId);
                                        var doorRef = form ? skyrimPlatform_16.ObjectReference.from(form) : null;
                                        if (!doorRef)
                                            return;
                                        try {
                                            doorRef.blockActivation(false);
                                        }
                                        catch (eB) { /* ignore */ }
                                        var pc = skyrimPlatform_16.Game.getPlayer();
                                        if (!pc)
                                            return;
                                        skyrimPlatform_16.printConsole("VOA: door local fallback (" + label + ") id=" + doorLocalId.toString(16));
                                        try {
                                            doorRef.activate(pc, true);
                                        }
                                        catch (eAct) {
                                            try {
                                                // Second chance: clear open-state deadlock
                                                if (typeof doorRef.setOpen === "function")
                                                    doorRef.setOpen(true, false, true);
                                            }
                                            catch (eOp) { /* ignore */ }
                                        }
                                    }
                                    catch (eFb) {
                                        try {
                                            skyrimPlatform_16.printConsole("VOA: door fallback err " + eFb);
                                        }
                                        catch (e2) { /* ignore */ }
                                    }
                                };
                                try {
                                    skyrimPlatform_16.Utility.wait(1.2).then(function () { tryLocalDoor("1.2s"); });
                                    skyrimPlatform_16.Utility.wait(2.5).then(function () { tryLocalDoor("2.5s"); });
                                }
                                catch (eWaitDoor) {
                                    // SP wait failed Ã¢â‚¬â€ still try on next updates
                                    var tries = 0;
                                    var h = function () {
                                        tries++;
                                        if (tries < 40)
                                            return; // ~0.6s if 60fps
                                        skyrimPlatform_16.storage["voaDoorFallbackHook"] = false;
                                        tryLocalDoor("update");
                                    };
                                    if (!skyrimPlatform_16.storage["voaDoorFallbackHook"]) {
                                        skyrimPlatform_16.storage["voaDoorFallbackHook"] = true;
                                        skyrimPlatform_16.on("update", h);
                                    }
                                }
                            }
                            catch (eDoorFb) { /* ignore */ }
                        }
                    });
                    var furnitureStreak = new Map();
                    skyrimPlatform_16.on("containerChanged", function (e) {
                        var oldContainerId = e.oldContainer ? e.oldContainer.getFormID() : 0;
                        var newContainerId = e.newContainer ? e.newContainer.getFormID() : 0;
                        var baseObjId = e.baseObj ? e.baseObj.getFormID() : 0;
                        if (oldContainerId !== 0x14 && newContainerId !== 0x14)
                            return;
                        var furnitureRef = skyrimPlatform_16.Game.getPlayer().getFurnitureReference();
                        if (!furnitureRef)
                            return;
                        var furrnitureId = furnitureRef.getFormID();
                        if (oldContainerId === 0x14 && newContainerId === 0) {
                            var craftInputObjects = furnitureStreak.get(furrnitureId);
                            if (!craftInputObjects) {
                                craftInputObjects = { entries: [] };
                            }
                            craftInputObjects.entries.push({
                                baseId: baseObjId,
                                count: e.numItems,
                            });
                            furnitureStreak.set(furrnitureId, craftInputObjects);
                            skyrimPlatform_16.printConsole("Adding " + baseObjId.toString(16) + " (" + e.numItems + ") to recipe");
                        }
                        else if (oldContainerId === 0 && newContainerId === 0x14) {
                            skyrimPlatform_16.printConsole("Flushing recipe");
                            var craftInputObjects = furnitureStreak.get(furrnitureId);
                            if (craftInputObjects && craftInputObjects.entries.length) {
                                furnitureStreak.delete(furrnitureId);
                                var workbench = _this.localIdToRemoteId(furrnitureId);
                                if (!workbench)
                                    return skyrimPlatform_16.printConsole("localIdToRemoteId returned 0");
                                _this.sendTarget.send({
                                    t: messages_3.MsgType.CraftItem,
                                    data: { workbench: workbench, craftInputObjects: craftInputObjects, resultObjectId: baseObjId },
                                }, true);
                                skyrimPlatform_16.printConsole("sendCraft", {
                                    workbench: workbench,
                                    craftInputObjects: craftInputObjects,
                                    resultObjectId: baseObjId,
                                });
                            }
                        }
                    });
                    skyrimPlatform_16.on("containerChanged", function (e) {
                        if (e.oldContainer && e.newContainer) {
                            if (e.oldContainer.getFormID() === 0x14 ||
                                e.newContainer.getFormID() === 0x14) {
                                skyrimPlatform_16.printConsole(1);
                                if (!lastInv)
                                    lastInv = remoteServer_1.getPcInventory();
                                if (lastInv) {
                                    skyrimPlatform_16.printConsole(2);
                                    var newInv = inventory_4.getInventory(skyrimPlatform_16.Game.getPlayer());
                                    // It seems that 'ignoreWorn = false' fixes this:
                                    // https://github.com/skyrim-multiplayer/issue-tracker/issues/43
                                    // For some reason excess diff is produced when 'ignoreWorn = true'
                                    // I thought that it would be vice versa but that's how it works
                                    var ignoreWorn = false;
                                    var diff = inventory_4.getDiff(lastInv, newInv, ignoreWorn);
                                    skyrimPlatform_16.printConsole("diff:");
                                    for (var i = 0; i < diff.entries.length; ++i) {
                                        skyrimPlatform_16.printConsole("[" + i + "] " + JSON.stringify(diff.entries[i]));
                                    }
                                    var msgs = diff.entries.map(function (entry) {
                                        if (entry.count !== 0) {
                                            var msg = JSON.parse(JSON.stringify(entry));
                                            delete msg["name"]; // Extra name works too strange
                                            msg["t"] = entry.count > 0 ? messages_3.MsgType.PutItem : messages_3.MsgType.TakeItem;
                                            msg["count"] = Math.abs(msg["count"]);
                                            msg["target"] =
                                                e.oldContainer.getFormID() === 0x14
                                                    ? e.newContainer.getFormID()
                                                    : e.oldContainer.getFormID();
                                            return msg;
                                        }
                                    });
                                    msgs.forEach(function (msg) { return _this.sendTarget.send(msg, true); });
                                }
                            }
                        }
                    });
                    var playerFormId = 0x14;
                    skyrimPlatform_16.on("equip", function (e) {
                        if (!e.actor || !e.baseObj)
                            return;
                        if (e.actor.getFormID() === playerFormId) {
                            _this.equipmentChanged = true;
                            _this.sendTarget.send({ t: messages_3.MsgType.OnEquip, baseId: e.baseObj.getFormID() }, false);
                        }
                    });
                    skyrimPlatform_16.on("unequip", function (e) {
                        if (!e.actor || !e.baseObj)
                            return;
                        if (e.actor.getFormID() === playerFormId) {
                            _this.equipmentChanged = true;
                        }
                    });
                    skyrimPlatform_16.on("loadGame", function () {
                        // Currently only armor is equipped after relogging (see remoteServer.ts)
                        // This hack forces sending /equipment without weapons/ back to the server
                        skyrimPlatform_16.Utility.wait(3).then(function () { return (_this.equipmentChanged = true); });
                    });
                    loadGameManager.addLoadGameListener(function (e) {
                        if (!e.isCausedBySkyrimPlatform && !_this.singlePlayer) {
                            // VOA: race menu / chargen / spawn loadGame often reports isCausedBySkyrimPlatform=false
                            // Do NOT kick to single-player (was breaking first join + race menu).
                            try {
                                if (skyrimPlatform_16.Ui.isMenuOpen("RaceSex Menu") ||
                                    skyrimPlatform_16.Ui.isMenuOpen("Main Menu") ||
                                    skyrimPlatform_16.Ui.isMenuOpen("Loading Menu")) {
                                    skyrimPlatform_16.printConsole("VOA: ignoring non-SP loadGame during menu/chargen");
                                    return;
                                }
                            } catch (eIgnore) { /* ignore */ }
                            // Soft handling: stay connected; only log (was: disconnect + SP mode)
                            skyrimPlatform_16.printConsole("VOA: non-SP loadGame detected ??? staying in multiplayer");
                            return;
                        }
                    });
                    skyrimPlatform_16.on("update", function () {
                        deathSystem.update(function (msg, reliable) {
                            try {
                                _this.sendTarget.send(msg, reliable);
                            }
                            catch (e) { /* ignore */ }
                        });
                    });
                    skyrimPlatform_16.once("update", function () {
                        var player = skyrimPlatform_16.Game.getPlayer();
                        if (player) {
                            deathSystem.makeActorImmortal(player);
                        }
                    });
                    // VOA: Healing Hands / Heal Other revive downed allies (and self-cast edge cases)
                    var HEAL_SPELLS = {
                        0x12fcc: 1, // Healing Hands
                        0x12fd2: 1, // Heal Other
                        0xb62ee: 1, // Grand Healing
                    };
                    skyrimPlatform_16.on("hit", function (e) {
                        var tgtId = e.target ? e.target.getFormID() : 0;
                        var agrId = e.agressor ? e.agressor.getFormID() : 0;
                        var srcId = e.source ? e.source.getFormID() : 0;
                        // VOA: we got hit ??? if HP is critical, enter downed (don't hard-die)
                        if (tgtId === playerFormId) {
                            try {
                                var me = skyrimPlatform_16.Game.getPlayer();
                                if (me) {
                                    me.startDeferredKill();
                                    var myHp = me.getActorValuePercentage("health");
                                    if (myHp <= 0.05 || me.isDead()) {
                                        deathSystem.enterDowned("hit", function (msg, reliable) {
                                            try {
                                                _this.sendTarget.send(msg, reliable);
                                            }
                                            catch (eS) { /* ignore */ }
                                        });
                                    }
                                }
                            }
                            catch (eHitMe) { /* ignore */ }
                            return;
                        }
                        // Revive: we cast a healing spell at another actor who is downed
                        if (agrId === playerFormId && tgtId !== playerFormId && HEAL_SPELLS[srcId]) {
                            var remoteTgt = _this.localIdToRemoteId(tgtId);
                            if (remoteTgt) {
                                try {
                                    _this.sendTarget.send({
                                        t: messages_3.MsgType.CustomEvent,
                                        eventName: "_voaRevive",
                                        args: [remoteTgt],
                                        argsJsonDumps: [JSON.stringify(remoteTgt)],
                                    }, true);
                                    skyrimPlatform_16.printConsole("VOA revive (heal spell) -> " + remoteTgt.toString(16));
                                    skyrimPlatform_16.Debug.notification("Attempting revive...");
                                }
                                catch (err) {
                                    skyrimPlatform_16.printConsole("VOA revive send failed: " + err);
                                }
                            }
                            return;
                        }
                        // Normal combat OnHit (player is aggressor, not healing)
                        if (tgtId === playerFormId)
                            return;
                        if (agrId !== playerFormId)
                            return;
                        if (skyrimPlatform_16.Actor.from(e.target)) {
                            try {
                                // Native scamp OnHit has no damage on VOA build ??? still send for completeness
                                _this.sendTarget.send({ t: messages_3.MsgType.OnHit, data: hit_1.getHitData(e) }, true);
                            } catch (err) {
                                skyrimPlatform_16.printConsole("VOA OnHit send failed: " + err);
                            }
                            // VOA authoritative PvP: CustomEvent ??? gamemode mp.set(healthPercentage)
                            try {
                                var remoteTgt = _this.localIdToRemoteId(tgtId);
                                if (remoteTgt && (remoteTgt >>> 0) >= 0xff000000) {
                                    var dmg = 0.22;
                                    try {
                                        if (e.isPowerAttack)
                                            dmg = 0.32;
                                        else if (e.isBashAttack)
                                            dmg = 0.14;
                                        else if (e.isSneakAttack)
                                            dmg = 0.28;
                                    }
                                    catch (eD) { /* ignore */ }
                                    _this.sendTarget.send({
                                        t: messages_3.MsgType.CustomEvent,
                                        eventName: "_voaHit",
                                        args: [remoteTgt, dmg],
                                        argsJsonDumps: [JSON.stringify(remoteTgt), JSON.stringify(dmg)],
                                    }, true);
                                    skyrimPlatform_16.printConsole("VOA hit pvp -> " + remoteTgt.toString(16) + " dmg=" + dmg);
                                }
                                else {
                                    skyrimPlatform_16.printConsole("VOA hit skip (no remote id for local " + tgtId.toString(16) + ")");
                                }
                            }
                            catch (err2) {
                                skyrimPlatform_16.printConsole("VOA _voaHit send failed: " + err2);
                            }
                        }
                    });
                    // VOA: pressing E on a downed player attempts revive
                    skyrimPlatform_16.on("activate", function (e) {
                        try {
                            if (!e.caster || !e.target)
                                return;
                            if (e.caster.getFormID() !== playerFormId)
                                return;
                            var ac = skyrimPlatform_16.Actor.from(e.target);
                            if (!ac)
                                return;
                            var localTgt = e.target.getFormID();
                            if (localTgt === playerFormId)
                                return;
                            // Only revive actors that look dead / have 0 health
                            var deadish = false;
                            try {
                                deadish = ac.isDead() || ac.getActorValuePercentage("health") <= 0.01;
                            }
                            catch (e2) {
                                deadish = false;
                            }
                            if (!deadish)
                                return;
                            var remoteTgt = _this.localIdToRemoteId(localTgt);
                            if (!remoteTgt)
                                return;
                            _this.sendTarget.send({
                                t: messages_3.MsgType.CustomEvent,
                                eventName: "_voaRevive",
                                args: [remoteTgt],
                                argsJsonDumps: [JSON.stringify(remoteTgt)],
                            }, true);
                            skyrimPlatform_16.printConsole("VOA revive (E) -> " + remoteTgt.toString(16));
                            skyrimPlatform_16.Debug.notification("Attempting revive...");
                        }
                        catch (err) {
                            skyrimPlatform_16.printConsole("VOA activate revive: " + err);
                        }
                    });
                }
                // May return null
                SkympClient.prototype.getInputOwner = function (_refrId) {
                    return _refrId
                        ? skyrimPlatform_16.Actor.from(skyrimPlatform_16.Game.getFormEx(this.remoteIdToLocalId(_refrId)))
                        : skyrimPlatform_16.Game.getPlayer();
                };
                SkympClient.prototype.sendMovement = function (_refrId) {
                    var owner = this.getInputOwner(_refrId);
                    if (!owner)
                        return;
                    var refrIdStr = "" + _refrId;
                    var sendMovementRateMs = 130;
                    var now = Date.now();
                    var last = this.lastSendMovementMoment.get(refrIdStr);
                    if (!last || now - last > sendMovementRateMs) {
                        this.sendTarget.send({
                            t: messages_3.MsgType.UpdateMovement,
                            data: movement_2.getMovement(owner),
                            _refrId: _refrId,
                        }, false);
                        this.lastSendMovementMoment.set(refrIdStr, now);
                    }
                };
                SkympClient.prototype.sendAnimation = function (_refrId) {
                    var owner = this.getInputOwner(_refrId);
                    if (!owner)
                        return;
                    // Extermly important that it's a local id since AnimationSource depends on it
                    var refrIdStr = owner.getFormID().toString(16);
                    var animSource = this.playerAnimSource.get(refrIdStr);
                    if (!animSource) {
                        animSource = new animation_2.AnimationSource(owner);
                        this.playerAnimSource.set(refrIdStr, animSource);
                    }
                    var anim = animSource.getAnimation();
                    var lastAnimationSent = this.lastAnimationSent.get(refrIdStr);
                    if (!lastAnimationSent ||
                        anim.numChanges !== lastAnimationSent.numChanges) {
                        if (anim.animEventName !== "") {
                            this.lastAnimationSent.set(refrIdStr, anim);
                            this.updateActorValuesAfterAnimation(anim.animEventName);
                            // VOA: combat + magic anims reliable so friends see punches/casts/VFX triggers
                            var animName = (anim.animEventName || "").toLowerCase();
                            var reliableAnim = animName.indexOf("attack") !== -1 ||
                                animName.indexOf("bash") !== -1 ||
                                animName.indexOf("hit") !== -1 ||
                                animName.indexOf("recoil") !== -1 ||
                                animName.indexOf("stagger") !== -1 ||
                                animName.indexOf("ragdoll") !== -1 ||
                                animName.indexOf("spell") !== -1 ||
                                animName.indexOf("mag") !== -1 ||
                                animName.indexOf("cast") !== -1 ||
                                animName.indexOf("ward") !== -1 ||
                                animName.indexOf("dualcast") !== -1 ||
                                animName.indexOf("concentration") !== -1 ||
                                animName.indexOf("bound") !== -1 ||
                                animName.indexOf("summon") !== -1 ||
                                animName.indexOf("block") !== -1;
                            this.sendTarget.send({ t: messages_3.MsgType.UpdateAnimation, data: anim, _refrId: _refrId }, reliableAnim);
                            if (skyrimPlatform_16.storage._api_onAnimationEvent &&
                                skyrimPlatform_16.storage._api_onAnimationEvent.callback) {
                                try {
                                    skyrimPlatform_16.storage._api_onAnimationEvent.callback(_refrId ? _refrId : 0x14, anim.animEventName);
                                }
                                catch (e) {
                                    skyrimPlatform_16.printConsole("'_api_onAnimationEvent' -", e);
                                }
                            }
                        }
                    }
                };
                SkympClient.prototype.reportCharacterName = function (name) {
                    if (!name || typeof name !== "string")
                        return;
                    var slot = 0;
                    var profileId = 0;
                    var session = "";
                    var apiBase = "http://127.0.0.1:3100";
                    try {
                        var gd = skyrimPlatform_16.settings["skymp5-client"]["gameData"] || {};
                        if (typeof gd.characterSlot === "number")
                            slot = gd.characterSlot;
                        if (typeof gd.profileId === "number")
                            profileId = gd.profileId;
                        if (typeof gd.session === "string")
                            session = gd.session;
                        var master = skyrimPlatform_16.settings["skymp5-client"]["master"];
                        // Prefer local API for launcher DB; master may be public URL
                        if (typeof master === "string" && master.indexOf("127.0.0.1") >= 0)
                            apiBase = master.replace(/\/$/, "");
                    }
                    catch (e) { /* ignore */ }
                    // 1) Server log path (status ??? launcher merge)
                    try {
                        this.sendTarget.send({
                            t: messages_3.MsgType.CustomEvent,
                            eventName: "_voaCharacterName",
                            args: [profileId, slot, name],
                            argsJsonDumps: [JSON.stringify(profileId), JSON.stringify(slot), JSON.stringify(name)],
                        }, true);
                    }
                    catch (e2) { /* ignore */ }
                    // 2) Direct local API so Characters tab shows in-game name immediately
                    if (session) {
                        try {
                            var client = new skyrimPlatform_16.HttpClient(apiBase);
                            var body = JSON.stringify({
                                session: session,
                                profileId: profileId,
                                slot: slot,
                                name: name,
                            });
                            client.post("/v1/game/character-name", {
                                body: body,
                                contentType: "application/json",
                            }).then(function (res) {
                                skyrimPlatform_16.printConsole("VOA name API status=" + (res && res.status) + " name=" + name);
                            }).catch(function (err) {
                                skyrimPlatform_16.printConsole("VOA name API failed: " + err);
                            });
                        }
                        catch (e3) {
                            skyrimPlatform_16.printConsole("VOA name HttpClient: " + e3);
                        }
                    }
                    skyrimPlatform_16.printConsole("VOA character name p" + profileId + " slot " + slot + " => " + name);
                };
                /**
                 * VOA character DB: push name, pos, equipment, inventory, discovered map markers
                 * to the platform API (and game-server custom event for gamemode mirror).
                 */
                SkympClient.prototype.reportCharacterState = function (force, reason) {
                    var now = Date.now();
                    // Normal cadence ~45s; force (disconnect / quit / inv) always sends
                    // (Was 20s; too chatty with starter-kit inventory thrash while AFK.)
                    if (!force && this._voaLastStateReport && now - this._voaLastStateReport < 45000)
                        return;
                    // Even forced saves: de-dupe within 1.5s so menu spam doesn't flood API
                    if (force && this._voaLastForceReport && now - this._voaLastForceReport < 1500)
                        return;
                    this._voaLastStateReport = now;
                    if (force)
                        this._voaLastForceReport = now;
                    reason = reason || (force ? "force" : "interval");
                    var slot = 0;
                    var profileId = 0;
                    var session = "";
                    var apiBase = "http://127.0.0.1:3100";
                    try {
                        var gd = skyrimPlatform_16.settings["skymp5-client"]["gameData"] || {};
                        if (typeof gd.characterSlot === "number")
                            slot = gd.characterSlot;
                        if (typeof gd.profileId === "number")
                            profileId = gd.profileId;
                        if (typeof gd.session === "string")
                            session = gd.session;
                        var master = skyrimPlatform_16.settings["skymp5-client"]["master"];
                        if (typeof master === "string" && master.length) {
                            // Prefer public master URL so state hits the real API, not only 127.0.0.1
                            apiBase = master.replace(/\/$/, "");
                        }
                    }
                    catch (e0) { /* ignore */ }
                    var player = skyrimPlatform_16.Game.getPlayer();
                    if (!player)
                        return;
                    // Hardlink: always report remote actor form id when known
                    var actorFormId = 0;
                    try {
                        if (typeof skyrimPlatform_16.storage._voaLocalToRemote === "function") {
                            actorFormId = Number(skyrimPlatform_16.storage._voaLocalToRemote(0x14)) || 0;
                        }
                    }
                    catch (eAf) { /* ignore */ }
                    if (!actorFormId) {
                        try {
                            // fallback: self remote from world model if exposed later
                            actorFormId = Number(skyrimPlatform_16.storage["voaSelfRemoteId"]) || 0;
                        }
                        catch (eAf2) { /* ignore */ }
                    }
                    // Never report local PC form 0x14 as multiplayer hardlink
                    if (actorFormId > 0 && actorFormId < 0xff000000) {
                        actorFormId = 0;
                    }
                    var name = "";
                    var appearance = null;
                    var equipment = null;
                    var inventory = null;
                    var pos = null;
                    var angleZ = 0;
                    var worldOrCell = 0;
                    try {
                        var look = look_3.getLook(player);
                        if (look) {
                            appearance = look;
                            if (look.name)
                                name = look.name;
                        }
                    }
                    catch (eL) { /* ignore */ }
                    try {
                        equipment = equipment_3.getEquipment(player, this.numEquipmentChanges || 0);
                    }
                    catch (eE) { /* ignore */ }
                    try {
                        inventory = inventory_4.getInventory(player);
                    }
                    catch (eI) { /* ignore */ }
                    try {
                        pos = [
                            player.getPositionX(),
                            player.getPositionY(),
                            player.getPositionZ(),
                        ];
                        angleZ = player.getAngleZ();
                    }
                    catch (eP) { /* ignore */ }
                    try {
                        var cell = player.getParentCell();
                        var world = player.getWorldSpace();
                        if (cell)
                            worldOrCell = cell.getFormID();
                        else if (world)
                            worldOrCell = world.getFormID();
                    }
                    catch (eW) { /* ignore */ }
                    // Discovered map markers near the player (ObjectReference.isMapMarkerVisible)
                    var mapMarkers = [];
                    try {
                        var prev = skyrimPlatform_16.storage["voaMapMarkers"];
                        if (Array.isArray(prev))
                            mapMarkers = prev.slice();
                    }
                    catch (eM0) { /* ignore */ }
                    try {
                        // Sample nearby refs of type Statue/Activator/etc is expensive; scan last crosshair + known set
                        var known = skyrimPlatform_16.storage["voaMapMarkers"] || [];
                        if (!Array.isArray(known))
                            known = [];
                        // When map menu is open, mark current cell as discovered location
                        if (skyrimPlatform_16.Ui.isMenuOpen("MapMenu") && worldOrCell) {
                            var found = false;
                            for (var mi = 0; mi < known.length; mi++) {
                                if (known[mi] && known[mi].formId === worldOrCell)
                                    found = true;
                            }
                            if (!found) {
                                known.push({
                                    formId: worldOrCell,
                                    name: name || "Location",
                                    x: pos ? pos[0] : 0,
                                    y: pos ? pos[1] : 0,
                                    z: pos ? pos[2] : 0,
                                    at: now,
                                });
                            }
                        }
                        // Cap list
                        if (known.length > 200)
                            known = known.slice(known.length - 200);
                        skyrimPlatform_16.storage["voaMapMarkers"] = known;
                        mapMarkers = known;
                    }
                    catch (eM1) { /* ignore */ }
                    // Strip non-UTF8 / controls (inline Ã¢â‚¬â€ networking.voaSafeString is out of scope here)
                    var safeStr = function (s) {
                        s = String(s == null ? "" : s);
                        var out = "";
                        for (var i = 0; i < s.length; i++) {
                            var c = s.charCodeAt(i);
                            if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
                                var c2 = s.charCodeAt(i + 1);
                                if (c2 >= 0xdc00 && c2 <= 0xdfff) {
                                    out += s.charAt(i) + s.charAt(i + 1);
                                    i++;
                                    continue;
                                }
                                out += "?";
                                continue;
                            }
                            if (c >= 0xd800 && c <= 0xdfff) {
                                out += "?";
                                continue;
                            }
                            if (c < 0x09 || (c > 0x0d && c < 0x20) || c === 0x7f) {
                                continue;
                            }
                            out += s.charAt(i);
                        }
                        return out;
                    };
                    var scrubInv = function (inv) {
                        if (!inv || typeof inv !== "object")
                            return inv;
                        try {
                            var entries = inv.entries;
                            if (!Array.isArray(entries))
                                return { entries: [] };
                            var out = [];
                            for (var i = 0; i < entries.length; i++) {
                                var e = entries[i] || {};
                                var row = {
                                    baseId: Number(e.baseId) || 0,
                                    count: Number(e.count) || 0,
                                };
                                if (e.worn)
                                    row.worn = true;
                                if (e.wornLeft)
                                    row.wornLeft = true;
                                // Never send item display names (UTF-8 landmines Ã¢â€ â€™ server tick kill)
                                out.push(row);
                            }
                            return { entries: out };
                        }
                        catch (eSi) {
                            return { entries: [] };
                        }
                    };
                    var scrubEq = function (eq) {
                        if (!eq || typeof eq !== "object")
                            return eq;
                        try {
                            var copy = { numChanges: Number(eq.numChanges) || 0 };
                            if (eq.inv)
                                copy.inv = scrubInv(eq.inv);
                            return copy;
                        }
                        catch (eSe) {
                            return { numChanges: 0 };
                        }
                    };
                    var scrubLook = function (look) {
                        if (!look || typeof look !== "object")
                            return null;
                        try {
                            // Keep only essential fields; strip free-text where possible
                            var o = JSON.parse(JSON.stringify(look));
                            if (o && typeof o.name === "string")
                                o.name = safeStr(o.name).slice(0, 48);
                            return o;
                        }
                        catch (eSl) {
                            return null;
                        }
                    };
                    name = safeStr(name).slice(0, 48);
                    inventory = scrubInv(inventory);
                    equipment = scrubEq(equipment);
                    appearance = scrubLook(appearance);
                    // HTTP-only character DB write. Do NOT send full state as CustomEvent Ã¢â‚¬â€
                    // large inventory/appearance JSON with bad UTF-8 was killing server.tick
                    // (simdjson) and disconnecting everyone ("character flush kick").
                    if (session) {
                        try {
                            var client = new skyrimPlatform_16.HttpClient(apiBase);
                            var bodyObj = {
                                session: session,
                                profileId: profileId,
                                slot: slot,
                                name: name || undefined,
                                actorFormId: actorFormId || undefined,
                                worldOrCell: worldOrCell || undefined,
                                pos: pos || undefined,
                                angleZ: angleZ,
                                equipment: equipment,
                                inventory: inventory,
                                appearance: appearance,
                                mapMarkers: mapMarkers,
                                reason: reason,
                            };
                            var body = JSON.stringify(bodyObj);
                            client.post("/v1/game/character-state", {
                                body: body,
                                contentType: "application/json",
                            }).then(function (res) {
                                if (force) {
                                    skyrimPlatform_16.printConsole("VOA state flush reason=" + reason + " status=" + (res && res.status));
                                }
                                else if (res && res.status >= 400) {
                                    skyrimPlatform_16.printConsole("VOA state API status=" + res.status);
                                }
                            }).catch(function (err) {
                                if (force) {
                                    skyrimPlatform_16.printConsole("VOA state flush failed reason=" + reason + " err=" + err);
                                }
                            });
                        }
                        catch (eHttp) { /* ignore */ }
                    }
                };
                SkympClient.prototype.sendLook = function (_refrId) {
                    if (_refrId)
                        return;
                    var shown = skyrimPlatform_16.Ui.isMenuOpen("RaceSex Menu");
                    if (shown != this.isRaceSexMenuShown) {
                        this.isRaceSexMenuShown = shown;
                        if (!shown) {
                            skyrimPlatform_16.printConsole("Exited from race menu");
                            var look = look_3.getLook(skyrimPlatform_16.Game.getPlayer());
                            this.sendTarget.send({ t: messages_3.MsgType.UpdateLook, data: look, _refrId: _refrId }, true);
                            // VOA: push in-game name to server/launcher slots + local nameplate
                            if (look && look.name) {
                                this.reportCharacterName(look.name);
                                try {
                                    skyrimPlatform_16.storage["voaLocalPlayerName"] = String(look.name);
                                }
                                catch (eLn) { /* ignore */ }
                            }
                            // VOA: spawn protection after chargen (mudcrabs one-shot new chars otherwise)
                            try {
                                skyrimPlatform_16.storage["voaGrantSpawnProtect"] = Date.now() + 60000;
                            }
                            catch (eSp2) { /* ignore */ }
                            // VOA: new characters = ragged robes + boots only (no iron kit / potions / weapons)
                            try {
                                var needKit = skyrimPlatform_16.storage["voaNeedStarterKit"] === true;
                                var grace = Number(skyrimPlatform_16.storage["voaStarterGraceUntil"]) || 0;
                                if (needKit || grace > Date.now()) {
                                    skyrimPlatform_16.storage["voaNeedStarterKit"] = false;
                                    skyrimPlatform_16.storage["voaStarterGraceUntil"] = Date.now() + 90000;
                                    var selfKit = this;
                                    var ROBES_ID = 0x0003c9fe; // ClothesPrisonerClothes
                                    var BOOTS_ID = 0x0003ca00; // ClothesPrisonerShoes
                                    // Vanilla iron armor baseIds we must never keep during grace
                                    var IRON_BASES = {
                                        0x12e46: 1, 0x12e49: 1, 0x12e4b: 1, 0x12e4d: 1,
                                        0x12eb6: 1, 0x12eb7: 1, 0x1397d: 1, 0x1397e: 1, 0x13790: 1,
                                    };
                                    var applyRaggedOnly = function (why) {
                                        try {
                                            var player = skyrimPlatform_16.Game.getPlayer();
                                            if (!player)
                                                return;
                                            player.removeAllItems(null, false, true);
                                            var robesForm = skyrimPlatform_16.Game.getFormEx(ROBES_ID);
                                            var bootsForm = skyrimPlatform_16.Game.getFormEx(BOOTS_ID);
                                            if (robesForm) {
                                                player.addItem(robesForm, 1, true);
                                                var robesArmor = skyrimPlatform_16.Armor.from(robesForm);
                                                if (robesArmor)
                                                    player.equipItem(robesArmor, false, true);
                                            }
                                            if (bootsForm) {
                                                player.addItem(bootsForm, 1, true);
                                                var bootsArmor = skyrimPlatform_16.Armor.from(bootsForm);
                                                if (bootsArmor)
                                                    player.equipItem(bootsArmor, false, true);
                                            }
                                            try {
                                                skyrimPlatform_16.storage["pcInv"] = {
                                                    entries: [
                                                        { baseId: ROBES_ID, count: 1, worn: true },
                                                        { baseId: BOOTS_ID, count: 1, worn: true },
                                                    ],
                                                };
                                            }
                                            catch (ePc) { /* ignore */ }
                                            selfKit.equipmentChanged = true;
                                            skyrimPlatform_16.printConsole("VOA: starter inventory ragged robes+boots (" + why + ")");
                                        }
                                        catch (eKit) {
                                            skyrimPlatform_16.printConsole("VOA: starter kit failed: " + eKit);
                                        }
                                    };
                                    // Server authoritative
                                    try {
                                        if (selfKit.sendTarget && typeof selfKit.sendTarget.send === "function") {
                                            selfKit.sendTarget.send({
                                                t: messages_3.MsgType.CustomEvent,
                                                eventName: "_voaStarterKit",
                                                args: [],
                                                argsJsonDumps: [],
                                            }, true);
                                        }
                                    }
                                    catch (eEvt) { /* ignore */ }
                                    applyRaggedOnly("immediate");
                                    var delays = [0.3, 0.8, 1.5, 3.0, 6.0, 12.0, 20.0, 35.0, 55.0];
                                    for (var di = 0; di < delays.length; di++) {
                                        (function (d) {
                                            try {
                                                skyrimPlatform_16.Utility.wait(d).then(function () {
                                                    // Keep forcing while grace active (vanilla re-adds iron kit)
                                                    var g2 = Number(skyrimPlatform_16.storage["voaStarterGraceUntil"]) || 0;
                                                    if (g2 && Date.now() < g2)
                                                        applyRaggedOnly(d + "s");
                                                });
                                            }
                                            catch (eW) { /* ignore */ }
                                        })(delays[di]);
                                    }
                                    try {
                                        skyrimPlatform_16.Debug.notification("You begin with ragged robes and boots.");
                                    }
                                    catch (eN) { /* ignore */ }
                                    // Watchdog once: if iron reappears during grace, strip again
                                    try {
                                        if (!skyrimPlatform_16.storage["voaStarterWatchOn"]) {
                                            skyrimPlatform_16.storage["voaStarterWatchOn"] = true;
                                            var lastWatch = 0;
                                            skyrimPlatform_16.on("update", function () {
                                                try {
                                                    var g3 = Number(skyrimPlatform_16.storage["voaStarterGraceUntil"]) || 0;
                                                    if (!g3 || Date.now() > g3)
                                                        return;
                                                    var nowW = Date.now();
                                                    if (nowW - lastWatch < 400)
                                                        return;
                                                    lastWatch = nowW;
                                                    var p = skyrimPlatform_16.Game.getPlayer();
                                                    if (!p)
                                                        return;
                                                    var ironH = skyrimPlatform_16.Game.getFormEx(0x12e4d);
                                                    var gold = skyrimPlatform_16.Game.getFormEx(0xf);
                                                    if ((ironH && p.getItemCount(ironH) > 0) ||
                                                        (gold && p.getItemCount(gold) > 5)) {
                                                        applyRaggedOnly("watch-iron");
                                                    }
                                                }
                                                catch (eW2) { /* ignore */ }
                                            });
                                        }
                                    }
                                    catch (eOn) { /* ignore */ }
                                }
                            }
                            catch (eKitOuter) {
                                skyrimPlatform_16.printConsole("VOA: starter kit outer: " + eKitOuter);
                            }
                        }
                    }
                };
                SkympClient.prototype.sendEquipment = function (_refrId) {
                    if (_refrId)
                        return;
                    if (this.equipmentChanged) {
                        this.equipmentChanged = false;
                        ++this.numEquipmentChanges;
                        var eq = equipment_3.getEquipment(skyrimPlatform_16.Game.getPlayer(), this.numEquipmentChanges);
                        this.sendTarget.send({ t: messages_3.MsgType.UpdateEquipment, data: eq, _refrId: _refrId }, true);
                        skyrimPlatform_16.printConsole({ eq: eq });
                    }
                };
                SkympClient.prototype.sendActorValuePercentage = function (_refrId) {
                    var owner = this.getInputOwner(_refrId);
                    if (!owner)
                        return;
                    var av = actorvalues_2.getActorValues(skyrimPlatform_16.Game.getPlayer());
                    var currentTime = Date.now();
                    if (this.prevValues.health === av.health &&
                        this.prevValues.stamina === av.stamina &&
                        this.prevValues.magicka === av.magicka &&
                        this.actorValuesNeedUpdate === false) {
                        return;
                    }
                    else {
                        if (currentTime - this.prevActorValuesUpdateTime < 1000 &&
                            this.actorValuesNeedUpdate === false) {
                            return;
                        }
                        this.sendTarget.send({ t: messages_3.MsgType.ChangeValues, data: av, _refrId: _refrId }, true);
                        this.actorValuesNeedUpdate = false;
                        this.prevValues = av;
                        this.prevActorValuesUpdateTime = currentTime;
                    }
                };
                SkympClient.prototype.sendHostAttempts = function () {
                    var remoteId = hostAttempts_2.nextHostAttempt();
                    if (!remoteId)
                        return;
                    this.sendTarget.send({ t: messages_3.MsgType.Host, remoteId: remoteId }, false);
                };
                SkympClient.prototype.sendInputs = function () {
                    var _this = this;
                    var hosted = typeof skyrimPlatform_16.storage["hosted"] === typeof [] ? skyrimPlatform_16.storage["hosted"] : [];
                    var targets = [undefined].concat(hosted);
                    //printConsole({ targets });
                    targets.forEach(function (target) {
                        _this.sendMovement(target);
                        _this.sendAnimation(target);
                        _this.sendLook(target);
                        _this.sendEquipment(target);
                        _this.sendActorValuePercentage(target);
                    });
                    this.sendHostAttempts();
                    // VOA character DB snapshot (throttled ~20s inside)
                    try {
                        _this.reportCharacterState(false, "interval");
                    }
                    catch (eState) { /* ignore */ }
                };
                SkympClient.prototype.resetRemoteServer = function () {
                    var prevRemoteServer = skyrimPlatform_16.storage.remoteServer;
                    var rs;
                    if (prevRemoteServer && prevRemoteServer.getWorldModel) {
                        rs = prevRemoteServer;
                        skyrimPlatform_16.printConsole("Restore previous RemoteServer");
                        // Keep previous RemoteServer, but update func implementations
                        var newObj = new remoteServer_1.RemoteServer();
                        var rsAny = rs;
                        for (var key in newObj) {
                            if (typeof newObj[key] === "function")
                                rsAny[key] = newObj[key];
                        }
                    }
                    else {
                        rs = new remoteServer_1.RemoteServer();
                        skyrimPlatform_16.printConsole("Creating RemoteServer");
                    }
                    this.sendTarget = rs;
                    this.msgHandler = rs;
                    this.modelSource = rs;
                    skyrimPlatform_16.storage.remoteServer = rs;
                };
                SkympClient.prototype.resetView = function () {
                    var _this = this;
                    var prevView = skyrimPlatform_16.storage.view;
                    var view = new view_4.WorldView();
                    skyrimPlatform_16.once("update", function () {
                        if (prevView && prevView.destroy) {
                            prevView.destroy();
                            skyrimPlatform_16.printConsole("Previous View destroyed");
                        }
                        skyrimPlatform_16.storage.view = view;
                    });
                    skyrimPlatform_16.on("update", function () {
                        if (!_this.singlePlayer)
                            view.update(_this.modelSource.getWorldModel());
                    });
                };
                SkympClient.prototype.getView = function () {
                    return view_4.getViewFromStorage();
                };
                SkympClient.prototype.localIdToRemoteId = function (localFormId) {
                    return view_4.localIdToRemoteId(localFormId);
                };
                SkympClient.prototype.remoteIdToLocalId = function (remoteFormId) {
                    return view_4.remoteIdToLocalId(remoteFormId);
                };
                SkympClient.prototype.updateActorValuesAfterAnimation = function (animName) {
                    if (animName === "JumpLand" ||
                        animName === "JumpLandDirectional" ||
                        animName === "DeathAnim") {
                        this.actorValuesNeedUpdate = true;
                    }
                };
                return SkympClient;
            }());
            exports_35("SkympClient", SkympClient);
            skyrimPlatform_16.once("update", function () {
                // Is it racing with OnInit in Papyrus?
                sp.TESModPlatform.blockPapyrusEvents(true);
            });
        }
    };
});
System.register("skymp5-client/src/front/version", ["build/dist/client/Data/Platform/Modules/skyrimPlatform"], function (exports_36, context_36) {
    "use strict";
    var skyrimPlatform_17, requiredVersion, realVersion, verifyVersion;
    var __moduleName = context_36 && context_36.id;
    return {
        setters: [
            function (skyrimPlatform_17_1) {
                skyrimPlatform_17 = skyrimPlatform_17_1;
            }
        ],
        execute: function () {
            // VOA: accept modern Skyrim Platform (2.9.x). Original RH check was inverted/legacy ("0.7.0+build3").
            requiredVersion = "2.9.0";
            realVersion = typeof skyrimPlatform_17.getPlatformVersion === "function" ? skyrimPlatform_17.getPlatformVersion() : "unknown";
            exports_36("verifyVersion", verifyVersion = function () {
                var ok = typeof realVersion === "string" && (realVersion.indexOf("2.9") === 0 || realVersion.indexOf("2.8") === 0 || requiredVersion === realVersion);
                if (!ok) {
                    skyrimPlatform_17.printConsole("VOA: SkyrimPlatform version " + realVersion + " (expected 2.9.x) ??? continuing anyway");
                }
            });
        }
    };
});
/* VOA: overhead names + hold-E radial (give name / trade) ??? injected into skymp5-client */
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

                var HOLD_MS = 220;
                var NAME_RANGE = 2200;
                var eHeldSince = 0;
                var menuOpen = false;
                var tradeOpen = false;
                var focusRemoteId = 0;
                var nameTexts = {}; // remoteId -> textId
                var lastPlateAt = 0;

                var mapSet = function (key, id, val) {
                    try {
                        var m = sp.storage[key];
                        var out = {};
                        if (m && typeof m === "object") {
                            for (var k in m) {
                                if (Object.prototype.hasOwnProperty.call(m, k))
                                    out[k] = m[k];
                            }
                        }
                        out[String(id)] = val;
                        sp.storage[key] = out;
                        return out;
                    }
                    catch (e) {
                        return {};
                    }
                };

                var noteKnownPlayer = function (remoteId, nameOpt) {
                    if (!remoteId || remoteId < 0xff000000) return;
                    mapSet("voaKnownPlayers", remoteId, 1);
                    if (nameOpt)
                        mapSet("voaTrueNames", remoteId, String(nameOpt));
                };

                // --- helpers ---
                var sendInteract = function (action, targetRemoteId, payload) {
                    try {
                        sp.printConsole("VOA interact send " + action + " -> " + (targetRemoteId || 0).toString(16));
                        // 1) HTTP queue (reliable)
                        try {
                            var gd = sp.settings["skymp5-client"]["gameData"] || {};
                            var session = typeof gd.session === "string" ? gd.session : "";
                            var profileId = typeof gd.profileId === "number" ? gd.profileId : 0;
                            var master = sp.settings["skymp5-client"]["master"] || "http://127.0.0.1:3100";
                            if (typeof master !== "string" || !master)
                                master = "http://127.0.0.1:3100";
                            master = master.replace(/\/$/, "");
                            if (session) {
                                var hc = new sp.HttpClient(master);
                                hc.post("/v1/game/interact", {
                                    body: JSON.stringify({
                                        session: session,
                                        profileId: profileId,
                                        action: action,
                                        targetRemoteId: Number(targetRemoteId) || 0,
                                        payload: payload || {},
                                    }),
                                    contentType: "application/json",
                                }).then(function (res) {
                                    try {
                                        sp.printConsole("VOA interact HTTP status=" + (res ? res.status : "?"));
                                        if (res && res.status === 200) {
                                            try { sp.Debug.notification("Interact: " + action); } catch (eN) {}
                                        }
                                    } catch (eR) {}
                                }).catch(function (eH) {
                                    try { sp.printConsole("VOA interact HTTP fail " + eH); } catch (e2) {}
                                });
                            }
                            else {
                                sp.printConsole("VOA interact HTTP skip (no session)");
                            }
                        } catch (eHttp) {
                            try { sp.printConsole("VOA interact HTTP err " + eHttp); } catch (e3) {}
                        }
                        // 2) Best-effort CustomEvent
                        var send = getSend && getSend();
                        if (send) {
                            send({
                                t: messages_pi.MsgType.CustomEvent,
                                eventName: "_voaInteract",
                                args: [
                                    action,
                                    Number(targetRemoteId) || 0,
                                    JSON.stringify(payload || {}),
                                ],
                                argsJsonDumps: [
                                    JSON.stringify(action),
                                    JSON.stringify(Number(targetRemoteId) || 0),
                                    JSON.stringify(JSON.stringify(payload || {})),
                                ],
                            }, true);
                        }
                        else if (typeof sp._voaEmit === "function") {
                            sp._voaEmit({
                                t: 15,
                                eventName: "_voaInteract",
                                args: [action, Number(targetRemoteId) || 0, JSON.stringify(payload || {})],
                                argsJsonDumps: [
                                    JSON.stringify(action),
                                    JSON.stringify(Number(targetRemoteId) || 0),
                                    JSON.stringify(JSON.stringify(payload || {})),
                                ],
                            }, true);
                        }
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
                        if (map[remoteId] != null) return String(map[remoteId]);
                        if (map[String(remoteId)] != null) return String(map[String(remoteId)]);
                    }
                    catch (e) {}
                    return "";
                };

                var getDisplayName = function (remoteId) {
                    try {
                        var rev = sp.storage["voaRevealedNames"] || {};
                        if (rev[remoteId]) return String(rev[remoteId]);
                        if (rev[String(remoteId)]) return String(rev[String(remoteId)]);
                    }
                    catch (e) {}
                    // Show true name if known (from look), else immersive default
                    var tn = getTrueName(remoteId);
                    if (tn) return tn;
                    return "Stranger";
                };

                var rememberTrueName = function (remoteId, name) {
                    if (!remoteId) return;
                    noteKnownPlayer(remoteId, name || "");
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
                        title.replace(/'/g, "") + " ??? hold menu</div>';" +
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
                        "<div style=\"margin-top:10px;font-size:13px\">You: '+(d.readyMe?'READY':'???')+' &nbsp;|&nbsp; Them: '+(d.readyThem?'READY':'???')+'</div>" +
                        "<div class=\"actions\">" +
                        "<button id=\"voa-ready\">'+(d.readyMe?'Unready':'Ready')+'</button>" +
                        "<button class=\"secondary\" id=\"voa-cancel\">Cancel</button>" +
                        "</div><div style=\"margin-top:8px;opacity:.65;font-size:12px\">Click inventory items to add to offer ?? click offer to remove</div></div>';" +
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

                var getLocalPlayerName = function () {
                    try {
                        var cached = sp.storage["voaLocalPlayerName"];
                        if (cached && String(cached).length)
                            return String(cached);
                    } catch (e0) {}
                    try {
                        var p = sp.Game.getPlayer();
                        if (p) {
                            // Prefer look name from storage if set after race menu
                            var dn = p.getDisplayName ? p.getDisplayName() : "";
                            if (dn && String(dn).trim() && String(dn).trim() !== " ")
                                return String(dn).trim();
                        }
                    } catch (e1) {}
                    return "Traveler";
                };

                var drawPlateForActor = function (key, ac, label, color) {
                    if (!ac || !label) return false;
                    var headPos = [
                        sp.NetImmerse.getNodeWorldPositionX(ac, "NPC Head [Head]", false),
                        sp.NetImmerse.getNodeWorldPositionY(ac, "NPC Head [Head]", false),
                        sp.NetImmerse.getNodeWorldPositionZ(ac, "NPC Head [Head]", false) + 14,
                    ];
                    if (!headPos[0] && !headPos[1] && !headPos[2]) {
                        headPos = [ac.getPositionX(), ac.getPositionY(), ac.getPositionZ() + 110];
                    }
                    var scrArr = sp.worldPointToScreenPoint(headPos);
                    var scr = scrArr && scrArr[0];
                    // For local player, head is often behind/near camera; still try slightly raised point
                    if (!scr || scr[2] <= 0 || scr[0] < -0.05 || scr[0] > 1.05 || scr[1] < -0.05 || scr[1] > 1.05) {
                        destroyPlate(key);
                        return false;
                    }
                    var sw = 1920, sh = 1080;
                    try {
                        if (sp.storage["voaScreenW"]) sw = Number(sp.storage["voaScreenW"]) || sw;
                        if (sp.storage["voaScreenH"]) sh = Number(sp.storage["voaScreenH"]) || sh;
                    } catch (eRes) {}
                    var x = scr[0] * sw;
                    var y = (1 - scr[1]) * sh;
                    var col = color || [1, 0.9, 0.55, 1];
                    if (nameTexts[key] == null) {
                        try {
                            nameTexts[key] = sp.createText(x, y, label, col, "Tavern");
                            try { sp.setTextSize(nameTexts[key], 1.0); } catch (eSz) {}
                        } catch (eC) {
                            nameTexts[key] = null;
                            return false;
                        }
                    }
                    else {
                        try {
                            sp.setTextPos(nameTexts[key], x, y);
                            sp.setTextString(nameTexts[key], label);
                        } catch (eU) {
                            destroyPlate(key);
                            return false;
                        }
                    }
                    return true;
                };

                var updateNameplates = function () {
                    var now = Date.now();
                    if (now - lastPlateAt < 50) return; // ~20fps plates
                    lastPlateAt = now;
                    if (menuOpen || tradeOpen) return;
                    try {
                        if (sp.Ui.isMenuOpen("Loading Menu") || sp.Ui.isMenuOpen("MapMenu") || sp.Ui.isMenuOpen("InventoryMenu") || sp.Ui.isMenuOpen("RaceSex Menu"))
                            return;
                    } catch (eM) {}

                    var player = sp.Game.getPlayer();
                    if (!player) return;
                    var seen = {};
                    var px = player.getPositionX();
                    var py = player.getPositionY();
                    var pz = player.getPositionZ();

                    // Own nameplate: third person only (camera states 8/9/10). Hide in first person.
                    try {
                        var camState = -1;
                        try {
                            camState = Number(sp.Game.getCameraState());
                        } catch (eCam) { camState = -1; }
                        // 0 = first person; 8/9 = third person; 10 = horse third
                        var isThirdPerson = camState === 8 || camState === 9 || camState === 10;
                        if (!isThirdPerson) {
                            destroyPlate("self");
                        }
                        else {
                            var selfName = getLocalPlayerName();
                            if (drawPlateForActor("self", player, selfName, [0.95, 0.95, 0.75, 0.95]))
                                seen["self"] = true;
                        }
                    } catch (eSelf) {
                        try { destroyPlate("self"); } catch (eD) {}
                    }

                    // Known remote players (look sync + crosshair) â€” always re-read storage
                    var trueNames = sp.storage["voaTrueNames"] || {};
                    var known = sp.storage["voaKnownPlayers"] || {};
                    var keySet = {};
                    var keys = [];
                    var addKey = function (k) {
                        var n = Number(k);
                        if (!n || n < 0xff000000 || keySet[n]) return;
                        keySet[n] = 1;
                        keys.push(n);
                    };
                    for (var kA in trueNames) addKey(kA);
                    for (var kB in known) addKey(kB);
                    for (var ki = 0; ki < keys.length; ki++) {
                        var rid = keys[ki];
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
                        var label = getDisplayName(rid);
                        if (drawPlateForActor(rid, ac, label, [1, 0.9, 0.55, 1]))
                            seen[rid] = true;
                    }
                    // cleanup
                    for (var rid2 in nameTexts) {
                        if (!seen[rid2]) destroyPlate(rid2);
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
                        // Only MP players (0xff*) â€” also accept high local clones when map fails
                        if (!remoteId || remoteId < 0xff000000) {
                            // fallback: some builds leave remote==local for ff actors
                            if (localId >= 0xff000000) remoteId = localId;
                            else {
                                eHeldSince = 0;
                                return;
                            }
                        }
                        noteKnownPlayer(remoteId, getTrueName(remoteId));
                        if (!eHeldSince) eHeldSince = Date.now();
                        if (Date.now() - eHeldSince >= HOLD_MS) {
                            eHeldSince = Date.now() + 100000; // prevent re-fire until release
                            var label = getDisplayName(remoteId);
                            if (!label || label === "???" || label === "Stranger") label = "Stranger";
                            sp.printConsole("VOA: open radial remote=" + remoteId.toString(16) + " local=" + localId.toString(16));
                            openRadial(remoteId, label);
                        }
                    }
                    catch (eAll) {
                        // silent
                    }
                });

                // Store true names when FormView models update ??? hook via periodic scan of createActor looks is hard;
                // instead patch storage from look when remoteServer createActor runs ??? we monkey via storage callback
                try {
                    var prev = sp.storage._voaOnPlayerLook;
                    sp.storage._voaOnPlayerLook = function (remoteId, name) {
                        rememberTrueName(remoteId, name);
                        if (typeof prev === "function") try { prev(remoteId, name); } catch (e) {}
                    };
                } catch (eH) {}

                sp.printConsole("VOA: player interact ready (hold E on player ?? nameplates ?? trade)");
            });
        }
    };
});
/* VOA CEF chat HUD - always visible log, T focuses input, idle fade 25% after 5s */
/* VOA chat: Red-House front UI + Keizaal Enter/T focus + _voaChat gamemode bridge */
System.register("skymp5-client/src/front/voaChat", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/messages", "skymp5-client/src/front/networking"], function (exports_ch, context_ch) {
    "use strict";
    var sp, messages_ch, networking_ch, setupVoaChat;
    var __moduleName = context_ch && context_ch.id;
    return {
        setters: [
            function (sp_1) { sp = sp_1; },
            function (m) { messages_ch = m; },
            function (n) { networking_ch = n; }
        ],
        execute: function () {
            exports_ch("setupVoaChat", setupVoaChat = function (getSend, remoteIdToLocalId) {
                // Browser module now owns CEF chat drain/UI/send. Keep this for legacy hooks only.
                try {
                    sp.storage["voaChatReady"] = true;
                    sp.storage["voaChatReadyAt"] = Date.now();
                    sp.storage["voaChatRhV5"] = true;
                } catch (e0) {}
                try { sp.printConsole("VOA chat: setup OK v5 (browser-owned drain)"); } catch (e1) {}
                return;

                // Network send via networking module Ã¢â‚¬â€ never call functions stored on sp.storage
                var sendChat = function (action, a1, a2) {
                    try {
                        var args = [action];
                        if (a1 !== undefined) args.push(a1);
                        if (a2 !== undefined) args.push(a2);
                        var msg = {
                            t: messages_ch.MsgType.CustomEvent,
                            eventName: "_voaChat",
                            args: args,
                            argsJsonDumps: (args || []).map(function (a) {
                                return JSON.stringify(a);
                            }),
                        };
                        if (networking_ch && typeof networking_ch.send === "function") {
                            networking_ch.send(msg, true);
                            return true;
                        }
                        // Fallback: try getSend closure (may be storage-backed Ã¢â‚¬â€ last resort)
                        var send = getSend && getSend();
                        if (send) {
                            send(msg, true);
                            return true;
                        }
                        sp.printConsole("VOA chat: no send yet");
                        return false;
                    } catch (e) {
                        sp.printConsole("VOA chat send err " + e);
                        return false;
                    }
                };

                // Queue UI lines as plain JSON for browser module to dispatch via proven CHAT_SHOW path.
                // (executeJavaScript-from-voaChat alone was unreliable after loadUrl / unfocus.)
                var lastUiPush = { key: "", at: 0 };
                var pushFrontMessage = function (line) {
                    if (!line) return;
                    var name = String(line.name || "");
                    var text = String(line.text || "");
                    var ch = line.channel || "l";
                    var dedupeKey = ch + "\0" + text;
                    var now = Date.now();
                    if (dedupeKey === lastUiPush.key && now - lastUiPush.at < 1500)
                        return;
                    lastUiPush.key = dedupeKey;
                    lastUiPush.at = now;
                    var color = ch === "g" ? "efc94a" : (ch === "sys" ? "8ec8ff" : "f0ebe3");
                    var prefix = ch === "g" ? "[G] " : (ch === "sys" ? "[!] " : "[L] ");
                    // RH getMessageText expects #{RRGGBB} tags
                    var msg = "#{efc94a}" + prefix + (name ? name + (ch === "sys" ? " " : ": ") : "") + "#{" + color + "}" + text;
                    try {
                        sp.browser.setVisible(true);
                        sp.storage["voaForceBrowser"] = true;
                        sp.storage["voaChatLogUntil"] = Date.now() + 180000;
                    } catch (eVis) {}
                    try {
                        var arr = [];
                        var raw = sp.storage["voaChatUiPendingJson"];
                        if (typeof raw === "string" && raw.length) {
                            try { arr = JSON.parse(raw); } catch (eP) { arr = []; }
                        }
                        if (!arr || !arr.length) arr = [];
                        arr.push(msg);
                        if (arr.length > 40) arr = arr.slice(-40);
                        sp.storage["voaChatUiPendingJson"] = JSON.stringify(arr);
                        try { sp.printConsole("VOA chat UI queued (" + arr.length + ")"); } catch (eL) {}
                    } catch (eQ) {
                        try { sp.printConsole("VOA chat UI queue err " + eQ); } catch (e3) {}
                    }
                };

                var pushLine = function (line) {
                    if (!line) return;
                    pushFrontMessage(line);
                    try {
                        if (line.channel === "g")
                            sp.Debug.notification("[G] " + (line.name || "") + ": " + (line.text || ""));
                        else
                            sp.printConsole("[" + (line.channel || "L") + "] " + (line.name || "") + ": " + (line.text || ""));
                    } catch (eN) {}
                };
                // Do NOT store pushLine on sp.storage as callable Ã¢â‚¬â€ SP rejects it.
                // Server eval should only push plain objects into voaChatQueue (JSON).

                var handleRhChat = function (raw) {
                    var text = String(raw || "").trim();
                    if (!text) return;
                    if (text.indexOf("/browserFocused") === 0) {
                        try { sp.storage["voaChatCloseReq"] = "rh"; sp.storage["voaChatCloseAt"] = Date.now(); } catch (e) {}
                        return;
                    }
                    if (text.indexOf("/focusInputField") === 0) return;
                    if (/^\/(anim|Craft|Trade|Interaction|SelectBox)\b/i.test(text)) return;
                    if (/^\/(g|global)\b/i.test(text) && sp.storage["voaIsStaff"] !== true) {
                        pushLine({ channel: "sys", name: "System", text: "Global chat is Admin only.", system: true });
                        return;
                    }
                    sp.printConsole("VOA chat >> " + text);
                    pushLine({ channel: "l", name: "You", text: text, system: false });
                    var ok = sendChat("say", text);
                    if (!ok) {
                        pushLine({ channel: "sys", name: "System", text: "Message not sent (not connected yet).", system: true });
                    }
                    // Keep input open long enough for browser update to paint the line
                    try {
                        sp.storage["voaChatCloseReq"] = "sent";
                        sp.storage["voaChatCloseAt"] = Date.now() + 600;
                    } catch (eClose) {}
                };

                sp.on("update", function () {
                    // CEF-typed text (queued as JSON string from browserMessage)
                    try {
                        var rawP = sp.storage["voaRhChatPendingJson"];
                        if (rawP && typeof rawP === "string" && rawP !== "[]" && rawP.length > 2) {
                            sp.storage["voaRhChatPendingJson"] = "[]";
                            var itemsP = [];
                            try { itemsP = JSON.parse(rawP); } catch (eJP) { itemsP = []; }
                            if (itemsP && itemsP.length) {
                                for (var pi = 0; pi < itemsP.length; pi++) {
                                    try { handleRhChat(itemsP[pi]); } catch (eP) {
                                        try { sp.printConsole("VOA chat drain err " + eP); } catch (eP2) {}
                                    }
                                }
                            }
                        }
                    } catch (ePend) {}
                    // Server/gamemode lines: prefer JSON string queue (SP-safe)
                    try {
                        var rawQ = sp.storage["voaChatQueueJson"];
                        if (rawQ && typeof rawQ === "string" && rawQ !== "[]" && rawQ.length > 2) {
                            sp.storage["voaChatQueueJson"] = "[]";
                            var lines = [];
                            try { lines = JSON.parse(rawQ); } catch (eL) { lines = []; }
                            for (var j = 0; j < lines.length; j++) {
                                try { pushLine(lines[j]); } catch (eLine) {}
                            }
                        }
                    } catch (eQj) {}
                    // Legacy array queue (copy then clear Ã¢â‚¬â€ no storage fn calls)
                    try {
                        var q2 = sp.storage["voaChatQueue"];
                        if (q2 && q2.length) {
                            var qCopy = [];
                            try { qCopy = JSON.parse(JSON.stringify(q2)); } catch (eCpy) {
                                qCopy = q2.slice ? q2.slice() : [];
                            }
                            sp.storage["voaChatQueue"] = [];
                            for (var k = 0; k < qCopy.length; k++) {
                                try { pushLine(qCopy[k]); } catch (e2) {}
                            }
                        }
                    } catch (eAll) {}
                });

                try {
                    sp.Utility.wait(1.5).then(function () {
                        try {
                            if (typeof sp.storage._voaInstallChatBridge === "function") {
                                try { sp.storage._voaInstallChatBridge(); } catch (eB) {}
                            }
                            sp.printConsole("VOA chat: bridge ready (UI queue v4)");
                        } catch (eW) {}
                    });
                } catch (eU) {}

                sp.printConsole("VOA chat: setup OK v4 (UI via browser COMMAND dispatch)");
            });

            try {
                sp.once("update", function () {
                    try {
                        setupVoaChat(function () {
                            try { return sp.storage._voaSendFn || null; } catch (e) { return null; }
                        }, function (remoteId) {
                            try {
                                if (typeof sp.storage._voaRemoteToLocal === "function")
                                    return sp.storage._voaRemoteToLocal(remoteId);
                            } catch (e2) {}
                            return 0;
                        });
                    } catch (eSetup) {
                        try { sp.printConsole("VOA chat auto-setup fail: " + eSetup); } catch (e3) {}
                    }
                });
            } catch (eAuto) {}
        }
    };
});
System.register("skymp5-client/src/front/index", ["skymp5-client/src/front/skympClient", "skymp5-client/src/front/browser", "skymp5-client/src/front/loadGameManager", "build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/version", "skymp5-client/src/front/worldCleaner", "skymp5-client/src/front/playerInteract", "skymp5-client/src/front/voaChat", "skymp5-client/src/front/voaFx"], function (exports_37, context_37) {
    "use strict";
    var skympClient_1, browser, loadGameManager, skyrimPlatform_18, version_1, worldCleaner_2, playerInteract_1, voaChat_1, voaFx_1, enforceLimitations, lastTimeUpd, riftenUnlocked, n, k, zeroKMoment, lastFps;
    var __moduleName = context_37 && context_37.id;
    return {
        setters: [
            function (skympClient_1_1) {
                skympClient_1 = skympClient_1_1;
            },
            function (browser_1) {
                browser = browser_1;
            },
            function (loadGameManager_3) {
                loadGameManager = loadGameManager_3;
            },
            function (skyrimPlatform_18_1) {
                skyrimPlatform_18 = skyrimPlatform_18_1;
            },
            function (version_1_1) {
                version_1 = version_1_1;
            },
            function (worldCleaner_2_1) {
                worldCleaner_2 = worldCleaner_2_1;
            },
            function (playerInteract_1_1) {
                playerInteract_1 = playerInteract_1_1;
            },
            function (voaChat_1_1) {
                voaChat_1 = voaChat_1_1;
            },
            function (voaFx_1_1) {
                voaFx_1 = voaFx_1_1;
            }
        ],
        execute: function () {
            new skympClient_1.SkympClient();
            try {
                if (playerInteract_1 && playerInteract_1.setupPlayerInteract) {
                    playerInteract_1.setupPlayerInteract(function () {
                        try {
                            return skyrimPlatform_18.storage._voaSendFn || null;
                        }
                        catch (e) {
                            return null;
                        }
                    }, function (localId) {
                        try {
                            if (typeof skyrimPlatform_18.storage._voaLocalToRemote === "function")
                                return skyrimPlatform_18.storage._voaLocalToRemote(localId);
                        }
                        catch (e) { }
                        return localId;
                    }, function (remoteId) {
                        try {
                            if (typeof skyrimPlatform_18.storage._voaRemoteToLocal === "function")
                                return skyrimPlatform_18.storage._voaRemoteToLocal(remoteId);
                        }
                        catch (e) { }
                        return 0;
                    });
                }
            }
            catch (ePi) {
                try {
                    skyrimPlatform_18.printConsole("VOA playerInteract setup fail " + ePi);
                }
                catch (e2) { }
            }
            try {
                if (voaChat_1 && voaChat_1.setupVoaChat) {
                    voaChat_1.setupVoaChat(function () {
                        try {
                            return skyrimPlatform_18.storage._voaSendFn || null;
                        }
                        catch (e) {
                            return null;
                        }
                    }, function (remoteId) {
                        try {
                            if (typeof skyrimPlatform_18.storage._voaRemoteToLocal === "function")
                                return skyrimPlatform_18.storage._voaRemoteToLocal(remoteId);
                        }
                        catch (e) { }
                        return 0;
                    });
                }
            }
            catch (eCh) {
                try {
                    skyrimPlatform_18.printConsole("VOA chat setup fail " + eCh);
                }
                catch (e3) { }
            }
            try {
                if (voaFx_1 && voaFx_1.setupVoaFx) {
                    voaFx_1.setupVoaFx(function () {
                        try {
                            return skyrimPlatform_18.storage._voaSendFn || null;
                        }
                        catch (e) {
                            return null;
                        }
                    }, function (localId) {
                        try {
                            if (typeof skyrimPlatform_18.storage._voaLocalToRemote === "function")
                                return skyrimPlatform_18.storage._voaLocalToRemote(localId);
                        }
                        catch (e) { }
                        return localId;
                    });
                }
            }
            catch (eFx) {
                try {
                    skyrimPlatform_18.printConsole("VOA fx setup fail " + eFx);
                }
                catch (e2) { }
            }
            // VOA proximity voice (Keizaal-style in-game CEF + LiveKit)
            try {
                skyrimPlatform_18.once("update", function () {
                    try {
                        if (typeof skyrimPlatform_18.storage._voaSetupVoice === "function") {
                            skyrimPlatform_18.storage._voaSetupVoice();
                        }
                    }
                    catch (eV) {
                        try {
                            skyrimPlatform_18.printConsole("VOA voice setup fail " + eV);
                        }
                        catch (e3) { }
                    }
                });
                // Retry a few seconds — appended voice plugin may register after front/index
                var voiceBootTries = 0;
                skyrimPlatform_18.on("update", function () {
                    try {
                        if (skyrimPlatform_18.storage["voaVoiceReady"])
                            return;
                        if (skyrimPlatform_18.storage["voaVoiceBootGaveUp"])
                            return;
                        voiceBootTries++;
                        if (typeof skyrimPlatform_18.storage._voaSetupVoice === "function") {
                            skyrimPlatform_18.storage._voaSetupVoice();
                        }
                        if (voiceBootTries > 180) {
                            skyrimPlatform_18.storage["voaVoiceBootGaveUp"] = true;
                            skyrimPlatform_18.printConsole("[VOA voice] boot gave up (plugin missing from client bundle?)");
                        }
                    }
                    catch (eVb) { }
                });
            }
            catch (eVoice) { }
            // VOA multiplayer limitations:
            // setInChargen(disableSaving, disableWaiting, showMsg)
            // Wait (T) must stay OFF so chat can use T; re-apply every frame (loadGame clears it).
            enforceLimitations = function () {
                try {
                    skyrimPlatform_18.Game.setInChargen(true, true, false);
                }
                catch (eChg) { /* ignore */ }
                try {
                    skyrimPlatform_18.Game.enableFastTravel(false);
                }
                catch (eFt) { /* ignore */ }
            };
            skyrimPlatform_18.once("update", enforceLimitations);
            loadGameManager.addLoadGameListener(enforceLimitations);
            skyrimPlatform_18.once("update", function () {
                skyrimPlatform_18.Utility.setINIBool("bAlwaysActive:General", true);
            });
            skyrimPlatform_18.on("update", function () {
                skyrimPlatform_18.Utility.setINIInt("iDifficulty:GamePlay", 5);
                enforceLimitations();
                // Hard-close vanilla Wait/Sleep if it still opens (T key race)
                try {
                    if (skyrimPlatform_18.Ui.isMenuOpen("Sleep/Wait Menu")) {
                        try {
                            skyrimPlatform_18.callNative("UI", "CloseMenu", null, "Sleep/Wait Menu");
                        }
                        catch (eCm1) {
                            try {
                                skyrimPlatform_18.callNative("Ui", "CloseMenu", "Sleep/Wait Menu");
                            }
                            catch (eCm2) {
                                try {
                                    skyrimPlatform_18.Ui.invokeString("Sleep/Wait Menu", "_root.QuestJournalFader.Menu_mc.CloseMenu", "");
                                }
                                catch (eInv) { /* ignore */ }
                            }
                        }
                        // Re-assert wait disabled after forced close
                        try {
                            skyrimPlatform_18.Game.setInChargen(true, true, false);
                        }
                        catch (eRe) { /* ignore */ }
                    }
                }
                catch (eWait) { /* ignore */ }
            });
            browser.main();
            skyrimPlatform_18.once("update", version_1.verifyVersion);
            skyrimPlatform_18.on("update", function () {
                // VOA: keep load doors activatable (crosshair). Prevents stuck interiors
                // when a prior pack left doors with blockActivation(true).
                try {
                    var xref = skyrimPlatform_18.Game.getCurrentCrosshairRef();
                    if (xref) {
                        var xb = xref.getBaseObject && xref.getBaseObject();
                        if (xb && xb.getType && xb.getType() === 29 /* Door */) {
                            try {
                                xref.blockActivation(false);
                            }
                            catch (eDoorX) { /* ignore */ }
                        }
                    }
                }
                catch (eXr) { /* ignore */ }
                // Don't burn CPU cleaning while local menus pause the world
                try {
                    if (typeof menuPaused !== "undefined" && menuPaused)
                        return;
                }
                catch (eSkip) { }
                return worldCleaner_2.updateWc();
            });
            // VOA: Inventory / Magic (and similar) pause local world for this player.
            // (Multiplayer often leaves world running ??? we force TimeScale 0 while those menus are open.)
            // NOTE: Disable SkyrimSoulsRE if present ??? it unpauses menus.
            var PAUSE_MENUS = [
                "InventoryMenu",
                "MagicMenu",
                "FavoritesMenu",
                "ContainerMenu",
                "Crafting Menu",
                "BarterMenu",
                "GiftMenu",
                "Journal Menu",
                "MapMenu",
                "StatsMenu",
                "Book Menu",
                "Lockpicking Menu",
                "Training Menu",
                "TweenMenu",
                "MessageBoxMenu",
                "Sleep/Wait Menu",
            ];
            var menuPaused = false;
            var wasMenuPaused = false;
            var isPauseMenuOpen = function () {
                try {
                    for (var mi = 0; mi < PAUSE_MENUS.length; mi++) {
                        if (skyrimPlatform_18.Ui.isMenuOpen(PAUSE_MENUS[mi]))
                            return true;
                    }
                }
                catch (eM) { }
                return false;
            };
            var setLocalTimeScale = function (value) {
                try {
                    var timeScaleId = 0x3a;
                    var timeScale = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(timeScaleId));
                    if (timeScale)
                        timeScale.setValue(value);
                }
                catch (eTs) { }
                try {
                    skyrimPlatform_18.Game.setGameSettingFloat("fTimescaleMult", value === 0 ? 0.0 : 1.0);
                }
                catch (eGs) { }
            };
            skyrimPlatform_18.on("update", function () {
                menuPaused = isPauseMenuOpen();
                if (menuPaused) {
                    setLocalTimeScale(0);
                    if (!wasMenuPaused) {
                        try {
                            skyrimPlatform_18.printConsole("VOA: menu open ??? local world paused (TimeScale 0)");
                        }
                        catch (eP) { }
                    }
                }
                else if (wasMenuPaused) {
                    setLocalTimeScale(1);
                    try {
                        skyrimPlatform_18.printConsole("VOA: menu closed ??? local world unpaused");
                    }
                    catch (eU) { }
                }
                wasMenuPaused = menuPaused;
            });
            lastTimeUpd = 0;
            skyrimPlatform_18.on("update", function () {
                // Do not fight menu pause with real-time clock / timescale=1
                if (menuPaused)
                    return;
                if (Date.now() - lastTimeUpd <= 2000)
                    return;
                lastTimeUpd = Date.now();
                // Also update weather to be always clear
                var w = skyrimPlatform_18.Weather.findWeather(0);
                if (w) {
                    w.setActive(false, false);
                }
                var gameHourId = 0x38;
                var gameMonthId = 0x36;
                var gameDayId = 0x37;
                var gameYearId = 0x35;
                var timeScaleId = 0x3a;
                var d = new Date();
                var gameHour = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(gameHourId));
                gameHour.setValue(d.getUTCHours() +
                    d.getUTCMinutes() / 60 +
                    d.getUTCSeconds() / 60 / 60 +
                    d.getUTCMilliseconds() / 60 / 60 / 1000);
                var gameDay = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(gameDayId));
                gameDay.setValue(d.getUTCDate());
                var gameMonth = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(gameMonthId));
                gameMonth.setValue(d.getUTCMonth());
                var gameYear = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(gameYearId));
                gameYear.setValue(d.getUTCFullYear() - 2020 + 199);
                var timeScale = skyrimPlatform_18.GlobalVariable.from(skyrimPlatform_18.Game.getFormEx(timeScaleId));
                timeScale.setValue(1);
            });
            riftenUnlocked = false;
            skyrimPlatform_18.on("update", function () {
                if (riftenUnlocked)
                    return;
                var refr = skyrimPlatform_18.ObjectReference.from(skyrimPlatform_18.Game.getFormEx(0x42284));
                if (!refr)
                    return;
                refr.lock(false, false);
                riftenUnlocked = true;
            });
            n = 10;
            k = 0;
            zeroKMoment = 0;
            lastFps = 0;
            skyrimPlatform_18.on("update", function () {
                ++k;
                if (k == n) {
                    k = 0;
                    if (zeroKMoment) {
                        var timePassed = (Date.now() - zeroKMoment) * 0.001;
                        var fps = Math.round(n / timePassed);
                        if (lastFps != fps) {
                            lastFps = fps;
                            //printConsole(`Current FPS is ${fps}`);
                        }
                    }
                    zeroKMoment = Date.now();
                }
            });
        }
    };
});
System.register("skymp5-client/src/lib/helloWorld", [], function (exports_38, context_38) {
    "use strict";
    var helloWorld;
    var __moduleName = context_38 && context_38.id;
    return {
        setters: [],
        execute: function () {
            exports_38("helloWorld", helloWorld = function () { return "hello world!"; });
        }
    };
});

/* VOA client: capture anims / spells / VFX and send to server for neighbor sync */
/**
 * setupVoaFx(getSend, localIdToRemoteId)
 * Server event: CustomEvent "_voaFx" with payload object.
 * Also relies on stock UpdateAnimation for base anim stream.
 */
/* VOA client: capture anims / spells / VFX and send to server for neighbor sync */
/**
 * setupVoaFx(getSend, localIdToRemoteId)
 * Server event: CustomEvent "_voaFx" with payload object.
 * Also relies on stock UpdateAnimation for base anim stream.
 */
System.register("skymp5-client/src/front/voaFx", ["build/dist/client/Data/Platform/Modules/skyrimPlatform", "skymp5-client/src/front/messages"], function (exports_fx, context_fx) {
    "use strict";
    var sp, messages_fx, setupVoaFx;
    var __moduleName = context_fx && context_fx.id;
    return {
        setters: [
            function (sp_1) { sp = sp_1; },
            function (m) { messages_fx = m; }
        ],
        execute: function () {
            exports_fx("setupVoaFx", setupVoaFx = function (getSend, localIdToRemoteId) {
                try {
                    if (sp.storage["voaFxReady"])
                        return;
                    sp.storage["voaFxReady"] = true;
                }
                catch (e0) { return; }

                var lastFxAt = 0;
                var lastKey = "";
                var lastSpellAt = { 0: 0, 1: 0 };
                var lastProjAt = 0;
                var MAGIC_ANIM_RE = /spell|mag|cast|concentration|dualcast|ward|heal|flame|frost|shock|bound|summon|ritual|alteration|destruction|illusion|restoration|conjuration/i;
                // bow/crossbow release + spell missile fire anims
                var PROJ_ANIM_RE = /attackRelease|bowRelease|bowAttack|crossbowAttack|crossbowRelease|SpellFire|MRh_SpellFire|MLh_SpellFire|DualMagic_SpellFire|Voice_SpellFire/i;

                var emit = function (payload, reliable) {
                    try {
                        if (!payload || typeof payload !== "object")
                            return;
                        var now = Date.now();
                        var key = String(payload.kind || "") + ":" +
                            String(payload.anim || "") + ":" +
                            String(payload.spellId || "") + ":" +
                            String(payload.vfxId || "") + ":" +
                            String(payload.effectId || "") + ":" +
                            String(payload.weaponId || "") + ":" +
                            String(payload.ammoId || "") + ":" +
                            String(payload.projId || "");
                        // de-dupe identical spam within 80ms
                        if (key === lastKey && now - lastFxAt < 80)
                            return;
                        lastKey = key;
                        lastFxAt = now;

                        var send = null;
                        try {
                            if (typeof sp._voaEmit === "function")
                                send = function (msg, rel) { return sp._voaEmit(msg, rel); };
                        }
                        catch (eE) { }
                        if (!send && getSend)
                            send = getSend();
                        if (!send)
                            return;

                        var msg = {
                            t: messages_fx.MsgType.CustomEvent,
                            eventName: "_voaFx",
                            args: [payload],
                            argsJsonDumps: [JSON.stringify(payload)],
                        };
                        try {
                            send(msg, reliable !== false);
                        }
                        catch (eS) {
                            try { send(msg); } catch (e2) { }
                        }
                    }
                    catch (e) { }
                };

                var remotePlayer = function () {
                    try {
                        if (typeof localIdToRemoteId === "function") {
                            var r = localIdToRemoteId(0x14);
                            if (r)
                                return r;
                        }
                    }
                    catch (e) { }
                    return 0;
                };

                var remoteOf = function (localFormId) {
                    localFormId = Number(localFormId) || 0;
                    if (!localFormId)
                        return 0;
                    if (localFormId === 0x14)
                        return remotePlayer();
                    try {
                        if (typeof localIdToRemoteId === "function")
                            return localIdToRemoteId(localFormId) || 0;
                    }
                    catch (e) { }
                    return 0;
                };

                var aimOf = function (actor) {
                    try {
                        return {
                            aimX: actor.getAngleX(),
                            aimY: actor.getAngleY(),
                            aimZ: actor.getAngleZ(),
                        };
                    }
                    catch (e) {
                        return {};
                    }
                };

                var crosshairRemote = function () {
                    try {
                        var cr = sp.Game.getCurrentCrosshairRef();
                        if (cr)
                            return remoteOf(cr.getFormID());
                    }
                    catch (e) { }
                    return 0;
                };

                /** Best-effort projectile form id from spell magic effects */
                var spellProjectileId = function (spell) {
                    try {
                        if (!spell)
                            return 0;
                        var n = 0;
                        try { n = spell.getNumEffects ? spell.getNumEffects() : 0; } catch (eN) { n = 0; }
                        for (var i = 0; i < n && i < 8; i++) {
                            var me = null;
                            try { me = spell.getNthEffectMagicEffect(i); } catch (eM) { me = null; }
                            if (!me)
                                continue;
                            try {
                                var pr = me.getProjectile && me.getProjectile();
                                if (pr && pr.getFormID)
                                    return pr.getFormID();
                            }
                            catch (eP) { }
                        }
                    }
                    catch (e) { }
                    return 0;
                };

                /** Emit a projectile launch event for neighbors (Weapon.fire / Spell.remoteCast). */
                var emitProjectile = function (opts) {
                    try {
                        var now = Date.now();
                        if (now - lastProjAt < 120)
                            return;
                        lastProjAt = now;
                        var pl = sp.Game.getPlayer();
                        if (!pl)
                            return;
                        var aim = aimOf(pl);
                        var payload = {
                            kind: "proj",
                            mode: opts.mode || "",
                            weaponId: opts.weaponId || 0,
                            ammoId: opts.ammoId || 0,
                            spellId: opts.spellId || 0,
                            projId: opts.projId || 0,
                            targetRemote: opts.targetRemote || crosshairRemote() || 0,
                            hand: opts.hand != null ? opts.hand : 1,
                            anim: opts.anim || "",
                            aimX: aim.aimX,
                            aimY: aim.aimY,
                            aimZ: aim.aimZ,
                        };
                        emit(payload, true);
                    }
                    catch (e) { }
                };

                var tryEmitWeaponProjectile = function (animName) {
                    try {
                        var pl = sp.Game.getPlayer();
                        if (!pl)
                            return;
                        // Optional gate: only for bow/crossbow item types (7 bow, 12 crossbow)
                        try {
                            var tR = pl.getEquippedItemType(1); // right
                            var tL = pl.getEquippedItemType(0);
                            if (tR !== 7 && tR !== 12 && tL !== 7 && tL !== 12) {
                                // still allow if anim looks like bow release
                                var al = String(animName || "").toLowerCase();
                                if (al.indexOf("bow") < 0 && al.indexOf("crossbow") < 0 && al.indexOf("release") < 0)
                                    return;
                            }
                        }
                        catch (eT) { }
                        // Papyrus: GetEquippedWeapon(abLeftHand) -> Weapon
                        var weap = null;
                        try { weap = pl.getEquippedWeapon(false); } catch (eR) { weap = null; }
                        if (!weap) {
                            try { weap = pl.getEquippedWeapon(true); } catch (eL) { weap = null; }
                        }
                        if (!weap)
                            return;
                        var weaponId = 0;
                        try { weaponId = weap.getFormID(); } catch (eW) { weaponId = 0; }
                        if (!weaponId)
                            return;
                        // Ammo: SP has no getEquippedAmmo — scan inventory for Ammo forms
                        var ammo = null;
                        var ammoId = 0;
                        var projId = 0;
                        try {
                            var inv = pl.getContainerForms ? pl.getContainerForms() : null;
                            // fallback: common vanilla iron arrow if scan unavailable
                            if (!inv) {
                                var ironArrow = sp.Game.getFormEx(0x1397d);
                                ammo = ironArrow ? sp.Ammo.from(ironArrow) : null;
                            }
                        }
                        catch (eInv) { }
                        // Prefer Ammo.from on equipped object slots if any
                        try {
                            for (var loc = 0; loc < 4 && !ammo; loc++) {
                                var obj = null;
                                try { obj = pl.getEquippedObject(loc); } catch (eO) { obj = null; }
                                if (!obj)
                                    continue;
                                var asAmmo = sp.Ammo.from(obj);
                                if (asAmmo)
                                    ammo = asAmmo;
                            }
                        }
                        catch (eEq) { }
                        if (ammo) {
                            try { ammoId = ammo.getFormID(); } catch (eI) { ammoId = 0; }
                            try {
                                var pr = ammo.getProjectile && ammo.getProjectile();
                                if (pr && pr.getFormID)
                                    projId = pr.getFormID();
                            }
                            catch (eP) { }
                        }
                        emitProjectile({
                            mode: "weapon",
                            weaponId: weaponId,
                            ammoId: ammoId,
                            projId: projId,
                            anim: animName || "",
                        });
                    }
                    catch (e) { }
                };

                var tryEmitSpellProjectile = function (hand, animName) {
                    try {
                        var pl = sp.Game.getPlayer();
                        if (!pl)
                            return;
                        hand = hand === 0 ? 0 : 1;
                        var spell = null;
                        try { spell = pl.getEquippedSpell(hand); } catch (eG) { spell = null; }
                        if (!spell)
                            return;
                        var spellId = 0;
                        try { spellId = spell.getFormID(); } catch (eS) { spellId = 0; }
                        if (!spellId)
                            return;
                        var projId = spellProjectileId(spell);
                        // Only emit proj channel when effect has a projectile (missile/flame bolt etc.)
                        // Concentration/self spells still go through spell kind elsewhere.
                        if (!projId)
                            return;
                        emitProjectile({
                            mode: "spell",
                            spellId: spellId,
                            projId: projId,
                            hand: hand,
                            anim: animName || "",
                        });
                    }
                    catch (e) { }
                };

                // ---- Extra magic / combat anims as reliable FX (server property path) ----
                try {
                    sp.hooks.sendAnimationEvent.add({
                        enter: function () { },
                        leave: function (ctx) {
                            try {
                                if (!ctx || !ctx.animationSucceeded)
                                    return;
                                // only local player (selfId 0x14 or high 0xff*)
                                var selfId = Number(ctx.selfId) || 0;
                                var player = sp.Game.getPlayer();
                                var pid = player ? player.getFormID() : 0;
                                if (selfId !== pid && selfId !== 0x14)
                                    return;
                                var name = String(ctx.animEventName || "");
                                if (!name)
                                    return;
                                var lower = name.toLowerCase();
                                if (lower === "movestart" || lower === "movestop" || lower === "turnleft" || lower === "turnright")
                                    return;

                                // Projectile launches (arrows / spell missiles)
                                if (PROJ_ANIM_RE.test(name)) {
                                    if (lower.indexOf("spell") >= 0 || lower.indexOf("magic") >= 0 || lower.indexOf("mrh_") === 0 || lower.indexOf("mlh_") === 0 || lower.indexOf("dualmagic") >= 0 || lower.indexOf("voice_") === 0) {
                                        var hand = (lower.indexOf("mlh") >= 0 || lower.indexOf("left") >= 0) ? 0 : 1;
                                        tryEmitSpellProjectile(hand, name);
                                    }
                                    else {
                                        tryEmitWeaponProjectile(name);
                                    }
                                }

                                if (!MAGIC_ANIM_RE.test(name) &&
                                    lower.indexOf("attack") < 0 &&
                                    lower.indexOf("bash") < 0 &&
                                    lower.indexOf("block") < 0 &&
                                    lower.indexOf("stagger") < 0 &&
                                    lower.indexOf("recoil") < 0 &&
                                    lower.indexOf("ragdoll") < 0 &&
                                    !PROJ_ANIM_RE.test(name)) {
                                    return;
                                }
                                emit({ kind: "anim", anim: name }, true);
                            }
                            catch (eL) { }
                        },
                    });
                }
                catch (eHook) {
                    try { sp.printConsole("VOA fx anim hook fail " + eHook); } catch (e2) { }
                }

                // ---- Equipped spell cast stages (poll left/right cast state lightly) ----
                var prevCasting = { 0: false, 1: false };
                var prevSpellId = { 0: 0, 1: 0 };
                try {
                    sp.on("update", function () {
                        try {
                            var pl = sp.Game.getPlayer();
                            if (!pl)
                                return;
                            // 0 = left, 1 = right
                            for (var hand = 0; hand <= 1; hand++) {
                                var spell = null;
                                try { spell = pl.getEquippedSpell(hand); } catch (eG) { spell = null; }
                                var sid = 0;
                                try { sid = spell && spell.getFormID ? spell.getFormID() : 0; } catch (eI) { sid = 0; }
                                if (sid && sid !== prevSpellId[hand]) {
                                    prevSpellId[hand] = sid;
                                }
                                // Detect "is casting" via animation variables when available
                                var casting = false;
                                try {
                                    // bMLh_Ready / bMRh_Ready style — best-effort
                                    casting = !!pl.getAnimationVariableBool(hand === 0 ? "bMLh_Ready" : "bMRh_Ready");
                                }
                                catch (eC) { casting = false; }
                                if (casting && !prevCasting[hand] && sid) {
                                    var now = Date.now();
                                    if (now - (lastSpellAt[hand] || 0) > 200) {
                                        lastSpellAt[hand] = now;
                                        var cross = crosshairRemote();
                                        emit({
                                            kind: "spell",
                                            spellId: sid,
                                            hand: hand,
                                            targetRemote: cross || 0,
                                            anim: hand === 0 ? "MLh_SpellFire_Event" : "MRh_SpellFire_Event",
                                        }, true);
                                        // If this spell has a projectile, also fire proj channel
                                        try {
                                            var spObj = pl.getEquippedSpell(hand);
                                            var pid = spellProjectileId(spObj);
                                            if (pid) {
                                                emitProjectile({
                                                    mode: "spell",
                                                    spellId: sid,
                                                    projId: pid,
                                                    hand: hand,
                                                    targetRemote: cross || 0,
                                                    anim: hand === 0 ? "MLh_SpellFire_Event" : "MRh_SpellFire_Event",
                                                });
                                            }
                                        }
                                        catch (ePr) { }
                                    }
                                }
                                prevCasting[hand] = casting;
                            }
                        }
                        catch (eU) { }
                    });
                }
                catch (eUp) { }

                // ---- Magic effect applied to local player (or by local player) ----
                try {
                    sp.on("magicEffectApply", function (e) {
                        try {
                            if (!e || !e.effect)
                                return;
                            var pl = sp.Game.getPlayer();
                            if (!pl)
                                return;
                            var pid = pl.getFormID();
                            var target = e.target ? e.target.getFormID() : 0;
                            var caster = e.caster ? e.caster.getFormID() : 0;
                            // only when we cast or we are hit by something that needs show
                            if (caster !== pid && caster !== 0x14 && target !== pid && target !== 0x14)
                                return;
                            var effectId = 0;
                            try { effectId = e.effect.getFormID(); } catch (eF) { effectId = 0; }
                            if (!effectId)
                                return;
                            var targetRemote = remoteOf(target);
                            // Prefer sending from caster's perspective when we are caster
                            emit({
                                kind: "meffect",
                                effectId: effectId,
                                targetRemote: targetRemote || 0,
                            }, true);

                            // If effect has a hit shader form, also emit as vfx when possible
                            try {
                                var sh = e.effect.getHitShader && e.effect.getHitShader();
                                if (sh && sh.getFormID) {
                                    var vfxId = sh.getFormID();
                                    if (vfxId) {
                                        emit({
                                            kind: "vfx",
                                            vfxId: vfxId,
                                            targetRemote: targetRemote || 0,
                                            duration: 2,
                                        }, true);
                                    }
                                }
                            }
                            catch (eSh) { }
                        }
                        catch (eM) { }
                    });
                }
                catch (eMe) {
                    try { sp.printConsole("VOA fx magicEffectApply hook fail " + eMe); } catch (e3) { }
                }

                // ---- Bow/crossbow: also watch attack button release via equip+anim (above).
                // Hit with projectile: optional impact cue for others (damage still OnHit).
                try {
                    sp.on("hit", function (e) {
                        try {
                            if (!e || !e.projectile)
                                return;
                            var pl = sp.Game.getPlayer();
                            if (!pl)
                                return;
                            var pid = pl.getFormID();
                            var agr = e.agressor ? e.agressor.getFormID() : 0;
                            if (agr !== pid && agr !== 0x14)
                                return;
                            var projId = 0;
                            try { projId = e.projectile.getFormID(); } catch (eF) { projId = 0; }
                            if (!projId)
                                return;
                            // If we somehow missed the launch anim, still ensure a fire happened recently;
                            // do not re-fire on every hit (would double-spawn). Only tag impact lightly.
                            var tgt = e.target ? remoteOf(e.target.getFormID()) : 0;
                            emit({
                                kind: "meffect",
                                effectId: 0,
                                targetRemote: tgt || 0,
                                anim: "staggerStart",
                                projId: projId,
                            }, false);
                        }
                        catch (eH) { }
                    });
                }
                catch (eHit) { }

                try {
                    sp.printConsole("VOA: FX sync client ready (anim/spell/vfx/proj -> server)");
                }
                catch (eP) { }
            });
        }
    };
});
/* === VOA proximity voice plugin (appended) === */
/**
 * VOA proximity voice — in-game (Keizaal-style).
 *
 * - Fetches LiveKit token from VOA API (game session)
 * - Injects CEF voice HUD + LiveKit client
 * - PTT + one mode-cycle key (normal → shout → whisper → normal)
 * - Pushes local pos + nearby profile distances into CEF for spatial gain
 *
 * Mic/WebRTC live in CEF (in-process overlay), not a separate desktop app.
 *
 * Boot is deferred until skyrimPlatform is ready (once update) — bare IIFE at
 * parse time often has no global yet and would silently no-op.
 */
(function () {
  function startVoaVoice(sp) {
  if (!sp) return;
  try {
    if (sp.storage["voaVoiceReady"]) return;
    sp.storage["voaVoiceReady"] = true;
  } catch (eR) {
    return;
  }

  var MASTER = "http://127.0.0.1:3100";
  var SESSION = "";
  var PROFILE_ID = 0;
  var SLOT = 0;
  var enabled = false;
  var connecting = false;
  var connected = false;
  var mode = "normal"; // whisper | normal | shout — cycle: normal → shout → whisper → normal
  var MODE_CYCLE = ["normal", "shout", "whisper"];
  var pttHeld = false;
  var lastStatePost = 0;
  var lastTokenAt = 0;
  var keybinds = { ptt: "V", cycle: "B" };
  var ranges = { whisper: 800, normal: 2200, shout: 6000 };
  var prevKeys = {};
  var dxKey = null;

  function log(msg) {
    try {
      sp.printConsole("[VOA voice] " + msg);
    } catch (e) {}
  }

  function readSettings() {
    try {
      var s = sp.settings && sp.settings["skymp5-client"];
      if (!s) return;
      if (s["master"]) MASTER = String(s["master"]).replace(/\/$/, "");
      var gd = s["gameData"] || {};
      if (gd.session) SESSION = String(gd.session);
      if (gd.profileId) PROFILE_ID = Number(gd.profileId) || 0;
      if (gd.characterSlot != null) SLOT = Number(gd.characterSlot) || 0;
      // Optional keybinds from launcher-written settings
      if (s["voiceKeybinds"] && typeof s["voiceKeybinds"] === "object") {
        keybinds = Object.assign({}, keybinds, s["voiceKeybinds"]);
      }
    } catch (e) {}
  }

  function httpJson(method, path, body, cb) {
    try {
      var client = new sp.HttpClient(MASTER);
      var urlPath = path;
      if (method === "GET") {
        client.get(
          urlPath,
          { headers: { accept: "application/json" } },
          function (res) {
            try {
              var t = res && res.body ? res.body : "";
              var j = t ? JSON.parse(t) : {};
              cb(null, j, res && res.status);
            } catch (e) {
              cb(e);
            }
          }
        );
      } else {
        client.post(
          urlPath,
          {
            body: JSON.stringify(body || {}),
            contentType: "application/json",
            headers: { accept: "application/json" },
          },
          function (res) {
            try {
              var t = res && res.body ? res.body : "";
              var j = t ? JSON.parse(t) : {};
              cb(null, j, res && res.status);
            } catch (e) {
              cb(e);
            }
          }
        );
      }
    } catch (e) {
      cb(e);
    }
  }

  function cefEval(js) {
    try {
      sp.browser.executeJavaScript(js);
    } catch (e) {
      log("cef eval err " + e);
    }
  }

  function ensureHud() {
    try {
      sp.browser.setVisible(true);
    } catch (e) {}
    // Inject minimal HUD + bootstrap if CEF page not loaded as full document
    var inject =
      "(function(){try{" +
      "if(window.__voaVoiceBoot)return;window.__voaVoiceBoot=1;" +
      "if(!document.getElementById('voa-voice-hud')){" +
      "var s=document.createElement('style');s.textContent=" +
      JSON.stringify(
        "#voa-voice-hud{position:fixed;right:18px;bottom:18px;z-index:2147483646;min-width:140px;padding:10px 14px;border-radius:10px;" +
          "background:linear-gradient(180deg,rgba(18,22,30,.82),rgba(8,10,14,.88));border:1px solid rgba(201,162,39,.45);color:#e8e6e3;" +
          "font-family:Segoe UI,Tahoma,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.85);pointer-events:none}" +
          "#voa-voice-hud.talking{border-color:rgba(80,200,120,.85)}" +
          "#voa-voice-hud.disabled{opacity:.55}" +
          "#voa-voice-title{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#c9a227;margin-bottom:4px}" +
          "#voa-voice-mode{font-size:15px;font-weight:700}" +
          "#voa-voice-status{font-size:11px;opacity:.8;margin-top:3px}"
      ) +
      ";document.head.appendChild(s);" +
      "var el=document.createElement('div');el.id='voa-voice-hud';el.className='disabled';" +
      "el.innerHTML='<div id=\"voa-voice-title\">Proximity voice</div><div id=\"voa-voice-mode\">NORMAL</div><div id=\"voa-voice-status\">Starting…</div>';" +
      "document.body.appendChild(el);}" +
      "function loadScript(src,cb){var x=document.createElement('script');x.src=src;x.onload=function(){cb&&cb()};x.onerror=function(){cb&&cb(new Error('load fail '+src))};document.head.appendChild(x);}" +
      "if(!window.voaVoice){" +
      "loadScript('https://cdn.jsdelivr.net/npm/livekit-client@2.9.9/dist/livekit-client.umd.min.js',function(err){" +
      "if(err){var st=document.getElementById('voa-voice-status');if(st)st.textContent='Voice lib failed';return;}" +
      // Inline minimal controller if voice-app.js not served
      "if(!window.voaVoice){" +
      "window.voaVoice={_mode:'normal',_ptt:false,_room:null,_peers:{},_ranges:{whisper:800,normal:2200,shout:6000},_pos:null,_cell:0,_id:''," +
      "connect:async function(o){var L=window.LivekitClient||window.livekit;if(!L||!L.Room)throw new Error('no livekit');" +
      "if(this._room)try{await this._room.disconnect()}catch(e){}this._id=String(o.identity||'');if(o.ranges)this._ranges=Object.assign({},this._ranges,o.ranges);" +
      "var room=new L.Room({adaptiveStream:true,dynacast:true});this._room=room;var self=this;" +
      "room.on(L.RoomEvent.TrackSubscribed,function(track,pub,p){if(track.kind!=='audio')return;var el=track.attach();el.autoplay=true;el.style.display='none';document.body.appendChild(el);" +
      "var id=String(p.identity||'');if(!self._peers[id])self._peers[id]={};self._peers[id].el=el;self._apply();});" +
      "room.on(L.RoomEvent.TrackUnsubscribed,function(track,pub,p){try{track.detach().forEach(function(el){el.remove()})}catch(e){}" +
      "var id=String(p.identity||'');if(self._peers[id])self._peers[id].el=null;});" +
      "room.on(L.RoomEvent.DataReceived,function(payload,p){try{var t=typeof payload==='string'?payload:new TextDecoder().decode(payload);var m=JSON.parse(t);if(!m||m.t!=='pos')return;" +
      "var id=String((p&&p.identity)||m.profileId||'');if(!id)return;if(!self._peers[id])self._peers[id]={};if(m.mode)self._peers[id].mode=m.mode;" +
      "if(m.pos&&self._pos){var dx=m.pos[0]-self._pos[0],dy=m.pos[1]-self._pos[1],dz=m.pos[2]-self._pos[2];self._peers[id].dist=Math.sqrt(dx*dx+dy*dy+dz*dz);" +
      "if(m.worldOrCell!=null&&self._cell&&m.worldOrCell!==self._cell)self._peers[id].dist=999999;}self._apply();}catch(e){}});" +
      "await room.connect(o.url,o.token);try{await room.localParticipant.setMicrophoneEnabled(false)}catch(e){}" +
      "var hud=document.getElementById('voa-voice-hud');if(hud)hud.classList.remove('disabled');var st=document.getElementById('voa-voice-status');if(st)st.textContent='Hold PTT to talk';}," +
      "disconnect:async function(){try{if(this._room)await this._room.disconnect()}catch(e){}this._room=null;}," +
      "setMode:function(m){this._mode=m;var el=document.getElementById('voa-voice-mode');if(el)el.textContent=String(m).toUpperCase();" +
      "try{if(this._room)this._room.localParticipant.setMetadata(JSON.stringify({mode:m,voa:1}))}catch(e){}}," +
      "setPtt:async function(on){this._ptt=!!on;var hud=document.getElementById('voa-voice-hud');if(hud)hud.classList.toggle('talking',this._ptt);" +
      "var st=document.getElementById('voa-voice-status');if(st)st.textContent=this._ptt?('● Talking ('+String(this._mode).toUpperCase()+')'):'Hold PTT to talk';" +
      "try{if(this._room)await this._room.localParticipant.setMicrophoneEnabled(!!on)}catch(e){}}," +
      "updateWorld:function(p){if(p.pos)this._pos=p.pos;if(p.worldOrCell!=null)this._cell=p.worldOrCell;" +
      "if(Array.isArray(p.nearby)){for(var i=0;i<p.nearby.length;i++){var n=p.nearby[i];var id=String(n.profileId||'');if(!id)continue;if(!this._peers[id])this._peers[id]={};if(typeof n.dist==='number')this._peers[id].gameDist=n.dist;}}this._apply();this._sendPos();}," +
      "_apply:function(){var self=this;Object.keys(this._peers).forEach(function(id){var p=self._peers[id];if(!p||!p.el)return;var mode=p.mode||'normal';var max=self._ranges[mode]||2200;" +
      "var dist=typeof p.gameDist==='number'?p.gameDist:(typeof p.dist==='number'?p.dist:999999);var g=dist>max?0:Math.pow(Math.max(0,1-dist/max),0.85);" +
      "try{p.el.volume=g;p.el.muted=g<=0.01}catch(e){}});}," +
      "_sendPos:function(){if(!this._room||!this._pos)return;try{var msg=JSON.stringify({t:'pos',profileId:this._id,pos:this._pos,worldOrCell:this._cell,mode:this._mode,ptt:this._ptt});" +
      "this._room.localParticipant.publishData(new TextEncoder().encode(msg),{reliable:false})}catch(e){}}};}" +
      "});}" +
      "}catch(e){console&&console.warn(e)}})();";
    cefEval(inject);
  }

  function connectVoice() {
    if (connecting || connected || !enabled) return;
    if (!SESSION || !PROFILE_ID) {
      readSettings();
      if (!SESSION) return;
    }
    connecting = true;
    ensureHud();
    httpJson(
      "POST",
      "/v1/voice/token",
      { session: SESSION, characterSlot: SLOT },
      function (err, data, status) {
        connecting = false;
        if (err || !data || !data.token) {
          log("token fail status=" + status + " " + (err || (data && data.error) || ""));
          cefEval(
            "(function(){var s=document.getElementById('voa-voice-status');if(s)s.textContent=" +
              JSON.stringify((data && data.error) || "Voice offline") +
              "})()"
          );
          return;
        }
        if (data.ranges) ranges = data.ranges;
        var payload = {
          url: data.url,
          token: data.token,
          identity: data.identity || String(PROFILE_ID),
          ranges: ranges,
          mode: mode,
        };
        var js =
          "(async function(){try{" +
          "if(!window.voaVoice||!window.voaVoice.connect){var s=document.getElementById('voa-voice-status');if(s)s.textContent='Voice UI loading…';return;}" +
          "await window.voaVoice.connect(" +
          JSON.stringify(payload) +
          ");" +
          "window.voaVoice.setMode(" +
          JSON.stringify(mode) +
          ");" +
          "}catch(e){var s=document.getElementById('voa-voice-status');if(s)s.textContent=String(e&&e.message||e);}})();";
        // Retry a few times while CEF boots LiveKit
        var tries = 0;
        var t = sp.setTimeout
          ? null
          : null;
        var attempt = function () {
          tries++;
          cefEval(js);
          if (tries < 8) {
            // use update counter instead of setTimeout if needed
          }
        };
        connected = true;
        lastTokenAt = Date.now();
        // Stagger connect attempts via update loop flag
        sp.storage["voaVoicePendingConnect"] = JSON.stringify(payload);
        sp.storage["voaVoiceConnectTries"] = 0;
        log("token ok room=" + data.room + " id=" + payload.identity);
      }
    );
  }

  function flushPendingConnect() {
    var raw = sp.storage["voaVoicePendingConnect"];
    if (!raw) return;
    var tries = Number(sp.storage["voaVoiceConnectTries"] || 0);
    if (tries > 12) {
      delete sp.storage["voaVoicePendingConnect"];
      return;
    }
    sp.storage["voaVoiceConnectTries"] = tries + 1;
    var js =
      "(async function(){try{" +
      "if(!window.voaVoice||!window.voaVoice.connect)return false;" +
      "if(window.voaVoice.getState&&window.voaVoice.getState().connected)return true;" +
      "await window.voaVoice.connect(" +
      raw +
      ");" +
      "window.voaVoice.setMode(" +
      JSON.stringify(mode) +
      ");return true;" +
      "}catch(e){return false}})().then(function(ok){window.__voaVoiceConnected=!!ok});";
    cefEval(js);
    if (tries > 3) {
      // keep trying a bit then clear on success path via connected flag
    }
  }

  function setMode(m) {
    if (m !== "whisper" && m !== "normal" && m !== "shout") return;
    mode = m;
    cefEval(
      "try{window.voaVoice&&window.voaVoice.setMode(" +
        JSON.stringify(m) +
        ")}catch(e){}" +
        "var el=document.getElementById('voa-voice-mode');if(el)el.textContent=" +
        JSON.stringify(String(m).toUpperCase()) +
        ";"
    );
    try {
      sp.Debug.notification("Voice: " + m.toUpperCase());
    } catch (e) {}
  }

  /** normal → shout → whisper → normal */
  function cycleMode() {
    var idx = MODE_CYCLE.indexOf(mode);
    if (idx < 0) idx = 0;
    var next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    setMode(next);
  }

  function setPtt(down) {
    if (pttHeld === down) return;
    pttHeld = down;
    cefEval(
      "try{window.voaVoice&&window.voaVoice.setPtt(" +
        (down ? "true" : "false") +
        ")}catch(e){}"
    );
  }

  /** DX scancode map for default letter keys (US layout-ish). */
  var KEY_CODES = {
    V: 0x2f,
    Z: 0x2c,
    X: 0x2d,
    C: 0x2e,
    B: 0x30,
    N: 0x31,
    M: 0x32,
    F: 0x21,
    G: 0x22,
    H: 0x23,
    T: 0x14,
    Y: 0x15,
    R: 0x13,
  };

  function keyDown(letter) {
    var code = KEY_CODES[String(letter || "").toUpperCase()];
    if (code == null) return false;
    try {
      // Input.isKeyPressed — SP API
      if (sp.Input && sp.Input.isKeyPressed) return sp.Input.isKeyPressed(code);
    } catch (e) {}
    try {
      if (dxKey == null && sp.DxScanCode) {
        // fallback map via DxScanCode enum if present
      }
    } catch (e2) {}
    return false;
  }

  function edge(name, letter) {
    var down = keyDown(letter);
    var was = !!prevKeys[name];
    prevKeys[name] = down;
    return { down: down, pressed: down && !was, released: !down && was };
  }

  function worldOrCellOf(actor) {
    try {
      var w = actor.getWorldSpace();
      if (w) return w.getFormID();
      var c = actor.getParentCell();
      if (c) return c.getFormID();
    } catch (e) {}
    return 0;
  }

  function gatherNearby(player) {
    var nearby = [];
    var px = player.getPositionX();
    var py = player.getPositionY();
    var pz = player.getPositionZ();
    var maxR = ranges.shout || 6000;
    var map = sp.storage["voaProfileByRemote"] || {};
    var known = sp.storage["voaTrueNames"] || {};
    var keys = Object.keys(known);
    var remoteIdToLocalId = null;
    try {
      remoteIdToLocalId = sp.storage["remoteIdToLocalId"] || null;
      if (!remoteIdToLocalId && typeof sp._voaRemoteIdToLocalId === "function") {
        remoteIdToLocalId = sp._voaRemoteIdToLocalId;
      }
    } catch (e) {}

    // Prefer world model if helpers exist on storage
    var r2l = null;
    try {
      if (typeof remoteIdToLocalId === "function") r2l = remoteIdToLocalId;
    } catch (e) {}

    for (var i = 0; i < keys.length; i++) {
      var rid = Number(keys[i]);
      if (!rid || rid < 0xff000000) continue;
      var localId = 0;
      try {
        if (r2l) localId = r2l(rid);
        else if (sp.storage["view"] && sp.storage["view"].getLocalRefrId) {
          localId = sp.storage["view"].getLocalRefrId(rid);
        }
      } catch (eR) {
        localId = 0;
      }
      if (!localId) continue;
      var ac = null;
      try {
        ac = sp.Actor.from(sp.Game.getFormEx(localId));
      } catch (eA) {
        ac = null;
      }
      if (!ac || ac.isDisabled()) continue;
      var dx = ac.getPositionX() - px;
      var dy = ac.getPositionY() - py;
      var dz = ac.getPositionZ() - pz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxR) continue;
      var pid = map[rid] || map[String(rid)] || null;
      if (!pid) continue;
      nearby.push({ profileId: Number(pid), remoteId: rid, dist: dist });
    }
    return nearby;
  }

  function pushWorldState() {
    var player = sp.Game.getPlayer();
    if (!player) return;
    var pos = [
      player.getPositionX(),
      player.getPositionY(),
      player.getPositionZ(),
    ];
    var cell = worldOrCellOf(player);
    var nearby = gatherNearby(player);
    var payload = {
      pos: pos,
      worldOrCell: cell,
      nearby: nearby,
      mode: mode,
      ranges: ranges,
    };
    cefEval(
      "try{window.voaVoice&&window.voaVoice.updateWorld(" +
        JSON.stringify(payload) +
        ")}catch(e){}"
    );
  }

  // Boot
  readSettings();
  httpJson("GET", "/v1/voice/config", null, function (err, cfg) {
    if (err || !cfg) {
      log("config fail — voice disabled");
      return;
    }
    enabled = !!cfg.enabled;
    if (cfg.ranges) ranges = cfg.ranges;
    if (cfg.defaultKeybinds) keybinds = Object.assign({}, keybinds, cfg.defaultKeybinds);
    log("config enabled=" + enabled + " url=" + (cfg.url || ""));
    if (enabled) {
      ensureHud();
      connectVoice();
    } else {
      ensureHud();
      cefEval(
        "(function(){var s=document.getElementById('voa-voice-status');if(s)s.textContent='Voice disabled on server';var h=document.getElementById('voa-voice-hud');if(h)h.classList.add('disabled')})()"
      );
    }
  });

  sp.on("update", function () {
    if (!enabled) return;
    if (sp.storage["voaVoicePendingConnect"]) flushPendingConnect();

    // Re-read session once if missing
    if (!SESSION) readSettings();

    // Token refresh ~ every 90 minutes if connected
    if (connected && Date.now() - lastTokenAt > 90 * 60 * 1000) {
      connected = false;
      connectVoice();
    }

    // Keys
    try {
      var menusBlock = false;
      try {
        if (
          sp.Ui.isMenuOpen("Loading Menu") ||
          sp.Ui.isMenuOpen("Console") ||
          sp.Ui.isMenuOpen("InventoryMenu")
        )
          menusBlock = true;
      } catch (eM) {}

      if (!menusBlock) {
        var ptt = edge("ptt", keybinds.ptt || "V");
        if (ptt.pressed) setPtt(true);
        if (ptt.released) setPtt(false);
        // hold continuous
        if (ptt.down && !pttHeld) setPtt(true);
        if (!ptt.down && pttHeld) setPtt(false);

        // One key cycles: normal → shout → whisper → normal
        var cyc = edge(
          "cycle",
          keybinds.cycle || keybinds.mode || keybinds.whisper || "B"
        );
        if (cyc.pressed) cycleMode();
      } else if (pttHeld) {
        setPtt(false);
      }
    } catch (eK) {}

    var now = Date.now();
    if (now - lastStatePost > 120) {
      lastStatePost = now;
      try {
        pushWorldState();
      } catch (eP) {}
    }
  });

  log("plugin loaded v2 (deferred boot, cycle=B ptt=V)");
  } // end startVoaVoice

  function scheduleBoot() {
    var sp = null;
    try {
      sp = skyrimPlatform;
    } catch (e0) {
      sp = null;
    }
    if (!sp) return false;
    try {
      sp.storage._voaSetupVoice = function () {
        try {
          startVoaVoice(skyrimPlatform);
        } catch (eS) {
          try {
            skyrimPlatform.printConsole("[VOA voice] setup err " + eS);
          } catch (e2) {}
        }
      };
    } catch (e1) {}
    try {
      sp.once("update", function () {
        try {
          startVoaVoice(skyrimPlatform);
        } catch (eU) {
          try {
            skyrimPlatform.printConsole("[VOA voice] boot err " + eU);
          } catch (e3) {}
        }
      });
      try {
        sp.printConsole("[VOA voice] boot scheduled");
      } catch (eL) {}
      return true;
    } catch (e2) {
      try {
        startVoaVoice(sp);
        return true;
      } catch (e3) {
        return false;
      }
    }
  }

  if (!scheduleBoot()) {
    // Retry a few frames via polling global if SP loads after this file
    var tries = 0;
    var iv = null;
    try {
      iv = setInterval(function () {
        tries++;
        if (scheduleBoot() || tries > 200) {
          try {
            clearInterval(iv);
          } catch (eC) {}
        }
      }, 50);
    } catch (eI) {
      // Chakra/SP may lack setInterval — front/index once(update) path still works via _voaSetupVoice
    }
  }
})();
