import { useEffect, useRef, useState } from "react";
import Sheet, { sheetTitle, muted, quietButton } from "./Sheet.jsx";
import { loadMySpin, spinWheel } from "../lib/points.js";

// The weekly spin (in the 📋 checklist): a wheel of 1–5 points, spun once a
// week. The server picks the number; the wheel just turns to land on it.

const SLICES = [
  { pts: 1, color: "#0080F0" },
  { pts: 2, color: "#10B981" },
  { pts: 3, color: "var(--a-a855f7)" },
  { pts: 4, color: "#F97316" },
  { pts: 5, color: "#EAB308" },
];
const STEP = 360 / SLICES.length;
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const untilText = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (!(ms > 0)) return "soon";
  const d = Math.floor(ms / 864e5);
  const h = Math.ceil((ms % 864e5) / 36e5);
  return d > 0 ? `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} hr` : ""}` : `${h} hr`;
};

// The card in the checklist: open the wheel, or when the next spin is.
export function SpinCard({ user, onSpun, onToast }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    loadMySpin()
      .then(setState)
      .catch((e) => console.warn(e.message));
  }, [user?.id]);
  if (!state) return null;
  return (
    <>
      <button
        className="action-btn"
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 14, cursor: "pointer", textAlign: "left", color: "var(--n-f0f0f0)", border: `1px solid ${state.spun ? "var(--n-262b34)" : "#7C3AED"}`, background: state.spun ? "var(--n-15181e)" : "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(234,179,8,0.12))", fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        <MiniWheel spinning={!state.spun} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: state.spun ? "var(--n-8a94a3)" : "var(--a-e9d5ff)" }}>🎡 WEEKLY SPIN</span>
          <span style={{ display: "block", fontSize: 16.5, fontWeight: 900 }}>{state.spun ? `You won ⭐ ${state.points} this week` : "Spin for up to ⭐ 5 points"}</span>
          <span style={{ display: "block", fontSize: 12, color: "var(--n-9aa4b2)", fontFamily: "'Barlow', sans-serif" }}>{state.spun ? `Next spin in ${untilText(state.next_at)}` : "Once a week. Free."}</span>
        </span>
        {!state.spun && <span style={{ padding: "6px 14px", borderRadius: 8, background: "#EAB308", color: "#111", fontSize: 14, fontWeight: 900, letterSpacing: 1 }}>SPIN</span>}
      </button>
      {open && (
        <SpinSheet
          state={state}
          onClose={() => setOpen(false)}
          onToast={onToast}
          onResult={(r) => {
            setState({ spun: true, points: r.points, next_at: r.next_at });
            onSpun?.();
          }}
        />
      )}
    </>
  );
}

function SpinSheet({ state, onClose, onResult, onToast }) {
  const [angle, setAngle] = useState(state.spun ? landingAngle(state.points, 0) : 0);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(state.spun ? state.points : null);
  const [error, setError] = useState("");
  const done = useRef(state.spun);

  async function spin() {
    if (busy || done.current) return;
    setBusy(true);
    setError("");
    try {
      const r = await spinWheel();
      done.current = true;
      // A few full turns, then land on the slice the server picked.
      setAngle(360 * 6 + landingAngle(r.points, Math.random() * 40 - 20));
      setTimeout(
        () => {
          setWon(r.points);
          setBusy(false);
          onResult(r);
          onToast?.(r.again ? `You already spun this week: ⭐ ${r.points}` : `🎡 +${r.points} points! Added to your balance.`);
        },
        REDUCED ? 50 : 4200
      );
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const size = 280;
  const r = size / 2;
  return (
    <Sheet onClose={onClose} label="Weekly spin" zIndex={340} portal>
      <div style={{ ...sheetTitle, textAlign: "center" }}>🎡 WEEKLY SPIN</div>
      <div style={{ ...muted, textAlign: "center", marginTop: 2 }}>One spin a week, 1 to 5 points.</div>
      <div style={{ position: "relative", width: size, height: size, margin: "18px auto 8px" }}>
        {/* The pointer, at the top. */}
        <div aria-hidden="true" style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderTop: "24px solid var(--n-f0f0f0)", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.5))", zIndex: 2 }} />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={won ? `The wheel landed on ${won} points` : "A wheel of 1 to 5 points"}
          style={{ transform: `rotate(${angle}deg)`, transition: REDUCED ? "none" : "transform 4s cubic-bezier(0.12, 0.7, 0.12, 1)", filter: "drop-shadow(0 10px 24px rgba(124,58,237,0.35))" }}
        >
          {SLICES.map((s, i) => {
            // Slice i is centred at i*STEP degrees clockwise from the top.
            const a0 = ((i * STEP - STEP / 2 - 90) * Math.PI) / 180;
            const a1 = ((i * STEP + STEP / 2 - 90) * Math.PI) / 180;
            const mid = ((i * STEP - 90) * Math.PI) / 180;
            return (
              <g key={s.pts}>
                <path d={`M ${r} ${r} L ${r + (r - 4) * Math.cos(a0)} ${r + (r - 4) * Math.sin(a0)} A ${r - 4} ${r - 4} 0 0 1 ${r + (r - 4) * Math.cos(a1)} ${r + (r - 4) * Math.sin(a1)} Z`} fill={s.color} stroke="#0D0D0D" strokeWidth="3" />
                <text
                  x={r + r * 0.62 * Math.cos(mid)}
                  y={r + r * 0.62 * Math.sin(mid)}
                  transform={`rotate(${i * STEP} ${r + r * 0.62 * Math.cos(mid)} ${r + r * 0.62 * Math.sin(mid)})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="40"
                  fontWeight="900"
                  fill="#fff"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth="1.5"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {s.pts}
                </text>
              </g>
            );
          })}
          <circle cx={r} cy={r} r={r - 3} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
        </svg>
        {/* SPIN in the middle (doesn't turn with the wheel). */}
        <button
          onClick={spin}
          disabled={busy || done.current}
          aria-label={done.current ? "Already spun this week" : "Spin the wheel"}
          style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 84, height: 84, borderRadius: "50%", border: "4px solid var(--n-0d0d0d)", background: done.current ? "var(--n-2a2a2a)" : "radial-gradient(circle at 35% 30%, #fff7cc, #EAB308 60%, #A16207)", color: done.current ? "#888" : "#111", fontSize: 19, fontWeight: 900, letterSpacing: 1.5, cursor: busy || done.current ? "default" : "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.5)", fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {busy ? "…" : done.current ? "✓" : "SPIN"}
        </button>
      </div>
      {won != null && (
        <div role="status" style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#FACC15" }}>⭐ +{won}</div>
          <div style={{ ...muted }}>Added to your balance. Next spin in {untilText(state.next_at || (Date.now() + 7 * 864e5))}.</div>
        </div>
      )}
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", textAlign: "center", marginTop: 8 }}>
          {error}
        </div>
      )}
      <button onClick={onClose} style={{ ...quietButton, marginTop: 14, padding: "11px 0" }}>
        {won != null ? "DONE" : "LATER"}
      </button>
    </Sheet>
  );
}

// Turning the wheel to `deg` brings the slice at -deg under the pointer.
function landingAngle(points, jitter) {
  const i = SLICES.findIndex((s) => s.pts === points);
  return 360 - i * STEP + jitter;
}

function MiniWheel({ spinning }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" style={{ flexShrink: 0, animation: spinning && !REDUCED ? "spin-idle 6s linear infinite" : "none" }}>
      <style>{"@keyframes spin-idle { to { transform: rotate(360deg); } }"}</style>
      {SLICES.map((s, i) => {
        const a0 = ((i * STEP - 90) * Math.PI) / 180;
        const a1 = (((i + 1) * STEP - 90) * Math.PI) / 180;
        return <path key={s.pts} d={`M 20 20 L ${20 + 18 * Math.cos(a0)} ${20 + 18 * Math.sin(a0)} A 18 18 0 0 1 ${20 + 18 * Math.cos(a1)} ${20 + 18 * Math.sin(a1)} Z`} fill={s.color} />;
      })}
      <circle cx="20" cy="20" r="6" fill="#EAB308" stroke="#0D0D0D" strokeWidth="2" />
    </svg>
  );
}
