import { useEffect, useRef, useState } from "react";
import { joinRoom, quickMatch, newRoomCode, cleanCode, hostOf } from "../lib/gameNet.js";
import { takeSharedRoom } from "../lib/gameRooms.js";
import { loadProfile } from "../lib/store.js";
import { muted, bigButton, quietButton, field } from "./Sheet.jsx";
import InviteSheetGame from "./InviteSheetGame.jsx";

// Playing a friend, live, in any Arcade game that has it: make a room and
// share its code (or the link), join one with a code, or Quick match with
// whoever's waiting. Both tap READY and the host's phone starts the game
// (with the host's settings, `options`). No points: bragging rights only.
//
//   renderPlay({ start, room, hooks, opponent, isHost, onDone, onQuit })
//     the game itself. start: { seed, round, opts }. hooks.current[event]
//     gets the other phone's messages; room.send(event, payload) sends.
//   renderResult(result, opponent): shown in the room after a game.
//   describe(opts): one line saying what the host picked (track, laps…).
//   settings: the pickers for those (track, laps), shown before and in the
//     room; the host's picks are the ones played.
//   prepare(opts): (host only) gets anything both phones need before the
//     start (the quiz's cars); it goes out as start.data.

export default function FriendRoom({ game, title = "PLAY A FRIEND", intro, user, look = null, audio, options = null, describe, settings = null, prepare = null, renderPlay, renderResult, onExit, onNeedAccount }) {
  const [name, setName] = useState(null);
  const [stage, setStage] = useState("menu"); // menu | searching | room | play
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [peers, setPeers] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  // Invites sent from this room, shown as pending until they join:
  // [{ id, name, kind: "tunr" | "link" }].
  const [invited, setInvited] = useState([]);
  const room = useRef(null);
  const peersNow = useRef([]);
  const hooks = useRef({});
  const round = useRef(0);
  const cancelSearch = useRef(null);
  const me = user ? { id: user.id, name: name || "driver", look } : null;

  useEffect(() => {
    if (!user) return;
    loadProfile(user.id)
      .then((p) => setName(p?.username || user.email?.split("@")[0] || "driver"))
      .catch((e) => {
        console.warn(e.message);
        setName(user.email?.split("@")[0] || "driver");
      });
  }, [user?.id]);

  // Opened from a shared link: straight into that room.
  useEffect(() => {
    if (!user || name == null) return;
    let shared = null;
    try {
      shared = takeSharedRoom(game);
    } catch (e) {
      console.warn("Couldn't read the shared room code:", e.message);
    }
    if (shared) enter(cleanCode(shared));
  }, [user?.id, name]);

  // Leave the room (and the lobby) when this screen closes.
  useEffect(
    () => () => {
      cancelSearch.current?.();
      room.current?.leave();
    },
    []
  );

  // Keep your car and (as host) your settings up to date for the other player.
  useEffect(() => {
    room.current?.set({ look, opts: options }).catch((e) => console.warn(e.message));
  }, [JSON.stringify(look), JSON.stringify(options)]);

  // The game's music plays in the room and through the game (it can only
  // start from a tap, so it begins when you make, join or match a room).
  const music = () => {
    const a = audio?.current;
    if (a?.unlock() && a.prefs.music) a.startMusic();
  };

  async function enter(roomCode) {
    if (!user) return onNeedAccount?.();
    if (!roomCode || roomCode.length < 4) return setError("Room codes are 4 letters or numbers.");
    setError("");
    music();
    await room.current?.leave();
    try {
      room.current = await joinRoom(game, roomCode, me, {
        onPeers: (list) => {
          peersNow.current = list;
          setPeers(list);
        },
        onMessage: (e, p) => (e === "start" ? begin(p) : hooks.current[e]?.(p)),
      });
      await room.current.set({ opts: options });
      if (roomCode !== code) setInvited([]);
      setCode(roomCode);
      setReady(false);
      setResult(null);
      setStage("room");
    } catch (e) {
      setError(e.message);
      setStage("menu");
    }
  }

  async function search() {
    if (!user) return onNeedAccount?.();
    setError("");
    music();
    setStage("searching");
    try {
      cancelSearch.current = await quickMatch(game, me, (roomCode) => {
        cancelSearch.current = null;
        enter(roomCode);
      });
    } catch (e) {
      setError(e.message);
      setStage("menu");
    }
  }

  const opponent = peers.find((p) => p.id !== user?.id) || null;
  // First two in are playing; anyone else is told the room's full.
  const players = [...peers].sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 2);
  const full = peers.length > 2 && !players.some((p) => p.id === user?.id);
  const host = players.length === 2 ? hostOf(players) : null;
  // Invites still out (gone once that person, or anyone for a link, joins).
  const pending = invited.filter((p) => (p.kind === "link" ? players.length < 2 : !peers.some((x) => x.id === p.id)));
  const hostOpts = players.find((p) => p.id === host)?.opts;

  function begin(p) {
    if (p.round <= round.current) return;
    round.current = p.round;
    const opp = peersNow.current.find((x) => x.id !== user.id);
    setResult(null);
    setStart({ ...p, opponent: { id: opp?.id, name: opp?.name || "your friend", look: opp?.look || null }, isHost: hostOf(peersNow.current.slice(0, 2)) === user.id });
    setStage("play");
    music();
  }

  // Both ready: the host starts the game for both phones.
  useEffect(() => {
    if (stage !== "room" || players.length < 2 || !players.every((p) => p.ready)) return;
    if (host !== user.id) return;
    let cancelled = false;
    (async () => {
      try {
        const go = { seed: Math.floor(Math.random() * 1e6) + 1, round: round.current + 1, opts: options };
        if (prepare) go.data = await prepare(options);
        if (cancelled) return;
        await room.current?.send("start", go);
        begin(go);
      } catch (e) {
        setError(`Couldn't start the game. (${e.message})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, JSON.stringify(players.map((p) => [p.id, p.ready]))]);

  async function toggleReady() {
    const next = !ready;
    setReady(next);
    try {
      await room.current?.set({ ready: next });
    } catch (e) {
      setReady(!next);
      setError(`Couldn't tell your friend you're ready. (${e.message})`);
    }
  }

  async function share() {
    const url = `${location.origin}/?play=${game}&room=${code}`;
    const text = `Play me in TUNR. Room ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "TUNR Arcade", text, url });
      else {
        await navigator.clipboard.writeText(`${text}: ${url}`);
        setCopied(true);
      }
      setInvited((list) => (list.some((p) => p.kind === "link") ? list : [...list, { id: "link", name: "Room link", kind: "link" }]));
      setInviting(false);
    } catch (e) {
      if (e.name !== "AbortError") setError(`Couldn't share the room. (${e.message})`);
    }
  }

  async function leave() {
    cancelSearch.current?.();
    cancelSearch.current = null;
    await room.current?.leave();
    room.current = null;
    setPeers([]);
    setInvited([]);
    setStage("menu");
  }

  if (stage === "play" && start) {
    return renderPlay({
      start,
      room: room.current,
      hooks,
      opponent: start.opponent,
      isHost: start.isHost,
      onDone: (r) => {
        hooks.current = {};
        setResult(r);
        setStage("room");
        setReady(false);
        room.current?.set({ ready: false }).catch((e) => console.warn(e.message));
      },
      onQuit: () => {
        hooks.current = {};
        leave();
      },
    });
  }

  const card = { marginTop: 12, padding: 14, borderRadius: 14, background: "#13161c", border: "1px solid #232833" };
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <button onClick={stage === "menu" ? onExit : leave} style={{ ...quietButton, padding: "8px 12px", fontSize: 13 }}>
          ← {stage === "menu" ? "BACK" : "LEAVE"}
        </button>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>👥 {title}</div>
        {error && (
          <div role="alert" style={{ ...muted, color: "#f87171", marginTop: 6 }}>
            {error}
          </div>
        )}

        {stage === "menu" && (
          <>
            <div style={{ ...muted, marginTop: 4 }}>{intro} No points, just bragging rights.</div>
            {!user && <div style={{ ...muted, marginTop: 8, color: "#FACC15" }}>Sign in to play other people.</div>}
            {settings}
            {options && describe && <div style={{ ...muted, marginTop: 8, color: "#cbd5e1" }}>Your room plays: {describe(options)}</div>}
            <button className="action-btn" onClick={() => enter(newRoomCode())} style={{ ...bigButton, marginTop: 14, background: "#FACC15", color: "#111" }}>
              + MAKE A ROOM
            </button>
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8a94a3" }}>GOT A CODE?</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enter(cleanCode(typed));
                }}
                style={{ display: "flex", gap: 8, marginTop: 8 }}
              >
                <input value={typed} onChange={(e) => setTyped(cleanCode(e.target.value))} placeholder="ABCD" aria-label="Room code" autoCapitalize="characters" style={{ ...field, flex: 1, fontSize: 22, letterSpacing: 6, textAlign: "center", fontWeight: 900 }} />
                <button type="submit" style={{ ...bigButton, width: 110, marginTop: 0 }}>
                  JOIN
                </button>
              </form>
            </div>
            <button className="action-btn" onClick={search} style={{ ...quietButton, width: "100%", marginTop: 12, padding: "14px 0", fontSize: 16 }}>
              ⚡ QUICK MATCH WITH ANYONE
            </button>
          </>
        )}

        {stage === "searching" && (
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🔎</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Looking for a player…</div>
            <div style={{ ...muted }}>Anyone who taps Quick match in this game gets paired with you. Keep this screen open.</div>
          </div>
        )}

        {stage === "room" && (
          <>
            {result && <div style={{ marginTop: 12 }}>{renderResult(result, opponent || start?.opponent)}</div>}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8a94a3" }}>ROOM CODE</div>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 10, lineHeight: 1.1 }}>{code.length > 4 ? "QUICK" : code}</div>
              {code.length === 4 && (
                <button onClick={() => setInviting(true)} style={{ ...quietButton, marginTop: 6, padding: "9px 16px", fontSize: 14 }}>
                  {copied ? "✓ LINK COPIED" : "📤 SEND TO A FRIEND"}
                </button>
              )}
            </div>
            {full ? (
              <div style={{ ...card, color: "#f87171" }}>This room already has two players. Make your own room, or try another code.</div>
            ) : (
              <div style={card}>
                {players.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.look?.color || "#888888", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>
                      @{p.name}
                      {p.id === user.id ? " (you)" : ""}
                      {p.id === host ? <span style={{ fontSize: 11, color: "#8a94a3", marginLeft: 6 }}>HOST</span> : null}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: p.ready ? "#4ade80" : "#8a94a3" }}>{p.ready ? "✓ READY" : "NOT READY"}</span>
                  </div>
                ))}
                {players.length < 2 &&
                  pending.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", opacity: 0.85 }}>
                      <span aria-hidden="true" style={{ width: 12, textAlign: "center", flexShrink: 0 }}>{p.kind === "link" ? "📤" : "⏳"}</span>
                      <span style={{ flex: 1, fontSize: 16, fontWeight: 900, color: "#cbd5e1" }}>{p.kind === "link" ? "Room link sent" : `@${p.name}`}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: "#FACC15" }}>{p.kind === "link" ? "WAITING" : "INVITED · PENDING"}</span>
                    </div>
                  ))}
                {players.length < 2 && (
                  <div style={{ ...muted, marginTop: 4 }}>
                    {pending.length ? "They'll show up here when they join. Keep this screen open." : "Waiting for your friend to join… Tap SEND TO A FRIEND to invite someone."}
                  </div>
                )}
                {hostOpts && describe && <div style={{ ...muted, marginTop: 6, color: "#cbd5e1" }}>Playing: {describe(hostOpts)}{host !== user.id ? " (the host's pick)" : ""}</div>}
              </div>
            )}
            {!full && settings && (host === user.id || players.length < 2) && !ready && <div style={{ marginTop: 6 }}>{settings}</div>}
            {!full && (
              <button className="action-btn" onClick={toggleReady} style={{ ...bigButton, marginTop: 14, background: ready ? "#16A34A" : "#FACC15", color: ready ? "#fff" : "#111" }}>
                {ready ? (players.length < 2 ? "✓ READY · WAITING FOR A PLAYER" : "✓ READY · WAITING ON THEM") : result ? "REMATCH: READY" : "I'M READY"}
              </button>
            )}
            <div style={{ ...muted, fontSize: 12, marginTop: 8, textAlign: "center" }}>When you're both ready, it starts on both phones.</div>
            {inviting && (
              <InviteSheetGame
                game={game}
                code={code}
                invited={invited}
                onInvited={(p) => setInvited((list) => (list.some((x) => x.id === p.id) ? list : [...list, p]))}
                onShareLink={share}
                onClose={() => setInviting(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
