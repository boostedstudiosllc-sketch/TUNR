import { test } from "node:test";
import assert from "node:assert/strict";
import { floorName, parkedSummary, makeSpot, loadSpot, saveSpot, clearSpot, walkUrl, distanceText, savedAgo, PARKED_KEY } from "../src/lib/parking.js";

function memory({ limit = Infinity } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (v.length > limit) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
  };
}

test("floor names read naturally", () => {
  assert.equal(floorName("B2"), "Basement 2");
  assert.equal(floorName("G"), "Ground");
  assert.equal(floorName("3"), "Level 3");
  assert.equal(floorName("Roof"), "Roof");
  assert.equal(floorName("P4 purple"), "P4 purple");
  assert.equal(floorName(""), "");
});

test("summary shows floor and spot", () => {
  assert.equal(parkedSummary({ floor: "3", space: "C14" }), "Level 3 · C14");
  assert.equal(parkedSummary({ lat: 33.7, lng: -84.4 }), "Pinned on the map");
});

test("a spot needs a pin or something to find it by", () => {
  assert.throws(() => makeSpot({}), /floor/);
  const s = makeSpot({ floor: " 2 ", space: "A1", photo: "https://evil/x.jpg" }, 1000);
  assert.equal(s.floor, "2");
  assert.equal(s.photo, null, "only photos taken in the app (data URLs) are kept");
  assert.equal(s.lat, null);
  assert.equal(s.savedAt, 1000);
  const pinned = makeSpot({ lat: 33.75, lng: -84.39, accuracy: 12.6, meet: { id: 7, title: "Cars & Coffee" } });
  assert.equal(pinned.accuracy, 13);
  assert.deepEqual(pinned.meet, { id: "7", title: "Cars & Coffee" });
  assert.equal(makeSpot({ lat: 33.75, floor: "1" }).lat, null, "half a position is no position");
});

test("save, load and clear on the phone", () => {
  const store = memory();
  const s = makeSpot({ floor: "B1" });
  saveSpot(s, store);
  assert.deepEqual(loadSpot(store), s);
  clearSpot(store);
  assert.equal(loadSpot(store), null);
  store.setItem(PARKED_KEY, "{broken");
  assert.equal(loadSpot(store), null, "a broken save reads as nothing");
});

test("a photo too big for the phone is dropped, the spot still saves", () => {
  const store = memory({ limit: 500 });
  const big = makeSpot({ floor: "4", photo: "data:image/jpeg;base64," + "A".repeat(2000) });
  const { spot, droppedPhoto } = saveSpot(big, store);
  assert.equal(droppedPhoto, true);
  assert.equal(spot.photo, null);
  assert.equal(loadSpot(store).floor, "4");
});

test("walking directions and distance", () => {
  const s = { lat: 33.7756, lng: -84.3963 };
  assert.match(walkUrl(s), /travelmode=walking&destination=33.7756,-84.3963$/);
  assert.equal(walkUrl({ floor: "2" }), null);
  assert.equal(distanceText(s, { lat: 33.7756, lng: -84.3963 }), "You're right by it");
  assert.match(distanceText(s, { lat: 33.7766, lng: -84.3963 }), /^\d+ ft away$/);
  assert.match(distanceText(s, { lat: 33.80, lng: -84.3963 }), /mi away$/);
  assert.equal(distanceText(s, null), null);
});

test("saved time", () => {
  const now = 10 * 86400000;
  assert.equal(savedAgo(now, now), "just now");
  assert.equal(savedAgo(now - 25 * 60000, now), "25 min ago");
  assert.equal(savedAgo(now - 3 * 3600000, now), "3 hr ago");
  assert.equal(savedAgo(now - 2 * 86400000, now), "2 days ago");
});
