// Drift King: arcade F1 racing on real circuit layouts (f1Tracks.js). Gas,
// brake, and steer left or right; steering while on the gas at speed
// throws the car into a drift (the tail slides, it turns tighter and scrubs
// a little speed). Race three rivals over a few laps, everyone in the same
// type of car. Two Boosted Studios coins a lap on the long straights give
// you a short burst of speed. Pure logic, no imports, so the game and the
// tests share it.
//
// Meters and seconds. The ground is x (east) and z (south); heading 0 faces
// -z (north) and grows turning left, like three.js's rotation.y.

import { noteReport, followReports } from "./remoteMotion.js";

export const STEP = 1 / 120;
export const TRACK_W = 12;
export const KERB_W = 1.3;
export const CAR = { length: 5.4, width: 1.9 };

export const BRAKE = 32;
const REVERSE_MAX = 10;
const DRAG = 0.9;
const DRIFT_SCRUB = 0.08; // a drift loses this share of speed a second
const GRIP = 9; // how fast sideways sliding dies away (gripping)
const GRASS_MAX = 26; // top speed on the grass
const RUNOFF_MAX = 14;
const RUNOFF_MIN = 1.2; // street circuits: walls right by the kerbs

// The cars. Everyone in a race drives the same type, so it's always fair.
//   vmax: top speed (m/s; 80 is ~180 MPH)  accel: how hard it pulls
//   grip: sideways m/s² the tyres hold  steer: turn rate (rad/s) at most
//   driftTurn: how much tighter a drift turns  driftGrip: how slowly the
//   slide straightens out in a drift (lower = longer, looser slides)
export const CARS = {
  formula: { name: "Formula", blurb: "Open-wheel. The fastest, and it grips the hardest.", vmax: 80, accel: 15, grip: 34, steer: 2.3, driftTurn: 1.35, driftGrip: 1.4 },
  gt: { name: "GT", blurb: "Mid-engine supercar. Quick and steady.", vmax: 75, accel: 14.5, grip: 31, steer: 2.25, driftTurn: 1.35, driftGrip: 1.5 },
  tuner: { name: "Tuner", blurb: "Light and loose. Built to drift.", vmax: 68, accel: 14, grip: 28, steer: 2.5, driftTurn: 1.5, driftGrip: 0.95 },
  muscle: { name: "Muscle", blurb: "Huge launch, big top end, a handful in the bends.", vmax: 77, accel: 17, grip: 25, steer: 2.05, driftTurn: 1.45, driftGrip: 1.1 },
};

// Boosted Studios coins: two a lap, yours only, back again next lap.
export const COIN = { perLap: 2, reach: 2.4, seconds: 2.5, topSpeed: 10, accel: 1.8 };
const fwd = (h) => [-Math.sin(h), -Math.cos(h)];
const wrap = (i, n) => ((i % n) + n) % n;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------- the track ----------

