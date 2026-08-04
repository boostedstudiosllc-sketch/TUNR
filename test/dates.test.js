import test from "node:test";
import assert from "node:assert/strict";
import {
  displayDate,
  displayTime,
  isToday,
  isThisWeekend,
  isPast,
  nextOccurrenceKey,
  sortKey,
} from "../src/lib/dates.js";

// Event times are wall-clock at the venue, so these must hold regardless of
// the viewer's timezone. Run under TZ=UTC, TZ=Asia/Tokyo, etc. and the
// expectations do not change — that's the point.
const TZ = "America/New_York";
const ev = (o) => ({ timezone: TZ, recurrence: null, ...o });

const roadAtlanta = ev({ start: "2026-08-01T09:00", end: "2026-08-01T16:00" });
const hightech = ev({ start: "2026-08-01T18:00", end: "2026-08-01T22:00" });
const caffeineOctane = ev({
  start: "2026-08-02T09:00",
  end: "2026-08-02T11:30",
  recurrence: "monthly:first:SUN",
});
const localsLegends = ev({
  start: "2026-08-06T18:00",
  end: "2026-08-06T21:00",
  recurrence: "weekly:THU",
});
const roswell = ev({ start: "2026-08-01T08:00", end: "2026-08-01T10:00", recurrence: "weekly:SAT" });
const torq = ev({ start: "2026-08-22T12:00", end: "2026-08-22T15:00" });
const julyPast = ev({ start: "2026-07-31T20:00", end: "2026-07-31T23:00" });
const dateTbc = ev({ start: null, end: null });

// Saturday Aug 1 2026, 10:00 AM Eastern.
const now = new Date("2026-08-01T14:00:00Z");

test("renders times in the venue's timezone, not the viewer's", () => {
  assert.equal(displayTime(roadAtlanta), "9:00 AM");
  assert.equal(displayTime(hightech), "6:00 PM");
  assert.equal(displayTime(torq), "12:00 PM");
});

test("renders one-off dates", () => {
  assert.equal(displayDate(roadAtlanta), "SAT AUG 1");
  assert.equal(displayDate(torq), "SAT AUG 22");
});

test("labels recurring meets by their cadence", () => {
  assert.equal(displayDate(localsLegends), "EVERY THURSDAY");
  assert.equal(displayDate(caffeineOctane), "1ST SUNDAY/MO");
});

test("labels events with no date as TBC", () => {
  assert.equal(displayDate(dateTbc), "DATE TBC");
  assert.equal(displayTime(dateTbc), "TBC");
});

test("isToday covers one-off and weekly events", () => {
  assert.ok(isToday(roadAtlanta, now));
  assert.ok(isToday(roswell, now), "weekly Saturday meet falls on this Saturday");
  assert.ok(!isToday(caffeineOctane, now), "Aug 2 is tomorrow, not today");
});

test("isThisWeekend spans Saturday and Sunday", () => {
  assert.ok(isThisWeekend(caffeineOctane, now));
  assert.ok(isThisWeekend(roswell, now));
  assert.ok(!isThisWeekend(torq, now), "Aug 22 is a later weekend");
});

test("weekly recurrence finds the next matching day", () => {
  assert.equal(nextOccurrenceKey(localsLegends, now), "2026-08-06");
});

test("monthly recurrence rolls into the next month once passed", () => {
  const aug3 = new Date("2026-08-03T14:00:00Z");
  assert.equal(nextOccurrenceKey(caffeineOctane, aug3), "2026-09-06");
});

test("isPast hides finished one-offs but not recurring or undated ones", () => {
  assert.ok(isPast(julyPast, now));
  assert.ok(!isPast(roadAtlanta, now), "still running until 4 PM");
  assert.ok(!isPast(dateTbc, now), "undated events are never past");
  assert.ok(!isPast(localsLegends, now), "recurring events are never past");
});

test("undated events sort last", () => {
  assert.ok(sortKey(dateTbc, now) > sortKey(torq, now));
});
