import { useState } from "react";
import { requestConfirmationEmail, shortDate, CLEANUP_WHY } from "../lib/account.js";

// Shown at the top of the app until the account's email is confirmed.
export default function ConfirmEmailBanner({ account, onToast }) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  if (!account || account.confirmed) return null;

  async function resend() {
    setBusy(true);
    try {
      const res = await requestConfirmationEmail();
      onToast(res.confirmed ? "✅ Your email is already confirmed" : `✉️ Sent to ${res.email} — tap the link in it`);
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: "0 20px 12px", background: "#1F1405", border: "1px solid #5A3A0A", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 20 }}>✉️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#F5C26B" }}>Confirm your email</div>
          <div style={{ fontSize: 11.5, color: "#C9A46A", lineHeight: 1.4, fontFamily: "'Barlow', sans-serif" }}>
            Tap the link we emailed you to unlock chat, posting and linkups.
            {account.deleteOn ? ` Unconfirmed accounts are removed on ${shortDate(account.deleteOn)}.` : " Unconfirmed accounts are removed after 7 days."}{" "}
            <button
              onClick={() => setWhy((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, color: "#FF9A3D", fontWeight: 700, cursor: "pointer", font: "inherit" }}
            >
              {why ? "Hide" : "Why?"}
            </button>
          </div>
        </div>
        <button
          disabled={busy}
          onClick={resend}
          style={{ background: "#0080F0", border: "none", color: "#fff", borderRadius: 6, padding: "8px 10px", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, cursor: "pointer", flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {busy ? "…" : "RESEND"}
        </button>
      </div>
      {why && <div style={{ marginTop: 8, fontSize: 11.5, color: "#A8916A", lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>{CLEANUP_WHY}</div>}
    </div>
  );
}

// In place of a chat box for an account that hasn't confirmed yet.
export function ConfirmToChat() {
  return (
    <div style={{ marginTop: 10, background: "#141414", border: "1px dashed #3A2A10", borderRadius: 20, padding: "11px 16px", fontSize: 12.5, color: "#C9A46A", fontFamily: "'Barlow', sans-serif" }}>
      ✉️ Confirm your email to chat — tap the link we emailed you.
    </div>
  );
}
