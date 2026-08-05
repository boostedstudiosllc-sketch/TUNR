import test from "node:test";
import assert from "node:assert/strict";
import { haversineMiles, formatMiles, withDistances } from "../src/lib/geo.js";

// Downtown Atlanta.
const ATL = { lat: 33.749, lng: -84.388 };
// Town Center at Cobb, Kennesaw — where Caffeine & Octane runs.
const KENNESAW = { lat: 34.0227, lng: -84.588 };

test("computes a known distance to within a mile", () => {
  const miles = haversineMiles(ATL.lat, ATL.lng, KENNESAW.lat, KENNESAW.lng);
  // Straight-line Atlanta -> Kennesaw is a bit over 21 miles.
  assert.ok(miles > 20 && miles < 23, `expected ~21mi, got ${miles}`);
});

test("distance to the same point is zero", () => {
  assert.equal(haversineMiles(ATL.lat, ATL.lng, ATL.lat, ATL.lng), 0);
});

test("distance is symmetric", () => {
  const there = haversineMiles(ATL.lat, ATL.lng, KENNESAW.lat, KENNESAW.lng);
  const back = haversineMiles(KENNESAW.lat, KENNESAW.lng, ATL.lat, ATL.lng);
  assert.ok(Math.abs(there - back) < 1e-9);
});

test("returns null for missing or non-numeric coordinates", () => {
  assert.equal(haversineMiles(null, -84.388, 34.02, -84.58), null);
  assert.equal(haversineMiles(33.749, undefined, 34.02, -84.58), null);
  assert.equal(haversineMiles(33.749, -84.388, "34.02", -84.58), null);
  assert.equal(haversineMiles(NaN, -84.388, 34.02, -84.58), null);
});

test("formats distances by magnitude", () => {
  assert.equal(formatMiles(0.05), "< 0.1 mi");
  assert.equal(formatMiles(0.42), "0.4 mi");
  assert.equal(formatMiles(8.25), "8.3 mi");
  assert.equal(formatMiles(21.4), "21 mi");
  assert.equal(formatMiles(248), "248 mi");
});

test("formatMiles returns null for unusable input", () => {
  assert.equal(formatMiles(null), null);
  assert.equal(formatMiles(undefined), null);
  assert.equal(formatMiles(NaN), null);
  assert.equal(formatMiles(Infinity), null);
});

test("withDistances annotates events when position is known", () => {
  const events = [{ id: "a", lat: KENNESAW.lat, lng: KENNESAW.lng }];
  const [annotated] = withDistances(events, ATL);
  assert.ok(annotated.distanceMi > 20 && annotated.distanceMi < 23);
  assert.match(annotated.distanceLabel, /mi$/);
});

test("withDistances leaves events untouched without a position", () => {
  const events = [{ id: "a", lat: 34.02, lng: -84.58 }];
  assert.equal(withDistances(events, null), events);
  assert.equal(withDistances(events, {}), events);
});

test("withDistances skips events missing coordinates", () => {
  const events = [{ id: "no-coords", lat: null, lng: null }];
  const [result] = withDistances(events, ATL);
  assert.equal(result.distanceMi, undefined);
});
