import { useEffect, useState } from "react";
import { loadReportQueue, moderateEvent, dismissReport, track } from "../lib/store.js";

const REASON_LABELS = {
  "illegal activity": "🚫 Illegal activity",
  spam: "🗑 Spam",
  "wrong info": "❓ Wrong info",
  duplicate: "⧉ Duplicate",
  other: "Other",
};

// Admin-only. The terms promise reported content is reviewed within 24 hours;
// this is what makes that a daily glance rather than a SQL query.
export default function ModerationQueue({ onToast }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    setRows(await loadReportQueue(false));
    setLoaded(true);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function remove(row) {
    setBusyId(row.id);
    try {
      const result = await moderateEvent(row.event_id, true);
      track("meet_removed", { eventId: row.event_id, reason: row.reason });
      onToast(result === "removed" ? `"${row.event_title}" pulled down` : "Couldn't apply that.");
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function keep(row) {
    setBusyId(row.id);
    try {
      await dismissReport(row.id);
      onToast("Report dismissed — meet stays up");
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusyId(null);
    }
  }

  // Nothing to moderate is the normal state; don't take up space saying so.
  if (!loaded || rows.length === 0) return null;

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #EF4444",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: "#EF4444" }}>
        🚩 Reports · {rows.length} open
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: "#777",
          marginTop: 6,
          lineHeight: 1.6,
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        Your terms promise these are reviewed within 24 hours.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              background: "#0F0F0F",
              border: "1px solid #242424",
              borderRadius: 8,
              padding: "11px 12px",
            }}
          >
            <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 800, letterSpacing: 0.5 }}>
              {REASON_LABELS[row.reason] || row.reason}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 3 }}>{row.event_title}</div>
            <div style={{ fontSize: 11.5, color: "#777", marginTop: 2 }}>
              @{row.event_host} · {row.event_city} · reported by @{row.reporter}
            </div>
            {row.note && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "#AAA",
                  marginTop: 7,
                  padding: "7px 9px",
                  background: "#141414",
                  borderRadius: 6,
                  lineHeight: 1.5,
                  fontFamily: "'Barlow', sans-serif",
                  overflowWrap: "anywhere",
                }}
              >
                “{row.note}”
              </div>
            )}
            {row.event_hidden && (
              <div style={{ fontSize: 11, color: "#FF7A00", marginTop: 6, fontWeight: 700 }}>
                already hidden
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => remove(row)}
                style={pill("#EF4444", "#EF4444")}
              >
                TAKE IT DOWN
              </button>
              <button
                className="action-btn"
                disabled={busyId === row.id}
                onClick={() => keep(row)}
                style={pill("#888", "#333")}
              >
                LEAVE IT UP
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pill(color, border) {
  return {
    flex: 1,
    padding: "9px 0",
    background: "transparent",
    border: `1px solid ${border}`,
    borderRadius: 7,
    color,
    fontSize: 11.5,
    fontWeight: 800,
    letterSpacing: 1.1,
    fontFamily: "'Barlow Condensed', sans-serif",
  };
}
