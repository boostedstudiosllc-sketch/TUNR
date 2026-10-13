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
  isHappeningNow,
  startsInLabel,
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

// --- happening-now / countdown ---------------------------------------------
// 2026-08-01 is a Saturday. Times below are ET expressed as UTC instants, so
// these assertions hold whatever timezone the test runner is in.
const at = (utc) => new Date(utc);

test("isHappeningNow is true between start and end", () => {
  // Road Atlanta runs 9:00–16:00 ET = 13:00–20:00 UTC.
  assert.equal(isHappeningNow(roadAtlanta, at("2026-08-01T14:00:00Z")), true);
  assert.equal(isHappeningNow(roadAtlanta, at("2026-08-01T12:59:00Z")), false);
  assert.equal(isHappeningNow(roadAtlanta, at("2026-08-01T20:01:00Z")), false);
});

test("isHappeningNow follows a recurring meet to its own day", () => {
  // Locals & Legends is every Thursday 18:00–21:00 ET. Thu 2026-08-13 is a
  // later week than the one the row was written for.
  assert.equal(isHappeningNow(localsLegends, at("2026-08-13T23:00:00Z")), true);
  assert.equal(isHappeningNow(localsLegends, at("2026-08-13T21:00:00Z")), false);
});

test("startsInLabel counts down in minutes then hours", () => {
  assert.equal(startsInLabel(roadAtlanta, at("2026-08-01T12:30:00Z")), "IN 30 MIN");
  assert.equal(startsInLabel(roadAtlanta, at("2026-08-01T12:00:00Z")), "IN 1H");
  assert.equal(startsInLabel(roadAtlanta, at("2026-08-01T11:45:00Z")), "IN 1H 15M");
});

test("startsInLabel says ON NOW once it has started", () => {
  assert.equal(startsInLabel(roadAtlanta, at("2026-08-01T14:00:00Z")), "ON NOW");
});

test("startsInLabel stays quiet more than a day out and after the end", () => {
  assert.equal(startsInLabel(roadAtlanta, at("2026-07-30T13:00:00Z")), null);
  assert.equal(startsInLabel(roadAtlanta, at("2026-08-01T21:00:00Z")), null);
});

test("startsInLabel handles a meet with no end time", () => {
  const noEnd = ev({ start: "2026-08-01T09:00", end: null });
  assert.equal(startsInLabel(noEnd, at("2026-08-01T12:30:00Z")), "IN 30 MIN");
  // No end means it counts as running until midnight at the venue.
  assert.equal(isHappeningNow(noEnd, at("2026-08-01T20:00:00Z")), true);
});

// --- nth-weekday recurrence ------------------------------------------------
// Half the regular Georgia meets are "second Sunday" or "last Saturday", which
// the original monthly:first-only format could not express.
const secondSunday = ev({ start: "2026-08-09T08:00", end: "2026-08-09T11:00", recurrence: "monthly:second:SUN" });
const lastSaturday = ev({ start: "2026-08-29T09:00", end: "2026-08-29T12:00", recurrence: "monthly:last:SAT" });

test("monthly:second finds the second matching weekday", () => {
  // August 2026 Sundays: 2, 9, 16, 23, 30.
  assert.equal(nextOccurrenceKey(secondSunday, new Date("2026-08-06T12:00:00Z")), "2026-08-09");
  // Once it has passed, roll to next month. September 2026 Sundays: 6, 13, ...
  assert.equal(nextOccurrenceKey(secondSunday, new Date("2026-08-20T12:00:00Z")), "2026-09-13");
});

test("monthly:last counts back from the end of the month", () => {
  // August 2026 Saturdays: 1, 8, 15, 22, 29.
  assert.equal(nextOccurrenceKey(lastSaturday, new Date("2026-08-06T12:00:00Z")), "2026-08-29");
  // September 2026 Saturdays: 5, 12, 19, 26.
  assert.equal(nextOccurrenceKey(lastSaturday, new Date("2026-08-30T12:00:00Z")), "2026-09-26");
});

