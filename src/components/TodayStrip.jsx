import { VIBES } from "../data/events.js";
import { displayTime, startsInLabel, isHappeningNow } from "../lib/dates.js";

// The first thing you should see on the day of a meet you said you'd be at.
// Only renders for meets you've RSVP'd to — the generic "N meets today"
// banner covers everything else.
export default function TodayStrip({ events, rsvps, now, onOpen }) {
  if (events.length === 0) return null;

  return (
    <div style={{ padding: "0 20px 16px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #1A0A00, #240E00)",
          border: "1px solid #FF4500",
          borderRadius: 10,
          padding: "13px 14px 11px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#FF4500",
              boxShadow: "0 0 8px #FF4500",
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 11, color: "#FF4500", letterSpacing: 2, fontWeight: 700 }}>
            YOU'RE ON FOR TODAY
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {events.map((event) => {
            const label = startsInLabel(event, now);
            const live = isHappeningNow(event, now);
            return (
              <div
                key={event.id}
                className="meet-card"
                onClick={() => onOpen(event)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid #2A1200",
                  borderRadius: 8,
                  padding: "9px 11px",
                }}
              >
                <div
                  style={{
                    width: 4,
                    alignSelf: "stretch",
                    borderRadius: 2,
                    background: VIBES[event.vibe] || "#FF4500",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>
                    {displayTime(event)}
                    {rsvps[event.id] === "going" ? " · you're going" : " · saved"}
                  </div>
                </div>
                {label && (
                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1,
                      padding: "4px 8px",
                      borderRadius: 4,
                      color: live ? "#0A0A0A" : "#FF7A00",
                      background: live ? "#FF4500" : "rgba(255,122,0,0.12)",
                      border: `1px solid ${live ? "#FF4500" : "rgba(255,122,0,0.4)"}`,
                    }}
                  >
                    {label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
