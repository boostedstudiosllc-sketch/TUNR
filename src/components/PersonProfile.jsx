import { useEffect, useState } from "react";
import {
  getPerson,
  followPerson,
  blockUser,
  unblockUser,
  restrictUser,
  loadVehicles,
  loadProfile,
  setPhotographerStatus,
  track,
  loadProfileCounts,
} from "../lib/store.js";
import { Badges } from "./Badge.jsx";
import { photoPageLink } from "../lib/photographer.js";
import { loadPersonClubs, kindLabel } from "../lib/community.js";
import { Logo, ReportSheet } from "./CommunityBits.jsx";
import { Avatar } from "./EditProfile.jsx";
import { GarageShowroom } from "./Showroom.jsx";
import StandingBadge from "./StandingBadge.jsx";

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
  const [reporting, setReporting] = useState(false);
  // Their garage in 3D, open on this car.
  const [showroom, setShowroom] = useState(null);
  const [counts, setCounts] = useState(null);

  async function refresh() {
    const p = await getPerson(personId);
    setPerson(p);
    return p;
  }

  useEffect(() => {
    track("person_profile_opened", {});
    refresh();
    loadVehicles(personId).then(setCars);
    loadProfileCounts(personId)
      .then(setCounts)
      .catch((e) => console.warn(e.message));
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
        top: "env(safe-area-inset-top)",
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
          background: "var(--n-0f0f0f)",
          borderRadius: "16px 16px 0 0",
          border: "1px solid var(--n-1e1e1e)",
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
              <Avatar url={person.avatar_url} name={person.username || "?"} size={64} ring={Boolean(person.profile_color)} ringColor={person.profile_color || undefined} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, overflowWrap: "anywhere", color: person.profile_color || undefined }}>@{person.username}</span>
                  <Badges
                    hostOf={personId}
                    dayOne={person.day_one}
                    dayOneNumber={person.day_one_number}
                    foundingHost={person.founding_host}
                    photographer={person.is_photographer}
                    photographerVerified={person.photographer_verified}
                    connector={person.connector}
                    size={18}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--n-777777)", marginTop: 3, fontFamily: "'Barlow', sans-serif" }}>
                  {person.city}
                  {person.follows_me && !isMe && <span style={{ color: "var(--n-999999)" }}>{person.city ? " · " : ""}follows you</span>}
                </div>
                <StandingBadge userId={personId} username={person.username} isMe={isMe} onToast={onToast} />
                {person.is_photographer && photoPageLink(person.photo_page) && (
                  <a
                    href={photoPageLink(person.photo_page).href}
                    target="_blank"
                    rel="noreferrer nofollow"
                    style={{ display: "inline-block", fontSize: 12, color: "var(--a-38bdf8)", marginTop: 4, fontWeight: 700, textDecoration: "none" }}
                  >
                    📸 {photoPageLink(person.photo_page).label}
                  </a>
                )}
              </div>
            </div>

            {person.bio && (
              <div
                style={{
                  fontSize: 13.5,
                  color: "var(--n-dddddd)",
                  marginTop: 12,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                {person.bio}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
              <Count n={counts?.went} label="went to" />
              <Count n={counts?.meets} label={counts?.meets === 1 ? "meet" : "meets"} />
              <Count n={counts?.posts} label={counts?.posts === 1 ? "post" : "posts"} />
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
                    background: person.i_follow ? "var(--n-1a1a1a)" : "#0080F0",
                    color: person.i_follow ? "#DDD" : "#fff",
                    border: person.i_follow ? "1px solid var(--n-333333)" : "none",
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
              <div style={{ marginTop: 10, background: "var(--n-141414)", border: "1px solid var(--n-262626)", borderRadius: 10, overflow: "hidden" }}>
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
                <MenuRow
                  title="Report profile"
                  sub="Offensive photo or bio, impersonation, spam. Only TUNR admins see reports."
                  onClick={() => {
                    setMenu(false);
                    setReporting(true);
                  }}
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
                <div style={{ fontSize: 11, color: "var(--n-555555)", letterSpacing: 2, marginBottom: 8 }}>CLUBS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {clubs.map((c) => (
                    <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--n-141414)", border: "1px solid var(--n-222222)", borderRadius: 10, padding: "6px 10px 6px 6px" }}>
                      <Logo url={c.logo_url} fallback={kindLabel(c.kind).split(" ")[0]} size={30} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</div>
                        {c.role !== "member" && <div style={{ fontSize: 9.5, color: "var(--a-3cabfd)", fontWeight: 800, letterSpacing: 0.8 }}>{c.role.toUpperCase()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cars.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--n-555555)", letterSpacing: 2 }}>GARAGE</div>
                  <button
                    className="action-btn"
                    onClick={() => setShowroom((cars.find((v) => v.is_primary) || cars[0]).id)}
                    style={{ background: "none", border: "none", color: "#FACC15", fontSize: 12, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
                  >
                    VIEW IN 3D ›
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cars.map((v) => (
                    <button
                      key={v.id}
                      className="action-btn"
                      onClick={() => setShowroom(v.id)}
                      aria-label={`See ${[v.year, v.make, v.model].filter(Boolean).join(" ")} in 3D`}
                      style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--n-141414)", border: "1px solid var(--n-222222)", borderRadius: 8, padding: 8, cursor: "pointer", color: "var(--n-f0f0f0)", textAlign: "left", width: "100%", fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      {v.photo_url ? (
                        <img src={v.photo_url} alt="" style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 6 }} />
                      ) : (
                        <div style={{ width: 56, height: 42, borderRadius: 6, background: "var(--n-1c1c1c)", display: "flex", alignItems: "center", justifyContent: "center" }}>🚗</div>
                      )}
                      <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>
                        {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                      </div>
                      <span aria-hidden="true" style={{ color: "var(--n-555555)", fontSize: 18 }}>
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {reporting && <ReportSheet type="profile" id={personId} onClose={() => setReporting(false)} onToast={onToast} />}
      {showroom && (
        <GarageShowroom
          title={person?.username ? `@${person.username.toUpperCase()}'S GARAGE` : "GARAGE"}
          cars={cars}
          startId={showroom}
          plate={person?.username || "TUNR"}
          onClose={() => setShowroom(null)}
        />
      )}
    </div>
  );
}

// The 📸 badge is self-declared; the ✓ comes from TUNR (an admin).
function PhotographerCheck({ person, isMe, busy, isAdmin, onAdmin }) {
  const verified = person.photographer_verified;
  return (
    <div style={{ marginTop: 14, background: "var(--n-0e1622)", border: "1px solid #1E3A5F", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--a-7dd3fc)", letterSpacing: 0.4 }}>
        {verified ? "📸✓ VERIFIED PHOTOGRAPHER" : "📸 PHOTOGRAPHER"}
      </div>
      <div style={{ fontSize: 12, color: "var(--a-8ba3bf)", marginTop: 3, lineHeight: 1.5, fontFamily: "'Barlow', sans-serif" }}>
        {verified ? "Verified by TUNR." : isMe ? "You turned on the photographer badge." : "Shoots cars at meets."}
      </div>
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[
            ["verified", "VERIFY"],
            ["auto", "NOT VERIFIED"],
          ].map(([id, text]) => {
            const on = id === "verified" ? verified : !verified;
            return (
              <button
                key={id}
                disabled={busy}
                onClick={() => onAdmin(id)}
                aria-pressed={on}
                style={{
                  ...wideButton,
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 11,
                  color: on ? "var(--a-3cabfd)" : "var(--n-888888)",
                  border: `1px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`,
                }}
              >
                ADMIN: {text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Count({ n, label }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{Number(n || 0).toLocaleString("en-US")}</div>
      <div style={{ fontSize: 11, color: "var(--n-777777)", fontFamily: "'Barlow', sans-serif" }}>{label}</div>
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
        borderBottom: "1px solid var(--n-1f1f1f)",
        padding: "12px 14px",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: danger ? "var(--a-ef4444)" : "var(--n-e6e6e6)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--n-777777)", marginTop: 2, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif" }}>{sub}</div>
    </button>
  );
}

function Muted({ children, style }) {
  return (
    <div style={{ fontSize: 13, color: "var(--n-777777)", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif", ...style }}>
      {children}
    </div>
  );
}

const roundButton = {
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  color: "var(--n-ffffff)",
  borderRadius: "50%",
  width: 32,
  height: 32,
  fontSize: 15,
  cursor: "pointer",
};

const wideButton = {
  padding: "12px 0",
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 8,
  color: "var(--n-cccccc)",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 1.2,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};
