import test from "node:test";
import assert from "node:assert/strict";
import { newMatch, tickMatch, FIELD, GOAL, BALL, CAR, BOOST, PADS } from "../src/lib/soccerEngine.js";

const run = (m, input, seconds) => {
  for (let i = 0; i < 120 * seconds; i++) tickMatch(m, typeof input === "function" ? input(m) : input);
};
const started = (opts) => {
  const m = newMatch(opts);
  run(m, {}, 3.05);
  return m;
};
// Clear the field of everyone but you.
const alone = (m) => {
  for (const c of m.cars) if (!c.me) Object.assign(c, { x: 1000, z: 1000, ai: null });
  m.cars = [m.player];
  return m;
};

test("kickoff: a 3-2-1 with everyone still, then play", () => {
  const m = newMatch({ size: 2 });
  assert.equal(m.cars.length, 4);
  const before = m.cars.map((c) => [c.x, c.z]);
  run(m, { throttle: 1 }, 2.9);
  assert.equal(m.state, "kickoff");
  assert.deepEqual(m.cars.map((c) => [c.x, c.z]), before);
  run(m, { throttle: 1 }, 0.2);
  assert.equal(m.state, "play");
  // Everyone faces the ball.
  for (const c of newMatch({ size: 2 }).cars) {
    const toBall = Math.atan2(c.x, c.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(toBall - c.heading), Math.cos(toBall - c.heading))) < 0.01);
  }
});

test("the ball bounces lower each time and stays in the arena", () => {
  const m = alone(started({}));
  Object.assign(m.ball, { x: 0, y: 12, z: 0, vx: 30, vy: 0, vz: 20 });
  let top = 12;
  let peaks = [];
  let wasUp = false;
  for (let i = 0; i < 120 * 12; i++) {
    tickMatch(m, { throttle: 0 });
    const b = m.ball;
    assert.ok(Math.abs(b.x) <= FIELD.w && Math.abs(b.z) <= FIELD.l + GOAL.depth && b.y <= FIELD.ceiling && b.y >= BALL.r - 1e-6, JSON.stringify(b));
    if (b.vy > 0) wasUp = true;
    if (wasUp && b.vy <= 0) {
      peaks.push(b.y);
      wasUp = false;
    }
    top = Math.max(top, b.y);
  }
  assert.ok(peaks.length >= 3, `peaks ${peaks}`);
  for (let k = 1; k < peaks.length; k++) assert.ok(peaks[k] <= peaks[k - 1] + 0.01);
  assert.ok(top <= 12.01);
});

test("a car drives, boosts past its normal top speed, and the meter runs down", () => {
  const m = alone(started({}));
  Object.assign(m.ball, { x: 20, z: -40 }); // out of the way
  run(m, { throttle: 1 }, 3);
  const p = m.player;
  assert.ok(p.speed > CAR.top - 3 && p.speed <= CAR.top + 0.5, `speed ${p.speed}`);
  Object.assign(p, { x: 0, z: 40, heading: 0, speed: CAR.top, boost: 100 });
  run(m, { throttle: 1, boost: true }, 1.2);
  assert.ok(p.speed > CAR.top + 4, `boosted ${p.speed}`);
  assert.ok(p.boost < 100 - BOOST.use, `meter ${p.boost}`);
});

test("pads refill boost and come back later", () => {
  const m = alone(started({}));
  const p = m.player;
  const pad = m.pads.find((x) => x.big);
  Object.assign(p, { x: pad.x, z: pad.z + 1, speed: 0, boost: 10 });
  run(m, {}, 0.05);
  assert.equal(p.boost, 100);
  assert.ok(pad.back > 9);
  run(m, {}, BOOST.bigBack);
  assert.equal(pad.back, 0);
  assert.equal(PADS.length, 22);
});

test("jump, land, and a flip lunges forward", () => {
  const m = alone(started({}));
  const p = m.player;
  Object.assign(p, { x: 0, z: 30, heading: 0, speed: 10 });
  run(m, { throttle: 1, jump: true }, 0.1);
  assert.equal(p.onGround, false);
  run(m, { throttle: 1 }, 0.1);
  const before = Math.hypot(p.vx, p.vz);
  run(m, { throttle: 1, jump: true }, 0.02);
  assert.ok(p.flipT > 0);
  assert.ok(Math.hypot(p.vx, p.vz) > before + CAR.flip - 1);
  run(m, { throttle: 1 }, 1.5);
  assert.equal(p.onGround, true);
  assert.equal(p.y, 0);
});

