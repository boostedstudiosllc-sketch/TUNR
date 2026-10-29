import { useEffect, useMemo, useRef, useState } from "react";

// A stock-ticker view of a count over time: the number (counting up), how
// far it's moved in the chosen range, and a stepped line that climbs as
// people lock in, drawn in on load. A live dot pulses at "now", the biggest
// jump is called out, the crosshair snaps to each move (pointer or arrow
// keys), and "Moves" lists them as a table.
// points: [{ at: Date|string, going: number }], oldest first.

const UP = "#10B981";
const DOWN = "#EF6A5A";
const FLAT = "var(--n-8a8a8a)";
const SURFACE = "var(--n-0b0b0b)";
const GRID = "var(--n-1c1c1c)";
const INK = "var(--n-f0f0f0)";
const INK_2 = "var(--n-9a9a9a)";
const INK_3 = "var(--n-666666)";

const RANGES = [
  { id: "1d", label: "24H", ms: 864e5, word: "today" },
  { id: "7d", label: "7D", ms: 7 * 864e5, word: "this week" },
  { id: "all", label: "ALL", ms: null, word: "since posted" },
];

const H = 132;
const PAD_TOP = 22; // room for the biggest-jump label
const PAD_BOTTOM = 8;
const AXIS = 30; // right-hand value labels

const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Clean ticks for a small count: 0/5/10, 0/10/20, …
function ticks(lo, hi) {
  const span = Math.max(1, hi - lo);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 3) || Math.ceil(span / 3);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
const compact = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(v));

