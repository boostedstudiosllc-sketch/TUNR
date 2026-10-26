import { useEffect, useState } from "react";
import { loadInstagramStatus, loadInstagramPosts, runInstagramImport } from "../lib/store.js";
import { muted, label, bigButton } from "./Sheet.jsx";

const STATUS = {
  imported: { text: "Listed", color: "#10B981" },
  needs_review: { text: "Needs a look", color: "#FACC15" },
  duplicate: { text: "Already listed", color: "#3CABFD" },
  not_a_meet: { text: "Not a meet", color: "#777" },
  past: { text: "Already happened", color: "#777" },
  failed: { text: "Didn't work", color: "#F87171" },
};

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

// Admin: meets from @tunr.app's Instagram (api/_lib/instagram.js). Setup
// steps until it's connected; then the last run, a Check now, and every
// post looked at with what came of it.
export default function InstagramImportAdmin({ onToast, onOpenLink }) {
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [s, p] = await Promise.all([loadInstagramStatus(), loadInstagramPosts()]);
      setStatus(s);
      setPosts(p);
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

  const last = status?.last_result || {};
  return (
    <div>
      <div style={muted}>
        New meet flyers posted on @tunr.app show up in TUNR by themselves. Every couple of hours the app reads the account's
        new posts, reads each flyer with the same AI as “Post a meet”, and lists the meet. Car photos and recaps are skipped;
        a flyer missing its date, time or place is held here for you.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      {status && !status.connected && (
        <div style={box}>
          <div style={{ fontWeight: 900 }}>Connect @tunr.app (one time, about 10 minutes)</div>
          <ol style={{ ...muted, fontSize: 13, lineHeight: 1.55, paddingLeft: 18, margin: "8px 0 0" }}>
            <li>In the Instagram app on @tunr.app: Settings → Account type and tools → Switch to professional account (Creator or Business). Free.</li>
            <li>On developers.facebook.com, sign in, then My Apps → Create app → “Other” → “Business”.</li>
            <li>In the app, add the Instagram product → “API setup with Instagram login” → Generate access tokens → Add account, and log in as @tunr.app.</li>
            <li>Copy the token it shows. Don't paste it anywhere else.</li>
            <li>In Vercel: the tunr project → Settings → Environment Variables → add INSTAGRAM_ACCESS_TOKEN with that token → Save, then Redeploy.</li>
            <li>Come back here and tap Check now.</li>
          </ol>
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>After that the token renews itself every week. You only redo this if Instagram cuts it off (you'd get an alert).</div>
        </div>
      )}

      {status?.connected && (
        <div style={box}>
          <div style={{ fontWeight: 900 }}>✓ Connected{status.username ? ` as @${status.username}` : ""}</div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
            Last check {when(status.last_run_at)}
            {status.last_run_at && !status.last_error ? ` · ${last.imported || 0} listed, ${last.held || 0} held, ${last.skipped || 0} skipped` : ""}
          </div>
          {status.last_error && <div style={{ ...muted, fontSize: 12.5, marginTop: 4, color: "#F87171" }}>Last run failed: {status.last_error}</div>}
        </div>
      )}

      <button className="action-btn" disabled={busy} onClick={checkNow} style={{ ...bigButton, marginTop: 12, opacity: busy ? 0.6 : 1 }}>
        {busy ? "CHECKING… (UP TO A MINUTE)" : "📸 CHECK NOW"}
      </button>

      <div style={{ ...label, marginTop: 20, color: "#8A8A8A" }}>POSTS LOOKED AT</div>
      {posts === null && <div style={muted}>Loading…</div>}
      {posts && posts.length === 0 && <div style={muted}>None yet.</div>}
      {(posts || []).map((p) => (
        <div key={p.media_id} style={{ ...box, display: "flex", gap: 10 }}>
          {p.image_url ? (
            <img src={p.image_url} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 54, height: 54, borderRadius: 8, background: "#1A1A1A", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: STATUS[p.status]?.color || "#AAA" }}>{STATUS[p.status]?.text || p.status}</span>
              <span style={{ ...muted, fontSize: 11.5, whiteSpace: "nowrap" }}>{when(p.posted_at)}</span>
            </div>
            {p.reason && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{p.reason}</div>}
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12.5, fontWeight: 800 }}>
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" style={{ color: "#3CABFD", textDecoration: "none" }}>
                  Instagram post ↗
                </a>
              )}
              {p.event_id && (
                <button type="button" onClick={() => onOpenLink && onOpenLink(`meet:${p.event_id}`)} style={{ background: "none", border: "none", padding: 0, color: "#3CABFD", fontWeight: 800, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
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

const box = { marginTop: 10, background: "#121212", border: "1px solid #222", borderRadius: 12, padding: "12px 14px", boxSizing: "border-box" };
