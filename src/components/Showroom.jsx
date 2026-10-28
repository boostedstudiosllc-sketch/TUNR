import { useEffect, useRef, useState } from "react";
import { GAME_COLORS, BODIES, SPOILERS, RIMS, HEIGHTS, COLOR_NAMES, BODY_NAMES, SPOILER_NAMES, RIM_NAMES, HEIGHT_NAMES, lookOf, drawCar } from "../lib/rushEngine.js";
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
export function ShowroomStage({ look, plate = "", flat = false, interactive = true, style }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const view = useRef(null);
  const latest = useRef({ look, plate });
  latest.current = { look, plate };
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
    const g = ctx.createLinearGradient(0, 0, 0, r.height);
    g.addColorStop(0, "#1b1e24");
    g.addColorStop(0.62, "#0f1115");
    g.addColorStop(0.62, "#202329");
    g.addColorStop(1, "#121418");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = "#0080F0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(r.width / 2, r.height * 0.86, r.width * 0.34, r.height * 0.07, 0, 0, Math.PI * 2);
    ctx.stroke();
    const w = Math.min(r.width * 0.55, 240);
    drawCar(ctx, r.width / 2, r.height * 0.86, w, { ...look, plate, sport: true });
  }, [mode, look.color, look.body, look.spoiler, look.rims, look.height, plate]);

  return (
    <div ref={wrap} style={{ position: "relative", overflow: "hidden", background: "#0c0e12", ...style }}>
      {/* A canvas can't switch between 3D and 2D drawing, so each mode gets its own. */}
      <canvas key={mode} ref={canvas} aria-label="Your car in the garage" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {why && (
        <div style={{ position: "absolute", left: 8, right: 8, bottom: 6, fontSize: 11, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", textAlign: "center" }}>
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

const tag = (color) => ({ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, padding: "2px 7px", borderRadius: 4, background: color, color: "#fff" });

// The full-screen garage. editable: it's your garage (restyle, edit, sticker,
// main car, drive); otherwise you're looking at someone else's.
export function GarageShowroom({ title, cars, startId, plate = "", editable = false, onClose, onLook, onEdit, onSticker, onMakeMain, onAdd, onDrive }) {
  const [selectedId, setSelectedId] = useState(startId || cars.find((c) => c.is_primary)?.id || cars[0]?.id || null);
  const [tab, setTab] = useState(editable ? "style" : "info");
  const wide = useWide();
  const car = cars.find((c) => c.id === selectedId) || cars[0] || null;
  const look = lookOf(car);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabBtn = (id, name) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      style={{ padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 900, letterSpacing: 1, background: tab === id ? "#F0F0F0" : "#1b1f26", color: tab === id ? "#0A0A0A" : "#B9C2CF", fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      {name}
    </button>
  );

  const panel = car && (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {editable && <div style={{ display: "flex", gap: 6 }}>{[tabBtn("style", "STYLE"), tabBtn("info", "INFO")]}</div>}
      {tab === "style" && editable ? (
        <>
          <StyleRows look={look} onChange={(patch) => onLook(car, { ...look, ...patch })} />
          <div style={{ fontSize: 11.5, color: "#7D8796", fontFamily: "'Barlow', sans-serif" }}>Your style shows here, on your profile, and on your car in TUNR Rush.</div>
        </>
      ) : (
        <>
          {car.build_notes ? (
            <div style={{ fontSize: 13.5, color: "#C9D1DC", fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 }}>{car.build_notes}</div>
          ) : (
            <div style={{ fontSize: 13, color: "#7D8796", fontFamily: "'Barlow', sans-serif" }}>No build notes yet.</div>
          )}
          {car.photo_url && <img src={car.photo_url} alt={`${carName(car)}, the real thing`} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, border: "1px solid #2A2E36" }} />}
          {editable && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="action-btn" onClick={() => onEdit(car)} style={{ ...quietButton, flex: 1, padding: "10px 0", fontSize: 13 }}>
                ✏️ EDIT DETAILS
              </button>
              <button className="action-btn" onClick={() => onSticker(car)} style={{ ...quietButton, flex: 1, padding: "10px 0", fontSize: 13, color: "#3CABFD" }}>
                🔳 QR STICKER
              </button>
              {!car.is_primary && (
                <button className="action-btn" onClick={() => onMakeMain(car)} style={{ ...quietButton, flex: 1, padding: "10px 0", fontSize: 13 }}>
                  ★ MAKE MAIN
                </button>
              )}
            </div>
          )}
        </>
      )}
      {editable && onDrive && (
        <>
          <button
            className="action-btn"
            onClick={() => onDrive(car, "rush")}
            style={{ padding: "13px 0", borderRadius: 10, border: "none", cursor: "pointer", background: "#FACC15", color: "#111", fontSize: 18, fontWeight: 900, letterSpacing: 1.5, fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            🏁 DRIVE IN TUNR RUSH
          </button>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3" }}>OR PLAY IT IN</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {[
              ["drift", "🏎️ Drift King"],
              ["ball", "⚽ Turbo Ball"],
              ["park", "🅿️ Park Up"],
              ["karts", "🛞 Boosted Karts"],
            ].map(([game, name]) => (
              <button key={game} className="action-btn" onClick={() => onDrive(car, game)} style={{ ...quietButton, padding: "10px 0", fontSize: 13.5 }}>
                {name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const info = car && (
    <div style={{ position: "absolute", top: 10, left: 12, right: 12, pointerEvents: "none", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {car.is_primary && <span style={tag("#0080F0")}>MAIN CAR</span>}
        {car.public_page && <span style={tag("#10B981")}>BUILD PAGE ON</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.05, marginTop: 4, textTransform: "uppercase" }}>
        {car.make} {car.model}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        {[
          [car.year || "—", "Year"],
          [BODY_NAMES[look.body], "Body"],
          [COLOR_NAMES[look.color] || "Custom", "Paint"],
          [HEIGHT_NAMES[look.height], "Stance"],
        ].map(([v, k]) => (
          <div key={k}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{v}</div>
            <div style={{ fontSize: 10, color: "#9AA4B2", letterSpacing: 1, textTransform: "uppercase" }}>{k}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div role="dialog" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 420, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px" }}>
        <button onClick={onClose} aria-label="Close the garage" style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 18 }}>
          ←
        </button>
        <div style={{ flex: 1, fontSize: 24, fontWeight: 900, letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#7D8796" }}>
          {cars.length} {cars.length === 1 ? "CAR" : "CARS"}
        </div>
      </div>
      {!car ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#7D8796", fontFamily: "'Barlow', sans-serif" }}>
          No cars here yet.
          {editable && onAdd && (
            <button className="action-btn" onClick={onAdd} style={{ ...quietButton, width: "auto", padding: "10px 18px", color: "#3CABFD" }}>
              + ADD YOUR CAR
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: wide ? "row" : "column", overflowY: wide ? "hidden" : "auto" }}>
          <div style={{ position: "relative", flex: wide ? 1 : "0 0 auto", height: wide ? "auto" : "min(46vh, 380px)", minHeight: 240 }}>
            <ShowroomStage look={look} plate={plate} style={{ position: "absolute", inset: 0 }} />
            {info}
            <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "'Barlow', sans-serif", pointerEvents: "none" }}>Drag to spin</div>
          </div>
          <div style={{ width: wide ? 360 : "auto", padding: "12px 12px 8px", boxSizing: "border-box", overflowY: wide ? "auto" : "visible" }}>{panel}</div>
        </div>
      )}
      {cars.length > 0 && (
        <div style={{ padding: "8px 12px calc(10px + env(safe-area-inset-bottom))", borderTop: "1px solid #1b1f26", background: "#0d0f13" }}>
          <CarCards cars={cars} selectedId={car?.id} onPick={(v) => setSelectedId(v.id)} onAdd={editable ? onAdd : null} />
        </div>
      )}
    </div>
  );
}

// Which of your cars you're driving in a game, remembered per game on this
// phone ("game" = the game's own car). With nothing picked yet, your main car.
export function useGarageCar(user, game) {
  const key = `tunr.${game}.car`;
  const [cars, setCars] = useState([]);
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
      .catch((e) => console.warn("Couldn't load your garage:", e.message));
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
  return { cars, car, pick };
}

// The "your garage" row in a game's menu: the game's own car first (if it
// has one), then yours.
export function GarageRow({ user, garage, first = null, hint = "Add your car in Profile → Garage to drive it here." }) {
  if (!user) return null;
  return (
    <>
      <div style={{ ...label, marginTop: 14 }}>YOUR GARAGE</div>
      {garage.cars.length ? (
        <CarCards
          cars={garage.cars}
          selectedId={garage.car?.id}
          onPick={(v) => garage.pick(v.id)}
          first={first && { ...first, selected: !garage.car, onPick: () => garage.pick("game") }}
        />
      ) : (
        <div style={{ ...muted, fontSize: 12.5 }}>{hint}</div>
      )}
    </>
  );
}

