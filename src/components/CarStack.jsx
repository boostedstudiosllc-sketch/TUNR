import { useEffect, useRef, useState } from "react";
import { newStack, tick, drop, floors, hookX, LIVES, WHY, loadStackBest, saveStackBest } from "../lib/stackEngine.js";
import { RushAudio } from "../lib/rushAudio.js";
import { lookOf } from "../lib/rushEngine.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import { GarageRow, useGarageCar } from "./Showroom.jsx";

// Car Stack: tap to drop cars from the crane and build the tallest tower
// you can. Free play; your best is kept on this phone.

export default function CarStack({ onClose, user = null }) {
  const garage = useGarageCar(user, "stack");
  const look = garage.car ? lookOf(garage.car) : null;
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const [best, setBest] = useState(loadStackBest);
  const [result, setResult] = useState(null);
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);

  useEffect(() => {
    audio.current = new RushAudio();
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
    <div role="dialog" aria-label="Car Stack" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {!playing ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
              🏗️ CAR <span style={{ color: "#0080F0" }}>STACK</span>
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
                The crane swings a car over your tower. <strong>Tap</strong> to drop it. Land it dead centre for a <strong style={{ color: "#FACC15" }}>PERFECT</strong> (it
                snaps straight, and perfects in a row score more). Off-centre drops make the tower lean and sway. Miss the tower three times, or lean it too far, and it's
                over. It swings faster the higher you go. Every tenth car is yours.
              </div>
              {result && (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#15181e", border: "1px solid #2A2E36", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: result.newBest ? "#FACC15" : "#8A94A3" }}>{result.newBest ? "🏆 NEW BEST!" : "TOWER DOWN"}</div>
                  <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1 }}>
                    {result.floors} <span style={{ fontSize: 20 }}>{result.floors === 1 ? "car" : "cars"} high</span>
                  </div>
                  <div style={{ ...muted, marginTop: 4 }}>
                    {result.score} points · best run {result.bestRun} perfect{result.bestRun === 1 ? "" : "s"} · {WHY[result.why]}
                  </div>
                </div>
              )}
              <GarageRow user={user} garage={garage} game="Car Stack" first={{ icon: "🏗️", name: "Mystery cars", sub: "Add yours for every 10th floor" }} hint="Add your car in Profile → Garage and every tenth car in your tower is yours." />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 15, fontWeight: 800 }}>
                <span style={{ color: "#8A94A3" }}>YOUR BEST</span>
                <span style={{ color: "#FACC15" }}>{best.floors ? `${best.floors} cars · ${best.score} pts` : "—"}</span>
              </div>
              <button className="action-btn" onClick={start} style={{ ...bigButton, marginTop: 12, background: "#FACC15", color: "#111", fontSize: 20, letterSpacing: 2 }}>
                {result ? "▶ AGAIN" : "▶ BUILD"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <StackRun
          key={round}
          look={look}
          best={best}
          audio={audio}
          onDone={(g) => {
            const prev = best.floors;
            setBest(saveStackBest(g));
            setResult({ floors: floors(g), score: g.score, bestRun: g.bestRun, why: g.why, newBest: floors(g) > prev && floors(g) > 0 });
            setPlaying(false);
          }}
          onQuit={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

function StackRun({ look, best, audio, onDone, onQuit }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const game = useRef(null);
  const hud = useRef({});
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(null);
  const live = useRef({ paused: false });
  live.current.paused = paused;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const g = newStack((Date.now() % 100000) + 3);
    game.current = g;
    // For the browser checks.
    if (import.meta.env.DEV) {
      window.__stack = g;
      window.__stackHook = () => hookX(g);
    }
    let view;
    let raf = 0;
    let last = 0;
    let reported = false;
    let gone = false;
    const a = audio.current;
    import("../lib/stackRender3d.js")
      .then((m) => {
        if (gone) return;
        view = m.createStack3D(canvas.current, { myLook: look });
        raf = requestAnimationFrame(frame);
      })
      .catch((e) => setError(`Couldn't start the 3D view. (${e.message})`));
    const say = (text, color) => setFlash({ text, color, at: Date.now() });
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const el = wrap.current;
      if (!el || !view) return;
      const key = `${el.clientWidth}x${el.clientHeight}`;
      if (el.dataset.size !== key) {
        el.dataset.size = key;
        view.resize(el.clientWidth, el.clientHeight);
      }
      if (!live.current.paused) tick(g, dt);
      let landed = false;
      for (const e of g.events.splice(0)) {
        if (e.kind === "perfect") {
          landed = true;
          a?.pickup();
          say(e.run > 1 ? `PERFECT ×${e.run} +${e.bonus}` : "PERFECT", "#FACC15");
        } else if (e.kind === "land") {
          landed = true;
          a?.pop();
        } else if (e.kind === "miss") {
          a?.crash();
          say(e.lives > 0 ? `MISSED · ${e.lives} ${e.lives === 1 ? "CAR" : "CARS"} LEFT` : "OUT OF CARS", "#F87171");
        } else if (e.kind === "over" && e.why === "toppled") {
          a?.crash();
          say("TIMBER!", "#F87171");
        }
      }
      view.render(g, live.current.paused ? 0 : dt, landed);
      const H = hud.current;
      if (H.floors) H.floors.textContent = String(floors(g));
      if (H.score) H.score.textContent = `${g.score} PTS`;
      if (H.lives) H.lives.textContent = "🚗".repeat(Math.max(0, g.lives)) + "▫️".repeat(Math.max(0, LIVES - g.lives));
      if (g.state === "over" && !reported) {
        reported = true;
        setTimeout(() => done.current(g), 1800);
      }
    };
    const onKey = (e) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!live.current.paused) drop(g);
      }
      if (e.key === "Escape" || e.key === "p") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      view?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 1000);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <div
      ref={wrap}
      onPointerDown={(e) => {
        if (e.target.closest("button")) return;
        e.preventDefault();
        if (!paused && game.current) drop(game.current);
      }}
      style={{ position: "relative", flex: 1, overflow: "hidden", background: "#7cc4f5", touchAction: "none", userSelect: "none" }}
    >
      <canvas ref={canvas} aria-label="Car Stack: the tower" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {error && (
        <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#FCA5A5", background: "#0A0A0A", zIndex: 5 }}>
          {error}
        </div>
      )}
      <div style={{ position: "absolute", top: "calc(10px + env(safe-area-inset-top))", left: 12, right: 12, display: "flex", alignItems: "flex-start", gap: 10, zIndex: 2, pointerEvents: "none" }}>
        <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 12, padding: "6px 12px" }}>
          <div ref={(el) => (hud.current.floors = el)} style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            0
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#FACC15", letterSpacing: 1 }}>BEST {best.floors}</div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 12, padding: "6px 10px" }}>
          <div ref={(el) => (hud.current.lives = el)} aria-label="Cars left" style={{ fontSize: 20 }}>
            🚗🚗🚗
          </div>
          <div ref={(el) => (hud.current.score = el)} style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>
            0 PTS
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setPaused(true)} aria-label="Pause" style={{ ...quietButton, pointerEvents: "auto", width: 44, height: 44, padding: 0, fontSize: 16, background: "rgba(0,0,0,0.45)" }}>
          ❚❚
        </button>
      </div>
      {flash && (
        <div key={flash.at} aria-live="polite" style={{ position: "absolute", top: "30%", left: 0, right: 0, textAlign: "center", fontSize: 36, fontWeight: 900, letterSpacing: 2, color: flash.color, textShadow: "0 3px 14px rgba(0,0,0,0.7)", zIndex: 3, pointerEvents: "none", animation: "stackPop 1s ease forwards" }}>
          {flash.text}
        </div>
      )}
      <style>{"@keyframes stackPop { 0% { transform: scale(0.6); opacity: 0 } 15% { transform: scale(1.1); opacity: 1 } 70% { opacity: 1 } 100% { transform: translateY(-20px); opacity: 0 } }"}</style>
      <div style={{ position: "absolute", bottom: "calc(22px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", fontSize: 14, fontWeight: 900, letterSpacing: 2, color: "rgba(255,255,255,0.85)", textShadow: "0 2px 8px rgba(0,0,0,0.6)", pointerEvents: "none" }}>
        TAP ANYWHERE TO DROP
      </div>
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
