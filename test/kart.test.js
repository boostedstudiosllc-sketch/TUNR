import test from "node:test";
import assert from "node:assert/strict";
import { buildKartTrack, newKartRace, tickKartRace, padSpots, placeObstacles, standings, placeOf, KART, NITRO, DRIFT, DIFFICULTY } from "../src/lib/kartEngine.js";
import { pointAt } from "../src/lib/f1Engine.js";
import { KART_TRACKS } from "../src/lib/kartTracks.js";

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// A steady driver: aims down the road, steers round obstacles and brakes
// for the bends. No drifts, no nitro.
function drive(race, pace = 0.95) {
  const p = race.player;
  const t = race.track;
  // Steer round an obstacle coming up.
  let side = 0;
  for (const o of race.obstacles) {
    let gap = o.s - p.s;
    if (gap < 0) gap += t.L;
    if (gap < 30 && Math.abs(o.side) < o.r + 2) side = o.side > 0 ? o.side - o.r - 2.4 : o.side + o.r + 2.4;
  }
  const tp = pointAt(t, p.s + 6 + Math.abs(p.speed) * 0.3, side);
  const e = angleDiff(Math.atan2(-(tp.x - p.x), -(tp.z - p.z)), p.heading);
  const vt = race.profile[(p.idx + Math.round((5 + p.speed * 0.4) / (t.L / t.n))) % t.n] * pace;
  return { left: e > 0.03, right: e < -0.03, brake: p.speed > vt + 2 };
}

const run = (race, input, seconds) => {
  for (let i = 0; i < 120 * seconds && race.state !== "finished"; i++) tickKartRace(race, typeof input === "function" ? input(race) : input);
};

test("4 kart tracks, closed, under a minute a lap", () => {
  assert.equal(KART_TRACKS.length, 4);
  for (const def of KART_TRACKS) {
    const t = buildKartTrack(def);
    assert.ok(t.L > 700 && t.L < 1200, `${def.name} ${t.L}`);
    assert.ok(Math.hypot(t.x[0] - t.x[t.n - 1], t.z[0] - t.z[t.n - 1]) < 12, `${def.name} is closed`);
    for (let i = 0; i < t.n; i++) assert.ok(t.roL[i] <= 2.6 && t.roR[i] <= 2.6);
  }
});

