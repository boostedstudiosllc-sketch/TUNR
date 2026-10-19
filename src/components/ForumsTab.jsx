import { useEffect, useMemo, useState } from "react";
import { loadForums, loadPosts, createForum } from "../lib/community.js";
import { useAccount } from "../lib/account.js";
import { PostCard, Segments } from "./CommunityBits.jsx";
import ForumView from "./ForumView.jsx";
import PostView from "./PostView.jsx";
import PostForm from "./PostForm.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const ICONS = ["💬", "🔧", "📸", "🏗️", "🏁", "🚗", "🛞", "🎨", "🔊", "🧼", "🏎️", "⚙️"];

// Forums: a feed of posts from the forums you follow (or everything), the
// list of forums, and starting your own.
export default function ForumsTab({ user, open, onOpened, onNeedAccount, onToast, onOpenPerson }) {
  const [forums, setForums] = useState(null);
  const [posts, setPosts] = useState(null);
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("hot");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [forumId, setForumId] = useState(null);
  const [postId, setPostId] = useState(null);
  const [newPostIn, setNewPostIn] = useState(undefined); // undefined = closed, null = pick a forum
  const [creating, setCreating] = useState(false);
  const account = useAccount();
  const unconfirmed = Boolean(user && account && !account.confirmed);

  const followed = useMemo(() => (forums || []).filter((f) => f.i_follow).map((f) => f.id), [forums]);

  function refreshForums() {
    return loadForums()
      .then(setForums)
      .catch((e) => setError(e.message));
  }
  function refreshPosts() {
    loadPosts({ sort, search, forumIds: scope === "following" ? followed : null })
      .then(setPosts)
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    refreshForums();
  }, [user?.id]);
  useEffect(() => {
    const t = setTimeout(refreshPosts, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [sort, scope, search, followed.join(",")]);

  // Opened from an alert or another screen.
  useEffect(() => {
    if (!open) return;
    if (open.type === "post") setPostId(open.id);
    if (open.type === "forum") setForumId(open.id);
    onOpened();
  }, [open]);

  const forum = forumId && (forums || []).find((f) => f.id === forumId);
  const newPost = () => {
    if (!user) return onNeedAccount();
    if (unconfirmed) return onToast("Confirm your email first — tap the link we emailed you.");
    setNewPostIn(null);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={newPost} style={{ ...bigButton, flex: 1.3, padding: "12px 0" }}>
          ✏️ NEW POST
        </button>
        <button
          onClick={() => (!user ? onNeedAccount() : unconfirmed ? onToast("Confirm your email first — tap the link we emailed you.") : setCreating(true))}
          style={{ ...quietButton, flex: 1, padding: "12px 0" }}
        >
          + NEW FORUM
        </button>
      </div>

      <input
        style={{ ...field, marginTop: 10 }}
        placeholder="🔍 Search posts — e.g. “coolant leak”, “photo spot”"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <Segments options={[["all", "ALL"], ["following", "FOLLOWING"]]} value={scope} onChange={(v) => (v === "following" && !user ? onNeedAccount() : setScope(v))} />
        </div>
        <div style={{ flex: 1.3 }}>
          <Segments options={[["hot", "HOT"], ["new", "NEW"], ["top", "TOP"]]} value={sort} onChange={setSort} />
        </div>
      </div>

      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 10 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {posts === null ? (
          <div style={muted}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={{ ...muted, textAlign: "center", padding: "16px 0" }}>
            {search ? "Nothing matches that search." : scope === "following" ? "Follow a few forums below and their posts show up here." : "No posts yet — start one."}
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} showForum onOpen={() => setPostId(p.id)} user={user} onNeedAccount={onNeedAccount} onToast={onToast} />)
        )}
      </div>

      <div style={{ ...label, marginTop: 22 }}>FORUMS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(forums || []).map((f) => (
          <button
            key={f.id}
            onClick={() => setForumId(f.id)}
            style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", background: "#111", border: "1px solid #222", borderRadius: 10, padding: "10px 12px", color: "#E6E6E6", cursor: "pointer" }}
          >
            <span style={{ fontSize: 26 }}>{f.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>{f.name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Barlow', sans-serif" }}>
                {f.description || `${f.posts} posts`}
              </span>
            </span>
            <span style={{ fontSize: 10.5, color: f.i_follow ? "#FF7A00" : "#666", fontWeight: 800, letterSpacing: 0.6, whiteSpace: "nowrap" }}>
              {f.i_follow ? "FOLLOWING" : `${f.followers} ★`}
            </span>
          </button>
        ))}
        {forums && forums.length === 0 && <div style={muted}>No forums yet — start the first.</div>}
      </div>

      {forum && (
        <ForumView
          forum={forum}
          user={user}
          onClose={() => setForumId(null)}
          onToast={onToast}
          onNeedAccount={onNeedAccount}
          onOpenPost={setPostId}
          onNewPost={(f) => (unconfirmed ? onToast("Confirm your email first — tap the link we emailed you.") : setNewPostIn(f))}
          onChanged={refreshForums}
        />
      )}
      {postId && (
        <PostView
          postId={postId}
          user={user}
          onClose={() => setPostId(null)}
          onToast={onToast}
          onNeedAccount={onNeedAccount}
          onOpenPerson={onOpenPerson}
          onOpenForum={(id) => {
            setPostId(null);
            setForumId(id);
          }}
          onChanged={refreshPosts}
        />
      )}
      {newPostIn !== undefined && (
        <PostForm
          forum={newPostIn}
          forums={forums || []}
          user={user}
          onClose={() => setNewPostIn(undefined)}
          onToast={onToast}
          onPosted={(id) => {
            setNewPostIn(undefined);
            refreshPosts();
            refreshForums();
            setPostId(id);
          }}
        />
      )}
      {creating && (
        <ForumForm
          user={user}
          onClose={() => setCreating(false)}
          onToast={onToast}
          onCreated={(id) => {
            setCreating(false);
            refreshForums().then(() => setForumId(id));
          }}
        />
      )}
    </div>
  );
}

function ForumForm({ user, onClose, onToast, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("💬");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (name.trim().length < 3) return setError("Name it (at least 3 characters).");
    setBusy(true);
    try {
      const id = await createForum({ name, description, icon }, user.id);
      onToast(`${icon} ${name.trim()} is live — you moderate it`);
      onCreated(id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} label="New forum" zIndex={285}>
      <div style={sheetTitle}>START A FORUM</div>
      <div style={{ ...muted, marginTop: 2 }}>A place for one topic — a model, a scene, a kind of help. You'll moderate it.</div>
      <div style={{ ...label, marginTop: 14 }}>NAME</div>
      <input style={field} maxLength={40} placeholder="e.g. G30 5 Series Fix-It" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ ...label, marginTop: 14 }}>ICON</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ICONS.map((i) => (
          <button
            key={i}
            onClick={() => setIcon(i)}
            aria-pressed={icon === i}
            style={{ width: 42, height: 42, fontSize: 21, borderRadius: 10, cursor: "pointer", background: icon === i ? "rgba(255,69,0,0.16)" : "#161616", border: `1px solid ${icon === i ? "#FF4500" : "#2A2A2A"}` }}
          >
            {i}
          </button>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>WHAT IT'S FOR</div>
      <textarea style={{ ...field, minHeight: 70 }} maxLength={300} placeholder="Who it's for and what to post." value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 10 }}>{error}</div>}
      <button disabled={busy} onClick={submit} style={{ ...bigButton, marginTop: 14 }}>
        {busy ? "CREATING…" : "CREATE FORUM"}
      </button>
    </Sheet>
  );
}
