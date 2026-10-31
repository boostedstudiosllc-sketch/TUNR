import { useState } from "react";
import { DRIVETRAINS, TRANSMISSIONS, STAGES, MOD_CATS, MOD_CAT, addMod } from "../lib/buildSheet.js";

// The build sheet part of the add / edit car form (Garage.jsx): nickname,
// trim, the numbers, stage, every mod by category, what's next and the story.
// sheet: { nickname, trim, ownedSince, engine, drivetrain, transmission,
//   horsepower, torque, stage, mods: [{ cat, name }], nextUp, story }

export function sheetOf(v) {
  return {
    nickname: v?.nickname || "",
    trim: v?.trim || "",
    ownedSince: v?.owned_since || "",
    engine: v?.engine || "",
    drivetrain: v?.drivetrain || "",
    transmission: v?.transmission || "",
    horsepower: v?.horsepower || "",
    torque: v?.torque || "",
    stage: v?.stage || "",
    mods: Array.isArray(v?.mods) ? v.mods : [],
    nextUp: v?.next_up || "",
  };
}

export default function BuildSheetForm({ sheet, onChange, story, onStory, labelStyle, inputStyle }) {
  const [cat, setCat] = useState("engine");
  const [mod, setMod] = useState("");
  const set = (patch) => onChange({ ...sheet, ...patch });
  const digits = (x, n) => x.replace(/[^0-9]/g, "").slice(0, n);
  const chip = (on) => ({
    padding: "8px 10px",
    borderRadius: 999,
    border: `1px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`,
    background: on ? "rgba(0,128,240,0.18)" : "var(--n-131313)",
    color: on ? "var(--a-3cabfd)" : "var(--n-aaaaaa)",
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: 0.6,
    cursor: "pointer",
    fontFamily: "'Barlow Condensed', sans-serif",
  });
  const add = () => {
    const next = addMod(sheet.mods, cat, mod);
    if (next !== sheet.mods) set({ mods: next });
    setMod("");
  };

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2, color: "#FACC15", marginTop: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>🏁 THE BUILD SHEET</div>
      <div style={{ fontSize: 12, color: "var(--n-7d8796)", marginTop: -6, fontFamily: "'Barlow', sans-serif" }}>All optional. It's what people see when they open your car.</div>

      <div style={{ display: "flex", gap: 9 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>NICKNAME</div>
          <input style={inputStyle} maxLength={40} placeholder="Midnight Rollie" value={sheet.nickname} onChange={(e) => set({ nickname: e.target.value })} />
        </div>
        <div style={{ width: 96 }}>
          <div style={labelStyle}>OWNED SINCE</div>
          <input style={inputStyle} inputMode="numeric" placeholder="2022" value={sheet.ownedSince} onChange={(e) => set({ ownedSince: digits(e.target.value, 4) })} />
        </div>
      </div>
      <div>
        <div style={labelStyle}>TRIM / CHASSIS CODE</div>
        <input style={inputStyle} maxLength={40} placeholder="M Sport, xDrive, G30" value={sheet.trim} onChange={(e) => set({ trim: e.target.value })} />
      </div>
      <div>
        <div style={labelStyle}>ENGINE</div>
        <input style={inputStyle} maxLength={60} placeholder="3.0L turbo inline-6 (B58)" value={sheet.engine} onChange={(e) => set({ engine: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>HORSEPOWER</div>
          <input style={inputStyle} inputMode="numeric" placeholder="420" value={sheet.horsepower} onChange={(e) => set({ horsepower: digits(e.target.value, 4) })} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>TORQUE (LB-FT)</div>
          <input style={inputStyle} inputMode="numeric" placeholder="450" value={sheet.torque} onChange={(e) => set({ torque: digits(e.target.value, 4) })} />
        </div>
      </div>
      <div>
        <div style={labelStyle}>DRIVETRAIN</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DRIVETRAINS.map((d) => (
            <button key={d} type="button" aria-pressed={sheet.drivetrain === d} onClick={() => set({ drivetrain: sheet.drivetrain === d ? "" : d })} style={chip(sheet.drivetrain === d)}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={labelStyle}>TRANSMISSION</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TRANSMISSIONS.map((t) => (
            <button key={t} type="button" aria-pressed={sheet.transmission === t} onClick={() => set({ transmission: sheet.transmission === t ? "" : t })} style={chip(sheet.transmission === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={labelStyle}>BUILD STAGE</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STAGES.map(([id, name]) => (
            <button key={id} type="button" aria-pressed={sheet.stage === id} onClick={() => set({ stage: sheet.stage === id ? "" : id })} style={chip(sheet.stage === id)}>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={labelStyle}>MODS · {sheet.mods.length}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <select style={{ ...inputStyle, width: 130, flex: "0 0 auto", appearance: "none" }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Mod category">
            {MOD_CATS.map(([id, icon, name]) => (
              <option key={id} value={id}>
                {icon} {name}
              </option>
            ))}
          </select>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            maxLength={80}
            placeholder="KW V3 coilovers"
            value={mod}
            onChange={(e) => setMod(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          />
          <button type="button" onClick={add} disabled={!mod.trim()} style={{ ...chip(Boolean(mod.trim())), borderRadius: 8 }}>
            ADD
          </button>
        </div>
        {sheet.mods.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {sheet.mods.map((m, i) => (
              <span key={`${m.cat}:${m.name}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 10px", borderRadius: 999, background: "var(--n-161616)", border: "1px solid var(--n-2a2a2a)", fontSize: 13, fontFamily: "'Barlow', sans-serif" }}>
                {MOD_CAT[m.cat]?.icon} {m.name}
                <button type="button" aria-label={`Remove ${m.name}`} onClick={() => set({ mods: sheet.mods.filter((_, k) => k !== i) })} style={{ background: "none", border: "none", color: "var(--n-888888)", cursor: "pointer", fontSize: 13 }}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={labelStyle}>THE STORY</div>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} maxLength={500} placeholder="How you found it, what you've done, what it means to you…" value={story} onChange={(e) => onStory(e.target.value)} />
      </div>
      <div>
        <div style={labelStyle}>NEXT UP</div>
        <input style={inputStyle} maxLength={300} placeholder="Big turbo, then a track day" value={sheet.nextUp} onChange={(e) => set({ nextUp: e.target.value })} />
      </div>
    </>
  );
}
