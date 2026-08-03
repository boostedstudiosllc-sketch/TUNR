import { useEffect, useState } from "react";
import { loadComments, addComment, deleteComment, track } from "../lib/store.js";

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

export default function Comments({ eventId, user, onNeedAccount }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadComments(eventId)
      .then((c) => alive && setComments(c))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId]);

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

  async function remove(id) {
    await deleteComment(id);
    setComments((c) => c.filter((x) => x.id !== id));
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 10 }}>
        COMMENTS {comments.length > 0 && `· ${comments.length}`}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") post();
          }}
          placeholder={user ? "Add a comment…" : "Sign in to comment"}
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
            background: body.trim() && !busy ? "#FF4500" : "#1E1E1E",
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
          POST
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 10, fontFamily: "'Barlow', sans-serif" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12.5, color: "#555", fontFamily: "'Barlow', sans-serif" }}>
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#555", fontFamily: "'Barlow', sans-serif" }}>
          No comments yet — be the first.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#FF4500,#FF7A00)",
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
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#FF7A00" }}>
                    @{c.username}
                  </span>
                  <span style={{ fontSize: 10.5, color: "#555" }}>{timeAgo(c.created_at)}</span>
                  {user && c.user_id === user.id && (
                    <button
                      onClick={() => remove(c.id)}
                      style={{
                        marginLeft: "auto",
                        background: "none",
                        border: "none",
                        color: "#444",
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "'Barlow', sans-serif",
                      }}
                    >
                      delete
                    </button>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
