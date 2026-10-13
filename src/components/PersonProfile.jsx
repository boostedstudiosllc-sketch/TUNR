import { useEffect, useState } from "react";
import {
  getPerson,
  followPerson,
  blockUser,
  unblockUser,
  restrictUser,
  loadVehicles,
  track,
} from "../lib/store.js";
import { Badges } from "./Badge.jsx";

// Someone's profile, opened from their name in a meet chat: follow them,
// see their cars, or block or restrict them.
export default function PersonProfile({ personId, user, onClose, onToast, onNeedAccount, onOpenHost, onChanged }) {
  const [person, setPerson] = useState(undefined); // undefined = loading
  const [cars, setCars] = useState([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  async function refresh() {
    const p = await getPerson(personId);
    setPerson(p);
    return p;
  }

  useEffect(() => {
    track("person_profile_opened", {});
    refresh();
    loadVehicles(personId).then(setCars);
  }, [personId]);

  const isMe = user && user.id === personId;

  async function act(fn, message) {
    if (!user) return onNeedAccount();
    setBusy(true);
    try {
      await fn();
      await refresh();
      onChanged && onChanged();
      if (message) onToast(message);
    } catch (e) {
      onToast(e.message || "Couldn't do that.");
    } finally {
      setBusy(false);
      setMenu(false);
      setConfirmBlock(false);
    }
  }

  const name = person?.username ? `@${person.username}` : "this account";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        width: "100%",
        maxWidth: 430,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.88)",
        zIndex: 260,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#0F0F0F",
          borderRadius: "16px 16px 0 0",
          border: "1px solid #1E1E1E",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "20px 20px 32px",
          animation: "slideUp 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} aria-label="Close" style={roundButton}>
            ✕
          </button>
        </div>

        {person === undefined ? (
          <Muted>Loading…</Muted>
        ) : !person || person.unavailable ? (
          <Muted>This account isn't available.</Muted>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: -6 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg,#FF4500,#FF7A00)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                {(person.username || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, overflowWrap: "anywhere" }}>@{person.username}</span>
                  <Badges
                    dayOne={person.day_one}
                    dayOneNumber={person.day_one_number}
                    foundingHost={person.founding_host}
                    size={18}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 3, fontFamily: "'Barlow', sans-serif" }}>
                  {[person.city, `joined ${monthYear(person.joined)}`].filter(Boolean).join(" · ")}
                  {person.follows_me && !isMe && <span style={{ color: "#999" }}> · follows you</span>}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 22, marginTop: 16 }}>
              <Count n={person.followers} label="followers" />
              <Count n={person.following} label="following" />
              <Count n={cars.length} label={cars.length === 1 ? "car" : "cars"} />
            </div>

            {person.i_blocked ? (
              <div style={{ marginTop: 16 }}>
                <Muted>You've blocked {name}. You won't see their messages, and they can't follow you.</Muted>
                <button
                  disabled={busy}
                  onClick={() => act(() => unblockUser(user.id, personId), `Unblocked ${name}`)}
                  style={{ ...wideButton, marginTop: 10 }}
                >
                  UNBLOCK
                </button>
              </div>
            ) : isMe ? (
              <Muted style={{ marginTop: 16 }}>This is you.</Muted>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => followPerson(personId, user.id, person.i_follow),
                      person.i_follow ? `Unfollowed ${name}` : `Following ${name}`
                    )
                  }
                  style={{
                    ...wideButton,
                    flex: 1,
                    background: person.i_follow ? "#1A1A1A" : "#FF4500",
                    color: person.i_follow ? "#DDD" : "#fff",
                    border: person.i_follow ? "1px solid #333" : "none",
                  }}
                >
                  {person.i_follow ? "FOLLOWING ✓" : person.follows_me ? "FOLLOW BACK" : "FOLLOW"}
                </button>
                <button onClick={() => (user ? setMenu((m) => !m) : onNeedAccount())} aria-label="More" style={{ ...wideButton, flex: "0 0 52px" }}>
                  ⋯
                </button>
              </div>
            )}

            {menu && !person.i_blocked && !isMe && (
              <div style={{ marginTop: 10, background: "#141414", border: "1px solid #262626", borderRadius: 10, overflow: "hidden" }}>
                <MenuRow
                  title={person.i_restricted ? "Unrestrict" : "Restrict"}
                  sub={
                    person.i_restricted
                      ? "Their messages on your meets show to everyone again."
                      : "On meets you host, their messages are seen only by them and you. They aren't told."
                  }
                  onClick={() =>
                    act(
                      () => restrictUser(user.id, personId, !person.i_restricted),
                      person.i_restricted ? `Unrestricted ${name}` : `Restricted ${name}`
                    )
                  }
                />
                {confirmBlock ? (
                  <MenuRow
                    danger
                    title={`Block ${name}?`}
                    sub="Tap again to confirm. You won't see their messages, they can't message on your meets, and any follows between you end."
                    onClick={() => act(() => blockUser(user.id, personId), `Blocked ${name}`)}
                  />
                ) : (
                  <MenuRow
                    danger
                    title="Block"
                    sub="Hide their messages and stop them following you."
                    onClick={() => setConfirmBlock(true)}
                  />
                )}
              </div>
            )}

            {person.host_name && onOpenHost && (
              <button onClick={() => onOpenHost(person.host_name)} style={{ ...wideButton, width: "100%", marginTop: 10 }}>
                SEE THEIR MEETS (@{person.host_name}) →
              </button>
            )}

            {cars.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 8 }}>GARAGE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cars.map((v) => (
                    <div
                      key={v.id}
                      style={{ display: "flex", gap: 10, alignItems: "center", background: "#141414", border: "1px solid #222", borderRadius: 8, padding: 8 }}
                    >
                      {v.photo_url ? (
                        <img src={v.photo_url} alt="" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        <div style={{ width: 56, height: 42, borderRadius: 6, background: "#1C1C1C", display: "flex", alignItems: "center", justifyContent: "center" }}>🚗</div>
                      )}
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Count({ n, label }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{Number(n || 0).toLocaleString("en-US")}</div>
      <div style={{ fontSize: 11, color: "#777", fontFamily: "'Barlow', sans-serif" }}>{label}</div>
    </div>
  );
}

function MenuRow({ title, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        borderBottom: "1px solid #1F1F1F",
        padding: "12px 14px",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: danger ? "#EF4444" : "#E6E6E6", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11.5, color: "#777", marginTop: 2, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif" }}>{sub}</div>
    </button>
  );
}

function Muted({ children, style }) {
  return (
    <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif", ...style }}>
      {children}
    </div>
  );
}

const monthYear = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";

const roundButton = {
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  color: "#fff",
  borderRadius: "50%",
  width: 32,
  height: 32,
  fontSize: 15,
  cursor: "pointer",
};

const wideButton = {
  padding: "12px 0",
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  color: "#CCC",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.2,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};
