import { useState } from "react";
import { signInWithEmail } from "../lib/store.js";

export default function SignInForm({ compact = false, onError }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const addr = email.trim();
    if (!addr.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await signInWithEmail(addr);
      setSent(true);
    } catch (e) {
      const msg =
        e?.message?.includes("rate")
          ? "Too many sign-in emails for now. Try again in a few minutes."
          : "Couldn't send the link. Try again in a moment.";
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div
        style={{
          background: "rgba(16,185,129,0.1)",
          border: "1px solid #10B981",
          borderRadius: 10,
          padding: "14px 16px",
          fontSize: 13,
          color: "#10B981",
          fontFamily: "'Barlow', sans-serif",
          lineHeight: 1.55,
        }}
      >
        ✓ Check your email — we sent a sign-in link to {email.trim()}. Tap it and you're in.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: 10,
            padding: compact ? "12px 14px" : "14px 16px",
            color: "#F0F0F0",
            fontSize: 14,
            outline: "none",
            fontFamily: "'Barlow', sans-serif",
          }}
        />
        <button
          className="action-btn"
          onClick={send}
          disabled={sending}
          style={{
            padding: "0 18px",
            background: sending ? "#1E1E1E" : "#FF4500",
            color: sending ? "#555" : "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: 1.2,
            fontFamily: "'Barlow Condensed', sans-serif",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {sending ? "SENDING…" : "SEND LINK"}
        </button>
      </div>
      {error && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#EF4444",
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "#555",
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        No password — we email you a one-tap link.
      </div>
    </div>
  );
}
