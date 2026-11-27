import { useEffect, useRef, useState } from "react";
import { askHelp } from "../lib/helpChat.js";
import { HELP_NOTE } from "../lib/helpRules.js";
import { HELP_SUGGESTIONS } from "../data/helpGuide.js";
import Sheet, { sheetTitle, muted, field, bigButton } from "./Sheet.jsx";

// Help: ask anything about the app; an AI answers from TUNR's help guide.
export default function HelpChat({ onClose, onContact }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi! I'm TUNR Help. Ask me anything about the app: meets, linkups, parts, points, your account…" }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy, error]);

  async function ask(q) {
    const question = String(q ?? text).trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user", text: question }];
    setMessages(next);
    setText("");
    setError("");
    setBusy(true);
    try {
      // The greeting isn't part of the conversation the AI sees.
      const { answer } = await askHelp(next.slice(1));
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const bubble = (mine) => ({
    alignSelf: mine ? "flex-end" : "flex-start",
    maxWidth: "86%",
    padding: "9px 12px",
    borderRadius: 14,
    borderBottomRightRadius: mine ? 4 : 14,
    borderBottomLeftRadius: mine ? 14 : 4,
    background: mine ? "#0080F0" : "var(--n-1a1a1a)",
    color: mine ? "#fff" : "var(--n-eeeeee)",
    border: mine ? "none" : "1px solid var(--n-2a2a2a)",
    fontFamily: "'Barlow', sans-serif",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  });

  return (
    <Sheet onClose={onClose} label="Help" zIndex={350}>
      <div style={sheetTitle}>❓ HELP</div>
      <div style={{ ...muted, fontSize: 12 }}>{HELP_NOTE}</div>
      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12, maxHeight: "48vh", overflowY: "auto", paddingBottom: 4 }}>
        {messages.map((m, i) => (
          <div key={i} style={bubble(m.role === "user")}>
            {m.text}
          </div>
        ))}
        {busy && <div style={{ ...bubble(false), color: "var(--n-888888)" }}>Thinking…</div>}
        {error && (
          <div role="alert" style={{ ...muted, color: "var(--a-f87171)" }}>
            {error}
          </div>
        )}
        <div ref={end} />
      </div>
      {messages.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {HELP_SUGGESTIONS.map((q) => (
            <button key={q} onClick={() => ask(q)} style={{ padding: "7px 11px", borderRadius: 999, border: "1px solid var(--n-2a2a2a)", background: "var(--n-161616)", color: "var(--n-dddddd)", fontSize: 12.5, fontFamily: "'Barlow', sans-serif", cursor: "pointer" }}>
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        style={{ display: "flex", gap: 8, marginTop: 12 }}
      >
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Ask about TUNR…" aria-label="Your question" style={{ ...field, flex: 1 }} />
        <button type="submit" disabled={busy || !text.trim()} style={{ ...bigButton, width: "auto", padding: "0 16px", opacity: busy || !text.trim() ? 0.5 : 1 }}>
          ASK
        </button>
      </form>
      {onContact && (
        <button onClick={onContact} style={{ background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, cursor: "pointer", marginTop: 10, padding: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>
          STILL STUCK? CONTACT US →
        </button>
      )}
    </Sheet>
  );
}
