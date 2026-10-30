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

import { remoteSample, remoteDone, myReport } from "../src/lib/dragEngine.js";

// Two phones, each with its own race: A is quicker. Each feeds the other its
// reports, as the room would.
function duel(aRt, bRt, { bOut = null } = {}) {
  const A = newRace(0, 5, { remote: true });
  const B = newRace(0, 5, { remote: true });
  const drive = (r, rt) => {
    if (r.me.launchedAt == null && r.t >= GREEN_AT + rt) tap(r);
    else if (r.me.launchedAt != null && r.me.rpm >= 7200 && r.me.gear < 4 && r.me.shiftLag <= 0) tap(r);
  };
  let aSent = false;
  let bSent = false;
  for (let i = 0; i < 120 * 40 && (A.phase !== "done" || B.phase !== "done"); i++) {
    if (A.phase !== "done") (drive(A, aRt), step(A));
    if (B.phase !== "done") {
      if (bOut === "red" && B.t >= 1.5 && B.me.launchedAt == null) tap(B);
      else if (!bOut) drive(B, bRt);
      step(B);
    }
    if (i % 10 === 0) {
      remoteSample(B, { t: A.t, x: A.me.x, v: A.me.v });
      remoteSample(A, { t: B.t, x: B.me.x, v: B.me.v });
    }
    if (!aSent && (A.me.finishAt != null || A.phase === "done")) (aSent = true), remoteDone(B, myReport(A));
    if (!bSent && (B.me.finishAt != null || B.phase === "done")) (bSent = true), remoteDone(A, myReport(B));
  }
  return [A.result, B.result];
}

test("drag two-player: both phones agree who won", () => {
  const [a, b] = duel(0.12, 0.3);
  assert.equal(a.won, true);
  assert.equal(b.won, false);
  assert.ok(a.margin > 0.1 && Math.abs(a.margin - b.margin) < 1e-9);
});

test("drag two-player: a red light loses, and the other car is shown from reports", () => {
  const [a, b] = duel(0.2, 0, { bOut: "red" });
  assert.equal(b.why, "red");
  assert.equal(a.won, true);
  assert.equal(a.rivalOut, "red");
  const r = newRace(0, 1, { remote: true });
  remoteSample(r, { t: 3, x: 10, v: 20 });
  r.t = 3.1;
  step(r);
  assert.ok(r.them.x > 10 && r.them.x < 13);
});

test("drag two-player: if the other phone goes quiet, you win once through", () => {
  const r = newRace(0, 2, { remote: true });
  while (r.phase !== "done") {
    if (r.me.launchedAt == null && r.t >= GREEN_AT + 0.2) tap(r);
    else if (r.me.launchedAt != null && r.me.rpm >= 7200 && r.me.gear < 4 && r.me.shiftLag <= 0) tap(r);
    step(r);
  }
  assert.equal(r.result.won, true);
  assert.equal(r.result.rivalOut, "left");
});

import { cleanCode, newRoomCode, hostOf, quickRoomCode, takeSharedRoom, JOIN_KEY } from "../src/lib/gameRooms.js";

test("drag rooms: codes and who hosts", () => {
  assert.match(newRoomCode(), /^[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(cleanCode(" ab-c1d9 "), "ABC1");
  assert.equal(hostOf([{ id: "b" }, { id: "a" }]), "a");
  assert.equal(quickRoomCode("bbbb-2", "aaaa-1"), quickRoomCode("aaaa-1", "bbbb-2"));
  assert.ok(quickRoomCode("aaaa-1", "bbbb-2").length > 4);
});

test("shared room links: only the game they're for picks them up", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  storage.setItem(JOIN_KEY, "karts:ABCD");
  assert.equal(takeSharedRoom("drag", storage), null);
  assert.equal(takeSharedRoom("karts", storage), "ABCD");
  assert.equal(takeSharedRoom("karts", storage), null);
});
