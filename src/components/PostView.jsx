import { useEffect, useState } from "react";
import {
  loadPost,
  loadComments,
  addForumComment,
  deleteForumComment,
  modRemoveComment,
  updatePost,
  deletePost,
  tagLabel,
  ago,
} from "../lib/community.js";
import { useAccount } from "../lib/account.js";
import { VoteBox, Author, ReportSheet } from "./CommunityBits.jsx";
import Sheet, { muted, field, bigButton } from "./Sheet.jsx";
import DirectionsIcon from "./DirectionsIcon.jsx";

// One post: the post, votes, comments with replies, and the answer that
// solved it. Mods can pin, lock and remove.
export default function PostView({ postId, user, onClose, onToast, onNeedAccount, onOpenPerson, onOpenForum, onChanged }) {
  const [post, setPost] = useState(undefined);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const account = useAccount();

  function refresh() {
    loadPost(postId)
      .then(setPost)
      .catch((e) => setError(e.message));
    loadComments(postId)
      .then(setComments)
      .catch((e) => setError(e.message));
  }
  useEffect(refresh, [postId]);

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      if (message) onToast(message);
      refresh();
      onChanged && onChanged();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!user) return onNeedAccount();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addForumComment(postId, text, user.id, replyTo?.id || null);
      setText("");
      setReplyTo(null);
      refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (post === undefined) {
    return (
      <Sheet onClose={onClose} label="Post" zIndex={275}>
        <div style={muted}>{error || "Loading…"}</div>
      </Sheet>
    );
  }
  if (!post) {
    return (
      <Sheet onClose={onClose} label="Post" zIndex={275}>
        <div style={muted}>This post was removed or isn't available.</div>
      </Sheet>
    );
  }

  const mine = user && post.user_id === user.id;
  const top = comments.filter((c) => !c.parent_id);
  const repliesTo = (id) => comments.filter((c) => c.parent_id === id);
  const solved = comments.find((c) => c.id === post.solved_comment_id);
  const canComment = !post.locked && !post.removed;
  const unconfirmed = user && account && !account.confirmed;

  function Comment({ c, depth = 0 }) {
    const isAnswer = c.id === post.solved_comment_id;
    return (
      <div style={{ marginLeft: depth ? 14 : 0, borderLeft: depth ? "2px solid var(--n-222222)" : "none", paddingLeft: depth ? 10 : 0, marginTop: 10 }}>
        <div style={{ background: isAnswer ? "rgba(16,185,129,0.08)" : "transparent", border: isAnswer ? "1px solid #10B98155" : "none", borderRadius: 8, padding: isAnswer ? "8px 10px" : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Author name={c.username} photographer={c.photographer} photographerVerified={c.photographer_verified} onOpen={() => onOpenPerson(c.user_id)} />
            <span style={{ fontSize: 10.5, color: "var(--n-555555)" }}>{ago(c.created_at)}</span>
            {isAnswer && <span style={{ fontSize: 10.5, color: "#10B981", fontWeight: 800 }}>✅ SOLVED IT</span>}
          </div>
          <div style={{ fontSize: 13.5, color: c.removed ? "var(--n-666666)" : "var(--n-dddddd)", lineHeight: 1.5, marginTop: 2, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "'Barlow', sans-serif", fontStyle: c.removed ? "italic" : "normal" }}>
            {c.removed ? "Removed by a moderator." : c.body}
          </div>
          {!c.removed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
              <VoteBox kind="comment" id={c.id} score={c.score} myVote={c.my_vote} user={user} onNeedAccount={onNeedAccount} onToast={onToast} compact />
              {canComment && depth < 3 && (
                <button onClick={() => (user ? setReplyTo(c) : onNeedAccount())} style={linkBtn}>
                  reply
                </button>
              )}
              {mine && post.tag === "question" && !isAnswer && (
                <button onClick={() => act(() => updatePost(post.id, { solved_comment_id: c.id }), "✅ Marked as the answer")} style={{ ...linkBtn, color: "#10B981" }}>
                  ✅ this solved it
                </button>
              )}
              {user && c.user_id === user.id && (
                <button onClick={() => act(() => deleteForumComment(c.id), "Comment deleted")} style={linkBtn}>
                  delete
                </button>
              )}
              {post.i_mod && c.user_id !== user?.id && (
                <button onClick={() => act(() => modRemoveComment(c.id), "Comment removed")} style={linkBtn}>
                  remove
                </button>
              )}
              {user && c.user_id !== user.id && (
                <button onClick={() => setReport({ type: "comment", id: c.id })} style={linkBtn}>
                  report
                </button>
              )}
            </div>
          )}
        </div>
        {repliesTo(c.id).map((r) => (
          <Comment key={r.id} c={r} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <Sheet onClose={onClose} label="Post" zIndex={275}>
      <button onClick={() => onOpenForum(post.forum_id)} style={{ ...linkBtn, fontSize: 12, color: "var(--n-bbbbbb)", fontWeight: 800 }}>
        {post.forum_icon} {post.forum_name} ›
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <Author name={post.username} photographer={post.photographer} photographerVerified={post.photographer_verified} onOpen={() => onOpenPerson(post.user_id)} />
        <span style={{ fontSize: 11, color: "var(--n-666666)" }}>
          · {ago(post.created_at)}
          {post.edited_at && " · edited"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--n-aaaaaa)", fontWeight: 700 }}>{tagLabel(post.tag)}</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.2, marginTop: 6 }}>
        {post.pinned && "📌 "}
        {post.title}
      </div>
      {(post.locked || post.removed) && (
        <div style={{ ...muted, fontSize: 12, color: "var(--a-e9c27a)", marginTop: 4 }}>
          {post.removed ? "🚫 Removed — only you and the moderators can see it." : "🔒 Locked — no new comments."}
        </div>
      )}
      {post.body && <div style={{ fontSize: 14.5, color: "var(--n-dddddd)", lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "'Barlow', sans-serif" }}>{post.body}</div>}

      {post.photo_urls?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: post.photo_urls.length === 1 ? "1fr" : "1fr 1fr", gap: 6, marginTop: 10 }}>
          {post.photo_urls.map((u) => (
            <button key={u} onClick={() => setPhoto(u)} style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
              <img src={u} alt="" loading="lazy" style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 8, display: "block" }} />
            </button>
          ))}
        </div>
      )}

      {post.tag === "spot" && post.lat != null && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${post.lat},${post.lng}`}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", textAlign: "center", marginTop: 10, padding: "10px 0", borderRadius: 8, background: "var(--n-0f1f0f)", border: "1px solid #10B981", color: "#10B981", fontSize: 13, fontWeight: 800, letterSpacing: 1, textDecoration: "none", fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          <DirectionsIcon size={15} /> DIRECTIONS{post.place ? ` · ${post.place.toUpperCase()}` : ""}
        </a>
      )}

      {solved && (
        <div style={{ marginTop: 10, ...muted, fontSize: 12, color: "#10B981" }}>✅ Solved — the answer is highlighted below.</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <VoteBox kind="post" id={post.id} score={post.score} myVote={post.my_vote} user={user} onNeedAccount={onNeedAccount} onToast={onToast} onChanged={onChanged} />
        <span style={{ fontSize: 12.5, color: "var(--n-888888)" }}>💬 {post.comments}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {post.i_mod && (
            <>
              <button disabled={busy} onClick={() => act(() => updatePost(post.id, { pinned: !post.pinned }), post.pinned ? "Unpinned" : "📌 Pinned")} style={linkBtn}>
                {post.pinned ? "unpin" : "pin"}
              </button>
              <button disabled={busy} onClick={() => act(() => updatePost(post.id, { locked: !post.locked }), post.locked ? "Unlocked" : "🔒 Locked")} style={linkBtn}>
                {post.locked ? "unlock" : "lock"}
              </button>
              {!mine && (
                <button disabled={busy} onClick={() => act(() => updatePost(post.id, { removed: !post.removed }), post.removed ? "Restored" : "Removed")} style={linkBtn}>
                  {post.removed ? "restore" : "remove"}
                </button>
              )}
            </>
          )}
          {mine &&
            (confirmDelete ? (
              <button
                disabled={busy}
                onClick={() =>
                  act(() => deletePost(post.id), "Post deleted").then(() => {
                    onChanged && onChanged();
                    onClose();
                  })
                }
                style={{ ...linkBtn, color: "var(--a-ef4444)" }}
              >
                tap again to delete
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={linkBtn}>
                delete
              </button>
            ))}
          {user && !mine && (
            <button onClick={() => setReport({ type: "post", id: post.id })} style={linkBtn}>
              🚩 report
            </button>
          )}
        </span>
      </div>

      <div style={{ borderTop: "1px solid var(--n-1e1e1e)", marginTop: 12, paddingTop: 4 }}>
        {top.length === 0 ? (
          <div style={{ ...muted, marginTop: 10 }}>{canComment ? "No comments yet. Be the first." : "No comments."}</div>
        ) : (
          top.map((c) => <Comment key={c.id} c={c} />)
        )}
      </div>

      {canComment &&
        (unconfirmed ? (
          <div style={{ ...muted, marginTop: 14, color: "var(--a-c9a46a)" }}>✉️ Confirm your email to comment — tap the link we emailed you.</div>
        ) : (
          <div style={{ marginTop: 14 }}>
            {replyTo && (
              <div style={{ fontSize: 11.5, color: "var(--n-888888)", marginBottom: 4 }}>
                Replying to @{replyTo.username}{" "}
                <button onClick={() => setReplyTo(null)} style={linkBtn}>
                  cancel
                </button>
              </div>
            )}
            <textarea
              style={{ ...field, minHeight: 64 }}
              placeholder={user ? "Add a comment" : "Sign in to comment"}
              maxLength={5000}
              value={text}
              onFocus={() => !user && onNeedAccount()}
              onChange={(e) => setText(e.target.value)}
            />
            <button disabled={busy || !text.trim()} onClick={send} style={{ ...bigButton, marginTop: 8, opacity: text.trim() ? 1 : 0.5 }}>
              {busy ? "…" : replyTo ? "REPLY" : "COMMENT"}
            </button>
          </div>
        ))}

      {report && <ReportSheet type={report.type} id={report.id} onClose={() => setReport(null)} onToast={onToast} />}
      {photo && (
        <div onClick={() => setPhoto(null)} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.95)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, cursor: "zoom-out" }}>
          <img src={photo} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      )}
    </Sheet>
  );
}

const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--n-777777)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'Barlow', sans-serif" };
