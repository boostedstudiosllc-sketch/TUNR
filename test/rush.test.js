import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, steer, scoreOf, START_TIME, MAX_SPEED } from "../src/lib/rushEngine.js";

// A repeatable "random" for the tests.
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

test("a run ends when the clock runs out, and never goes faster than the server allows", () => {
  const g = newGame(seeded());
  let frames = 0;
  while (!g.over && frames < 60 * 600) {
    step(g, 1 / 60);
    frames++;
  }
  assert.equal(g.over, true);
  assert.equal(g.timeLeft, 0);
  // Max speed 85 m/s, under the server's 90 m/s check.
  assert.ok(g.dist <= g.t * 90, `distance ${g.dist} in ${g.t}s`);
  assert.ok(g.speed <= MAX_SPEED + 0.001);
});

test("hitting traffic costs time and slows you down; a clock adds time", () => {
  const g = newGame(seeded());
  g.objects.push({ z: 0.03, lane: 1, kind: "car", color: "#fff", body: "sedan", num: 3 });
  const before = g.timeLeft;
  const speed = g.speed;
  const ev = step(g, 0.001);
  assert.deepEqual(ev, ["crash"]);
  assert.ok(g.timeLeft < before - 3.9);
  assert.ok(g.speed < speed);
  assert.equal(g.crashes, 1);

  const h = newGame(seeded());
  h.objects.push({ z: 0.03, lane: 2, kind: "clock" });
  steer(h, 1);
  for (let i = 0; i < 10; i++) step(h, 0.02);
  assert.equal(h.pickups, 1);
  assert.ok(h.timeLeft > START_TIME - 0.5);
  assert.equal(scoreOf(h), Math.floor(h.dist) + 100);
});

test("you can't steer off the road", () => {
  const g = newGame(seeded());
  steer(g, -1);
  steer(g, -1);
  steer(g, -1);
  assert.equal(g.lane, 0);
  steer(g, 5);
  assert.equal(g.lane, 2);
});
