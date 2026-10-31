import { useEffect, useRef, useState } from "react";
import { Avatar } from "./EditProfile.jsx";
import { searchPeople, followPerson } from "../lib/store.js";

// People matching the Discover search ("Search meets, hosts, people…"),
// shown above the meets: TUNR is meet-first, so finding people lives in the
// one search box rather than its own destination. Tap someone to open their
// profile; FOLLOW to see the meets they post under Following.

const openPerson = (id) => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: `person:${id}` } }));

export default function PeopleStrip({ user, query, onFollowed, onToast }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const seq = useRef(0);
  const q = query.trim().replace(/^@/, "");

  useEffect(() => {
    const n = ++seq.current;
    if (!user || q.length < 2) return setRows([]);
    const t = setTimeout(() => {
      searchPeople(q)
        .then((r) => n === seq.current && setRows(r.slice(0, 8)))
        .catch((e) => console.warn(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, user?.id]);

  if (!rows.length) return null;

  const toggle = async (p) => {
    setBusy(p.id);
    try {
      await followPerson(p.id, user.id, p.i_follow);
      setRows((list) => list.map((r) => (r.id === p.id ? { ...r, i_follow: !r.i_follow } : r)));
      onToast?.(p.i_follow ? `Unfollowed @${p.username}` : `Following @${p.username}. Their meets show under Following.`);
      onFollowed?.();
    } catch (e) {
      onToast?.(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={{ padding: "0 20px 12px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, color: "var(--n-666666)", marginBottom: 6 }}>PEOPLE</div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
        {rows.map((p) => (
          <div key={p.id} style={{ flex: "0 0 auto", width: 128, padding: "10px 8px", borderRadius: 12, background: "var(--n-121212)", border: "1px solid var(--n-222222)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <button onClick={() => openPerson(p.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
              <Avatar url={p.avatar_url} name={p.username} size={46} />
              <span style={{ fontSize: 14, fontWeight: 900, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{p.username}</span>
              <span style={{ fontSize: 11, color: "var(--n-777777)", fontFamily: "'Barlow', sans-serif" }}>
                {p.follows_me ? "follows you" : `${p.followers} follower${p.followers === 1 ? "" : "s"}`}
              </span>
            </button>
            <button
              disabled={busy === p.id}
              onClick={() => toggle(p)}
              style={{ width: "100%", padding: "6px 0", borderRadius: 8, fontSize: 12, fontWeight: 800, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", border: p.i_follow ? "1px solid var(--n-2a2a2a)" : "1px solid #0080F0", background: p.i_follow ? "var(--n-161616)" : "#0080F0", color: p.i_follow ? "var(--n-aaaaaa)" : "#fff" }}
            >
              {busy === p.id ? "…" : p.i_follow ? "FOLLOWING" : "FOLLOW"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
