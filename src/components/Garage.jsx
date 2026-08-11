import { useEffect, useState } from "react";
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

const inputStyle = {
  background: "#0F0F0F",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "11px 13px",
  color: "#F0F0F0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 10.5,
  color: "#777",
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

const EMPTY = { id: null, year: "", make: "", model: "", buildNotes: "", photoUrl: "" };

// Your cars. The first one you add becomes your main car automatically; that's
// the one attached when you RSVP.
export default function Garage({ user, onToast }) {
  const [vehicles, setVehicles] = useState([]);
  const [makes, setMakes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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
        background: "#111",
        border: "1px solid #2A2A2A",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>
          🏎 Your garage {vehicles.length > 0 && `· ${vehicles.length}`}
        </div>
        {!editing && (
          <button
            className="action-btn"
            onClick={() => setEditing({ ...EMPTY })}
            style={{
              padding: "6px 12px",
              background: "rgba(255,69,0,0.12)",
              border: "1px solid #FF4500",
              borderRadius: 6,
              color: "#FF4500",
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

      {vehicles.length === 0 && !editing && (
        <div
          style={{
            fontSize: 12.5,
            color: "#777",
            marginTop: 8,
            lineHeight: 1.6,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          Add your car and it shows up on the meets you RSVP to. Other people see the make and
          model only — never your name.
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
                background: "#0F0F0F",
                border: `1px solid ${v.is_primary ? "#FF4500" : "#242424"}`,
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
                  background: "#161616",
                  border: "1px solid #242424",
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
                      color: "#777",
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
                  {v.is_primary ? (
                    <span style={tagStyle("#FF4500")}>MAIN CAR</span>
                  ) : (
                    <button className="action-btn" onClick={() => makePrimary(v)} style={linkStyle}>
                      make main
                    </button>
                  )}
                  <button
                    className="action-btn"
                    onClick={() =>
                      setEditing({
                        id: v.id,
                        year: v.year || "",
                        make: v.make,
                        model: v.model,
                        buildNotes: v.build_notes || "",
                        photoUrl: v.photo_url || "",
                      })
                    }
                    style={linkStyle}
                  >
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
            borderTop: "1px solid #242424",
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
                onChange={(e) => setEditing((d) => ({ ...d, make: e.target.value }))}
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
            <input
              style={inputStyle}
              placeholder="M3 (F80)"
              value={editing.model}
              onChange={(e) => setEditing((d) => ({ ...d, model: e.target.value }))}
            />
          </div>

          <div>
            <div style={labelStyle}>BUILD NOTES (OPTIONAL)</div>
            <input
              style={inputStyle}
              placeholder="Coilovers, wheels, wrap…"
              value={editing.buildNotes}
              onChange={(e) => setEditing((d) => ({ ...d, buildNotes: e.target.value }))}
            />
          </div>

          <div>
            <div style={labelStyle}>PHOTO (OPTIONAL)</div>
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
                    border: "1px solid #2A2A2A",
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
                    border: "1px solid #444",
                    color: "#fff",
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
                  border: "1px dashed #2A2A2A",
                  background: "#131313",
                  color: "#777",
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
                color: "#FF6B4A",
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
                background: "#1A1A1A",
                border: "1px solid #2A2A2A",
                borderRadius: 8,
                color: "#888",
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
                background: editing.make && editing.model.trim() ? "#FF4500" : "#1A1A1A",
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
    background: "rgba(255,69,0,0.12)",
    border: `1px solid ${color}`,
    fontFamily: "'Barlow Condensed', sans-serif",
  };
}

const linkStyle = {
  background: "none",
  border: "none",
  color: "#666",
  fontSize: 11,
  cursor: "pointer",
  padding: 0,
  fontFamily: "'Barlow', sans-serif",
};
