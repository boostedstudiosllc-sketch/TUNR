import { useEffect, useRef, useState } from "react";
import { newRun, tickRun, distance, WHY, EGG, loadEggBest, saveEggBest } from "../lib/eggEngine.js";
import { drawEgg } from "../lib/eggDraw.js";
import { RushAudio } from "../lib/rushAudio.js";
import TrackButton from "./TrackButton.jsx";
import { lookOf } from "../lib/rushEngine.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import { GarageRow, useGarageCar } from "./Showroom.jsx";

// Egg Haul: drive as far as you can over the hills with an egg on your roof.
// Gas and brake only; in the air, gas tips the nose up and brake tips it
// down. Hard landings crack the egg (three cracks and it's done), and if it
// rolls off, it's done. Same course every time, so you learn it. Free play;
// your best distance is kept on this phone.
const COURSE = 7;

export default function EggHaul({ onClose, user = null }) {
  const garage = useGarageCar(user, "egg");
  const look = garage.car ? lookOf(garage.car) : null;
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const [best, setBest] = useState(loadEggBest);
  const [result, setResult] = useState(null);
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);

  useEffect(() => {
    audio.current = new RushAudio({ game: "egg" });
    setSound(audio.current.prefs);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    if (playing) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, onClose]);

  function start() {
    setResult(null);
    setPlaying(true);
    setRound((r) => r + 1);
    const a = audio.current;
    if (a?.unlock() && a.prefs.music) a.startMusic();
  }

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

  const iconBtn = { ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 };

  return (
    <div role="dialog" aria-label="Egg Haul" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {!playing ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
              🥚 EGG <span style={{ color: "#0080F0" }}>HAUL</span>
            </div>
            <button onClick={() => toggle("music")} aria-label={sound.music ? "Turn music off" : "Turn music on"} style={{ ...iconBtn, opacity: sound.music ? 1 : 0.4 }}>
              🎵
            </button>
            <TrackButton audio={audio} style={iconBtn} />
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
                There's an egg on your roof. Drive as far as you can without losing it. <strong>GAS</strong> and <strong>BRAKE</strong> (hold brake to
                back up). In the air, gas tips your nose up and brake tips it down: land on your wheels. Hard landings crack the egg; three
                cracks, or the egg rolling off, and the run's over. Same course every time, rougher the further you go.
              </div>
              {result && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#15181e", border: "1px solid #2A2E36", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: result.newBest ? "#FACC15" : "#8A94A3" }}>{result.newBest ? "🏆 NEW BEST!" : "RUN OVER"}</div>
                  <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{result.m} m</div>
                  <div style={{ ...muted, marginTop: 4 }}>{WHY[result.why] || result.why}</div>
                </div>
              )}
              <GarageRow user={user} garage={garage} game="Egg Haul" first={{ icon: "🥚", name: "Egg Haul truck", sub: "The blue one" }} hint="Add your car in Profile → Garage to haul eggs in it." />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 15, fontWeight: 800 }}>
                <span style={{ color: "#8A94A3" }}>YOUR BEST</span>
                <span style={{ color: "#FACC15" }}>{best ? `${best} m` : "—"}</span>
              </div>
              <button className="action-btn" onClick={start} style={{ ...bigButton, marginTop: 12, background: "#FACC15", color: "#111", fontSize: 20, letterSpacing: 2 }}>
                {result ? "▶ AGAIN" : "▶ DRIVE"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <EggRun
          key={round}
          look={look}
          best={best}
          audio={audio}
          onDone={(r) => {
            const m = distance(r);
            const prev = best;
            setBest(saveEggBest(m));
            setResult({ m, why: r.why, newBest: m > prev && m > 0 });
            setPlaying(false);
            audio.current?.stopEngine();
          }}
          onQuit={() => {
            setPlaying(false);
            audio.current?.stopEngine();
          }}
        />
      )}
    </div>
  );
}