// A closed Catmull-Rom curve through the stored points, every ~2.5 m, with
// each point's direction, curvature (+ = bending left), and how much runoff
// there's room for on each side before the wall.
export function buildTrack(def) {
  const base = [];
  for (let i = 0; i < def.points.length; i += 2) base.push([def.points[i] / 10, def.points[i + 1] / 10]);
  const m = base.length;
  const SUB = 4;
  const n = m * SUB;
  const x = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < m; i++) {
    const p0 = base[wrap(i - 1, m)];
    const p1 = base[i];
    const p2 = base[wrap(i + 1, m)];
    const p3 = base[wrap(i + 2, m)];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      x[i * SUB + k] = c(p0[0], p1[0], p2[0], p3[0]);
      z[i * SUB + k] = c(p0[1], p1[1], p2[1], p3[1]);
    }
  }
  const s = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) s[i] = s[i - 1] + Math.hypot(x[wrap(i, n)] - x[i - 1], z[wrap(i, n)] - z[i - 1]);
  const L = s[n];
  const heading = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = wrap(i - 1, n);
    const b = wrap(i + 1, n);
    heading[i] = Math.atan2(-(x[b] - x[a]), -(z[b] - z[a]));
  }
  // Curvature, smoothed over ~15 m.
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = wrap(i - 2, n);
    const b = wrap(i + 2, n);
    const ds = s[i + 2 <= n ? i + 2 : n] - s[i - 2 >= 0 ? i - 2 : 0] || 10;
    raw[i] = angleDiff(heading[b], heading[a]) / Math.abs(ds);
  }
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -3; j <= 3; j++) sum += raw[wrap(i + j, n)];
    k[i] = sum / 7;
  }
  // Room before the wall: half the gap to any other part of the track (so
  // close sections share a wall), and never past the middle of a bend.
  const roL = new Float32Array(n);
  const roR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let near = Infinity;
    for (let j = 0; j < n; j += 2) {
      let gap = Math.abs(s[i] - s[j]);
      gap = Math.min(gap, L - gap);
      if (gap < 70) continue;
      const d = Math.hypot(x[i] - x[j], z[i] - z[j]);
      if (d < near) near = d;
    }
    let room = Math.max(RUNOFF_MIN, Math.min(RUNOFF_MAX, near / 2 - TRACK_W / 2 - 0.6));
    const radius = Math.abs(k[i]) > 1e-4 ? 1 / Math.abs(k[i]) : Infinity;
    const inside = Math.max(RUNOFF_MIN, Math.min(room, (radius - TRACK_W / 2) * 0.7));
    roL[i] = k[i] > 0 ? inside : room;
    roR[i] = k[i] > 0 ? room : inside;
  }
  // A street circuit: walls close by most of the way.
  let tight = 0;
  for (let i = 0; i < n; i++) if (Math.min(roL[i], roR[i]) < 4) tight++;
  return { ...def, n, x, z, s, L, heading, k, roL, roR, street: tight / n > 0.35 };
}

// Where a point is relative to the track near index `hint`: the nearest
// index, distance along (s), and sideways offset (+ = left of the middle).
export function locate(track, px, pz, hint = 0, back = 30, ahead = 60) {
  const { n, x, z } = track;
  let best = hint;
  let bestD = Infinity;
  for (let j = -back; j <= ahead; j++) {
    const i = wrap(hint + j, n);
    const d = (px - x[i]) ** 2 + (pz - z[i]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const [fx, fz] = fwd(track.heading[best]);
  const dx = px - x[best];
  const dz = pz - z[best];
  const along = dx * fx + dz * fz;
  const side = dx * fz - dz * fx; // left = (fz, -fx)
  let s = track.s[best] + along;
  if (s < 0) s += track.L;
  if (s >= track.L) s -= track.L;
  return { i: best, s, side };
}

// The point `side` meters left of the middle line at distance s.
export function pointAt(track, s, side = 0) {
  const { n, L } = track;
  s = ((s % L) + L) % L;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.s[mid] <= s) lo = mid;
    else hi = mid;
  }
  const i = lo;
  const j = wrap(i + 1, n);
  const f = (s - track.s[i]) / (track.s[i + 1] - track.s[i] || 1);
  const px = track.x[i] + (track.x[j] - track.x[i]) * f;
  const pz = track.z[i] + (track.z[j] - track.z[i]) * f;
  const h = track.heading[i] + angleDiff(track.heading[j], track.heading[i]) * f;
  const [fx, fz] = fwd(h);
  return { x: px + fz * side, z: pz - fx * side, heading: h, i };
}

// The fastest each point can be taken (gripping), with braking for the
// bends ahead. a: sideways grip in m/s²; brake: m/s².
export function speedProfile(track, a = CARS.formula.grip * 0.92, brake = BRAKE * 0.8, top = CARS.formula.vmax) {
  const { n, k, s, L } = track;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(top, Math.sqrt(a / Math.max(Math.abs(k[i]), 1e-4)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = wrap(i + 1, n);
      const ds = j === 0 ? L - s[i] : s[j] - s[i];
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * ds));
    }
  }
  return v;
}

// ---------- the race ----------