test("driving into the ball sends it flying the way you're going", () => {
  const m = alone(started({}));
  const p = m.player;
  Object.assign(p, { x: 0, z: 14, heading: 0, speed: 20 });
  Object.assign(m.ball, { x: 0, y: BALL.r, z: 0, vx: 0, vy: 0, vz: 0 });
  run(m, { throttle: 1 }, 0.8);
  assert.ok(m.events.some((e) => e.kind === "touch"));
  assert.ok(m.ball.vz < -15 || m.ball.z < -20, `ball ${JSON.stringify(m.ball)}`);
  assert.equal(m.lastTouch, p);
});

test("a goal counts once the ball is over the line, then it's kickoff again", () => {
  const m = alone(started({}));
  Object.assign(m.ball, { x: 0, y: 3, z: -FIELD.l + 6, vx: 0, vy: 0, vz: -25 });
  m.lastTouch = m.player;
  run(m, {}, 1);
  assert.deepEqual(m.score, [1, 0]);
  assert.equal(m.state, "goal");
  assert.equal(m.scorer, m.player);
  run(m, {}, 2.9);
  assert.equal(m.state, "kickoff");
  assert.equal(m.ball.z, 0);
  // Over the crossbar isn't a goal: it bounces back off the end wall.
  Object.assign(m.ball, { x: 0, y: GOAL.h + 3, z: FIELD.l - 6, vx: 0, vy: 0, vz: 25 });
  m.state = "play";
  run(m, {}, 1);
  assert.deepEqual(m.score, [1, 0]);
  assert.ok(m.ball.z < FIELD.l);
});

test("level at the end: overtime, and the next goal wins", () => {
  const m = alone(started({ length: 120 }));
  m.clock = 0.05;
  run(m, {}, 0.1);
  assert.equal(m.overtime, true);
  assert.equal(m.state, "kickoff");
  run(m, {}, 3.1);
  Object.assign(m.ball, { x: 0, y: 3, z: FIELD.l - 6, vx: 0, vy: 0, vz: 25 });
  run(m, {}, 4);
  assert.deepEqual(m.score, [0, 1]);
  assert.equal(m.state, "over");
});

test("computer against computer: real matches with goals, and the ball never escapes", { timeout: 120000 }, () => {
  let goals = 0;
  for (const [size, difficulty] of [
    [1, "medium"],
    [2, "hard"],
    [2, "easy"],
  ]) {
    const m = newMatch({ size, difficulty, length: 180, seed: 3 });
    m.player.ai = { next: 0, target: null, stuck: 0, reverseT: 0 };
    let touches = 0;
    for (let i = 0; i < 120 * 200 && m.state !== "over"; i++) {
      tickMatch(m, {});
      const b = m.ball;
      assert.ok(Number.isFinite(b.x + b.y + b.z), "ball is a number");
      assert.ok(Math.abs(b.x) <= FIELD.w + 0.01 && Math.abs(b.z) <= FIELD.l + GOAL.depth + 0.01 && b.y <= FIELD.ceiling + 0.01, JSON.stringify(b));
      for (const c of m.cars) assert.ok(Math.abs(c.x) <= FIELD.w && Math.abs(c.z) <= FIELD.l + GOAL.depth, `${c.name} ${c.x} ${c.z}`);
      touches += m.events.filter((e) => e.kind === "touch").length;
      m.events.length = 0;
    }
    goals += m.score[0] + m.score[1];
    console.log(`${size}v${size} ${difficulty}: ${m.score.join("-")}, ${touches} touches${m.overtime ? ", overtime" : ""}`);
    assert.ok(touches > 20, `${size}v${size} touches ${touches}`);
  }
  assert.ok(goals >= 3, `goals ${goals}`);
});

test("a quick double tap still flips, even if both presses land between steps", () => {
  const m = alone(started({}));
  const p = m.player;
  Object.assign(p, { x: 0, z: 30, heading: 0, speed: 10 });
  run(m, { throttle: 1, jump: true, jumpTap: true }, 1 / 120);
  run(m, { throttle: 1, jump: true }, 0.1); // still held from the first press
  run(m, { throttle: 1, jump: true, jumpTap: true }, 1 / 120); // let go and pressed again between steps
  assert.ok(p.flipT > 0);
});
