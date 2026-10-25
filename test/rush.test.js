import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, steer, scoreOf, START_TIME, BOOST_SPEED, BOOST_TIME } from "../src/lib/rushEngine.js";

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
  // Even boosting tops out at 115 m/s, under the server's 120 m/s check.
  assert.ok(g.dist <= g.t * 120, `distance ${g.dist} in ${g.t}s`);
  assert.ok(g.speed <= BOOST_SPEED + 0.001);
});

test("hitting traffic costs time and slows you down; a clock adds time", () => {
  const g = newGame(seeded());
  g.objects.push({ z: 0.03, lane: 1, kind: "car", color: "#fff", body: "sedan" });
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

test("the Boosted badge makes you faster, but you still have to steer around traffic", () => {
  const g = newGame(seeded());
  g.objects.push({ z: 0.03, lane: 1, kind: "boost" });
  assert.deepEqual(step(g, 0.001), ["boost"]);
  assert.equal(g.boosts, 1);
  assert.ok(g.boostT > BOOST_TIME - 0.01);

  // Faster while it lasts, then it wears off.
  g.objects = [];
  g.spawnIn = 99;
  for (let i = 0; i < 60; i++) step(g, 1 / 60);
  assert.ok(g.speed > 85);
  const ended = [];
  for (let i = 0; i < 60 * BOOST_TIME; i++) ended.push(...step(g, 1 / 60));
  assert.equal(g.boostT, 0);
  assert.ok(ended.includes("boostEnd"));

  // Hitting something while boosted is still a crash, and ends the boost.
  const h = newGame(seeded());
  h.objects.push({ z: 0.03, lane: 1, kind: "boost" });
  step(h, 0.001);
  h.objects.push({ z: 0.03, lane: 1, kind: "car", color: "#fff", body: "sedan" });
  const time = h.timeLeft;
  assert.ok(step(h, 0.001).includes("crash"));
  assert.equal(h.crashes, 1);
  assert.equal(h.boostT, 0);
  assert.ok(h.timeLeft < time - 3.9);
  const crash = newGame(seeded());
  crash.objects.push({ z: 0.03, lane: 1, kind: "barrel" });
  assert.deepEqual(step(crash, 0.001), ["crash"]);
});

test("the game follows the admin's rules", () => {
  const g = newGame(seeded(), { startTime: 30, crashSeconds: 10, boostSeconds: 0, boostChance: 0.3 });
  assert.equal(g.timeLeft, 30);
  g.objects.push({ z: 0.03, lane: 1, kind: "cone" });
  step(g, 0.001);
  assert.ok(g.timeLeft < 20.01);
  // Boosts off: no badges ever show up.
  const h = newGame(seeded(3), { boostSeconds: 0, boostChance: 0.3 });
  let badges = 0;
  for (let i = 0; i < 60 * 60 && !h.over; i++) {
    step(h, 1 / 60);
    badges += h.objects.filter((o) => o.kind === "boost").length;
  }
  assert.equal(badges, 0);
});
