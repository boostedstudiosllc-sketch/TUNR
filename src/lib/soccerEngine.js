// Turbo Ball: car soccer. Two teams of cars knock a big ball round a walled
// arena; drive it into the other goal. Pure logic, so the game and the tests
// share it.
//
// Meters and seconds. The floor is x (sideways) and z (end to end), y is up.
// Heading 0 faces -z and grows turning left, as in the racing games. Blue
// (team 0) defends the +z goal and attacks -z; orange (team 1) the reverse.
//
// Cars drive on the floor and can jump; a second tap in the air flips the
// car, which lunges it forward (or sideways) and hits the ball harder.
// BOOST pushes you past normal top speed, using up the meter; pads on the
// floor refill it. The computer drives its cars with the same controls as
// you, so it plays by the same rules.

export const STEP = 1 / 120;
export const FIELD = { w: 34, l: 52, corner: 10, ceiling: 20 }; // half width, half length
export const GOAL = { w: 9, h: 7, depth: 8 }; // half width, height, depth
export const BALL = { r: 1.6, gravity: 15, bounce: 0.62, wall: 0.72, drag: 0.03, roll: 0.35, max: 46 };
export const CAR = { length: 4, width: 2.1, hit: 1.15, accel: 14, top: 22, boost: 24, boostTop: 32, brake: 30, reverse: 10, steer: 2.6, grip: 34, jump: 8.5, gravity: 22, flip: 9, wallR: 1.3 };
export const BOOST = { use: 34, small: 12, big: 100, smallBack: 4, bigBack: 10, start: 33 };
export const MATCH_LENGTHS = [120, 180, 300];

