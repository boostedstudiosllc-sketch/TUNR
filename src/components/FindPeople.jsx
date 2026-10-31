import { useEffect, useRef, useState } from "react";
import Sheet, { sheetTitle, muted, field, quietButton } from "./Sheet.jsx";
import { Avatar } from "./EditProfile.jsx";
import { searchPeople, followPerson } from "../lib/store.js";

// 🔍 Find people to follow: type a username (or part of one) or a name.
// With nothing typed, the most-followed people on TUNR. Tap someone to open
// their profile. Opened from Followers / Following (Connections.jsx); the
// Discover search also finds people (PeopleStrip.jsx). TUNR is meet-first:
// following someone is how their meets show up under Following.

const openPerson = (id) => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: `person:${id}` } }));

export default function FindPeople({ user, onClose, onToast, zIndex }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const seq = useRef(0);

  // Searches a moment after typing stops; only the newest answer counts.
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      searchPeople(q)
        .then((r) => n === seq.current && (setRows(r), setError("")))
        .catch((e) => n === seq.current && setError(e.message));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = async (person) => {
    setBusy(person.id);
    try {
      await followPerson(person.id, user.id, person.i_follow);
      setRows((list) => list.map((r) => (r.id === person.id ? { ...r, i_follow: !r.i_follow, followers: r.followers + (r.i_follow ? -1 : 1) } : r)));
      onToast?.(person.i_follow ? `Unfollowed @${person.username}` : `Following @${person.username}`);
    } catch (e) {
      onToast?.(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Sheet onClose={onClose} label="Find people" portal zIndex={zIndex}>
      <div style={sheetTitle}>🔍 FIND FRIENDS</div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a username, like g30.rollie"
        autoCapitalize="none"
        autoCorrect="off"
        aria-label="Search people"
        style={{ ...field, marginTop: 10 }}
      />
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: "var(--n-666666)", marginTop: 14 }}>{q.trim() ? "RESULTS" : "POPULAR ON TUNR"}</div>
      {rows === null && <div style={{ ...muted, marginTop: 8 }}>Searching…</div>}
      {rows?.length === 0 && <div style={{ ...muted, marginTop: 8 }}>No one by that name yet. Check the spelling, or invite them to TUNR.</div>}
      {rows?.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--n-1c1c1c)" }}>
          <button onClick={() => openPerson(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
            <Avatar url={p.avatar_url} name={p.username} size={44} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{p.username}</span>
              <span style={{ display: "block", ...muted, fontSize: 12 }}>
                {[p.display_name, `${p.followers} follower${p.followers === 1 ? "" : "s"}`, p.cars ? `${p.cars} car${p.cars === 1 ? "" : "s"}` : null, p.follows_me ? "follows you" : null].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
          <button
            disabled={busy === p.id}
            onClick={() => toggle(p)}
            style={{ ...quietButton, width: "auto", padding: "8px 14px", fontSize: 13, ...(p.i_follow ? {} : { background: "#0080F0", border: "1px solid #0080F0", color: "#fff" }) }}
          >
            {busy === p.id ? "…" : p.i_follow ? "FOLLOWING" : p.follows_me ? "FOLLOW BACK" : "FOLLOW"}
          </button>
        </div>
      ))}
    </Sheet>
  );
}
