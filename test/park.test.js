import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, newPark, tick, starsFor, overlaps, inSpot, hitWhat, steerFromWheel, bodyOf, CAR, unlocked } from "../src/lib/parkEngine.js";
import { solve } from "../scripts/park-solve.mjs";

const run = (g, input, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 120) tick(g, input);
  return g;
};

test("gas goes forward; brake stops, then reverses", () => {
  const g = newPark(LEVELS[0]);
  run(g, { gas: true }, 1);
  assert.ok(g.speed > 80 && g.y < LEVELS[0].start.y);
  run(g, { brake: true }, 0.5);
  assert.ok(g.speed <= 0, "stopped");
  run(g, { brake: true }, 0.6);
  assert.ok(g.speed < -20);
  assert.equal(g.gear, "R");
});

test("steering turns the car the way the wheel turns", () => {
  const right = run(newPark(LEVELS[0]), { gas: true, steer: 1 }, 0.8);
  assert.ok(right.heading > 0.3, "turned right");
  const left = run(newPark(LEVELS[0]), { gas: true, steer: -1 }, 0.8);
  assert.ok(left.heading < -0.3, "turned left");
  assert.equal(steerFromWheel(900), 1);
  assert.equal(steerFromWheel(-225), -0.5);
});

test("driving straight up into the first spot parks it; overshooting crashes", () => {
  const level = LEVELS[0];
  const g = newPark(level);
  // Gas until close, then brake to a stop in the spot.
  for (let i = 0; i < 120 * 20 && g.state === "driving"; i++) {
    // Brake when the stopping distance (v² / 2 × 260) reaches the spot's middle.
    const close = g.y - level.spot.y < (g.speed * g.speed) / 520 + 2;
    tick(g, close ? { brake: g.speed > 0 } : { gas: true });
  }
  assert.equal(g.state, "parked");
  assert.equal(starsFor(level, g.time), 3);

  const fast = newPark(level);
  run(fast, { gas: true }, 8);
  assert.equal(fast.state, "crashed");
  assert.ok(["car", "curb"].includes(fast.hit));
});

test("boxes, spots and hits", () => {
  const a = { x: 0, y: 0, w: 30, h: 70, heading: 0 };
  assert.equal(overlaps(a, { ...a, x: 29 }), true);
  assert.equal(overlaps(a, { ...a, x: 31 }), false);
  assert.equal(overlaps(a, { ...a, x: 40, heading: Math.PI / 2 }), true); // turned sideways reaches over
  const back = LEVELS.find((l) => l.id === "back-in");
  const nosedIn = { x: back.spot.x, y: back.spot.y, heading: Math.PI, w: CAR.w, h: CAR.h };
  assert.equal(inSpot(back, nosedIn), false, "back-in wants nose out");
  assert.equal(inSpot(back, { ...nosedIn, heading: 0 }), true);
  assert.equal(hitWhat(LEVELS[0], bodyOf(newPark(LEVELS[0]))), null);
});

test("stars and unlocking", () => {
  const l = LEVELS[1];
  assert.equal(starsFor(l, l.par), 3);
  assert.equal(starsFor(l, l.par * 1.5), 2);
  assert.equal(starsFor(l, l.par * 3), 1);
  assert.equal(unlocked({}, 0), true);
  assert.equal(unlocked({}, 1), false);
  assert.equal(unlocked({ [LEVELS[0].id]: 1 }, 1), true);
});

// Every level can be parked, by a path-finder driving the same car model.
test("every level can be beaten", { timeout: 180000 }, () => {
  for (const level of LEVELS) {
    const r = solve(level, { maxNodes: 300000 });
    assert.ok(r.ok, `${level.id} can't be solved`);
  }
});
