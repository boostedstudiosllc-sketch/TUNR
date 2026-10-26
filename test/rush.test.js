import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, steer, tick, scoreOf, START_TIME, BOOST_SPEED, BOOST_TIME } from "../src/lib/rushEngine.js";

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
  g.nextRow = Infinity;
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

test("each level is shorter, faster and worth more than the one before", async () => {
  const { DEFAULT_LEVELS } = await import("../src/lib/rushEngine.js");
  const { easy, medium, hard } = DEFAULT_LEVELS;
  assert.ok(easy.startTime > medium.startTime && medium.startTime > hard.startTime);
  assert.ok(easy.startSpeed < medium.startSpeed && medium.startSpeed < hard.startSpeed);
  assert.ok(easy.traffic < medium.traffic && medium.traffic < hard.traffic);
  assert.deepEqual([easy.points, medium.points, hard.points], [1, 2, 3]);
  const g = newGame(seeded(), hard);
  assert.equal(g.timeLeft, hard.startTime);
  assert.equal(g.speed, hard.startSpeed);
});

// A simple driver for the replay tests: dodges what's close, grabs pickups.
function drive(g, rand, skill) {
  while (!g.over) {
    const dirs = [];
    if (rand() < skill) {
      const danger = (lane) => g.objects.some((o) => o.lane === lane && o.kind !== "clock" && o.kind !== "boost" && o.z > 0 && o.z < 0.3);
      if (danger(g.lane)) {
        const free = [0, 1, 2].filter((l) => !danger(l)).sort((a, b) => Math.abs(a - g.lane) - Math.abs(b - g.lane))[0];
        if (free !== undefined && free !== g.lane) dirs.push(free > g.lane ? 1 : -1);
      }
    }
    tick(g, dirs);
  }
  return g;
}

test("a run replays exactly from its seed and moves, as the server checks it", async () => {
  const { tick, replay, seededRand, DEFAULT_LEVELS } = await import("../src/lib/rushEngine.js");
  for (const [seed, level] of [[12345, "easy"], [987654321, "medium"], [42, "hard"]]) {
    // Played with a different look-only random source than the server uses.
    const played = drive(newGame(seededRand(seed), DEFAULT_LEVELS[level], Math.random), seeded(seed + 1), 0.1);
    const again = replay(seed, DEFAULT_LEVELS[level], played.log);
    assert.equal(again.dist, played.dist);
    assert.equal(again.stepNo, played.stepNo);
    assert.equal(again.crashes, played.crashes);
    assert.equal(again.pickups, played.pickups);
    assert.ok(played.log.length > 0);
  }
  // Same seed, same course; another seed, another course.
  const a = newGame(seededRand(7), DEFAULT_LEVELS.hard);
  const b = newGame(seededRand(7), DEFAULT_LEVELS.hard);
  const c = newGame(seededRand(8), DEFAULT_LEVELS.hard);
  for (let i = 0; i < 300; i++) [a, b, c].forEach((g) => tick(g));
  const course = (g) => g.objects.map((o) => `${Math.round(o.at)}:${o.lane}:${o.kind}`).join(",");
  assert.equal(course(a), course(b));
  assert.notEqual(course(a), course(c));
});

test("moves from the phone are checked before replaying", async () => {
  const { validMoves } = await import("../src/lib/rushEngine.js");
  assert.equal(validMoves([[3, 1], [3, -1], [90, 1]]), true);
  assert.equal(validMoves([]), true);
  assert.equal(validMoves([[5, 1], [4, 1]]), false); // out of order
  assert.equal(validMoves([[5, 2]]), false);
  assert.equal(validMoves([[1.5, 1]]), false);
  assert.equal(validMoves("nope"), false);
  assert.equal(validMoves(new Array(5001).fill([1, 1])), false);
});

test("each day has its own look", async () => {
  const { themeFor } = await import("../src/lib/rushEngine.js");
  const ids = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((d) => themeFor(d).id);
  assert.equal(new Set(ids.slice(0, 3)).size, 3);
  assert.equal(ids[3], ids[0]);
});

test("the server replays the run and pays on its own distance, not the phone's", async () => {
  const { createHandler } = await import("../api/rush-finish.js");
  const { seededRand, DEFAULT_LEVELS } = await import("../src/lib/rushEngine.js");
  const RUN = "11111111-2222-3333-4444-555555555555";
  const SEED = 424242;
  const played = drive(newGame(seededRand(SEED), DEFAULT_LEVELS.medium), seeded(5), 0.1);
  const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" };
  let finished = null;
  let sent = null;
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://p.supabase.co", "");
    if (path === "/auth/v1/user") return new Response(JSON.stringify({ id: "u1" }));
    if (path.startsWith("/rest/v1/game_runs")) {
      assert.match(path, /user_id=eq\.u1/); // only your own runs
      return new Response(JSON.stringify(path.includes(RUN) ? [{ id: RUN, seed: SEED, difficulty: "medium", finished_at: finished }] : []));
    }
    if (path.startsWith("/rest/v1/game_settings")) return new Response(JSON.stringify([{ levels: { medium: DEFAULT_LEVELS.medium } }]));
    if (path === "/rest/v1/rpc/finish_game_run_verified") {
      sent = JSON.parse(init.body);
      finished = "now";
      return new Response(JSON.stringify({ status: "ok", earned: 2, counts: true }));
    }
    throw new Error("unexpected " + path);
  };
  const res = () => ({ statusCode: 200, headers: {}, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
  const handler = createHandler({ env, fetchImpl });
  const call = async (body, auth = "Bearer t") => {
    const r = res();
    await handler({ method: "POST", headers: auth ? { authorization: auth } : {}, body }, r);
    return r;
  };

  assert.equal((await call({ run: RUN, moves: [] }, null)).statusCode, 401);
  assert.equal((await call({ run: RUN, moves: [[5, 7]] })).body.error, "bad_moves");
  assert.equal((await call({ run: "22222222-2222-3333-4444-555555555555", moves: [] })).body.error, "not_found");

  // The phone claims a huge distance; only the moves matter.
  const r = await call({ run: RUN, moves: played.log, dist: 999999 });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.earned, 2);
  assert.equal(sent.p_distance, Math.floor(played.dist));
  assert.equal(sent.p_user, "u1");
  assert.ok(Math.abs(sent.p_sim_secs - played.t) < 0.01);
  assert.equal(r.body.run.dist, Math.floor(played.dist));
  // Finishing twice is refused.
  assert.equal((await call({ run: RUN, moves: played.log })).body.error, "already");
});
