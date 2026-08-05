import { useEffect, useState } from "react";
import { loadHostFollowerCount, track } from "../lib/store.js";
import { isPast, sortKey } from "../lib/dates.js";
import MeetCard from "./MeetCard.jsx";

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
  const hostEvents = events.filter((e) => e.host === host);
  const upcoming = hostEvents
    .filter((e) => !isPast(e, now))
    .sort((a, b) => sortKey(a, now) - sortKey(b, now));
  const verified = hostEvents.some((e) => e.verified);

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
        zIndex: 240,
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
          maxHeight: "90vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(180deg, #1A0800 0%, #0F0F0F 100%)",
            padding: "20px 20px 22px",
            borderBottom: "1px solid #1E1E1E",
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
              border: "1px solid #333",
              color: "#fff",
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
                background: "linear-gradient(135deg, #FF4500, #FF7A00)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 900,
                border: "3px solid #FF4500",
                boxShadow: "0 0 18px rgba(255,69,0,0.35)",
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
                {verified && <span style={{ color: "#FF4500" }}> ✓</span>}
              </div>
              <div style={{ fontSize: 12, color: "#FF7A00", marginTop: 2 }}>@{host}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#FF4500" }}>
                {upcoming.length}
              </div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.4 }}>UPCOMING</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#FF4500" }}>
                {followers === null ? "—" : followers}
              </div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.4 }}>
                {followers === 1 ? "FOLLOWER" : "FOLLOWERS"}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#FF4500" }}>
                {hostEvents.length}
              </div>
              <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.4 }}>TOTAL MEETS</div>
            </div>
          </div>

          <button
            className="action-btn"
            onClick={() => (user ? onToggleFollow(host) : onNeedAccount())}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "12px 0",
              background: following ? "rgba(255,69,0,0.12)" : "#FF4500",
              border: following ? "1px solid #FF4500" : "none",
              borderRadius: 10,
              color: following ? "#FF4500" : "#fff",
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
              color: "#555",
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
                background: "#111",
                border: "1px solid #1E1E1E",
                borderRadius: 10,
                padding: 28,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#555" }}>
                No upcoming meets
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "#444",
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
