import { useState } from "react";
import { claimComeback, claimBy } from "../lib/comeback.js";
import Sheet, { sheetTitle, muted, bigButton, quietButton } from "./Sheet.jsx";

// "Welcome back": the points from a comeback nudge (136), one tap to claim.
export default function ComebackSheet({ offer, onClose, onToast }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function claim() {
    setBusy(true);
    setError("");
    try {
      const earned = await claimComeback(offer.id);
      onToast(`🎁 +${earned} points added. Good to have you back!`);
      onClose(true);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Sheet onClose={() => onClose(false)} label="Welcome back" zIndex={360}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 54 }}>🎁</div>
        <div style={sheetTitle}>WELCOME BACK</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: "var(--a-fbbf24)", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 6 }}>+{offer.points} POINTS</div>
        <div style={{ ...muted, marginTop: 4 }}>A thank-you for coming back. Claim by {claimBy(offer.expires_at)}.</div>
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 12, textAlign: "center" }}>
          {error}
        </div>
      )}
      <button disabled={busy} onClick={claim} style={{ ...bigButton, marginTop: 18, background: "linear-gradient(90deg, #FACC15, #F59E0B)", color: "#111" }}>
        {busy ? "CLAIMING…" : `CLAIM +${offer.points} POINTS`}
      </button>
      <button disabled={busy} onClick={() => onClose(false)} style={{ ...quietButton, marginTop: 8 }}>
        LATER
      </button>
    </Sheet>
  );
}
