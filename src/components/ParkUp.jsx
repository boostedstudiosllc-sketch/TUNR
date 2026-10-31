import { useEffect, useRef, useState } from "react";
import {
  LEVELS,
  STEP,
  WORLD,
  newPark,
  tick,
  starsFor,
  HIT_COPY,
  steerFromWheel,
  WHEEL_TURNS,
  loadProgress,
  saveStars,
  unlocked,
} from "../lib/parkEngine.js";
import {
  renderLot,
  drawPark,
  controlLayout,
  drawControls,
} from "../lib/parkDraw.js";
import { RushAudio } from "../lib/rushAudio.js";
import MusicButtons from "./MusicButtons.jsx";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import { GarageRow, useGarageCar, carName } from "./Showroom.jsx";

// Top-down shapes for your car's body (the lot drawing knows these).
const TOP_KIND = { coupe: "coupe", hatch: "coupe", sedan: "sedan", suv: "suv", truck: "truck" };

const CONTROLS_H = 176; // the strip under the lot for the wheel and pedals
const WHEEL_RETURN = 520; // degrees a second the wheel springs back when let go
const KEY_TURN = 420; // degrees a second with the arrow keys

const Stars = ({ n, size = 18 }) => (
  <span
    aria-label={`${n} of 3 stars`}
    style={{ fontSize: size, letterSpacing: 2 }}
  >
    {[1, 2, 3].map((i) => (
      <span key={i} style={{ color: i <= n ? "#FACC15" : "#3A3A3A" }}>
        ★
      </span>
    ))}
  </span>
);

