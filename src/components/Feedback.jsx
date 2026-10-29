import { useEffect, useState } from "react";
import { TOPICS, topicLabel, sendFeedback, loadMyFeedback, loadFeedbackInbox, answerFeedback } from "../lib/feedback.js";
import { CONTACT_EMAIL } from "../lib/contact.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const COPY = {
  contact: {
    intro: "Questions, problems, or something about a meet? Send it here and we'll reply in the app (and by email if you add one).",
    placeholder: "What's going on? Include the meet name or what you tapped if it's a problem.",
    button: "SEND MESSAGE",
    sent: "Message sent. We'll get back to you here.",
    mine: "YOUR MESSAGES",
  },
  suggestion: {
    intro: "Got an idea that would make TUNR better? We read every one, and the best ideas get built.",
    placeholder: "Your idea, and why it would help.",
    button: "SEND SUGGESTION",
    sent: "💡 Thanks! Suggestion sent.",
    mine: "YOUR SUGGESTIONS",
  },
};

// Contact us or the suggestion box, with what you've sent and our replies.
export function FeedbackPage({ kind, user, onToast }) {
  const copy = COPY[kind];
  const [topic, setTopic] = useState(TOPICS[kind][0].id);
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    loadMyFeedback(user.id, kind)
      .then(setMine)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [user.id, kind]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await sendFeedback({ kind, topic, message, replyEmail });
      onToast(copy.sent);
      setMessage("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={muted}>{copy.intro}</div>
      {kind === "contact" && (
        <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
          In danger or seeing a crime? Call 911 first. You can also email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--a-38bdf8)" }}>{CONTACT_EMAIL}</a>.
        </div>
      )}

      <div style={{ ...label, marginTop: 16 }}>TOPIC</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {TOPICS[kind].map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={topic === t.id}
            onClick={() => setTopic(t.id)}
            style={{
              padding: "8px 12px",
              minHeight: 36,
              borderRadius: 18,
              border: `1px solid ${topic === t.id ? "#0080F0" : "var(--n-2a2a2a)"}`,
              background: topic === t.id ? "rgba(0, 128, 240,0.12)" : "var(--n-141414)",
              color: topic === t.id ? "var(--a-3cabfd)" : "var(--n-bbbbbb)",
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ ...label, marginTop: 14 }}>MESSAGE</div>
      <textarea
        style={{ ...field, minHeight: 120, resize: "vertical", lineHeight: 1.45 }}
        maxLength={2000}
        placeholder={copy.placeholder}
        aria-label="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div style={{ fontSize: 11, color: "var(--n-555555)", textAlign: "right", marginTop: 2 }}>{message.length}/2000</div>

      {kind === "contact" && (
        <>
          <div style={{ ...label, marginTop: 8 }}>REPLY EMAIL (OPTIONAL)</div>
          <input
            style={field}
            type="email"
            autoCapitalize="none"
            maxLength={254}
            placeholder={user.email || "you@example.com"}
            value={replyEmail}
            onChange={(e) => setReplyEmail(e.target.value)}
          />
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>Leave empty to use your account email.</div>
        </>
      )}

      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>{error}</div>}
      <button className="action-btn" disabled={busy} onClick={send} style={{ ...bigButton, marginTop: 14, opacity: busy ? 0.6 : 1 }}>
        {busy ? "SENDING…" : copy.button}
      </button>

      {mine.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 22 }}>{copy.mine}</div>
          {mine.map((f) => (
            <div key={f.id} style={{ background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px", marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--n-a0a0a0)" }}>
                  {topicLabel(kind, f.topic).toUpperCase()} · {when(f.created_at)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: f.status === "answered" ? "#10B981" : f.status === "closed" ? "var(--n-777777)" : "#FACC15" }}>
                  {f.status === "answered" ? "REPLIED" : f.status === "closed" ? "READ" : "SENT"}
                </span>
              </div>
              <div style={{ ...muted, color: "var(--n-dddddd)", marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.message}</div>
              {f.reply && (
                <div style={{ marginTop: 8, borderLeft: "3px solid #0080F0", paddingLeft: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--a-3cabfd)", letterSpacing: 1 }}>TUNR</div>
                  <div style={{ ...muted, color: "var(--n-eeeeee)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.reply}</div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// Admin inbox for both: read, reply (they get an alert), or close.
export function FeedbackInbox({ onToast }) {
  const [status, setStatus] = useState("new");
  const [kind, setKind] = useState(null);
  const [rows, setRows] = useState(null);
  const [replies, setReplies] = useState({});
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setRows(kind === "detailing" ? await loadFeedbackInbox(status, null, "detailing") : await loadFeedbackInbox(status, kind));
      setError("");
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }
  useEffect(() => {
    refresh();
  }, [status, kind]);

  async function answer(row, close = false) {
    const reply = close ? "" : (replies[row.id] || "").trim();
    if (!close && !reply) return onToast("Write a reply first, or tap Close.");
    try {
      await answerFeedback(row.id, reply);
      onToast(close ? "Closed" : "Reply sent");
      refresh();
    } catch (e) {
      onToast(e.message);
    }
  }

  const tab = (active) => ({ ...quietButton, flex: 1, padding: "10px 0", ...(active ? { border: "1px solid #0080F0", color: "var(--a-3cabfd)" } : {}) });

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          ["new", "NEW"],
          ["answered", "REPLIED"],
          ["closed", "CLOSED"],
        ].map(([id, name]) => (
          <button key={id} onClick={() => setStatus(id)} style={tab(status === id)}>
            {name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {[
          [null, "ALL"],
          ["contact", "💬 CONTACT"],
          ["suggestion", "💡 IDEAS"],
          ["detailing", "🧽 DETAIL"],
        ].map(([id, name]) => (
          <button key={name} onClick={() => setKind(id)} style={tab(kind === id)}>
            {name}
          </button>
        ))}
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}
      {rows && rows.length === 0 && <div style={{ ...muted, marginTop: 14 }}>Nothing here.</div>}
      {(rows || []).map((r) => (
        <div key={r.id} style={{ background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px", marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--n-a0a0a0)" }}>
            {r.kind === "suggestion" ? "💡" : r.topic === "detailing" ? "🧽" : "💬"} {topicLabel(r.kind, r.topic).toUpperCase()} · {when(r.created_at)}
          </div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
            @{r.username || "no username"} · {r.reply_email || r.account_email || "no email"}
            {r.device ? ` · ${r.device}` : ""}
          </div>
          {r.phone && (
            <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} style={{ display: "inline-block", marginTop: 4, fontSize: 13, color: "var(--a-38bdf8)", fontFamily: "'Barlow', sans-serif" }}>
              📞 {r.phone}
            </a>
          )}
          <div style={{ ...muted, color: "var(--n-eeeeee)", marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.message}</div>
          {r.reply && <div style={{ ...muted, marginTop: 8, color: "#10B981" }}>Your reply: {r.reply}</div>}
          {status === "new" && (
            <>
              <textarea
                style={{ ...field, minHeight: 70, marginTop: 10 }}
                maxLength={1000}
                placeholder="Reply (they get it as an alert)"
                value={replies[r.id] || ""}
                onChange={(e) => setReplies((m) => ({ ...m, [r.id]: e.target.value }))}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => answer(r)} style={{ ...bigButton, flex: 2, padding: "10px 0" }}>SEND REPLY</button>
                <button onClick={() => answer(r, true)} style={{ ...quietButton, flex: 1, padding: "10px 0" }}>CLOSE</button>
              </div>
              {(r.reply_email || r.account_email) && (
                <a
                  href={`mailto:${r.reply_email || r.account_email}?subject=${encodeURIComponent(r.topic === "detailing" ? "Your Boosted Detailing request" : "About your message to TUNR")}`}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "var(--a-38bdf8)", fontFamily: "'Barlow', sans-serif" }}
                >
                  Or reply by email →
                </a>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
