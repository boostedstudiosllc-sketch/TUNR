// Egg Haul: drive as far as you can over hills and bumps with an egg riding
// on your roof. A side view, in meters and seconds (y is up). The car is one
// rigid body on two sprung wheels; the egg is a small ball that sits in a
// shallow dip on the roof and slides, rolls off or cracks if you're rough
// with it. Gas drives (and in the air tips the nose up), brake slows, then
// reverses (and in the air tips the nose down).
//
// newRun(seed) → run; tickRun(run, input, dt) steps it; the terrain is the
// same for a seed, harder the further you go.

export const G = 9.8;
export const CAR = {
  half: 1.45, // half length of the body
  low: -0.12, // body underside, from the body's center
  roof: 0.55, // roof height, from the body's center
  wheelX: 1.0, // wheels at ±wheelX along the body
  wheelY: -0.42, // and this far below the center (at rest, before sag)
  wheelR: 0.36,
  mass: 1,
  inertia: 0.75,
  spring: 70, // per wheel, per unit mass
  damper: 7.5,
  drive: 8.5, // full-gas push (m/s² at a standstill)
  vmax: 21,
  reverse: 6,
  brake: 14,
  airSpin: 3.2, // rad/s² from gas or brake in the air
  grip: 1.1,
};
export const EGG = {
  r: 0.17,
  spring: 900,
  damper: 16,
  grip: 0.55,
  crack: 3.6, // a bump harder than this (m/s into the roof) cracks it
  cracks: 3, // this many cracks and it breaks
};
const ROOF = [
  // The roof, in the body's frame: a little lip at each end and a shallow
  // dip in the middle, so a careful driver can keep the egg on.
  [-0.95, CAR.roof + 0.1],
  [-0.78, CAR.roof],
  [-0.15, CAR.roof - 0.04],
  [0.5, CAR.roof],
  [0.66, CAR.roof + 0.1],
];
const STEP = 1 / 240;
const SEG = 0.25; // terrain sampled every 25 cm for collisions

// ---------- terrain ----------

function hash(seed, i) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smoothstep = (t) => t * t * (3 - 2 * t);
function noise(seed, x, spacing) {
  const u = x / spacing;
  const i = Math.floor(u);
  return hash(seed, i) * (1 - smoothstep(u - i)) + hash(seed, i + 1) * smoothstep(u - i) - 0.5;
}

// How hilly it gets: flat at the start, rougher the further you drive.
export function roughness(x) {
  return Math.min(1, Math.max(0, (x - 12) / 600));
}

// Ground height at x.
export function groundY(seed, x) {
  if (x < 8) return 0;
  const k = roughness(x);
  const ramp = Math.min(1, (x - 8) / 20);
  const hills = noise(seed, x, 34) * (6 + 10 * k) + noise(seed + 7, x, 13) * (1.6 + 3.5 * k);
  const bumps = noise(seed + 13, x, 3.2) * (0.2 + 0.7 * k);
  return ramp * (hills + bumps);
}

