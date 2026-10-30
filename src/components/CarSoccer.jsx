import { useEffect, useRef, useState } from "react";
import { newMatch, tickMatch, STEP, clockText, loadRecord, saveRecord, MATCH_LENGTHS, TEAM_COLORS, snapshot, applySnapshot } from "../lib/soccerEngine.js";
import FriendRoom from "./FriendRoom.jsx";
import { sharedGame } from "../lib/gameRooms.js";
import { RushAudio } from "../lib/rushAudio.js";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";
import { chip, chipOn } from "./DriftKing.jsx";
import { GarageRow, useGarageCar, carName } from "./Showroom.jsx";
import { lookOf } from "../lib/rushEngine.js";

const LEVELS = [
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
];
const SIZES = [
  [1, "1 v 1"],
  [2, "2 v 2"],
];
const PREFS_KEY = "tunr.ball.prefs";
const LOW_POWER = typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      size: p.size === 2 ? 2 : 1,
      length: MATCH_LENGTHS.includes(p.length) ? p.length : 180,
      difficulty: LEVELS.some(([d]) => d === p.difficulty) ? p.difficulty : "medium",
      ballCam: p.ballCam !== false,
      gas: p.gas === "pedal" ? "pedal" : "auto",
    };
  } catch (e) {
    console.warn("Couldn't read Turbo Ball settings:", e.message);
    return { size: 1, length: 180, difficulty: "medium", ballCam: true, gas: "auto" };
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (e) {
    console.warn("Couldn't save Turbo Ball settings:", e.message);
  }
}

