import { useEffect, useRef, useState } from "react";
import {
  loadComments,
  addComment,
  deleteComment,
  blockUser,
  subscribeToComments,
  reactToComment,
  track,
} from "../lib/store.js";
import { Badges } from "./Badge.jsx";
import { useAccount } from "../lib/account.js";
import { ConfirmToChat } from "./ConfirmEmail.jsx";

const commentActionStyle = {
  marginLeft: "auto",
  background: "none",
  border: "none",
  color: "#444",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "'Barlow', sans-serif",
};

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Comments({ eventId, user, onNeedAccount, onToast, onOpenPerson }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  // The meet's chat: loaded once, then kept live while the meet is open.
  useEffect(() => {
    let alive = true;
    const refresh = () => loadComments(eventId).then((c) => alive && setComments(c));
    setLoading(true);
    refresh().finally(() => alive && setLoading(false));
    const unsubscribe = subscribeToComments(eventId, refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [eventId]);

  // Oldest at the top, newest at the bottom, like any chat.
  const messages = [...comments].reverse();
  const newestId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId]);

  async function post() {
    if (!user) {
      onNeedAccount();
      return;
    }
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await addComment(eventId, body, user.id);
      setBody("");
      setComments(await loadComments(eventId));
      track("comment_posted", { eventId });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Optimistic: counts move straight away, then the next refresh confirms.
  async function react(c, value) {
    if (!user) return onNeedAccount();
    const current = c.my_reaction ?? null;
    const next = current === value ? null : value;
    setComments((list) =>
      list.map((x) => {
        if (x.id !== c.id) return x;
        let ups = Number(x.ups) || 0;
        let downs = Number(x.downs) || 0;
        if (current === 1) ups -= 1;
        if (current === -1) downs -= 1;
        if (next === 1) ups += 1;
        if (next === -1) downs += 1;
        return { ...x, ups, downs, my_reaction: next };
      })
    );
    try {
      await reactToComment(c.id, user.id, value, current);
    } catch (e) {
      setError(e.message);
      setComments(await loadComments(eventId));
    }
  }

  async function remove(id) {
    await deleteComment(id);
    setComments((c) => c.filter((x) => x.id !== id));
  }

  async function block(comment) {
    if (!user) return onNeedAccount();
    try {
      await blockUser(user.id, comment.user_id);
      // The database filters blocked authors out of future reads; drop what's
      // already on screen so it takes effect immediately.
      setComments((c) => c.filter((x) => x.user_id !== comment.user_id));
      track("user_blocked", { eventId });
      onToast && onToast(`Blocked @${comment.username}`);
    } catch (e) {
      setError(e.message);
    }
  }

  const account = useAccount();
  const composer = user && account && !account.confirmed ? (
    <ConfirmToChat />
  ) : (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") post();
        }}
        onFocus={() => !user && onNeedAccount()}
        placeholder={user ? "Message the meet…" : "Sign in to join the chat"}
        maxLength={1000}
        style={{
          flex: 1,
          minWidth: 0,
          background: "#161616",
          border: "1px solid #2A2A2A",
          borderRadius: 20,
          padding: "11px 16px",
          color: "#F0F0F0",
          fontSize: 13.5,
          outline: "none",
          fontFamily: "'Barlow', sans-serif",
        }}
      />
      <button
        className="action-btn"
        onClick={post}
        disabled={busy}
        style={{
          padding: "0 16px",
          background: body.trim() && !busy ? "#0080F0" : "#1E1E1E",
          color: body.trim() && !busy ? "#fff" : "#555",
          border: "none",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 1,
          fontFamily: "'Barlow Condensed', sans-serif",
          flexShrink: 0,
        }}
      >
        SEND
      </button>
    </div>
  );

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "#555", letterSpacing: 2 }}>
          MEET CHAT {comments.length > 0 && `· ${comments.length}`}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "#10B981", letterSpacing: 1, fontWeight: 700 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", animation: "pulse 2s infinite" }} />
          LIVE
        </span>
      </div>

      <div
        ref={listRef}
        style={{
          background: "#0B0B0B",
          border: "1px solid #1E1E1E",
          borderRadius: 10,
          padding: "12px 12px",
          maxHeight: 340,
          overflowY: "auto",
        }}
      >
        {loading ? (
          <div style={emptyStyle}>Loading the chat…</div>
        ) : messages.length === 0 ? (
          <div style={emptyStyle}>
            No messages yet. Ask who's pulling up, where to park, or if it's still on.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#0080F0,#3CABFD)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 900,
                    flexShrink: 0,
                    fontFamily: "'Barlow Condensed', sans-serif",
                  }}
                >
                  {(c.username || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <button
                      onClick={() => onOpenPerson && onOpenPerson(c.user_id)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: "#3CABFD",
                        cursor: onOpenPerson ? "pointer" : "default",
                        fontFamily: "inherit",
                      }}
                    >
                      @{c.username}
                    </button>
                    <Badges
                      dayOne={c.day_one}
                      dayOneNumber={c.day_one_number}
                      foundingHost={c.founding_host}
                      photographer={c.photographer}
                      photographerVerified={c.photographer_verified}
                      size={14}
                    />
                    <span style={{ fontSize: 10.5, color: "#555" }}>{timeAgo(c.created_at)}</span>
                    {user && c.user_id === user.id ? (
                      <button onClick={() => remove(c.id)} style={commentActionStyle}>
                        delete
                      </button>
                    ) : (
                      user && (
                        <button onClick={() => block(c)} style={commentActionStyle}>
                          block
                        </button>
                      )
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      color: "#CCC",
                      marginTop: 3,
                      lineHeight: 1.5,
                      fontFamily: "'Barlow', sans-serif",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {c.body}
                  </div>
                  {c.author_restricted && (
                    <div style={{ fontSize: 10.5, color: "#777", marginTop: 3, fontFamily: "'Barlow', sans-serif" }}>
                      Restricted — only you, your co-hosts and them can see this.
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <Thumb
                      icon="👍"
                      count={c.ups}
                      active={c.my_reaction === 1}
                      onClick={() => react(c, 1)}
                      label="Thumbs up"
                    />
                    <Thumb
                      icon="👎"
                      count={c.downs}
                      active={c.my_reaction === -1}
                      onClick={() => react(c, -1)}
                      label="Thumbs down"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {composer}

      {error && (
        <div style={{ fontSize: 12, color: "#EF4444", marginTop: 8, fontFamily: "'Barlow', sans-serif" }}>
          {error}
        </div>
      )}
    </div>
  );
}

const emptyStyle = {
  fontSize: 12.5,
  color: "#555",
  lineHeight: 1.6,
  textAlign: "center",
  padding: "14px 6px",
  fontFamily: "'Barlow', sans-serif",
};

function Thumb({ icon, count, active, onClick, label }) {
  const n = Number(count) || 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}${n ? `, ${n}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 9px",
        borderRadius: 12,
        fontSize: 11.5,
        cursor: "pointer",
        background: active ? "rgba(0, 128, 240,0.14)" : "#141414",
        border: `1px solid ${active ? "#0080F0" : "#262626"}`,
        color: active ? "#3CABFD" : "#888",
        fontFamily: "'Barlow', sans-serif",
        fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 12 }}>{icon}</span>
      {n > 0 && n}
    </button>
  );
}
