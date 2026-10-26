import { VIBES } from "../data/events.js";
import ProfileBadge from "./Badge.jsx";
import { displayDate, displayTime, startsInLabel, isHappeningNow } from "../lib/dates.js";
import IssueFlag from "./IssueFlag.jsx";

export default function MeetCard({ event, rsvp, onOpen, onRsvp, onOpenHost, now, index = 0 }) {
  const color = VIBES[event.vibe] || "#0080F0";
  const going = rsvp === "going";
  const interested = rsvp === "interested";
  // Only within a day of starting; further out the date line says it better.
  const countdown = now ? startsInLabel(event, now) : null;
  const live = Boolean(now && isHappeningNow(event, now));

  return (
    <div
      className="meet-card"
      onClick={() => onOpen(event)}
      style={{
        background: "#111",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #1E1E1E",
        animation: `fadeSlideUp 0.4s ease ${Math.min(index * 0.05, 0.4)}s both`,
      }}
    >
      <div
        style={{
          position: "relative",
          height: 130,
          overflow: "hidden",
          background: `linear-gradient(135deg, ${color}22, #0a0a0a 65%)`,
        }}
      >
        {event.photoUrl || event.flyerUrl ? (
          <img
            src={event.photoUrl || event.flyerUrl}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: event.photoUrl ? "center" : "top",
              display: "block",
            }}
          />
        ) : (
          <CarSilhouette color={color} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.05) 62%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: color,
            color: "#fff",
            fontSize: 10,
            fontWeight: 800,
            padding: "3px 8px",
            borderRadius: 3,
            letterSpacing: 1.5,
          }}
        >
          {event.vibe}
        </div>
        <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
          {event.meetStyle === "showcase" && <Badge points>✨ SHOWCASE</Badge>}
          {event.boostPoints ? (
            <Badge points>⭐ +{event.boostPoints} PTS</Badge>
          ) : event.basePoints ? (
            <Badge>+{event.basePoints} PT{event.basePoints === 1 ? "" : "S"}</Badge>
          ) : null}
          {event.visibility === "private" && <Badge>🔒 PRIVATE</Badge>}
          {event.recurrence && <Badge>WEEKLY</Badge>}
          {event.verified && (
            <Badge accent>✓ VERIFIED</Badge>
          )}
          {event.submittedByUser && <Badge>YOURS</Badge>}
        </div>
      </div>

      <div style={{ padding: "12px 14px 10px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.1 }}>
          {event.title}
        </div>
        <div
          onClick={(e) => {
            if (!onOpenHost) return;
            e.stopPropagation();
            onOpenHost(event.host);
          }}
          style={{
            fontSize: 12,
            color: "#0080F0",
            marginTop: 3,
            display: "inline-block",
            cursor: onOpenHost ? "pointer" : "default",
          }}
        >
          @{event.host} {event.verified && "✓"}
          {event.cohosts && event.cohosts.length > 0 && (
            <span style={{ color: "#888" }}> +{event.cohosts.length}</span>
          )}
          {event.foundingHost && (
            <span style={{ marginLeft: 5 }}>
              <ProfileBadge kind="founding_host" size={14} />
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#888",
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 7,
            flexWrap: "wrap",
          }}
        >
          <span>
            📅 {displayDate(event)} · {displayTime(event)}
          </span>
          {countdown && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: 1,
                padding: "2px 7px",
                borderRadius: 3,
                color: live ? "#0A0A0A" : "#3CABFD",
                background: live ? "#0080F0" : "rgba(60, 171, 253,0.12)",
                border: `1px solid ${live ? "#0080F0" : "rgba(60, 171, 253,0.4)"}`,
              }}
            >
              {countdown}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
          {event.locked ? (
            <span>🔒 Address shared once you're in · {event.city}</span>
          ) : (
            <>
              📍 {event.location} · {event.city}
              {event.distanceLabel && (
                <span style={{ color: "#3CABFD" }}> · {event.distanceLabel}</span>
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {event.issueFlag && <IssueFlag issue={event.issueFlag} count={event.issueCount} />}
          {event.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: "#1A1A1A",
                border: "1px solid #2A2A2A",
                color: "#777",
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 3,
                letterSpacing: 0.8,
                fontWeight: 600,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {event.locked ? (
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(event);
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                background: "rgba(0, 128, 240,0.12)",
                color: "#0080F0",
                border: "1px solid #0080F0",
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {event.membershipStatus === "pending" ? "⏳ REQUEST PENDING" : "🔒 GET ACCESS"}
            </button>
          ) : (
            <>
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRsvp(event.id, "going");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                background: going ? "#0080F0" : "#1A1A1A",
                color: going ? "#fff" : "#888",
                border: going ? "1px solid #0080F0" : "1px solid #2A2A2A",
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {going ? "✓ GOING" : `GOING · ${event.going}`}
            </button>
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRsvp(event.id, "interested");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                background: interested ? "#1A0800" : "#1A1A1A",
                color: interested ? "#3CABFD" : "#666",
                border: interested ? "1px solid #3CABFD" : "1px solid #2A2A2A",
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                fontFamily: "'Barlow Condensed', sans-serif",
              }}
            >
              {interested ? "★ MAYBE" : `MAYBE · ${event.interested}`}
            </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children, accent = false, points = false }) {
  return (
    <div
      style={{
        background: points ? "rgba(26,21,0,0.9)" : accent ? "rgba(0, 128, 240,0.2)" : "rgba(0,0,0,0.7)",
        border: points ? "1px solid #FACC15" : accent ? "1px solid #0080F0" : "1px solid #444",
        color: points ? "#FACC15" : accent ? "#0080F0" : "#aaa",
        fontSize: 9,
        fontWeight: 700,
        padding: "3px 7px",
        borderRadius: 3,
        letterSpacing: 1,
      }}
    >
      {children}
    </div>
  );
}

export function CarSilhouette({ color, width = 150 }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={width}
        height={width * 0.42}
        viewBox="0 0 200 84"
        fill="none"
        style={{ opacity: 0.5 }}
      >
        <path
          d="M14 58 L28 30 Q34 22 46 22 L128 22 Q140 22 146 30 L162 52 L186 56 Q192 58 192 64 L192 66 L14 66 Z"
          fill={color}
        />
        <circle cx="52" cy="66" r="14" fill="#0a0a0a" stroke={color} strokeWidth="3" />
        <circle cx="150" cy="66" r="14" fill="#0a0a0a" stroke={color} strokeWidth="3" />
      </svg>
    </div>
  );
}
