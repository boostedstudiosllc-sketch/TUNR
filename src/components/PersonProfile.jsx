import { useEffect, useState } from "react";
import {
  getPerson,
  followPerson,
  blockUser,
  unblockUser,
  restrictUser,
  loadVehicles,
  loadProfile,
  confirmPhotographer,
  unconfirmPhotographer,
  setPhotographerStatus,
  track,
} from "../lib/store.js";
import { Badges } from "./Badge.jsx";
import { photoPageLink } from "../lib/photographer.js";
import { loadPersonClubs, kindLabel } from "../lib/community.js";
import { Logo } from "./CommunityBits.jsx";

// Someone's profile, opened from their name in a meet chat: follow them,
// see their cars, or block or restrict them.
export default function PersonProfile({ personId, user, onClose, onToast, onNeedAccount, onOpenHost, onChanged }) {
  const [person, setPerson] = useState(undefined); // undefined = loading
  const [cars, setCars] = useState([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [clubs, setClubs] = useState([]);

  async function refresh() {
    const p = await getPerson(personId);
    setPerson(p);
    return p;
  }

  useEffect(() => {
    track("person_profile_opened", {});
    refresh();
    loadVehicles(personId).then(setCars);
    loadPersonClubs(personId)
      .then(setClubs)
      .catch((e) => console.warn(e.message));
  }, [personId]);

  useEffect(() => {
    if (user) loadProfile(user.id).then((p) => setViewerIsAdmin(Boolean(p.isAdmin)));
  }, [user?.id]);

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
        // Above Community's sheets, which open people from posts and chats.
        zIndex: 300,
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
                    photographer={person.is_photographer}
                    photographerVerified={person.photographer_verified}
                    size={18}
                  />
                </div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 3, fontFamily: "'Barlow', sans-serif" }}>
                  {[person.city, `joined ${monthYear(person.joined)}`].filter(Boolean).join(" · ")}
                  {person.follows_me && !isMe && <span style={{ color: "#999" }}> · follows you</span>}
                </div>
                {person.is_photographer && photoPageLink(person.photo_page) && (
                  <a
                    href={photoPageLink(person.photo_page).href}
                    target="_blank"
                    rel="noreferrer nofollow"
                    style={{ display: "inline-block", fontSize: 12, color: "#38BDF8", marginTop: 4, fontWeight: 700, textDecoration: "none" }}
                  >
                    📸 {photoPageLink(person.photo_page).label}
                  </a>
                )}
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

            {person.is_photographer && !person.i_blocked && (
              <PhotographerCheck
                person={person}
                isMe={isMe}
                busy={busy}
                isAdmin={viewerIsAdmin}
                onConfirm={() =>
                  act(
                    () => (person.i_confirmed ? unconfirmPhotographer(personId, user.id) : confirmPhotographer(personId, user.id)),
                    person.i_confirmed ? "Confirmation taken back" : `Confirmed — thanks for vouching for ${name}`
                  )
                }
                onAdmin={(status) => act(() => setPhotographerStatus(personId, status), `Photographer check: ${status}`)}
              />
            )}

            {person.host_name && onOpenHost && (
              <button onClick={() => onOpenHost(person.host_name)} style={{ ...wideButton, width: "100%", marginTop: 10 }}>
                SEE THEIR MEETS (@{person.host_name}) →
              </button>
            )}

            {clubs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 8 }}>CLUBS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {clubs.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "6px 10px 6px 6px" }}>
                      <Logo url={c.logo_url} fallback={kindLabel(c.kind).split(" ")[0]} size={30} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</div>
                        {c.role !== "member" && <div style={{ fontSize: 9.5, color: "#FF7A00", fontWeight: 800, letterSpacing: 0.8 }}>{c.role.toUpperCase()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

// The road to 📸✓: five car owners saying "they shot my car", or an admin.
function PhotographerCheck({ person, isMe, busy, isAdmin, onConfirm, onAdmin }) {
  const n = person.photo_confirmations || 0;
  const status = person.photographer_status;
  return (
    <div style={{ marginTop: 14, background: "#0E1622", border: "1px solid #1E3A5F", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#7DD3FC", letterSpacing: 0.4 }}>
        {person.photographer_verified ? "📸✓ VERIFIED PHOTOGRAPHER" : "📸 PHOTOGRAPHER"}
      </div>
      <div style={{ fontSize: 12, color: "#8BA3BF", marginTop: 3, lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>
        {status === "revoked"
          ? "An admin removed the verified check."
          : person.photographer_verified && n < 5
            ? "Verified by TUNR."
            : person.photographer_verified
              ? `${n} car owners confirmed they shot their cars.`
              : `${n} of 5 car owners have confirmed${isMe ? " you" : ""}. Five gets the verified ✓.`}
        {isMe && !person.photographer_verified && " Ask the people you shoot to open your profile and tap “They shot my car.”"}
      </div>
      {!isMe && (
        <button
          disabled={busy}
          onClick={onConfirm}
          style={{
            ...wideButton,
            width: "100%",
            marginTop: 10,
            background: person.i_confirmed ? "#13202F" : "#1D4ED8",
            color: "#fff",
            border: person.i_confirmed ? "1px solid #1E3A5F" : "none",
          }}
        >
          {person.i_confirmed ? "✓ YOU CONFIRMED · UNDO" : "📸 THEY SHOT MY CAR"}
        </button>
      )}
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[
            ["verified", "VERIFY"],
            ["revoked", "REVOKE"],
            ["auto", "AUTO (5)"],
          ].map(([id, text]) => (
            <button
              key={id}
              disabled={busy}
              onClick={() => onAdmin(id)}
              aria-pressed={(status || "auto") === id}
              style={{
                ...wideButton,
                flex: 1,
                padding: "8px 0",
                fontSize: 11,
                color: (status || "auto") === id ? "#FF7A00" : "#888",
                border: `1px solid ${(status || "auto") === id ? "#FF4500" : "#2A2A2A"}`,
              }}
            >
              ADMIN: {text}
            </button>
          ))}
        </div>
      )}
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