test("monthly:last is not the same as monthly:fourth when there are five", () => {
  const fourth = ev({ start: "2026-08-22T09:00", recurrence: "monthly:fourth:SAT" });
  const now = new Date("2026-08-06T12:00:00Z");
  assert.equal(nextOccurrenceKey(fourth, now), "2026-08-22");
  assert.equal(nextOccurrenceKey(lastSaturday, now), "2026-08-29");
});

test("monthly:first still behaves as before", () => {
  assert.equal(nextOccurrenceKey(caffeineOctane, new Date("2026-08-20T12:00:00Z")), "2026-09-06");
});

test("displayDate labels each nth variant", () => {
  assert.equal(displayDate(secondSunday), "2ND SUNDAY/MO");
  assert.equal(displayDate(lastSaturday), "LAST SATURDAY/MO");
  assert.equal(displayDate(caffeineOctane), "1ST SUNDAY/MO");
});

test("a month with no fifth weekday rolls forward instead of breaking", () => {
  // February 2027 has only four Mondays, so monthly:fourth is its last one.
  const fourthMon = ev({ start: "2027-02-22T18:00", recurrence: "monthly:fourth:MON" });
  assert.equal(nextOccurrenceKey(fourthMon, new Date("2027-02-01T12:00:00Z")), "2027-02-22");
});

// --- seasonal series ---------------------------------------------------------

test("a seasonal weekly series stops after its last date", () => {
  const seasonal = ev({
    start: "2026-08-13T18:00",
    end: "2026-08-13T21:00",
    recurrence: "weekly:THU",
    recurrenceUntil: "2026-11-05",
  });
  // Sat Oct 31 2026: the Nov 5 session is still in season.
  const oct31 = new Date("2026-10-31T16:00:00Z");
  assert.equal(nextOccurrenceKey(seasonal, oct31), "2026-11-05");
  assert.equal(isPast(seasonal, oct31), false);
  // Sat Nov 7: the next Thursday (Nov 12) is past the season.
  const nov7 = new Date("2026-11-07T16:00:00Z");
  assert.equal(nextOccurrenceKey(seasonal, nov7), null);
  assert.equal(isPast(seasonal, nov7), true);
  assert.equal(isToday(seasonal, nov7), false);
});

test("a monthly series that ended in September is past by October", () => {
  const tinCup = ev({
    start: "2026-08-06T18:00",
    end: "2026-08-06T20:00",
    recurrence: "monthly:first:THU",
    recurrenceUntil: "2026-09-03",
  });
  assert.equal(isPast(tinCup, new Date("2026-10-10T14:00:00Z")), true);
  assert.equal(isPast(tinCup, new Date("2026-09-01T14:00:00Z")), false);
});

test("a series without a last date never goes past", () => {
  assert.equal(isPast(localsLegends, new Date("2027-06-01T14:00:00Z")), false);
});

test("occurrencesInMonth lays a meet out across a calendar month", async () => {
  const { occurrencesInMonth } = await import("../src/lib/dates.js");
  const weekly = { start: "2026-09-05T19:00", recurrence: "weekly:SAT", timezone: "America/New_York" };
  assert.deepEqual(occurrencesInMonth(weekly, 2026, 10), ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  // Not before the series started.
  assert.deepEqual(occurrencesInMonth(weekly, 2026, 8), []);
  // Season end cuts it off mid-month.
  assert.deepEqual(occurrencesInMonth({ ...weekly, recurrenceUntil: "2026-10-17" }, 2026, 10), ["2026-10-03", "2026-10-10", "2026-10-17"]);
  // Monthly nth weekday, including "last".
  assert.deepEqual(occurrencesInMonth({ start: "2026-01-10T18:00", recurrence: "monthly:second:SAT" }, 2026, 10), ["2026-10-10"]);
  assert.deepEqual(occurrencesInMonth({ start: "2026-01-10T18:00", recurrence: "monthly:last:FRI" }, 2026, 10), ["2026-10-30"]);
  // One-off: only in its own month.
  const once = { start: "2026-10-24T18:00" };
  assert.deepEqual(occurrencesInMonth(once, 2026, 10), ["2026-10-24"]);
  assert.deepEqual(occurrencesInMonth(once, 2026, 11), []);
  assert.deepEqual(occurrencesInMonth({ start: null }, 2026, 10), []);
});
