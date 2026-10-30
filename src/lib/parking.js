// Where I parked: the 🅿️ in the header. One saved spot per phone: where on
// the map (GPS, when the phone allows it), and what GPS can't tell inside a
// garage: the floor, the spot or section, a photo of the sign and a note.
// Kept only on this phone (localStorage), never sent to TUNR.
//
// A web app can't read the phone's pressure sensor, so the floor is tapped
// in. (A native app could guess it from the change in air pressure since
// you drove in; see docs/DEVELOPER_HANDOFF.md, section 8.)

import { haversineMiles } from "./geo.js";

export const PARKED_KEY = "tunr.parked";
export const OPEN_EVENT = "tunr:parked"; // window event: open the 🅿️ sheet; detail { meet: { id, title } }

// Floor buttons, bottom to top. Anything else goes in "Other".
export const FLOORS = ["B3", "B2", "B1", "G", "1", "2", "3", "4", "5", "6", "7", "8", "Roof"];

// "Level 3", "Basement 2", "Ground", "Roof", or whatever was typed.
export function floorName(floor) {
  const f = String(floor || "").trim();
  if (!f) return "";
  if (/^B\d+$/i.test(f)) return `Basement ${f.slice(1)}`;
  if (/^G$/i.test(f)) return "Ground";
  if (/^\d+$/.test(f)) return `Level ${f}`;
  if (/^roof$/i.test(f)) return "Roof";
  return f;
}

// One line for the toast and the header: "Level 3 · C14".
export function parkedSummary(spot) {
  if (!spot) return "";
  return [floorName(spot.floor), spot.space].filter(Boolean).join(" · ") || (spot.lat != null ? "Pinned on the map" : "Saved");
}

// Cleans what the form gives: { lat, lng, accuracy, floor, space, note, photo, meet }.
export function makeSpot(input, now = Date.now()) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const text = (v, max) => String(v || "").trim().slice(0, max) || null;
  const spot = {
    lat: num(input.lat),
    lng: num(input.lng),
    accuracy: num(input.accuracy) == null ? null : Math.round(input.accuracy),
    floor: text(input.floor, 20),
    space: text(input.space, 40),
    note: text(input.note, 200),
    photo: typeof input.photo === "string" && input.photo.startsWith("data:image/") ? input.photo : null,
    meet: input.meet?.id ? { id: String(input.meet.id), title: text(input.meet.title, 80) } : null,
    savedAt: now,
  };
  if (spot.lat == null || spot.lng == null) spot.lat = spot.lng = spot.accuracy = null;
  if (spot.lat == null && !spot.floor && !spot.space && !spot.note && !spot.photo) throw new Error("Add the floor, the spot or a photo (location isn't on).");
  return spot;
}

export function loadSpot(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PARKED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Couldn't read where you parked:", e.message);
    return null;
  }
}

// Saves the spot. If the phone is out of room, saves it without the photo
// and says so (returns { spot, droppedPhoto }).
export function saveSpot(spot, storage = globalThis.localStorage) {
  if (!storage) throw new Error("This browser can't save anything on the phone (private browsing?).");
  try {
    storage.setItem(PARKED_KEY, JSON.stringify(spot));
    return { spot, droppedPhoto: false };
  } catch (e) {
    if (!spot.photo) throw new Error(`Couldn't save where you parked. (${e.message})`);
    const lighter = { ...spot, photo: null };
    try {
      storage.setItem(PARKED_KEY, JSON.stringify(lighter));
    } catch (e2) {
      throw new Error(`Couldn't save where you parked. (${e2.message})`);
    }
    return { spot: lighter, droppedPhoto: true };
  }
}

export function clearSpot(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(PARKED_KEY);
  } catch (e) {
    console.warn("Couldn't clear where you parked:", e.message);
  }
}

// Walking directions back to the car (Google Maps), or null with no pin.
export function walkUrl(spot) {
  if (spot?.lat == null || spot?.lng == null) return null;
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${spot.lat},${spot.lng}`;
}

// "450 ft away", "0.4 mi away", or null when either position is unknown.
export function distanceText(spot, here) {
  if (spot?.lat == null || here?.lat == null) return null;
  const mi = haversineMiles(here.lat, here.lng, spot.lat, spot.lng);
  if (!Number.isFinite(mi)) return null;
  const ft = mi * 5280;
  if (ft < 60) return "You're right by it";
  if (ft < 1000) return `${Math.round(ft / 10) * 10} ft away`;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away`;
}

// "just now", "25 min ago", "3 hr ago", "2 days ago".
export function savedAgo(savedAt, now = Date.now()) {
  const min = Math.max(0, Math.round((now - savedAt) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.round(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Ask the header's 🅿️ to open (from a meet page or after a check-in).
export function openParked(meet = null) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { meet } }));
}
