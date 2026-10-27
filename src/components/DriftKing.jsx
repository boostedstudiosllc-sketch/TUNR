import { useEffect, useMemo, useRef, useState } from "react";
import { buildTrack, newRace, tickRace, STEP, standings, placeOf, lapClock, mph, outline, loadBests, saveBest, CARS } from "../lib/f1Engine.js";
import { TRACKS } from "../lib/f1Tracks.js";
import { RushAudio } from "../lib/rushAudio.js";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";

const VIEWS = [
  ["top", "Overhead"],
  ["chase", "Chase"],
  ["cockpit", "Cockpit"],
];
const LEVELS = [
  ["easy", "Easy"],
  ["medium", "Medium"],
  ["hard", "Hard"],
];
const LAPS = [1, 2, 3];
const CAR_ICONS = { formula: "🏎️", gt: "🚀", tuner: "🌀", muscle: "💪" };
const PREFS_KEY = "tunr.f1.prefs";
const LOW_POWER = typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      view: VIEWS.some(([v]) => v === p.view) ? p.view : "chase",
      laps: LAPS.includes(p.laps) ? p.laps : 2,
      difficulty: LEVELS.some(([d]) => d === p.difficulty) ? p.difficulty : "medium",
      guide: p.guide !== false,
      car: CARS[p.car] ? p.car : "formula",
    };
  } catch (e) {
    console.warn("Couldn't read Drift King settings:", e.message);
    return { view: "chase", laps: 2, difficulty: "medium", guide: true, car: "formula" };
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch (e) {
    console.warn("Couldn't save Drift King settings:", e.message);
  }
}

const ordinal = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

// A track's outline as an SVG path.
function TrackShape({ def, size = 92, color = "#E8E8E8" }) {
  const { pts } = useMemo(() => outline(def, size, size, 6), [def, size]);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx={pts[0][0]} cy={pts[0][1]} r="3.4" fill="#0080F0" />
    </svg>
  );
}