const fwd = (h) => [-Math.sin(h), -Math.cos(h)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const headingTo = (dx, dz) => Math.atan2(-dx, -dz);

// Boost pads: big ones in the corners and halfway along the sides, small
// ones scattered between.
export const PADS = [
  ...[
    [-28, -44],
    [28, -44],
    [-28, 44],
    [28, 44],
    [-31, 0],
    [31, 0],
  ].map(([x, z]) => ({ x, z, big: true })),
  ...[
    [0, -20],
    [0, 20],
    [-14, -12],
    [14, -12],
    [-14, 12],
    [14, 12],
    [-14, -36],
    [14, -36],
    [-14, 36],
    [14, 36],
    [0, -42],
    [0, 42],
    [-24, -22],
    [24, -22],
    [-24, 22],
    [24, 22],
  ].map(([x, z]) => ({ x, z, big: false })),
];

// How the computer plays at each difficulty: how hard it drives, how often
// it rethinks, and whether it boosts and flips.
export const AI_LEVELS = {
  easy: { throttle: 0.72, think: 0.35, boost: 0.15, flip: 0, aim: 0.6, jump: 0.4 },
  medium: { throttle: 0.9, think: 0.18, boost: 0.6, flip: 0.25, aim: 0.85, jump: 0.75 },
  hard: { throttle: 1, think: 0.08, boost: 1, flip: 0.6, aim: 1, jump: 1 },
};

const NAMES = [["YOU", "ACE"], ["BLITZ", "JINX", "VEX"]];
export const TEAM_COLORS = ["#0080F0", "#F97316"];

function kickoffSpots(size) {
  // Blue's spots (+z side); orange's are the mirror image.
  return size === 1 ? [[0, 34]] : [[-12, 32], [12, 38]];
}

// online: playing a friend, 1 v 1. "host" runs the match (you're blue, the
// orange car is driven by the friend's controls); "guest" is orange and
// shows the host's match, predicting between its snapshots.
export function newMatch({ size = 1, length = 180, difficulty = "medium", seed = 1, online = null } = {}) {
  if (online) size = 1;
  const cars = [];
  for (const team of [0, 1]) {
    for (let k = 0; k < size; k++) {
      cars.push({
        team,
        me: team === 0 && k === 0,
        name: NAMES[team][k] || `CPU${k}`,
        color: TEAM_COLORS[team],
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        heading: 0,
        speed: 0,
        steer: 0,
        onGround: true,
        boost: BOOST.start,
        boosting: false,
        jumpT: 0,
        canFlip: false,
        flipT: 0,
        flipDir: [0, 0],
        jumpHeld: false,
        hitT: -9,
        ai: team === 1 || k > 0 ? { next: 0, target: null, stuck: 0, reverseT: 0 } : null,
      });
    }
  }
  if (online) {
    const [mine, theirs] = online === "host" ? [cars[0], cars[1]] : [cars[1], cars[0]];
    mine.me = true;
    mine.ai = null;
    theirs.me = false;
    theirs.ai = null;
    theirs.remote = true;
    theirs.input = {};
  }
  const match = {
    online,
    size,
    length,
    difficulty,
    level: AI_LEVELS[difficulty] || AI_LEVELS.medium,
    cars,
    player: online === "guest" ? cars[1] : cars[0],
    ball: { x: 0, y: BALL.r, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 },
    pads: PADS.map((p) => ({ ...p, back: 0 })),
    score: [0, 0],
    clock: length,
    overtime: false,
    time: 0,
    state: "kickoff",
    stateT: 3,
    lastTouch: null,
    scorer: null,
    seed,
    events: [],
  };
  kickoff(match);
  return match;
}

// Everyone back to their spots, the ball in the middle, a 3-2-1 count.
function kickoff(match) {
  const spots = kickoffSpots(match.size);
  for (const team of [0, 1]) {
    const mine = match.cars.filter((c) => c.team === team);
    mine.forEach((c, k) => {
      const [x, z] = spots[k];
      const sx = team === 0 ? x : -x;
      const sz = team === 0 ? z : -z;
      Object.assign(c, { x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, speed: 0, steer: 0, onGround: true, boost: BOOST.start, boosting: false, flipT: 0, canFlip: false, jumpHeld: false });
      c.heading = headingTo(-sx, -sz);
    });
  }
  Object.assign(match.ball, { x: 0, y: BALL.r, z: 0, vx: 0, vy: 0, vz: 0 });
  for (const p of match.pads) p.back = 0;
  match.state = "kickoff";
  match.stateT = 3;
  match.lastTouch = null;
  match.events.push({ kind: "kickoff" });
}

// ---------- the arena ----------

// Keep a ball (or car) of radius r inside the arena: rounded corners, and
// the goal mouths open into the goal boxes. Bounces with `e` of the speed
// into the wall. Returns how hard it hit (m/s into the wall), or 0.
function collideArena(o, r, e, canGoal = true) {
  const { w: W, l: L, corner: R } = FIELD;
  const mouth = Math.abs(o.x) < GOAL.w - r && o.y < GOAL.h - r;
  let hit = 0;
  const bounce = (nx, nz, ny = 0) => {
    const into = o.vx * nx + o.vz * nz + o.vy * ny;
    if (into > 0) {
      o.vx -= (1 + e) * into * nx;
      o.vz -= (1 + e) * into * nz;
      o.vy -= (1 + e) * into * ny;
      hit = Math.max(hit, into);
    }
  };
  if (canGoal && (Math.abs(o.z) > L || (mouth && Math.abs(o.z) > L - r))) {
    // In (or going into) a goal: its sides, roof and back.
    const sz = Math.sign(o.z);
    if (Math.abs(o.z) > L) {
      if (Math.abs(o.x) > GOAL.w - r) {
        o.x = Math.sign(o.x) * (GOAL.w - r);
        bounce(Math.sign(o.x), 0);
      }
      if (o.y > GOAL.h - r) {
        o.y = GOAL.h - r;
        bounce(0, 0, 1);
      }
    }
    if (Math.abs(o.z) > L + GOAL.depth - r) {
      o.z = sz * (L + GOAL.depth - r);
      bounce(0, sz);
    }
    return hit;
  }
  const qx = Math.abs(o.x) - (W - R);
  const qz = Math.abs(o.z) - (L - R);
  if (qx > 0 && qz > 0) {
    const d = Math.hypot(qx, qz);
    if (d > R - r) {
      const nx = (Math.sign(o.x) * qx) / d;
      const nz = (Math.sign(o.z) * qz) / d;
      o.x -= nx * (d - (R - r));
      o.z -= nz * (d - (R - r));
      bounce(nx, nz);
    }
  } else {
    if (Math.abs(o.x) > W - r) {
      o.x = Math.sign(o.x) * (W - r);
      bounce(Math.sign(o.x), 0);
    }
    if (Math.abs(o.z) > L - r) {
      o.z = Math.sign(o.z) * (L - r);
      bounce(0, Math.sign(o.z));
    }
  }
  return hit;
}

function tickBall(match, dt) {
  const b = match.ball;
  b.vy -= BALL.gravity * dt;
  const drag = 1 - BALL.drag * dt;
  b.vx *= drag;
  b.vz *= drag;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  if (b.y < BALL.r) {
    b.y = BALL.r;
    if (b.vy < 0) b.vy = -b.vy * BALL.bounce;
    if (b.vy < 1.5) b.vy = 0;
  }
  if (b.y <= BALL.r + 0.01) {
    const roll = 1 - BALL.roll * dt;
    b.vx *= roll;
    b.vz *= roll;
  }
  if (b.y > FIELD.ceiling - BALL.r) {
    b.y = FIELD.ceiling - BALL.r;
    if (b.vy > 0) b.vy = -b.vy * BALL.wall;
  }
  const hit = collideArena(b, BALL.r, BALL.wall);
  if (hit > 6) match.events.push({ kind: "bounce", power: hit });
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  if (sp > BALL.max) {
    const k = BALL.max / sp;
    b.vx *= k;
    b.vy *= k;
    b.vz *= k;
  }
  b.spin += (Math.hypot(b.vx, b.vz) / BALL.r) * dt;
}

// ---------- cars ----------

// input: { steer: -1..1 (+ = left), throttle: -1..1, boost, jump, jumpTap }
// (jumpTap: a new press since the last step, even if it's already let go).
function tickCar(match, c, input, dt) {
  const steer = clamp(input.steer || 0, -1, 1);
  c.steer += clamp(steer - c.steer, -dt * 8, dt * 8);
  const [fx, fz] = fwd(c.heading);
  c.boosting = Boolean(input.boost && c.boost > 0);
  if (c.boosting) c.boost = Math.max(0, c.boost - BOOST.use * dt);

  // Jump, then a second tap in the air flips.
  const jumpTap = Boolean(input.jumpTap) || (input.jump && !c.jumpHeld);
  c.jumpHeld = Boolean(input.jump);
  if (jumpTap && c.onGround) {
    c.onGround = false;
    c.vy = CAR.jump;
    c.jumpT = 0;
    c.canFlip = true;
    c.vx = fx * c.speed;
    c.vz = fz * c.speed;
    match.events.push({ kind: "jump", car: c });
  } else if (jumpTap && c.canFlip && c.jumpT < 1.4) {
    c.canFlip = false;
    c.flipT = 0.65;
    // Sideways if you're steering, forward otherwise (backward on the brake).
    const side = Math.abs(steer) > 0.3 ? Math.sign(steer) : 0;
    const dir = side ? 0 : (input.throttle || 0) < -0.3 ? -1 : 1;
    c.flipDir = [dir, side];
    c.vx += (fx * dir + fz * side) * CAR.flip;
    c.vz += (fz * dir - fx * side) * CAR.flip;
    c.vy = Math.max(c.vy, 2);
    match.events.push({ kind: "flip", car: c });
  }
  c.flipT = Math.max(0, c.flipT - dt);

  if (c.onGround) {
    let v = c.speed;
    const throttle = clamp(input.throttle ?? 0, -1, 1);
    const top = c.boosting ? CAR.boostTop : CAR.top;
    if (c.boosting) v += CAR.boost * (1 - Math.max(0, v) / CAR.boostTop) * dt + CAR.accel * 0.3 * dt;
    else if (throttle > 0) v += CAR.accel * throttle * (1 - Math.max(0, v) / CAR.top) * dt * (v < 8 ? 1.5 : 1);
    else if (throttle < 0) v = v > 0.5 ? Math.max(0, v + CAR.brake * throttle * dt) : Math.max(-CAR.reverse, v + 8 * throttle * dt);
    else v -= Math.sign(v) * Math.min(Math.abs(v), 6 * dt);
    if (v > top) v -= Math.min(v - top, 6 * dt);
    const turn = Math.min(CAR.steer, CAR.grip / Math.max(Math.abs(v), 1)) * Math.min(1, Math.abs(v) / 3);
    c.heading += turn * c.steer * Math.sign(v || 1) * dt;
    const [hx, hz] = fwd(c.heading);
    c.speed = v;
    c.vx = hx * v;
    c.vz = hz * v;
    c.vy = 0;
  } else {
    // In the air: keep flying; steer turns the car slowly, boost pushes it.
    c.jumpT += dt;
    c.heading += c.steer * 2 * dt;
    if (c.boosting) {
      const [hx, hz] = fwd(c.heading);
      c.vx += hx * CAR.boost * 0.7 * dt;
      c.vz += hz * CAR.boost * 0.7 * dt;
      c.vy += 6 * dt; // a little lift
    }
    c.vy -= CAR.gravity * dt;
  }
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.z += c.vz * dt;
  if (c.y <= 0 && !c.onGround) {
    c.y = 0;
    c.vy = 0;
    c.onGround = true;
    c.canFlip = false;
    const [hx, hz] = fwd(c.heading);
    c.speed = clamp(c.vx * hx + c.vz * hz, -CAR.reverse, CAR.boostTop + 4);
  }
  // Walls: stop the push into them and scrape along.
  const probe = { x: c.x, y: Math.max(c.y, 0) + 0.5, z: c.z, vx: c.vx, vy: 0, vz: c.vz };
  const hit = collideArena(probe, CAR.wallR, 0, true);
  if (hit > 0 || probe.x !== c.x || probe.z !== c.z) {
    c.x = probe.x;
    c.z = probe.z;
    c.vx = probe.vx;
    c.vz = probe.vz;
    if (c.onGround) {
      const [hx, hz] = fwd(c.heading);
      c.speed = c.vx * hx + c.vz * hz;
    }
    if (hit > 8) match.events.push({ kind: "wall", car: c });
  }

  // Boost pads.
  if (c.onGround || c.y < 1) {
    for (const p of match.pads) {
      if (p.back > 0 || c.boost >= 100) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < (p.big ? 2.6 : 1.8)) {
        c.boost = Math.min(100, c.boost + (p.big ? BOOST.big : BOOST.small));
        p.back = p.big ? BOOST.bigBack : BOOST.smallBack;
        match.events.push({ kind: "pad", big: p.big, car: c });
      }
    }
  }
}

