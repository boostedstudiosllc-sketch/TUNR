// The swipeable banner at the top of Discover (HomeSlides.jsx): admins'
// slides (119_home_slides.sql) mixed with the app's own: your next meet,
// the hottest meet this week, TUNR Tuesdays and your Daily Pit Stop. Pure,
// so it's tested in test/slides.test.js.

import { parseLocal, DEFAULT_TZ } from "./dates.js";

export const THEMES = {
  blue: ["#0B1E3F", "#0A4F9C", "#0080F0"],
  purple: ["#1E0B3F", "#5B21B6", "#A855F7"],
  red: ["#3F0B0B", "#B91C1C", "#FB923C"],
  gold: ["#2A1F00", "#A16207", "#FACC15"],
  green: ["#052E16", "#15803D", "#4ADE80"],
  night: ["#05070C", "#111827", "#334155"],
};
export const THEME_IDS = Object.keys(THEMES);
export const MAX_SLIDES = 7;

// Where a button may go: an app link or an https address (as the database allows).
export function safeLink(link) {
  const s = String(link || "").trim();
  if (/^(tab|play|meet|linkup|post|forum|club|person|open):[A-Za-z0-9:_-]+$/.test(s) && s.length <= 300) return s;
  if (/^https:\/\/[^\s<>"]+$/.test(s) && s.length <= 300) return s;
  return null;
}
export const isExternal = (link) => /^https:/.test(link || "");

const DAY = 24 * 3600 * 1000;
const atl = (ms, opts) => new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York", ...opts });
const dayKey = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// A meet's start as a moment: meets keep their local wall-clock time
// ("2026-11-21T09:00") plus their timezone (store.js), not a UTC instant.
export function startOf(e) {
  const d = parseLocal(e?.start, e?.timezone || DEFAULT_TZ);
  return d ? d.getTime() : NaN;
}

// "Tonight 8 PM", "Tomorrow 9 AM", "Sat 9 AM", from a moment (ms).
export function whenLabel(t, now = Date.now()) {
  if (!Number.isFinite(t)) return "";
  const time = atl(t, { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  if (dayKey(t) === dayKey(now)) return `${Number(atl(t, { hour: "numeric", hour12: false })) % 24 >= 17 ? "Tonight" : "Today"} ${time}`;
  if (dayKey(t) === dayKey(now + DAY)) return `Tomorrow ${time}`;
  return `${atl(t, { weekday: "short" })} ${time}`;
}

const upcoming = (events, now, days) =>
  (events || []).filter((e) => {
    const t = startOf(e);
    return Number.isFinite(t) && t > now - 2 * 3600 * 1000 && t < now + days * DAY && !e.cancelled;
  });

// The meet with the most people going in the next week (5 or more).
export function hotMeet(events, now = Date.now()) {
  return upcoming(events, now, 7)
    .filter((e) => (e.going || 0) >= 5)
    .sort((a, b) => (b.going || 0) - (a.going || 0) || startOf(a) - startOf(b))[0] || null;
}

// Your next meet (going) in the next two days.
export function nextMine(events, rsvps, now = Date.now()) {
  return upcoming(events, now, 2)
    .filter((e) => rsvps?.[e.id] === "going")
    .sort((a, b) => startOf(a) - startOf(b))[0] || null;
}

// Everything for the banner, in order, at most MAX_SLIDES.
// admin: rows from home_slides; taco: { is_tuesday, pick: { open, my_choice } };
// pit: pit_stop_status().
export function buildSlides({ admin = [], events = [], rsvps = {}, taco = null, pit = null, now = Date.now() } = {}) {
  const out = [];
  const mine = nextMine(events, rsvps, now);
  if (mine) {
    out.push({ id: `mine:${mine.id}`, kicker: "YOUR NEXT MEET", title: mine.title, body: `${whenLabel(startOf(mine), now)}${mine.location ? ` · ${mine.location}` : ""}. You're going.`, cta: "See the meet", link: `meet:${mine.id}`, theme: "green", image: mine.flyerUrl || null, auto: true });
  }
  for (const s of [...admin].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
    const link = safeLink(s.link);
    if (!link) continue;
    out.push({ id: s.id, kicker: "NEW ON TUNR", title: s.title, body: s.body || "", cta: s.cta || "Open", link, theme: THEMES[s.theme] ? s.theme : "blue", image: s.image_url || null });
  }
  const hot = hotMeet(events, now);
  if (hot && hot.id !== mine?.id) {
    out.push({ id: `hot:${hot.id}`, kicker: "🔥 HOTTEST THIS WEEK", title: hot.title, body: `${hot.going} going · ${whenLabel(startOf(hot), now)}${hot.location ? ` · ${hot.location}` : ""}`, cta: "See the meet", link: `meet:${hot.id}`, theme: "red", image: hot.flyerUrl || null, auto: true });
  }
  if (taco?.is_tuesday && taco.pick?.open && !taco.pick.my_choice) {
    out.push({ id: "taco", kicker: "TODAY ONLY", title: "TUNR Tuesdays", body: "Make your free MORE or LESS pick for points.", cta: "Make my pick", link: "tab:perks", theme: "purple", auto: true });
  }
  if (pit?.on && !pit.today_done) {
    out.push({ id: "pitstop", kicker: pit.streak ? `🔥 ${pit.streak}-DAY STREAK` : "DAILY PIT STOP", title: "Claim today's point", body: "Every 7th day in a row pays a bonus.", cta: "Claim", link: "open:pitstop", theme: "gold", auto: true });
  }
  // One slide per meet (your next meet, or an admin's, beats the hot-meet one).
  const seen = new Set();
  return out.filter((s) => (!s.link.startsWith("meet:") ? true : seen.has(s.link) ? false : (seen.add(s.link), true))).slice(0, MAX_SLIDES);
}
