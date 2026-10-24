import { useEffect, useState } from "react";
import { UNLOCKS, inviteLink, loadMyInvites, shareInvite } from "../lib/invites.js";
import Sheet, { sheetTitle, muted, label, bigButton, quietButton } from "./Sheet.jsx";

// Your invite link, how many friends count, and what that unlocks.
export default function InviteSheet({ reason = "", onClose, onToast, onOpenPerson }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMyInvites()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function share() {
    try {
      const how = await shareInvite(data.code);
      if (how === "copied") onToast("Invite link copied. Paste it to a friend.");
    } catch (e) {
      onToast(`Couldn't share the link. (${e.message})`);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteLink(data.code));
      onToast("Invite link copied");
    } catch (e) {
      onToast(`Couldn't copy the link. (${e.message})`);
    }
  }

  const count = Number(data?.confirmed || 0);

  return (
    <Sheet onClose={onClose} label="Invite friends" zIndex={297}>
      <div style={sheetTitle}>INVITE FRIENDS</div>
      {reason && <div style={{ ...muted, color: "#FACC15", marginTop: 6 }}>🔒 {reason}</div>}
      <div style={{ ...muted, marginTop: 6 }}>
        Share your link. Each friend who signs up with it and confirms their email counts toward
        unlocking more of TUNR.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

      {data?.code && (
        <>
          <div
            style={{
              marginTop: 14,
              background: "#121212",
              border: "1px solid #2A2A2A",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              color: "#CCC",
              fontFamily: "'Barlow', sans-serif",
              overflowWrap: "anywhere",
            }}
          >
            {inviteLink(data.code)}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="action-btn" onClick={share} style={{ ...bigButton, flex: 2 }}>📤 SHARE MY LINK</button>
            <button className="action-btn" onClick={copy} style={{ ...quietButton, flex: 1 }}>COPY</button>
          </div>
        </>
      )}

      <div style={{ ...label, marginTop: 20 }}>
        FRIENDS JOINED: {count}
        {data?.pending ? ` (+${data.pending} waiting to confirm their email)` : ""}
      </div>
      {UNLOCKS.map((u) => {
        const open = Boolean(data?.unlocked?.[u.key]);
        return (
          <div
            key={u.key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginTop: 8,
              background: open ? "rgba(16,185,129,0.08)" : "#121212",
              border: `1px solid ${open ? "#14532D" : "#222"}`,
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 24 }}>{open ? u.icon : "🔒"}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>{u.title}</span>
              <span style={{ display: "block", ...muted, fontSize: 12.5 }}>{u.sub}</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: open ? "#10B981" : "#FACC15", whiteSpace: "nowrap" }}>
              {open ? "UNLOCKED" : `${Math.min(count, u.need)}/${u.need} ${u.need === 1 ? "FRIEND" : "FRIENDS"}`}
            </span>
          </div>
        );
      })}

      {data?.friends?.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 20 }}>WHO JOINED</div>
          {data.friends.map((f) => (
            <button
              key={f.id}
              onClick={() => onOpenPerson && onOpenPerson(f.id)}
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
                alignItems: "center",
                background: "none",
                border: "none",
                borderBottom: "1px solid #1A1A1A",
                padding: "10px 2px",
                color: "#F0F0F0",
                cursor: "pointer",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <span>@{f.username || "new member"}</span>
              <span style={{ fontSize: 12, color: f.confirmed ? "#10B981" : "#A08A40" }}>
                {f.confirmed ? "✓ Counts" : "Waiting on email confirm"}
              </span>
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}
