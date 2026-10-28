// Boosted Karts: kart racing on TUNR's own tracks (kartTracks.js), sharing
// Drift King's track code (f1Engine.js). The kart drives itself forward;
// you steer, brake, drift and fire nitro.
//
//   Drift: hold DRIFT while turning at speed. The kart hops into a slide
//     that turns tighter, and charges: blue sparks, then orange. Let go for
//     a mini-turbo, and each charge level banks a Boosted token.
//   Nitro: spend 3 tokens for a couple of seconds of nitrous.
//   Boost pads on the track give anyone who drives over one a quick burst.
//   Obstacles (barrels, crates, cones, oil) are scattered at random each
//   race. Barrels and crates spin you out, oil spins you, cones just slow
//   you a little (and go flying).
// Five computer karts race you; they steer round obstacles, use the pads,
// and keep the race close (a little faster when behind you, a little
// slower when far ahead). Pure logic, so the game and the tests share it.

import { buildTrack, locate, pointAt, speedProfile, crossLine, STEP, TRACK_W, KERB_W, DIFFICULTY } from "./f1Engine.js";

export { STEP, TRACK_W, DIFFICULTY };
export { standings, placeOf, lapClock, outline, mph } from "./f1Engine.js";

export const KART = { length: 2.1, width: 1.4, vmax: 30, accel: 15, brake: 28, grip: 30, steer: 2.7, reverse: 8 };
const OFF_MAX = 14; // top speed off the track
const WALL_ROOM = 2.6; // tyre walls close by the track
const GRIP = 10; // how fast sideways sliding dies away (gripping)
export const DRIFT = { minSpeed: 9, blue: 0.9, orange: 2.0, turn: 1.25, angle: 0.4, mini: [0, 0.6, 1.1], speed: 7, accel: 2 };
export const NITRO = { cost: 3, max: 6, seconds: 2.5, speed: 12, accel: 2.6 };
export const PAD = { seconds: 1.0, speed: 9, accel: 2.2, length: 5, width: 4 };
export const OBSTACLES = { barrel: 0.9, crate: 1.0, cone: 0.5, oil: 1.8 }; // radius (m)
const SPIN_TIME = 0.8;

const fwd = (h) => [-Math.sin(h), -Math.cos(h)];
const wrap = (i, n) => ((i % n) + n) % n;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A kart track: Drift King's track, with tyre walls close by.
export function buildKartTrack(def) {
  const t = buildTrack(def);
  for (let i = 0; i < t.n; i++) {
    t.roL[i] = Math.min(t.roL[i], WALL_ROOM);
    t.roR[i] = Math.min(t.roR[i], WALL_ROOM);
  }
  return t;
}

// Signed distance along the track from b to a (wrapping round the line).
function along(track, a, b) {
  let d = a - b;
  if (d > track.L / 2) d -= track.L;
  if (d < -track.L / 2) d += track.L;
  return d;
}

// Boost pads: on the way out of the biggest bends, and one on the longest
// straight. Always in the same places on a track.
export function padSpots(track) {
  const { n, k, s, L } = track;
  const exits = [];
  for (let i = 0; i < n; i++) {
    const before = Math.abs(k[wrap(i - 6, n)]);
    if (before > 0.02 && Math.abs(k[i]) < 0.01 && Math.abs(k[wrap(i - 1, n)]) >= 0.01) exits.push({ i: wrap(i + 2, n), score: before });
  }
  exits.sort((a, b) => b.score - a.score);
  const pads = [];
  const roomFor = (i) => s[i] > 50 && s[i] < L - 30 && pads.every((p) => Math.abs(along(track, s[i], p.s)) > 110);
  for (const e of exits) {
    if (pads.length >= 3) break;
    if (roomFor(e.i)) pads.push({ i: e.i, s: s[e.i] });
  }
  // The longest straight's middle.
  let best = null;
  let run = 0;
  for (let j = 0; j < n * 2; j++) {
    const i = j % n;
    run = Math.abs(k[i]) < 0.005 ? run + 1 : 0;
    if (run > 0 && (!best || run > best.len)) best = { len: run, i: wrap(i - Math.floor(run / 2), n) };
  }
  if (best && best.len > 16 && roomFor(best.i)) pads.push({ i: best.i, s: s[best.i] });
  return pads
    .sort((a, b) => a.s - b.s)
    .map((p, j) => {
      const side = [0, 3, -3][j % 3];
      const at = pointAt(track, p.s, side);
      return { ...p, side, x: at.x, z: at.z, heading: at.heading };
    });
}