// The car's two hit spheres (front and back of the body).
function carSpheres(c) {
  const [fx, fz] = fwd(c.heading);
  const y = c.y + 0.75;
  return [
    [c.x + fx * 0.95, y, c.z + fz * 0.95],
    [c.x - fx * 0.95, y, c.z - fz * 0.95],
  ];
}

function hitBall(match, c) {
  const b = match.ball;
  for (const [sx, sy, sz] of carSpheres(c)) {
    const dx = b.x - sx;
    const dy = b.y - sy;
    const dz = b.z - sz;
    const d = Math.hypot(dx, dy, dz);
    const reach = CAR.hit + BALL.r;
    if (d >= reach || d === 0) continue;
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    // Out of the car.
    b.x = sx + nx * reach;
    b.y = Math.max(BALL.r, sy + ny * reach);
    b.z = sz + nz * reach;
    const into = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny + (c.vz - b.vz) * nz;
    if (into > 0) {
      // A car is heavier than the ball: most of its speed goes in, plus a
      // little extra so hits feel punchy; more on a flip.
      const power = into * (1.25 + (c.flipT > 0 ? 0.6 : 0)) + 2;
      b.vx += nx * power;
      b.vy += Math.max(ny, 0.08) * power + (c.flipT > 0 ? 2 : 0);
      b.vz += nz * power;
      if (c.onGround) c.speed *= 0.82;
      else {
        c.vx *= 0.8;
        c.vz *= 0.8;
      }
      if (match.time - c.hitT > 0.15) match.events.push({ kind: "touch", car: c, power });
      c.hitT = match.time;
      match.lastTouch = c;
    }
    return;
  }
}

