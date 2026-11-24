import { useState } from "react";
import { cancelMeet } from "../lib/store.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

// Cancelled meets (134_meet_tools.sql): a red banner for everyone, and for
// hosts a CANCEL MEET button (or PUT IT BACK ON). Everyone who RSVP'd going
// or maybe gets an alert either way.

export function CancelledBanner({ event }) {
  if (!event.cancelledAt) return null;
  return (
    <div role="status" style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid #EF4444" }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: "var(--a-f87171)", letterSpacing: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>❌ CANCELLED</div>
      <div style={{ ...muted, color: "var(--n-cccccc)", marginTop: 2 }}>{event.cancelReason || "The host cancelled this meet."}</div>
    </div>
  );
}

export function CancelMeetButton({ event, onChanged, onToast }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelled = Boolean(event.cancelledAt);

  async function run(undo) {
    setBusy(true);
    setError("");
    try {
      await cancelMeet(event.id, reason.trim(), undo);
      setOpen(false);
      onToast?.(undo ? "✅ Back on. Everyone who RSVP'd was told." : "Meet cancelled. Everyone who RSVP'd was told.");
      await onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="action-btn"
        onClick={() => (cancelled ? run(true) : setOpen(true))}
        disabled={busy}
        style={{ width: "100%", marginTop: 10, padding: "11px 0", background: "transparent", border: `1px solid ${cancelled ? "#10B981" : "var(--n-333333)"}`, borderRadius: 10, color: cancelled ? "#10B981" : "var(--a-f87171)", fontSize: 13, fontWeight: 800, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {cancelled ? (busy ? "PUTTING IT BACK ON…" : "✅ PUT THIS MEET BACK ON") : "CANCEL MEET"}
      </button>
      {cancelled && error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 6 }}>
          {error}
        </div>
      )}
      {open && (
        <Sheet onClose={() => !busy && setOpen(false)} label="Cancel meet" zIndex={330}>
          <div style={sheetTitle}>CANCEL THIS MEET?</div>
          <div style={{ ...muted, marginTop: 6 }}>Everyone who said going or maybe gets an alert. The meet stays up with a CANCELLED banner, and you can put it back on.</div>
          <div style={{ ...label, marginTop: 14 }}>WHY? (OPTIONAL)</div>
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Rain, venue said no, moving to next week…" style={field} />
          {error && (
            <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
              {error}
            </div>
          )}
          <button disabled={busy} onClick={() => run(false)} style={{ ...bigButton, marginTop: 16, background: "#EF4444", color: "#fff" }}>
            {busy ? "CANCELLING…" : "CANCEL MEET"}
          </button>
          <button disabled={busy} onClick={() => setOpen(false)} style={{ ...quietButton, marginTop: 8 }}>
            KEEP IT ON
          </button>
        </Sheet>
      )}
    </>
  );
}