// Obstacles, scattered at random for each race: not near the start, the
// pads or each other, and never filling the whole width.
export function placeObstacles(track, pads, rand) {
  const kinds = ["barrel", "barrel", "crate", "crate", "cone", "cone", "oil"];
  const count = Math.round(track.L / 90);
  const out = [];
  for (let tries = 0; tries < 400 && out.length < count; tries++) {
    const s = 70 + rand() * (track.L - 110);
    if (pads.some((p) => Math.abs(along(track, s, p.s)) < 22)) continue;
    if (out.some((o) => Math.abs(along(track, s, o.s)) < 35)) continue;
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const side = (rand() * 2 - 1) * (kind === "oil" ? 3 : 4);
    const at = pointAt(track, s, side);
    out.push({ kind, r: OBSTACLES[kind], s, side, x: at.x, z: at.z, goneLap: null });
  }
  return out.sort((a, b) => a.s - b.s);
}

export const RIVALS = [
  { name: "BLAZE", color: "#E11D2E", accent: "#F5F5F5", skill: 0.9 },
  { name: "ZIP", color: "#FACC15", accent: "#111827", skill: 0.88 },
  { name: "NOVA", color: "#A855F7", accent: "#F5F5F5", skill: 0.86 },
  { name: "RIPTIDE", color: "#14B8A6", accent: "#F5F5F5", skill: 0.84 },
  { name: "TORQUE", color: "#F97316", accent: "#111827", skill: 0.82 },
];

export function newKartRace(track, { laps = 3, rivals = 5, seed = 1, difficulty = "medium", color = "#0080F0" } = {}) {
  let r = seed % 2147483647 || 1;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pace = DIFFICULTY[difficulty] || 1;
  const profile = speedProfile(track, KART.grip * 0.92, KART.brake * 0.8, KART.vmax);
  const pads = padSpots(track);
  const obstacles = placeObstacles(track, pads, rand);
  // The grid: two by two behind the line, you at the back.
  const slot = (i) => ({ back: 6 + Math.floor(i / 2) * 6 + (i % 2) * 2.5, side: i % 2 ? -2.3 : 2.3 });
  const cars = [];
  RIVALS.slice(0, rivals).forEach((rv, i) => {
    const sl = slot(i);
    const p = pointAt(track, track.L - sl.back, sl.side);
    cars.push({
      ai: true,
      ...rv,
      skill: (rv.skill - rand() * 0.02) * pace,
      s: track.L - sl.back,
      lane: sl.side,
      laneGoal: sl.side * 0.5,
      v: 0,
      x: p.x,
      z: p.z,
      heading: p.heading,
      idx: p.i,
      lap: -1,
      armed: true,
      finished: null,
      boost: 0,
      spin: 0,
      drifting: false,
      padT: -9,
      hitT: -9,
    });
  });
  const me = slot(rivals);
  const p = pointAt(track, track.L - me.back, me.side);
  const player = {
    ai: false,
    name: "YOU",
    color,
    x: p.x,
    z: p.z,
    heading: p.heading,
    slide: p.heading,
    speed: 0,
    slip: 0,
    steer: 0,
    idx: p.i,
    s: track.L - me.back,
    side: me.side,
    lap: -1,
    armed: true,
    lapStart: 0,
    lapTimes: [],
    finished: null,
    surface: "track",
    bump: -9,
    wrongWay: 0,
    drifting: false,
    driftDir: 0,
    charge: 0,
    driftLevel: 0,
    tokens: 0,
    boost: 0,
    boostKind: null,
    boostTop: 0,
    boostAccel: 1,
    spin: 0,
    spinDir: 1,
    yawOff: 0,
    padT: -9,
    hitT: -9,
    nitroHeld: false,
  };
  cars.push(player);
  return { track, laps, difficulty, profile, pads, obstacles, cars, player, time: -3, state: "countdown", events: [] };
}

// A boost of some kind. A weaker one doesn't cut a stronger one short.
function giveBoost(c, kind, seconds, speed, accel) {
  if (c.boost > 0 && c.boostTop > speed) {
    c.boost = Math.max(c.boost, seconds);
    return;
  }
  c.boostKind = kind;
  c.boostTop = speed;
  c.boostAccel = accel;
  c.boost = Math.max(c.boost, seconds);
}

function onPad(race, c, s, side) {
  for (const pad of race.pads) {
    if (Math.abs(along(race.track, s, pad.s)) < PAD.length / 2 && Math.abs(side - pad.side) < PAD.width / 2 + 0.4) return pad;
  }
  return null;
}

