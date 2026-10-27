import { useState } from "react";
import { tagLabel, ago, reportContent, vote } from "../lib/community.js";
import { Badges } from "./Badge.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton, Chip } from "./Sheet.jsx";

// 👍 score 👎 — tap again to take a vote back.
export function VoteBox({ kind, id, score, myVote, user, onNeedAccount, onToast, onChanged, compact = false }) {
  const [mine, setMine] = useState(myVote || 0);
  const [total, setTotal] = useState(score || 0);
  async function cast(value) {
    if (!user) return onNeedAccount();
    const next = mine === value ? 0 : value;
    const before = { mine, total };
    setMine(next);
    setTotal(total - mine + next);
    try {
      await vote(kind, id, next);
      onChanged && onChanged();
    } catch (e) {
      setMine(before.mine);
      setTotal(before.total);
      onToast(e.message);
    }
  }
  const btn = (active, color) => ({
    background: "none",
    border: "none",
    padding: compact ? "2px 4px" : "4px 6px",
    cursor: "pointer",
    fontSize: compact ? 13 : 16,
    opacity: active ? 1 : 0.45,
    filter: active ? `drop-shadow(0 0 4px ${color})` : "none",
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} onClick={(e) => e.stopPropagation()}>
      <button aria-label="Upvote" aria-pressed={mine === 1} onClick={() => cast(1)} style={btn(mine === 1, "#0080F0")}>
        👍
      </button>
      <span style={{ minWidth: 18, textAlign: "center", fontSize: compact ? 12 : 14, fontWeight: 800, color: mine === 1 ? "#3CABFD" : mine === -1 ? "#7DA2FF" : "#BBB" }}>
        {total}
      </span>
      <button aria-label="Downvote" aria-pressed={mine === -1} onClick={() => cast(-1)} style={btn(mine === -1, "#7DA2FF")}>
        👎
      </button>
    </span>
  );
}

export function PostCard({ post, onOpen, showForum, user, onNeedAccount, onToast }) {
  return (
    <button
      onClick={onOpen}
      className="meet-card"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "#111",
        border: `1px solid ${post.pinned ? "#003A75" : "#222"}`,
        borderRadius: 10,
        padding: "11px 12px",
        color: "#E6E6E6",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "#777", fontFamily: "'Barlow', sans-serif", flexWrap: "wrap" }}>
        {post.pinned && <span style={{ color: "#3CABFD", fontWeight: 800 }}>📌 PINNED</span>}
        {showForum && (
          <span style={{ color: "#BBB", fontWeight: 700 }}>
            {post.forum_icon} {post.forum_name}
          </span>
        )}
        <span>@{post.username}</span>
        <span>· {ago(post.created_at)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.25 }}>
            {post.solved_comment_id && <span style={{ color: "#10B981" }}>✅ </span>}
            {post.title}
          </div>
          {post.body && (
            <div style={{ ...muted, fontSize: 12.5, marginTop: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {post.body}
            </div>
          )}
        </div>
        {post.photo_urls?.[0] && (
          <img src={post.photo_urls[0]} alt="" loading="lazy" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, fontSize: 11.5, color: "#888" }}>
        <VoteBox kind="post" id={post.id} score={post.score} myVote={post.my_vote} user={user} onNeedAccount={onNeedAccount} onToast={onToast} compact />
        <span>💬 {post.comments}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "#999" }}>{tagLabel(post.tag)}</span>
      </div>
    </button>
  );
}

export function Author({ name, photographer, photographerVerified, onOpen }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen && onOpen();
        }}
        style={{ background: "none", border: "none", padding: 0, color: "#3CABFD", fontWeight: 800, fontSize: 12.5, cursor: onOpen ? "pointer" : "default" }}
      >
        @{name}
      </button>
      <Badges photographer={photographer} photographerVerified={photographerVerified} size={13} />
    </span>
  );
}

const REASONS = ["Spam", "Harassment", "Hate or threats", "Illegal (racing, theft…)", "Selling / scam", "Shares private info", "Other"];

// Reporting a forum, post, comment or club to the TUNR admins.
export function ReportSheet({ type, id, onClose, onToast }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true);
    setError("");
    try {
      await reportContent(type, id, [reason, note.trim()].filter(Boolean).join(": "));
      onToast("🚩 Reported — an admin will take a look");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Sheet onClose={onClose} label="Report" zIndex={310}>
      <div style={sheetTitle}>REPORT</div>
      <div style={{ ...muted, marginTop: 2 }}>What's wrong with it? Only TUNR admins see reports.</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {REASONS.map((r) => (
          <span key={r} style={{ flex: "0 0 auto" }}>
            <Chip active={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          </span>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>MORE DETAIL (OPTIONAL)</div>
      <textarea style={{ ...field, minHeight: 60 }} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      <button disabled={!reason || busy} onClick={send} style={{ ...bigButton, marginTop: 12, opacity: reason ? 1 : 0.4 }}>
        {busy ? "SENDING…" : "SEND REPORT"}
      </button>
    </Sheet>
  );
}

// The little segmented control used across Community.
export function Segments({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", background: "#141414", border: "1px solid #232323", borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map(([id, text]) => (
        <button
          key={id}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            background: value === id ? "#0080F0" : "transparent",
            color: value === id ? "#fff" : "#888",
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: 1,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Logo({ url, fallback, size = 44 }) {
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: size / 4, objectFit: "cover", flexShrink: 0, background: "#1A1A1A" }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 4, background: "#1A1A1A", border: "1px solid #2A2A2A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, flexShrink: 0 }}>
      {fallback}
    </div>
  );
}