// Drift King: arcade racing on 22 real circuit layouts (made-up names), in an
// open-wheel car, a GT, a tuner or a muscle car. Gas, brake, steer; steer on
// the gas to drift; grab the Boosted Studios coins for a burst of speed. Race
// three rivals; your fastest lap and best finish per track are kept on this
// phone. Free play.
export default function DriftKing({ onClose }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [bests, setBests] = useState(loadBests);
  const [trackId, setTrackId] = useState(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);
  const def = TRACKS.find((t) => t.id === trackId) || null;

  useEffect(() => {
    audio.current = new RushAudio();
    setSound(audio.current.prefs);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    if (def) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [def, onClose]);

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
      if (on && def) a.startMusic();
    } else a.setSfx(on);
    setSound((s) => ({ ...s, [kind]: on }));
  }

  function start(id) {
    setError("");
    setResult(null);
    setTrackId(id);
    setRound((r) => r + 1);
    const a = audio.current;
    if (a?.unlock() && a.prefs.music) a.startMusic();
  }

  function finished(r) {
    setResult(r);
    setBests((b) => saveBest(b, r.trackId, { lap: r.bestLap, place: r.place }));
  }

  const iconBtn = { ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 };

  return (
    <div role="dialog" aria-label="Drift King" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {!def && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
              🏁 DRIFT <span style={{ color: "#0080F0" }}>KING</span>
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
                Race three rivals on real circuit layouts. Gas and brake on the right, steer on the left. Steer while you're on the gas
                to drift: the tail slides and you turn tighter. Follow the guide line: green is fine, yellow ease off, red brake.
                Drive through a Boosted Studios coin for a burst of speed (two a lap). Change the camera any time from pause.
              </div>
              {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}
              <div style={{ ...label, marginTop: 14 }}>CAR</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {Object.entries(CARS).map(([id, c]) => (
                  <button key={id} onClick={() => setPref({ car: id })} aria-pressed={prefs.car === id} style={{ ...chip, padding: "8px 2px", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, ...(prefs.car === id ? chipOn : {}) }}>
                    <span aria-hidden="true" style={{ fontSize: 20 }}>
                      {CAR_ICONS[id]}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
              <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>
                {CARS[prefs.car].blurb} Your rivals drive the same kind of car.
              </div>
              <div style={{ ...label, marginTop: 12 }}>DIFFICULTY</div>
              <div style={{ display: "flex", gap: 6 }}>
                {LEVELS.map(([id, name]) => (
                  <button key={id} onClick={() => setPref({ difficulty: id })} style={{ ...chip, ...(prefs.difficulty === id ? chipOn : {}) }}>
                    {name}
                  </button>
                ))}
              </div>
              <div style={{ ...label, marginTop: 12 }}>LAPS</div>
              <div style={{ display: "flex", gap: 6 }}>
                {LAPS.map((n) => (
                  <button key={n} onClick={() => setPref({ laps: n })} style={{ ...chip, ...(prefs.laps === n ? chipOn : {}) }}>
                    {n} {n === 1 ? "LAP" : "LAPS"}
                  </button>
                ))}
              </div>
              <div style={{ ...label, marginTop: 14 }}>PICK A TRACK</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {TRACKS.map((t) => {
                  const b = bests[t.id];
                  return (
                    <button
                      key={t.id}
                      className="action-btn"
                      onClick={() => start(t.id)}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 8px", borderRadius: 12, background: "linear-gradient(160deg, #0d1a2b, #121212)", border: "1px solid #1e3150", color: "#F0F0F0", cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      <TrackShape def={t} />
                      <span style={{ fontSize: 16, fontWeight: 900, textAlign: "center" }}>{t.name}</span>
                      <span style={{ fontSize: 11.5, color: "#8FA3BC", fontFamily: "'Barlow', sans-serif", textAlign: "center", lineHeight: 1.3 }}>{t.blurb}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: b ? "#FACC15" : "#5B6B80", marginTop: 3 }}>
                        {b ? `⏱ ${lapClock(b.lap)}${b.place ? ` · best ${ordinal(b.place)}` : ""}` : "Not raced yet"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ ...muted, fontSize: 11, marginTop: 14 }}>
                Track layouts from f1-circuits by Tomislav Bacinger (MIT License). Names are TUNR's own. Not affiliated with Formula 1.
              </div>
              <button className="action-btn" onClick={onClose} style={{ ...quietButton, marginTop: 14, padding: "15px 0", fontSize: 15 }}>
                ← BACK TO THE ARCADE
              </button>
            </div>
          </div>
        </>
      )}

      {def && (
        <RaceScreen
          key={`${def.id}:${round}`}
          def={def}
          laps={prefs.laps}
          difficulty={prefs.difficulty}
          car={prefs.car}
          view={prefs.view}
          onView={(v) => setPref({ view: v })}
          guide={prefs.guide}
          onGuide={(on) => setPref({ guide: on })}
          audio={audio}
          sound={sound}
          onToggle={toggle}
          onFinish={finished}
          onQuit={() => setTrackId(null)}
          onFail={(why) => {
            setTrackId(null);
            setError(why);
          }}
        />
      )}

      {def && result && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, background: "rgba(0,0,0,0.6)", display: "flex", overflowY: "auto", padding: "calc(20px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
          <div style={{ width: "100%", maxWidth: 360, margin: "auto", background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14, letterSpacing: 2, fontWeight: 900, color: result.place === 1 ? "#FACC15" : "#7FBFF5" }}>
              {result.place === 1 ? "🏆 YOU WIN" : "🏁 CHEQUERED FLAG"}
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.05 }}>{ordinal(result.place)}</div>
            <div style={{ ...muted, fontSize: 13 }}>
              {def.name} · {CARS[result.car]?.name} · {LEVELS.find(([d]) => d === result.difficulty)?.[1]} · {result.laps} {result.laps === 1 ? "lap" : "laps"} ·{" "}
              {lapClock(result.total)}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6, color: result.newBest ? "#FACC15" : "#E8E8E8" }}>
              Fastest lap {lapClock(result.bestLap)}
              {result.newBest ? " · NEW BEST" : ""}
            </div>
            <div style={{ marginTop: 10, textAlign: "left" }}>
              {result.order.map((r, k) => (
                <div key={r.name} style={{ display: "flex", gap: 8, padding: "4px 8px", borderRadius: 6, background: r.me ? "rgba(0,128,240,0.18)" : "transparent", fontSize: 15, fontWeight: 800 }}>
                  <span style={{ width: 22, color: "#8FA3BC" }}>{k + 1}</span>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: r.color, alignSelf: "center" }} />
                  <span style={{ flex: 1 }}>{r.name}</span>
                </div>
              ))}
            </div>
            <button className="action-btn" onClick={() => start(def.id)} style={{ ...bigButton, marginTop: 14 }}>
              ↻ RACE AGAIN
            </button>
            <button className="action-btn" onClick={() => (setResult(null), setTrackId(null))} style={{ ...quietButton, marginTop: 8 }}>
              CHOOSE A TRACK
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