function tickPlayer(race, c, input, dt) {
  const t = race.track;
  const want = c.spin > 0 ? 0 : (input.left ? 1 : 0) - (input.right ? 1 : 0);
  c.steer += clamp(want - c.steer, -dt * 8, dt * 8);

  const where = locate(t, c.x, c.z, c.idx);
  const off = Math.abs(where.side) - TRACK_W / 2;
  c.surface = off <= 0 ? "track" : off <= KERB_W ? "kerb" : "grass";

  c.boost = Math.max(0, c.boost - dt);
  c.spin = Math.max(0, c.spin - dt);
  const boosted = c.boost > 0;
  if (!boosted) c.boostKind = null;
  const top = (c.surface === "grass" && !boosted ? OFF_MAX : KART.vmax + (boosted ? c.boostTop : 0)) * (c.spin > 0 ? 0.5 : 1);

  // Nitro: a tap spends the tokens.
  if ((input.nitroTap || (input.nitro && !c.nitroHeld)) && c.tokens >= NITRO.cost && !c.finished) {
    c.tokens -= NITRO.cost;
    giveBoost(c, "nitro", NITRO.seconds, NITRO.speed, NITRO.accel);
    race.events.push({ kind: "nitro" });
  }
  c.nitroHeld = Boolean(input.nitro);

  // The kart goes by itself, unless you've picked the gas pedal (then
  // input.gas says whether it's down; off the gas it coasts). The brake
  // slows it, then reverses.
  let v = c.speed;
  if (c.finished) v -= Math.sign(v) * Math.min(Math.abs(v), 6 * dt);
  else if (input.brake) v = v > 0.5 ? Math.max(0, v - KART.brake * dt) : Math.max(-KART.reverse, v - 5 * dt);
  else if (input.gas === false) v -= Math.sign(v) * Math.min(Math.abs(v), (3 + 0.015 * v * v) * dt);
  else if (v < -0.5) v = Math.min(0, v + KART.brake * dt);
  else v += KART.accel * (boosted ? c.boostAccel : 1) * (1 - Math.max(0, v) / top) * dt * (v < 10 ? 1.5 : 1);
  if (v > top) v -= Math.min(v - top, (c.surface === "grass" ? 20 : 5) * dt);
  if (c.surface === "kerb") v -= Math.sign(v) * dt;

  // Drifting: starts with a hop when you hold DRIFT and turn at speed;
  // charges while you hold it; letting go fires the mini-turbo.
  const canDrift = input.drift && v > DRIFT.minSpeed && c.surface !== "grass" && c.spin === 0 && !c.finished && !input.brake;
  if (canDrift && !c.drifting && want !== 0) {
    c.drifting = true;
    c.driftDir = want;
    c.charge = 0;
    race.events.push({ kind: "hop" });
  } else if (c.drifting && !canDrift) {
    const level = c.charge >= DRIFT.orange ? 2 : c.charge >= DRIFT.blue ? 1 : 0;
    if (level && c.spin === 0) {
      giveBoost(c, "mini", DRIFT.mini[level], DRIFT.speed, DRIFT.accel);
      c.tokens = Math.min(NITRO.max, c.tokens + level);
      race.events.push({ kind: "mini", level });
    }
    c.drifting = false;
    c.charge = 0;
  }
  if (c.drifting) c.charge += dt * (want === c.driftDir ? 1.3 : want === 0 ? 1 : 0.7);
  c.driftLevel = !c.drifting ? 0 : c.charge >= DRIFT.orange ? 2 : c.charge >= DRIFT.blue ? 1 : 0;

  const speed = Math.abs(v);
  const turn = Math.min(KART.steer, KART.grip / Math.max(speed, 1)) * Math.min(1, speed / 4);
  if (c.spin > 0) {
    // Spinning out: a full turn on the spot while it slides on.
    c.heading += c.spinDir * ((Math.PI * 2) / SPIN_TIME) * dt;
  } else if (c.drifting) {
    // Round the drift's arc; steering the same way tightens it, the other
    // way opens it out. (The kart's sideways lean, yawOff, is just for
    // show: the arc is what you steer.)
    const tighten = want * c.driftDir;
    c.heading += c.driftDir * turn * DRIFT.turn * (0.7 + 0.45 * tighten) * Math.sign(v || 1) * dt;
  } else {
    c.heading += turn * c.steer * Math.sign(v || 1) * dt;
  }

  c.yawOff += ((c.drifting ? c.driftDir * DRIFT.angle : 0) - c.yawOff) * Math.min(1, dt * 7);

  // The way it's actually moving trails the way it points.
  const aim = v >= 0 ? c.heading : c.heading + Math.PI;
  const rate = c.spin > 0 ? 0 : c.surface === "grass" ? 5 : GRIP;
  c.slide += angleDiff(aim, c.slide) * Math.min(1, rate * dt);
  c.slip = Math.abs(angleDiff(aim, c.slide));
  if (c.drifting) v -= v * 0.04 * dt;
  if (c.spin === 0) v -= v * Math.min(0.5, c.slip * 0.2) * dt;
  c.speed = v;

  const [mx, mz] = fwd(c.slide);
  c.x += mx * Math.abs(v) * dt;
  c.z += mz * Math.abs(v) * dt;

  // The tyre wall: put back on the track side and lose speed.
  const after = locate(t, c.x, c.z, where.i);
  const room = TRACK_W / 2 + (after.side > 0 ? t.roL[after.i] : t.roR[after.i]);
  if (Math.abs(after.side) > room) {
    const back = Math.abs(after.side) - room + 0.05;
    const [tfx, tfz] = fwd(t.heading[after.i]);
    const sign = Math.sign(after.side);
    c.x -= tfz * back * sign;
    c.z += tfx * back * sign;
    c.speed *= 0.5;
    if (c.spin === 0) {
      c.heading += angleDiff(t.heading[after.i], c.heading) * 0.35;
      c.slide = c.speed >= 0 ? c.heading : c.heading + Math.PI;
    }
    c.drifting = false;
    c.charge = 0;
    if (race.time - c.bump > 0.4) race.events.push({ kind: "wall" });
    c.bump = race.time;
  }
  const prevS = c.s;
  const now = locate(t, c.x, c.z, after.i);
  c.idx = now.i;
  c.s = now.s;
  c.side = now.side;
  const backwards = Math.abs(angleDiff(c.heading, t.heading[now.i])) > 2.2 && Math.abs(c.speed) > 3 && c.spin === 0;
  c.wrongWay = backwards ? c.wrongWay + dt : 0;
  crossLine(race, c, prevS);
  if (c.finished) return;

  // Boost pads.
  if (race.time - c.padT > 0.6 && onPad(race, c, c.s, c.side)) {
    c.padT = race.time;
    giveBoost(c, "pad", PAD.seconds, PAD.speed, PAD.accel);
    race.events.push({ kind: "pad" });
  }

  // Obstacles.
  if (race.time - c.hitT < 0.8) return;
  for (const o of race.obstacles) {
    if (o.goneLap === c.lap) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d > o.r + 0.8) continue;
    c.hitT = race.time;
    if (o.kind === "cone") {
      o.goneLap = c.lap; // knocked flying; back next lap
      c.speed *= 0.8;
      race.events.push({ kind: "cone", o });
    } else {
      c.spin = SPIN_TIME * (o.kind === "oil" ? 1.15 : 1);
      c.spinDir = Math.sign(c.side - o.side) || 1;
      c.speed *= o.kind === "oil" ? 0.7 : 0.35;
      c.drifting = false;
      c.charge = 0;
      if (o.kind !== "oil" && d > 0) {
        // Bounced off it.
        const push = (o.r + 0.8 - d) / d;
        c.x += (c.x - o.x) * push;
        c.z += (c.z - o.z) * push;
      }
      race.events.push({ kind: o.kind === "oil" ? "oil" : "hit", o });
    }
    break;
  }
}

