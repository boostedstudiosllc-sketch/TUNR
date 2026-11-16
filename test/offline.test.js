import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotKey, keepForOffline, saveSnapshot, loadSnapshot, savedWhen, offlineLine } from "../src/lib/offline.js";

const NOW = Date.parse("2026-11-16T19:00:00Z"); // 2 PM in Atlanta
const DAY = 24 * 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
function memory(limit = Infinity) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (v.length > limit) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
  };
}

test("only meets worth having offline are kept", () => {
  const events = [
    { id: "past", start: iso(NOW - 30 * DAY), end: iso(NOW - 30 * DAY + 3600e3) },
    { id: "lastweek", start: iso(NOW - 3 * DAY), end: iso(NOW - 3 * DAY + 3600e3) },
    { id: "soon", start: iso(NOW + 2 * DAY), end: iso(NOW + 2 * DAY + 3600e3) },
    { id: "far", start: iso(NOW + 120 * DAY), end: iso(NOW + 120 * DAY + 3600e3) },
    { id: "weekly", start: iso(NOW - 200 * DAY), end: iso(NOW - 200 * DAY + 3600e3), recurrence: "weekly" },
    { id: "weeklyOver", start: iso(NOW - 200 * DAY), recurrence: "weekly", recurrenceUntil: iso(NOW - 60 * DAY) },
  ];
  assert.deepEqual(keepForOffline(events, NOW).map((e) => e.id), ["lastweek", "soon", "weekly"]);
});

test("saved per account, read back as it was", () => {
  const s = memory();
  const data = { events: [{ id: "soon", start: iso(NOW + DAY) }], rsvps: { soon: "going" }, follows: ["host1"], goingAs: { soon: "car" } };
  assert.equal(saveSnapshot(s, "u1", data, NOW), true);
  const back = loadSnapshot(s, "u1");
  assert.deepEqual([back.at, back.events.length, back.rsvps.soon], [NOW, 1, "going"]);
  assert.equal(loadSnapshot(s, "u2"), null, "another account sees nothing");
  assert.equal(snapshotKey(null), "tunr.meets.snapshot.guest");
});

test("out of room: keeps just your own meets", () => {
  const big = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, start: iso(NOW + DAY), note: "x".repeat(200) }));
  const s = memory(5000);
  assert.equal(saveSnapshot(s, "u1", { events: big, rsvps: { m7: "going" } }, NOW), true);
  assert.deepEqual(loadSnapshot(s, "u1").events.map((e) => e.id), ["m7"]);
  assert.equal(saveSnapshot(memory(10), "u1", { events: big, rsvps: {} }, NOW), false, "nowhere to put it: says so");
  assert.equal(loadSnapshot({ getItem: () => "{broken" }, "u1"), null);
});

test("when the saved meets are from, and the banner", () => {
  assert.equal(savedWhen(NOW - 3600e3, NOW), "1:00 PM");
  assert.equal(savedWhen(NOW - DAY, NOW), "yesterday 2:00 PM");
  assert.equal(savedWhen(NOW - 5 * DAY, NOW), "Nov 11");
  assert.equal(offlineLine({ online: true, savedAt: null }), "");
  assert.equal(offlineLine({ online: false, savedAt: null }), "You're offline. Games, your parked car and saved meets still work.");
  assert.equal(offlineLine({ online: false, savedAt: NOW - 3600e3, now: NOW }), "You're offline. Games, your parked car and saved meets still work. Meets as of 1:00 PM.");
  assert.match(offlineLine({ online: true, savedAt: NOW, now: NOW }), /^Couldn't reach TUNR/);
});
