/**
 * VOA in-game proximity voice (CEF page).
 * Controlled by Skyrim Platform via window.voaVoice / browserMessage bridge.
 *
 * SP → CEF:
 *   voaVoice.connect({ url, token, identity, ranges })
 *   voaVoice.setMode('whisper'|'normal'|'shout')
 *   voaVoice.setPtt(true|false)
 *   voaVoice.updateWorld({ pos, worldOrCell, nearby: [{ profileId, dist }] })
 *   voaVoice.disconnect()
 */
(function () {
  "use strict";

  var Livekit =
    (typeof LivekitClient !== "undefined" && LivekitClient) ||
    (typeof livekit !== "undefined" && livekit) ||
    null;

  var state = {
    room: null,
    mode: "normal",
    ptt: false,
    ranges: { whisper: 800, normal: 2200, shout: 6000 },
    myPos: null,
    myCell: 0,
    /** profileId -> { dist, pos, mode, audioEl, trackSid } */
    peers: {},
    identity: "",
    connected: false,
    localTrack: null,
    masterVolume: 1,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setHud() {
    var hud = $("voa-voice-hud");
    var modeEl = $("voa-voice-mode");
    var statusEl = $("voa-voice-status");
    var peersEl = $("voa-voice-peers");
    if (!hud) return;
    var modeLabel = String(state.mode || "normal").toUpperCase();
    if (modeEl) modeEl.textContent = modeLabel;
    hud.classList.toggle("talking", !!state.ptt && state.connected);
    hud.classList.toggle("disabled", !state.connected);
    if (statusEl) {
      if (!state.connected) statusEl.textContent = "Offline";
      else if (state.ptt) statusEl.textContent = "● Talking (" + modeLabel + ")";
      else statusEl.textContent = "Hold PTT to talk";
    }
    if (peersEl) {
      var n = 0;
      for (var k in state.peers) {
        if (state.peers[k] && state.peers[k].audible) n++;
      }
      peersEl.textContent = n ? n + " nearby voice" : "";
    }
  }

  function rangeForMode(mode) {
    var m = mode || "normal";
    var r = state.ranges[m];
    return typeof r === "number" && r > 0 ? r : 2200;
  }

  function gainFor(dist, mode) {
    var max = rangeForMode(mode);
    if (!(dist >= 0) || dist > max) return 0;
    var t = 1 - dist / max;
    // mild curve
    return Math.pow(Math.max(0, Math.min(1, t)), 0.85) * state.masterVolume;
  }

  function applyGains() {
    for (var id in state.peers) {
      var p = state.peers[id];
      if (!p) continue;
      var mode = p.mode || "normal";
      // Prefer game-reported distance when available
      var dist =
        typeof p.gameDist === "number"
          ? p.gameDist
          : typeof p.dist === "number"
            ? p.dist
            : 999999;
      var g = gainFor(dist, mode);
      p.audible = g > 0.01;
      if (p.audioEl) {
        try {
          p.audioEl.volume = g;
          p.audioEl.muted = g <= 0.01;
        } catch (e) {}
      }
    }
    setHud();
  }

  function attachRemoteAudio(participant, track) {
    if (!track || track.kind !== "audio") return;
    var identity = String(participant.identity || "");
    if (!identity || identity === state.identity) return;

    var el = track.attach();
    el.autoplay = true;
    el.style.display = "none";
    document.body.appendChild(el);

    if (!state.peers[identity]) {
      state.peers[identity] = { mode: "normal", dist: 999999, gameDist: null };
    }
    state.peers[identity].audioEl = el;
    state.peers[identity].trackSid = track.sid;
    applyGains();
  }

  function detachRemoteAudio(participant, track) {
    var identity = String((participant && participant.identity) || "");
    try {
      track.detach().forEach(function (el) {
        try {
          el.remove();
        } catch (e) {}
      });
    } catch (e2) {}
    if (identity && state.peers[identity]) {
      state.peers[identity].audioEl = null;
      state.peers[identity].audible = false;
    }
    setHud();
  }

  async function ensureMicTrack() {
    if (state.localTrack) return state.localTrack;
    if (!Livekit || !Livekit.createLocalAudioTrack) {
      throw new Error("livekit-client not loaded");
    }
    state.localTrack = await Livekit.createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    return state.localTrack;
  }

  async function setMicPublished(on) {
    if (!state.room || !state.connected) return;
    try {
      if (on) {
        var track = await ensureMicTrack();
        await state.room.localParticipant.publishTrack(track, {
          source: Livekit.Track && Livekit.Track.Source
            ? Livekit.Track.Source.Microphone
            : undefined,
          dtx: true,
          red: true,
        });
        // Publish mode with metadata for listeners
        try {
          await state.room.localParticipant.setMetadata(
            JSON.stringify({ mode: state.mode, voa: 1 })
          );
        } catch (eM) {}
      } else if (state.localTrack) {
        try {
          await state.room.localParticipant.unpublishTrack(state.localTrack);
        } catch (eU) {
          try {
            state.localTrack.stop();
          } catch (eS) {}
          state.localTrack = null;
        }
      }
    } catch (e) {
      console.warn("[VOA voice] mic publish", e);
    }
  }

  async function connect(opts) {
    opts = opts || {};
    if (!Livekit || !Livekit.Room) {
      setHud();
      $("voa-voice-status") &&
        ($("voa-voice-status").textContent = "LiveKit library missing");
      return { ok: false, error: "livekit-client missing" };
    }
    await disconnect();

    if (opts.ranges) state.ranges = Object.assign({}, state.ranges, opts.ranges);
    state.identity = String(opts.identity || "");
    state.mode = opts.mode || state.mode || "normal";

    var room = new Livekit.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    state.room = room;

    room.on(Livekit.RoomEvent.TrackSubscribed, function (track, _pub, participant) {
      attachRemoteAudio(participant, track);
    });
    room.on(Livekit.RoomEvent.TrackUnsubscribed, function (track, _pub, participant) {
      detachRemoteAudio(participant, track);
    });
    room.on(Livekit.RoomEvent.ParticipantDisconnected, function (participant) {
      var id = String(participant.identity || "");
      if (state.peers[id] && state.peers[id].audioEl) {
        try {
          state.peers[id].audioEl.remove();
        } catch (e) {}
      }
      delete state.peers[id];
      setHud();
    });
    room.on(Livekit.RoomEvent.DataReceived, function (payload, participant) {
      try {
        var text =
          typeof payload === "string"
            ? payload
            : new TextDecoder().decode(payload);
        var msg = JSON.parse(text);
        if (!msg || msg.t !== "pos") return;
        var id = String(
          (participant && participant.identity) || msg.profileId || ""
        );
        if (!id) return;
        if (!state.peers[id]) state.peers[id] = {};
        if (msg.mode) state.peers[id].mode = msg.mode;
        if (msg.pos && state.myPos) {
          var dx = msg.pos[0] - state.myPos[0];
          var dy = msg.pos[1] - state.myPos[1];
          var dz = msg.pos[2] - state.myPos[2];
          state.peers[id].dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (msg.worldOrCell != null && state.myCell && msg.worldOrCell !== state.myCell) {
            state.peers[id].dist = 999999;
          }
        }
        applyGains();
      } catch (e) {}
    });
    room.on(Livekit.RoomEvent.ParticipantMetadataChanged, function (_meta, participant) {
      try {
        var id = String(participant.identity || "");
        var raw = participant.metadata || "";
        if (!raw || !id) return;
        var meta = JSON.parse(raw);
        if (!state.peers[id]) state.peers[id] = {};
        if (meta.mode) state.peers[id].mode = meta.mode;
        applyGains();
      } catch (e) {}
    });

    await room.connect(opts.url, opts.token);
    state.connected = true;
    // Start muted — PTT only
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (e) {}
    setHud();
    return { ok: true };
  }

  async function disconnect() {
    state.connected = false;
    state.ptt = false;
    try {
      if (state.localTrack) {
        state.localTrack.stop();
        state.localTrack = null;
      }
    } catch (e) {}
    try {
      if (state.room) await state.room.disconnect();
    } catch (e2) {}
    state.room = null;
    for (var id in state.peers) {
      var p = state.peers[id];
      if (p && p.audioEl) {
        try {
          p.audioEl.remove();
        } catch (e3) {}
      }
    }
    state.peers = {};
    setHud();
  }

  function setMode(mode) {
    if (mode !== "whisper" && mode !== "normal" && mode !== "shout") return;
    state.mode = mode;
    if (state.room && state.connected) {
      try {
        state.room.localParticipant.setMetadata(
          JSON.stringify({ mode: state.mode, voa: 1 })
        );
      } catch (e) {}
    }
    setHud();
    publishPosData(true);
  }

  /** normal → shout → whisper → normal */
  function cycleMode() {
    var order = ["normal", "shout", "whisper"];
    var idx = order.indexOf(state.mode);
    if (idx < 0) idx = 0;
    setMode(order[(idx + 1) % order.length]);
  }

  async function setPtt(down) {
    state.ptt = !!down;
    setHud();
    await setMicPublished(state.ptt);
    if (state.ptt) publishPosData(true);
  }

  function updateWorld(payload) {
    payload = payload || {};
    if (payload.pos) state.myPos = payload.pos;
    if (payload.worldOrCell != null) state.myCell = payload.worldOrCell;
    if (payload.ranges) state.ranges = Object.assign({}, state.ranges, payload.ranges);
    if (Array.isArray(payload.nearby)) {
      for (var i = 0; i < payload.nearby.length; i++) {
        var n = payload.nearby[i];
        var id = String(n.profileId || "");
        if (!id) continue;
        if (!state.peers[id]) state.peers[id] = { mode: "normal" };
        if (typeof n.dist === "number") state.peers[id].gameDist = n.dist;
      }
    }
    applyGains();
    publishPosData(false);
  }

  var lastDataAt = 0;
  function publishPosData(force) {
    if (!state.room || !state.connected || !state.myPos) return;
    var now = Date.now();
    if (!force && now - lastDataAt < 100) return;
    lastDataAt = now;
    try {
      var msg = JSON.stringify({
        t: "pos",
        profileId: Number(state.identity) || state.identity,
        pos: state.myPos,
        worldOrCell: state.myCell,
        mode: state.mode,
        ptt: state.ptt,
      });
      var data = new TextEncoder().encode(msg);
      state.room.localParticipant.publishData(data, { reliable: false });
    } catch (e) {}
  }

  window.voaVoice = {
    connect: connect,
    disconnect: disconnect,
    setMode: setMode,
    cycleMode: cycleMode,
    setPtt: setPtt,
    updateWorld: updateWorld,
    getState: function () {
      return {
        connected: state.connected,
        mode: state.mode,
        ptt: state.ptt,
        identity: state.identity,
      };
    },
  };

  setHud();
  console.log("[VOA voice] CEF page ready");
})();
