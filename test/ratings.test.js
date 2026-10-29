import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { noteVisitAndShouldAsk, markAsked } = await import("../src/lib/ratePrompt.js");
const DAY = 864e5;

test("never asks a brand-new user, even on a lucky roll", () => {
  store.clear();
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) assert.equal(noteVisitAndShouldAsk(t0 + i * 1000, 0), false);
});

test("asks now and then after a few visits over a few days, then waits 60 days", () => {
  store.clear();
  const t0 = Date.now() - 10 * DAY;
  for (let i = 0; i < 4; i++) noteVisitAndShouldAsk(t0, 0);
  const now = Date.now();
  assert.equal(noteVisitAndShouldAsk(now, 0.9), false, "unlucky roll: not this time");
  assert.equal(noteVisitAndShouldAsk(now, 0.1), true);
  markAsked("not_now");
  assert.equal(noteVisitAndShouldAsk(now + DAY, 0), false, "asked yesterday");
  assert.equal(noteVisitAndShouldAsk(now + 61 * DAY, 0), true);
});

test("stops after a rating, and after three not-nows", () => {
  store.clear();
  const t0 = Date.now() - 10 * DAY;
  for (let i = 0; i < 5; i++) noteVisitAndShouldAsk(t0, 0.9);
  markAsked("rated");
  assert.equal(noteVisitAndShouldAsk(Date.now() + 90 * DAY, 0), false);
  store.clear();
  for (let i = 0; i < 5; i++) noteVisitAndShouldAsk(t0, 0.9);
  for (let i = 0; i < 3; i++) markAsked("not_now");
  assert.equal(noteVisitAndShouldAsk(Date.now() + 400 * DAY, 0), false);
});