function bumpCars(match) {
  const cs = match.cars;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d === 0 || d > 2.6 || Math.abs(a.y - b.y) > 1.5) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = (2.6 - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const into = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (into > 0) {
        for (const [c, s] of [
          [a, -1],
          [b, 1],
        ]) {
          if (!c.onGround) continue;
          const [hx, hz] = fwd(c.heading);
          c.speed += s * into * 0.5 * (nx * hx + nz * hz);
        }
        if (into > 6) match.events.push({ kind: "bump", a, b, power: into });
      }
    }
  }
}

// ---------- the computer ----------

// Where the ball will be in t seconds, roughly (bounces and walls aside).
function ballIn(match, t) {
  const b = match.ball;
  const x = clamp(b.x + b.vx * t, -FIELD.w + 2, FIELD.w - 2);
  const z = clamp(b.z + b.vz * t, -FIELD.l - 2, FIELD.l + 2);
  let y = b.y + b.vy * t - 0.5 * BALL.gravity * t * t;
  if (y < BALL.r) y = BALL.r;
  return { x, y, z };
}

function aiInput(match, c, dt) {
  const lv = match.level;
  const ai = c.ai;
  const b = match.ball;
  const attack = c.team === 0 ? -1 : 1; // which way along z this team scores
  const ownZ = -attack * FIELD.l;
  ai.next -= dt;
  if (ai.next <= 0 || !ai.target) {
    ai.next = lv.think;
    const dist = Math.hypot(b.x - c.x, b.z - c.z);
    const p = ballIn(match, clamp(dist / Math.max(Math.abs(c.speed), 14), 0, 1.4));
    // Who goes for the ball: the teammate nearest to it.
    const mates = match.cars.filter((o) => o.team === c.team);
    const chaser = mates.reduce((best, o) => (Math.hypot(b.x - o.x, b.z - o.z) < Math.hypot(b.x - best.x, b.z - best.z) ? o : best), mates[0]);
    const danger = (b.z - ownZ) * -attack < 30 && (b.vz * -attack < 0 || Math.abs(b.z - ownZ) < 20); // ball near our goal
    if (chaser !== c && !danger) {
      // Support: hang back between the ball and our goal.
      ai.target = { x: p.x * 0.5, z: clamp(p.z - attack * 24, -FIELD.l + 6, FIELD.l - 6), mode: "back" };
    } else {
      // Line up behind the ball, facing their goal, then drive through it.
      const gx = 0 - p.x;
      const gz = attack * FIELD.l - p.z;
      const g = Math.hypot(gx, gz) || 1;
      const ux = (gx / g) * lv.aim + (1 - lv.aim) * 0;
      const uz = (gz / g) * lv.aim + (1 - lv.aim) * attack;
      const goalSide = (c.z - p.z) * attack > 1.5; // we're past the ball
      if (goalSide) {
        // Go round it, back toward our own end.
        ai.target = { x: p.x + (c.x > p.x ? 7 : -7), z: p.z - attack * 9, mode: "round" };
      } else {
        const bx = p.x - ux * 3.2;
        const bz = p.z - uz * 3.2;
        const lined = Math.hypot(bx - c.x, bz - c.z) < 5;
        ai.target = lined || dist < 7 ? { x: p.x, z: p.z, mode: "hit" } : { x: bx, z: bz, mode: "line" };
      }
      if (danger && chaser !== c) ai.target = { x: b.x * 0.35, z: ownZ + attack * 6, mode: "goal" };
    }
  }
  const t = ai.target;
  const dx = t.x - c.x;
  const dz = t.z - c.z;
  const dist = Math.hypot(dx, dz);
  const err = angleDiff(headingTo(dx, dz), c.heading);
  const input = { steer: clamp(err * 2.2, -1, 1), throttle: lv.throttle, boost: false, jump: false };

  // Stuck (against a wall, nose in)? Back out for a moment.
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    return { steer: -input.steer, throttle: -1, boost: false, jump: false };
  }
  ai.stuck = c.onGround && Math.abs(c.speed) < 2 && match.state === "play" ? ai.stuck + dt : 0;
  if (ai.stuck > 1.2) {
    ai.stuck = 0;
    ai.reverseT = 0.8;
  }

  // Slow down for a target inside the circle the car can turn at this speed;
  // flat out, it would just circle round it.
  const turnCircle = (c.speed * c.speed) / CAR.grip;
  if (Math.abs(err) > 0.35 && dist < turnCircle * 2.2 && c.speed > 6) input.throttle = Math.abs(err) > 1.2 ? -0.5 : 0.1;
  if (t.mode === "back" && dist < 4) input.throttle = 0.15;
  if (Math.abs(err) < 0.25 && dist > 10 && c.boost > 8 && (match.seed + Math.floor(match.time * 2)) % 10 < lv.boost * 10) input.boost = true;
  if (t.mode === "hit") {
    const bd = Math.hypot(b.x - c.x, b.z - c.z);
    // Jump for a ball in the air just ahead; flip into a ball on the ground.
    if (b.y > 2.8 && b.y < 7 && bd < 5 && Math.abs(err) < 0.6 && c.onGround && Math.random() < lv.jump) input.jump = true;
    if (c.onGround && b.y < 2.6 && bd < 5.5 && bd > 3 && Math.abs(err) < 0.2 && c.speed > 12 && Math.random() < lv.flip * dt * 8) input.jump = true;
    if (!c.onGround && c.canFlip && c.jumpT > 0.12 && bd < 4.5 && b.y < 3) input.jump = !c.jumpHeld;
  }
  return input;
}

