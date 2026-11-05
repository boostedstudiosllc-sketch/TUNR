import { useState } from "react";
import { claimPitStop } from "../lib/pitStop.js";
import { weekDots, bonusLine } from "../lib/pitStopRules.js";

// The Daily Pit Stop card: seven days in a row, a point a day, a bonus on
// the 7th (117_daily_pit_stop.sql). Used in the pop-up once a day
// (PitStopPopup) and as the last setup screen (SetupTour.jsx). Always dark.

export function PitStopCard({ status, onClaimed, onError }) {
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(null); // { points, streak, bonus }
  const done = Boolean(won) || Boolean(status?.today_done);
  const streak = won ? won.streak : status?.streak || 0;
  const dots = weekDots(streak, done);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await claimPitStop();
      setWon({ points: r.points ?? 0, streak: r.streak, bonus: Boolean(r.bonus) });
      onClaimed?.(r);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", color: "#F0F0F0" }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2.5, color: "#FACC15" }}>🏁 DAILY PIT STOP</div>
      <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 8 }}>{done ? `🔥 ${streak}-DAY STREAK` : streak ? `🔥 ${streak} DAYS IN A ROW` : "DAY 1"}</div>
      <div style={{ fontSize: 15, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", marginTop: 6 }}>
        {won ? `+${won.points} ⭐ in your balance${won.bonus ? ". 7-day bonus!" : ""}` : done ? "Done for today. Come back tomorrow to keep it going." : `Open TUNR every day: +${status?.daily_points ?? 1} ⭐ a day.`}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 18 }}>
        {dots.map((d) => (
          <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: d.bonus ? 18 : 15,
                fontWeight: 900,
                // A tyre: dark ring, lit up once done.
                background: d.done ? (d.bonus ? "#FACC15" : "#0080F0") : "#1A1D22",
                color: d.done ? "#0B0D10" : "#5E6773",
                border: `3px solid ${d.today ? "#FACC15" : d.done ? "transparent" : "#2A2F38"}`,
                boxShadow: d.today && !d.done ? "0 0 0 3px rgba(250,204,21,0.25)" : "none",
              }}
            >
              {d.done ? "✓" : d.bonus ? "🎁" : ""}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: d.today ? "#FACC15" : "#5E6773" }}>{d.today ? "TODAY" : `DAY ${d.day}`}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", marginTop: 10, minHeight: 18 }}>{bonusLine(streak, done, status?.streak_bonus ?? 5)}</div>

      {!done && (
        <button
          className="action-btn"
          onClick={claim}
          disabled={busy}
          style={{ width: "100%", marginTop: 16, padding: "15px 0", borderRadius: 14, border: "none", background: "#FACC15", color: "#111", fontSize: 19, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 5px 0 #A16207" }}
        >
          {busy ? "…" : `CLAIM +${(status?.daily_points ?? 1) + (dots.find((d) => d.today)?.bonus ? status?.streak_bonus ?? 5 : 0)} ⭐`}
        </button>
      )}
    </div>
  );
}

// The once-a-day pop-up.
export default function PitStopPopup({ status, onClose, onToast }) {
  const [claimed, setClaimed] = useState(false);
  return (
    <div role="dialog" aria-label="Daily Pit Stop" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "linear-gradient(180deg, #14181F, #0B0D10)", border: "1px solid #2A2F38", borderRadius: 20, padding: "22px 18px 18px" }}>
        <PitStopCard status={status} onClaimed={() => setClaimed(true)} onError={onToast} />
        <button onClick={onClose} style={{ width: "100%", marginTop: 10, padding: "11px 0", borderRadius: 12, border: "none", background: "transparent", color: "#8A94A3", fontSize: 15, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {claimed || status?.today_done ? "LET'S RIDE" : "LATER"}
        </button>
      </div>
    </div>
  );
}
