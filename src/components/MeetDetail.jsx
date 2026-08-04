import { VIBES } from "../data/events.js";
import { displayDate, displayTime } from "../lib/dates.js";
import { CarSilhouette } from "./MeetCard.jsx";
import Comments from "./Comments.jsx";
import { track } from "../lib/store.js";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MeetDetail({
  event,
  rsvp,
  onClose,
  onRsvp,
  user,
  following,
  onToggleFollow,
  onEdit,
  onNeedAccount,
  onToast,
}) {
  const canEdit = Boolean(user && event.submittedByUser);

  async function share() {
    const url = `${window.location.origin}/m/${event.slug || event.id}`;
    track("meet_shared", { eventId: event.id });
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: `${event.title} — on TUNR`, url });
      } else {
        await navigator.clipboard.writeText(url);
        onToast("Link copied");
      }
    } catch {
      // user dismissed the share sheet
    }
  }


  const color = VIBES[event.vibe] || "#FF4500";
  const going = rsvp === "going";
  const interested = rsvp === "interested";
  const hasCoords = event.lat != null && event.lng != null;

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
        background: "rgba(0,0,0,0.85)",
        zIndex: 200,
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
          maxHeight: "88vh",
          overflowY: "auto",
          animation: "slideUp 0.3s ease",
        }}
      >
        <div
          style={{
            position: "relative",
            height: 190,
            background: `linear-gradient(135deg, ${color}26, #0a0a0a 70%)`,
          }}
        >
          {event.photoUrl ? (
            <img
              src={event.photoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <CarSilhouette color={color} width={190} />
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(0deg, #0F0F0F 0%, transparent 60%)",
            }}
          />
          <button
            className="close-btn"
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(0,0,0,0.7)",
              border: "1px solid #333",
              color: "#fff",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              background: color,
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: 3,
              letterSpacing: 2,
            }}
          >
            {event.vibe}
          </div>
        </div>

        <div style={{ padding: "16px 20px 40px" }}>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{event.title}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 6,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "#FF4500" }}>
              Hosted by @{event.host} {event.verified && "✓"}
            </div>
            <button
              className="action-btn"
              onClick={() => (user ? onToggleFollow(event.host) : onNeedAccount())}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                background: following ? "rgba(255,69,0,0.15)" : "#1A1A1A",
                border: `1px solid ${following ? "#FF4500" : "#2A2A2A"}`,
                color: following ? "#FF4500" : "#888",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {following ? "✓ FOLLOWING" : "+ FOLLOW"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <StatBox label="📅 DATE" value={displayDate(event)} />
            <StatBox label="🕐 TIME" value={displayTime(event)} />
            <StatBox label="👥 GOING" value={`${event.going} confirmed`} />
            <StatBox label="★ INTERESTED" value={String(event.interested)} />
          </div>

          <div
            style={{
              background: "#161616",
              border: "1px solid #222",
              borderRadius: 8,
              padding: "12px 14px",
              marginTop: 10,
            }}
          >
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 4 }}>
              📍 LOCATION
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{event.location}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{event.city}</div>
          </div>

          {hasCoords && MAPBOX_TOKEN && (
            <div
              style={{
                marginTop: 12,
                borderRadius: 8,
                overflow: "hidden",
                height: 160,
                border: "1px solid #222",
              }}
            >
              <img
                alt={`Map of ${event.location}`}
                width="100%"
                height="160"
                style={{ display: "block", objectFit: "cover", width: "100%", height: 160 }}
                src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-l+FF4500(${event.lng},${event.lat})/${event.lng},${event.lat},13,0/400x160@2x?access_token=${MAPBOX_TOKEN}`}
              />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 8 }}>
              ABOUT THIS MEET
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#AAA",
                lineHeight: 1.6,
                fontFamily: "'Barlow', sans-serif",
                fontWeight: 400,
              }}
            >
              {event.description}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {event.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  background: "#1A1A1A",
                  border: "1px solid #2A2A2A",
                  color: "#777",
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 4,
                  letterSpacing: 0.8,
                  fontWeight: 600,
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {hasCoords && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}&travelmode=driving`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: "linear-gradient(135deg,#1A2A1A,#0F1F0F)",
                  border: "1px solid #10B981",
                  borderRadius: 10,
                  color: "#10B981",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  fontFamily: "'Barlow Condensed',sans-serif",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                🗺 NAVIGATE
              </a>
            )}
            <a
              href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
                event.title
              )}&location=${encodeURIComponent(
                event.location + ", " + event.city
              )}&details=${encodeURIComponent("Car meet via TUNR.")}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "#111",
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                color: "#888",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 1.5,
                fontFamily: "'Barlow Condensed',sans-serif",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              📅 CALENDAR
            </a>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              className="action-btn"
              onClick={share}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "#111",
                border: "1px solid #2A2A2A",
                borderRadius: 10,
                color: "#888",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 1.5,
                fontFamily: "'Barlow Condensed', sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              ↗ SHARE
            </button>
            {canEdit && (
              <button
                className="action-btn"
                onClick={onEdit}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: "rgba(255,69,0,0.12)",
                  border: "1px solid #FF4500",
                  borderRadius: 10,
                  color: "#FF4500",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}
              >
                ✎ EDIT
              </button>
            )}
          </div>


          {event.source && (
            <div
              style={{
                marginTop: 12,
                background: "#111",
                border: "1px solid #1E1E1E",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 11, color: "#555" }}>via {event.source}</div>
              {event.sourceUrl && (
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: "5px 12px",
                    background: "#1A1A1A",
                    border: "1px solid #2A2A2A",
                    borderRadius: 8,
                    color: "#888",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1,
                    fontFamily: "'Barlow Condensed',sans-serif",
                    textDecoration: "none",
                  }}
                >
                  VIEW SOURCE
                </a>
              )}
            </div>
          )}

          <Comments eventId={event.id} user={user} onNeedAccount={onNeedAccount} />

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              className="action-btn"
              onClick={() => onRsvp(event.id, "going")}
              style={{
                flex: 1,
                padding: "14px 0",
                background: going ? "#FF4500" : "#1A1A1A",
                color: going ? "#fff" : "#888",
                border: going ? "none" : "1px solid #2A2A2A",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 2,
                fontFamily: "'Barlow Condensed', sans-serif",
                boxShadow: going ? "0 4px 20px rgba(255,69,0,0.4)" : "none",
              }}
            >
              {going ? "✓ YOU'RE GOING" : "I'M GOING"}
            </button>
            <button
              className="action-btn"
              onClick={() => onRsvp(event.id, "interested")}
              style={{
                flex: 1,
                padding: "14px 0",
                background: interested ? "#1A0800" : "#1A1A1A",
                color: interested ? "#FF7A00" : "#666",
                border: interested ? "1px solid #FF7A00" : "1px solid #2A2A2A",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 2,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {interested ? "★ INTERESTED" : "INTERESTED"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div
      style={{
        background: "#161616",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
