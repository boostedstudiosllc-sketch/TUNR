import { test } from "node:test";
import assert from "node:assert/strict";
import { safeLink, isExternal, whenLabel, startOf, hotMeet, nextMine, buildSlides, MAX_SLIDES, THEME_IDS } from "../src/lib/slides.js";

// Wednesday Nov 18 2026, 2 PM in Atlanta.
const NOW = Date.parse("2026-11-18T19:00:00Z");
// Meets keep Atlanta wall-clock time ("2026-11-18T20:00"), like store.js.
const at = (h) => new Date(NOW + h * 3600e3).toLocaleString("sv-SE", { timeZone: "America/New_York" }).replace(" ", "T").slice(0, 16);
const ms = (h) => NOW + h * 3600e3;
const events = [
  { id: "cc", title: "Cars & Coffee", start: at(6), going: 40, location: "Lenox" }, // 8 PM today
  { id: "small", title: "Small meet", start: at(30), going: 2 },
  { id: "big", title: "Big Sunday", start: at(4 * 24 - 5), going: 120, flyerUrl: "https://x.supabase.co/f.jpg" },
  { id: "old", title: "Last week", start: at(-100), going: 500 },
  { id: "far", title: "Next month", start: at(24 * 30), going: 900 },
];

test("links: app links and https only", () => {
  assert.equal(safeLink("tab:perks"), "tab:perks");
  assert.equal(safeLink(" meet:abc-123 "), "meet:abc-123");
  assert.equal(safeLink("https://boostedstudios.com/shop"), "https://boostedstudios.com/shop");
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("http://insecure.com"), null);
  assert.equal(safeLink(""), null);
  assert.equal(isExternal("https://x.com"), true);
  assert.equal(isExternal("tab:perks"), false);
});

test("when a meet is, in words", () => {
  assert.equal(whenLabel(ms(6), NOW), "Tonight 8 PM");
  assert.equal(whenLabel(ms(-2), NOW), "Today 12 PM");
  assert.equal(whenLabel(ms(20), NOW), "Tomorrow 10 AM");
  assert.equal(whenLabel(ms(4 * 24 - 5), NOW), "Sun 9 AM");
  assert.equal(whenLabel(NaN, NOW), "");
});

test("the hottest meet this week, and your next one", () => {
  assert.equal(hotMeet(events, NOW).id, "big", "most going in the next 7 days; not last week, not next month");
  assert.equal(hotMeet([events[1]], NOW), null, "a 2-person meet isn't hot");
  assert.equal(nextMine(events, { cc: "going", big: "going" }, NOW).id, "cc");
  assert.equal(nextMine(events, { big: "going" }, NOW), null, "only the next two days");
  assert.equal(nextMine(events, { cc: "maybe" }, NOW), null);
});

test("the banner: your meet first, then admin slides, then the app's own", () => {
  const admin = [
    { id: "a2", title: "Second", link: "tab:perks", sort: 20, theme: "red" },
    { id: "a1", title: "First", link: "open:photo-spots", sort: 10, theme: "nope" },
    { id: "bad", title: "Bad", link: "javascript:x", sort: 0 },
  ];
  const slides = buildSlides({ admin, events, rsvps: { cc: "going" }, taco: { is_tuesday: true, pick: { open: true } }, pit: { on: true, today_done: false, streak: 4 }, now: NOW });
  assert.deepEqual(slides.map((s) => s.id), ["mine:cc", "a1", "a2", "hot:big", "taco", "pitstop"]);
  const twice = buildSlides({ admin: [{ id: "x", title: "Big one", link: "meet:big" }], events, now: NOW });
  assert.deepEqual(twice.map((s) => s.id), ["x"], "the same meet only once");
  assert.equal(slides[0].body, "Tonight 8 PM · Lenox. You're going.");
  assert.equal(slides[1].theme, "blue", "an unknown colour falls back to blue");
  assert.equal(slides[3].image, "https://x.supabase.co/f.jpg", "the meet's flyer");
  assert.equal(slides[5].kicker, "🔥 4-DAY STREAK");
});

test("nothing to say, nothing shown; never too many", () => {
  assert.deepEqual(buildSlides({ now: NOW }), []);
  assert.deepEqual(buildSlides({ pit: { on: true, today_done: true }, taco: { is_tuesday: false }, now: NOW }), []);
  const lots = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, title: `S${i}`, link: `meet:m${i}`, sort: i }));
  assert.equal(buildSlides({ admin: lots, now: NOW }).length, MAX_SLIDES);
  assert.ok(THEME_IDS.includes("night"));
});

test("meet times are read in the meet's own timezone", () => {
  assert.equal(startOf({ start: "2026-11-18T20:00" }), Date.parse("2026-11-19T01:00:00Z"), "8 PM in Atlanta");
  assert.equal(startOf({ start: "2026-11-18T20:00", timezone: "America/Chicago" }), Date.parse("2026-11-19T02:00:00Z"));
  assert.ok(Number.isNaN(startOf({ start: null })));
});