// ---------- the match ----------

// One step. input: your controls { steer, throttle, boost, jump }.
export function tickMatch(match, input, dt = STEP) {
  match.time += dt;
  for (const p of match.pads) p.back = Math.max(0, p.back - dt);

  if (match.state === "kickoff") {
    // The guest waits for the host's go.
    if (match.online === "guest") return match;
    match.stateT -= dt;
    if (match.stateT > 0) return match;
    match.state = "play";
    match.events.push({ kind: "go" });
  }
  if (match.state === "over") return match;

  for (const c of match.cars) {
    const ctl = c.ai ? aiInput(match, c, dt) : match.state === "goal" ? {} : c.remote ? c.input || {} : input;
    if (c.me && match.online) c.lastInput = { steer: ctl.steer, throttle: ctl.throttle, boost: ctl.boost, jump: ctl.jump };
    tickCar(match, c, ctl, dt);
  }
  // A friend's jump tap counts once.
  for (const c of match.cars) if (c.remote && c.input) c.input.jumpTap = false;
  bumpCars(match);
  for (const c of match.cars) hitBall(match, c);
  tickBall(match, dt);
  // The guest only predicts movement; goals, the clock and the end are the
  // host's to call, and come in its snapshots.
  if (match.online === "guest") return match;

  if (match.state === "goal") {
    match.stateT -= dt;
    if (match.stateT <= 0) {
      if (match.overtime || (match.clock <= 0 && match.score[0] !== match.score[1])) {
        match.state = "over";
        match.events.push({ kind: "over" });
      } else kickoff(match);
    }
    return match;
  }

  // A goal: the whole ball over the line.
  const b = match.ball;
  if (Math.abs(b.z) > FIELD.l + BALL.r && Math.abs(b.x) < GOAL.w) {
    const team = b.z < 0 ? 0 : 1;
    match.score[team] += 1;
    match.scorer = match.lastTouch && match.lastTouch.team === team ? match.lastTouch : null;
    match.state = "goal";
    match.stateT = 2.8;
    match.events.push({ kind: "goal", team, by: match.scorer });
    return match;
  }

  // The clock (counting up in overtime).
  if (match.overtime) match.clock += dt;
  else {
    match.clock -= dt;
    if (match.clock <= 0) {
      match.clock = 0;
      if (match.score[0] !== match.score[1]) {
        match.state = "over";
        match.events.push({ kind: "over" });
      } else {
        match.overtime = true;
        match.events.push({ kind: "overtime" });
        kickoff(match);
      }
    }
  }
  return match;
}

