"use strict";
/**
 * Node system: after spawnAllowed, mark actor as Discord staff in Chakra gamemode.
 * Also polls API for in-game console_cmd actions (HTTP path; CustomEvent is unreliable).
 */
const http = require("http");
const API = process.env.VOA_API_BASE || "http://127.0.0.1:3100";
const SECRET = process.env.VOA_GAME_SECRET || process.env.GAME_SERVER_SECRET || "";

function httpJson(method, path, body) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(API + path);
      const payload = body != null ? JSON.stringify(body) : null;
      const headers = {
        Accept: "application/json",
        "X-VOA-Game-Secret": SECRET,
      };
      if (payload) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(payload);
      }
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + u.search,
          method,
          headers,
          timeout: 6000,
        },
        (res) => {
          let b = "";
          res.on("data", (c) => (b += c));
          res.on("end", () => {
            try {
              const j = b ? JSON.parse(b) : null;
              if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
              else reject(new Error(method + " " + path + " => " + res.statusCode + " " + b.slice(0, 180)));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout " + path));
      });
      if (payload) req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function isStaff(profileId) {
  return new Promise((resolve) => {
    if (!profileId) return resolve(false);
    const q =
      "/v1/game/is-staff?profileId=" +
      encodeURIComponent(profileId) +
      "&secret=" +
      encodeURIComponent(SECRET);
    const u = new URL(API + q);
    const req = http.get(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        timeout: 4000,
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(b);
            resolve(!!(j && j.isStaff));
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function escapeJsString(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, " ")
    .replace(/\n/g, "\\n");
}

/**
 * Systems receive ctx.svr = NativeGameServer wrapper, which does NOT proxy
 * executeJavaScriptOnChakra / getUserByActor. The real ScampServer is at
 * ctx.svr.svr (see dist_back/nativeGameServer.js + index.js).
 */
function rawScamp(ctxOrSvr) {
  const w = ctxOrSvr && ctxOrSvr.svr ? ctxOrSvr.svr : ctxOrSvr;
  if (!w) return null;
  if (typeof w.executeJavaScriptOnChakra === "function") return w;
  if (w.svr && typeof w.svr.executeJavaScriptOnChakra === "function") return w.svr;
  // still return inner if present (getUserActor etc. may live there)
  if (w.svr) return w.svr;
  return w;
}

function runChakra(ctxOrSvr, js) {
  const raw = rawScamp(ctxOrSvr);
  if (raw && typeof raw.executeJavaScriptOnChakra === "function") {
    raw.executeJavaScriptOnChakra(js);
    return true;
  }
  return false;
}

/**
 * Build self-contained Chakra JS for admin cmds.
 * Do NOT call mp._voaConsole — host mp does not retain custom function props on this build.
 * Only use mp.get / mp.set / eval property (stock).
 */
function buildConsoleCmdJs(actorId, staffProfileId, cmd, args) {
  const aid = Number(actorId) || 0;
  const pid = Number(staffProfileId) || 0;
  const c = String(cmd || "").toLowerCase();
  const argsJson = JSON.stringify(Array.isArray(args) ? args : []);
  // Shared helpers + per-command body (ES5 / Chakra-safe)
  return (
    "(function(){try{" +
    "if(typeof mp==='undefined'||!mp){console.log('[VOA-staff] no mp');return;}" +
    "var actorId=" +
    aid +
    ",pid=" +
    pid +
    ",cmd='" +
    escapeJsString(c) +
    "';" +
    "var args=" +
    argsJson +
    ";" +
    "try{mp.set(actorId,'voaStaff',true);}catch(eS){}" +
    "try{mp.set(actorId,'voaProfileId',pid);}catch(eP){}" +
    "function online(){try{var l=mp.get(0,'onlinePlayers');return l&&l.length?l:[];}catch(e){return[];}}" +
    "function pname(id){try{var n=mp.get(id,'voaCharName');if(n)return String(n);}catch(e0){}" +
    "try{var a=mp.get(id,'appearance');if(a&&a.name)return String(a.name);}catch(e1){}" +
    "try{var p=mp.get(id,'voaProfileId');if(p!=null)return 'p'+p;}catch(e2){}" +
    "return 'player#'+(Number(id)||0).toString(16);}" +
    "function pushEval(id,code){try{var prev=null;try{prev=mp.get(id,'eval');}catch(eE){}" +
    "var n=prev&&typeof prev.n==='number'?prev.n+1:1;mp.set(id,'eval',{n:n,f:String(code||'')});return true;}catch(eN){console.log('[VOA-staff] eval fail '+eN);return false;}}" +
    // Results must hit VOA chat UI (toast alone is easy to miss / often fails mid-menu)
    "function notify(id,text){text=String(text||'');" +
    "var line={channel:'sys',name:'System',text:text,fromId:0,system:true};" +
    "var jsChat='(function(){try{var line='+JSON.stringify(line)+';'+" +
    "var raw=ctx.sp.storage[\\'voaChatQueueJson\\'];var q=[];'+" +
    "try{if(typeof raw===\\'string\\'&&raw.length)q=JSON.parse(raw);}catch(e0){q=[];}'+" +
    "if(!q||!q.length)q=[];q.push(line);if(q.length>80)q=q.slice(-80);'+" +
    "ctx.sp.storage[\\'voaChatQueueJson\\']=JSON.stringify(q);'+" +
    "try{ctx.sp.storage[\\'voaForceBrowser\\']=true;ctx.sp.storage[\\'voaChatLogUntil\\']=Date.now()+120000;}catch(e1){}'+" +
    "try{ctx.sp.printConsole(\\'VOA admin: \\'+line.text);}catch(e2){}'+" +
    "try{ctx.sp.Debug.notification(line.text.slice(0,120));}catch(e3){}'+" +
    "}catch(e){}})()';" +
    "pushEval(id,jsChat);}" +
    "function parseFormId(v){if(v==null||v==='')return 0;if(typeof v==='number'&&isFinite(v))return v>>>0?v>>>0:Number(v)||0;" +
    "var s=String(v).trim();if(!s)return 0;var n=parseInt(s,0);if(!n&&/^[0-9a-f]+$/i.test(s))n=parseInt(s,16);return n||0;}" +
    "function findPlayer(q){q=String(q||'').trim();if(!q)return 0;" +
    "if((q.charAt(0)==='\"'&&q.charAt(q.length-1)==='\"')||(q.charAt(0)===\"'\"&&q.charAt(q.length-1)===\"'\"))q=q.slice(1,-1).trim();" +
    "var onlineL=online(),i,id,name,pid2,ql=q.toLowerCase(),partial=0,contains=0;" +
    "if(/^0x[0-9a-f]+$/i.test(q)||/^[0-9]+$/.test(q)){var asId=parseInt(q,0);if(asId>0){for(i=0;i<onlineL.length;i++){if(Number(onlineL[i])===asId)return asId;}}}" +
    "for(i=0;i<onlineL.length;i++){id=Number(onlineL[i]);if(!id)continue;name=pname(id).toLowerCase();if(name===ql)return id;" +
    "try{pid2=mp.get(id,'voaProfileId');if(pid2!=null){var ps=String(pid2);if(ps===q||('p'+ps).toLowerCase()===ql)return id;}}catch(eP){}" +
    "if(!partial&&name.indexOf(ql)===0)partial=id;if(!contains&&name.indexOf(ql)>=0)contains=id;}" +
    "return partial||contains;}" +
    "function getLoc(id){var pos=[0,0,0],angle=[0,0,0],world=null;" +
    "try{var p=mp.get(id,'pos');if(p&&p.length>=3)pos=[Number(p[0]),Number(p[1]),Number(p[2])];}catch(e0){}" +
    "try{var a=mp.get(id,'angle');if(a&&a.length>=3)angle=[Number(a[0]),Number(a[1]),Number(a[2])];}catch(e1){}" +
    "try{world=mp.get(id,'worldOrCellDesc');}catch(e2){}return {pos:pos,angle:angle,world:world};}" +
    "function setLoc(id,loc,off){off=off||0;try{if(loc.world!=null)mp.set(id,'worldOrCellDesc',loc.world);}catch(eW){}" +
    "try{mp.set(id,'pos',[loc.pos[0]+off,loc.pos[1],loc.pos[2]]);}catch(eP){}try{if(loc.angle)mp.set(id,'angle',loc.angle);}catch(eA){}}" +
    // commands
    "if(cmd==='listplayers'||cmd==='players'){" +
    "var o=online(),lines=[],j;for(j=0;j<o.length;j++){var oid=Number(o[j]);lines.push(pname(oid)+' ['+oid.toString(16)+']');}" +
    "var msg=o.length===0?'No players online':'Online ('+o.length+'): '+lines.join(', ');" +
    "console.log('[VOA-staff] '+msg);notify(actorId,msg);return;}" +
    "if(cmd==='additem'){" +
    "var itemId=0,count=1;" +
    "if(args.length>=3){itemId=parseFormId(args[1]);count=parseInt(String(args[2]),10)||1;}" +
    "else if(args.length===2){var a0=parseFormId(args[0]),a1=parseFormId(args[1]);" +
    "if(a0===0x14||a0===20){itemId=a1;count=1;}else{itemId=a0;count=parseInt(String(args[1]),10)||1;}}" +
    "else if(args.length===1){itemId=parseFormId(args[0]);count=1;}" +
    "if(!itemId){notify(actorId,'Usage: /additem <formId> [count]');return;}" +
    "if(count<1)count=1;if(count>10000)count=10000;" +
    "var inv={entries:[]};try{inv=mp.get(actorId,'inventory')||{entries:[]};}catch(eI){}" +
    "if(!inv.entries)inv.entries=[];var found=false;" +
    "for(var ii=0;ii<inv.entries.length;ii++){if(+inv.entries[ii].baseId===itemId){inv.entries[ii].count=(+inv.entries[ii].count||0)+count;found=true;break;}}" +
    "if(!found)inv.entries.push({baseId:itemId,count:count});" +
    "try{mp.set(actorId,'inventory',inv);}catch(eSet){console.log('[VOA-staff] set inv fail '+eSet);}" +
    "console.log('[VOA-staff] additem '+itemId.toString(16)+' x'+count+' -> '+actorId.toString(16));" +
    "notify(actorId,'additem '+itemId.toString(16)+' x'+count);return;}" +
    "if(cmd==='announce'||cmd==='a'){" +
    "var msgA=args.map(function(x){return String(x);}).join(' ').trim();" +
    "if(!msgA){notify(actorId,'Usage: /announce <message>');return;}" +
    // Prefer full CEF announce from console snippet when available
    "if(typeof mp._voaAnnounceAll==='function'){try{var nA=mp._voaAnnounceAll(msgA,pname(actorId));" +
    "notify(actorId,'Announcement sent to '+nA+' player(s)');return;}catch(eAnn){console.log('[VOA-staff] announceAll fail '+eAnn);}}" +
    "var oA=online(),na=0,ka;" +
    "for(ka=0;ka<oA.length;ka++){notify(Number(oA[ka]),'[ANNOUNCE] '+msgA);na++;}" +
    "notify(actorId,'Announcement sent to '+na+' player(s)');return;}" +
    "if(cmd==='tp'||cmd==='tpto'||cmd==='goto'){" +
    "var tq=args.map(function(x){return String(x);}).join(' ').trim();" +
    "if(!tq){notify(actorId,'Usage: /tp <PlayerName>');return;}" +
    "var t=findPlayer(tq);if(!t){notify(actorId,'Player not found: '+tq);return;}" +
    "if(t===actorId){notify(actorId,'Already at target');return;}" +
    "setLoc(actorId,getLoc(t),40);notify(actorId,'Teleported to '+pname(t));notify(t,pname(actorId)+' teleported to you');return;}" +
    "if(cmd==='summon'||cmd==='bring'){" +
    "var tq2=args.map(function(x){return String(x);}).join(' ').trim();" +
    "if(!tq2){notify(actorId,'Usage: /summon <PlayerName>');return;}" +
    "var t2=findPlayer(tq2);if(!t2){notify(actorId,'Player not found: '+tq2);return;}" +
    "if(t2===actorId){notify(actorId,'Cannot summon yourself');return;}" +
    "setLoc(t2,getLoc(actorId),60);notify(actorId,'Summoned '+pname(t2));notify(t2,'You were summoned by '+pname(actorId));return;}" +
    "if(cmd==='giveplayerspell'||cmd==='givespell'||cmd==='addspell'){" +
    "var spellId=0,tQuery='self';" +
    "if(args.length>=2){tQuery=String(args[0]);spellId=parseFormId(args[1]);}" +
    "else if(args.length===1){spellId=parseFormId(args[0]);}" +
    "if(!spellId){notify(actorId,'Usage: /giveplayerspell <player|self> <spellId>');return;}" +
    "var tId=actorId;var tqL=String(tQuery).toLowerCase();" +
    "if(tqL&&tqL!=='self'&&tqL!=='me'&&tqL!=='player'){var ft=findPlayer(tQuery);if(!ft){notify(actorId,'Player not found: '+tQuery);return;}tId=ft;}" +
    "var jsSp=\"(function(){try{var id=\"+spellId+\";var form=ctx.sp.Game.getFormEx(id);if(!form){ctx.sp.printConsole('VOA: spell not found');return;}" +
    "var spell=ctx.sp.Spell.from(form);if(!spell){ctx.sp.printConsole('VOA: not a spell');return;}" +
    "var player=ctx.sp.Game.getPlayer();if(!player)return;var ok=player.addSpell(spell,true);" +
    "ctx.sp.printConsole('VOA: addSpell '+id.toString(16)+' => '+ok);" +
    "try{ctx.sp.Debug.notification('Spell granted');}catch(e2){}}catch(e){}})()\";" +
    "try{var prev2=null;try{prev2=mp.get(tId,'eval');}catch(eE2){}" +
    "var n2=prev2&&typeof prev2.n==='number'?prev2.n+1:1;mp.set(tId,'eval',{n:n2,f:jsSp});}catch(eSp){}" +
    "notify(actorId,'Gave spell '+spellId.toString(16)+' to '+pname(tId));return;}" +
    "notify(actorId,'Unknown admin cmd: '+cmd);" +
    "console.log('[VOA-staff] unknown cmd '+cmd);" +
    "}catch(eAll){console.log('[VOA-staff] cmd fail '+eAll);}})();"
  );
}

class VoaStaffConsole {
  constructor(log) {
    this.log = log;
    this.systemName = "VoaStaffConsole";
    this._ctx = null;
    this._pollTimer = null;
    /** @type {Record<number, number>} profileId -> live actor form id */
    this._liveActors = Object.create(null);
    /** @type {Record<number, number>} profileId -> userId (for disconnect cleanup) */
    this._liveUsers = Object.create(null);
  }

  async initAsync(ctx) {
    this._ctx = ctx;
    this.log(
      "VoaStaffConsole init (API=" +
        API +
        " secret=" +
        (SECRET ? "set" : "MISSING") +
        ")"
    );
    const mark = (userId, profileId, attempt) => {
      try {
        const actorId = ctx.svr.getUserActor(userId);
        if (!actorId) {
          if (attempt < 8) {
            setTimeout(() => mark(userId, profileId, attempt + 1), 1000);
          }
          return;
        }
        // Always track the *currently connected* actor for this profile (not actors[0])
        const pid = Number(profileId) || 0;
        const aid = Number(actorId) || 0;
        if (pid && aid) {
          this._liveActors[pid] = aid;
          this._liveUsers[pid] = Number(userId);
        }
        isStaff(profileId).then((ok) => {
          try {
            const js =
              "try{" +
              "if(typeof mp!=='undefined'&&mp){" +
              "if(typeof mp._voaSetStaffFlag==='function'){" +
              "mp._voaSetStaffFlag(" +
              Number(actorId) +
              "," +
              Number(profileId) +
              "," +
              (ok ? "true" : "false") +
              ");" +
              "}else{" +
              "try{mp.set(" +
              Number(actorId) +
              ",'voaStaff'," +
              (ok ? "true" : "false") +
              ");}catch(e0){}" +
              "try{mp.set(" +
              Number(actorId) +
              ",'voaProfileId'," +
              Number(profileId) +
              ");}catch(e1){}" +
              "}" +
              "}" +
              "}catch(e){}";
            const ran = runChakra(ctx, js);
            this.log(
              "VOA staff console flag p" +
                profileId +
                " actor=" +
                actorId.toString(16) +
                " staff=" +
                ok +
                " chakra=" +
                ran +
                " try=" +
                attempt
            );
          } catch (e) {
            this.log("VOA staff flag set fail: " + e);
          }
        });
      } catch (e) {
        this.log("VOA staff spawn hook: " + e);
      }
    };
    ctx.gm.on("spawnAllowed", (userId, profileId) => {
      setTimeout(() => mark(userId, profileId, 1), 500);
      setTimeout(() => mark(userId, profileId, 2), 2000);
      setTimeout(() => mark(userId, profileId, 3), 5000);
      setTimeout(() => mark(userId, profileId, 4), 10000);
    });
    // Clear live map when player leaves so we don't target a stale offline form
    try {
      if (typeof ctx.gm.on === "function") {
        const clearUser = (userId) => {
          const uid = Number(userId);
          for (const pid of Object.keys(this._liveUsers)) {
            if (Number(this._liveUsers[pid]) === uid) {
              delete this._liveUsers[pid];
              delete this._liveActors[pid];
              this.log("VOA live actor clear p" + pid + " user=" + uid);
            }
          }
        };
        ctx.gm.on("userDisconnect", clearUser);
        ctx.gm.on("disconnect", clearUser);
      }
    } catch (eDisc) {
      this.log("VOA disconnect hook skip: " + eDisc);
    }

    // Poll HTTP-queued console + interact (CustomEvent path is broken on this build)
    if (SECRET) {
      this._pollTimer = setInterval(() => {
        this.pollQueuedActions().catch((e) => {
          this.log("queue poll err: " + e);
        });
      }, 1000);
      if (typeof this._pollTimer.unref === "function") this._pollTimer.unref();
      this.log("VOA console+interact HTTP poll active (1s)");
    } else {
      this.log("VOA console HTTP poll OFF (no GAME secret)");
    }

    // Enforce ragged starter kit after race menu / new chars (Node has timers; Chakra does not)
    this._starterUntil = Object.create(null); // actorId -> untilMs
    this._starterTimer = setInterval(() => {
      this.enforceStarterKit();
    }, 2500);
    if (typeof this._starterTimer.unref === "function") this._starterTimer.unref();
    this.log("VOA starter enforce poll active (2.5s)");

    // Re-install FX CustomEvent handler (host mp sometimes drops function props)
    this._fxReinjectTimer = setInterval(() => {
      this.reinjectFxHandler();
    }, 5000);
    if (typeof this._fxReinjectTimer.unref === "function") this._fxReinjectTimer.unref();
    setTimeout(() => this.reinjectFxHandler(), 1500);
    this.log("VOA FX handler re-inject active (5s)");
  }

  reinjectFxHandler() {
    if (!this._ctx) return;
    // Only re-bind if missing; full snippet load is preferred at boot
    const js =
      "try{" +
      "if(typeof mp==='undefined'||!mp)return;" +
      "if(typeof mp._voaFx==='function')return;" +
      "var fxSeq=mp._voaFxSeq||Object.create(null);mp._voaFxSeq=fxSeq;" +
      "mp._voaFx=function(senderFormId,a0){try{" +
      "var actorId=Number(senderFormId)||0;if(!actorId)return;" +
      "var payload=a0;" +
      "if(typeof a0==='string'){try{payload=JSON.parse(a0);}catch(e0){payload={kind:'anim',anim:a0};}}" +
      "if(payload&&typeof payload==='object'&&payload.length!=null){payload=payload[0]||payload;}" +
      "if(!payload||typeof payload!=='object')return;" +
      "var n=(fxSeq[actorId]||0)+1;fxSeq[actorId]=n;" +
      "payload.n=n;payload.t=Date.now();" +
      "try{mp.set(actorId,'voaFx',payload);}catch(eS){console.log('[VOA-fx] set fail '+eS);}" +
      "}catch(e){console.log('[VOA-fx] reinject handler err '+e);}};" +
      "try{mp._voaSync=mp._voaFx;}catch(e2){}" +
      "console.log('[VOA-fx] handler re-injected');" +
      "}catch(eAll){console.log('[VOA-fx] reinject fail '+eAll);}";
    try {
      runChakra(this._ctx, js);
    } catch (e) {
      /* quiet */
    }
  }

  enforceStarterKit() {
    if (!this._ctx || !rawScamp(this._ctx)) return;
    // While race menu is open OR classic iron starter kit is present on a brand-new
    // looking inventory (iron set + gold + few items), force ragged robes+boots.
    // Does NOT strip established characters (no iron starter pattern / large inv).
    try {
      const js = `
try{
  if(typeof mp==='undefined'||!mp)return;
  var online=mp.get(0,'onlinePlayers')||[];
  var ROBES=0x3c9fe,BOOTS=0x3ca00;
  var entries=[{baseId:ROBES,count:1,worn:true},{baseId:BOOTS,count:1,worn:true}];
  for(var i=0;i<online.length;i++){
    var id=Number(online[i]); if(!id)continue;
    var race=false; try{race=mp.get(id,'isRaceMenuOpen')===true;}catch(e0){}
    var inv=null; try{inv=mp.get(id,'inventory');}catch(e1){}
    var n=0, ironPieces=0, gold=0, potions=0;
    if(inv&&inv.entries){
      n=inv.entries.length;
      for(var j=0;j<inv.entries.length;j++){
        var b=Number(inv.entries[j].baseId);
        var c=Number(inv.entries[j].count)||0;
        if(b===0x12e4d||b===0x12e46||b===0x12e49||b===0x12e4b||b===0x12eb6||b===0x12eb7||b===0x1397d||b===0x1397e||b===0x13790) ironPieces++;
        if(b===0xf) gold=c;
        if(b===0x3eadd||b===0x3eae0||b===0x3eae5) potions+=c;
      }
    }
    // Vanilla chargen iron kit (with or without gold/potions). Also pure iron armor set.
    var classicStarter = ironPieces>=2 && gold>=10 && n>=6 && n<=30;
    var ironArmorOnly = ironPieces>=3 && n<=12 && gold<=0;
    var hasRags=false;
    if(inv&&inv.entries){
      for(var r=0;r<inv.entries.length;r++){
        var rb=Number(inv.entries[r].baseId);
        if(rb===ROBES||rb===BOOTS){hasRags=true;break;}
      }
    }
    if(race || classicStarter || (ironArmorOnly && !hasRags)){
      try{mp.set(id,'inventory',{entries:entries});}catch(eS){}
      try{mp.set(id,'equipment',{inv:{entries:entries},numChanges:1});}catch(eE){}
      if(typeof mp._voaStarterKit==='function'){try{mp._voaStarterKit(id);}catch(eK){}}
      console.log('[VOA-starter] enforce '+id.toString(16)+' race='+race+' classic='+classicStarter+' ironOnly='+ironArmorOnly+' n='+n);
    }
  }
}catch(eAll){console.log('[VOA-starter] enforce err '+eAll);}
`;
      runChakra(this._ctx, js);
    } catch (e) {
      // quiet
    }
  }

  /**
   * Resolve the *online* actor for a profile.
   * Never blindly use getActorsByProfileId()[0] — multi-slot profiles
   * (slot 0 offline + slot 1 online) would hit the wrong character.
   */
  /**
   * Refresh live profile→actor map from connected users.
   * spawnAllowed can miss rebuilds; getUserByActor is flaky under offlineMode.
   */
  refreshLiveActorsFromUsers() {
    if (!this._ctx || !this._ctx.svr) return;
    const wrap = this._ctx.svr;
    const raw = rawScamp(this._ctx) || wrap;
    let maxUsers = 64;
    try {
      if (typeof wrap.getMaxPlayers === "function") maxUsers = wrap.getMaxPlayers() || 64;
      else if (raw && typeof raw.getMaxPlayers === "function")
        maxUsers = raw.getMaxPlayers() || 64;
    } catch (eM) {}
    for (let userId = 0; userId < maxUsers; userId++) {
      try {
        let actorId = 0;
        if (typeof wrap.getUserActor === "function") {
          actorId = Number(wrap.getUserActor(userId)) || 0;
        } else if (raw && typeof raw.getUserActor === "function") {
          actorId = Number(raw.getUserActor(userId)) || 0;
        }
        if (!actorId) continue;
        // Resolve profileId: getUserProfileId / actors list / stored map
        let profileId = 0;
        try {
          if (typeof wrap.getUserProfileId === "function") {
            profileId = Number(wrap.getUserProfileId(userId)) || 0;
          } else if (raw && typeof raw.getUserProfileId === "function") {
            profileId = Number(raw.getUserProfileId(userId)) || 0;
          }
        } catch (eP) {}
        if (!profileId) {
          // reverse lookup stored
          for (const pid of Object.keys(this._liveUsers)) {
            if (Number(this._liveUsers[pid]) === userId) {
              profileId = Number(pid);
              break;
            }
          }
        }
        if (!profileId) continue;
        this._liveActors[profileId] = actorId;
        this._liveUsers[profileId] = userId;
      } catch (eU) {
        /* skip slot */
      }
    }
  }

  actorForProfile(profileId) {
    const pid = Number(profileId) || 0;
    if (!pid || !this._ctx || !this._ctx.svr) return 0;
    const wrap = this._ctx.svr;
    const raw = rawScamp(this._ctx) || wrap;

    // Opportunistic refresh so poll never stays stuck on empty map
    try {
      this.refreshLiveActorsFromUsers();
    } catch (eR) {}

    // 1) Live mapping from spawnAllowed / user scan — ALWAYS trust if set.
    // Do NOT discard when getUserByActor is null (common under offlineMode).
    const live = Number(this._liveActors[pid]) || 0;
    if (live) return live;

    // 2) Among all profile actors, prefer one that still has a connected user
    let actors = [];
    try {
      let list = [];
      if (wrap && typeof wrap.getActorsByProfileId === "function") {
        list = wrap.getActorsByProfileId(pid) || [];
      } else if (raw && typeof raw.getActorsByProfileId === "function") {
        list = raw.getActorsByProfileId(pid) || [];
      }
      actors = list.map((a) => Number(a) || 0).filter(Boolean);
    } catch (eList) {
      actors = [];
    }

    if (actors.length && raw && typeof raw.getUserByActor === "function") {
      for (let i = 0; i < actors.length; i++) {
        try {
          const u = raw.getUserByActor(actors[i]);
          if (u != null && u !== undefined && u !== 0 && u !== -1) {
            this._liveActors[pid] = actors[i];
            return actors[i];
          }
        } catch (eOne) {
          /* try next */
        }
      }
    }

    // 3) Any profile actor (newest form id) — still better than "wait offline" forever
    if (actors.length) {
      actors.sort((a, b) => (a >>> 0) - (b >>> 0));
      const fallback = actors[actors.length - 1] || 0;
      if (fallback) {
        this._liveActors[pid] = fallback;
        this.log(
          "actorForProfile p" +
            pid +
            " profile-actor fallback=" +
            fallback.toString(16) +
            " n=" +
            actors.length
        );
        return fallback;
      }
    }

    return 0;
  }

  async pollQueuedActions() {
    if (!this._ctx || !SECRET) return;
    const ctx = this._ctx;
    let data;
    try {
      data = await httpJson("GET", "/v1/game/pending-admin-actions");
    } catch (e) {
      // visible — silent return made dead polls look like success
      try {
        console.log("[VOA-staff] queue poll GET fail: " + e);
      } catch (e0) {}
      return;
    }
    const actions = (data && data.actions) || [];
    if (!actions.length) return;
    const doneIds = [];
    for (const a of actions) {
      const kind = String(a.action || "");
      if (kind !== "console_cmd" && kind !== "interact_cmd") continue;
      try {
        if (kind === "console_cmd") {
          const payload = a.payload || {};
          const cmd = String(payload.cmd || "").toLowerCase();
          const args = Array.isArray(payload.args) ? payload.args : [];
          const staffProfileId =
            Number(payload.staffProfileId) || Number(a.profileId) || 0;
          if (!cmd || !staffProfileId) {
            try {
              console.log(
                "[VOA-staff] console_cmd drop id=" +
                  a.id +
                  " cmd=" +
                  cmd +
                  " p=" +
                  staffProfileId
              );
            } catch (eD) {}
            doneIds.push(Number(a.id));
            continue;
          }
          let actorId = this.actorForProfile(staffProfileId);
          const argsJson = JSON.stringify(Array.isArray(args) ? args : []);
          const cmdJson = JSON.stringify(String(cmd || "").toLowerCase());
          const pidNum = Number(staffProfileId) || 0;

          // Resolve actor in Chakra if Node map is empty (offlineMode / reconnect races).
          // Finds onlinePlayers entry with matching voaProfileId, then runs _voaConsole.
          const finalJs =
            "(function(){try{" +
            "if(typeof mp==='undefined'||!mp){console.log('[VOA-staff] no mp');return;}" +
            "var pid=" +
            pidNum +
            ",cmd=" +
            cmdJson +
            ",argsJson=" +
            JSON.stringify(argsJson) +
            ";" +
            "var actorId=" +
            (Number(actorId) || 0) +
            ";" +
            "function findByProfile(p){" +
            "try{var online=mp.get(0,'onlinePlayers')||[],i,id,pp;" +
            "for(i=0;i<online.length;i++){id=Number(online[i]);if(!id)continue;" +
            "try{pp=Number(mp.get(id,'voaProfileId'))||0;}catch(e0){pp=0;}" +
            "if(pp===p)return id;}" +
            "}catch(eF){}return 0;}" +
            "if(!actorId)actorId=findByProfile(pid);" +
            "if(!actorId){console.log('[VOA-staff] no online actor for p'+pid+' cmd='+cmd);return;}" +
            "try{mp.set(actorId,'voaStaff',true);}catch(eS){}" +
            "try{mp.set(actorId,'voaProfileId',pid);}catch(eP){}" +
            "if(typeof mp._voaConsole==='function'){" +
            "mp._voaConsole(actorId,pid,cmd,argsJson);" +
            "console.log('[VOA-staff] via _voaConsole '+cmd+' actor='+actorId.toString(16)+' p'+pid);" +
            "}else{" +
            "console.log('[VOA-staff] _voaConsole missing p'+pid+' actor='+actorId.toString(16));" +
            // Minimal listplayers/announce without full inline builder
            "function pushEval(id,code){try{var prev=null;try{prev=mp.get(id,'eval');}catch(eE){}" +
            "var n=prev&&typeof prev.n==='number'?prev.n+1:1;mp.set(id,'eval',{n:n,f:String(code||'')});}catch(eN){}}" +
            "function notify(id,text){var line={channel:'sys',name:'System',text:String(text||''),fromId:0,system:true};" +
            "var js='(function(){try{var line='+JSON.stringify(line)+';var raw=ctx.sp.storage[\"voaChatQueueJson\"];var q=[];'+" +
            "try{if(typeof raw===\"string\"&&raw.length)q=JSON.parse(raw);}catch(e0){q=[];}if(!q||!q.length)q=[];q.push(line);if(q.length>80)q=q.slice(-80);'+" +
            "ctx.sp.storage[\"voaChatQueueJson\"]=JSON.stringify(q);try{ctx.sp.Debug.notification(line.text.slice(0,120));}catch(e3){}}catch(e){}})()';" +
            "pushEval(id,js);}" +
            "if(cmd==='listplayers'||cmd==='players'){" +
            "var o=mp.get(0,'onlinePlayers')||[],lines=[],j;" +
            "for(j=0;j<o.length;j++){var oid=Number(o[j]);var nm='?';try{var a=mp.get(oid,'appearance');if(a&&a.name)nm=a.name;}catch(eN){}" +
            "try{var cn=mp.get(oid,'voaCharName');if(cn)nm=cn;}catch(eC){}lines.push(nm+' ['+oid.toString(16)+']');}" +
            "notify(actorId,o.length?('Online ('+o.length+'): '+lines.join(', ')):'No players online');" +
            "}else if(cmd==='announce'||cmd==='a'){" +
            "var msgA='';try{var ar=JSON.parse(argsJson);if(ar&&ar.length)msgA=ar.join(' ');}catch(eA){}" +
            "if(!msgA){notify(actorId,'Usage: /announce <message>');return;}" +
            "if(typeof mp._voaAnnounceAll==='function'){mp._voaAnnounceAll(msgA,'Staff');}" +
            "else{var oa=mp.get(0,'onlinePlayers')||[],k;for(k=0;k<oa.length;k++)notify(Number(oa[k]),'[ANNOUNCE] '+msgA);}" +
            "notify(actorId,'Announcement sent');" +
            "}else{notify(actorId,'Admin cmd needs full console handler: '+cmd);}" +
            "}" +
            "}catch(eAll){console.log('[VOA-staff] cmd fail '+eAll);}})();";

          if (runChakra(ctx, finalJs)) {
            this.log(
              "console_cmd HTTP p" +
                staffProfileId +
                " actor=" +
                (actorId ? actorId.toString(16) : "chakra-resolve") +
                " " +
                cmd
            );
            try {
              console.log(
                "[VOA-staff] console_cmd HTTP p" +
                  staffProfileId +
                  " actor=" +
                  (actorId ? actorId.toString(16) : "chakra-resolve") +
                  " " +
                  cmd +
                  " id=" +
                  a.id
              );
            } catch (eL) {}
            // Ack even if actor was resolved only in Chakra — otherwise queue stuck.
            // If truly offline, Chakra logs "no online actor" and user can re-issue.
            doneIds.push(Number(a.id));
          } else {
            try {
              console.log(
                "[VOA-staff] executeJavaScriptOnChakra MISSING — cannot run " +
                  cmd
              );
            } catch (eM) {}
            // do not ack
          }
          continue;
        }

        // interact_cmd: give name / trade
        const p = a.payload || {};
        const act = String(p.action || "giveName");
        const targetRemote = Number(p.targetRemoteId) || Number(a.actorFormId) || 0;
        const fromProfile = Number(p.fromProfileId) || Number(a.profileId) || 0;
        const senderActor = this.actorForProfile(fromProfile);
        if (!senderActor) {
          this.log("interact_cmd wait offline p" + fromProfile + " " + act);
          continue;
        }
        const payloadJson = JSON.stringify(p.payload || {});
        const js2 =
          "try{" +
          "if(typeof mp!=='undefined'&&mp&&typeof mp._voaInteract==='function'){" +
          "mp._voaInteract(" +
          Number(senderActor) +
          ",'" +
          escapeJsString(act) +
          "'," +
          Number(targetRemote) +
          "," +
          JSON.stringify(payloadJson) +
          ");" +
          "}else{console.log('[VOA-interact] _voaInteract missing');}" +
          "}catch(eI){console.log('[VOA-interact] http invoke fail '+eI);}";
        if (runChakra(ctx, js2)) {
          this.log(
            "interact_cmd HTTP p" +
              fromProfile +
              " " +
              act +
              " -> " +
              targetRemote.toString(16)
          );
        } else {
          continue;
        }
        doneIds.push(Number(a.id));
      } catch (eOne) {
        this.log("queue action fail " + a.id + ": " + eOne);
        doneIds.push(Number(a.id));
      }
    }
    if (doneIds.length) {
      try {
        await httpJson("POST", "/v1/game/pending-admin-actions/ack", {
          ids: doneIds,
        });
      } catch (eAck) {
        this.log("queue ack fail: " + eAck);
      }
    }
  }

  disconnect() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._starterTimer) {
      clearInterval(this._starterTimer);
      this._starterTimer = null;
    }
    if (this._fxReinjectTimer) {
      clearInterval(this._fxReinjectTimer);
      this._fxReinjectTimer = null;
    }
  }
}
exports.VoaStaffConsole = VoaStaffConsole;
