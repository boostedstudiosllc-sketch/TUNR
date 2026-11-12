// Convoy voice chat (118_convoy_voice.sql): everyone in a convoy who joins
// voice can talk, like a group call. Audio goes phone to phone (WebRTC,
// encrypted end to end); the private channel "convoy-voice:<id>" (members
// only) is just how phones find each other. Nothing is recorded.
// Rules for who connects and who's talking: voiceMath.js. UI: Convoy.jsx.

import { supabase } from "./supabase.js";
import { openChannel } from "./gameNet.js";
import { voicePeers, shouldOffer, talkingNow, micError } from "./voiceMath.js";

const FALLBACK = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

// The connection servers, with a relay when the owner's set one up (api/turn.js).
async function iceServers(convoyId) {
  try {
    const { data } = (await supabase?.auth.getSession()) || {};
    const token = data?.session?.access_token;
    if (!token) return { servers: FALLBACK, relay: false };
    const r = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ convoyId }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `status ${r.status}`);
    const body = await r.json();
    return { servers: body.iceServers?.length ? body.iceServers : FALLBACK, relay: Boolean(body.relay) };
  } catch (e) {
    console.warn(`Voice relay unavailable, trying direct. (${e.message})`);
    return { servers: FALLBACK, relay: false };
  }
}

// Join. me: { id, name }. onChange({ people: [{ id, name, muted, talking,
// status }], me: { muted, talking }, full, relay }) whenever anything changes.
// Returns { setMuted(bool), leave() }.
export async function joinVoice(convoyId, me, onChange) {
  let mic;
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) {
    throw new Error(micError(e));
  }
  const { servers, relay } = await iceServers(convoyId);
  const ch = openChannel(`convoy-voice:${convoyId}`, me.id, { private: true, what: "Couldn't connect to the convoy's voice chat." });
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = AudioCtx ? new AudioCtx() : null;
  const peers = new Map(); // id → { pc, el, name, muted, status, analyser, talk, queue }
  let state = { id: me.id, name: me.name, muted: false, joinedAt: Date.now() };
  let mine = null; // local talking detector
  let full = false;
  let closed = false;

  const meter = (stream) => {
    if (!audio) return null;
    const a = audio.createAnalyser();
    a.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(a);
    return { a, buf: new Float32Array(a.fftSize), talk: null };
  };
  const rms = (m) => {
    m.a.getFloatTimeDomainData(m.buf);
    let s = 0;
    for (const v of m.buf) s += v * v;
    return Math.sqrt(s / m.buf.length);
  };
  mine = meter(mic);

  const emit = () =>
    !closed &&
    onChange({
      people: [...peers.entries()].map(([id, p]) => ({ id, name: p.name, muted: p.muted, talking: Boolean(p.meter?.talk?.talking) && !p.muted, status: p.status })),
      me: { muted: state.muted, talking: Boolean(mine?.talk?.talking) && !state.muted },
      full,
      relay,
    });

  const signal = (to, type, data) => ch.send("m", { to, from: me.id, type, data });

  function connect(peer) {
    const pc = new RTCPeerConnection({ iceServers: servers });
    const p = { pc, name: peer.name, muted: Boolean(peer.muted), status: "connecting", queue: [], meter: null, el: null, restarted: false };
    peers.set(peer.id, p);
    for (const t of mic.getAudioTracks()) pc.addTrack(t, mic);
    pc.onicecandidate = (e) => e.candidate && signal(peer.id, "ice", e.candidate.toJSON());
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (!p.el) {
        p.el = new Audio();
        p.el.autoplay = true;
        p.el.playsInline = true;
      }
      p.el.srcObject = stream;
      p.el.play().catch((err) => console.warn(`Couldn't play @${p.name}'s voice yet. (${err.message})`));
      p.meter = meter(stream);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      p.status = s === "connected" ? "connected" : s === "failed" ? "failed" : s === "disconnected" ? "reconnecting" : "connecting";
      // One retry on a dropped network (driving under a bridge).
      if (s === "failed" && !p.restarted && shouldOffer(me.id, peer.id)) {
        p.restarted = true;
        pc.restartIce?.();
        offer(peer.id, p, true);
      }
      emit();
    };
    return p;
  }

  async function offer(id, p, iceRestart = false) {
    const o = await p.pc.createOffer({ iceRestart });
    await p.pc.setLocalDescription(o);
    signal(id, "offer", p.pc.localDescription.toJSON());
  }

  async function drain(p) {
    for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch((e) => console.warn(e.message));
  }

  ch.on("m", async (m) => {
    if (closed || !m || m.to !== me.id || m.from === me.id) return;
    let p = peers.get(m.from);
    try {
      if (m.type === "offer") {
        if (!p) return; // only people we see in voice
        await p.pc.setRemoteDescription(m.data);
        await drain(p);
        const a = await p.pc.createAnswer();
        await p.pc.setLocalDescription(a);
        signal(m.from, "answer", p.pc.localDescription.toJSON());
      } else if (m.type === "answer" && p) {
        await p.pc.setRemoteDescription(m.data);
        await drain(p);
      } else if (m.type === "ice" && p) {
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.data);
        else p.queue.push(m.data);
      }
    } catch (e) {
      console.warn(`Voice link with ${m.from} hit a snag. (${e.message})`);
    }
  });

  ch.on("presence", (states) => {
    if (closed) return;
    const r = voicePeers(states, me.id);
    full = r.full;
    const want = new Map(r.peers.map((s) => [s.id, s]));
    for (const [id, p] of peers) {
      if (!want.has(id)) {
        p.pc.close();
        if (p.el) p.el.srcObject = null;
        peers.delete(id);
      }
    }
    for (const [id, s] of want) {
      const p = peers.get(id) || connect(s);
      p.name = s.name;
      p.muted = Boolean(s.muted);
      if (!p.offered && shouldOffer(me.id, id)) {
        p.offered = true;
        offer(id, p).catch((e) => console.warn(`Couldn't call @${s.name}. (${e.message})`));
      }
    }
    emit();
  });

  await ch.ready;
  await ch.track(state);
  audio?.resume?.().catch((e) => console.warn(e.message));

  // Who's talking, five times a second.
  const tick = setInterval(() => {
    if (mine) mine.talk = talkingNow(mine.talk, state.muted ? 0 : rms(mine));
    for (const p of peers.values()) if (p.meter) p.meter.talk = talkingNow(p.meter.talk, rms(p.meter));
    emit();
  }, 200);
  emit();

  return {
    setMuted: (muted) => {
      for (const t of mic.getAudioTracks()) t.enabled = !muted;
      state = { ...state, muted };
      ch.track(state).catch((e) => console.warn(e.message));
      emit();
    },
    leave: () => {
      closed = true;
      clearInterval(tick);
      for (const p of peers.values()) {
        p.pc.close();
        if (p.el) p.el.srcObject = null;
      }
      peers.clear();
      for (const t of mic.getTracks()) t.stop();
      audio?.close?.().catch((e) => console.warn(e.message));
      ch.close();
    },
  };
}
