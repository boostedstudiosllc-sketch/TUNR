import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oddsRows, chanceUpTo, averageWin, prizeRange, pctText } from "../src/lib/scratchOdds.js";

// The cards exactly as the migration seeds them.
const sql = readFileSync(new URL("../supabase/migrations/105_taco_tuesday_scratch_cards.sql", import.meta.url), "utf8");
const arr = (s) => s.split(",").map(Number);
const cards = Object.fromEntries(
  [...sql.matchAll(/\('(\w+)', '[^']+', (\d+), '\{([\d,]+)\}',\s*'\{([\d,]+)\}'/g)].map(([, id, cost, prizes, weights]) => [
    id,
    { id, cost: Number(cost), prizes: arr(prizes), weights: arr(weights) },
  ])
);

test("the three cards are seeded", () => {
  assert.deepEqual(Object.keys(cards), ["tuneup", "turbo", "supercharged"]);
  for (const c of Object.values(cards)) assert.equal(c.prizes.length, c.weights.length);
});

test("Tune-Up (2 points): 1-5, a 1 or 2 80-90% of the time", () => {
  const c = cards.tuneup;
  assert.equal(c.cost, 2);
  assert.deepEqual(prizeRange(c), [1, 5]);
  const p = chanceUpTo(c, 2);
  assert.ok(p >= 80 && p <= 90, p);
});

test("Turbo (5 points): 1-10, 1-5 80% of the time", () => {
  const c = cards.turbo;
  assert.equal(c.cost, 5);
  assert.deepEqual(prizeRange(c), [1, 10]);
  assert.equal(Math.round(chanceUpTo(c, 5)), 80);
});

test("Supercharged (10 points): 1-20, 1-11 90% of the time", () => {
  const c = cards.supercharged;
  assert.equal(c.cost, 10);
  assert.deepEqual(prizeRange(c), [1, 20]);
  assert.equal(Math.round(chanceUpTo(c, 11)), 90);
});

test("on average a card pays back less than it costs, but not much less", () => {
  for (const c of Object.values(cards)) {
    const back = averageWin(c) / c.cost;
    assert.ok(back > 0.7 && back < 1, `${c.id}: ${back}`);
  }
});

test("odds add to 100% and read nicely", () => {
  for (const c of Object.values(cards)) assert.ok(Math.abs(oddsRows(c).reduce((s, r) => s + r.pct, 0) - 100) < 1e-9);
  assert.equal(pctText(45), "45%");
  assert.equal(pctText(2.5), "2.5%");
  assert.equal(pctText(0.3), "0.3%");
});
