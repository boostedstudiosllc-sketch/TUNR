// Playing a friend, live: two phones in a room, over Supabase Realtime
// (broadcast + presence; no tables, nothing to set up). Every Arcade game
// with a multiplayer mode uses this: a room has a short code to share, and
// Quick match pairs whoever is waiting in that game's lobby.
//
// In a room: presence { id, name, look, ready, ... } and messages
// { e: event, p: payload } ("start" from the host, then whatever the game
// sends: positions, inputs, snapshots, "done").

import { supabase } from "./supabase.js";
import { newRoomCode, cleanCode, hostOf, quickRoomCode, JOIN_KEY } from "./gameRooms.js";
export { newRoomCode, cleanCode, hostOf, JOIN_KEY };

// For testing without Supabase: localStorage "tunr.fakeNet" = "1" in
// development uses the browser's BroadcastChannel between tabs, or, when a
// test page provides window.__tunrRelay, hands messages to the test to pass
// between two browsers.
function fakeTransport(name, key) {
  const bc = new BroadcastChannel(`tunr-${name}`);
  const relay = typeof window !== "undefined" && window.__tunrRelay;
  const post = (data) => (relay ? relay({ ...data, channel: name }) : bc.postMessage(data));
  const handlers = {};
  const peers = new Map();
  let mine = null;
  const emitPresence = () => handlers.presence?.([...peers.values()].map((p) => p.state).concat(mine ? [mine] : []));
  const receive = (data) => {
    if (data.kind === "presence") {
      // Someone new: tell them we're here, as real presence would.
      if (data.state && !peers.has(data.key) && mine) post({ kind: "presence", key, state: mine });
      if (data.state) peers.set(data.key, { state: data.state, at: Date.now() });
      else peers.delete(data.key);
      emitPresence();
    } else handlers[data.event]?.(data.payload);
  };
  bc.onmessage = ({ data }) => receive(data);
  if (relay) (window.__tunrNet ||= {})[name] = receive;
  const beat = setInterval(() => {
    if (mine) post({ kind: "presence", key, state: mine });
    let gone = false;
    for (const [k, p] of peers) if (Date.now() - p.at > 3500) (peers.delete(k), (gone = true));
    if (gone) emitPresence();
  }, 1000);
  return {
    ready: Promise.resolve(),
    on: (event, fn) => (handlers[event] = fn),
    track: async (state) => {
      mine = state;
      post({ kind: "presence", key, state });
      emitPresence();
    },
    send: async (event, payload) => post({ kind: "msg", event, payload }),
    close: () => {
      clearInterval(beat);
      post({ kind: "presence", key, state: null });
      bc.close();
      if (relay) delete window.__tunrNet[name];
    },
  };
}

function supabaseTransport(name, key) {
  const channel = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key } } });
  const handlers = {};
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    handlers.presence?.(Object.values(state).map((list) => list[list.length - 1]));
  });
  channel.on("broadcast", { event: "m" }, ({ payload }) => handlers.m?.(payload));
  const ready = new Promise((ok, fail) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") ok();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") fail(new Error(`Couldn't connect to the race. (${err?.message || status.toLowerCase().replace("_", " ")})`));
    });
  });
  return {
    ready,
    on: (event, fn) => (handlers[event] = fn),
    track: (state) => channel.track(state),
    send: (event, payload) => channel.send({ type: "broadcast", event, payload }),
    close: () => supabase.removeChannel(channel),
  };
}

function transport(name, key) {
  let fake = false;
  try {
    fake = import.meta.env?.DEV && localStorage.getItem("tunr.fakeNet") === "1";
  } catch (e) {
    console.warn("Couldn't read the test network setting:", e.message);
  }
  if (fake) return fakeTransport(name, key);
  if (!supabase) throw new Error("Playing a friend needs the internet connection to TUNR.");
  return supabaseTransport(name, key);
}

// Joins a game's room. `me`: { id, name, look }. onPeers(everyone in the
// room, you included); onMessage(event, payload) for everything sent.
export async function joinRoom(game, code, me, { onPeers, onMessage }) {
  const t = transport(`${game}-room-${code}`, me.id);
  let state = { ...me, ready: false, joinedAt: Date.now() };
  t.on("presence", (list) => onPeers?.(list.filter(Boolean)));
  t.on("m", (m) => m && onMessage?.(m.e, m.p));
  await t.ready;
  await t.track(state);
  const send = (e, p) => t.send("m", { e, p });
  return {
    code,
    // Change your presence: ready, look, or anything the game shows (opts).
    set: (patch) => t.track((state = { ...state, ...patch })),
    send,
    leave: async () => {
      try {
        await send("bye", { id: me.id });
      } catch (e) {
        console.warn("Couldn't say goodbye to the room:", e.message);
      }
      t.close();
    },
  };
}

// Quick match: wait in the lobby until someone else is there. Everyone
// sorts the lobby the same way and pairs it off in twos, so both players
// pick the same room. Calls onMatch(code, otherPlayer); returns cancel().
export async function quickMatch(game, me, onMatch) {
  const t = transport(`${game}-lobby`, me.id);
  let done = false;
  t.on("presence", (list) => {
    if (done) return;
    const waiting = list.filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    const i = waiting.findIndex((p) => p.id === me.id);
    if (i < 0) return;
    const partner = waiting[i % 2 === 0 ? i + 1 : i - 1];
    if (!partner) return;
    done = true;
    const code = quickRoomCode(me.id, partner.id);
    // Stay in the lobby a moment, so the partner sees us too, then go.
    setTimeout(() => t.close(), 2500);
    onMatch(code, partner);
  });
  await t.ready;
  await t.track({ id: me.id, name: me.name, joinedAt: Date.now() });
  return () => {
    if (!done) {
      done = true;
      t.close();
    }
  };
}
