import { useState } from "react";
import { VIBES } from "../data/events.js";

const inputStyle = {
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "13px 15px",
  color: "#F0F0F0",
  fontSize: 14,
  width: "100%",
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 11,
  color: "#888",
  letterSpacing: 1.2,
  fontWeight: 700,
  marginBottom: 5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export default function SubmitMeet({ onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({
    title: "",
    location: "",
    city: "Atlanta, GA",
    vibe: "JDM",
    date: "",
    time: "",
    description: "",
    igLink: "",
  });

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  const canContinue =
    step === 1 ? draft.title.trim().length >= 3 && draft.location.trim().length >= 3 : true;

  function finish() {
    // Combine date + time into a local ISO string when both are provided
    let start = null;
    if (draft.date) {
      start = draft.time ? `${draft.date}T${draft.time}` : `${draft.date}T12:00`;
    }
    onSubmit({
      title: draft.title.trim(),
      location: draft.location.trim(),
      city: draft.city.trim() || "Atlanta, GA",
      vibe: draft.vibe,
      start,
      description: draft.description.trim(),
      igLink: draft.igLink.trim() || null,
    });
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
        zIndex: 200,
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
          padding: "24px 20px 48px",
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>POST A MEET</div>
            <div style={{ fontSize: 12, color: "#555", letterSpacing: 1 }}>STEP {step} OF 2</div>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              color: "#fff",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
          {[1, 2].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: s <= step ? "#FF4500" : "#1E1E1E",
                transition: "background 0.3s ease",
              }}
            />
          ))}
        </div>

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={labelStyle}>MEET TITLE</div>
              <input
                style={inputStyle}
                placeholder="e.g. Midnight Grid Meet"
                value={draft.title}
                onChange={set("title")}
              />
            </div>
            <div>
              <div style={labelStyle}>LOCATION / ADDRESS</div>
              <input
                style={inputStyle}
                placeholder="e.g. Ponce City Market"
                value={draft.location}
                onChange={set("location")}
              />
            </div>
            <div>
              <div style={labelStyle}>CITY</div>
              <input style={inputStyle} value={draft.city} onChange={set("city")} />
            </div>
            <div>
              <div style={labelStyle}>VIBE</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {Object.keys(VIBES).map((v) => (
                  <button
                    key={v}
                    onClick={() => setDraft((d) => ({ ...d, vibe: v }))}
                    style={{
                      flex: 1,
                      minWidth: 58,
                      padding: "9px 0",
                      borderRadius: 6,
                      fontFamily: "'Barlow Condensed', sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.8,
                      background: "#161616",
                      color: VIBES[v],
                      border: `1.5px solid ${draft.vibe === v ? VIBES[v] : "#2A2A2A"}`,
                      cursor: "pointer",
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>DATE</div>
                <input type="date" style={inputStyle} value={draft.date} onChange={set("date")} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>START TIME</div>
                <input type="time" style={inputStyle} value={draft.time} onChange={set("time")} />
              </div>
            </div>
            <div>
              <div style={labelStyle}>DESCRIPTION, RULES, WHAT'S WELCOME</div>
              <textarea
                rows={4}
                style={{ ...inputStyle, resize: "none" }}
                placeholder="Describe the vibe. Note: meets promoting street racing, takeovers, or other illegal activity are removed."
                value={draft.description}
                onChange={set("description")}
              />
            </div>
            <div>
              <div style={labelStyle}>INSTAGRAM POST LINK (OPTIONAL)</div>
              <input
                style={inputStyle}
                placeholder="https://www.instagram.com/p/..."
                value={draft.igLink}
                onChange={set("igLink")}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#555",
                  marginTop: 6,
                  fontFamily: "'Barlow', sans-serif",
                  lineHeight: 1.5,
                }}
              >
                Link the original flyer post for credit. Flyer photo upload with auto-fill is coming
                soon.
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {step > 1 && (
            <button
              className="action-btn"
              onClick={() => setStep(1)}
              style={{
                flex: 0.4,
                padding: "14px 0",
                background: "#1A1A1A",
                border: "1px solid #2A2A2A",
                color: "#888",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              BACK
            </button>
          )}
          <button
            className="action-btn"
            disabled={!canContinue}
            onClick={() => {
              if (!canContinue) return;
              if (step === 1) setStep(2);
              else finish();
            }}
            style={{
              flex: 1,
              padding: "14px 0",
              background: canContinue ? "#FF4500" : "#1E1E1E",
              color: canContinue ? "#fff" : "#444",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 2,
              fontFamily: "'Barlow Condensed', sans-serif",
              boxShadow: canContinue ? "0 4px 20px rgba(255,69,0,0.35)" : "none",
            }}
          >
            {step === 2 ? "🏁 POST MEET" : "CONTINUE →"}
          </button>
        </div>
      </div>
    </div>
  );
}