// The race: the 3D view, the numbers on top, and the controls.
function RaceScreen({ def, laps, difficulty, car, view, onView, guide, onGuide, audio, sound, onToggle, onFinish, onQuit, onFail }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const mapRef = useRef(null);
  const hud = useRef({});
  const input = useRef({ gas: false, brake: false, left: false, right: false });
  const scene = useRef(null);
  const [paused, setPaused] = useState(false);
  const live = useRef({ paused: false, view, guide });
  live.current.paused = paused;
  const cb = useRef({ onFinish, onFail });
  cb.current = { onFinish, onFail };

  useEffect(() => {
    live.current.view = view;
    scene.current?.setView(view);
  }, [view]);

  useEffect(() => {
    live.current.guide = guide;
    scene.current?.setGuide(guide);
  }, [guide]);

  useEffect(() => {
    let raf = 0;
    let gone = false;
    let ro = null;
    const track = buildTrack(def);
    const race = newRace(track, { laps, difficulty, car, seed: Date.now() % 100000 });
    // For the browser checks: lets a test jump to the end of the race.
    if (import.meta.env.DEV) window.__driftRace = race;
    const mctx = mapRef.current.getContext("2d");
    const MAP = 112;
    const shape = outline(def, MAP, MAP, 8);
    const keys = { ArrowUp: "gas", w: "gas", ArrowDown: "brake", s: "brake", " ": "brake", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" };
    const keyDown = (e) => {
      const k = keys[e.key];
      if (k) {
        e.preventDefault();
        input.current[k] = true;
      } else if (e.key === "Escape") setPaused((p) => !p);
    };
    const keyUp = (e) => {
      const k = keys[e.key];
      if (k) input.current[k] = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    import("../lib/f1Render3d.js")
      .then((mod) => {
        if (gone) return;
        try {
          scene.current = mod.createF1Scene(canvas.current, race, { view: live.current.view, guide: live.current.guide, lowPower: LOW_POWER });
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
        a?.startSqueal();
        let last = 0;
        let acc = 0;
        let told = false;
        let frame = 0;
        let wasBoosting = false;
        const loop = (now) => {
          raf = requestAnimationFrame(loop);
          const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
          last = now;
          if (!live.current.paused) {
            acc += dt;
            while (acc >= STEP) {
              tickRace(race, input.current);
              acc -= STEP;
            }
          }
          for (const e of race.events.splice(0)) {
            if (e.kind === "wall") a?.crash();
            else if (e.kind === "lap") a?.pickup();
            else if (e.kind === "coin") a?.boost();
          }
          const p = race.player;
          const boosting = p.boost > 0;
          if (boosting !== wasBoosting) {
            if (!boosting) a?.boostEnd();
            if (hud.current.boost) hud.current.boost.style.display = boosting ? "flex" : "none";
            wasBoosting = boosting;
          }
          if (a) {
            a.engine(Math.abs(p.speed) * 1.25, boosting);
            a.squeal(p.drifting || p.slip > 0.2 ? Math.min(1, p.slip * 3) : 0);
          }
          scene.current.render(race, live.current.paused ? 0 : dt);

          // The numbers (straight into the page, no re-rendering).
          frame++;
          if (frame % 3 === 0) {
            const h = hud.current;
            if (h.pos) h.pos.textContent = `P${placeOf(race)}/${race.cars.length}`;
            if (h.lap) h.lap.textContent = `LAP ${Math.min(race.laps, Math.max(1, p.lap + 1))}/${race.laps}`;
            if (h.time) h.time.textContent = race.time < 0 ? "0:00.000" : lapClock(race.time - p.lapStart);
            if (h.best) h.best.textContent = p.lapTimes.length ? `BEST ${lapClock(Math.min(...p.lapTimes))}` : "";
            if (h.speed) h.speed.textContent = String(mph(Math.abs(p.speed)));
            if (h.lights) {
              const lit = race.state === "countdown" ? Math.min(5, Math.floor((race.time + 3) / 0.55) + 1) : 0;
              h.lights.style.display = race.state === "countdown" || race.time < 0.8 ? "flex" : "none";
              [...h.lights.children].forEach((el, k) => (el.style.background = k < lit ? "#ff2020" : race.state === "countdown" ? "#2a0000" : "#10B981"));
            }
            if (h.wrong) h.wrong.style.display = p.wrongWay > 1.2 ? "block" : "none";
            if (h.drift) h.drift.style.opacity = p.drifting ? "1" : "0";
            // Mini-map.
            mctx.clearRect(0, 0, MAP, MAP);
            mctx.strokeStyle = "rgba(255,255,255,0.85)";
            mctx.lineWidth = 3;
            mctx.lineJoin = "round";
            mctx.beginPath();
            shape.pts.forEach(([x, y], k) => (k ? mctx.lineTo(x, y) : mctx.moveTo(x, y)));
            mctx.closePath();
            mctx.stroke();
            for (const coin of race.coins) {
              if (coin.takenLap === p.lap) continue;
              const [x, y] = shape.map(coin.x, coin.z);
              mctx.fillStyle = "#38BDF8";
              mctx.fillRect(x - 2.5, y - 2.5, 5, 5);
            }
            for (const c of race.cars) {
              const [x, y] = shape.map(c.x, c.z);
              mctx.fillStyle = c.ai ? c.color : "#0080F0";
              mctx.strokeStyle = "#fff";
              mctx.lineWidth = c.ai ? 1 : 2;
              mctx.beginPath();
              mctx.arc(x, y, c.ai ? 3.2 : 4.5, 0, Math.PI * 2);
              mctx.fill();
              mctx.stroke();
            }
          }
          if (race.state === "finished" && !told && race.time - p.finished > 1.2) {
            told = true;
            a?.squeal(0);
            const order = standings(race).map((c) => ({ name: c.name, color: c.ai ? c.color : "#0080F0", me: !c.ai }));
            const bestLap = Math.min(...p.lapTimes);
            const before = loadBests()[def.id]?.lap;
            cb.current.onFinish({ trackId: def.id, place: placeOf(race), total: p.finished, bestLap, laps: race.laps, difficulty, car: race.car, order, newBest: !before || bestLap < before });
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
      audio.current?.stopSqueal();
      scene.current?.dispose();
      scene.current = null;
    };
  }, [def, laps, difficulty, car]);

  // A held control: on while a finger is on it.
  const hold = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      input.current[key] = true;
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
    onLostPointerCapture: () => (input.current[key] = false),
    onContextMenu: (e) => e.preventDefault(),
  });
  const pad = { position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom))", display: "flex", gap: 10, alignItems: "flex-end", zIndex: 2 };
  const steerBtn = {
    width: 74,
    height: 74,
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.45)",
    background: "rgba(10,14,30,0.5)",
    color: "#fff",
    fontSize: 28,
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "pointer",
  };
  const pedal = (h) => ({
    width: 62,
    height: h,
    borderRadius: 10,
    border: "2px solid rgba(255,255,255,0.4)",
    background: "repeating-linear-gradient(180deg, #2b2b2b 0 10px, #1a1a1a 10px 16px)",
    color: "#ddd",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
    fontFamily: "'Barlow Condensed', sans-serif",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 6,
  });
  const small = { ...quietButton, width: 44, height: 40, padding: 0, fontSize: 15, background: "rgba(10,10,10,0.6)" };

  return (
    <div ref={wrap} style={{ position: "relative", flex: 1, overflow: "hidden", background: "#000" }}>
      <canvas ref={canvas} aria-label={`${def.name}: the race`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* Top: place, lap, times; the map; pause and view. */}
      <div style={{ position: "absolute", top: "calc(8px + env(safe-area-inset-top))", left: 10, right: 10, display: "flex", gap: 8, alignItems: "flex-start", pointerEvents: "none", zIndex: 2 }}>
        <div style={{ background: "rgba(5,8,20,0.65)", borderRadius: 10, padding: "6px 10px", textShadow: "0 1px 3px #000" }}>
          <div ref={(el) => (hud.current.pos = el)} style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>
            P4/4
          </div>
          <div ref={(el) => (hud.current.lap = el)} style={{ fontSize: 14, fontWeight: 800, color: "#7FBFF5", letterSpacing: 1 }}>
            LAP 1/{laps}
          </div>
          <div ref={(el) => (hud.current.time = el)} style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            0:00.000
          </div>
          <div ref={(el) => (hud.current.best = el)} style={{ fontSize: 12, fontWeight: 800, color: "#FACC15" }} />
        </div>
        <div style={{ flex: 1 }} />
        <canvas ref={mapRef} width={112} height={112} aria-hidden="true" style={{ background: "rgba(5,8,20,0.55)", borderRadius: 10 }} />
      </div>
      <div style={{ position: "absolute", top: "calc(132px + env(safe-area-inset-top))", right: 10, display: "flex", flexDirection: "column", gap: 6, zIndex: 3 }}>
        <button onClick={() => setPaused(true)} aria-label="Pause" style={small}>
          ⏸
        </button>
        <button onClick={() => onView(VIEWS[(VIEWS.findIndex(([v]) => v === view) + 1) % VIEWS.length][0])} aria-label="Change the view" style={small}>
          🎥
        </button>
      </div>

      {/* Start lights and messages. */}
      <div ref={(el) => (hud.current.lights = el)} style={{ position: "absolute", top: "32%", left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none", zIndex: 2 }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} style={{ width: 30, height: 30, borderRadius: "50%", background: "#2a0000", border: "3px solid #111", boxShadow: "0 2px 8px rgba(0,0,0,0.6)" }} />
        ))}
      </div>
      <div ref={(el) => (hud.current.wrong = el)} style={{ display: "none", position: "absolute", top: "42%", left: 0, right: 0, textAlign: "center", fontSize: 30, fontWeight: 900, color: "#F87171", textShadow: "0 2px 6px #000", pointerEvents: "none", zIndex: 2 }}>
        ⚠ WRONG WAY
      </div>
      <div ref={(el) => (hud.current.boost = el)} style={{ display: "none", position: "absolute", top: "17%", left: 0, right: 0, justifyContent: "center", alignItems: "center", gap: 8, pointerEvents: "none", zIndex: 2 }}>
        <img src="/game/boosted-logo.webp" alt="" style={{ height: 30, filter: "drop-shadow(0 2px 6px #000)" }} />
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: 3, color: "#38BDF8", textShadow: "0 2px 6px #000" }}>BOOST</span>
      </div>
      <div ref={(el) => (hud.current.drift = el)} style={{ opacity: 0, transition: "opacity 0.15s", position: "absolute", top: "24%", left: 0, right: 0, textAlign: "center", fontSize: 22, fontWeight: 900, letterSpacing: 3, color: "#3CABFD", textShadow: "0 2px 6px #000", pointerEvents: "none", zIndex: 2 }}>
        DRIFT
      </div>

      {/* Speed. */}
      <div style={{ position: "absolute", bottom: "calc(104px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", pointerEvents: "none", zIndex: 2, textShadow: "0 2px 6px #000" }}>
        <span ref={(el) => (hud.current.speed = el)} style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
          0
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, marginLeft: 4, color: "#ccc" }}>MPH</span>
      </div>

      {/* Controls: steer on the left, pedals on the right. */}
      <div style={{ ...pad, left: "calc(14px + env(safe-area-inset-left))" }}>
        <button aria-label="Steer left" style={steerBtn} {...hold("left")}>
          ◀
        </button>
        <button aria-label="Steer right" style={steerBtn} {...hold("right")}>
          ▶
        </button>
      </div>
      <div style={{ ...pad, right: "calc(14px + env(safe-area-inset-right))" }}>
        <button aria-label="Brake" style={pedal(70)} {...hold("brake")}>
          BRAKE
        </button>
        <button aria-label="Gas" style={pedal(104)} {...hold("gas")}>
          GAS
        </button>
      </div>

      {paused && (
        <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 320, background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>PAUSED</div>
            <div style={{ ...muted, fontSize: 13 }}>{def.name}</div>
            <div style={{ ...label, marginTop: 12 }}>CAMERA</div>
            <div style={{ display: "flex", gap: 6 }}>
              {VIEWS.map(([id, name]) => (
                <button key={id} onClick={() => onView(id)} style={{ ...chip, ...(view === id ? chipOn : {}) }}>
                  {name}
                </button>
              ))}
            </div>
            <div style={{ ...label, marginTop: 12 }}>GUIDE LINE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onGuide(true)} style={{ ...chip, ...(guide ? chipOn : {}) }}>
                On
              </button>
              <button onClick={() => onGuide(false)} style={{ ...chip, ...(!guide ? chipOn : {}) }}>
                Off
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
              QUIT RACE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const chip = {
  flex: 1,
  padding: "9px 4px",
  borderRadius: 18,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.6,
  cursor: "pointer",
  background: "#161616",
  color: "#999",
  border: "1px solid #2A2A2A",
  fontFamily: "'Barlow Condensed', sans-serif",
};
const chipOn = { background: "rgba(0,128,240,0.16)", color: "#3CABFD", border: "1px solid #0080F0" };
