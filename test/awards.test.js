import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseLine, standings, winnersOf, carLabel, errorFor } from "../src/lib/awardRules.js";

const cars = [
  { vehicle_id: "a", car: "2004 Honda S2000", username: "ana" },
  { vehicle_id: "b", car: "1998 Toyota Supra", nickname: "Orange Juice", username: "ben" },
];

test("awards say where voting stands", () => {
  assert.equal(phaseLine({ phase: "none" }), "");
  assert.match(phaseLine({ phase: "soon", opens_at: "2026-12-05T22:45:00Z" }), /^Fan voting opens Sat 5:45 PM/);
  assert.match(phaseLine({ phase: "open", closes_at: "2026-12-06T03:00:00Z" }), /until 10:00 PM/);
  assert.equal(phaseLine({ phase: "closed" }), "Voting's closed. Here are the winners.");
});

test("standings put the most votes first, and winners are named", () => {
  const award = { tally: { b: 3, a: 1 }, winners: ["b"] };
  assert.deepEqual(standings(award, cars).map((c) => [c.vehicle_id, c.votes, c.won]), [["b", 3, true], ["a", 1, false]]);
  assert.deepEqual(standings({}, cars).map((c) => c.vehicle_id), ["a", "b"], "no counts shown while voting: entry order");
  assert.deepEqual(winnersOf({ winners: ["a", "b"] }, cars).length, 2, "a tie shares the award");
  assert.equal(carLabel(cars[1]), "Orange Juice · 1998 Toyota Supra");
});

test("award errors say what went wrong", () => {
  assert.equal(errorFor("too_far", { distance_m: 3218 }), "You're 2.0 miles away. You need to be at the meet to vote.");
  assert.equal(errorFor("too_far", { distance_m: 700 }), "You're 700 m away. You need to be at the meet to vote.");
  assert.equal(errorFor("own_car"), "You can't vote for your own car.");
  assert.equal(errorFor("weird"), "Couldn't do that. (weird)");
});
