import test from "node:test";
import assert from "node:assert/strict";
import { newDrift, tick, onRoad, meters, slipOf, ROAD_W, RIGHT, LEFT } from "../src/lib/driftEngine.js";

const dirOf = (h) => [Math.sin(h), -Math.cos(h)];

// The piece of road the car is on, and how far along it.
function where(g) {
  let found = null;
  for (const s of g.road) {
    const [ux, uy] = dirOf(s.heading);
    const along = (g.x - s.x1) * ux + (g.y - s.y1) * uy;
    const across = -(g.x - s.x1) * uy + (g.y - s.y1) * ux;
    if (along >= -ROAD_W / 2 && along <= s.len + ROAD_W / 2 && Math.abs(across) <= ROAD_W / 2) found = { s, along };
  }
  return found;
}

// Turn toward the next piece a little before each corner.
function byTiming(g, lead) {
  const w = where(g);
  if (!w) return false;
  const next = g.road[g.road.indexOf(w.s) + 1];
  return (w.s.len - w.along < g.speed * lead ? next.heading : w.s.heading) === RIGHT;
}

// A driver that looks ahead: tries holding and letting go for a moment and
// keeps whichever stays on the road longer.
function lookAhead(g) {
  const tryIt = (first) => {
    const c = { ...g, road: g.road.slice(), skids: [], rand: () => 0.5 };
    let t = 0;
    for (; t < 1.6 && c.state === "driving"; t += 1 / 120) tick(c, t < 0.12 ? first : byTiming(c, 0.25));
    return t;
  };
  const a = tryIt(true);
  const b = tryIt(false);
  return a === b ? byTiming(g, 0.25) : a > b;
}

test("waits for the first hold, then drives itself", () => {
  const g = newDrift(5);
  tick(g, false);
  assert.equal(g.state, "ready");
  tick(g, true);
  assert.equal(g.state, "driving");
  const y = g.y;
  for (let i = 0; i < 60; i++) tick(g, false);
  assert.ok(g.y < y, "moves up the screen on its own");
});

test("the same seed lays the same road; the road is joined up", () => {
  const a = newDrift(42);
  const b = newDrift(42);
  assert.deepEqual(a.road.map((s) => Math.round(s.len)), b.road.map((s) => Math.round(s.len)));
  for (let i = 1; i < a.road.length; i++) {
    assert.notEqual(a.road[i].heading, a.road[i - 1].heading, "every piece turns");
    assert.ok(Math.abs(a.road[i].x1 - a.road[i - 1].x2) < 1e-6 && Math.abs(a.road[i].y1 - a.road[i - 1].y2) < 1e-6);
    assert.ok(Math.abs(a.road[i].x2) <= 130, "stays on screen");
  }
  assert.equal(onRoad(a, 0, 0), true);
  assert.equal(onRoad(a, 200, 0), false);
});

test("never turning runs off the road and falls", () => {
  const g = newDrift(7);
  tick(g, true);
  for (let i = 0; i < 120 * 20 && g.state !== "over"; i++) tick(g, false);
  assert.equal(g.state, "over");
  assert.ok(meters(g) > 5 && meters(g) < 80);
});

test("holding swings the nose right and the tail slides", () => {
  const g = newDrift(3);
  tick(g, true);
  for (let i = 0; i < 24; i++) tick(g, true);
  assert.ok(g.heading > LEFT, "nose turning right");
  assert.ok(slipOf(g) > 0.1, "sliding");
});

test("the road stays drivable: a look-ahead driver lasts 90 seconds", { timeout: 120000 }, () => {
  for (const seed of [1, 2, 3]) {
    const g = newDrift(seed);
    tick(g, true);
    let hold = false;
    for (let i = 0; i < 120 * 90 && g.state === "driving"; i++) {
      if (i % 4 === 0) hold = lookAhead(g);
      tick(g, hold);
    }
    assert.equal(g.state, "driving", `road ${seed} ended at ${meters(g)} m`);
  }
});
