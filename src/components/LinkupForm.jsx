import { useState } from "react";
import { LINKUP_KINDS, postLinkup } from "../lib/linkups.js";
import { currentPosition } from "../lib/alerts.js";
import { geocodeLocation, reverseGeocode } from "../lib/geocode.js";
import { GOING_AS } from "../lib/photographer.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton, Chip } from "./Sheet.jsx";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const WHEN = [
  [0, "NOW"],
  [30, "30 MIN"],
  [60, "1 HR"],
  [90, "1½ HRS"],
  [120, "2 HRS"],
];

const LENGTH = [
  [1, "1 HR"],
  [2, "2 HRS"],
  [3, "3 HRS"],
];

// Starting a linkup: what, when, where, and who can see the spot.
export default function LinkupForm({ user, onClose, onPosted, onToast }) {
  const [draft, setDraft] = useState({
    kind: "photos",
    startsInMinutes: 30,
    hours: 2,
    place: "",
    area: "",
    lat: null,
    lng: null,
    note: "",
    visibility: "public",
    goingAs: "car",
  });
  // Coordinates came from the phone, not from looking up the typed name.
  const [fromGps, setFromGps] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function hereNow() {
    setBusy("gps");
    setError("");
    try {
      const pos = await currentPosition();
      const where = await reverseGeocode(pos.lat, pos.lng, { token: MAPBOX_TOKEN });
      setDraft((d) => ({
        ...d,
        lat: pos.lat,
        lng: pos.lng,
        area: where.area || d.area,
        place: d.place || where.placeName || "My location",
      }));
      setFromGps(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    setError("");
    if (draft.place.trim().length < 2) return setError("Say where — a spot name or an address.");
    setBusy("post");
    try {
      let { lat, lng, area } = draft;
      if (!fromGps || lat == null) {
        if (!MAPBOX_TOKEN) {
          throw new Error("Looking up a typed spot isn't set up (VITE_MAPBOX_TOKEN is missing). Tap “I'm here now” instead.");
        }
        const found = await geocodeLocation(draft.place, "", { token: MAPBOX_TOKEN });
        if (found.status === "none") {
          throw new Error(`Couldn't find “${draft.place.trim()}” on the map. Add the street or city, or tap “I'm here now”.`);
        }
        lat = found.lat;
        lng = found.lng;
        const where = await reverseGeocode(lat, lng, { token: MAPBOX_TOKEN });
        area = where.area || area;
      }
      const id = await postLinkup({ ...draft, lat, lng, area }, user.id);
      onToast("⚡ Linkup's up — people nearby are getting a heads-up");
      onPosted(id);
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  return (
    <Sheet onClose={onClose} label="Start a linkup" zIndex={270}>
      <div style={sheetTitle}>START A LINKUP</div>
      <div style={{ ...muted, marginTop: 2 }}>Heading out in the next 2 hours? See who wants to come.</div>

      <div style={{ ...label, marginTop: 16 }}>WHAT</div>
      <div style={{ display: "flex", gap: 6 }}>
        {LINKUP_KINDS.map((k) => (
          <Chip key={k.id} active={draft.kind === k.id} onClick={() => set({ kind: k.id })}>
            {k.emoji} {k.label.toUpperCase()}
          </Chip>
        ))}
      </div>

      <div style={{ ...label, marginTop: 16 }}>STARTING</div>
      <div style={{ display: "flex", gap: 6 }}>
        {WHEN.map(([m, text]) => (
          <Chip key={m} active={draft.startsInMinutes === m} onClick={() => set({ startsInMinutes: m })}>
            {text}
          </Chip>
        ))}
      </div>

      <div style={{ ...label, marginTop: 12 }}>FOR ABOUT</div>
      <div style={{ display: "flex", gap: 6 }}>
        {LENGTH.map(([h, text]) => (
          <Chip key={h} active={draft.hours === h} onClick={() => set({ hours: h })}>
            {text}
          </Chip>
        ))}
      </div>

      <div style={{ ...label, marginTop: 16 }}>WHERE</div>
      <input
        style={field}
        placeholder="Spot or address, e.g. Jackson St Bridge"
        maxLength={120}
        value={draft.place}
        onChange={(e) => {
          set({ place: e.target.value });
          // A different spot typed in: look it up instead of using the phone's.
          if (fromGps) setFromGps(false);
        }}
      />
      <button disabled={busy === "gps"} onClick={hereNow} style={{ ...quietButton, marginTop: 8, padding: "10px 0" }}>
        {busy === "gps" ? "FINDING YOU…" : fromGps ? `📍 USING WHERE YOU ARE${draft.area ? ` · ${draft.area.toUpperCase()}` : ""}` : "📍 I'M HERE NOW"}
      </button>

      <div style={{ ...label, marginTop: 16 }}>THE PLAN (OPTIONAL)</div>
      <textarea
        style={{ ...field, minHeight: 64, resize: "vertical" }}
        placeholder="e.g. Rollers on the bridge, then food. Bring your own snacks."
        maxLength={280}
        value={draft.note}
        onChange={(e) => set({ note: e.target.value })}
      />

      <div style={{ ...label, marginTop: 16 }}>WHO SEES THE SPOT</div>
      <div style={{ display: "flex", gap: 8 }}>
        {[
          ["public", "🌐 PUBLIC", "Anyone signed in sees the spot and can join."],
          ["private", "🔒 PRIVATE", "People see the area and time. You approve who gets the spot."],
        ].map(([id, title, sub]) => (
          <button
            key={id}
            type="button"
            aria-pressed={draft.visibility === id}
            onClick={() => set({ visibility: id })}
            style={{
              flex: 1,
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              cursor: "pointer",
              background: draft.visibility === id ? "rgba(0, 128, 240,0.12)" : "#141414",
              border: `1px solid ${draft.visibility === id ? "#0080F0" : "#2A2A2A"}`,
              color: "#E6E6E6",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.8 }}>{title}</div>
            <div style={{ ...muted, fontSize: 11.5, lineHeight: 1.4, marginTop: 2 }}>{sub}</div>
          </button>
        ))}
      </div>

      <div style={{ ...label, marginTop: 16 }}>YOU'RE COMING AS</div>
      <div style={{ display: "flex", gap: 6 }}>
        {GOING_AS.map((g) => (
          <Chip key={g.id} active={draft.goingAs === g.id} onClick={() => set({ goingAs: g.id })}>
            {g.label}
          </Chip>
        ))}
      </div>

      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 12 }}>{error}</div>}
      <button disabled={busy === "post"} onClick={submit} style={{ ...bigButton, marginTop: 16 }}>
        {busy === "post" ? "POSTING…" : "⚡ START LINKUP"}
      </button>
      <div style={{ ...muted, fontSize: 11.5, textAlign: "center", marginTop: 8 }}>
        People with linkup alerts on nearby get a heads-up. You can cancel any time.
      </div>
    </Sheet>
  );
}
