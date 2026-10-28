import { useEffect, useRef, useState } from "react";
import { GAME_COLORS, BODIES, SPOILERS, RIMS, HEIGHTS, COLOR_NAMES, BODY_NAMES, SPOILER_NAMES, RIM_NAMES, HEIGHT_NAMES, DEFAULT_LOOK, lookOf, drawCar } from "../lib/rushEngine.js";
import { saveGameLook } from "../lib/rush.js";
import { quietButton, label, muted } from "./Sheet.jsx";
import { loadVehicles } from "../lib/store.js";

// The garage showroom: your car on a turntable in a 3D garage
// (showroom3d.js), cards for each car, and rows to restyle it. Used on your
// profile (Your garage), on other people's profiles (to look), and in TUNR
// Rush to pick the car you drive.

const LOW_POWER = typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4;
const loadShowroom = () => import("../lib/showroom3d.js");
export const carName = (v) => (v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "TUNR loaner");

// The stage. 3D unless `flat` (or the phone can't do 3D): then a drawing of
// the car from behind, the way TUNR Rush's classic graphics show it.
export function ShowroomStage({ look, plate = "", flat = false, interactive = true, insets = null, style }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const view = useRef(null);
  const latest = useRef({ look, plate, insets });
  latest.current = { look, plate, insets };
  const [mode, setMode] = useState(flat ? "2d" : "3d");
  const [why, setWhy] = useState("");
  useEffect(() => setMode(flat ? "2d" : "3d"), [flat]);

  useEffect(() => {
    if (mode !== "3d") return undefined;
    let gone = false;
    let ro = null;
    loadShowroom()
      .then((m) => {
        if (gone || !canvas.current) return;
        try {
          view.current = m.createShowroom(canvas.current, { lowPower: LOW_POWER, interactive });
        } catch (e) {
          setWhy(`3D garage didn't start, so here's the flat view. (${e.message})`);
          setMode("2d");
          return;
        }
        const fit = () => {
          const r = wrap.current?.getBoundingClientRect();
          if (r) view.current?.resize(r.width, r.height);
        };
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(wrap.current);
        if (latest.current.insets) view.current.setInsets(latest.current.insets);
        view.current.show({ ...latest.current.look, plate: latest.current.plate });
      })
      .catch((e) => {
        setWhy(`3D garage didn't load, so here's the flat view. (${e.message})`);
        setMode("2d");
      });
    return () => {
      gone = true;
      ro?.disconnect();
      view.current?.dispose();
      view.current = null;
    };
  }, [mode, interactive]);

  const insetKey = insets ? `${insets.top || 0},${insets.bottom || 0},${insets.right || 0}` : "";
  useEffect(() => {
    if (insets) view.current?.setInsets(insets);
  }, [insetKey]);

  useEffect(() => {
    if (mode === "3d") {
      view.current?.show({ ...look, plate });
      return;
    }
    const c = canvas.current;
    const r = wrap.current?.getBoundingClientRect();
    if (!c || !r) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    // The same bright garage, flat: wall, floor, turntable, the car.
    const top = insets?.top || 0;
    const vw = r.width - (insets?.right || 0);
    const vh = r.height - top - (insets?.bottom || 0);
    const base = top + vh * 0.84;
    const g = ctx.createLinearGradient(0, 0, 0, r.height);
    g.addColorStop(0, "#f1f3f6");
    g.addColorStop(base / r.height - 0.12, "#e3e6ea");
    g.addColorStop(base / r.height - 0.12, "#cfd3d9");
    g.addColorStop(1, "#b9bec6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = "#3aa0ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(vw / 2, base, vw * 0.34, vh * 0.07, 0, 0, Math.PI * 2);
    ctx.stroke();
    const w = Math.min(vw * 0.55, 240);
    drawCar(ctx, vw / 2, base, w, { ...look, plate, sport: true });
  }, [mode, look.color, look.body, look.spoiler, look.rims, look.height, plate, insetKey]);

  return (
    <div ref={wrap} style={{ position: "relative", overflow: "hidden", background: "#e9ecf0", ...style }}>
      {/* A canvas can't switch between 3D and 2D drawing, so each mode gets its own. */}
      <canvas key={mode} ref={canvas} aria-label="Your car in the garage" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {why && (
        <div style={{ position: "absolute", left: 8, right: 8, top: (insets?.top || 0) + 6, fontSize: 11, color: "#5b6370", fontFamily: "'Barlow', sans-serif", textAlign: "center" }}>
          {why}
        </div>
      )}
    </div>
  );
}

// One card per car, with a little 3D picture of it. `first`: an extra card
// before them (a game's own car): { icon, name, sub, selected, onPick }.
export function CarCards({ cars, selectedId, onPick, onAdd, addLabel = "+ ADD CAR", first = null }) {
  const [thumbs, setThumbs] = useState([]);
  const looks = cars.map(lookOf);
  const key = JSON.stringify(looks);
  useEffect(() => {
    if (!cars.length) return undefined;
    // Wait for the style to settle before redrawing the pictures.
    const t = setTimeout(() => {
      loadShowroom()
        .then((m) => setThumbs(m.carThumbs(looks)))
        .catch((e) => console.warn("Car pictures didn't draw:", e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [key]);

  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 6px", scrollbarWidth: "none" }}>
      {first && (
        <button
          onClick={first.onPick}
          aria-pressed={first.selected}
          style={{
            flex: "0 0 112px",
            padding: 0,
            borderRadius: 10,
            overflow: "hidden",
            cursor: "pointer",
            background: "#15181e",
            border: first.selected ? "2px solid #FACC15" : "1px solid #2A2E36",
            color: "#F0F0F0",
            textAlign: "left",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          <div style={{ height: 74, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, background: "linear-gradient(160deg, #0d1a2b, #1a1d23)" }}>{first.icon}</div>
          <div style={{ padding: "5px 7px 6px" }}>
            <div style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>{first.name}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: first.selected ? "#FACC15" : "#7D8796" }}>{first.selected ? "SELECTED" : first.sub}</div>
          </div>
        </button>
      )}
      {cars.map((v, k) => {
        const on = v.id === selectedId;
        return (
          <button
            key={v.id}
            onClick={() => onPick(v)}
            aria-pressed={on}
            style={{
              flex: "0 0 128px",
              padding: 0,
              borderRadius: 10,
              overflow: "hidden",
              cursor: "pointer",
              background: "#15181e",
              border: on ? "2px solid #FACC15" : "1px solid #2A2E36",
              color: "#F0F0F0",
              textAlign: "left",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            <div style={{ position: "relative", height: 74, background: "#1a1d23" }}>
              {thumbs[k] ? (
                <img src={thumbs[k]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : v.photo_url ? (
                <img src={v.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🚗</div>
              )}
              {v.is_primary && (
                <span style={{ position: "absolute", top: 4, left: 4, fontSize: 9.5, fontWeight: 900, letterSpacing: 1, background: "#0080F0", color: "#fff", borderRadius: 4, padding: "1px 5px" }}>MAIN</span>
              )}
            </div>
            <div style={{ padding: "5px 7px 6px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>
                {v.make} {v.model}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: on ? "#FACC15" : "#7D8796" }}>{on ? "SELECTED" : v.year || " "}</div>
            </div>
          </button>
        );
      })}
      {onAdd && (
        <button
          onClick={onAdd}
          style={{ flex: "0 0 104px", borderRadius: 10, cursor: "pointer", background: "transparent", border: "1px dashed #3A4250", color: "#7FBFF5", fontSize: 13, fontWeight: 900, letterSpacing: 1, fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

// "Other": a rainbow swatch that opens the phone's color wheel.
export function OtherColor({ color, onChange, size = 30 }) {
  const custom = !GAME_COLORS.includes(color);
  return (
    <label
      title="Any color"
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        cursor: "pointer",
        background: custom ? color : "conic-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
        border: custom ? "3px solid #fff" : "1px solid #333",
        boxShadow: custom ? "0 0 0 2px #a855f7" : "none",
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        fontWeight: 900,
        color: "#fff",
        textShadow: "0 1px 2px #000",
      }}
    >
      {custom ? "" : "+"}
      <input
        type="color"
        aria-label="Pick any color"
        value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#0080F0"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: 0, padding: 0 }}
      />
    </label>
  );
}

const ROWS = [
  ["color", "Paint", GAME_COLORS, COLOR_NAMES],
  ["body", "Body", BODIES, BODY_NAMES],
  ["spoiler", "Wing", SPOILERS, SPOILER_NAMES],
  ["rims", "Wheels", RIMS, RIM_NAMES],
  ["height", "Ride height", HEIGHTS, HEIGHT_NAMES],
];

// Style rows: ◀ value ▶ for paint, body, wing, wheels and ride height.
export function StyleRows({ look, onChange }) {
  const step = (key, list, dir) => {
    const at = list.indexOf(look[key]);
    const next = list[(((at < 0 ? 0 : at + dir) % list.length) + list.length) % list.length];
    onChange({ [key]: next });
  };
  const arrow = { ...quietButton, width: 40, height: 36, padding: 0, fontSize: 14, flexShrink: 0 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ROWS.map(([key, name, list, names]) => {
        const noWing = key === "spoiler" && look.body === "truck";
        const value = noWing ? "Not on trucks" : names[look[key]] || (key === "color" ? "Custom" : look[key]);
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, background: "#15181e", border: "1px solid #252a33", borderRadius: 10, padding: "5px 6px 5px 12px" }}>
            <span style={{ width: 84, fontSize: 12, fontWeight: 800, letterSpacing: 1, color: "#8A94A3", textTransform: "uppercase", flexShrink: 0 }}>{name}</span>
            <button aria-label={`Previous ${name.toLowerCase()}`} disabled={noWing} onClick={() => step(key, list, -1)} style={{ ...arrow, opacity: noWing ? 0.3 : 1 }}>
              ◀
            </button>
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 15, fontWeight: 900 }}>
              {key === "color" && <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", background: look.color, border: "1px solid rgba(255,255,255,0.4)" }} />}
              {value}
            </span>
            <button aria-label={`Next ${name.toLowerCase()}`} disabled={noWing} onClick={() => step(key, list, 1)} style={{ ...arrow, opacity: noWing ? 0.3 : 1 }}>
              ▶
            </button>
            {key === "color" && <OtherColor color={look.color} onChange={(c) => onChange({ color: c })} size={34} />}
          </div>
        );
      })}
    </div>
  );
}

function useWide() {
  const get = () => typeof window !== "undefined" && window.innerWidth >= 760 && window.innerWidth > window.innerHeight;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const on = () => setWide(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

const tag = (color) => ({ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, padding: "3px 8px", borderRadius: 5, background: color, color: "#fff" });

const GAMES = [
  ["drift", "🏎️", "Drift King"],
  ["ball", "⚽", "Turbo Ball"],
  ["park", "🅿️", "Park Up"],
  ["karts", "🛞", "Boosted Karts"],
];

// The game-style tuner: pick a part (Paint, Body, Wing, Wheels, Stance),
// then flip through it with ◀ ▶ — or tap a swatch for paint.
const PARTS = [
  ["color", "Paint", GAME_COLORS, COLOR_NAMES],
  ["body", "Body", BODIES, BODY_NAMES],
  ["spoiler", "Wing", SPOILERS, SPOILER_NAMES],
  ["rims", "Wheels", RIMS, RIM_NAMES],
  ["height", "Stance", HEIGHTS, HEIGHT_NAMES],
];
export function Tuner({ look, onChange }) {
  const [part, setPart] = useState("color");
  const [key, name, list, names] = PARTS.find((p) => p[0] === part);
  const noWing = key === "spoiler" && look.body === "truck";
  const at = list.indexOf(look[key]);
  const step = (dir) => onChange({ [key]: list[(((at < 0 ? 0 : at + dir) % list.length) + list.length) % list.length] });
  const value = noWing ? "Not on trucks" : names[look[key]] || (key === "color" ? "Custom" : look[key]);
  const round = { width: 44, height: 44, flexShrink: 0, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 15, cursor: "pointer", padding: 0 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div role="tablist" aria-label="Parts" style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: 3 }}>
        {PARTS.map(([k, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={part === k}
            onClick={() => setPart(k)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", background: part === k ? "#fff" : "transparent", color: part === k ? "#0b0d11" : "#9AA4B2", fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            {n}
          </button>
        ))}
      </div>
      {key === "color" ? (
        <div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 2px", scrollbarWidth: "none", alignItems: "center" }}>
            {GAME_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`${COLOR_NAMES[c]} paint`}
                aria-pressed={look.color === c}
                onClick={() => onChange({ color: c })}
                style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", cursor: "pointer", padding: 0, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 45%), ${c}`, border: look.color === c ? "3px solid #fff" : "1px solid rgba(255,255,255,0.25)", boxShadow: look.color === c ? "0 0 0 2px #0080F0" : "none", boxSizing: "border-box" }}
              />
            ))}
            <OtherColor color={look.color} onChange={(c) => onChange({ color: c })} size={34} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <button aria-label="Previous paint" onClick={() => step(-1)} style={{ ...round, width: 34, height: 34, fontSize: 12 }}>
              ◀
            </button>
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5 }}>{value}</span>
            <button aria-label="Next paint" onClick={() => step(1)} style={{ ...round, width: 34, height: 34, fontSize: 12 }}>
              ▶
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button aria-label={`Previous ${name.toLowerCase()}`} disabled={noWing} onClick={() => step(-1)} style={{ ...round, opacity: noWing ? 0.3 : 1 }}>
            ◀
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.1 }}>{value}</div>
            {!noWing && (
              <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 6 }}>
                {list.map((v) => (
                  <span key={v} style={{ width: v === look[key] ? 18 : 6, height: 6, borderRadius: 3, background: v === look[key] ? "#FACC15" : "rgba(255,255,255,0.25)", transition: "width 0.15s" }} />
                ))}
              </div>
            )}
          </div>
          <button aria-label={`Next ${name.toLowerCase()}`} disabled={noWing} onClick={() => step(1)} style={{ ...round, opacity: noWing ? 0.3 : 1 }}>
            ▶
          </button>
        </div>
      )}
    </div>
  );
}

// The full-screen garage, styled like a racing game's: your car fills the
// screen in a bright studio, the name and stats over it, and one dark glass
// panel at the bottom (on wide screens, the right) with the tuner, DRIVE
// and your cars. editable: it's your garage (restyle, edit, sticker, main
// car, drive); otherwise you're looking at someone else's.
// Picker mode (a game's garage): `action` = { label, sub, onPick(car or
// null for the game's own car) } replaces DRIVE and the INFO tab, and
// `first` = { icon, name, sub, look } adds the game's own car first.
export function GarageShowroom({ title, cars, startId, plate = "", editable = false, flat = false, first = null, action = null, onClose, onLook, onEdit, onSticker, onMakeMain, onAdd, onDrive }) {
  const [selectedId, setSelectedId] = useState(startId || cars.find((c) => c.is_primary)?.id || cars[0]?.id || (first ? "game" : null));
  const [tab, setTab] = useState(editable ? "style" : "info");
  const [games, setGames] = useState(false);
  const [insets, setInsets] = useState({ top: 150, bottom: 0, right: 0 });
  const wide = useWide();
  const sheet = useRef(null);
  const head = useRef(null);
  const gameCar = Boolean(first) && (selectedId === "game" || !cars.length);
  const car = gameCar ? null : cars.find((c) => c.id === selectedId) || cars[0] || null;
  const look = gameCar ? { ...DEFAULT_LOOK, ...first.look } : lookOf(car);
  const shown = Boolean(car || gameCar);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the car in the part of the screen the menus leave open.
  useEffect(() => {
    const measure = () => {
      const s = sheet.current?.getBoundingClientRect();
      const t = head.current?.getBoundingClientRect();
      if (!s) return;
      const next = wide ? { top: t ? t.bottom : 0, bottom: 0, right: window.innerWidth - s.left } : { top: t ? t.bottom : 0, bottom: window.innerHeight - s.top, right: 0 };
      setInsets((old) => (old.top === next.top && old.bottom === next.bottom && old.right === next.right ? old : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheet.current) ro.observe(sheet.current);
    if (head.current) ro.observe(head.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide, shown]);

  const glassBtn = { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#F0F0F0", borderRadius: 12, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 900, letterSpacing: 0.8 };
  const tabBtn = (id, name) => (
    <button
      key={id}
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      style={{ background: "none", border: "none", padding: "2px 0 6px", cursor: "pointer", fontSize: 15, fontWeight: 900, letterSpacing: 1.5, color: tab === id ? "#fff" : "#6B7480", borderBottom: tab === id ? "3px solid #FACC15" : "3px solid transparent", fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      {name}
    </button>
  );

  const infoPanel = car && (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {car.build_notes ? (
        <div style={{ fontSize: 13.5, color: "#C9D1DC", fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 }}>{car.build_notes}</div>
      ) : (
        <div style={{ fontSize: 13, color: "#7D8796", fontFamily: "'Barlow', sans-serif" }}>No build notes yet.</div>
      )}
      {car.photo_url && <img src={car.photo_url} alt={`${carName(car)}, the real thing`} style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 12 }} />}
      {editable && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="action-btn" onClick={() => onEdit(car)} style={{ ...glassBtn, flex: 1, padding: "10px 0", fontSize: 13 }}>
            ✏️ EDIT DETAILS
          </button>
          <button className="action-btn" onClick={() => onSticker(car)} style={{ ...glassBtn, flex: 1, padding: "10px 0", fontSize: 13, color: "#7FC4FF" }}>
            🔳 QR STICKER
          </button>
          {!car.is_primary && (
            <button className="action-btn" onClick={() => onMakeMain(car)} style={{ ...glassBtn, flex: 1, padding: "10px 0", fontSize: 13 }}>
              ★ MAKE MAIN
            </button>
          )}
        </div>
      )}
    </div>
  );

  const picked = action && (
    <button
      className="action-btn"
      onClick={() => action.onPick(car)}
      aria-label={action.sub ? `${action.label}: ${action.sub.toLowerCase()}` : action.label}
      style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(180deg, #FFDD3C, #F5B800)", color: "#111", boxShadow: "0 6px 20px rgba(250,204,21,0.25)", fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}
    >
      <span style={{ display: "block", fontSize: 21, fontWeight: 900, letterSpacing: 2 }}>{action.label} ›</span>
      {action.sub && <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: 1.5, opacity: 0.7, marginTop: 2 }}>{action.sub}</span>}
    </button>
  );

  const drive = !action && editable && onDrive && car && (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="action-btn"
          onClick={() => onDrive(car, "rush")}
          aria-label="Drive in TUNR Rush"
          style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(180deg, #FFDD3C, #F5B800)", color: "#111", boxShadow: "0 6px 20px rgba(250,204,21,0.25)", fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}
        >
          <span style={{ display: "block", fontSize: 21, fontWeight: 900, letterSpacing: 2 }}>DRIVE ›</span>
          <span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: 1.5, opacity: 0.7, marginTop: 2 }}>IN TUNR RUSH</span>
        </button>
        <button className="action-btn" onClick={() => setGames((g) => !g)} aria-expanded={games} aria-label="Play it in another game" style={{ ...glassBtn, width: 92, fontSize: 12.5, lineHeight: 1.15 }}>
          🎮
          <br />
          MORE GAMES
        </button>
      </div>
      {games && (
        <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 8px)", width: 210, background: "rgba(16,18,24,0.97)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 6, boxShadow: "0 12px 30px rgba(0,0,0,0.45)", zIndex: 2 }}>
          {GAMES.map(([game, icon, name]) => (
            <button key={game} className="action-btn" onClick={() => onDrive(car, game)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 10px", background: "none", border: "none", color: "#F0F0F0", fontSize: 16, fontWeight: 900, letterSpacing: 0.5, cursor: "pointer", borderRadius: 10, fontFamily: "'Barlow Condensed', sans-serif", textAlign: "left" }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Name and stats, big and dark over the bright garage.
  const hero = shown && (
    <div style={{ padding: "4px 18px 0", pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 20 }}>
        {car?.is_primary && <span style={tag("#0080F0")}>MAIN CAR</span>}
        {car?.public_page && <span style={tag("#10B981")}>BUILD PAGE ON</span>}
        {gameCar && <span style={tag("#7C3AED")}>GAME CAR</span>}
      </div>
      <div style={{ fontSize: car?.year || gameCar ? 14 : 0, fontWeight: 800, color: "#5b6370", letterSpacing: 1.5, marginTop: 6 }}>{gameCar ? String(first.sub || "").toUpperCase() : `${car.year || ""} ${String(car.make || "").toUpperCase()}`}</div>
      <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 0.95, color: "#0b0d11", textTransform: "uppercase", letterSpacing: -0.3 }}>{gameCar ? first.name : car.model || car.make}</div>
      <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
        {[
          [BODY_NAMES[look.body], "Body"],
          [COLOR_NAMES[look.color] || "Custom", "Paint"],
          [HEIGHT_NAMES[look.height], "Stance"],
          [RIM_NAMES[look.rims], "Wheels"],
        ].map(([v, k]) => (
          <div key={k} style={{ borderLeft: "3px solid #FACC15", paddingLeft: 7 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#6b7380", letterSpacing: 1.2, textTransform: "uppercase" }}>{k}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#14171c", whiteSpace: "nowrap" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 420, background: "#e9ecf0", color: "#F0F0F0", fontFamily: "'Barlow Condensed', sans-serif", overflow: "hidden" }}>
      {shown && <ShowroomStage look={look} plate={plate} flat={flat} insets={insets} style={{ position: "absolute", inset: 0 }} />}
      <div ref={head} style={{ position: "absolute", top: 0, left: 0, right: wide ? insets.right : 0, paddingTop: "calc(10px + env(safe-area-inset-top))", paddingBottom: 6, pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", pointerEvents: "auto" }}>
          <button onClick={onClose} aria-label="Close the garage" style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: "#fff", color: "#0b0d11", fontSize: 18, fontWeight: 900, cursor: "pointer", boxShadow: "0 3px 12px rgba(0,0,0,0.18)" }}>
            ←
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 900, letterSpacing: 3, color: "#0b0d11", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>{title}</div>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: "#0b0d11", background: "rgba(255,255,255,0.75)", borderRadius: 999, padding: "5px 11px" }}>
            {cars.length} {cars.length === 1 ? "CAR" : "CARS"}
          </div>
        </div>
        {hero}
      </div>
      {!shown ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#5b6370", fontFamily: "'Barlow', sans-serif" }}>
          No cars here yet.
          {editable && onAdd && (
            <button className="action-btn" onClick={onAdd} style={{ ...quietButton, width: "auto", padding: "10px 18px", color: "#3CABFD" }}>
              + ADD YOUR CAR
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", left: 0, right: wide ? insets.right : 0, bottom: wide ? 14 : insets.bottom + 8, textAlign: "center", fontSize: 11.5, fontWeight: 800, letterSpacing: 1.5, color: "rgba(20,23,28,0.45)", pointerEvents: "none" }}>⟲ DRAG TO SPIN</div>
          <div
            ref={sheet}
            style={{
              position: "absolute",
              ...(wide ? { top: 12, right: 12, bottom: 12, width: 380, borderRadius: 20 } : { left: 0, right: 0, bottom: 0, borderRadius: "22px 22px 0 0", maxHeight: "62vh" }),
              background: "rgba(12,14,19,0.9)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.22)",
              padding: `14px 14px calc(${wide ? 14 : 10}px + env(safe-area-inset-bottom))`,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
          >
            {editable && !action && (
              <div role="tablist" style={{ display: "flex", gap: 18 }}>
                {tabBtn("style", "TUNE")}
                {tabBtn("info", "INFO")}
              </div>
            )}
            {gameCar ? (
              <div style={{ fontSize: 13, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif" }}>The game's own car. Pick one of yours to drive and tune it here.</div>
            ) : tab === "style" && editable ? (
              <Tuner look={look} onChange={(patch) => onLook(car, { ...look, ...patch })} />
            ) : (
              infoPanel
            )}
            {picked}
            {drive}
            <div style={{ marginTop: wide ? "auto" : 0 }}>
              <CarCards
                cars={cars}
                selectedId={car?.id}
                onPick={(v) => setSelectedId(v.id)}
                onAdd={editable ? onAdd : null}
                first={first && { ...first, selected: gameCar, onPick: () => setSelectedId("game") }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Which of your cars you're driving in a game, remembered per game on this
// phone ("game" = the game's own car). With nothing picked yet, your main car.
// restyle(car, look): shown at once, saved to the car once you stop tapping.
export function useGarageCar(user, game, onError = (msg) => console.warn(msg)) {
  const key = `tunr.${game}.car`;
  const [cars, setCars] = useState([]);
  const timers = useRef({});
  const [picked, setPicked] = useState(() => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Couldn't read your car pick:", e.message);
      return null;
    }
  });
  useEffect(() => {
    if (!user?.id) {
      setCars([]);
      return;
    }
    let alive = true;
    loadVehicles(user.id)
      .then((list) => alive && setCars(list))
      .catch((e) => onError(`Couldn't load your garage. (${e.message})`));
    return () => {
      alive = false;
    };
  }, [user?.id]);
  const car = picked === "game" ? null : cars.find((c) => c.id === picked) || (picked ? null : cars.find((c) => c.is_primary) || cars[0] || null);
  const pick = (id) => {
    setPicked(id);
    try {
      localStorage.setItem(key, id);
    } catch (e) {
      console.warn("Couldn't save your car pick:", e.message);
    }
  };
  const restyle = (vehicle, look) => {
    setCars((list) =>
      list.map((v) => (v.id === vehicle.id ? { ...v, game_color: look.color, game_body: look.body, game_spoiler: look.spoiler, game_rims: look.rims, game_height: look.height } : v))
    );
    clearTimeout(timers.current[vehicle.id]);
    timers.current[vehicle.id] = setTimeout(() => saveGameLook(vehicle.id, look).catch((e) => onError(e.message)), 600);
  };
  return { cars, car, pick, restyle };
}

// "Your ride" in a game's menu: a picture of the car you're driving and a
// door into the full-screen garage to pick another (or tune it).
export function RideCard({ name, look = null, icon = "🚗", onOpen }) {
  const [thumb, setThumb] = useState(null);
  const key = look ? JSON.stringify(look) : "";
  useEffect(() => {
    if (!look) return setThumb(null);
    let alive = true;
    loadShowroom()
      .then((m) => alive && setThumb(m.carThumbs([look], 240, 140)[0]))
      .catch((e) => console.warn("Car picture didn't draw:", e.message));
    return () => {
      alive = false;
    };
  }, [key]);
  return (
    <button
      className="action-btn"
      onClick={onOpen}
      aria-label={`Your ride: ${name}. Open the garage`}
      style={{ display: "flex", alignItems: "stretch", width: "100%", padding: 0, borderRadius: 14, overflow: "hidden", cursor: "pointer", background: "#15181e", border: "1px solid #2A2E36", color: "#F0F0F0", textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      <div style={{ width: 132, height: 78, flexShrink: 0, background: "#e3e6ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
        {thumb ? <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: "#FACC15" }}>YOUR RIDE</span>
        <span style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      </div>
      <span style={{ alignSelf: "center", margin: "0 12px", fontSize: 13, fontWeight: 900, letterSpacing: 1, background: "#FACC15", color: "#111", borderRadius: 8, padding: "7px 10px", whiteSpace: "nowrap" }}>GARAGE ›</span>
    </button>
  );
}

// The "your ride" row in a game's menu: the card, and the full-screen garage
// it opens, where the game's own car comes first, then yours.
export function GarageRow({ user, garage, first = null, game = "this game", hint = "Add your car in Profile → Garage to drive it here." }) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const mine = garage.car;
  return (
    <>
      <div style={{ ...label, marginTop: 14 }}>YOUR RIDE</div>
      <RideCard name={mine ? `${mine.make} ${mine.model}` : first?.name || "TUNR loaner"} look={mine ? lookOf(mine) : first?.look || null} icon={first?.icon} onOpen={() => setOpen(true)} />
      {!garage.cars.length && <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>{hint}</div>}
      {open && (
        <GarageShowroom
          title="GARAGE"
          cars={garage.cars}
          startId={mine?.id || "game"}
          editable
          first={first}
          onLook={garage.restyle}
          onClose={() => setOpen(false)}
          action={{
            label: "SELECT",
            sub: `DRIVE IT IN ${game.toUpperCase()}`,
            onPick: (c) => {
              garage.pick(c ? c.id : "game");
              setOpen(false);
            },
          }}
        />
      )}
    </>
  );
}
