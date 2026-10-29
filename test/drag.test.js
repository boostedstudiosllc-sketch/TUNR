import { test } from "node:test";
import assert from "node:assert/strict";
import { newRace, step, tap, nitro, treeLights, shiftQuality, torque, GREEN_AT, AMBER_AT, RIVALS, QUARTER } from "../src/lib/dragEngine.js";

// A scripted driver: reacts in `rt`, shifts at `at` rpm, nitro at `n` s.
function play(ri, rt, at, n = null, seed = 3) {
  const r = newRace(ri, seed);
  let tapped = false;
  while (r.phase !== "done") {
    if (!tapped && r.t >= GREEN_AT + rt) {
      tap(r);
      tapped = true;
    } else if (tapped && r.me.rpm >= at && r.me.shiftLag <= 0 && r.me.gear < 4) tap(r);
    if (n != null && tapped && r.t - r.me.launchedAt >= n) nitro(r);
    step(r);
  }
  return r.result;
}

test("drag: the tree counts down to green", () => {
  const r = newRace(0);
  assert.deepEqual(treeLights(r), { ambers: 0, green: false, red: false });
  while (r.t < AMBER_AT[1]) step(r);
  assert.equal(treeLights(r).ambers, 2);
  while (r.t < GREEN_AT) step(r);
  assert.equal(treeLights(r).green, true);
});

test("drag: leaving before the green is a red light and a loss", () => {
  const r = newRace(0);
  while (r.t < 1.5) step(r);
  tap(r);
  assert.equal(r.phase, "done");
  assert.equal(r.result.won, false);
  assert.equal(r.result.why, "red");
  assert.equal(treeLights(r).red, true);
});

test("drag: never leaving the line loses", () => {
  const r = newRace(0);
  while (r.phase !== "done") step(r);
  assert.equal(r.result.why, "asleep");
});

test("drag: realistic numbers, and clean driving beats sloppy", () => {
  const ace = play(4, 0.12, 7300, 2.5);
  assert.ok(ace.et > 10.5 && ace.et < 12, `ET ${ace.et}`);
  assert.ok(ace.trapMph > 105 && ace.trapMph < 130, `trap ${ace.trapMph}`);
  assert.ok(ace.sixty > 1.5 && ace.sixty < 2.2, `60ft ${ace.sixty}`);
  assert.equal(ace.perfect, 4);
  const sloppy = play(4, 0.35, 6000);
  assert.ok(sloppy.et > ace.et + 0.5);
});

test("drag: the ladder gets harder; a near-perfect run beats the boss", () => {
  // Sloppy driving only beats the first rival; a good run beats the third.
  assert.equal(play(0, 0.35, 6400).won, true);
  assert.equal(play(1, 0.35, 6400).won, false);
  assert.equal(play(2, 0.22, 7100, 3.5).won, true);
  assert.equal(play(3, 0.22, 7100, 3.5).won, false);
  assert.equal(play(4, 0.12, 7300, 2.5).won, true);
  assert.equal(RIVALS.length, 5);
});

test("drag: shift grades and the torque curve", () => {
  assert.equal(shiftQuality(7200), "perfect");
  assert.equal(shiftQuality(6500), "good");
  assert.equal(shiftQuality(5000), "early");
  assert.equal(shiftQuality(7900), "late");
  assert.ok(torque(6000) > torque(2500));
  assert.ok(torque(6000) > torque(8000));
  // Both cars finish the full distance.
  const r = newRace(2, 9);
  let tapped = false;
  while (r.phase !== "done") {
    if (!tapped && r.t >= GREEN_AT + 0.2) (tap(r), (tapped = true));
    else if (tapped && r.me.rpm >= 7200 && r.me.gear < 4 && r.me.shiftLag <= 0) tap(r);
    step(r);
  }
  assert.ok(r.me.x >= QUARTER && r.them.x >= QUARTER);
});
