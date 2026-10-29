import { useEffect, useState } from "react";
import { loadSignupStats } from "../lib/store.js";

// Admin-only. Which link people signed up from, so you know whether the
// TikTok bio is pulling its weight. "app" is everyone who signed up inside
// the app rather than through /join.
export default function SignupStats() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    loadSignupStats().then(setRows);
  }, []);

  if (!rows || rows.length === 0) return null;

  const total = rows.reduce((n, r) => n + Number(r.signups), 0);
  const dayOne = rows.reduce((n, r) => n + Number(r.day_one), 0);
  const week = rows.reduce((n, r) => n + Number(r.last_7_days), 0);

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
      <div style={{ fontSize: 15, fontWeight: 800 }}>📈 Sign-ups · {total}</div>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--n-777777)",
          marginTop: 6,
          lineHeight: 1.6,
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        {dayOne} with the Day 1 badge · {week} in the last 7 days
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {rows.map((r) => (
          <div
            key={r.source}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              color: "var(--n-cccccc)",
              fontFamily: "'Barlow', sans-serif",
            }}
          >
            <span>{r.source}</span>
            <span style={{ color: "var(--n-888888)" }}>
              {r.signups}
              {Number(r.last_7_days) > 0 && (
                <span style={{ color: "#10B981" }}> · +{r.last_7_days} this week</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
