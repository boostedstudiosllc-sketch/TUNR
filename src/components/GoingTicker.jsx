import { useMemo, useRef, useState } from "react";

// A stock-ticker view of a count over time: the number, how far it's moved
// in the chosen range, and a stepped line that climbs as people lock in.
// points: [{ at: Date|string, going: number }], oldest first.

const UP = "#10B981";
const DOWN = "#EF6A5A";
const FLAT = "#8A8A8A";

const RANGES = [
  { id: "1d", label: "24H", ms: 864e5, word: "today" },
  { id: "7d", label: "7D", ms: 7 * 864e5, word: "this week" },
  { id: "all", label: "ALL", ms: null, word: "since posted" },
];

const W = 340;
const H = 120;
const PAD_TOP = 8;
const PAD_BOTTOM = 6;

// current: the live count shown elsewhere on the page; the line always ends there.
export default function GoingTicker({ points, current, label = "GOING", allWord = "since posted", now = new Date() }) {
  const [range, setRange] = useState("all");
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

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
    return { pts, start, end, opening, last: pts[pts.length - 1].v };
  }, [points, range, now, current]);

  if (!series) return null;

  const { pts, start, end, opening, last } = series;
  const change = last - opening;
  // A percentage off a tiny base ("+1,700%") says nothing; show it only
  // once there's a real base to compare with.
  const pct = opening >= 10 && Math.abs(change / opening) < 10 ? (change / opening) * 100 : null;
  const color = change > 0 ? UP : change < 0 ? DOWN : FLAT;
  const word = range === "all" ? allWord : RANGES.find((r) => r.id === range).word;

  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = Math.max(1, hi - lo);
  const x = (t) => (end === start ? W : ((t - start) / (end - start)) * W);
  const y = (v) => PAD_TOP + (1 - (v - lo) / span) * (H - PAD_TOP - PAD_BOTTOM);

  // Stepped: the count holds until the next RSVP moves it.
  let line = `M ${x(pts[0].t).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    line += ` H ${x(pts[i].t).toFixed(1)} V ${y(pts[i].v).toFixed(1)}`;
  }
  const area = `${line} V ${H} H ${x(pts[0].t).toFixed(1)} Z`;

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = start + (Math.min(Math.max(px, 0), W) / W) * (end - start);
    let v = pts[0].v;
    for (const p of pts) if (p.t <= t) v = p.v;
    setHover({ px: Math.min(Math.max(px, 0), W), t, v });
  }

  const gradientId = `tick-${label.replace(/\W/g, "")}-${color.slice(1)}`;

  return (
    <div style={{ background: "#0B0B0B", border: "1px solid #1E1E1E", borderRadius: 10, padding: "12px 14px 10px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: "#666", letterSpacing: 1.8, fontWeight: 700 }}>{label}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#F0F0F0", lineHeight: 1 }}>
              {(hover ? hover.v : last).toLocaleString("en-US")}
            </span>
            {hover ? (
              <span style={{ fontSize: 11.5, color: "#888", fontFamily: "'Barlow', sans-serif" }}>
                {when(hover.t)}
              </span>
            ) : (
              <span style={{ fontSize: 12.5, fontWeight: 800, color, letterSpacing: 0.3 }}>
                {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {change > 0 ? "+" : ""}
                {change}
                {pct !== null && change !== 0 && ` (${Math.abs(pct).toFixed(1)}%)`}
                <span style={{ color: "#777", fontWeight: 600 }}> {word}</span>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              style={{
                padding: "3px 7px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 0.6,
                cursor: "pointer",
                background: range === r.id ? "#1E1E1E" : "transparent",
                color: range === r.id ? "#E6E6E6" : "#666",
                border: `1px solid ${range === r.id ? "#333" : "transparent"}`,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${last}, ${change >= 0 ? "up" : "down"} ${Math.abs(change)} ${word}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block", width: "100%", height: 110, marginTop: 8, touchAction: "pan-y", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Opening level, like a previous-close line. */}
        <line x1="0" x2={W} y1={y(opening)} y2={y(opening)} stroke="#333" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover && (
          <>
            <line x1={hover.px} x2={hover.px} y1="0" y2={H} stroke="#555" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={hover.px} cy={y(hover.v)} r="3.5" fill={color} stroke="#0B0B0B" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginTop: 4 }}>
        <span>{when(start, true)}</span>
        <span>now</span>
      </div>
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
