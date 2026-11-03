// Noticing you've parked, from the GPS fixes the convoy screen already gets
// while you share your location (Convoy.jsx). Pure, so it's tested in
// test/driveEnd.test.js.
//
// Done the way a "parking saved" alert should work (Google Maps sometimes
// pops it up when you get back in the car to leave):
//   - only after a real drive (12 mph or more),
//   - when you've then stayed within 40 m for 2 minutes,
//   - saving where you STOPPED (the first still fix), not where you are later,
//   - once per drive, and if you drive off again within 3 minutes (a jam or
//     a long light, not parking), the spot is taken back.

import { haversineMiles } from "./geo.js";

export const DRIVING_MPH = 12;
export const STILL_RADIUS_M = 40;
export const STILL_SECONDS = 120;
export const TAKE_BACK_SECONDS = 180;

const metres = (a, b) => (haversineMiles(a.lat, a.lng, b.lat, b.lng) ?? 0) * 1609.34;

export const newParkWatch = () => ({ drove: false, still: null, parkedAt: null, prev: null });

// fix: { lat, lng, speedMph (may be null), accuracyM, at (ms) }.
// Returns { watch, event } where event is null, { type: "parked", spot }
// or { type: "drove_off" } (take the spot back).
export function noteFix(watch, fix) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(fix.at)) return { watch, event: null };
  const w = { ...watch };
  // Phones don't always report speed; work it out from the last fix then.
  let mph = Number.isFinite(fix.speedMph) ? fix.speedMph : null;
  if (mph == null && w.prev && fix.at > w.prev.at) mph = (metres(w.prev, fix) / ((fix.at - w.prev.at) / 1000)) * 2.23694;
  w.prev = { lat: fix.lat, lng: fix.lng, at: fix.at };

  if (mph != null && mph >= DRIVING_MPH) {
    const tookBack = w.parkedAt != null && fix.at - w.parkedAt <= TAKE_BACK_SECONDS * 1000;
    w.drove = true;
    w.still = null;
    w.parkedAt = null;
    return { watch: w, event: tookBack ? { type: "drove_off" } : null };
  }
  if (!w.drove || w.parkedAt != null) return { watch: w, event: null };

  if (!w.still || metres(w.still, fix) > STILL_RADIUS_M) {
    w.still = { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM ?? null, at: fix.at };
    return { watch: w, event: null };
  }
  if (fix.at - w.still.at >= STILL_SECONDS * 1000) {
    w.parkedAt = fix.at;
    w.drove = false; // needs a new drive before the next one
    return { watch: w, event: { type: "parked", spot: { lat: w.still.lat, lng: w.still.lng, accuracy: w.still.accuracyM } } };
  }
  return { watch: w, event: null };
}
