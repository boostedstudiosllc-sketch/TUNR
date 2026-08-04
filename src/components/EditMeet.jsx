import { useState } from "react";
import { VIBES } from "../data/events.js";
import { updateEvent, uploadEventPhoto, track } from "../lib/store.js";
import { compressImage } from "../lib/image.js";

const input = {
  width: "100%",
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#F0F0F0",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const label = {
  fontSize: 10.5,
  color: "#666",
  letterSpacing: 1.4,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export default function EditMeet({ event, user, onClose, onSaved }) {
  const [title, setTitle] = useState(event.title || "");
  const [location, setLocation] = useState(event.location || "");
  const [city, setCity] = useState(event.city || "");
  const [description, setDescription] = useState(event.description || "");
  const [vibe, setVibe] = useState(event.vibe || "JDM");
  const [photoUrl, setPhotoUrl] = useState(event.photoUrl || "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      const url = await uploadEventPhoto(compressed, user.id);
      setPhotoUrl(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateEvent(event.id, {
        title: title.trim() || event.title,
        location: location.trim(),
        city: city.trim(),
        description: description.trim(),
        vibe,
        photoUrl: photoUrl || null,
      });
      track("meet_edited", { eventId: event.id });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        width: "100%",
        maxWidth: 430,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.9)",
        zIndex: 260,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#0F0F0F",
          borderRadius: "16px 16px 0 0",
          border: "1px solid #1E1E1E",
          padding: "22px 20px 40px",
          maxHeight: "92vh",
          overflowY: "auto",
          animation: "slideUp 0.28s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>EDIT YOUR MEET</div>
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              color: "#fff",
              borderRadius: "50%",
              width: 30,
              height: 30,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div>
            <div style={label}>PHOTO</div>
            {photoUrl ? (
              <div style={{ position: "relative", marginBottom: 8 }}>
                <img
                  src={photoUrl}
                  alt=""
                  style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, display: "block" }}
                />
                <button
                  onClick={() => setPhotoUrl("")}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "rgba(0,0,0,0.75)",
                    border: "1px solid #444",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 9px",
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  REMOVE
                </button>
              </div>
            ) : null}
            <label
              style={{
                display: "block",
                textAlign: "center",
                padding: "12px 0",
                background: "#161616",
                border: "1px dashed #2A2A2A",
                borderRadius: 8,
                color: "#888",
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {uploading ? "UPLOADING…" : photoUrl ? "REPLACE PHOTO" : "📷 ADD A PHOTO OR FLYER"}
              <input type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} />
            </label>
          </div>

          <div>
            <div style={label}>TITLE</div>
            <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div style={label}>LOCATION</div>
            <input style={input} value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <div style={label}>CITY</div>
            <input style={input} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <div style={label}>VIBE</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {Object.keys(VIBES).map((v) => (
                <button
                  key={v}
                  onClick={() => setVibe(v)}
                  style={{
                    flex: 1,
                    minWidth: 58,
                    padding: "9px 0",
                    borderRadius: 6,
                    background: "#161616",
                    color: VIBES[v],
                    border: `1.5px solid ${vibe === v ? VIBES[v] : "#2A2A2A"}`,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={label}>DESCRIPTION</div>
            <textarea
              rows={4}
              style={{ ...input, resize: "none" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: "#EF4444", fontFamily: "'Barlow', sans-serif" }}>
            {error}
          </div>
        )}

        <button
          className="action-btn"
          onClick={save}
          disabled={busy || uploading}
          style={{
            width: "100%",
            marginTop: 18,
            padding: "15px 0",
            background: busy || uploading ? "#1E1E1E" : "#FF4500",
            color: busy || uploading ? "#555" : "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 14.5,
            fontWeight: 900,
            letterSpacing: 1.6,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {busy ? "SAVING…" : "SAVE CHANGES"}
        </button>
      </div>
    </div>
  );
}
