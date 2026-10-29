import { useEffect, useState } from "react";
import {
  loadInstagramStatus,
  loadInstagramPosts,
  runInstagramImport,
  loadInstagramSources,
  addInstagramSource,
  removeInstagramSource,
} from "../lib/store.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const STATUS = {
  imported: { text: "Listed", color: "#10B981" },
  needs_review: { text: "Needs a look", color: "#FACC15" },
  duplicate: { text: "Already listed", color: "var(--a-3cabfd)" },
  not_a_meet: { text: "Not a meet", color: "var(--n-777777)" },
  past: { text: "Already happened", color: "var(--n-777777)" },
  failed: { text: "Didn't work", color: "var(--a-f87171)" },
};

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

// Admin: meets from Instagram (api/_lib/instagram.js): @tunr.app plus other
// accounts that said yes. Setup steps until it's connected; then the last
// run, a Check now, the accounts watched, and every post looked at with what
// came of it.
export default function InstagramImportAdmin({ onToast, onOpenLink }) {
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState([]);
  const [newName, setNewName] = useState("");

  async function refresh() {
    try {
      const [s, p, w] = await Promise.all([loadInstagramStatus(), loadInstagramPosts(), loadInstagramSources()]);
      setStatus(s);
      setPosts(p);
      setSources(w);
      setError("");
    } catch (e) {
      setError(e.message);
      setStatus((s) => s || {});
      setPosts((p) => p || []);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function checkNow() {
    setBusy(true);
    setError("");
    try {
      const r = await runInstagramImport();
      onToast(
        r.checked === 0
          ? "No posts from the last 3 weeks"
          : `Checked ${r.checked} posts: ${r.imported} listed${r.held ? `, ${r.held} need a look` : ""}${r.left ? `, ${r.left} more next run` : ""}`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function addSource() {
    setError("");
    try {
      const name = await addInstagramSource(newName);
      setNewName("");
      onToast(`Watching @${name}. Its flyers come in on the next check.`);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeSource(username) {
    if (!window.confirm(`Stop importing meets from @${username}? Meets already listed stay.`)) return;
    try {
      await removeInstagramSource(username);
      onToast(`Stopped watching @${username}`);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const last = status?.last_result || {};
  // Other accounts need the Facebook-linked connection.
  const needsFacebook = status && (!status.connected || (status.kind !== "facebook" && sources.length > 0));
  return (
    <div>
      <div style={muted}>
        New meet flyers posted on @tunr.app, and on the accounts you watch below, show up in TUNR by themselves. Every couple of hours the app reads the account's
        new posts, reads each flyer with the same AI as “Post a meet”, and lists the meet. Car photos and recaps are skipped;
        a flyer missing its date, time or place is held here for you.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}

      {needsFacebook && (
        <div style={box}>
          <div style={{ fontWeight: 900 }}>
            {status.connected ? "Switch to the Facebook-linked connection to read other accounts" : "Connect Instagram (one time, about 15 minutes)"}
          </div>
          <ol style={{ ...muted, fontSize: 13, lineHeight: 1.55, paddingLeft: 18, margin: "8px 0 0" }}>
            <li>In the Instagram app on @tunr.app: Settings → Account type and tools → Switch to professional account (Creator or Business). Free.</li>
            <li>Make a free Facebook Page for TUNR (facebook.com/pages/create). On the Page: Settings → Linked accounts → Instagram → Connect, and log in as @tunr.app.</li>
            <li>On developers.facebook.com: My Apps → Create app → “Other” → “Business”. In the app, Settings → Basic: copy the App ID and App Secret.</li>
            <li>In Vercel (tunr project → Settings → Environment Variables), add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET with those.</li>
            <li>
              On developers.facebook.com: Tools → Graph API Explorer. Pick your app, then Get User Access Token, tick instagram_basic,
              pages_show_list, pages_read_engagement, business_management and instagram_manage_insights → Generate, and allow the TUNR Page and @tunr.app.
            </li>
            <li>Copy that token into Vercel as INSTAGRAM_ACCESS_TOKEN (replace the old value if there is one) → Save, then Redeploy. Don't paste it anywhere else.</li>
            <li>Come back here and tap Check now.</li>
          </ol>
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
            TUNR swaps that token for the Page's own, which doesn't expire, so this is one time. If it ever stops working you'll get an alert.
          </div>
        </div>
      )}

      {status?.connected && (
        <div style={box}>
          <div style={{ fontWeight: 900 }}>
            ✓ Connected{status.username ? ` as @${status.username}` : ""}
            {status.kind === "facebook" ? " (Facebook-linked)" : ""}
          </div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
            Last check {when(status.last_run_at)}
            {status.last_run_at && !status.last_error ? ` · ${last.imported || 0} listed, ${last.held || 0} held, ${last.skipped || 0} skipped` : ""}
          </div>
          {status.last_error && <div style={{ ...muted, fontSize: 12.5, marginTop: 4, color: "var(--a-f87171)" }}>Last run failed: {status.last_error}</div>}
        </div>
      )}

      <button className="action-btn" disabled={busy} onClick={checkNow} style={{ ...bigButton, marginTop: 12, opacity: busy ? 0.6 : 1 }}>
        {busy ? "CHECKING… (UP TO A MINUTE)" : "📸 CHECK NOW"}
      </button>

      <div style={{ ...label, marginTop: 20, color: "var(--n-8a8a8a)" }}>OTHER ACCOUNTS TO WATCH</div>
      <div style={{ ...muted, fontSize: 12.5 }}>
        Only add accounts that said it's OK. They need to be public Business or Creator accounts. Their meets credit them and link to their post.
      </div>
      {sources.map((w) => (
        <div key={w.username} style={{ ...box, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900 }}>@{w.username}</div>
            <div style={{ ...muted, fontSize: 12, color: w.last_error ? "var(--a-f87171)" : undefined }}>
              {w.last_error ? w.last_error : w.last_checked_at ? `Read ${when(w.last_checked_at)} · ${w.last_count ?? 0} recent posts` : "Not read yet"}
            </div>
          </div>
          <button className="action-btn" onClick={() => removeSource(w.username)} style={{ ...quietButton, width: "auto", padding: "8px 12px", fontSize: 12.5 }}>
            REMOVE
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <input
          style={{ ...field, flex: 1 }}
          placeholder="@account"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newName.trim() && addSource()}
        />
        <button className="action-btn" disabled={!newName.trim()} onClick={addSource} style={{ ...quietButton, width: "auto", padding: "0 16px", opacity: newName.trim() ? 1 : 0.5 }}>
          ADD
        </button>
      </div>

      <div style={{ ...label, marginTop: 20, color: "var(--n-8a8a8a)" }}>POSTS LOOKED AT</div>
      {posts === null && <div style={muted}>Loading…</div>}
      {posts && posts.length === 0 && <div style={muted}>None yet.</div>}
      {(posts || []).map((p) => (
        <div key={p.media_id} style={{ ...box, display: "flex", gap: 10 }}>
          {p.image_url ? (
            <img src={p.image_url} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 54, height: 54, borderRadius: 8, background: "var(--n-1a1a1a)", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: STATUS[p.status]?.color || "var(--n-aaaaaa)" }}>
                {STATUS[p.status]?.text || p.status}
                {p.account ? <span style={{ color: "var(--n-888888)", fontWeight: 700 }}> · @{p.account}</span> : null}
              </span>
              <span style={{ ...muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{when(p.posted_at)}</span>
            </div>
            {p.reason && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{p.reason}</div>}
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12.5, fontWeight: 800 }}>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "var(--a-3cabfd)", textDecoration: "none" }}>
                  Instagram post ↗
                </a>
              )}
              {p.event_id && (
                <button type="button" onClick={() => onOpenLink && onOpenLink(`meet:${p.event_id}`)} style={{ background: "none", border: "none", padding: 0, color: "var(--a-3cabfd)", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
                  Open the meet
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const box = { marginTop: 10, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px", boxSizing: "border-box" };
