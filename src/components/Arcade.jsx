import { useEffect, useState } from "react";
import TunrRush from "./TunrRush.jsx";
import ParkUp from "./ParkUp.jsx";
import DriftKing from "./DriftKing.jsx";
import { LEVELS as PARK_LEVELS, loadProgress } from "../lib/parkEngine.js";
import { loadBests as loadDriftBests } from "../lib/f1Engine.js";
import { muted, quietButton } from "./Sheet.jsx";

// Every TUNR game in one place. One game pays points each day (TUNR Rush);
// the rest are free play.
const GAMES = [
  {
    id: "rush",
    icon: "🏁",
    name: (
      <>
        TUNR <span style={{ color: "#0080F0" }}>RUSH</span>
      </>
    ),
    blurb:
      "Drive your own car through traffic. Pick Easy, Medium or Hard for up to +3 points, once a day.",
    badge: {
      text: "⭐ TODAY'S POINTS GAME",
      color: "#FACC15",
      border: "#4A3A00",
    },
  },
  {
    id: "park",
    icon: "🅿️",
    name: (
      <>
        PARK <span style={{ color: "#0080F0" }}>UP</span>
      </>
    ),
    blurb:
      "Wheel, gas and brake. Squeeze into the yellow spot without a scratch.",
    badge: { text: "FREE PLAY", color: "#7FBFF5", border: "#003A75" },
  },
  {
    id: "drift",
    icon: "🏎️",
    name: (
      <>
        DRIFT <span style={{ color: "#0080F0" }}>KING</span>
      </>
    ),
    blurb:
      "Race a Formula car, GT, tuner or muscle car on 22 real circuit layouts. Three rivals, drift the corners, grab Boosted coins for a burst of speed.",
    badge: { text: "FREE PLAY", color: "#7FBFF5", border: "#003A75" },
  },
  {
    id: "egg",
    icon: "🥚",
    name: "EGG HAUL",
    blurb: "Hills, bumps and an egg on your roof. Don't drop it.",
    soon: true,
  },
];

export default function Arcade({ user, onClose, onToast, onNeedAccount }) {
  const [open, setOpen] = useState(null);
  const [parkStars, setParkStars] = useState(0);
  const [driftBest, setDriftBest] = useState(0);

  // Stars come back up to date after a round of Park Up.
  useEffect(() => {
    if (open) return;
    const p = loadProgress();
    setParkStars(PARK_LEVELS.reduce((n, l) => n + (p[l.id] || 0), 0));
    setDriftBest(Object.values(loadDriftBests()).filter((b) => b.place === 1).length);
  }, [open]);

  useEffect(() => {
    if (open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (open === "rush") {
    return (
      <TunrRush
        user={user}
        onClose={() => setOpen(null)}
        onToast={onToast}
        onNeedAccount={onNeedAccount}
      />
    );
  }
  if (open === "park") return <ParkUp onClose={() => setOpen(null)} />;
  if (open === "drift") return <DriftKing onClose={() => setOpen(null)} />;

  return (
    <div
      role="dialog"
      aria-label="TUNR Arcade"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "#0A0A0A",
        color: "#F0F0F0",
        overflowY: "auto",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding:
            "calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
            🎮 TUNR <span style={{ color: "#0080F0" }}>ARCADE</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close the arcade"
            style={{
              ...quietButton,
              width: 44,
              height: 44,
              padding: 0,
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ ...muted, fontSize: 13.5, marginTop: 6 }}>
          One game pays points each day: TUNR Rush. Everything else is just for
          fun.
        </div>

        {GAMES.map((g) => (
          <button
            key={g.id}
            className="action-btn"
            disabled={g.soon}
            onClick={() => setOpen(g.id)}
            style={{
              width: "100%",
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 14px",
              textAlign: "left",
              borderRadius: 14,
              background: g.soon
                ? "#101010"
                : "linear-gradient(135deg, #001830, #141414)",
              border: `1px solid ${g.soon ? "#1E1E1E" : "#003A75"}`,
              color: g.soon ? "#666" : "#F0F0F0",
              cursor: g.soon ? "default" : "pointer",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: 34,
                width: 44,
                textAlign: "center",
                filter: g.soon ? "grayscale(1)" : "none",
              }}
            >
              {g.icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}
                >
                  {g.name}
                </span>
                {g.badge && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 900,
                      letterSpacing: 1,
                      color: g.badge.color,
                      border: `1px solid ${g.badge.border}`,
                      borderRadius: 6,
                      padding: "2px 6px",
                    }}
                  >
                    {g.badge.text}
                  </span>
                )}
                {g.soon && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 900,
                      letterSpacing: 1,
                      color: "#777",
                      border: "1px solid #2A2A2A",
                      borderRadius: 6,
                      padding: "2px 6px",
                    }}
                  >
                    COMING SOON
                  </span>
                )}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  color: g.soon ? "#555" : "#9DB7CF",
                  fontFamily: "'Barlow', sans-serif",
                  marginTop: 3,
                }}
              >
                {g.blurb}
              </span>
              {g.id === "drift" && driftBest > 0 && (
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "#FACC15",
                    marginTop: 4,
                    fontWeight: 800,
                  }}
                >
                  🏆 Won on {driftBest} {driftBest === 1 ? "track" : "tracks"}
                </span>
              )}
              {g.id === "park" && (
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: "#FACC15",
                    marginTop: 4,
                    fontWeight: 800,
                  }}
                >
                  ★ {parkStars} / {PARK_LEVELS.length * 3} stars ·{" "}
                  {PARK_LEVELS.length} levels
                </span>
              )}
            </span>
            {!g.soon && (
              <span
                aria-hidden="true"
                style={{ fontSize: 22, color: "#7FBFF5" }}
              >
                ›
              </span>
            )}
          </button>
        ))}

        <button
          className="action-btn"
          onClick={() => {
            onClose();
            window.dispatchEvent(
              new CustomEvent("tunr:open", {
                detail: { link: "tab:discover" },
              }),
            );
          }}
          style={{
            ...quietButton,
            marginTop: 22,
            padding: "15px 0",
            fontSize: 15,
          }}
        >
          🏠 BACK TO HOME
        </button>
      </div>
    </div>
  );
}