// The number counts up to its new value.
function useCountUp(target) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (REDUCED) return setShown(target);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / 650);
      setShown(Math.round(a + (target - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function useWidth(ref) {
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // The card's inner width (it has 14px padding each side).
    const measure = () => setW(Math.max(160, el.clientWidth - 28));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  return w;
}

// current: the live count shown elsewhere on the page; the line always ends there.
export default function GoingTicker({ points, current, label = "GOING", allWord = "since posted", now = new Date() }) {
  const [range, setRange] = useState("all");
  const [hover, setHover] = useState(null); // index into pts
  const [table, setTable] = useState(false);
  const box = useRef(null);
  const svgRef = useRef(null);
  const W = useWidth(box);

  const series = useMemo(() => {
    const all = (points || [])
      .map((p) => ({ t: new Date(p.at).getTime(), v: Number(p.going) || 0 }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
    if (!all.length) return null;
    const end = Math.max(now.getTime(), all[all.length - 1].t);
    const r = RANGES.find((x) => x.id === range);
    const start = r.ms ? Math.max(all[0].t, end - r.ms) : all[0].t;
    // The value going into the window, then every move inside it, then now.
    let opening = all[0].v;
    for (const p of all) if (p.t <= start) opening = p.v;
    const inside = all.filter((p) => p.t > start && p.t <= end);
    const pts = [{ t: start, v: opening }, ...inside];
    const closing = Number.isFinite(current) ? current : pts[pts.length - 1].v;
    pts.push({ t: end, v: closing });
    // The biggest single jump up, for a callout.
    let jump = null;
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i].v - pts[i - 1].v;
      if (d >= 2 && (!jump || d > jump.d)) jump = { i, d };
    }
    return { pts, start, end, opening, last: closing, jump };
  }, [points, range, now, current]);

  const shownValue = useCountUp(series ? series.last : 0);
  if (!series) return null;

  const { pts, start, end, opening, last, jump } = series;
  const change = last - opening;
  // A percentage off a tiny base ("+1,700%") says nothing; show it only
  // once there's a real base to compare with.
  const pct = opening >= 10 && Math.abs(change / opening) < 10 ? (change / opening) * 100 : null;
  const color = change > 0 ? UP : change < 0 ? DOWN : FLAT;
  const word = range === "all" ? allWord : RANGES.find((r) => r.id === range).word;

  const plotW = W - AXIS;
  const lo0 = Math.min(...pts.map((p) => p.v));
  const hi0 = Math.max(...pts.map((p) => p.v));
  const grid = ticks(Math.max(0, lo0 - (hi0 === lo0 ? 1 : 0)), hi0 + (hi0 === lo0 ? 1 : 0));
  const lo = Math.min(lo0, grid[0] ?? lo0);
  const hi = Math.max(hi0, grid[grid.length - 1] ?? hi0, lo + 1);
  const x = (t) => (end === start ? plotW : ((t - start) / (end - start)) * plotW);
  const y = (v) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);

  // Stepped: the count holds until the next RSVP moves it.
  let line = `M ${x(pts[0].t).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) line += ` H ${x(pts[i].t).toFixed(1)} V ${y(pts[i].v).toFixed(1)}`;
  const area = `${line} V ${H} H ${x(pts[0].t).toFixed(1)} Z`;

  // The crosshair snaps to the move nearest the pointer.
  function nearest(px) {
    let best = 0;
    for (let i = 0; i < pts.length; i++) if (Math.abs(x(pts[i].t) - px) < Math.abs(x(pts[best].t) - px)) best = i;
    return best;
  }
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left));
  };
  const onKey = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const at = hover ?? pts.length - 1;
    setHover(Math.max(0, Math.min(pts.length - 1, at + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const h = hover !== null ? pts[hover] : null;
  const endX = x(pts[pts.length - 1].t);
  const endY = y(last);
  const gradientId = `tick-${label.replace(/\W/g, "")}-${range}`;
  const moves = pts
    .slice(1, -1)
    .map((p, i) => ({ ...p, d: p.v - pts[i].v }))
    .filter((p) => p.d !== 0)
    .reverse()
    .slice(0, 12);

  return (
    <div ref={box} style={{ background: `radial-gradient(120% 90% at 100% 0%, ${color}14, transparent 60%), ${SURFACE}`, border: "1px solid var(--n-1e1e1e)", borderRadius: 14, padding: "14px 14px 10px", position: "relative" }}>
      <style>{"@keyframes tick-pulse { 0% { r: 4; opacity: 0.55; } 100% { r: 14; opacity: 0; } } @keyframes tick-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } } @keyframes tick-fade { from { opacity: 0; } to { opacity: 1; } }"}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: INK_3, letterSpacing: 1.8, fontWeight: 800 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 0 3px ${color}33` }} />
            {label} · LIVE
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 40, fontWeight: 900, color: INK, lineHeight: 0.95, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>
              {(h ? h.v : shownValue).toLocaleString("en-US")}
            </span>
            {h ? (
              <span style={{ fontSize: 12, color: INK_2, fontFamily: "'Barlow', sans-serif" }}>{when(h.t)}</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 900, color, background: `${color}1f`, borderRadius: 999, padding: "3px 9px", letterSpacing: 0.3 }}>
                {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {change > 0 ? "+" : ""}
                {change}
                {pct !== null && change !== 0 && ` (${Math.abs(pct).toFixed(1)}%)`}
              </span>
            )}
          </div>
          {/* Kept while hovering (just hidden) so the chart doesn't jump. */}
          <div style={{ fontSize: 11.5, color: INK_3, marginTop: 4, fontFamily: "'Barlow', sans-serif", visibility: h ? "hidden" : "visible" }}>{word}</div>
        </div>
        <div role="group" aria-label="Time range" style={{ display: "flex", gap: 2, background: "var(--n-151515)", border: "1px solid var(--n-222222)", borderRadius: 999, padding: 2, flexShrink: 0 }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => (setRange(r.id), setHover(null))}
              aria-pressed={range === r.id}
              style={{ padding: "4px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 900, letterSpacing: 0.6, cursor: "pointer", background: range === r.id ? INK : "transparent", color: range === r.id ? SURFACE : INK_3, border: "none", fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`${label}: ${last}, ${change >= 0 ? "up" : "down"} ${Math.abs(change)} ${word}. Use the arrow keys to step through the moves.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        style={{ display: "block", marginTop: 10, touchAction: "pan-y", cursor: "crosshair", outline: "none", overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Recessive grid with clean values on the right. */}
        {grid.map((v) => (
          <g key={v}>
            <line x1="0" x2={plotW} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={W - 2} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill={INK_3} fontWeight="700">
              {compact(v)}
            </text>
          </g>
        ))}
        {/* Where the range opened, like a previous close. */}
        <line x1="0" x2={plotW} y1={y(opening)} y2={y(opening)} stroke="#2E2E2E" strokeWidth="1" />
        <path key={`a-${range}`} d={area} fill={`url(#${gradientId})`} style={REDUCED ? undefined : { animation: "tick-fade 0.6s ease-out" }} />
        <path
          key={`l-${range}`}
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength="1"
          strokeDasharray="1"
          style={REDUCED ? undefined : { animation: "tick-draw 0.9s cubic-bezier(.2,.7,.2,1) both" }}
        />
        {/* The biggest jump, called out. */}
        {jump && !h && (
          <g>
            <circle cx={x(pts[jump.i].t)} cy={y(pts[jump.i].v)} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
            <text x={Math.min(plotW - 30, Math.max(30, x(pts[jump.i].t)))} y={Math.max(11, y(pts[jump.i].v) - 9)} textAnchor="middle" fontSize="10.5" fontWeight="800" fill={INK_2}>
              🔥 +{jump.d} at once
            </text>
          </g>
        )}
        {/* Now: a live dot. */}
        {!h && !REDUCED && <circle cx={endX} cy={endY} r="4" fill={color} style={{ animation: "tick-pulse 1.6s ease-out infinite" }} />}
        {!h && <circle cx={endX} cy={endY} r="4.5" fill={color} stroke={SURFACE} strokeWidth="2" />}
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1="0" y2={H} stroke="#444" strokeWidth="1" />
            <circle cx={x(h.t)} cy={y(h.v)} r="5" fill={color} stroke={SURFACE} strokeWidth="2" />
          </g>
        )}
      </svg>
      {/* Tooltip: value first, then when and how it moved. */}
      {h && (
        <div
          role="status"
          style={{
            position: "absolute",
            left: Math.min(Math.max(14 + x(h.t) - 70, 8), W - 140 + 6),
            top: (svgRef.current?.offsetTop ?? 70) + Math.max(0, y(h.v) - 58),
            width: 140,
            pointerEvents: "none",
            background: "rgba(var(--base),0.95)",
            border: "1px solid var(--n-2a2a2a)",
            borderRadius: 10,
            padding: "7px 10px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden="true" style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
            <span style={{ fontSize: 16, fontWeight: 900, color: INK }}>{h.v.toLocaleString("en-US")}</span>
            <span style={{ fontSize: 11, color: INK_2 }}>{label.toLowerCase()}</span>
          </div>
          <div style={{ fontSize: 11, color: INK_2, fontFamily: "'Barlow', sans-serif", marginTop: 1 }}>
            {when(h.t)}
            {hover > 0 && h.v !== pts[hover - 1].v && ` · ${h.v > pts[hover - 1].v ? "+" : ""}${h.v - pts[hover - 1].v}`}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: INK_3, marginTop: 4, paddingRight: AXIS, fontWeight: 700 }}>
        <span>{when(start, true)}</span>
        {end - start > 864e5 * 2 && <span>{when(start + (end - start) / 2, true)}</span>}
        <span>now</span>
      </div>

      {moves.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setTable((v) => !v)} aria-expanded={table} style={{ background: "none", border: "none", padding: 0, color: INK_2, fontSize: 11, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}>
            {table ? "▾" : "▸"} MOVES ({moves.length})
          </button>
          {table && (
            <table style={{ width: "100%", marginTop: 6, borderCollapse: "collapse", fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
              <thead>
                <tr style={{ color: INK_3, fontSize: 10.5, textAlign: "left" }}>
                  <th style={{ fontWeight: 700, padding: "2px 0" }}>When</th>
                  <th style={{ fontWeight: 700, textAlign: "right" }}>Move</th>
                  <th style={{ fontWeight: 700, textAlign: "right" }}>{label.toLowerCase()}</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.t} style={{ borderTop: `1px solid ${GRID}`, color: INK_2 }}>
                    <td style={{ padding: "4px 0" }}>{when(m.t)}</td>
                    <td style={{ textAlign: "right", color: INK }}>
                      {m.d > 0 ? "▲ +" : "▼ "}
                      {m.d}
                    </td>
                    <td style={{ textAlign: "right", color: INK, fontWeight: 700 }}>{m.v.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function when(t, short = false) {
  const d = new Date(t);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(short ? {} : { hour: "numeric", minute: "2-digit" }),
  });
}