test("pads and obstacles: a few of each, spread out, the same pads every time", () => {
  for (const def of KART_TRACKS) {
    const t = buildKartTrack(def);
    const pads = padSpots(t);
    assert.ok(pads.length >= 2 && pads.length <= 4, `${def.name} pads ${pads.length}`);
    assert.deepEqual(padSpots(t).map((p) => p.s), pads.map((p) => p.s));
    let seed = 3;
    const obs = placeObstacles(t, pads, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
    assert.ok(obs.length >= 6, `${def.name} obstacles ${obs.length}`);
    for (const o of obs) assert.ok(Math.abs(o.side) <= 4 && o.s > 60, JSON.stringify(o));
    // Different races, different obstacles.
    const a = newKartRace(t, { seed: 1 }).obstacles.map((o) => Math.round(o.s));
    const b = newKartRace(t, { seed: 2 }).obstacles.map((o) => Math.round(o.s));
    assert.notDeepEqual(a, b);
  }
});

test("it drives itself; the brake slows it", () => {
  const race = newKartRace(buildKartTrack(KART_TRACKS[0]), { rivals: 0 });
  run(race, {}, 3.2);
  assert.equal(race.state, "racing");
  run(race, {}, 2);
  assert.ok(race.player.speed > 15, `speed ${race.player.speed}`);
  const before = race.player.speed;
  run(race, { brake: true }, 0.5);
  assert.ok(race.player.speed < before - 8);
});

test("drifting charges a mini-turbo and banks tokens; 3 tokens buy a nitro", () => {
  const race = newKartRace(buildKartTrack(KART_TRACKS[0]), { rivals: 0, seed: 9 });
  race.obstacles = [];
  const p = race.player;
  run(race, {}, 3.2);
  // On the start straight, up to speed, wide on the right so there's room.
  const place = () => {
    const at = pointAt(race.track, 5, -4);
    Object.assign(p, { x: at.x, z: at.z, heading: at.heading, slide: at.heading, speed: 22, idx: at.i, s: 5, lap: 0, boost: 0, boostKind: null });
  };
  place();
  // Hold drift for a short one: not enough for a boost.
  run(race, { drift: true, left: true }, 0.4);
  assert.ok(p.drifting);
  run(race, {}, 0.05);
  assert.equal(p.tokens, 0);
  assert.equal(p.boost, 0);
  // A long one round a big left-hand circle: orange, a mini-turbo and two
  // tokens.
  const ring = [];
  for (let k = 0; k < 20; k++) ring.push(Math.round(Math.cos((-k * Math.PI) / 10) * 320), Math.round(Math.sin((-k * Math.PI) / 10) * 320));
  const round = newKartRace(buildKartTrack({ id: "ring", points: ring }), { rivals: 0 });
  round.obstacles = [];
  round.pads = [];
  assert.ok(round.track.k[0] > 0, "turns left");
  run(round, {}, 3.2);
  const q = round.player;
  const start = pointAt(round.track, 5, 0);
  Object.assign(q, { x: start.x, z: start.z, heading: start.heading, slide: start.heading, speed: 20, idx: start.i, s: 5, lap: 0 });
  // Hold the line: tighten when pointing outside it, open out when inside.
  const hold = (r) => {
    const want = r.track.heading[r.player.idx] - (r.player.side - 1) * 0.08;
    const tighten = !r.player.drifting || angleDiff(want, r.player.heading) > 0;
    return { drift: true, left: tighten, right: !tighten };
  };
  run(round, hold, DRIFT.orange + 0.6);
  assert.ok(!round.events.some((e) => e.kind === "wall"), "stayed on the track");
  assert.equal(q.driftLevel, 2);
  run(round, {}, 0.02);
  assert.equal(q.tokens, 2);
  assert.ok(q.boost > 0 && q.boostKind === "mini");
  p.tokens = q.tokens;
  // Nitro needs 3.
  run(race, { nitro: true }, 0.02);
  assert.ok(!race.events.some((e) => e.kind === "nitro"));
  p.tokens = 3;
  run(race, {}, 0.02);
  run(race, { nitro: true }, 0.02);
  assert.ok(race.events.some((e) => e.kind === "nitro"));
  assert.equal(p.tokens, 0);
  assert.equal(p.boostKind, "nitro");
  // Faster than the kart can go on its own.
  run(race, {}, 1.5);
  assert.ok(p.speed > KART.vmax + 2 || race.events.some((e) => e.kind === "wall"), `speed ${p.speed}`);
  assert.ok(NITRO.cost === 3 && NITRO.max >= 6);
});

test("holding left or right through a bend drifts by itself, no DRIFT button", () => {
  const ring = [];
  for (let k = 0; k < 20; k++) ring.push(Math.round(Math.cos((-k * Math.PI) / 10) * 320), Math.round(Math.sin((-k * Math.PI) / 10) * 320));
  const r = newKartRace(buildKartTrack({ id: "ring", points: ring }), { rivals: 0 });
  r.obstacles = [];
  r.pads = [];
  run(r, {}, 3.2);
  const q = r.player;
  const start = pointAt(r.track, 5, 0);
  Object.assign(q, { x: start.x, z: start.z, heading: start.heading, slide: start.heading, speed: 20, idx: start.i, s: 5, lap: 0 });
  // A tap of steering is just steering.
  run(r, { left: true }, DRIFT.hold * 0.5);
  assert.ok(!q.drifting, "a short steer isn't a drift");
  run(r, {}, 0.1);
  // Keep holding left: it drifts. Steering either way keeps it going (left
  // tightens, right opens it out) and it charges.
  run(r, { left: true }, DRIFT.hold + 0.05);
  assert.ok(q.drifting, "holding left drifts");
  run(r, (x) => {
    const want = x.track.heading[x.player.idx] - (x.player.side - 1) * 0.08;
    const tighten = angleDiff(want, x.player.heading) > 0;
    return { left: tighten, right: !tighten };
  }, DRIFT.blue * 1.6 + 0.3); // charging is slower while opening it out
  assert.ok(q.drifting, "still drifting while steering");
  assert.ok(q.driftLevel >= 1);
  run(r, { left: true }, 0.01);
  run(r, {}, 0.05);
  assert.ok(q.drifting, "a quick re-grip doesn't end it");
  run(r, {}, DRIFT.letGo + 0.05);
  assert.ok(!q.drifting);
  assert.ok(q.tokens >= 1 && q.boostKind === "mini", "letting go fires the mini-turbo");
  // Turned off (input.autoDrift false), holding steer is plain steering.
  const r2 = newKartRace(buildKartTrack({ id: "ring", points: ring }), { rivals: 0 });
  r2.obstacles = [];
  run(r2, {}, 3.2);
  Object.assign(r2.player, { x: start.x, z: start.z, heading: start.heading, slide: start.heading, speed: 20, idx: start.i, s: 5, lap: 0 });
  run(r2, { left: true, autoDrift: false }, 1);
  assert.ok(!r2.player.drifting);
});

test("a boost pad boosts you; a barrel spins you out", () => {
  const t = buildKartTrack(KART_TRACKS[0]);
  const race = newKartRace(t, { rivals: 0 });
  race.obstacles = [];
  run(race, {}, 3.2);
  const p = race.player;
  const pad = race.pads[0];
  const at = pointAt(t, pad.s - 8, pad.side);
  Object.assign(p, { x: at.x, z: at.z, heading: at.heading, slide: at.heading, speed: 20, idx: at.i, s: pad.s - 8, lap: 0 });
  run(race, {}, 0.6);
  assert.ok(race.events.some((e) => e.kind === "pad"), "pad");
  assert.equal(p.boostKind, "pad");

  const barrel = { kind: "barrel", r: 0.9, s: (pad.s + 120) % t.L, side: 0, goneLap: null };
  Object.assign(barrel, pointAt(t, barrel.s, 0));
  race.obstacles = [barrel];
  const b = pointAt(t, barrel.s - 6, 0);
  Object.assign(p, { x: b.x, z: b.z, heading: b.heading, slide: b.heading, speed: 22, idx: b.i, s: barrel.s - 6, boost: 0 });
  run(race, {}, 0.5);
  assert.ok(race.events.some((e) => e.kind === "hit"), "hit");
  assert.ok(p.spin > 0 || p.speed < 15);
});

test("a full race on each track: laps count and the computer karts keep it close", { timeout: 120000 }, () => {
  const places = [];
  for (const def of KART_TRACKS) {
    const race = newKartRace(buildKartTrack(def), { laps: 2, seed: 5 });
    run(race, drive, 400);
    assert.equal(race.state, "finished", `${def.name} finished`);
    assert.equal(race.player.lapTimes.length, 2);
    assert.ok(race.player.lapTimes.every((s) => s > 18 && s < 70), `${def.name} laps ${race.player.lapTimes}`);
    assert.equal(standings(race).length, 6);
    places.push(placeOf(race));
    // Close racing: nobody lapped, either way.
    for (const c of race.cars) assert.ok(c.lap >= 1, `${def.name}: ${c.name} on lap ${c.lap}`);
  }
  console.log("plain driver places", places.join(" "));
});

test("harder difficulty means faster rivals", () => {
  const lead = (difficulty) => {
    const race = newKartRace(buildKartTrack(KART_TRACKS[2]), { laps: 3, seed: 7, difficulty });
    race.obstacles = [];
    race.player.lap = 99; // out of the way, so the rivals aren't held back for you
    run(race, { brake: true }, 30);
    const c = standings(race).find((x) => x.ai);
    return c.lap * race.track.L + c.s;
  };
  assert.ok(DIFFICULTY.easy < DIFFICULTY.hard);
  const easy = lead("easy");
  const hard = lead("hard");
  assert.ok(easy < hard, `easy ${easy} hard ${hard}`);
});

test("a nitro tap counts even while the button reads as held", () => {
  const race = newKartRace(buildKartTrack(KART_TRACKS[0]), { rivals: 0 });
  race.obstacles = [];
  run(race, {}, 3.5);
  race.player.tokens = 3;
  race.player.nitroHeld = true;
  run(race, { nitro: true, nitroTap: true }, 1 / 120);
  assert.equal(race.player.boostKind, "nitro");
});

test("with the gas pedal, the kart only goes while it's down", () => {
  const race = newKartRace(buildKartTrack(KART_TRACKS[0]), { rivals: 0 });
  race.obstacles = [];
  run(race, { gas: false }, 3.5);
  assert.ok(race.player.speed < 0.5, `still: ${race.player.speed}`);
  run(race, { gas: true }, 1.5);
  const going = race.player.speed;
  assert.ok(going > 10, `going: ${going}`);
  run(race, { gas: false }, 1);
  assert.ok(race.player.speed < going - 2, `coasting: ${race.player.speed}`);
});
