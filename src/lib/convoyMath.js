// The maths behind a convoy's live map (Convoy.jsx), pure so it's tested in
// test/convoy.test.js: who's where, who's fallen behind, when a phone should
// send its position, and how to frame everyone on the map (or on the radar
// when there's no Mapbox key).

import { haversineMiles } from "./geo.js";

// A position older than this is shown faded ("last seen 2 min ago").
export const STALE_SECONDS = 45;
// Further than this from the leader counts as falling behind.
export const BEHIND_MILES = 1;

export const cleanConvoyCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

const t = (iso) => new Date(iso).getTime();

export function ageSeconds(at, nowMs) {
  if (!at) return null;
  const ms = t(at);
  return Number.isFinite(ms) ? Math.max(0, Math.round((nowMs - ms) / 1000)) : null;
}

export function lastSeen(at, nowMs) {
  const s = ageSeconds(at, nowMs);
  if (s === null) return "not sharing";
  if (s < STALE_SECONDS) return "live";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  return "over an hour ago";
}

// Each member, ready for the list and the map.
//   { id, name, car, avatar, leader, me, pos, live, seen, fromMe, fromLeader, behind }
export function convoyMembers(state, myId, nowMs) {
  if (!state?.members) return [];
  const leader = state.members.find((m) => m.user_id === state.leader_id);
  const me = state.members.find((m) => m.user_id === myId);
  const dist = (a, b) => (a?.pos && b?.pos ? haversineMiles(a.pos.lat, a.pos.lng, b.pos.lat, b.pos.lng) : null);
  return state.members.map((m) => {
    const age = m.pos ? ageSeconds(m.pos.at, nowMs) : null;
    const live = age !== null && age < STALE_SECONDS;
    const fromLeader = m.user_id === state.leader_id ? 0 : dist(m, leader);
    return {
      id: m.user_id,
      name: m.username || "driver",
      car: m.car || "",
      avatar: m.avatar_url || null,
      leader: m.user_id === state.leader_id,
      me: m.user_id === myId,
      pos: m.pos || null,
      live,
      seen: m.pos ? lastSeen(m.pos.at, nowMs) : "not sharing",
      fromMe: m.user_id === myId ? 0 : dist(m, me),
      fromLeader,
      behind: live && fromLeader !== null && fromLeader > BEHIND_MILES,
    };
  });
}

// "You and @slow.s2k have fallen behind (3.3 mi back)", or "".
export function behindLine(rows) {
  const behind = rows.filter((m) => m.behind).sort((a, b) => Boolean(b.me) - Boolean(a.me));
  if (!behind.length) return "";
  const names = behind.map((m) => (m.me ? "You" : `@${m.name}`));
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  const verb = names.length > 1 || behind[0].me ? "have" : "has";
  const back = Math.max(...behind.map((m) => m.fromLeader));
  return `${who} ${verb} fallen behind the leader (${back < 10 ? back.toFixed(1) : Math.round(back)} mi back)`;
}

// Send a new position? At most every 3 s, and only when we've moved 15 m or
// more, or 20 s have passed (so a parked car still shows as live).
export function shouldSend(last, next, nowMs) {
  if (!next) return false;
  if (!last) return true;
  const since = nowMs - last.sentAt;
  if (since < 3000) return false;
  const movedM = (haversineMiles(last.lat, last.lng, next.lat, next.lng) ?? 0) * 1609.34;
  return movedM >= 15 || since >= 20000;
}

// What the browser's geolocation gives, as we send it.
export function fromCoords(c) {
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  return {
    lat: c.latitude,
    lng: c.longitude,
    heading: Number.isFinite(c.heading) && c.heading >= 0 ? c.heading % 360 : null,
    speedMph: Number.isFinite(c.speed) && c.speed >= 0 ? Math.round(c.speed * 2.23694) : null,
    accuracyM: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
  };
}

// The box around everyone with a position: [[west, south], [east, north]],
// never smaller than ~0.6 mi across so one car isn't zoomed in to the curb.
export function boundsOf(points) {
  const ps = points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!ps.length) return null;
  let w = Math.min(...ps.map((p) => p.lng)), e = Math.max(...ps.map((p) => p.lng));
  let s = Math.min(...ps.map((p) => p.lat)), n = Math.max(...ps.map((p) => p.lat));
  const min = 0.005;
  if (n - s < min) [s, n] = [(s + n) / 2 - min, (s + n) / 2 + min];
  if (e - w < min) [w, e] = [(w + e) / 2 - min, (w + e) / 2 + min];
  return [[w, s], [e, n]];
}

// The radar (no map): everyone placed around a centre point, the furthest
// at 85% of the radius. Returns [{ ...point, x, y }] in a size×size box and
// the scale in miles for the rings.
export function radar(points, center, size) {
  const ps = points.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!center || !ps.length) return { dots: [], miles: 0.5 };
  const mPerLat = 69.0, mPerLng = 69.17 * Math.cos((center.lat * Math.PI) / 180);
  const rel = ps.map((p) => ({ p, dx: (p.lng - center.lng) * mPerLng, dy: (p.lat - center.lat) * mPerLat }));
  const far = Math.max(0.25, ...rel.map((r) => Math.hypot(r.dx, r.dy)));
  const miles = niceMiles(far);
  const r = (size / 2) * 0.85;
  return {
    miles,
    dots: rel.map(({ p, dx, dy }) => ({ ...p, x: size / 2 + (dx / miles) * r, y: size / 2 - (dy / miles) * r })),
  };
}

// A tidy ring distance at or above d: 0.25, 0.5, 1, 2, 5, 10, 25, 50 …
export function niceMiles(d) {
  for (const n of [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250]) if (d <= n) return n;
  return Math.ceil(d / 100) * 100;
}