// Turbo Ball: car soccer against the computer, 1 v 1 or 2 v 2 (with a
// computer teammate). Your car drives itself forward: steer, boost, jump
// (tap again in the air to flip into the ball), brake to back up. Boost pads
// round the floor refill the meter. Free play; your wins, losses and goals
// are kept on this phone.
export default function CarSoccer({ onClose, user = null, onNeedAccount }) {
  // Play in your own car from your garage, or the Turbo Ball battle car.
  const garage = useGarageCar(user, "ball");
  const [prefs, setPrefs] = useState(loadPrefs);
  const [record, setRecord] = useState(loadRecord);
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);
  // Playing a friend (opens straight there from a shared room link).
  const [friend, setFriend] = useState(() => {
    try {
      return sharedGame() === "ball";
    } catch (e) {
      console.warn("Couldn't read the shared room:", e.message);
      return false;
    }
  });

  useEffect(() => {
    audio.current = new RushAudio();
    setSound(audio.current.prefs);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    if (playing || friend) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, friend, onClose]);

  const setPref = (patch) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });

  function toggle(kind) {
    const a = audio.current;
    if (!a) return;
    const on = !sound[kind];
    if (kind === "music") {
      a.setMusic(on);
      if (on && playing) a.startMusic();
    } else a.setSfx(on);
    setSound((s) => ({ ...s, [kind]: on }));
  }

  function start() {
    setError("");
    setResult(null);
    setPlaying(true);
    setRound((r) => r + 1);
    const a = audio.current;
    if (a?.unlock() && a.prefs.music) a.startMusic();
  }

  function finished(r) {
    setResult(r);
    setRecord((rec) => saveRecord(rec, { won: r.score[0] > r.score[1], goals: r.myGoals }));
  }

  const iconBtn = { ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 };

  if (friend) {
    const myLook = garage.car ? lookOf(garage.car) : null;
    return (
      <div role="dialog" aria-label="Turbo Ball: play a friend" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif", paddingTop: "calc(8px + env(safe-area-inset-top))" }}>
        <FriendRoom
          game="ball"
          title="PLAY A FRIEND"
          intro="Live 1 v 1 car soccer from your own phones. The host's phone runs the match (blue); the other player is orange. Best on a good connection."
          user={user}
          look={myLook}
          audio={audio}
          options={{ length: prefs.length }}
          describe={(o) => `${Math.round(o.length / 60)} minute match`}
          settings={
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {MATCH_LENGTHS.map((sec) => (
                <button key={sec} onClick={() => setPref({ length: sec })} style={{ ...chip, ...(prefs.length === sec ? chipOn : {}) }}>
                  {sec / 60} MIN
                </button>
              ))}
            </div>
          }
          onExit={() => setFriend(false)}
          onNeedAccount={onNeedAccount}
          renderPlay={({ start, room, hooks, opponent, isHost, onDone, onQuit }) => (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
              <Match
                key={start.round}
                size={1}
                length={start.opts?.length || prefs.length}
                difficulty="medium"
                ballCam={prefs.ballCam}
                myLook={myLook}
                pedal={prefs.gas === "pedal"}
                onBallCam={(on) => setPref({ ballCam: on })}
                audio={audio}
                sound={sound}
                onToggle={toggle}
                remote={{ round: start.round, seed: start.seed, isHost, opponent, room, hooks, onDone }}
                onFinish={() => {}}
                onQuit={onQuit}
                onFail={(why) => {
                  setError(why);
                  onQuit();
                }}
              />
            </div>
          )}
          renderResult={(r, opp) => (
            <div style={{ padding: 14, borderRadius: 14, background: r.won ? "linear-gradient(135deg, rgba(34,197,94,0.18), #15181e)" : "#15181e", border: `1px solid ${r.won ? "#16A34A" : "#2A2E36"}`, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: r.won ? "#4ADE80" : r.draw ? "#FACC15" : "#F87171" }}>{r.won ? "🏆 WIN" : r.draw ? "DRAW" : "LOSS"}</div>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.05 }}>
                <span style={{ color: TEAM_COLORS[0] }}>{r.score[0]}</span> – <span style={{ color: TEAM_COLORS[1] }}>{r.score[1]}</span>
              </div>
              <div style={{ ...muted }}>
                You were {r.myTeam === 0 ? "blue" : "orange"} vs @{opp?.name || "your friend"}
                {r.forfeit ? " · they left the match" : ""}
              </div>
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Turbo Ball" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {!playing && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
              ⚽ TURBO <span style={{ color: "#0080F0" }}>BALL</span>
            </div>
            <button onClick={() => toggle("music")} aria-label={sound.music ? "Turn music off" : "Turn music on"} style={{ ...iconBtn, opacity: sound.music ? 1 : 0.4 }}>
              🎵
            </button>
            <button onClick={() => toggle("sfx")} aria-label={sound.sfx ? "Turn sound effects off" : "Turn sound effects on"} style={iconBtn}>
              {sound.sfx ? "🔊" : "🔇"}
            </button>
            <button onClick={onClose} aria-label="Close the game" style={{ ...iconBtn, fontSize: 18 }}>
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
              <div style={{ ...muted, fontSize: 13.5 }}>
                Car soccer. Knock the ball into the orange goal. Your car drives itself: steer on the left; boost, jump and brake on
                the right. Tap <strong>JUMP</strong> again in the air to flip into the ball for a harder hit. Drive over the glowing
                pads to refill your boost.
              </div>
              {error && (
                <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
                  {error}
                </div>
              )}
              <GarageRow user={user} garage={garage} game="Turbo Ball" first={{ icon: "⚽", name: "Battle car", sub: "Turbo Ball's own" }} />
              {garage.car && (
                <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>
                  You'll play in your {carName(garage.car)}. It handles like everyone else's, and glows blue underneath so you know whose side it's on.
                </div>
              )}
              <div style={{ ...label, marginTop: 14 }}>TEAMS</div>
              <div style={{ display: "flex", gap: 6 }}>
                {SIZES.map(([n, name]) => (
                  <button key={n} onClick={() => setPref({ size: n })} style={{ ...chip, ...(prefs.size === n ? chipOn : {}) }}>
                    {name}
                  </button>
                ))}
              </div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>{prefs.size === 2 ? "You and a computer teammate, ACE, against two." : "Just you against one."}</div>
              <div style={{ ...label, marginTop: 12 }}>DIFFICULTY</div>
              <div style={{ display: "flex", gap: 6 }}>
                {LEVELS.map(([id, name]) => (
                  <button key={id} onClick={() => setPref({ difficulty: id })} style={{ ...chip, ...(prefs.difficulty === id ? chipOn : {}) }}>
                    {name}
                  </button>
                ))}
              </div>
              <div style={{ ...label, marginTop: 12 }}>MATCH LENGTH</div>
              <div style={{ display: "flex", gap: 6 }}>
                {MATCH_LENGTHS.map((s) => (
                  <button key={s} onClick={() => setPref({ length: s })} style={{ ...chip, ...(prefs.length === s ? chipOn : {}) }}>
                    {s / 60} MIN
                  </button>
                ))}
              </div>
              <div style={{ ...label, marginTop: 12 }}>GAS</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  ["auto", "Automatic"],
                  ["pedal", "Gas pedal"],
                ].map(([id, name]) => (
                  <button key={id} onClick={() => setPref({ gas: id })} style={{ ...chip, ...(prefs.gas === id ? chipOn : {}) }}>
                    {name}
                  </button>
                ))}
              </div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>
                {prefs.gas === "pedal" ? "Hold GAS to drive. BOOST still works on its own." : "Your car drives itself; brake to stop or back up."}
              </div>
              <button className="action-btn" onClick={start} style={{ ...bigButton, marginTop: 18, padding: "16px 0", fontSize: 18 }}>
                ⚽ PLAY
              </button>
              <button className="action-btn" onClick={() => setFriend(true)} style={{ ...bigButton, marginTop: 10, background: "linear-gradient(135deg, #DB2777, #7C3AED)", color: "#fff", fontSize: 17, letterSpacing: 2 }}>
                👥 PLAY A FRIEND · LIVE
              </button>
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 14, fontWeight: 800, color: "#FACC15" }}>
                {record.wins + record.losses > 0
                  ? `Your record: ${record.wins} ${record.wins === 1 ? "win" : "wins"} · ${record.losses} ${record.losses === 1 ? "loss" : "losses"} · ${record.goals} ${record.goals === 1 ? "goal" : "goals"}`
                  : "No matches yet"}
              </div>
              <button className="action-btn" onClick={onClose} style={{ ...quietButton, marginTop: 14, padding: "15px 0", fontSize: 15 }}>
                ← BACK TO THE ARCADE
              </button>
            </div>
          </div>
        </>
      )}

      {playing && (
        <Match
          key={round}
          size={prefs.size}
          length={prefs.length}
          difficulty={prefs.difficulty}
          ballCam={prefs.ballCam}
          myLook={garage.car ? lookOf(garage.car) : null}
          pedal={prefs.gas === "pedal"}
          onBallCam={(on) => setPref({ ballCam: on })}
          audio={audio}
          sound={sound}
          onToggle={toggle}
          onFinish={finished}
          onQuit={() => setPlaying(false)}
          onFail={(why) => {
            setPlaying(false);
            setError(why);
          }}
        />
      )}

      {playing && result && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(0,0,0,0.6)", display: "flex", overflowY: "auto", padding: "calc(20px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
          <div style={{ width: "100%", maxWidth: 360, margin: "auto", background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14, letterSpacing: 2, fontWeight: 900, color: result.score[0] > result.score[1] ? "#FACC15" : "#7FBFF5" }}>{result.score[0] > result.score[1] ? "🏆 YOU WIN" : "FULL TIME"}</div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.05 }}>
              <span style={{ color: TEAM_COLORS[0] }}>{result.score[0]}</span> – <span style={{ color: TEAM_COLORS[1] }}>{result.score[1]}</span>
            </div>
            <div style={{ ...muted, fontSize: 13 }}>
              {result.size} v {result.size} · {LEVELS.find(([d]) => d === result.difficulty)?.[1]}
              {result.overtime ? " · won in overtime" : ""}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>
              You scored {result.myGoals} {result.myGoals === 1 ? "goal" : "goals"}
            </div>
            <button className="action-btn" onClick={start} style={{ ...bigButton, marginTop: 14 }}>
              ↻ PLAY AGAIN
            </button>
            <button className="action-btn" onClick={() => (setResult(null), setPlaying(false))} style={{ ...quietButton, marginTop: 8 }}>
              CHANGE SETTINGS
            </button>
            <button className="action-btn" onClick={onClose} style={{ ...quietButton, marginTop: 8 }}>
              ← BACK TO THE ARCADE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The match: the 3D view, the scoreboard, and the controls.
