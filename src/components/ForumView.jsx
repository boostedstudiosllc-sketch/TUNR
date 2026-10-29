import { useEffect, useState } from "react";
import { loadPosts, setForumFollow, updateForum } from "../lib/community.js";
import { PostCard, ReportSheet, Segments } from "./CommunityBits.jsx";
import Sheet, { muted, bigButton, quietButton, field } from "./Sheet.jsx";

// One forum: its posts (pinned first), follow, and a new-post button.
export default function ForumView({ forum, user, onClose, onToast, onNeedAccount, onOpenPost, onNewPost, onChanged }) {
  const [posts, setPosts] = useState(null);
  const [sort, setSort] = useState("hot");
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(Boolean(forum.i_follow));
  const [report, setReport] = useState(false);
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(forum.description || "");

  function refresh() {
    loadPosts({ forumId: forum.id, sort })
      .then(setPosts)
      .catch((e) => setError(e.message));
  }
  useEffect(refresh, [forum.id, sort]);

  async function toggleFollow() {
    if (!user) return onNeedAccount();
    const next = !following;
    setFollowing(next);
    try {
      await setForumFollow(forum.id, user.id, next);
      onChanged();
    } catch (e) {
      setFollowing(!next);
      onToast(e.message);
    }
  }

  return (
    <Sheet onClose={onClose} label={forum.name} zIndex={265}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 38 }}>{forum.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>{forum.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--n-777777)", marginTop: 2 }}>
            {forum.followers} following · {forum.posts} posts · started by @{forum.creator}
          </div>
        </div>
      </div>
      {editing ? (
        <div style={{ marginTop: 10 }}>
          <textarea style={{ ...field, minHeight: 60 }} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button
            onClick={() =>
              updateForum(forum.id, { description: desc.trim() || null })
                .then(() => {
                  setEditing(false);
                  onChanged();
                  onToast("Saved");
                })
                .catch((e) => onToast(e.message))
            }
            style={{ ...quietButton, marginTop: 6, padding: "9px 0" }}
          >
            SAVE DESCRIPTION
          </button>
        </div>
      ) : (
        forum.description && <div style={{ ...muted, marginTop: 8 }}>{forum.description}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={toggleFollow} style={{ ...(following ? quietButton : bigButton), flex: 1, padding: "11px 0" }}>
          {following ? "FOLLOWING ✓" : "+ FOLLOW"}
        </button>
        <button onClick={() => (user ? onNewPost(forum) : onNeedAccount())} style={{ ...bigButton, flex: 1, padding: "11px 0" }}>
          ✏️ NEW POST
        </button>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, justifyContent: "flex-end" }}>
        {forum.i_mod && (
          <button onClick={() => setEditing((v) => !v)} style={linkBtn}>
            🛠 edit description (you moderate this forum)
          </button>
        )}
        {user && !forum.i_mod && (
          <button onClick={() => setReport(true)} style={linkBtn}>
            🚩 report forum
          </button>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Segments options={[["hot", "🔥 HOT"], ["new", "🆕 NEW"], ["top", "⬆ TOP"]]} value={sort} onChange={setSort} />
      </div>

      {error && <div style={{ ...muted, color: "var(--a-ef4444)", marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {posts === null ? (
          <div style={muted}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={{ ...muted, textAlign: "center", padding: "18px 0" }}>No posts yet. Start the first one.</div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} onOpen={() => onOpenPost(p.id)} user={user} onNeedAccount={onNeedAccount} onToast={onToast} />)
        )}
      </div>
      {report && <ReportSheet type="forum" id={forum.id} onClose={() => setReport(false)} onToast={onToast} />}
    </Sheet>
  );
}

const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--n-777777)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" };