// ---------- playing a friend ----------

const CAR_FIELDS = ["x", "y", "z", "vx", "vy", "vz", "heading", "speed", "steer", "boost", "jumpT", "flipT", "hitT"];
const CAR_FLAGS = ["onGround", "boosting", "canFlip", "jumpHeld"];

// The host's match, a few times a second: everything the guest needs.
export function snapshot(match) {
  const r2 = (v) => Math.round(v * 1000) / 1000;
  return {
    t: r2(match.time),
    cars: match.cars.map((c) => {
      const o = {};
      for (const k of CAR_FIELDS) o[k] = r2(c[k]);
      for (const k of CAR_FLAGS) o[k] = c[k] ? 1 : 0;
      o.flipDir = c.flipDir;
      o.input = c.remote ? c.input : c.lastInput || null;
      return o;
    }),
    ball: Object.fromEntries(["x", "y", "z", "vx", "vy", "vz", "spin"].map((k) => [k, r2(match.ball[k])])),
    score: match.score,
    clock: r2(match.clock),
    overtime: match.overtime,
    state: match.state,
    stateT: r2(match.stateT),
    pads: match.pads.map((p) => r2(p.back)),
  };
}

// The guest takes the host's snapshot. Your own car is eased toward it
// (snapping it would make it jerk back by the lag every time) unless it's
// far off; everything else is replaced. Returns events for the screen
// (goal, go, overtime, over) worked out from what changed.
export function applySnapshot(match, snap) {
  const events = [];
  const seen = (match.seen ||= { score: [0, 0], state: "kickoff", overtime: false });
  if (snap.score[0] !== seen.score[0] || snap.score[1] !== seen.score[1]) {
    const team = snap.score[0] > seen.score[0] ? 0 : 1;
    events.push({ kind: "goal", team, by: null });
  }
  if (seen.state === "kickoff" && snap.state === "play") events.push({ kind: "go" });
  if (!seen.overtime && snap.overtime) events.push({ kind: "overtime" });
  if (snap.state === "over" && seen.state !== "over") events.push({ kind: "over" });
  match.seen = { score: [...snap.score], state: snap.state, overtime: snap.overtime };
  snap.cars.forEach((s, k) => {
    const c = match.cars[k];
    if (!c) return;
    const mine = c === match.player;
    const off = Math.hypot(c.x - s.x, c.z - s.z);
    const k2 = mine && off < 8 && snap.state === "play" ? 0.35 : 1;
    for (const f of CAR_FIELDS) c[f] = c[f] + (s[f] - c[f]) * (f === "heading" ? 1 : k2);
    if (mine && k2 < 1) c.heading = s.heading + Math.atan2(Math.sin(c.heading - s.heading), Math.cos(c.heading - s.heading)) * 0.65;
    for (const f of CAR_FLAGS) c[f] = Boolean(s[f]);
    c.flipDir = s.flipDir || c.flipDir;
    if (c.remote) c.input = s.input || {};
  });
  Object.assign(match.ball, snap.ball);
  match.score = [...snap.score];
  match.clock = snap.clock;
  match.overtime = snap.overtime;
  match.state = snap.state;
  match.stateT = snap.stateT;
  snap.pads.forEach((b, k) => match.pads[k] && (match.pads[k].back = b));
  return events;
}

export const clockText = (s) => {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Your record on this phone: wins, losses, goals.
const RECORD_KEY = "tunr.ball.record";

export function loadRecord() {
  try {
    const r = JSON.parse(localStorage.getItem(RECORD_KEY) || "{}");
    return { wins: r.wins || 0, losses: r.losses || 0, goals: r.goals || 0 };
  } catch (e) {
    console.warn("Couldn't read your Turbo Ball record:", e.message);
    return { wins: 0, losses: 0, goals: 0 };
  }
}

export function saveRecord(rec, { won, goals }) {
  const next = { wins: rec.wins + (won ? 1 : 0), losses: rec.losses + (won ? 0 : 1), goals: rec.goals + goals };
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't save your Turbo Ball record:", e.message);
  }
  return next;
}
