import { useEffect, useState } from "react";
import { loadHostFollowerCount, track } from "../lib/store.js";
import { isPast, sortKey } from "../lib/dates.js";
import MeetCard from "./MeetCard.jsx";
import Badge from "./Badge.jsx";

export default function HostProfile({
  host,
  events,
  rsvps,
  user,
  following,
  onToggleFollow,
  onOpenMeet,
  onRsvp,
  onClose,
  onNeedAccount,
}) {
  const [followers, setFollowers] = useState(null);

  useEffect(() => {
    let alive = true;
    track("host_profile_opened", { host });
    loadHostFollowerCount(host).then((n) => {
      if (alive) setFollowers(n);
    });
    return () => {
      alive = false;
    };
  }, [host]);

  const now = new Date();
  // Meets this host runs, including ones they co-host.
  const hostEvents = events.filter((e) => e.host === host || (e.cohosts || []).includes(host));
  const upcoming = hostEvents
    .filter((e) => !isPast(e, now))
    .sort((a, b) => sortKey(a, now) - sortKey(b, now));
  // Badges belong to a meet's main host, so they come only from meets this
  // host runs themselves — co-hosting a verified host's meet isn't a badge.
  const ownEvents = events.filter((e) => e.host === host);
  const verified = ownEvents.some((e) => e.verified);
  const founding = ownEvents.some((e) => e.foundingHost);

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
        zIndex: 240,
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
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(180deg, var(--n-1a0800) 0%, var(--n-0f0f0f) 100%)",
            padding: "20px 20px 22px",
            borderBottom: "1px solid var(--n-1e1e1e)",
            position: "relative",
          }}
        >
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid var(--n-333333)",
              color: "var(--n-ffffff)",
              borderRadius: "50%",
              width: 30,
              height: 30,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>

          <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #0080F0, #3CABFD)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 900,
                border: "3px solid #0080F0",
                boxShadow: "0 0 18px rgba(0, 128, 240,0.35)",
                flexShrink: 0,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {(host || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 30 }}>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 900,
                  letterSpacing: 0.3,
                  lineHeight: 1.15,
                  overflowWrap: "anywhere",
                }}
              >
                {host}
                {verified && <span style={{ color: "#0080F0" }}> ✓</span>}
                {founding && (
                  <span style={{ marginLeft: 7 }}>
                    <Badge kind="founding_host" size={20} />
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--a-3cabfd)", marginTop: 2 }}>@{host}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0080F0" }}>
                {upcoming.length}
              </div>
              <div style={{ fontSize: 9, color: "var(--n-555555)", letterSpacing: 1.4 }}>UPCOMING</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0080F0" }}>
                {followers === null ? "—" : followers}
              </div>
              <div style={{ fontSize: 9, color: "var(--n-555555)", letterSpacing: 1.4 }}>
                {followers === 1 ? "FOLLOWER" : "FOLLOWERS"}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0080F0" }}>
                {hostEvents.length}
              </div>
              <div style={{ fontSize: 9, color: "var(--n-555555)", letterSpacing: 1.4 }}>TOTAL MEETS</div>
            </div>
          </div>

          <button
            className="action-btn"
            onClick={() => (user ? onToggleFollow(host) : onNeedAccount())}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "12px 0",
              background: following ? "rgba(0, 128, 240,0.12)" : "#0080F0",
              border: following ? "1px solid #0080F0" : "none",
              borderRadius: 10,
              color: following ? "#0080F0" : "#fff",
              fontSize: 13.5,
              fontWeight: 800,
              letterSpacing: 1.5,
              fontFamily: "'Barlow Condensed', sans-serif",
            }}
          >
            {following ? "✓ FOLLOWING" : "+ FOLLOW THIS HOST"}
          </button>
        </div>

        {/* Their meets */}
        <div style={{ padding: "16px 20px 40px" }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--n-555555)",
              letterSpacing: 2,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            UPCOMING MEETS
          </div>
          {upcoming.length === 0 ? (
            <div
              style={{
                background: "var(--n-111111)",
                border: "1px solid var(--n-1e1e1e)",
                borderRadius: 10,
                padding: 28,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--n-555555)" }}>
                No upcoming meets
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--n-444444)",
                  marginTop: 5,
                  fontFamily: "'Barlow', sans-serif",
                }}
              >
                Follow to hear when they post the next one.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {upcoming.map((event, i) => (
                <MeetCard
                  key={event.id}
                  event={event}
                  rsvp={rsvps[event.id]}
                  onOpen={onOpenMeet}
                  onRsvp={onRsvp}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
