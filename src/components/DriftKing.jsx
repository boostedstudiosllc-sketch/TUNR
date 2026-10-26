import { useEffect, useRef, useState } from "react";
import {
  newDrift,
  tick,
  STEP,
  meters,
  slipOf,
  loadBest,
  saveBest,
} from "../lib/driftEngine.js";
import {
  renderSky,
  drawDrift,
  addSmoke,
  updateSmoke,
} from "../lib/driftDraw.js";
import { RushAudio } from "../lib/rushAudio.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";

// Drift King: hold the left side to swing left, the right side to swing
// right (let go and it keeps going the way it's pointed), and keep
// the car on the floating road for as long as you can. Free play; your best
// is kept on this phone.
export default function DriftKing({ onClose }) {
  const [phase, setPhase] = useState("ready"); // ready | driving | over
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const [round, setRound] = useState(0);
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);

  useEffect(() => {
    audio.current = new RushAudio();
    setSound(audio.current.prefs);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(kind) {
    const a = audio.current;
    if (!a) return;
    const on = !sound[kind];
    if (kind === "music") {
      a.setMusic(on);
      if (on && phase === "driving") a.startMusic();
    } else a.setSfx(on);
    setSound((s) => ({ ...s, [kind]: on }));
  }

  function again() {
    setPhase("ready");
    setScore(0);
    setNewBest(false);
    setRound((r) => r + 1);
  }

  return (
    <div
      role="dialog"
      aria-label="Drift King"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 410,
        background: "#070B1E",
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "calc(8px + env(safe-area-inset-top)) 12px 8px",
          maxWidth: 520,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{ flex: 1, fontSize: 24, fontWeight: 900, letterSpacing: 1 }}
        >
          🌀 DRIFT <span style={{ color: "#0080F0" }}>KING</span>
        </div>
        <button
          onClick={() => toggle("music")}
          aria-label={sound.music ? "Turn music off" : "Turn music on"}
          aria-pressed={sound.music}
          style={{
            ...quietButton,
            width: 44,
            height: 44,
            padding: 0,
            fontSize: 17,
            opacity: sound.music ? 1 : 0.4,
          }}
        >
          🎵
        </button>
        <button
          onClick={() => toggle("sfx")}
          aria-label={
            sound.sfx ? "Turn sound effects off" : "Turn sound effects on"
          }
          style={{
            ...quietButton,
            width: 44,
            height: 44,
            padding: 0,
            fontSize: 17,
          }}
        >
          {sound.sfx ? "🔊" : "🔇"}
        </button>
        <button
          onClick={onClose}
          aria-label="Close the game"
          style={{
            ...quietButton,
            width: 44,
            height: 44,
            padding: 0,
            fontSize: 18,
          }}
        >
          ✕
        </button>
      </div>

      <DriftBoard
        key={round}
        audio={audio}
        onStart={() => {
          setPhase("driving");
          if (audio.current?.prefs.music) audio.current.startMusic();
        }}
        onScore={setScore}
        onOver={(m) => {
          setScore(m);
          setNewBest(m > best && m > 0);
          setBest(saveBest(m));
          setPhase("over");
        }}
      />

      {/* Score, up top over the road. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "calc(64px + env(safe-area-inset-top))",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 900,
            lineHeight: 1,
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score} m
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1.2,
            color: "#7FBFF5",
          }}
        >
          BEST {best} m
        </div>
      </div>

      {phase === "ready" && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: "calc(130px + env(safe-area-inset-bottom))",
            margin: "0 auto",
            maxWidth: 360,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(7,11,30,0.82)",
              border: "1px solid #1E2A4A",
              borderRadius: 14,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>
              HOLD <span style={{ color: "#3CABFD" }}>◀ LEFT</span> OR{" "}
              <span style={{ color: "#3CABFD" }}>RIGHT ▶</span> TO DRIFT
            </div>
            <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
              Hold either side of the screen to swing that way. Let go and you
              keep going the way you're pointed. It speeds up the further you
              go. Hold a side to start.
            </div>
          </div>
        </div>
      )}

      {phase === "over" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 340,
              background: "#0D1226",
              border: "1px solid #1E2A4A",
              borderRadius: 16,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 15,
                letterSpacing: 2,
                fontWeight: 900,
                color: newBest ? "#FACC15" : "#F87171",
              }}
            >
              {newBest ? "👑 NEW BEST" : "OFF THE EDGE"}
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1.1 }}>
              {score} m
            </div>
            <div style={{ ...muted, fontSize: 13 }}>Best: {best} m</div>
            <button
              className="action-btn"
              onClick={again}
              style={{ ...bigButton, marginTop: 16 }}
            >
              ↻ DRIFT AGAIN
            </button>
            <button
              className="action-btn"
              onClick={onClose}
              style={{ ...quietButton, marginTop: 8 }}
            >
              ← BACK TO THE ARCADE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The road and the car on a canvas, with the game loop. The left half of
// the screen steers left, the right half right; the last side pressed wins.
function DriftBoard({ audio, onStart, onScore, onOver }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const cb = useRef({ onStart, onScore, onOver });
  cb.current = { onStart, onScore, onOver };

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    const ctx = el.getContext("2d");
    const g = newDrift(Date.now());
    const cam = { x: 0, y: g.y };
    const smoke = [];
    const held = []; // sides held, oldest first: [{ id, side }]
    const hold = (id, side) => {
      release(id);
      held.push({ id, side });
    };
    const release = (id) => {
      const i = held.findIndex((h) => h.id === id);
      if (i >= 0) held.splice(i, 1);
    };
    let size = { w: 0, h: 0, dpr: 1 };
    let sky = null;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let shown = -1;
    let ended = false;

    function resize() {
      const rect = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: rect.width, h: rect.height, dpr };
      el.width = Math.round(rect.width * dpr);
      el.height = Math.round(rect.height * dpr);
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      sky = renderSky(rect.width, rect.height, dpr);
    }
    const press = () => {
      if (g.state === "ready") {
        audio.current?.unlock();
        audio.current?.startEngine();
        audio.current?.startSqueal();
        cb.current.onStart();
      }
    };
    const down = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const x = e.clientX - el.getBoundingClientRect().left;
      hold(`p${e.pointerId}`, x < size.w / 2 ? "left" : "right");
      press();
    };
    const up = (e) => release(`p${e.pointerId}`);
    const KEY_SIDE = {
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
    };
    const keyDown = (e) => {
      const side = KEY_SIDE[e.key];
      if (!side) return;
      e.preventDefault();
      if (!e.repeat) hold(`k${e.key}`, side);
      press();
    };
    const keyUp = (e) => release(`k${e.key}`);

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const steer = held.length ? held[held.length - 1].side : null;
      acc += dt;
      while (acc >= STEP) {
        tick(g, steer);
        acc -= STEP;
      }
      const slip = g.state === "driving" ? slipOf(g) : 0;
      if (g.state === "driving") addSmoke(smoke, g, slip);
      updateSmoke(smoke, dt);
      const a = audio.current;
      if (a && g.state === "driving") {
        a.engine(g.speed * 0.32, false);
        a.squeal(Math.min(1, Math.max(0, (slip - 0.12) * 3)));
      }
      if (g.state === "falling" && !ended) {
        ended = true;
        a?.squeal(0);
        a?.stopEngine();
        a?.crash();
      }
      // Camera: keep up with the car, drifting gently toward it sideways.
      cam.y +=
        (g.y - cam.y) * Math.min(1, dt * (g.state === "driving" ? 10 : 2));
      cam.x += (g.x * 0.3 - cam.x) * Math.min(1, dt * 2.5);

      const m = meters(g);
      if (m !== shown) {
        shown = m;
        cb.current.onScore(m);
      }
      if (g.state === "over" && ended !== "told") {
        ended = "told";
        a?.stopSqueal();
        cb.current.onOver(m);
      }

      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sky) drawDrift(ctx, { w, h }, sky, g, cam, smoke);
      drawButtons(ctx, w, h, steer);
    }

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(box);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      audio.current?.stopEngine();
      audio.current?.stopSqueal();
    };
  }, []);

  return (
    <div ref={wrap} style={{ flex: 1, position: "relative", minHeight: 0 }}>
      <canvas
        ref={canvas}
        aria-label="Drift King road. Hold the left side to drift left, the right side to drift right."
        style={{
          display: "block",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />
    </div>
  );
}

// The two hold buttons in the bottom corners (the whole half of the screen
// works; these show where), lit while held.
function drawButtons(ctx, w, h, steer) {
  const r = Math.min(44, w * 0.12);
  const y = h - r - 22;
  for (const side of ["left", "right"]) {
    const x = side === "left" ? r + 20 : w - r - 20;
    const on = steer === side;
    ctx.fillStyle = on ? "rgba(0,128,240,0.55)" : "rgba(10,14,30,0.45)";
    ctx.strokeStyle = on ? "#3CABFD" : "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = on ? "#FFFFFF" : "rgba(255,255,255,0.8)";
    const d = side === "left" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x + d * r * 0.38, y);
    ctx.lineTo(x - d * r * 0.22, y - r * 0.34);
    ctx.lineTo(x - d * r * 0.22, y + r * 0.34);
    ctx.closePath();
    ctx.fill();
  }
}
