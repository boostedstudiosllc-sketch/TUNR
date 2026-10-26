import { useState } from "react";
import { submitReport, track } from "../lib/store.js";

// The first three are discrepancies: three people reporting the same one puts
// a warning on the meet until an admin deals with it (see events_public).
const REASONS = [
  { id: "Wrong date or time", ask: "What's the right date and time?" },
  { id: "Wrong location", ask: "What's the right address?" },
  { id: "Cancelled or postponed", ask: "Where did you hear? (optional)" },
  { id: "Duplicate", ask: "Which listing is it a copy of? (optional)" },
  { id: "Illegal or unsafe", ask: null },
  { id: "Spam or scam", ask: null },
  { id: "Other", ask: null },
];

export default function ReportMeet({ eventId, user, onNeedAccount }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [suggested, setSuggested] = useState("");
  const chosen = REASONS.find((r) => r.id === reason);
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
      await submitReport(eventId, reason, note, user.id, chosen?.ask ? suggested : "");
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
        ✓ Sent to the TUNR team — thanks for the heads up. If others report the same thing, the
        meet shows a warning straight away.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={start}
        style={{
          display: "block",
          width: "100%",
          marginTop: 18,
          padding: "11px 0",
          background: "#121212",
          border: "1px solid #262626",
          borderRadius: 8,
          color: "#999",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.6,
          cursor: "pointer",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        ⚠ SOMETHING WRONG WITH THIS MEET? TELL US
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
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>What's wrong?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {REASONS.map(({ id: r }) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            style={{
              padding: "7px 12px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              background: reason === r ? "#0080F0" : "#1A1A1A",
              color: reason === r ? "#fff" : "#999",
              border: `1px solid ${reason === r ? "#0080F0" : "#2A2A2A"}`,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {chosen?.ask && (
        <input
          value={suggested}
          onChange={(e) => setSuggested(e.target.value)}
          placeholder={chosen.ask}
          maxLength={200}
          style={{
            width: "100%",
            marginBottom: 8,
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: 8,
            padding: "9px 11px",
            color: "#F0F0F0",
            fontSize: 12.5,
            outline: "none",
            fontFamily: "'Barlow', sans-serif",
            boxSizing: "border-box",
          }}
        />
      )}
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
            background: reason && !busy ? "#0080F0" : "#1E1E1E",
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
          {busy ? "SENDING…" : "SEND TO TUNR"}
        </button>
      </div>
    </div>
  );
}
