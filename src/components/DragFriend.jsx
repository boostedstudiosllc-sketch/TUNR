import { useEffect, useRef, useState } from "react";
import { joinRoom, quickMatch, newRoomCode, cleanCode, hostOf, JOIN_KEY } from "../lib/dragNet.js";
import { loadProfile } from "../lib/store.js";
import { DragRun, ResultCard } from "./DragRace.jsx";
import { muted, bigButton, quietButton, field } from "./Sheet.jsx";

// Drag Race against a friend, live: make a room and share its code (or the
// link), join one with a code, or Quick match with whoever's waiting. Both
// tap READY, the host's phone starts the tree, and you race side by side.
// No points: it's for bragging rights.

export default function DragFriend({ user, look, audio, onExit, onNeedAccount }) {
  const [name, setName] = useState(null);
  const [stage, setStage] = useState("menu"); // menu | searching | room | race
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [peers, setPeers] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [race, setRace] = useState(null); // { seed, round, opponent }
  const [result, setResult] = useState(null);
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
      shared = sessionStorage.getItem(JOIN_KEY);
      sessionStorage.removeItem(JOIN_KEY);
    } catch (e) {
      console.warn("Couldn't read the shared race code:", e.message);
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

  // Keep your car up to date for the other player.
  useEffect(() => {
    room.current?.setLook(look)?.catch?.((e) => console.warn(e.message));
  }, [JSON.stringify(look)]);

  async function enter(roomCode) {
    if (!user) return onNeedAccount?.();
    if (!roomCode || roomCode.length < 4) return setError("Room codes are 4 letters or numbers.");
    setError("");
    await room.current?.leave();
    try {
      room.current = await joinRoom(roomCode, me, {
        onPeers: (list) => {
          peersNow.current = list;
          setPeers(list);
        },
        onStart: (p) => begin(p),
        onPos: (p) => hooks.current.pos?.(p),
        onDone: (p) => hooks.current.done?.(p),
        onBye: (p) => hooks.current.bye?.(p),
      });
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
    setStage("searching");
    try {
      cancelSearch.current = await quickMatch(me, (roomCode) => {
        cancelSearch.current = null;
        enter(roomCode);
      });
    } catch (e) {
      setError(e.message);
      setStage("menu");
    }
  }

  const others = peers.filter((p) => p.id !== user?.id);
  const opponent = others[0] || null;
  // First two in are racing; anyone else is told the room's full.
  const racers = [...peers].sort((a, b) => a.joinedAt - b.joinedAt).slice(0, 2);
  const full = peers.length > 2 && !racers.some((p) => p.id === user?.id);

  function begin(p) {
    if (p.round <= round.current) return;
    round.current = p.round;
    const opp = peersNow.current.find((x) => x.id !== user.id);
    setResult(null);
    setRace({ seed: p.seed, round: p.round, opponent: { name: opp?.name || "your friend", look: opp?.look || null } });
    setStage("race");
    audio.current?.unlock();
  }

  // Both ready: the host starts the race for both phones.
  useEffect(() => {
    if (stage !== "room" || racers.length < 2 || !racers.every((p) => p.ready)) return;
    if (hostOf(racers) !== user.id) return;
    const start = { seed: Math.floor(Math.random() * 1e6) + 1, round: round.current + 1 };
    room.current
      ?.start(start)
      .then(() => begin(start))
      .catch((e) => setError(`Couldn't start the race. (${e.message})`));
  }, [stage, JSON.stringify(racers.map((p) => [p.id, p.ready]))]);

  async function toggleReady() {
    const next = !ready;
    setReady(next);
    try {
      await room.current?.setReady(next);
    } catch (e) {
      setReady(!next);
      setError(`Couldn't tell your friend you're ready. (${e.message})`);
    }
  }

  async function share() {
    const url = `${location.origin}/?drag=${code}`;
    const text = `Race me in TUNR Drag Race. Room ${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "TUNR Drag Race", text, url });
      else {
        await navigator.clipboard.writeText(`${text}: ${url}`);
        setError("");
        setCopied(true);
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(`Couldn't share the room. (${e.message})`);
    }
  }
  const [copied, setCopied] = useState(false);

  async function leave() {
    cancelSearch.current?.();
    cancelSearch.current = null;
    await room.current?.leave();
    room.current = null;
    setPeers([]);
    setStage("menu");
  }

  if (stage === "race" && race) {
    return (
      <DragRun
        key={race.round}
        look={look}
        audio={audio}
        remote={{ ...race, room: room.current, hooks }}
        onDone={(r) => {
          setResult(r);
          setStage("room");
          setReady(false);
          room.current?.setReady(false)?.catch?.((e) => console.warn(e.message));
          audio.current?.stopEngine();
        }}
        onQuit={() => {
          audio.current?.stopEngine();
          leave();
        }}
      />
    );
  }

  const card = { marginTop: 12, padding: 14, borderRadius: 14, background: "#13161c", border: "1px solid #232833" };
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <button onClick={stage === "menu" ? onExit : leave} style={{ ...quietButton, padding: "8px 12px", fontSize: 13 }}>
          ← {stage === "menu" ? "BACK" : "LEAVE"}
        </button>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>👥 RACE A FRIEND</div>
        {error && (
          <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 6 }}>
            {error}
          </div>
        )}

        {stage === "menu" && (
          <>
            <div style={{ ...muted, marginTop: 4 }}>Live, side by side, from your own phones. Same tree, same quarter mile; each phone times its own run, so lag never decides it. No points, just bragging rights.</div>
            {!user && <div style={{ ...muted, marginTop: 8, color: "#FACC15" }}>Sign in to race other people.</div>}
            <button className="action-btn" onClick={() => enter(newRoomCode())} style={{ ...bigButton, marginTop: 14, background: "#FACC15", color: "#111" }}>
              + MAKE A ROOM
            </button>
            <div style={card}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3" }}>GOT A CODE?</div>
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
            <div style={{ fontSize: 18, fontWeight: 900 }}>Looking for a driver…</div>
            <div style={{ ...muted }}>Anyone who taps Quick match gets paired with you. Keep this screen open.</div>
          </div>
        )}

        {stage === "room" && (
          <>
            {result && <div style={{ marginTop: 12 }}><ResultCard result={result} rival={{ name: `@${opponent?.name || "your friend"}` }} />{result.rivalOut && <div style={{ ...muted, marginTop: 4 }}>{result.rivalOut === "red" ? "They red-lit." : result.rivalOut === "asleep" ? "They never left the line." : "They left the race."}</div>}</div>}
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3" }}>ROOM CODE</div>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 10, lineHeight: 1.1 }}>{code.length > 4 ? "QUICK" : code}</div>
              {code.length === 4 && (
                <button onClick={share} style={{ ...quietButton, marginTop: 6, padding: "9px 16px", fontSize: 14 }}>
                  {copied ? "✓ LINK COPIED" : "📤 SEND TO A FRIEND"}
                </button>
              )}
            </div>
            {full ? (
              <div style={{ ...card, color: "#F87171" }}>This room already has two racers. Make your own room, or try another code.</div>
            ) : (
              <div style={card}>
                {racers.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: p.look?.color || "#888", flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 17, fontWeight: 900 }}>
                      @{p.name}
                      {p.id === user.id ? " (you)" : ""}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: p.ready ? "#4ADE80" : "#8A94A3" }}>{p.ready ? "✓ READY" : "NOT READY"}</span>
                  </div>
                ))}
                {racers.length < 2 && <div style={{ ...muted, marginTop: 4 }}>Waiting for your friend to join…</div>}
              </div>
            )}
            {!full && (
              <button className="action-btn" onClick={toggleReady} style={{ ...bigButton, marginTop: 14, background: ready ? "#16A34A" : "#FACC15", color: ready ? "#fff" : "#111" }}>
                {ready ? (racers.length < 2 ? "✓ READY · WAITING FOR A RACER" : "✓ READY · WAITING ON THEM") : result ? "REMATCH: READY" : "I'M READY"}
              </button>
            )}
            <div style={{ ...muted, fontSize: 12, marginTop: 8, textAlign: "center" }}>When you're both ready, the tree starts on both phones.</div>
          </>
        )}
      </div>
    </div>
  );
}