// Someone just ahead in your lane.
function carAhead(race, c) {
  let best = null;
  for (const o of race.cars) {
    if (o === c) continue;
    const gap = along(race.track, o.s, c.s);
    const side = o.ai ? o.lane : o.side;
    if (gap > 0 && gap < 9 && Math.abs(side - c.lane) < 2 && (!best || gap < best.gap)) best = { car: o, gap, side };
  }
  return best;
}

const progress = (race, c) => c.lap * race.track.L + c.s;

function tickRival(race, c, dt) {
  const t = race.track;
  c.boost = Math.max(0, c.boost - dt);
  c.spin = Math.max(0, c.spin - dt);
  let vt = race.profile[wrap(c.idx + 4, t.n)] * c.skill;
  // Keep it close: a little quicker when behind you, slower when well ahead.
  vt *= 1 + clamp((progress(race, race.player) - progress(race, c)) / 250, -0.07, 0.1);
  if (c.boost > 0) vt += PAD.speed;
  if (c.spin > 0) vt *= 0.5;

  const room = TRACK_W / 2 - 1;
  // Steer round obstacles coming up; otherwise pass, or head for a pad.
  let dodging = false;
  for (const o of race.obstacles) {
    const gap = along(t, o.s, c.s);
    if (gap > 0 && gap < 30 && o.goneLap !== race.player.lap && Math.abs(o.side - c.lane) < o.r + 1.7) {
      c.laneGoal = clamp(o.side > 0 ? o.side - (o.r + 2.4) : o.side + (o.r + 2.4), -room, room);
      dodging = true;
      break;
    }
  }
  const front = carAhead(race, c);
  if (!dodging && front) {
    c.laneGoal = clamp(front.side > 0 ? front.side - 3 : front.side + 3, -room, room);
  }
  if (front && front.gap < 5) vt = Math.min(vt, (front.car.ai ? front.car.v : Math.abs(front.car.speed)) + 0.5);
  if (!dodging && !front) {
    const pad = race.pads.find((p) => {
      const gap = along(t, p.s, c.s);
      return gap > 0 && gap < 45;
    });
    if (pad && c.padAim !== pad) {
      c.padAim = pad;
      if (Math.random() < 0.6) c.laneGoal = pad.side;
    } else if (!pad && Math.abs(c.lane - c.laneGoal) < 0.1 && Math.random() < dt * 0.2) {
      c.laneGoal = (Math.random() - 0.5) * 6;
    }
  }

  if (c.finished) c.v = Math.max(0, c.v - 6 * dt);
  else c.v = c.v < vt ? Math.min(vt, c.v + KART.accel * (c.boost > 0 ? PAD.accel : 1.05) * dt * (c.v < 10 ? 1.5 : 1)) : Math.max(vt, c.v - KART.brake * 0.85 * dt);
  c.lane += clamp(c.laneGoal - c.lane, -dt * 3, dt * 3);
  c.drifting = Math.abs(t.k[c.idx]) > 0.03 && c.v > 14;
  const prevS = c.s;
  c.s = (c.s + c.v * dt) % t.L;
  const p = pointAt(t, c.s, c.lane);
  c.x = p.x;
  c.z = p.z;
  c.heading = p.heading + (c.drifting ? Math.sign(t.k[c.idx]) * 0.35 : 0) + (c.spin > 0 ? c.spin * 8 : 0);
  c.idx = p.i;
  crossLine(race, c, prevS);
  if (c.finished) return;

  if (race.time - c.padT > 0.6 && onPad(race, c, c.s, c.lane)) {
    c.padT = race.time;
    c.boost = PAD.seconds;
  }
  if (race.time - c.hitT > 0.8) {
    for (const o of race.obstacles) {
      if (o.kind === "cone" || o.goneLap === race.player.lap) continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) < o.r + 0.8) {
        c.hitT = race.time;
        c.spin = SPIN_TIME;
        c.v *= o.kind === "oil" ? 0.7 : 0.4;
        break;
      }
    }
  }
}