// remote (playing a friend): { round, seed, isHost, opponent, room, hooks,
// onDone }. The host runs the match and sends snapshots; the guest sends
// its controls, predicts, and follows the snapshots.
function Match({ size, length, difficulty, ballCam, myLook = null, pedal = false, onBallCam, audio, sound, onToggle, onFinish, onQuit, onFail, remote = null }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const hud = useRef({});
  const input = useRef({ left: false, right: false, brake: false, boost: false, jump: false, gas: false });
  const pedalRef = useRef(pedal);
  pedalRef.current = pedal;
  const scene = useRef(null);
  const [paused, setPaused] = useState(false);
  const live = useRef({ paused: false });
  live.current.paused = paused;
  const cb = useRef({ onFinish, onFail });
  cb.current = { onFinish, onFail };

  useEffect(() => {
    scene.current?.setBallCam(ballCam);
  }, [ballCam]);

  useEffect(() => {
    let raf = 0;
    let gone = false;
    let ro = null;
    const match = newMatch({ size, length, difficulty, seed: remote ? remote.seed : Date.now() % 100000, online: remote ? (remote.isHost ? "host" : "guest") : null });
    const them = remote ? match.cars.find((c) => c.remote) : null;
    let pendingSnap = null;
    let theyLeft = false;
    if (them) {
      them.look = remote.opponent.look;
      them.name = remote.opponent.name;
      const mine = (p) => p?.round === remote.round;
      remote.hooks.current = remote.isHost
        ? {
            input: (p) => {
              if (!mine(p)) return;
              const tap = them.input?.jumpTap || p.ctl?.jumpTap;
              them.input = { ...p.ctl, jumpTap: tap };
            },
            bye: () => (theyLeft = true),
          }
        : {
            snap: (p) => mine(p) && (pendingSnap = p),
            bye: () => (theyLeft = true),
          };
    }
    let lastSent = 0;
    let lastCtl = "";
    const send0 = (e, p) => Promise.resolve(remote?.room?.send(e, { round: remote.round, ...p })).catch((err) => console.warn("Couldn't reach the other phone:", err.message));
    // For the browser checks: lets a test reach into the match.
    if (import.meta.env.DEV) window.__ballMatch = match;
    const keys = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowDown: "brake", s: "brake", Shift: "boost", ArrowUp: "boost", w: "boost", " ": "jump", g: "gas" };
    const keyDown = (e) => {
      const k = keys[e.key];
      if (k) {
        e.preventDefault();
        if (k === "jump" && !e.repeat) input.current.jumpTap = true;
        input.current[k] = true;
      } else if (e.key === "Escape") setPaused((p) => !p);
    };
    const keyUp = (e) => {
      const k = keys[e.key];
      if (k) input.current[k] = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    import("../lib/soccerRender3d.js")
      .then((mod) => {
        if (gone) return;
        try {
          scene.current = mod.createSoccerScene(canvas.current, match, { lowPower: LOW_POWER, ballCam, myLook });
        } catch (e) {
          cb.current.onFail(`Couldn't start the 3D view on this phone. (${e.message})`);
          return;
        }
        const resize = () => {
          const r = wrap.current.getBoundingClientRect();
          scene.current?.resize(r.width, r.height);
        };
        resize();
        ro = new ResizeObserver(resize);
        ro.observe(wrap.current);
        const a = audio.current;
        a?.unlock();
        a?.startEngine();
        let last = 0;
        let acc = 0;
        let told = false;
        let frame = 0;
        let myGoals = 0;
        let banner = 0;
        const loop = (now) => {
          raf = requestAnimationFrame(loop);
          const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
          last = now;
          const i = input.current;
          const ctl = { steer: (i.left ? 1 : 0) - (i.right ? 1 : 0), throttle: i.brake ? -1 : pedalRef.current ? (i.gas ? 1 : 0) : 1, boost: i.boost, jump: i.jump };
          // Playing a friend the clock never stops.
          const jumpTapped = i.jumpTap;
          if (!live.current.paused || remote) {
            acc += dt;
            while (acc >= STEP) {
              // A tap quicker than a frame still counts.
              ctl.jumpTap = i.jumpTap;
              tickMatch(match, ctl);
              i.jumpTap = false;
              acc -= STEP;
            }
          }
          if (remote) {
            const send = (e, p) => Promise.resolve(remote.room?.send(e, { round: remote.round, ...p })).catch((err) => console.warn("Couldn't reach the other phone:", err.message));
            if (remote.isHost) {
              // The match, ten times a second.
              if (now - lastSent > 100) {
                lastSent = now;
                send("snap", snapshot(match));
              }
            } else {
              if (pendingSnap) {
                match.events.push(...applySnapshot(match, pendingSnap));
                pendingSnap = null;
              }
              // Your controls: when they change (a jump at once), and twice a
              // second regardless.
              const key = JSON.stringify([ctl.steer, ctl.throttle, ctl.boost, ctl.jump]);
              if (jumpTapped || key !== lastCtl || now - lastSent > 500) {
                lastCtl = key;
                lastSent = now;
                send("input", { ctl: { steer: ctl.steer, throttle: ctl.throttle, boost: ctl.boost, jump: ctl.jump, jumpTap: jumpTapped } });
              }
            }
          }
          const h = hud.current;
          for (const e of match.events.splice(0)) {
            if (e.kind === "touch") (e.power > 18 ? a?.crash() : a?.pop());
            else if (e.kind === "pad" && e.car === match.player) a?.pickup();
            else if (e.kind === "go") a?.beep();
            else if (e.kind === "goal") {
              a?.boost();
              if (e.by === match.player) myGoals++;
              if (h.banner) {
                h.banner.textContent = e.team === match.player.team ? (e.by === match.player ? "⚽ GOAL! YOU SCORED" : "⚽ GOAL!") : "THEY SCORED";
                h.banner.style.color = TEAM_COLORS[e.team];
              }
              banner = 2.6;
            } else if (e.kind === "overtime") {
              if (h.banner) {
                h.banner.textContent = "OVERTIME · NEXT GOAL WINS";
                h.banner.style.color = "#FACC15";
              }
              banner = 3;
            }
          }
          banner = Math.max(0, banner - dt);
          const p = match.player;
          if (a) a.engine(Math.abs(p.speed) * 1.6, p.boosting);
          scene.current.render(match, live.current.paused ? 0 : dt);

          frame++;
          if (frame % 3 === 0) {
            if (h.blue) h.blue.textContent = String(match.score[0]);
            if (h.orange) h.orange.textContent = String(match.score[1]);
            if (h.clock) h.clock.textContent = match.overtime ? `+${clockText(match.clock)}` : clockText(match.clock);
            if (h.count) {
              const n = Math.ceil(match.stateT);
              h.count.style.display = match.state === "kickoff" ? "block" : "none";
              h.count.textContent = String(n);
            }
            if (h.banner) h.banner.style.display = banner > 0 ? "block" : "none";
            if (h.boostAmt) h.boostAmt.textContent = String(Math.round(p.boost));
            if (h.boostBtn) h.boostBtn.style.background = `conic-gradient(#FFB020 ${p.boost * 3.6}deg, rgba(10,14,30,0.55) 0)`;
          }
          if (remote && !told && (match.state === "over" || theyLeft)) {
            told = true;
            if (remote.isHost) send0("snap", snapshot(match));
            const mineT = match.player.team;
            const s = match.score;
            remote.onDone({ score: [...s], myTeam: mineT, won: theyLeft || s[mineT] > s[1 - mineT], draw: !theyLeft && s[0] === s[1], forfeit: theyLeft });
          } else if (!remote && match.state === "over" && !told) {
            told = true;
            cb.current.onFinish({ score: [...match.score], myGoals, size, difficulty, overtime: match.overtime });
          }
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e) => cb.current.onFail(`Couldn't load the 3D view. (${e.message}) If the app was just updated, close it fully and open it again.`));

    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      audio.current?.stopEngine();
      scene.current?.dispose();
      scene.current = null;
    };
  }, [size, length, difficulty]);

  // A held control: on while a finger is on it.
  const hold = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      input.current[key] = true;
      if (key === "jump") input.current.jumpTap = true;
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
    onLostPointerCapture: () => (input.current[key] = false),
    onContextMenu: (e) => e.preventDefault(),
  });
  const round = (s, extra) => ({
    width: s,
    height: s,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.45)",
    background: "rgba(10,14,30,0.5)",
    color: "#fff",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 900,
    letterSpacing: 1,
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "pointer",
    ...extra,
  });
  const small = { ...quietButton, width: 44, height: 40, padding: 0, fontSize: 15, background: "rgba(10,10,10,0.6)" };

  return (
    <div ref={wrap} style={{ position: "relative", flex: 1, overflow: "hidden", background: "#000" }}>
      <canvas ref={canvas} aria-label="Turbo Ball: the match" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* The scoreboard. */}
      <div style={{ position: "absolute", top: "calc(8px + env(safe-area-inset-top))", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.5)", fontWeight: 900 }}>
          <span ref={(el) => (hud.current.blue = el)} style={{ background: TEAM_COLORS[0], fontSize: 30, padding: "2px 16px", minWidth: 24, textAlign: "center" }}>
            0
          </span>
          <span ref={(el) => (hud.current.clock = el)} style={{ background: "rgba(5,8,20,0.85)", fontSize: 22, padding: "6px 12px", fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "center" }}>
            {clockText(length)}
          </span>
          <span ref={(el) => (hud.current.orange = el)} style={{ background: TEAM_COLORS[1], fontSize: 30, padding: "2px 16px", minWidth: 24, textAlign: "center" }}>
            0
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", top: "calc(8px + env(safe-area-inset-top))", right: 10, display: "flex", flexDirection: "column", gap: 6, zIndex: 3 }}>
        <button onClick={() => setPaused(true)} aria-label="Pause" style={small}>
          ⏸
        </button>
        <button onClick={() => onBallCam(!ballCam)} aria-label={ballCam ? "Ball cam on: tap for car cam" : "Car cam: tap for ball cam"} style={{ ...small, fontSize: 11, fontWeight: 900, color: ballCam ? "#3CABFD" : "#999" }}>
          {ballCam ? "BALL" : "CAR"}
          <br />
          CAM
        </button>
      </div>

      <div ref={(el) => (hud.current.count = el)} style={{ position: "absolute", top: "30%", left: 0, right: 0, textAlign: "center", fontSize: 80, fontWeight: 900, color: "#fff", textShadow: "0 4px 14px #000", pointerEvents: "none", zIndex: 2 }}>
        3
      </div>
      <div ref={(el) => (hud.current.banner = el)} style={{ display: "none", position: "absolute", top: "22%", left: 0, right: 0, textAlign: "center", fontSize: 34, fontWeight: 900, letterSpacing: 2, textShadow: "0 3px 10px #000", pointerEvents: "none", zIndex: 2 }} />

      {/* Controls: steer on the left; jump, boost and brake on the right. */}
      <div style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", left: "calc(14px + env(safe-area-inset-left))", display: "flex", gap: 10, zIndex: 2 }}>
        <button aria-label="Steer left" style={round(74, { fontSize: 28 })} {...hold("left")}>
          ◀
        </button>
        <button aria-label="Steer right" style={round(74, { fontSize: 28 })} {...hold("right")}>
          ▶
        </button>
      </div>
      <div style={{ position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", right: "calc(14px + env(safe-area-inset-right))", display: "flex", gap: 10, alignItems: "flex-end", zIndex: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <button aria-label="Jump (tap again in the air to flip)" style={round(66, { fontSize: 14, background: "rgba(0,128,240,0.35)", border: "2px solid #3CABFD" })} {...hold("jump")}>
            JUMP
          </button>
          <button aria-label="Brake and reverse" style={round(50, { fontSize: 10, borderRadius: 10, background: "repeating-linear-gradient(180deg, #2b2b2b 0 8px, #1a1a1a 8px 13px)" })} {...hold("brake")}>
            BRAKE
          </button>
        </div>
        {pedal && (
          <button
            aria-label="Gas (hold to drive)"
            style={round(60, { width: 60, height: 104, borderRadius: 12, fontSize: 12, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, background: "repeating-linear-gradient(180deg, #2b2b2b 0 10px, #1a1a1a 10px 16px)" })}
            {...hold("gas")}
          >
            GAS
          </button>
        )}
        <button ref={(el) => (hud.current.boostBtn = el)} aria-label="Boost (hold)" style={round(92, { fontSize: 15, padding: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px solid #FFB020" })} {...hold("boost")}>
          <span style={{ background: "rgba(10,14,30,0.85)", borderRadius: "50%", width: 72, height: 72, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span ref={(el) => (hud.current.boostAmt = el)} style={{ fontSize: 24, lineHeight: 1 }}>
              33
            </span>
            <span style={{ fontSize: 11, color: "#FFB020" }}>BOOST</span>
          </span>
        </button>
      </div>

      {paused && (
        <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 320, background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>PAUSED</div>
            <div style={{ ...label, marginTop: 12 }}>CAMERA</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onBallCam(true)} style={{ ...chip, ...(ballCam ? chipOn : {}) }}>
                Ball cam
              </button>
              <button onClick={() => onBallCam(false)} style={{ ...chip, ...(!ballCam ? chipOn : {}) }}>
                Car cam
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button onClick={() => onToggle("music")} style={{ ...chip, opacity: sound.music ? 1 : 0.45 }}>
                🎵 MUSIC
              </button>
              <button onClick={() => onToggle("sfx")} style={{ ...chip, opacity: sound.sfx ? 1 : 0.45 }}>
                {sound.sfx ? "🔊" : "🔇"} SOUND
              </button>
            </div>
            <button className="action-btn" onClick={() => setPaused(false)} style={{ ...bigButton, marginTop: 14 }}>
              ▶ RESUME
            </button>
            <button className="action-btn" onClick={onQuit} style={{ ...quietButton, marginTop: 8 }}>
              LEAVE MATCH
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
