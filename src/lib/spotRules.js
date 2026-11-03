// Photo spots: the words and the sorting for the discover screen
// (PhotoSpots.jsx) and the spot form (PostForm.jsx). Pure, so it's tested in
// test/photoSpots.test.js. The rules live in 116_photo_spots.sql.

import { haversineMiles, formatMiles } from "./geo.js";

// The kind of shot a spot gives (forum_posts.spot_vibes, up to 4).
export const VIBES = [
  ["skyline", "🏙️", "Skyline"],
  ["industrial", "🏭", "Industrial"],
  ["bridge", "🌉", "Bridge"],
  ["mural", "🎨", "Murals"],
  ["nature", "🌲", "Nature"],
  ["rooftop", "🅿️", "Rooftop deck"],
  ["tunnel", "🚇", "Tunnel"],
  ["night_lights", "🌃", "Night lights"],
  ["rollers", "🛣️", "Rollers road"],
  ["water", "🌊", "Water"],
  ["lot", "🏁", "Big lot"],
];
export const MAX_VIBES = 4;

export const BEST_TIMES = [
  ["sunrise", "🌅", "Sunrise"],
  ["day", "☀️", "Daytime"],
  ["golden", "🌇", "Golden hour"],
  ["blue", "🌆", "Blue hour"],
  ["night", "🌙", "Night"],
];

// How security treats you there.
export const SECURITY = [
  ["chill", "🟢", "Chill", "Nobody bothers you"],
  ["quick", "🟡", "Shoot quick", "You may get moved on"],
  ["ask", "🔴", "Ask first", "Get permission before you shoot"],
];

const lookup = (list) => Object.fromEntries(list.map(([id, ...rest]) => [id, rest]));
const V = lookup(VIBES), T = lookup(BEST_TIMES), S = lookup(SECURITY);
export const vibeLabel = (id) => (V[id] ? `${V[id][0]} ${V[id][1]}` : "");
export const timeLabel = (id) => (T[id] ? `${T[id][0]} ${T[id][1]}` : "");
export const securityOf = (id) => (S[id] ? { icon: S[id][0], name: S[id][1], blurb: S[id][2] } : null);

// Add or remove a vibe, never more than 4.
export function toggleVibe(list, id) {
  if (list.includes(id)) return list.filter((v) => v !== id);
  if (list.length >= MAX_VIBES || !V[id]) return list;
  return [...list, id];
}

export const SORTS = [
  ["near", "📍 Near me"],
  ["top", "🔥 Top rated"],
  ["new", "🆕 New"],
  ["saved", "♡ Saved"],
];

// Filter and sort the spots for the list. Adds miles and milesLabel when we
// know where you are. opts: { sort, vibe, time, query, position }.
export function arrangeSpots(spots, opts = {}) {
  const { sort = "top", vibe = null, time = null, query = "", position = null } = opts;
  const q = query.trim().toLowerCase();
  let list = (spots || []).map((s) => {
    const miles = position ? haversineMiles(position.lat, position.lng, s.lat, s.lng) : null;
    return { ...s, miles, milesLabel: miles == null ? null : formatMiles(miles) };
  });
  if (vibe) list = list.filter((s) => (s.spot_vibes || []).includes(vibe));
  if (time) list = list.filter((s) => s.spot_best_time === time);
  if (q) list = list.filter((s) => `${s.title} ${s.place || ""} ${s.body || ""}`.toLowerCase().includes(q));
  if (sort === "saved") list = list.filter((s) => s.saved);
  const byTop = (a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.saves ?? 0) - (a.saves ?? 0) || Date.parse(b.created_at) - Date.parse(a.created_at);
  const cmp =
    sort === "near" && position
      ? (a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity)
      : sort === "new"
        ? (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
        : byTop;
  return list.sort(cmp);
}

export const directionsUrl = (s) => `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${s.lat},${s.lng}`;
