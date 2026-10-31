import { STAGE, STAGES, modsByCategory, specs, sheetComplete, repairLink } from "../lib/buildSheet.js";

// A car's build, as everyone sees it in the 3D garage (BUILD tab) and on its
// "Scan my build" page: the nickname, the headline numbers, how far the
// build has gone, every mod by category, the story and what's next.
// Fill-in is in the add-a-car form (Garage.jsx); rules in buildSheet.js.

const glass = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14 };
const head = { fontSize: 11, fontWeight: 900, letterSpacing: 1.8, color: "#8A94A3" };
const body = { fontSize: 13.5, color: "#C9D1DC", fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 };

export default function BuildSheetView({ car, photoCount = 0, editable = false, onEdit }) {
  if (!car) return null;
  const nums = specs(car);
  const stage = car.stage ? STAGE[car.stage] : null;
  const groups = modsByCategory(car.mods);
  const modCount = groups.reduce((n, g) => n + g.mods.length, 0);
  const done = sheetComplete({ ...car, photoCount });
  const empty = !nums.length && !stage && !modCount && !car.build_notes && !car.engine;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "'Barlow Condensed', sans-serif", color: "#F0F0F0" }}>
      {(car.nickname || car.trim || car.owned_since) && (
        <div>
          {car.nickname && <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1 }}>“{car.nickname}”</div>}
          <div style={{ ...body, fontSize: 12.5, color: "#9AA4B2", marginTop: 3 }}>
            {[car.trim, car.owned_since && `Owned since ${car.owned_since}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      )}

      {nums.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${nums.length}, 1fr)`, gap: 8 }}>
          {nums.map((s) => (
            <div key={s.label} style={{ ...glass, padding: "10px 6px", textAlign: "center" }}>
              <div style={{ fontSize: s.value.length > 5 ? 17 : 24, fontWeight: 900, lineHeight: 1, color: s.label === "HP" ? "#FACC15" : "#F0F0F0" }}>{s.value}</div>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {car.engine && (
        <div style={{ ...glass, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>⚙️</span>
          <div>
            <div style={head}>ENGINE</div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{car.engine}</div>
          </div>
        </div>
      )}

      {stage && (
        <div style={{ ...glass, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={head}>BUILD STAGE</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#FACC15" }}>{stage.name.toUpperCase()}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginTop: 6, overflow: "hidden" }}>
            <div style={{ width: `${stage.meter * 100}%`, height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #0080F0, #FACC15 70%, #F43F5E)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: "#5E6773" }}>
            {STAGES.map(([id, name]) => (
              <span key={id} style={{ color: id === car.stage ? "#FACC15" : undefined }}>{name.toUpperCase()}</span>
            ))}
          </div>
          <div style={{ ...body, fontSize: 12, marginTop: 4, color: "#9AA4B2" }}>{stage.blurb}</div>
        </div>
      )}

      {modCount > 0 && (
        <div>
          <div style={{ ...head, marginBottom: 6 }}>
            THE MODS · {modCount}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map((g) => (
              <div key={g.cat} style={{ ...glass, padding: "9px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.8, color: "#C9D1DC" }}>
                  {g.icon} {g.name.toUpperCase()}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {g.mods.map((m) => (
                    <span key={m} style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Barlow', sans-serif", padding: "4px 9px", borderRadius: 999, background: "rgba(0,128,240,0.16)", border: "1px solid rgba(60,171,253,0.35)", color: "#DCEBFF" }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {car.build_notes && (
        <div>
          <div style={{ ...head, marginBottom: 4 }}>THE STORY</div>
          <div style={{ ...body, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{car.build_notes}</div>
        </div>
      )}

      {car.next_up && (
        <div style={{ ...glass, padding: "10px 12px", borderColor: "rgba(250,204,21,0.35)" }}>
          <div style={{ ...head, color: "#FACC15" }}>NEXT UP</div>
          <div style={{ ...body, marginTop: 2 }}>{car.next_up}</div>
        </div>
      )}

      {empty && <div style={{ ...body, color: "#7D8796" }}>{editable ? "Your build sheet is empty. Tap EDIT BUILD to add the power, the mods and the story." : "No build details yet."}</div>}

      {editable && done < 1 && !empty && (
        <div style={{ ...body, fontSize: 12, color: "#9AA4B2" }}>
          Build sheet {Math.round(done * 100)}% filled in. {done < 0.5 ? "Add your mods and photos so people see the whole build." : "Nearly there."}
        </div>
      )}

      <a href={repairLink(car)} target="_blank" rel="noopener noreferrer" style={{ ...glass, display: "block", padding: "10px 0", fontSize: 13, fontWeight: 900, letterSpacing: 0.8, textAlign: "center", textDecoration: "none", color: "#34D399" }}>
        🔧 HOW-TO VIDEOS FOR THIS {[car.year, car.make, car.model].filter(Boolean).join(" ").toUpperCase()}
      </a>
      {editable && onEdit && (
        <button className="action-btn" onClick={() => onEdit(car)} style={{ ...glass, padding: "11px 0", fontSize: 14, fontWeight: 900, letterSpacing: 1, color: "#F0F0F0", cursor: "pointer", fontFamily: "inherit" }}>
          ✏️ EDIT BUILD
        </button>
      )}
    </div>
  );
}
