import { useState } from "react";
import { loadProfile, saveProfile } from "../lib/store.js";

const inputStyle = {
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#F0F0F0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

export default function ProfileTab({ events, rsvps, onShowTerms }) {
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(!profile.username);
  const [draft, setDraft] = useState(profile);

  const goingCount = events.filter((e) => rsvps[e.id] === "going").length;
  const savedCount = events.filter((e) => rsvps[e.id] === "interested").length;
  const postedCount = events.filter((e) => e.submittedByUser).length;

  const initial = (profile.username || "T")[0].toUpperCase();

  function save() {
    const next = {
      username: draft.username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
      city: draft.city.trim() || "Atlanta, GA",
    };
    setProfile(saveProfile(next));
    setEditing(false);
  }

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div
        style={{
          background: "linear-gradient(180deg, #1A0800 0%, #0A0A0A 100%)",
          padding: "20px 20px 24px",
          borderBottom: "1px solid #1E1E1E",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #FF4500, #FF7A00)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 900,
              border: "3px solid #FF4500",
              boxShadow: "0 0 20px rgba(255,69,0,0.4)",
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  style={inputStyle}
                  placeholder="username"
                  value={draft.username}
                  onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
                />
                <input
                  style={inputStyle}
                  placeholder="City, State"
                  value={draft.city}
                  onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
                />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.5 }}>
                  {(profile.username || "your_handle").toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: "#FF4500", marginTop: 2 }}>
                  @{profile.username || "your_handle"}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>📍 {profile.city}</div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
          {[
            [goingCount, "GOING"],
            [savedCount, "SAVED"],
            [postedCount, "POSTED"],
          ].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#FF4500" }}>{n}</div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5 }}>{l}</div>
            </div>
          ))}
        </div>

        <button
          className="action-btn"
          onClick={() => (editing ? save() : (setDraft(profile), setEditing(true)))}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "11px 0",
            background: editing ? "#FF4500" : "#161616",
            color: editing ? "#fff" : "#888",
            border: editing ? "none" : "1px solid #2A2A2A",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1.5,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {editing ? "SAVE PROFILE" : "EDIT PROFILE"}
        </button>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            background: "#111",
            border: "1px dashed #2A2A2A",
            borderRadius: 10,
            padding: "16px 18px",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: "#888" }}>
            📸 Instagram garage — coming soon
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "#555",
              marginTop: 6,
              lineHeight: 1.6,
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            Accounts, follows, and your build gallery arrive with sign-in. Your RSVPs and posted
            meets are saved on this device in the meantime.
          </div>
        </div>

        <button
          className="action-btn"
          onClick={onShowTerms}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px 0",
            background: "#111",
            border: "1px solid #2A2A2A",
            borderRadius: 10,
            color: "#666",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.5,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          📄 TERMS OF SERVICE
        </button>
      </div>
    </div>
  );
}