const RIVALS = [
  { name: "VOLT", color: "#E11D2E", accent: "#F5F5F5", skill: 0.8 },
  { name: "ORBIT", color: "#F97316", accent: "#111827", skill: 0.77 },
  { name: "STORM", color: "#10B981", accent: "#F5F5F5", skill: 0.74 },
];

// How hard the rivals push: their skill is scaled by this.
export const DIFFICULTY = { easy: 0.88, medium: 1, hard: 1.1 };

// Where the coins go: early on the longest straights, off to one side so
// you have to steer for them.
export function coinSpots(track, count = COIN.perLap) {
  const { n, k } = track;
  // Find the stretches with no real bend in them.
  const start = Array.from({ length: n }, (_, i) => i).find((i) => Math.abs(k[i]) > 0.004) ?? 0;
  const runs = [];
  let run = null;
  for (let j = 1; j <= n; j++) {
    const i = (start + j) % n;
    if (Math.abs(k[i]) <= 0.004) {
      if (!run) run = { from: i, len: 0 };
      run.len++;
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs
    .sort((a, b) => b.len - a.len)
    .slice(0, count)
    .filter((r) => r.len >= 20)
    .map((r, j) => ({ i: (r.from + 8) % n, side: j % 2 ? -2.6 : 2.6 }))
    .map((c) => {
      const at = pointAt(track, track.s[c.i], c.side);
      return { ...c, s: track.s[c.i], x: at.x, z: at.z, takenLap: null };
    });
}

// slot: your grid spot (default: the back, behind the rivals). Racing a
// friend, the two of you take spots 0 and 1 with no rivals.
export function newRace(track, { laps = 3, rivals = 3, seed = 1, difficulty = "medium", car = "formula", slot = null } = {}) {
  const pace = DIFFICULTY[difficulty] || 1;
  const spec = CARS[car] || CARS.formula;
  let r = seed % 2147483647 || 1;
  const rand = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const profile = speedProfile(track, spec.grip * 0.92, BRAKE * 0.8, spec.vmax);
  // The grid: two by two behind the line, you at the back.
  const slots = [];
  for (let i = 0; i <= rivals; i++) slots.push(gridSlot(i));
  const cars = [];
  RIVALS.slice(0, rivals).forEach((rv, i) => {
    const slot = slots[i];
    const p = pointAt(track, track.L - slot.back, slot.side);
    cars.push({
      ai: true,
      ...rv,
      skill: (rv.skill - rand() * 0.02) * pace,
      s: track.L - slot.back,
      lane: slot.side,
      laneGoal: (rand() - 0.5) * 3,
      v: 0,
      x: p.x,
      z: p.z,
      heading: p.heading,
      idx: p.i,
      lap: -1,
      armed: true,
      finished: null,
    });
  });
  // Racing a friend (slot 0 or 1): the two of you start behind the rivals.
  const me = slot == null ? slots[rivals] : gridSlot(rivals + slot);
  const p = pointAt(track, track.L - me.back, me.side);
  const player = {
    ai: false,
    name: "YOU",
    x: p.x,
    z: p.z,
    heading: p.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    slide: p.heading,
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
    boost: 0,
    drifting: false,
    surface: "track",
    bump: 0,
    wrongWay: 0,
  };
  cars.push(player);
  // rand: the race's own random numbers, so two phones racing each other
  // (same seed) see the rivals do the same things.
  return { track, laps, difficulty, car: CARS[car] ? car : "formula", spec, profile, cars, player, rivals, rand, coins: coinSpots(track), time: -3, state: "countdown", events: [] };
}

function gridSlot(i) {
  return { back: 8 + i * 9, side: i % 2 ? -2.4 : 2.4 };
}

// Racing a friend: their car, placed and moved by their phone's reports.
// slot: theirs (0 or 1), behind the rivals like yours.
export function addRemoteCar(race, { name, color = "#F472B6", look = null, slot = 1 }) {
  const g = gridSlot((race.rivals || 0) + slot);
  const p = pointAt(race.track, race.track.L - g.back, g.side);
  const car = { remote: true, ai: false, name, color, look, x: p.x, z: p.z, heading: p.heading, speed: 0, steer: 0, idx: p.i, s: race.track.L - g.back, side: g.side, lap: -1, finished: null, out: null };
  race.cars.push(car);
  return car;
}

// What this phone reports about its car, a dozen times a second.
export const reportOf = (race) => {
  const p = race.player;
  return { t: race.time, x: p.x, z: p.z, heading: p.heading, speed: p.speed, steer: p.steer, s: p.s, idx: p.idx, lap: p.lap, side: p.side, finished: p.finished };
};

// A report from the other phone. `out` ("left") if they've gone.
export function applyRemote(car, r) {
  if (r.out) {
    car.out = r.out;
    return;
  }
  for (const k of ["speed", "steer", "s", "idx", "lap", "side"]) if (typeof r[k] === "number") car[k] = r[k];
  if ([r.t, r.x, r.z, r.heading].every((v) => typeof v === "number")) noteReport(car, r);
  if (r.finished != null) car.finished = r.finished;
}

export const kmh = (ms) => Math.round(ms * 3.6);
export const mph = (ms) => Math.round(ms * 2.237);

// Laps: the line counts once you've been round past halfway.
export function crossLine(race, car, prevS) {
  const { L } = race.track;
  if (car.s > L * 0.35 && car.s < L * 0.65) car.armed = true;
  if (prevS > L * 0.75 && car.s < L * 0.25 && car.armed) {
    car.armed = false;
    car.lap += 1;
    if (!car.ai && car.lap >= 1) {
      car.lapTimes.push(race.time - car.lapStart);
      race.events.push({ kind: "lap", lap: car.lap, time: race.time - car.lapStart });
    }
    if (!car.ai) car.lapStart = race.time;
    if (car.lap >= race.laps && !car.finished) car.finished = race.time;
  } else if (prevS < L * 0.25 && car.s > L * 0.75 && car.lap >= 0) {
    // Backed over the line: undo.
    car.lap -= 1;
    car.armed = true;
  }
}

function tickPlayer(race, c, input, dt) {
  const t = race.track;
  // Steering eases in and out.
  const want = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  c.steer += Math.max(-dt * 7, Math.min(dt * 7, want - c.steer));

  const where = locate(t, c.x, c.z, c.idx);
  const off = Math.abs(where.side) - TRACK_W / 2;
  c.surface = off <= 0 ? "track" : off <= KERB_W ? "kerb" : "grass";

  // Speed along the way you're going (negative = reversing).
  let v = c.speed;
  const spec = race.spec;
  c.boost = Math.max(0, c.boost - dt);
  const boosted = c.boost > 0 && c.surface !== "grass";
  const top = c.surface === "grass" ? GRASS_MAX : spec.vmax + (boosted ? COIN.topSpeed : 0);
  if (c.finished) {
    v -= Math.sign(v) * Math.min(Math.abs(v), 8 * dt);
  } else if (input.gas) {
    if (v < -0.5) v = Math.min(0, v + BRAKE * dt);
    else v += spec.accel * (boosted ? COIN.accel : 1) * (1 - Math.max(0, v) / top) * dt * (v < 20 ? 1.4 : 1);
  } else if (input.brake) {
    v = v > 0.5 ? Math.max(0, v - BRAKE * dt) : Math.max(-REVERSE_MAX, v - 6 * dt);
  } else {
    v -= Math.sign(v) * Math.min(Math.abs(v), (2 + DRAG * 0.02 * v * v) * dt);
  }
  if (v > top) v -= Math.min(v - top, (c.surface === "grass" ? 30 : 6) * dt);
  if (c.surface === "kerb") v -= Math.sign(v) * 1.5 * dt;

  // A drift: steering on the gas at speed.
  c.drifting = Boolean(input.gas && want !== 0 && v > 18 && c.surface !== "grass" && !c.finished);
  const speed = Math.abs(v);
  let yaw = Math.min(spec.steer, spec.grip / Math.max(speed, 1)) * Math.min(1, speed / 6) * c.steer * Math.sign(v || 1);
  if (c.drifting) yaw *= spec.driftTurn;
  c.heading += yaw * dt;

  // The way the car's actually moving trails the way it points: almost at
  // once when gripping, slowly in a drift (that's the tail sliding out).
  const aim = v >= 0 ? c.heading : c.heading + Math.PI;
  const rate = c.drifting ? spec.driftGrip : c.surface === "grass" ? 5 : GRIP;
  const slip = angleDiff(aim, c.slide);
  c.slide += slip * Math.min(1, rate * dt);
  c.slip = Math.abs(angleDiff(aim, c.slide));
  if (c.drifting) v -= v * DRIFT_SCRUB * dt;
  v -= v * Math.min(0.5, c.slip * 0.25) * dt; // sliding scrubs speed
  c.speed = v;

  // The slide points the way you're moving (backwards when reversing).
  const [mx, mz] = fwd(c.slide);
  c.vx = mx * Math.abs(v);
  c.vz = mz * Math.abs(v);
  c.x += c.vx * dt;
  c.z += c.vz * dt;

  // The wall: put back on the right side of it and lose most of the speed.
  const after = locate(t, c.x, c.z, where.i);
  const room = TRACK_W / 2 + (after.side > 0 ? t.roL[after.i] : t.roR[after.i]);
  if (Math.abs(after.side) > room) {
    const back = Math.abs(after.side) - room + 0.05;
    const [tfx, tfz] = fwd(t.heading[after.i]);
    const sign = Math.sign(after.side);
    c.x -= tfz * back * sign;
    c.z += tfx * back * sign;
    c.speed *= 0.45;
    // Turned to run along the wall.
    c.heading += angleDiff(t.heading[after.i], c.heading) * 0.35;
    c.slide = c.speed >= 0 ? c.heading : c.heading + Math.PI;
    if (race.time - c.bump > 0.4) race.events.push({ kind: "wall" });
    c.bump = race.time;
  }
  const prevS = c.s;
  const now = locate(t, c.x, c.z, after.i);
  c.idx = now.i;
  c.s = now.s;
  c.side = now.side;
  // Facing backwards for a while: wrong way.
  const backwards = Math.abs(angleDiff(c.heading, t.heading[now.i])) > 2.2 && Math.abs(c.speed) > 3;
  c.wrongWay = backwards ? c.wrongWay + dt : 0;
  crossLine(race, c, prevS);
  // Coins: drive through one for a boost. Each comes back next lap.
  if (!c.finished) {
    for (const coin of race.coins) {
      if (coin.takenLap === c.lap) continue;
      if (Math.hypot(coin.x - c.x, coin.z - c.z) < COIN.reach) {
        coin.takenLap = c.lap;
        c.boost = COIN.seconds;
        race.events.push({ kind: "coin" });
      }
    }
  }
}

// Someone just ahead in your lane: { car, gap } (meters along the track).
function carAhead(race, c) {
  const { L } = race.track;
  let best = null;
  for (const o of race.cars) {
    if (o === c) continue;
    let gap = o.s - c.s;
    if (gap < -L / 2) gap += L;
    if (gap > L / 2) gap -= L;
    const side = o.ai ? o.lane : o.side;
    if (gap > 0 && gap < 16 && Math.abs(side - c.lane) < 2.8 && (!best || gap < best.gap)) best = { car: o, gap, side };
  }
  return best;
}

function tickRival(race, c, dt) {
  const t = race.track;
  const ahead = Math.round(12 / 2.5);
  let vt = race.profile[wrap(c.idx + ahead, t.n)] * c.skill;
  // Traffic: pull out to pass, and don't drive into the back of anyone.
  const front = carAhead(race, c);
  if (front) {
    const room = TRACK_W / 2 - 1.4;
    c.laneGoal = front.side > 0 ? Math.max(-room, front.side - 3.6) : Math.min(room, front.side + 3.6);
    const theirs = front.car.ai ? front.car.v : Math.abs(front.car.speed);
    if (front.gap < 9) vt = Math.min(vt, theirs + 0.5);
  }
  if (c.finished) c.v = Math.max(0, c.v - 8 * dt);
  else c.v = c.v < vt ? Math.min(vt, c.v + race.spec.accel * 1.05 * dt * (c.v < 20 ? 1.4 : 1)) : Math.max(vt, c.v - BRAKE * 0.85 * dt);
  // Wander to a new line now and then; tuck in for bends unless passing.
  if (!front && Math.abs(c.lane - c.laneGoal) < 0.1 && race.rand() < dt * 0.15) c.laneGoal = (race.rand() - 0.5) * 6;
  const goal = Math.abs(t.k[c.idx]) > 0.02 && !front ? c.laneGoal * 0.3 : c.laneGoal;
  c.lane += Math.max(-dt * 2.2, Math.min(dt * 2.2, goal - c.lane));
  const prevS = c.s;
  c.s = (c.s + c.v * dt) % t.L;
  const p = pointAt(t, c.s, c.lane);
  c.x = p.x;
  c.z = p.z;
  c.heading = p.heading;
  c.idx = p.i;
  crossLine(race, c, prevS);
}

// Bumping wheels: push apart, both lose a little speed.
function contact(race) {
  const me = race.player;
  for (const c of race.cars) {
    if (!c.ai) continue;
    const dx = me.x - c.x;
    const dz = me.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 0 && d < 3.6) {
      const push = (3.6 - d) / d;
      me.x += dx * push;
      me.z += dz * push;
      me.speed *= 0.97;
      c.v *= 0.985;
      if (race.time - (me.touch || -9) > 0.5) race.events.push({ kind: "touch" });
      me.touch = race.time;
    }
  }
}

// One step. input: { gas, brake, left, right }.
export function tickRace(race, input, dt = STEP) {
  race.time += dt;
  if (race.state === "countdown") {
    if (race.time >= 0) race.state = "racing";
    else return race;
  }
  for (const c of race.cars) {
    if (c.remote) {
      followReports(c, race.time, dt);
      continue;
    }
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

// Everyone's place: finished first (by time), then by distance covered.
export function standings(race) {
  const progress = (c) => c.lap * race.track.L + c.s;
  return [...race.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finished - b.finished;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return progress(b) - progress(a);
  });
}

export const placeOf = (race, car = race.player) => standings(race).indexOf(car) + 1;
export const speedNow = (race) => Math.abs(race.player.speed);

export const lapClock = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return "–:––.–––";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
};

// The track's outline for the mini-map and the track list: points scaled
// into a w × h box, plus the scale used.
export function outline(track, w, h, pad = 6) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.points.length; i += 2) {
    minX = Math.min(minX, track.points[i]);
    maxX = Math.max(maxX, track.points[i]);
    minZ = Math.min(minZ, track.points[i + 1]);
    maxZ = Math.max(maxZ, track.points[i + 1]);
  }
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = pad + (w - pad * 2 - (maxX - minX) * scale) / 2;
  const oz = pad + (h - pad * 2 - (maxZ - minZ) * scale) / 2;
  const map = (x, z) => [ox + (x * 10 - minX) * scale, oz + (z * 10 - minZ) * scale];
  const pts = [];
  for (let i = 0; i < track.points.length; i += 2) pts.push(map(track.points[i] / 10, track.points[i + 1] / 10));
  return { pts, map };
}

// ---------- bests (this phone only) ----------

const BEST_KEY = "tunr.f1.best";

export function loadBests() {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    console.warn("Couldn't read Drift King bests:", e.message);
    return {};
  }
}

// Keeps your fastest lap and best finish per track.
export function saveBest(bests, trackId, { lap, place }) {
  const old = bests[trackId] || {};
  const next = {
    ...bests,
    [trackId]: {
      lap: lap && (!old.lap || lap < old.lap) ? lap : old.lap || null,
      place: place && (!old.place || place < old.place) ? place : old.place || null,
    },
  };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't save Drift King bests:", e.message);
  }
  return next;
}
