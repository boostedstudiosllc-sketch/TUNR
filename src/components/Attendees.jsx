import { useEffect, useState } from "react";
import { loadAttendees } from "../lib/store.js";

// What's turning up, not who. The view behind this publishes make and model
// only — no names, handles or photos cross that boundary.
export default function Attendees({ eventId, goingCount }) {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAttendees(eventId)
      .then((rows) => alive && setCars(rows))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId]);

  if (loading || cars.length === 0) return null;

  const going = cars.filter((c) => c.status === "going");
  const interested = cars.filter((c) => c.status !== "going");
  // RSVPs without a car never reach the view, so the totals won't match and
  // saying so is better than looking broken.
  const unlisted = Math.max(0, (goingCount || 0) - going.length);

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 11, color: "var(--n-555555)", letterSpacing: 2, marginBottom: 10 }}>
        WHAT'S COMING · {cars.length}
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {going.map((c, i) => (
          <Chip key={`g${i}`} make={c.make} model={c.model} />
        ))}
        {interested.map((c, i) => (
          <Chip key={`i${i}`} make={c.make} model={c.model} muted />
        ))}
      </div>

      {unlisted > 0 && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--n-555555)",
            marginTop: 9,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          + {unlisted} going without a car listed
        </div>
      )}
    </div>
  );
}

function Chip({ make, model, muted = false }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 5,
        background: muted ? "var(--n-141414)" : "var(--n-1a1a1a)",
        border: `1px solid ${muted ? "var(--n-242424)" : "var(--n-333333)"}`,
        borderRadius: 20,
        padding: "6px 12px",
        fontSize: 12.5,
        fontFamily: "'Barlow', sans-serif",
      }}
    >
      <strong style={{ color: muted ? "var(--n-777777)" : "var(--n-f0f0f0)", fontWeight: 700 }}>{make}</strong>
      <span style={{ color: muted ? "var(--n-555555)" : "var(--n-999999)" }}>{model}</span>
    </span>
  );
}