// The closest point of the ground to (x, y), checked along the nearby
// stretch: { d: distance (negative = under the ground), nx, ny: normal }.
function nearestGround(seed, x, y, reach) {
  let best = null;
  const a = Math.floor((x - reach) / SEG);
  const b = Math.ceil((x + reach) / SEG);
  let x0 = a * SEG;
  let y0 = groundY(seed, x0);
  for (let i = a + 1; i <= b; i++) {
    const x1 = i * SEG;
    const y1 = groundY(seed, x1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { d, px, py, sx: dx, sy: dy };
    x0 = x1;
    y0 = y1;
  }
  // Normal: straight up from the segment.
  const len = Math.hypot(best.sx, best.sy);
  const nx = -best.sy / len;
  const ny = best.sx / len;
  const under = y < groundY(seed, x);
  return { d: under ? -best.d : best.d, nx, ny };
}

// ---------- the run ----------

export function newRun(seed = 1) {
  const y = CAR.wheelR - CAR.wheelY + 0.05;
  return {
    seed,
    time: 0,
    car: { x: 0, y, a: 0, vx: 0, vy: 0, w: 0, spin: 0, grounded: 0 },
    egg: { x: -0.15, y: y + CAR.roof - 0.04 + EGG.r, vx: 0, vy: 0, roll: 0, cracks: 0, broken: false, onRoof: true },
    best: 0, // furthest x reached
    state: "driving", // driving | over
    why: "",
    overAt: 0,
    events: [],
  };
}

// Body frame → world.
function toWorld(c, lx, ly) {
  const cs = Math.cos(c.a);
  const sn = Math.sin(c.a);
  return [c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs];
}
function toLocal(c, x, y) {
  const cs = Math.cos(c.a);
  const sn = Math.sin(c.a);
  const dx = x - c.x;
  const dy = y - c.y;
  return [dx * cs + dy * sn, -dx * sn + dy * cs];
}
// Velocity of a point on the car (world offset rx, ry from its center).
const pointVel = (c, rx, ry) => [c.vx - c.w * ry, c.vy + c.w * rx];

// Where each wheel is right now (it hangs on its spring below the body).
export function wheels(car) {
  return [-CAR.wheelX, CAR.wheelX].map((lx) => {
    const [x, y] = toWorld(car, lx, CAR.wheelY);
    return { x, y };
  });
}
export const roofPoints = (car) => ROOF.map(([lx, ly]) => toWorld(car, lx, ly));

function step(run, input, dt) {
  const c = run.car;
  const seed = run.seed;
  let fx = 0;
  let fy = -G * CAR.mass;
  let torque = 0;
  const cs = Math.cos(c.a);
  const sn = Math.sin(c.a);
  const fwd = [cs, sn]; // along the car, nose forward (+x)
  const speed = c.vx * fwd[0] + c.vy * fwd[1];
  const gas = input.gas ? 1 : 0;
  const brake = input.brake ? 1 : 0;
  c.grounded = 0;

  // Wheels: a spring pushes the car up off the ground, and they drive and
  // brake along it.
  for (const lx of [-CAR.wheelX, CAR.wheelX]) {
    const [wx, wy] = toWorld(c, lx, CAR.wheelY);
    const g = nearestGround(seed, wx, wy, CAR.wheelR + 0.4);
    const pen = CAR.wheelR - g.d;
    if (pen <= 0) continue;
    c.grounded++;
    const rx = wx - c.x;
    const ry = wy - c.y;
    const [vx, vy] = pointVel(c, rx, ry);
    const vn = vx * g.nx + vy * g.ny;
    const n = Math.max(0, CAR.spring * Math.min(pen, 0.5) - CAR.damper * vn) * CAR.mass;
    // Along the ground, the way the car faces.
    let tx = g.ny;
    let ty = -g.nx;
    if (tx * fwd[0] + ty * fwd[1] < 0) {
      tx = -tx;
      ty = -ty;
    }
    const vt = vx * tx + vy * ty;
    let ft = 0;
    if (gas) ft = (CAR.drive / 2) * CAR.mass * Math.max(0, 1 - vt / CAR.vmax);
    else if (brake) ft = vt > 0.3 ? -CAR.brake / 2 : (-CAR.drive / 3) * Math.max(0, 1 + vt / CAR.reverse);
    else ft = -vt * 0.08; // rolling
    ft = Math.max(-CAR.grip * n, Math.min(CAR.grip * n, ft));
    const px = g.nx * n + tx * ft;
    const py = g.ny * n + ty * ft;
    fx += px;
    fy += py;
    torque += rx * py - ry * px;
  }

  // The body itself scrapes the ground if it lands on its roof or belly.
  for (const [lx, ly] of [
    [-CAR.half, CAR.low],
    [CAR.half, CAR.low],
    [-CAR.half * 0.7, CAR.roof],
    [CAR.half * 0.45, CAR.roof],
    [0, CAR.roof + 0.05],
  ]) {
    const [px, py] = toWorld(c, lx, ly);
    const g = nearestGround(seed, px, py, 0.6);
    if (g.d >= 0.02) continue;
    const pen = 0.02 - g.d;
    const rx = px - c.x;
    const ry = py - c.y;
    const [vx, vy] = pointVel(c, rx, ry);
    const vn = vx * g.nx + vy * g.ny;
    const n = Math.max(0, 300 * pen - 12 * vn) * CAR.mass;
    const vt = vx * g.ny - vy * g.nx;
    const ft = Math.max(-0.8 * n, Math.min(0.8 * n, -vt * 6));
    const ffx = g.nx * n + g.ny * ft;
    const ffy = g.ny * n - g.nx * ft;
    fx += ffx;
    fy += ffy;
    torque += rx * ffy - ry * ffx;
    if (ly > 0 && n > 0.5 && !run.egg.broken) breakEgg(run, "roof");
  }

  // In the air: gas tips the nose up, brake tips it down.
  if (!c.grounded) torque += (gas - brake) * CAR.airSpin * CAR.inertia;

  c.vx += (fx / CAR.mass) * dt;
  c.vy += (fy / CAR.mass) * dt;
  c.w += (torque / CAR.inertia) * dt;
  c.w *= 1 - 0.4 * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.a += c.w * dt;
  c.spin += (speed / CAR.wheelR) * dt;

  stepEgg(run, dt);
}

// The egg: a small ball pushed by the roof (and the ground, if it falls).
function stepEgg(run, dt) {
  const e = run.egg;
  const c = run.car;
  let ax = 0;
  let ay = -G;
  e.onRoof = false;
  if (!e.broken || e.y > -50) {
    // Against the roof, in the car's frame.
    const [lx, ly] = toLocal(c, e.x, e.y);
    for (let i = 0; i < ROOF.length - 1; i++) {
      const [x0, y0] = ROOF[i];
      const [x1, y1] = ROOF[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((lx - x0) * dx + (ly - y0) * dy) / (dx * dx + dy * dy)));
      const qx = x0 + dx * t;
      const qy = y0 + dy * t;
      const d = Math.hypot(lx - qx, ly - qy);
      if (d >= EGG.r || d === 0) continue;
      // Contact: normal and the roof's own velocity there, back in the world.
      let nlx = (lx - qx) / d;
      let nly = (ly - qy) / d;
      if (nly < 0 && t > 0 && t < 1) {
        nlx = -nlx;
        nly = -nly;
      }
      const cs = Math.cos(c.a);
      const sn = Math.sin(c.a);
      const nx = nlx * cs - nly * sn;
      const ny = nlx * sn + nly * cs;
      const [qwx, qwy] = toWorld(c, qx, qy);
      const [rvx, rvy] = pointVel(c, qwx - c.x, qwy - c.y);
      const relx = e.vx - rvx;
      const rely = e.vy - rvy;
      const vn = relx * nx + rely * ny;
      if (vn < -EGG.crack && !e.broken) crack(run);
      const n = Math.max(0, EGG.spring * (EGG.r - d) - EGG.damper * vn);
      const vt = relx * -ny + rely * nx;
      const ft = Math.max(-EGG.grip * n, Math.min(EGG.grip * n, -vt * 30));
      ax += nx * n - ny * ft;
      ay += ny * n + nx * ft;
      e.roll += (vt / EGG.r) * dt;
      e.onRoof = true;
    }
    // The ground: an egg that falls off breaks.
    const g = nearestGround(run.seed, e.x, e.y, 0.4);
    if (g.d < EGG.r) {
      if (!e.broken) breakEgg(run, "dropped");
      const pen = EGG.r - g.d;
      const vn = e.vx * g.nx + e.vy * g.ny;
      const n = Math.max(0, EGG.spring * pen - EGG.damper * 2 * vn);
      ax += g.nx * n - e.vx * 6;
      ay += g.ny * n - e.vy * 6;
    }
  }
  e.vx += ax * dt;
  e.vy += ay * dt;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

function crack(run) {
  const e = run.egg;
  e.cracks++;
  run.events.push({ type: "crack", cracks: e.cracks });
  if (e.cracks >= EGG.cracks) breakEgg(run, "cracked");
}

function breakEgg(run, why) {
  const e = run.egg;
  if (e.broken) return;
  e.broken = true;
  e.cracks = EGG.cracks;
  run.events.push({ type: "broke", why });
  if (run.state === "driving") {
    run.state = "over";
    run.why = why;
    run.overAt = run.time;
  }
}

// One frame. input: { gas, brake }. Returns the run.
export function tickRun(run, input, dt) {
  const steps = Math.max(1, Math.round(Math.min(dt, 0.05) / STEP));
  for (let i = 0; i < steps; i++) {
    step(run, run.state === "driving" ? input : {}, STEP);
    run.time += STEP;
  }
  run.best = Math.max(run.best, run.car.x);
  return run;
}

// Meters driven, for the score.
export const distance = (run) => Math.max(0, Math.floor(run.best));

export const WHY = {
  dropped: "The egg rolled off.",
  cracked: "Too many hard bumps: the egg cracked.",
  roof: "You landed on your roof.",
};

// Best distance on this phone.
const BEST_KEY = "tunr.egg.best";
export function loadEggBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    console.warn("Couldn't read your Egg Haul best:", e.message);
    return 0;
  }
}
export function saveEggBest(m) {
  const best = Math.max(loadEggBest(), m);
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch (e) {
    console.warn("Couldn't save your Egg Haul best:", e.message);
  }
  return best;
}
