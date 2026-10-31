import { useEffect, useState } from "react";
import { muted, bigButton, quietButton, field } from "./Sheet.jsx";
import { inviteToGame, loadInviteFriends, findPlayer } from "../lib/gameInvites.js";

// "Send to a friend" in a game room: invite someone on TUNR (they get an
// alert that opens the room) or share the link outside the app.
// onInvited({ id, name, kind: "tunr" | "link" }) adds them as pending.
export default function InviteSheetGame({ game, code, invited, onInvited, onShareLink, onClose }) {
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    loadInviteFriends()
      .then(setFriends)
      .catch((e) => (setFriends([]), setError(e.message)));
  }, []);

  const send = async (person) => {
    setBusy(person.id);
    setError("");
    try {
      await inviteToGame(person.id, game, code);
      onInvited({ ...person, kind: "tunr" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const byName = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await send(await findPlayer(typed));
      setTyped("");
    } catch (err) {
      setError(err.message);
    }
  };

  const sent = new Set(invited.map((p) => p.id));
  return (
    <div role="dialog" aria-label="Send to a friend" style={{ position: "fixed", inset: 0, zIndex: 430, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", background: "#121417", borderTop: "1px solid #2a2a2a", borderRadius: "18px 18px 0 0", padding: "16px 16px calc(20px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: 20, fontWeight: 900 }}>SEND ROOM {code}</div>
          <button onClick={onClose} aria-label="Close" style={{ ...quietButton, width: 36, height: 36, padding: 0 }}>
            ✕
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8a94a3", marginTop: 12 }}>ON TUNR</div>
        <div style={{ ...muted, fontSize: 12.5 }}>They get an alert that opens this room.</div>
        <form onSubmit={byName} style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="@username" autoCapitalize="none" aria-label="Username" style={{ ...field, flex: 1 }} />
          <button type="submit" disabled={!typed.trim() || Boolean(busy)} style={{ ...bigButton, width: 96, marginTop: 0, padding: "10px 0", fontSize: 13 }}>
            INVITE
          </button>
        </form>
        {error && (
          <div role="alert" style={{ ...muted, color: "#f87171", marginTop: 6 }}>
            {error}
          </div>
        )}
        {friends === null && <div style={{ ...muted, marginTop: 10 }}>Loading your friends…</div>}
        {friends?.length === 0 && !error && <div style={{ ...muted, marginTop: 10 }}>Follow people on TUNR and they'll show here.</div>}
        {friends?.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1f2329" }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>
              @{f.name}
              {f.mutual && <span style={{ fontSize: 11, color: "#8a94a3", marginLeft: 6 }}>FRIENDS</span>}
            </span>
            <button
              disabled={sent.has(f.id) || Boolean(busy)}
              onClick={() => send(f)}
              style={{ ...quietButton, width: "auto", padding: "8px 14px", fontSize: 13, color: sent.has(f.id) ? "#4ade80" : undefined }}
            >
              {sent.has(f.id) ? "✓ INVITED" : busy === f.id ? "…" : "INVITE"}
            </button>
          </div>
        ))}

        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8a94a3", marginTop: 16 }}>OUTSIDE TUNR</div>
        <div style={{ ...muted, fontSize: 12.5 }}>Text, Instagram, anywhere: a link straight into this room.</div>
        <button onClick={onShareLink} style={{ ...quietButton, marginTop: 8, padding: "12px 0", fontSize: 14 }}>
          📤 SHARE THE LINK
        </button>
      </div>
    </div>
  );
}
