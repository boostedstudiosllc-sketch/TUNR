import { useEffect, useRef, useState } from "react";
import BuildSheetForm, { sheetOf } from "./BuildSheetForm.jsx";
import { modelsFor } from "../data/carModels.js";
import {
  loadCarMakes,
  loadVehicles,
  saveVehicle,
  deleteVehicle,
  setPrimaryVehicle,
  uploadVehiclePhoto,
  track,
} from "../lib/store.js";
import { compressImage } from "../lib/image.js";
import { loadMyInvites, openInvites } from "../lib/invites.js";
import StickerSheet from "./StickerSheet.jsx";
import { ShowroomStage, GarageShowroom, OtherColor, repairLink } from "./Showroom.jsx";
import { saveGameLook } from "../lib/rush.js";
import { lookOf, lookColumns, GAME_COLORS, COLOR_NAMES, guessBody, BODY_NAMES } from "../lib/rushEngine.js";

const inputStyle = {
  background: "var(--n-0f0f0f)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 8,
  padding: "11px 13px",
  color: "var(--n-f0f0f0)",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 10.5,
  color: "var(--n-777777)",
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const EMPTY = { id: null, year: "", make: "", model: "", buildNotes: "", photoUrl: "", paint: "", sheet: sheetOf(null) };

// Your cars. The first one you add becomes your main car automatically; that's
// the one attached when you RSVP.
export default function Garage({ user, onToast }) {
  const [vehicles, setVehicles] = useState([]);
  const [makes, setMakes] = useState([]);
  const [editing, setEditing] = useState(null);
  // The car whose "Scan my build" sticker sheet is open.
  const [sticker, setSticker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // The full-screen 3D garage (the car it opens on), and style saves waiting
  // for the taps to settle.
  const [showroom, setShowroom] = useState(null);
  const saveTimers = useRef({});
  const saving = useRef({});

  async function refresh() {
    setVehicles(await loadVehicles(user.id));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadVehicles(user.id), loadCarMakes()]).then(([v, m]) => {
      if (cancelled) return;
      setVehicles(v);
      setMakes(m);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      const url = await uploadVehiclePhoto(compressed, user.id);
      setEditing((d) => ({ ...d, photoUrl: url }));
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // A second car unlocks with one invited friend (the database enforces it;
  // this just says so up front instead of after filling in the form).
  async function startAdding() {
    if (vehicles.length === 1) {
      try {
        const inv = await loadMyInvites();
        if (inv && !inv.unlocked?.cars) {
          openInvites("Invite 1 friend to add more cars to your garage.");
          return;
        }
      } catch (e) {
        console.warn(e.message);
      }
    }
    setEditing({ ...EMPTY });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveVehicle(editing, user.id);
      track(editing.id ? "vehicle_edited" : "vehicle_added", { make: editing.make });
      setEditing(null);
      await refresh();
      onToast(editing.id ? "Car updated" : "Car added to your garage");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(vehicle) {
    await deleteVehicle(vehicle.id);
    await refresh();
    onToast("Car removed");
  }

  // Restyling in the 3D garage: shown at once, saved once you stop tapping.
  function restyle(vehicle, look) {
    setVehicles((list) =>
      list.map((v) =>
        v.id === vehicle.id ? { ...v, ...lookColumns(look) } : v
      )
    );
    clearTimeout(saveTimers.current[vehicle.id]);
    saveTimers.current[vehicle.id] = setTimeout(() => {
      // One save at a time per car, in order, so an older one never lands last.
      saving.current[vehicle.id] = (saving.current[vehicle.id] || Promise.resolve())
        .then(() => saveGameLook(vehicle.id, look))
        .catch((e) => onToast(e.message));
    }, 600);
  }

  function editDetails(v) {
    setEditing({
      id: v.id,
      year: v.year || "",
      make: v.make,
      model: v.model,
      buildNotes: v.build_notes || "",
      photoUrl: v.photo_url || "",
      paint: v.game_color || "",
      sheet: sheetOf(v),
    });
  }

  async function makePrimary(vehicle) {
    try {
      await setPrimaryVehicle(vehicle.id);
      await refresh();
      onToast(`${vehicle.make} ${vehicle.model} is now your main car`);
    } catch (e) {
      onToast(e.message);
    }
  }

  return (
    <div
      style={{
        background: "var(--n-111111)",
        border: "1px solid var(--n-2a2a2a)",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      {sticker && (
        <StickerSheet vehicle={sticker} onClose={() => setSticker(null)} onToast={onToast} onChanged={refresh} />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          🏎 Your garage {vehicles.length > 0 && `· ${vehicles.length}`}
        </div>
        {!editing && (
          <button
            className="action-btn"
            onClick={startAdding}
            style={{
              padding: "6px 12px",
              background: "rgba(0, 128, 240,0.12)",
              border: "1px solid #0080F0",
              borderRadius: 6,
              color: "#0080F0",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            + ADD CAR
          </button>
        )}
      </div>

      {showroom && (
        <GarageShowroom
          title="YOUR GARAGE"
          cars={vehicles}
          startId={showroom}
          plate="TUNR"
          editable
          onClose={() => setShowroom(null)}
          onLook={restyle}
          onEdit={(v) => (setShowroom(null), editDetails(v))}
          onRefresh={refresh}
          onSticker={(v) => (setShowroom(null), setSticker(v))}
          onMakeMain={makePrimary}
          onAdd={() => (setShowroom(null), startAdding())}
          onDrive={(v, game = "rush") => {
            setShowroom(null);
            window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: `play:${game}:${v.id}` } }));
          }}
        />
      )}

      {/* Your main car in the 3D garage; tap to open the whole garage. */}
      {vehicles.length > 0 && !editing && (
        <button
          className="action-btn"
          onClick={() => setShowroom((vehicles.find((v) => v.is_primary) || vehicles[0]).id)}
          aria-label="Open your garage in 3D"
          style={{ position: "relative", display: "block", width: "100%", height: 190, marginTop: 12, padding: 0, border: "1px solid var(--n-242424)", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: "var(--n-0c0e12)" }}
        >
          <ShowroomStage look={lookOf(vehicles.find((v) => v.is_primary) || vehicles[0])} plate="TUNR" interactive={false} style={{ position: "absolute", inset: 0 }} />
          <span style={{ position: "absolute", left: 0, bottom: 0, right: 0, padding: "26px 10px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontFamily: "'Barlow Condensed', sans-serif", color: "var(--n-ffffff)", background: "linear-gradient(180deg, rgba(var(--base),0), rgba(10,12,16,0.78))", pointerEvents: "none" }}>
            <span style={{ fontSize: 17, fontWeight: 900, textAlign: "left", textTransform: "uppercase" }}>
              {(vehicles.find((v) => v.is_primary) || vehicles[0]).make} {(vehicles.find((v) => v.is_primary) || vehicles[0]).model}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, background: "#FACC15", color: "#111", borderRadius: 6, padding: "5px 10px", textShadow: "none" }}>OPEN GARAGE ›</span>
          </span>
        </button>
      )}

      {vehicles.length === 0 && !editing && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--n-777777)",
            marginTop: 8,
            lineHeight: 1.6,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          Add your car and it shows up on the meets you RSVP to. Other people see the make and
          model only, never your name, unless you turn on a car's “Scan my build” page.
        </div>
      )}

      {vehicles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                gap: 11,
                background: "var(--n-0f0f0f)",
                border: `1px solid ${v.is_primary ? "#0080F0" : "var(--n-242424)"}`,
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 6,
                  flexShrink: 0,
                  overflow: "hidden",
                  background: "var(--n-161616)",
                  border: "1px solid var(--n-242424)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                {v.photo_url ? (
                  <img
                    src={v.photo_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  "🚗"
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>
                  {v.year ? `${v.year} ` : ""}
                  {v.make} {v.model}
                </div>
                {v.build_notes && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--n-777777)",
                      marginTop: 2,
                      fontFamily: "'Barlow', sans-serif",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {v.build_notes}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                  <button className="action-btn" onClick={() => setSticker(v)} style={{ ...linkStyle, color: "var(--a-3cabfd)" }}>
                    🔳 QR sticker{v.public_page ? " · page on" : ""}
                  </button>
                  {v.is_primary ? (
                    <span style={tagStyle("#0080F0")}>MAIN CAR</span>
                  ) : (
                    <button className="action-btn" onClick={() => makePrimary(v)} style={linkStyle}>
                      make main
                    </button>
                  )}
                  <button className="action-btn" onClick={() => setShowroom(v.id)} style={{ ...linkStyle, color: "#FACC15" }}>
                    style in 3D
                  </button>
                  <a href={repairLink(v)} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, color: "#34D399", textDecoration: "none" }}>
                    🔧 how-to videos
                  </a>
                  <button className="action-btn" onClick={() => editDetails(v)} style={linkStyle}>
                    edit
                  </button>
                  <button className="action-btn" onClick={() => remove(v)} style={linkStyle}>
                    remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--n-242424)",
            display: "flex",
            flexDirection: "column",
            gap: 11,
          }}
        >
          <div style={{ display: "flex", gap: 9 }}>
            <div style={{ width: 92 }}>
              <div style={labelStyle}>YEAR</div>
              <input
                style={inputStyle}
                inputMode="numeric"
                placeholder="2018"
                value={editing.year}
                onChange={(e) =>
                  setEditing((d) => ({ ...d, year: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) }))
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>MAKE</div>
              <select
                style={{ ...inputStyle, appearance: "none" }}
                value={editing.make}
                // A new make clears a model that isn't one of its own.
                onChange={(e) => setEditing((d) => ({ ...d, make: e.target.value, model: modelsFor(e.target.value).includes(d.model) ? d.model : "" }))}
              >
                <option value="">Pick one…</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div style={labelStyle}>MODEL</div>
            {modelsFor(editing.make).length ? (
              // Picked from the list for the make (src/data/carModels.js), never typed.
              <select style={{ ...inputStyle, appearance: "none" }} value={editing.model} onChange={(e) => setEditing((d) => ({ ...d, model: e.target.value }))}>
                <option value="">Pick the model…</option>
                {editing.model && !modelsFor(editing.make).includes(editing.model) && <option value={editing.model}>{editing.model} (as saved)</option>}
                {modelsFor(editing.make).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : editing.make ? (
              // "Other": a make we don't have a list for.
              <input style={inputStyle} placeholder="Model" maxLength={40} value={editing.model} onChange={(e) => setEditing((d) => ({ ...d, model: e.target.value }))} />
            ) : (
              <select style={{ ...inputStyle, appearance: "none", opacity: 0.5 }} disabled value="">
                <option value="">Pick the make first</option>
              </select>
            )}
          </div>

          {editing.make && editing.model.trim() && (
            <div style={{ fontSize: 11.5, color: "var(--n-7d8796)", marginTop: -4, fontFamily: "'Barlow', sans-serif" }}>
              In 3D it's a {BODY_NAMES[guessBody(editing.make, [editing.model, editing.sheet.trim].filter(Boolean).join(" "))].toLowerCase()}. Adding the chassis code (like G30) in Trim below helps. Change it any time in Style.
            </div>
          )}

          <div>
            <div style={labelStyle}>PAINT {editing.paint ? `· ${COLOR_NAMES[editing.paint] || "CUSTOM"}` : ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GAME_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Paint ${COLOR_NAMES[c]}`}
                  title={COLOR_NAMES[c]}
                  aria-pressed={editing.paint === c}
                  onClick={() => setEditing((d) => ({ ...d, paint: c }))}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: editing.paint === c ? "3px solid var(--n-ffffff)" : "1px solid var(--n-333333)", cursor: "pointer" }}
                />
              ))}
              <OtherColor color={editing.paint || GAME_COLORS[0]} onChange={(c) => setEditing((d) => ({ ...d, paint: c }))} />
            </div>
          </div>

          <BuildSheetForm
            sheet={editing.sheet}
            onChange={(sheet) => setEditing((d) => ({ ...d, sheet }))}
            story={editing.buildNotes}
            onStory={(buildNotes) => setEditing((d) => ({ ...d, buildNotes }))}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
          />

          <div>
            <div style={labelStyle}>COVER PHOTO</div>
            <div style={{ fontSize: 11.5, color: "var(--n-7d8796)", marginBottom: 6, fontFamily: "'Barlow', sans-serif" }}>Add more (up to 24) in your 3D garage → PHOTOS.</div>
            {editing.photoUrl ? (
              <div style={{ position: "relative" }}>
                <img
                  src={editing.photoUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: 130,
                    objectFit: "cover",
                    borderRadius: 8,
                    display: "block",
                    border: "1px solid var(--n-2a2a2a)",
                  }}
                />
                <button
                  className="action-btn"
                  onClick={() => setEditing((d) => ({ ...d, photoUrl: "" }))}
                  style={{
                    position: "absolute",
                    top: 7,
                    right: 7,
                    background: "rgba(0,0,0,0.75)",
                    border: "1px solid var(--n-444444)",
                    color: "var(--n-ffffff)",
                    borderRadius: "50%",
                    width: 26,
                    height: 26,
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 64,
                  borderRadius: 8,
                  border: "1px dashed var(--n-2a2a2a)",
                  background: "var(--n-131313)",
                  color: "var(--n-777777)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                {uploading ? "UPLOADING…" : "📷 ADD A PHOTO"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={pickPhoto}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "var(--a-ff6b4a)",
                fontFamily: "'Barlow', sans-serif",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 9 }}>
            <button
              className="action-btn"
              onClick={() => {
                setEditing(null);
                setError("");
              }}
              style={{
                flex: 0.5,
                padding: "11px 0",
                background: "var(--n-1a1a1a)",
                border: "1px solid var(--n-2a2a2a)",
                borderRadius: 8,
                color: "var(--n-888888)",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.2,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              CANCEL
            </button>
            <button
              className="action-btn"
              onClick={save}
              disabled={busy || !editing.make || !editing.model.trim()}
              style={{
                flex: 1,
                padding: "11px 0",
                background: editing.make && editing.model.trim() ? "#0080F0" : "var(--n-1a1a1a)",
                color: editing.make && editing.model.trim() ? "#fff" : "#555",
                border: "none",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: 1.4,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {busy ? "SAVING…" : editing.id ? "SAVE CAR" : "ADD CAR"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function tagStyle(color) {
  return {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 1,
    padding: "3px 7px",
    borderRadius: 3,
    color,
    background: "rgba(0, 128, 240,0.12)",
    border: `1px solid ${color}`,
    fontFamily: "'Barlow Condensed', sans-serif",
  };
}

const linkStyle = {
  background: "none",
  border: "none",
  color: "var(--n-666666)",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  fontFamily: "'Barlow', sans-serif",
};
