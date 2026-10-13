import { useEffect, useState } from "react";
import { VIBES } from "../data/events.js";
import { displayDate, displayTime } from "../lib/dates.js";
import { CarSilhouette } from "./MeetCard.jsx";
import Comments from "./Comments.jsx";
import ReportMeet from "./ReportMeet.jsx";
import ListingRequest from "./ListingRequest.jsx";
import PrivateAccess from "./PrivateAccess.jsx";
import Attendees from "./Attendees.jsx";
import MeetPhotos from "./MeetPhotos.jsx";
import IssueFlag from "./IssueFlag.jsx";
import { track, loadGoingHistory } from "../lib/store.js";
import GoingTicker from "./GoingTicker.jsx";
import { directionsUrl } from "../lib/geo.js";

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
  onOpenHost,
  onJoined,
}) {
  // The owner or an accepted co-host.
  const canEdit = Boolean(user && event.canManage);
  const cohosts = event.cohosts || [];
  // Private meet the viewer isn't in: the address fields arrive as null from
  // the database, so everything that would expose a location stays out.
  const locked = Boolean(event.locked);

  // Counted for hosts' traction in the admin insights.
  useEffect(() => {
    track("meet_viewed", { eventId: event.id });
  }, [event.id]);

  // The going chart. Reloaded shortly after this viewer changes their
  // answer, once the RSVP has been saved.
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => loadGoingHistory(event.id).then((h) => alive && setHistory(h)),
      history.length ? 700 : 0
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [event.id, rsvp]);

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
  const hasCoords = event.lat != null && event.lng != null;
  const directions = directionsUrl(event);

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
          {event.photoUrl || event.flyerUrl ? (
            <img
              src={event.photoUrl || event.flyerUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: event.photoUrl ? "center" : "top",
                display: "block",
              }}
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

        <div style={{ padding: "16px 20px 0" }}>
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
            <div
              onClick={() => onOpenHost && onOpenHost(event.host)}
              style={{
                fontSize: 13,
                color: "#FF4500",
                cursor: onOpenHost ? "pointer" : "default",
              }}
            >
              Hosted by @{event.host} {event.verified && "✓"}
            </div>
            {cohosts.length > 0 && (
              <div style={{ fontSize: 12.5, color: "#999", width: "100%", marginTop: -4 }}>
                with{" "}
                {cohosts.map((c, i) => (
                  <span key={c}>
                    {i > 0 && ", "}
                    <span
                      onClick={() => onOpenHost && onOpenHost(c)}
                      style={{ color: "#FF7A00", cursor: onOpenHost ? "pointer" : "default" }}
                    >
                      @{c}
                    </span>
                  </span>
                ))}
              </div>
            )}
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

          {event.issueFlag && (
            <div style={{ marginTop: 14 }}>
              <IssueFlag issue={event.issueFlag} count={event.issueCount} size="large" />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            <StatBox label="📅 DATE" value={displayDate(event)} />
            <StatBox label="🕐 TIME" value={displayTime(event)} />
            <StatBox label="👥 GOING" value={`${event.going} confirmed`} />
            <StatBox label="★ MAYBE" value={String(event.interested)} />
          </div>

          {!locked && history.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <GoingTicker points={history} current={event.going} />
            </div>
          )}

          {!locked && (
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
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                {event.city}
                {event.distanceLabel && (
                  <span style={{ color: "#FF7A00" }}> · {event.distanceLabel} away</span>
                )}
              </div>
            </div>
          )}

          <PrivateAccess
            event={event}
            user={user}
            onNeedAccount={onNeedAccount}
            onToast={onToast}
            onJoined={onJoined}
          />

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

          {!locked && (
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
          )}

          {!locked && event.flyerUrl && <Flyer url={event.flyerUrl} title={event.title} />}

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

          {!locked && (
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {directions && (
                <a
                  href={directions}
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
          )}

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

          {!locked && <Attendees eventId={event.id} goingCount={event.going} />}

          {!locked && (
            <MeetPhotos
              eventId={event.id}
              user={user}
              isHost={canEdit}
              onNeedAccount={onNeedAccount}
              onToast={onToast}
            />
          )}

          {!locked && (
            <Comments
              eventId={event.id}
              user={user}
              onNeedAccount={onNeedAccount}
              onToast={onToast}
            />
          )}

          {event.imported && !locked && <ListingRequest event={event} />}

          <ReportMeet eventId={event.id} user={user} onNeedAccount={onNeedAccount} />

          {!locked && (
            <ActionBar
              rsvp={rsvp}
              onRsvp={(status) => onRsvp(event.id, status)}
              directions={directions}
            />
          )}
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

// The organizer's flyer, whole. Tap for full screen to read the fine print.
function Flyer({ url, title }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 8 }}>FLYER</div>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the flyer full screen"
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          background: "#0A0A0A",
          border: "1px solid #222",
          borderRadius: 10,
          overflow: "hidden",
          cursor: "zoom-in",
        }}
      >
        <img
          src={url}
          alt={`Flyer for ${title}`}
          loading="lazy"
          style={{ width: "100%", maxHeight: 520, objectFit: "contain", display: "block" }}
        />
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            cursor: "zoom-out",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <img
            src={url}
            alt={`Flyer for ${title}`}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid #444",
              borderRadius: 16,
              padding: "6px 12px",
            }}
          >
            ✕ CLOSE
          </div>
        </div>
      )}
    </div>
  );
}

// Stays at the bottom of the meet while you scroll: your answer, and the way there.
function ActionBar({ rsvp, onRsvp, directions }) {
  const options = [
    { id: "going", label: "GOING", on: "✓ GOING", color: "#FF4500", fill: true },
    { id: "interested", label: "MAYBE", on: "★ MAYBE", color: "#FF7A00" },
    { id: "not_going", label: "NOT GOING", on: "✕ NOT GOING", color: "#888" },
  ];
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        margin: "22px -20px 0",
        padding: "12px 20px 18px",
        background: "linear-gradient(0deg, #0F0F0F 82%, rgba(15,15,15,0))",
        display: "flex",
        gap: 8,
        zIndex: 2,
      }}
    >
      {options.map((o) => {
        const active = rsvp === o.id;
        return (
          <button
            key={o.id}
            className="action-btn"
            aria-pressed={active}
            onClick={() => onRsvp(o.id)}
            style={{
              flex: o.id === "going" ? 1.25 : 1,
              padding: "13px 0",
              background: active ? (o.fill ? o.color : "#1A1A1A") : "#161616",
              color: active ? (o.fill ? "#fff" : o.color) : "#777",
              border: active && !o.fill ? `1px solid ${o.color}` : active ? "none" : "1px solid #2A2A2A",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 800,
              letterSpacing: 1.2,
              fontFamily: "'Barlow Condensed', sans-serif",
              boxShadow: active && o.fill ? "0 4px 20px rgba(255,69,0,0.4)" : "none",
            }}
          >
            {active ? o.on : o.label}
          </button>
        );
      })}
      {directions && (
        <a
          href={directions}
          target="_blank"
          rel="noreferrer"
          aria-label="Directions"
          style={{
            flex: "0 0 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: "#0F1F0F",
            border: "1px solid #10B981",
            color: "#10B981",
            fontSize: 16,
            textDecoration: "none",
            lineHeight: 1,
          }}
        >
          🧭
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, marginTop: 3, fontFamily: "'Barlow Condensed', sans-serif" }}>
            GO
          </span>
        </a>
      )}
    </div>
  );
}