const clock = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`;

// Park Up: a top-down parking game. Wheel on the left, brake (and reverse)
// and gas on the right, like the real thing. Stop inside the yellow spot
// without touching anything; faster parks earn more stars. Free play, no
// points; stars are kept on this phone.
export default function ParkUp({ onClose, allAccess = false, user = null }) {
  // Park your own car (its paint and shape; every car fits the same spot).
  const garage = useGarageCar(user, "park");
  const carLook = garage.car ? { color: garage.car.game_color || "#1D4ED8", kind: TOP_KIND[garage.car.game_body] || "coupe" } : null;
  const [screen, setScreen] = useState("levels"); // levels | play
  const [progress, setProgress] = useState(loadProgress);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null); // { state, stars, time, hit, best }
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ time: 0 });
  const [driving, setDriving] = useState(false); // pressed gas or brake yet
  const [round, setRound] = useState(0); // bump to restart
  const [sfxOn, setSfxOn] = useState(true);
  const audio = useRef(null);
  const level = LEVELS[index];

  useEffect(() => {
    audio.current = new RushAudio({ game: "park" });
    setSfxOn(audio.current.prefs.sfx);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    const onKey = (e) =>
      e.key === "Escape" &&
      (screen === "play" ? setPaused((p) => !p) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, onClose]);

  function play(i) {
    setDriving(false);
    setHud({ time: 0 });
    setIndex(i);
    setResult(null);
    setPaused(false);
    setRound((r) => r + 1);
    setScreen("play");
    if (audio.current?.unlock() && audio.current.prefs.music) audio.current.startMusic();
  }

  function finished(g) {
    if (g.state === "parked") {
      const stars = starsFor(g.level, g.time);
      const best = progress[g.level.id] || 0;
      setProgress((p) => saveStars(p, g.level.id, stars));
      setResult({ state: "parked", stars, time: g.time, best });
      audio.current?.pickup();
    } else {
      setResult({ state: "crashed", hit: g.hit, time: g.time });
      audio.current?.crash();
    }
  }

  const total = LEVELS.reduce((n, l) => n + (progress[l.id] || 0), 0);

  return (
    <div
      role="dialog"
      aria-label="Park Up"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 410,
        background: "#0A0A0A",
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
          gap: 8,
          padding: "calc(8px + env(safe-area-inset-top)) 12px 8px",
          maxWidth: 520,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {screen === "play" ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: "#8A8A8A",
                  letterSpacing: 1.2,
                  fontWeight: 800,
                }}
              >
                LEVEL {index + 1}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {level.name}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
              🅿️ PARK <span style={{ color: "#0080F0" }}>UP</span>
            </div>
          )}
        </div>
        {screen === "play" && (
          <div style={{ textAlign: "right", marginRight: 4 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {clock(hud.time)}
            </div>
            <Stars n={starsFor(level, hud.time)} size={14} />
          </div>
        )}
        <MusicButtons audio={audio} style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 }} />
        <button
          onClick={() => {
            const on = !sfxOn;
            audio.current?.setSfx(on);
            setSfxOn(on);
          }}
          aria-label={sfxOn ? "Turn sound off" : "Turn sound on"}
          style={{
            ...quietButton,
            width: 44,
            height: 44,
            padding: 0,
            fontSize: 17,
          }}
        >
          {sfxOn ? "🔊" : "🔇"}
        </button>
        {screen === "play" ? (
          <button
            onClick={() => setPaused(true)}
            aria-label="Pause"
            style={{
              ...quietButton,
              width: 44,
              height: 44,
              padding: 0,
              fontSize: 16,
            }}
          >
            ⏸
          </button>
        ) : (
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
        )}
      </div>

      {/* The level's tip, kept off the lot so it never covers the spot. */}
      {screen === "play" && (
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            margin: "0 auto",
            padding: "0 12px 8px",
            boxSizing: "border-box",
            fontFamily: "'Barlow', sans-serif",
            fontSize: 12.5,
            lineHeight: 1.35,
            color: "#B8B8B8",
          }}
        >
          <span style={{ color: "#FACC15", fontWeight: 800 }}>
            Park in the yellow spot.
          </span>{" "}
          {level.tip}
          {!driving && (
            <span style={{ color: "#7FBFF5" }}>
              {" "}
              Press gas or brake to start.
            </span>
          )}
        </div>
      )}

      {screen === "levels" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 520,
              margin: "0 auto",
              padding: "4px 16px calc(28px + env(safe-area-inset-bottom))",
              boxSizing: "border-box",
            }}
          >
            <div style={{ ...muted, fontSize: 13.5 }}>
              Park in the yellow spot without touching anything. Turn the wheel
              with your thumb. Gas goes forward; the brake stops you, and keep
              holding it to reverse. Park quicker for more stars.
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#FACC15",
                marginTop: 8,
              }}
            >
              ★ {total} / {LEVELS.length * 3}
            </div>
            <GarageRow user={user} garage={garage} game="Park Up" first={{ icon: "🅿️", name: "Park Up car", sub: "The blue coupe" }} />
            {garage.car && (
              <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>
                You're parking your {carName(garage.car)}. Same size spot for every car, so the stars are fair.
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
                marginTop: 12,
              }}
            >
              {LEVELS.map((l, i) => {
                const open = allAccess || unlocked(progress, i);
                return (
                  <button
                    key={l.id}
                    className="action-btn"
                    disabled={!open}
                    onClick={() => play(i)}
                    style={{
                      textAlign: "left",
                      padding: "12px 12px 10px",
                      borderRadius: 12,
                      background: open
                        ? "linear-gradient(135deg, #001830, #141414)"
                        : "#111",
                      border: `1px solid ${open ? "#003A75" : "#222"}`,
                      color: open ? "#F0F0F0" : "#555",
                      cursor: open ? "pointer" : "default",
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        color: open ? "#7FBFF5" : "#444",
                      }}
                    >
                      LEVEL {i + 1}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {open ? l.name : "🔒 Locked"}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {open ? (
                        <Stars n={progress[l.id] || 0} size={15} />
                      ) : (
                        <span style={{ fontSize: 12 }}>
                          Park level {i} first
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              className="action-btn"
              onClick={onClose}
              style={{
                ...quietButton,
                marginTop: 18,
                padding: "15px 0",
                fontSize: 15,
              }}
            >
              ← BACK TO THE ARCADE
            </button>
          </div>
        </div>
      )}

      {screen === "play" && (
        <ParkBoard
          key={`${level.id}:${round}`}
          level={level}
          carLook={carLook}
          paused={paused || Boolean(result)}
          audio={audio}
          onTime={(time) => setHud({ time })}
          onStart={() => setDriving(true)}
          onDone={finished}
        />
      )}

      {screen === "play" && (paused || result) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: "#121212",
              border: "1px solid #2A2A2A",
              borderRadius: 16,
              padding: 20,
              textAlign: "center",
            }}
          >
            {result?.state === "parked" && (
              <>
                <div
                  style={{
                    fontSize: 15,
                    letterSpacing: 2,
                    fontWeight: 900,
                    color: "#3CABFD",
                  }}
                >
                  ✔ MISSION COMPLETE
                </div>
                <div style={{ marginTop: 8 }}>
                  <Stars n={result.stars} size={40} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                  {clock(result.time)}
                </div>
                <div style={{ ...muted, fontSize: 13 }}>
                  {result.stars < 3
                    ? `Park within ${level.par}s for 3 stars.`
                    : result.best === 3
                      ? "Perfect again."
                      : "Perfect park."}
                </div>
                {index < LEVELS.length - 1 ? (
                  <button
                    className="action-btn"
                    onClick={() => play(index + 1)}
                    style={{ ...bigButton, marginTop: 14 }}
                  >
                    NEXT LEVEL →
                  </button>
                ) : (
                  <div style={{ ...muted, marginTop: 12, color: "#FACC15" }}>
                    That's every level. More lots coming soon.
                  </div>
                )}
                <button
                  className="action-btn"
                  onClick={() => play(index)}
                  style={{ ...quietButton, marginTop: 8 }}
                >
                  ↻ TRY FOR MORE STARS
                </button>
              </>
            )}
            {result?.state === "crashed" && (
              <>
                <div
                  style={{
                    fontSize: 15,
                    letterSpacing: 2,
                    fontWeight: 900,
                    color: "#F87171",
                  }}
                >
                  💥 CRASH
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
                  {HIT_COPY[result.hit] || "You hit something."}
                </div>
                <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
                  {level.tip}
                </div>
                <button
                  className="action-btn"
                  onClick={() => play(index)}
                  style={{ ...bigButton, marginTop: 14 }}
                >
                  ↻ TRY AGAIN
                </button>
              </>
            )}
            {!result && paused && (
              <>
                <div
                  style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1 }}
                >
                  PAUSED
                </div>
                <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>
                  {level.tip}
                </div>
                <button
                  className="action-btn"
                  onClick={() => setPaused(false)}
                  style={{ ...bigButton, marginTop: 14 }}
                >
                  ▶ RESUME
                </button>
                <button
                  className="action-btn"
                  onClick={() => play(index)}
                  style={{ ...quietButton, marginTop: 8 }}
                >
                  ↻ RESTART
                </button>
              </>
            )}
            <button
              className="action-btn"
              onClick={() => {
                setScreen("levels");
                setResult(null);
                setPaused(false);
                audio.current?.stopEngine();
              }}
              style={{ ...quietButton, marginTop: 8 }}
            >
              LEVELS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The lot and the controls on one canvas, with its own game loop.
function ParkBoard({ level, carLook = null, paused, audio, onTime, onStart, onDone }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const live = useRef({ paused });
  live.current.paused = paused;

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    const ctx = el.getContext("2d");
    const g = newPark(level);
    const input = { gas: false, brake: false, wheelDeg: 0, keys: {} };
    const pointers = new Map(); // pointerId → "wheel" | "gas" | "brake"
    let wheelAngle = 0; // last finger angle on the wheel
    let size = { w: 0, h: 0, dpr: 1 };
    let view = { scale: 1, ox: 0, oy: 0 };
    let lot = null;
    let layout = null;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let started = false;
    let beepAt = 0;
    let reported = 0;

    function resize() {
      const rect = box.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: rect.width, h: rect.height, dpr };
      el.width = Math.round(rect.width * dpr);
      el.height = Math.round(rect.height * dpr);
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      const lotH = Math.max(200, rect.height - CONTROLS_H);
      const scale = Math.min(rect.width / WORLD.w, lotH / WORLD.h);
      view = {
        scale,
        ox: (rect.width - WORLD.w * scale) / 2,
        oy: Math.max(0, (lotH - WORLD.h * scale) / 2),
        color: carLook?.color,
        kind: carLook?.kind,
      };
      lot = renderLot(level, scale * dpr);
      layout = controlLayout(rect.width, lotH, rect.height - lotH);
    }

    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const inBox = (p, b, pad = 10) =>
      p.x >= b.x - pad &&
      p.x <= b.x + b.w + pad &&
      p.y >= b.y - pad &&
      p.y <= b.y + b.h + pad;
    const begin = () => {
      if (!started) {
        started = true;
        onStart();
        audio.current?.unlock();
        audio.current?.startEngine();
      }
    };

    function down(e) {
      if (!layout) return;
      const p = local(e);
      const { wheel } = layout;
      let what = null;
      if (Math.hypot(p.x - wheel.x, p.y - wheel.y) <= wheel.r * 1.35) {
        what = "wheel";
        wheelAngle = Math.atan2(p.y - wheel.y, p.x - wheel.x);
      } else if (inBox(p, layout.gas)) what = "gas";
      else if (inBox(p, layout.brake)) what = "brake";
      if (!what) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, what);
      if (what !== "wheel") begin();
    }
    function move(e) {
      if (pointers.get(e.pointerId) !== "wheel") return;
      const p = local(e);
      const a = Math.atan2(p.y - layout.wheel.y, p.x - layout.wheel.x);
      let d = a - wheelAngle;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      wheelAngle = a;
      input.wheelDeg = Math.max(
        -WHEEL_TURNS,
        Math.min(WHEEL_TURNS, input.wheelDeg + (d * 180) / Math.PI),
      );
    }
    function up(e) {
      pointers.delete(e.pointerId);
    }
    const KEYS = {
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
      ArrowUp: "gas",
      w: "gas",
      ArrowDown: "brake",
      s: "brake",
      " ": "brake",
    };
    function keyDown(e) {
      const k = KEYS[e.key];
      if (!k) return;
      e.preventDefault();
      input.keys[k] = true;
      if (k === "gas" || k === "brake") begin();
    }
    function keyUp(e) {
      const k = KEYS[e.key];
      if (k) input.keys[k] = false;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const held = [...pointers.values()];
      input.gas = held.includes("gas") || Boolean(input.keys.gas);
      input.brake = held.includes("brake") || Boolean(input.keys.brake);
      const turning = held.includes("wheel");
      if (input.keys.left)
        input.wheelDeg = Math.max(-WHEEL_TURNS, input.wheelDeg - KEY_TURN * dt);
      else if (input.keys.right)
        input.wheelDeg = Math.min(WHEEL_TURNS, input.wheelDeg + KEY_TURN * dt);
      else if (!turning) {
        const back = WHEEL_RETURN * dt;
        input.wheelDeg =
          Math.abs(input.wheelDeg) <= back
            ? 0
            : input.wheelDeg - Math.sign(input.wheelDeg) * back;
      }

      if (!live.current.paused && started && g.state === "driving") {
        acc += dt;
        while (acc >= STEP && g.state === "driving") {
          tick(g, {
            gas: input.gas,
            brake: input.brake,
            steer: steerFromWheel(input.wheelDeg),
          });
          acc -= STEP;
        }
        const a = audio.current;
        if (a) {
          a.engine((Math.abs(g.speed) / 16) * 3.6 * 2.2, false);
          if (g.gear === "R" && g.speed < -1 && now - beepAt > 700) {
            a.beep();
            beepAt = now;
          }
        }
        if (now - reported > 100) {
          onTime(g.time);
          reported = now;
        }
        if (g.state !== "driving") {
          onTime(g.time);
          audio.current?.stopEngine();
          onDone({ ...g });
        }
      }

      const { w, h, dpr } = size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0A0A0A";
      ctx.fillRect(0, 0, w, h);
      if (lot) drawPark(ctx, view, lot, g, input, now / 1000);
      // The control strip.
      const strip = ctx.createLinearGradient(0, h - CONTROLS_H, 0, h);
      strip.addColorStop(0, "#141414");
      strip.addColorStop(1, "#0A0A0A");
      ctx.fillStyle = strip;
      ctx.fillRect(0, h - CONTROLS_H, w, CONTROLS_H);
      ctx.fillStyle = "#222";
      ctx.fillRect(0, h - CONTROLS_H, w, 1);
      drawControls(ctx, layout, {
        wheelDeg: input.wheelDeg,
        gas: input.gas,
        brake: input.brake,
      });
    }

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(box);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      audio.current?.stopEngine();
    };
  }, [level]);

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
      {/* Clear of the iPhone's home bar. */}
      <div
        ref={wrap}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: "env(safe-area-inset-bottom)",
        }}
      >
        <canvas
          ref={canvas}
          style={{
            display: "block",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          aria-label={`Parking lot: ${level.name}`}
        />
      </div>
    </div>
  );
}