function EggRun({ look, best, audio, onDone, onQuit }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const input = useRef({ gas: false, brake: false });
  const hud = useRef({});
  const live = useRef({ paused: false });
  const [paused, setPaused] = useState(false);
  live.current.paused = paused;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const run = newRun(COURSE);
    if (import.meta.env.DEV) window.__eggRun = run;
    const view = { x: 0, y: 1, ppm: 40, best };
    const a = audio.current;
    a?.startEngine();
    let raf = 0;
    let last = 0;
    let reported = false;
    const ctx = canvas.current.getContext("2d");
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const el = wrap.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.current.width !== Math.round(w * dpr)) {
        canvas.current.width = Math.round(w * dpr);
        canvas.current.height = Math.round(h * dpr);
      }
      if (!live.current.paused) {
        tickRun(run, input.current, dt);
        for (const ev of run.events.splice(0)) {
          if (ev.type === "crack") a?.beep();
          if (ev.type === "broke") a?.crash();
        }
      }
      // Camera: ahead of the car, in a little, the hills visible.
      const c = run.car;
      view.ppm = w / (w > h ? 20 : 9.5);
      view.x += (c.x + Math.max(-2, Math.min(5, c.vx * 0.35)) - view.x) * Math.min(1, dt * 4);
      view.y += (c.y + 0.6 - view.y) * Math.min(1, dt * 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawEgg(ctx, run, view, w, h, look);
      a?.engine(Math.hypot(c.vx, c.vy) * 4.5, false);
      if (hud.current.dist) hud.current.dist.textContent = `${distance(run)} m`;
      if (hud.current.eggs) hud.current.eggs.textContent = "🥚".repeat(Math.max(0, EGG.cracks - run.egg.cracks)) + "💥".repeat(Math.min(EGG.cracks, run.egg.cracks));
      if (run.state === "over" && !reported && run.time - run.overAt > 1.4) {
        reported = true;
        done.current(run);
      }
    };
    raf = requestAnimationFrame(frame);

    const keys = { ArrowRight: "gas", ArrowUp: "gas", d: "gas", w: "gas", ArrowLeft: "brake", ArrowDown: "brake", a: "brake", s: "brake" };
    const down = (e) => {
      if (keys[e.key]) {
        input.current[keys[e.key]] = true;
        e.preventDefault();
      }
      if (e.key === "Escape" || e.key === "p") setPaused((p) => !p);
    };
    const up = (e) => keys[e.key] && (input.current[keys[e.key]] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

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
  const pedal = (side, color) => ({
    position: "absolute",
    bottom: "calc(18px + env(safe-area-inset-bottom))",
    [side]: `calc(16px + env(safe-area-inset-${side}))`,
    width: 96,
    height: 96,
    borderRadius: 20,
    border: "2px solid rgba(255,255,255,0.45)",
    background: color,
    color: "#fff",
    fontSize: 17,
    fontWeight: 900,
    letterSpacing: 1.5,
    fontFamily: "'Barlow Condensed', sans-serif",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    zIndex: 2,
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
  });

  return (
    <div ref={wrap} style={{ position: "relative", flex: 1, overflow: "hidden", background: "#1e1b4b", touchAction: "none" }}>
      <canvas ref={canvas} aria-label="Egg Haul: the course" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "absolute", top: "calc(10px + env(safe-area-inset-top))", left: 12, right: 12, display: "flex", alignItems: "flex-start", gap: 10, zIndex: 2, pointerEvents: "none" }}>
        <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 12, padding: "6px 12px" }}>
          <div ref={(el) => (hud.current.dist = el)} style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            0 m
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#FACC15", letterSpacing: 1 }}>BEST {best} m</div>
        </div>
        <div ref={(el) => (hud.current.eggs = el)} aria-label="Egg health" style={{ fontSize: 22, background: "rgba(0,0,0,0.45)", borderRadius: 12, padding: "6px 10px" }}>
          🥚🥚🥚
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setPaused(true)} aria-label="Pause" style={{ ...quietButton, pointerEvents: "auto", width: 44, height: 44, padding: 0, fontSize: 16, background: "rgba(0,0,0,0.45)" }}>
          ❚❚
        </button>
      </div>
      <button aria-label="Brake" style={pedal("left", "rgba(220,38,38,0.85)")} {...hold("brake")}>
        BRAKE
      </button>
      <button aria-label="Gas" style={pedal("right", "rgba(22,163,74,0.9)")} {...hold("gas")}>
        GAS
      </button>
      {paused && (
        <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 300, background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>PAUSED</div>
            <button className="action-btn" onClick={() => setPaused(false)} style={{ ...bigButton, background: "#FACC15", color: "#111" }}>
              ▶ RESUME
            </button>
            <button className="action-btn" onClick={onQuit} style={{ ...quietButton, padding: "11px 0" }}>
              QUIT TO MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
