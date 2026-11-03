import { test } from "node:test";
import assert from "node:assert/strict";
import { newParkWatch, noteFix, STILL_SECONDS, TAKE_BACK_SECONDS } from "../src/lib/driveEnd.js";

const T0 = Date.parse("2026-11-03T17:00:00Z");
// Feed fixes: [secondsFromStart, lat, lng, mph]. Returns every event.
function run(fixes, w = newParkWatch()) {
  const events = [];
  for (const [s, lat, lng, mph] of fixes) {
    const r = noteFix(w, { lat, lng, speedMph: mph, accuracyM: 6, at: T0 + s * 1000 });
    w = r.watch;
    if (r.event) events.push({ s, ...r.event });
  }
  return { events, w };
}

// A drive north up Roswell Rd, then parked in a lot.
const drive = [
  [0, 33.9, -84.38, 35],
  [10, 33.903, -84.38, 38],
  [20, 33.906, -84.38, 30],
  [30, 33.9065, -84.3801, 4],
];
const parked = (from, to, step = 10) => Array.from({ length: (to - from) / step + 1 }, (_, i) => [from + i * step, 33.90652, -84.38012, 0]);

test("saves where you stopped, two minutes after you stop", () => {
  const { events } = run([...drive, ...parked(40, 40 + STILL_SECONDS + 20)]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "parked");
  assert.equal(events[0].s, 30 + STILL_SECONDS, "two minutes after the first still fix, not later");
  assert.deepEqual([events[0].spot.lat, events[0].spot.lng], [33.9065, -84.3801], "the spot where the car stopped");
});

test("no parking without a drive first (walking around, sitting at home)", () => {
  const { events } = run(parked(0, 600));
  assert.deepEqual(events, []);
});

test("once per drive: staying parked doesn't save it again", () => {
  const { events } = run([...drive, ...parked(40, 900)]);
  assert.equal(events.filter((e) => e.type === "parked").length, 1);
});

test("getting back in to leave never saves a spot (the Google Maps mistake)", () => {
  const first = run([...drive, ...parked(40, 400)]);
  // An hour later: walk back, start the car, drive off.
  const back = run(
    [
      [3600, 33.90652, -84.38012, 0],
      [3610, 33.9066, -84.3802, 6],
      [3620, 33.908, -84.381, 28],
      [3630, 33.911, -84.382, 40],
    ],
    first.w
  );
  assert.deepEqual(back.events, [], "leaving is not parking, and an hour later it's a real spot: keep it");
});

test("a long red light or a jam: driving off within 3 minutes takes the spot back", () => {
  const { events } = run([...drive, ...parked(40, 40 + STILL_SECONDS), [40 + STILL_SECONDS + TAKE_BACK_SECONDS - 30, 33.91, -84.38, 25]]);
  assert.deepEqual(events.map((e) => e.type), ["parked", "drove_off"]);
});

test("then the next stop after that drive is saved", () => {
  const { events } = run([...drive, ...parked(40, 200), [230, 33.91, -84.38, 25], [240, 33.92, -84.38, 30], ...parked(250, 250 + STILL_SECONDS).map(([s]) => [s, 33.925, -84.38, 0])]);
  assert.deepEqual(events.map((e) => e.type), ["parked", "drove_off", "parked"]);
  assert.equal(events[2].spot.lat, 33.925);
});

test("works when the phone doesn't report speed", () => {
  const noSpeed = drive.map(([s, lat, lng]) => [s, lat, lng, null]);
  const { events } = run([...noSpeed, ...parked(40, 200).map(([s, lat, lng]) => [s, lat, lng, null])]);
  assert.equal(events.length, 1);
});

test("bad fixes are ignored", () => {
  const w = newParkWatch();
  assert.deepEqual(noteFix(w, null), { watch: w, event: null });
  assert.deepEqual(noteFix(w, { lat: NaN, lng: 1, at: T0 }).event, null);
});