// Bumping: push apart, both lose a little speed.
function contact(race) {
  const me = race.player;
  for (const c of race.cars) {
    if (!c.ai) continue;
    const dx = me.x - c.x;
    const dz = me.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 0 && d < 1.7) {
      const push = (1.7 - d) / d;
      me.x += dx * push;
      me.z += dz * push;
      me.speed *= 0.97;
      c.v *= 0.98;
      if (race.time - (me.touch || -9) > 0.5) race.events.push({ kind: "touch" });
      me.touch = race.time;
    }
  }
}

// One step. input: { left, right, brake, drift, nitro, nitroTap, gas }
// (gas: leave it out for the kart to drive itself).
export function tickKartRace(race, input, dt = STEP) {
  race.time += dt;
  if (race.state === "countdown") {
    if (race.time >= 0) race.state = "racing";
    else return race;
  }
  for (const c of race.cars) {
    if (c.ai) tickRival(race, c, dt);
    else tickPlayer(race, c, input, dt);
  }
  contact(race);
  if (race.state === "racing" && race.player.finished) {
    race.state = "finished";
    race.events.push({ kind: "finish" });
  }
  return race;
}

// Fastest lap and best finish per track, on this phone.
const BEST_KEY = "tunr.kart.best";

export function loadKartBests() {
  try {
    const b = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    return b && typeof b === "object" ? b : {};
  } catch (e) {
    console.warn("Couldn't read your kart bests:", e.message);
    return {};
  }
}

export function saveKartBest(bests, trackId, { lap, place }) {
  const was = bests[trackId] || {};
  const next = { ...bests, [trackId]: { lap: was.lap ? Math.min(was.lap, lap) : lap, place: was.place ? Math.min(was.place, place) : place } };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't save your kart bests:", e.message);
  }
  return next;
}
