import { useState } from "react";
import { submitReport, track } from "../lib/store.js";

const REASONS = ["Illegal activity", "Spam or scam", "Wrong info", "Other"];

export default function ReportMeet({ eventId, user, onNeedAccount }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function start() {
    if (!user) {
      onNeedAccount();
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError("");
    try {
      await submitReport(eventId, reason, note, user.id);
      track("meet_reported", { eventId, reason });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 20, fontSize: 12, color: "#666", fontFamily: "'Barlow', sans-serif" }}>
        ✓ Reported — thanks for the heads up.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={start}
        style={{
          marginTop: 20,
          background: "none",
          border: "none",
          color: "#444",
          fontSize: 11.5,
          letterSpacing: 0.5,
          cursor: "pointer",
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        🚩 Report this meet
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 18,
        background: "#111",
        border: "1px solid #2A2A2A",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Report this meet</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            style={{
              padding: "7px 12px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              background: reason === r ? "#FF4500" : "#1A1A1A",
              color: reason === r ? "#fff" : "#999",
              border: `1px solid ${reason === r ? "#FF4500" : "#2A2A2A"}`,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else we should know? (optional)"
        rows={2}
        maxLength={500}
        style={{
          width: "100%",
          background: "#161616",
          border: "1px solid #2A2A2A",
          borderRadius: 8,
          padding: "9px 11px",
          color: "#F0F0F0",
          fontSize: 12.5,
          outline: "none",
          resize: "none",
          fontFamily: "'Barlow', sans-serif",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <div style={{ fontSize: 11.5, color: "#EF4444", marginTop: 6, fontFamily: "'Barlow', sans-serif" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => setOpen(false)}
          style={{
            flex: 0.4,
            padding: "9px 0",
            background: "#1A1A1A",
            border: "1px solid #2A2A2A",
            borderRadius: 8,
            color: "#888",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          CANCEL
        </button>
        <button
          onClick={submit}
          disabled={!reason || busy}
          style={{
            flex: 1,
            padding: "9px 0",
            background: reason && !busy ? "#FF4500" : "#1E1E1E",
            border: "none",
            borderRadius: 8,
            color: reason && !busy ? "#fff" : "#555",
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: 0.6,
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {busy ? "SUBMITTING…" : "SUBMIT REPORT"}
        </button>
      </div>
    </div>
  );
}
