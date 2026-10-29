import { useEffect, useState } from "react";
import { loadLeaderboard } from "../lib/points.js";
import { Avatar } from "./EditProfile.jsx";
import Sheet, { sheetTitle, muted, quietButton } from "./Sheet.jsx";

const TABS = [
  ["streaks", "🔥 STREAKS"],
  ["month", "📍 THIS MONTH"],
];

// Public: who's on the longest weekly streak, and who checked in most this
// month. Members can hide themselves in Settings → Privacy and safety.
export default function Leaderboard({ onClose, onOpenPerson }) {
  const [kind, setKind] = useState("streaks");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    loadLeaderboard(kind)
      .then((r) => (setRows(r), setError("")))
      .catch((e) => (setError(e.message), setRows([])));
  }, [kind]);

  return (
    <Sheet onClose={onClose} label="Leaderboard" zIndex={298}>
      <div style={sheetTitle}>🏆 LEADERBOARD</div>
      <div style={{ ...muted, marginTop: 4 }}>
        {kind === "streaks"
          ? "Weeks in a row with at least one meet check-in. Miss a whole week and it starts over."
          : "Most meet check-ins since the 1st of this month."}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {TABS.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setKind(id)}
            style={{ ...quietButton, flex: 1, padding: "10px 0", ...(kind === id ? { borderColor: "#0080F0", color: "var(--a-3cabfd)" } : {}) }}
          >
            {name}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>{error}</div>}
      {rows === null && <div style={{ ...muted, marginTop: 14 }}>Loading…</div>}
      {rows && rows.length === 0 && !error && (
        <div style={{ ...muted, marginTop: 14 }}>
          {kind === "streaks" ? "No streaks yet. Check in at a meet this week to start one." : "No check-ins yet this month."}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {(rows || []).map((r) => (
          <button
            key={r.user_id}
            onClick={() => onOpenPerson && onOpenPerson(r.user_id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "10px 8px",
              background: r.is_me ? "rgba(0, 128, 240,0.08)" : "none",
              border: "none",
              borderBottom: "1px solid var(--n-1a1a1a)",
              borderRadius: r.is_me ? 8 : 0,
              color: "var(--n-f0f0f0)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            <span style={{ width: 28, textAlign: "center", fontSize: r.rank <= 3 ? 20 : 15, fontWeight: 900, color: "var(--n-a0a0a0)" }}>
              {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
            </span>
            <Avatar url={r.avatar_url} name={r.username} size={36} ring={Boolean(r.profile_color)} ringColor={r.profile_color || undefined} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15.5, fontWeight: 900, color: r.profile_color || undefined, overflowWrap: "anywhere" }}>
                @{r.username}
                {r.is_me ? " (you)" : ""}
              </span>
              {kind === "streaks" && r.best > r.score && (
                <span style={{ display: "block", ...muted, fontSize: 12 }}>Best: {r.best} weeks</span>
              )}
            </span>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#FACC15", whiteSpace: "nowrap" }}>
              {kind === "streaks" ? `🔥 ${r.score} WK${r.score === 1 ? "" : "S"}` : `${r.score}`}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
