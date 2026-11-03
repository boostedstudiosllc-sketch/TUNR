import { test } from "node:test";
import assert from "node:assert/strict";
import { VIBES, MAX_VIBES, vibeLabel, timeLabel, securityOf, toggleVibe, arrangeSpots, directionsUrl } from "../src/lib/spotRules.js";

const spots = [
  { id: "bridge", title: "Jackson St Bridge", place: "Old Fourth Ward", lat: 33.7596, lng: -84.3742, spot_vibes: ["bridge", "skyline"], spot_best_time: "golden", score: 12, saves: 9, saved: false, created_at: "2026-09-01T00:00:00Z" },
  { id: "deck", title: "Ponce City rooftop deck", place: "Ponce City Market", lat: 33.7724, lng: -84.3656, spot_vibes: ["rooftop", "night_lights"], spot_best_time: "night", score: 12, saves: 20, saved: true, created_at: "2026-10-01T00:00:00Z" },
  { id: "mill", title: "Old mill", place: "Roswell", body: "Brick walls, gravel lot", lat: 34.0136, lng: -84.3616, spot_vibes: ["industrial"], spot_best_time: "golden", score: 3, saves: 1, saved: false, created_at: "2026-11-01T00:00:00Z" },
];
const downtown = { lat: 33.7537, lng: -84.3863 };

test("the words for a spot", () => {
  assert.equal(vibeLabel("night_lights"), "🌃 Night lights");
  assert.equal(vibeLabel("nope"), "");
  assert.equal(timeLabel("golden"), "🌇 Golden hour");
  assert.deepEqual(securityOf("quick"), { icon: "🟡", name: "Shoot quick", blurb: "You may get moved on" });
  assert.equal(securityOf(null), null);
  // Every vibe here is one the database accepts (116_photo_spots.sql).
  assert.deepEqual(VIBES.map(([id]) => id).sort(), ["bridge", "industrial", "lot", "mural", "nature", "night_lights", "rollers", "rooftop", "skyline", "tunnel", "water"]);
});

test("picking vibes: on, off, at most four, only real ones", () => {
  assert.deepEqual(toggleVibe([], "bridge"), ["bridge"]);
  assert.deepEqual(toggleVibe(["bridge"], "bridge"), []);
  const full = ["bridge", "skyline", "water", "nature"];
  assert.equal(full.length, MAX_VIBES);
  assert.equal(toggleVibe(full, "mural"), full, "a fifth is ignored");
  assert.deepEqual(toggleVibe([], "beach"), []);
});

test("near me sorts by distance and labels it", () => {
  const list = arrangeSpots(spots, { sort: "near", position: downtown });
  assert.deepEqual(list.map((s) => s.id), ["bridge", "deck", "mill"]);
  assert.equal(list[0].milesLabel, "0.8 mi");
  assert.equal(list[2].milesLabel, "18 mi");
});

test("top rated: votes, then saves, then newest", () => {
  assert.deepEqual(arrangeSpots(spots, { sort: "top" }).map((s) => s.id), ["deck", "bridge", "mill"]);
  assert.equal(arrangeSpots(spots, { sort: "top" })[0].milesLabel, null, "no distance without a position");
});

test("new, saved, and filters", () => {
  assert.deepEqual(arrangeSpots(spots, { sort: "new" }).map((s) => s.id), ["mill", "deck", "bridge"]);
  assert.deepEqual(arrangeSpots(spots, { sort: "saved" }).map((s) => s.id), ["deck"]);
  assert.deepEqual(arrangeSpots(spots, { vibe: "skyline" }).map((s) => s.id), ["bridge"]);
  assert.deepEqual(arrangeSpots(spots, { time: "golden" }).map((s) => s.id), ["bridge", "mill"]);
  assert.deepEqual(arrangeSpots(spots, { query: "gravel" }).map((s) => s.id), ["mill"], "searches the description too");
  assert.deepEqual(arrangeSpots(spots, { query: "ponce" }).map((s) => s.id), ["deck"]);
  assert.deepEqual(arrangeSpots(null), []);
  assert.deepEqual(arrangeSpots(spots, { sort: "near" }).map((s) => s.id), ["deck", "bridge", "mill"], "near me without a position falls back to top rated");
});

test("directions", () => {
  assert.equal(directionsUrl(spots[0]), "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=33.7596,-84.3742");
});
