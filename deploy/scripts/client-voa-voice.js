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
