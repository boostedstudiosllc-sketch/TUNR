import { test } from "node:test";
import assert from "node:assert/strict";
import { newStack, step, drop, hookX, floors, lean, swingOf, LIVES, CAR_L, PERFECT } from "../src/lib/stackEngine.js";

// Drop when the hook is within `aim` of `target` (moving toward it), and
// run until the car lands.
function dropAt(g, target, aim = 0.05) {
  for (let i = 0; i < 2400 && Math.abs(hookX(g) - target) > aim; i++) step(g);
  drop(g);
  for (let i = 0; i < 600 && g.falling; i++) step(g);
}

test("stack: dead-centre drops are perfect, snap straight and pay a growing bonus", () => {
  const g = newStack(4);
  dropAt(g, 0);
  dropAt(g, 0);
  dropAt(g, 0);
  assert.equal(floors(g), 3);
  assert.equal(g.perfects, 3);
  assert.ok(g.tower.every((c) => c.x === 0));
  assert.equal(g.score, 10 + 5 + 10 + 10 + 10 + 15);
  assert.equal(lean(g), 0);
});

test("stack: off-centre drops lean the tower; a miss costs a life; three is over", () => {
  const g = newStack(5);
  dropAt(g, 1.2);
  assert.equal(floors(g), 1);
  assert.equal(g.perfects, 0);
  assert.ok(Math.abs(g.tower[1].x - 1.2) < 0.1 && lean(g) > 1);
  // Way out past the edge of the car below: misses.
  const swing = swingOf(g).amp;
  // The far end of the swing is past the edge of the car below.
  assert.ok(swing + 1.2 > CAR_L * 0.55);
  for (let k = 0; k < LIVES; k++) dropAt(g, -swingOf(g).amp + 0.1, 0.2);
  assert.equal(g.lives, 0);
  assert.equal(g.state, "over");
  assert.equal(g.why, "missed");
});

test("stack: leaning too far topples it, and the swing speeds up as you climb", () => {
  const g = newStack(6);
  const s0 = swingOf(g);
  // Keep stacking each car further out to one side.
  for (let k = 0; k < 12 && g.state === "play"; k++) dropAt(g, Math.min(g.tower[g.tower.length - 1].x + CAR_L * 0.45, swingOf(g).amp - 0.05), 0.08);
  assert.equal(g.state, "over");
  assert.equal(g.why, "toppled");
  const tall = newStack(7);
  for (let k = 0; k < 20; k++) dropAt(tall, 0);
  assert.ok(swingOf(tall).speed > s0.speed && swingOf(tall).amp > s0.amp);
  assert.ok(PERFECT < 0.3);
  // Every tenth floor is your own car.
  assert.equal(tall.tower[10].mine, true);
});
