import test from "node:test";
import assert from "node:assert/strict";
import { newRun, tickRun, distance, groundY, EGG } from "../src/lib/eggEngine.js";

const run = (seed, driver, seconds = 60) => {
  const r = newRun(seed);
  for (let t = 0; t < seconds && r.state === "driving"; t += 1 / 60) tickRun(r, driver(r), 1 / 60);
  return r;
};

// A careful driver: steady speed on the ground, keeps the car level in the air.
const careful = (target) => (r) => {
  const c = r.car;
  const v = Math.hypot(c.vx, c.vy);
  if (!c.grounded) return c.a > 0.15 ? { brake: true } : c.a < -0.15 ? { gas: true } : {};
  return v < target ? { gas: true } : v > target + 2 ? { brake: true } : {};
};

test("the same course for the same seed, flat at the start", () => {
  for (const x of [0, 5, 50, 300, 900]) assert.equal(groundY(7, x), groundY(7, x));
  assert.equal(groundY(7, 3), 0);
  assert.notEqual(groundY(7, 400), groundY(8, 400));
});

test("parked, the car settles and the egg stays put", () => {
  const r = run(7, () => ({}), 20);
  assert.equal(r.state, "driving");
  assert.ok(Math.abs(r.car.x) < 0.05, `drifted to ${r.car.x}`);
  assert.equal(r.egg.cracks, 0);
  assert.ok(r.egg.onRoof);
});

test("gas drives forward; brake stops, then backs up", () => {
  const r = newRun(7);
  for (let i = 0; i < 120; i++) tickRun(r, { gas: true }, 1 / 60);
  assert.ok(r.car.vx > 5, `only ${r.car.vx} m/s`);
  for (let i = 0; i < 240; i++) tickRun(r, { brake: true }, 1 / 60);
  assert.ok(r.car.vx < 0, "should be backing up");
});

test("flat out over the hills, the egg doesn't survive", () => {
  for (const seed of [1, 2, 3, 7]) {
    const r = run(seed, () => ({ gas: true }), 60);
    assert.equal(r.state, "over", `seed ${seed} survived flat out`);
    assert.equal(r.egg.cracks, EGG.cracks);
  }
});

test("driven carefully, the egg makes it a long way", () => {
  for (const seed of [1, 7]) {
    const r = run(seed, careful(7), 60);
    assert.ok(distance(r) > 300, `seed ${seed}: only ${distance(r)} m (${r.why})`);
  }
});

test("an egg knocked off the roof breaks and ends the run", () => {
  const r = newRun(7);
  r.egg.vx = -4;
  r.egg.vy = 5;
  for (let i = 0; i < 180; i++) tickRun(r, {}, 1 / 60);
  assert.equal(r.state, "over");
  assert.equal(r.why, "dropped");
});
