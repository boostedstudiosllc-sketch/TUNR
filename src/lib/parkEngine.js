// Park Up: a top-down parking game. Steer with a wheel, gas and brake (the
// brake reverses once you've stopped), and stop inside the yellow spot
// without touching anything. Pure logic and level data, no imports, so the
// game, the tests and the level checker (scripts/park-solve.mjs) share it.
//
// The lot is 360 × 640 units, about 16 units to a meter: a car is 30 × 70
// (1.9 m × 4.4 m), a stall 46 × 90. Headings are radians, 0 = facing up
// (toward y = 0), turning clockwise.

export const WORLD = { w: 360, h: 640 };
export const STEP = 1 / 120;
export const CAR = { w: 30, h: 70, wheelbase: 44 };
export const MAX_STEER = (33 * Math.PI) / 180; // front wheels, full lock
export const WHEEL_TURNS = 450; // degrees of steering wheel to full lock
const ACCEL = 95; // units/s²
const REVERSE_ACCEL = 75;
const BRAKE = 260;
const COAST = 45;
const MAX_FORWARD = 115; // ~26 km/h: a parking lot
const MAX_REVERSE = 60;
const PARK_SPEED = 4; // "stopped" is below this
const PARK_HOLD = 0.5; // seconds stopped in the spot to finish

const UP = 0;
const DOWN = Math.PI;
const RIGHT = Math.PI / 2;
const LEFT = -Math.PI / 2;

// Parked cars: a few kinds and colors, sized like the real thing.
export const KINDS = {
  sedan: { w: 30, h: 70 },
  coupe: { w: 30, h: 66 },
  suv: { w: 32, h: 76 },
  truck: { w: 33, h: 86 },
};
const car = (x, y, heading, color, kind = "sedan") => ({ x, y, heading, color, kind, ...KINDS[kind] });

// A stall's middle, size and the way a car faces when parked nose-in.
const stall = (x, y, heading = UP, w = 46, h = 90) => ({ x, y, heading, w, h });

// Lines between stalls in a row (drawn), from the stalls themselves.
function rowLines(stalls) {
  return stalls.map((s) => ({ ...s }));
}

const PAINT = ["#C8102E", "#F2F2F2", "#1F2937", "#9CA3AF", "#475569", "#B91C1C", "#E5E7EB", "#065F46", "#7C2D12", "#F59E0B", "#DB2777"];
const paint = (i) => PAINT[i % PAINT.length];

// The levels, easy to hard. Each: where you start, the spot, the parked
// cars, grass islands (with bushes), the stall lines to paint, and the
// time for three stars.
export const LEVELS = [
  (() => {
    const top = [88, 134, 180, 226, 272].map((x) => stall(x, 80));
    return {
      id: "first-spot",
      name: "First Spot",
      tip: "Drive straight up into the yellow spot and stop.",
      start: { x: 180, y: 540, heading: UP },
      spot: top[2],
      cars: [car(88, 80, UP, paint(0)), car(134, 80, UP, paint(1), "suv"), car(226, 80, UP, paint(2)), car(272, 80, DOWN, paint(3), "coupe")],
      islands: [],
      stalls: rowLines(top),
      par: 9,
    };
  })(),
  (() => {
    const top = [88, 134, 180, 226, 272, 318].map((x) => stall(x, 80));
    return {
      id: "turn-in",
      name: "Turn In",
      tip: "Swing wide, then turn into the spot.",
      start: { x: 60, y: 560, heading: UP },
      spot: top[4],
      cars: [car(88, 80, UP, paint(4)), car(180, 80, DOWN, paint(5), "suv"), car(226, 80, UP, paint(6)), car(318, 80, UP, paint(7), "truck")],
      islands: [],
      stalls: rowLines(top),
      par: 11,
    };
  })(),
  (() => {
    const top = [88, 134, 180, 226, 272].map((x) => stall(x, 80));
    return {
      id: "island",
      name: "Around the Island",
      tip: "Go around the grass. Bushes count as a hit.",
      start: { x: 180, y: 570, heading: UP },
      spot: top[2],
      cars: [car(88, 80, UP, paint(8), "suv"), car(134, 80, UP, paint(9)), car(226, 80, DOWN, paint(10)), car(272, 80, UP, paint(1), "coupe")],
      islands: [{ x: 95, y: 260, w: 170, h: 90 }],
      stalls: rowLines(top),
      par: 13,
    };
  })(),
  (() => {
    const bottom = [88, 134, 180, 226, 272].map((x) => stall(x, 560, DOWN));
    return {
      id: "back-in",
      name: "Back It In",
      tip: "Back in, nose out. Pull past the spot, then hold the brake to stop and reverse in.",
      start: { x: 50, y: 400, heading: RIGHT },
      spot: bottom[3],
      mustFace: UP,
      cars: [car(88, 560, DOWN, paint(2)), car(134, 560, UP, paint(3), "suv"), car(180, 560, DOWN, paint(4)), car(272, 560, DOWN, paint(5), "truck")],
      islands: [],
      stalls: rowLines(bottom),
      par: 16,
    };
  })(),
  (() => {
    const xs = [60, 100, 140, 180, 220, 260, 300];
    const top = xs.map((x) => stall(x, 200, UP, 40, 90));
    const bottom = xs.map((x) => stall(x, 430, DOWN, 40, 90));
    return {
      id: "tight-row",
      name: "Tight Row",
      tip: "Narrow stalls. Use the whole aisle to line up.",
      start: { x: 312, y: 315, heading: LEFT },
      spot: top[5],
      cars: [
        ...[0, 1, 2, 3, 4, 6].map((i, n) => car(xs[i], 200, n % 3 === 1 ? DOWN : UP, paint(n + 3), n === 2 ? "suv" : "sedan")),
        ...[0, 1, 2, 3, 4, 5, 6].map((i, n) => car(xs[i], 430, n % 2 ? UP : DOWN, paint(n + 6), n === 1 ? "truck" : n === 4 ? "suv" : "sedan")),
      ],
      islands: [{ x: 0, y: 0, w: 360, h: 140, hedge: true }, { x: 0, y: 490, w: 360, h: 150, hedge: true }, { x: 0, y: 140, w: 34, h: 350, hedge: true }],
      stalls: [...rowLines(top), ...rowLines(bottom)],
      par: 17,
    };
  })(),
  {
    id: "parallel",
    name: "Parallel",
    tip: "Pull up beside the front car, then reverse in on full lock.",
    start: { x: 262, y: 590, heading: UP },
    spot: { x: 327, y: 250, heading: UP, w: 40, h: 104 },
    mustFace: UP,
    cars: [car(327, 158, UP, paint(0), "suv"), car(327, 338, UP, paint(7)), car(327, 470, UP, paint(3), "coupe"), car(327, 40, UP, paint(5))],
    islands: [{ x: 0, y: 0, w: 200, h: 640, hedge: true }],
    stalls: [],
    curb: { x: 352 },
    par: 18,
  },
  (() => {
    const bottom = [88, 134, 180, 226, 272].map((x) => stall(x, 560, DOWN));
    return {
      id: "turn-around",
      name: "Turn Around",
      tip: "You're facing the wrong way. Back out, then find the spot.",
      start: { x: 300, y: 110, heading: UP },
      spot: bottom[0],
      cars: [car(134, 560, DOWN, paint(1)), car(180, 560, UP, paint(9), "suv"), car(226, 560, DOWN, paint(5)), car(272, 560, DOWN, paint(2), "truck")],
      islands: [{ x: 110, y: 250, w: 140, h: 110 }],
      stalls: rowLines(bottom),
      par: 22,
    };
  })(),
  (() => {
    const xs = [88, 134, 180, 226, 272];
    const top = xs.map((x) => stall(x, 75));
    const midUp = xs.map((x) => stall(x, 285, UP));
    const midDown = xs.map((x) => stall(x, 375, DOWN));
    return {
      id: "full-lot",
      name: "Full Lot",
      tip: "One spot left in the middle rows. Take it slow.",
      start: { x: 330, y: 590, heading: UP },
      spot: midUp[1],
      cars: [
        ...[0, 1, 2, 3, 4].map((i) => car(xs[i], 75, i % 2 ? DOWN : UP, paint(i + 2), i === 3 ? "suv" : "sedan")),
        ...[0, 2, 3, 4].map((i, n) => car(xs[i], 285, UP, paint(n + 7), n === 1 ? "truck" : "sedan")),
        ...[0, 1, 2, 3, 4].map((i) => car(xs[i], 375, i % 2 ? UP : DOWN, paint(i + 4), i === 2 ? "suv" : "coupe")),
      ],
      islands: [
        { x: 20, y: 515, w: 250, h: 70 },
      ],
      stalls: [...rowLines(top), ...rowLines(midUp), ...rowLines(midDown)],
      par: 26,
    };
  })(),
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];

// ---------- geometry ----------

// Corners of a box (x, y middle; w across, h long) turned by heading.
export function corners(b) {
  const c = Math.cos(b.heading);
  const s = Math.sin(b.heading);
  const hw = b.w / 2;
  const hh = b.h / 2;
  // Local (dx across, dy along, -dy = front) → world.
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([dx, dy]) => [b.x + dx * c - dy * s, b.y + dx * s + dy * c]);
}

function axesOf(pts) {
  return [0, 1].map((i) => {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    return [(y1 - y2) / len, (x2 - x1) / len];
  });
}

// Do two turned boxes overlap? (Separating axis test.)
export function overlaps(a, b) {
  // Quick reject: too far apart to touch.
  const reach = (Math.hypot(a.w, a.h) + Math.hypot(b.w, b.h)) / 2;
  if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) return false;
  const pa = corners(a);
  const pb = corners(b);
  for (const [ax, ay] of [...axesOf(pa), ...axesOf(pb)]) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, y] of pa) {
      const p = x * ax + y * ay;
      minA = Math.min(minA, p);
      maxA = Math.max(maxA, p);
    }
    for (const [x, y] of pb) {
      const p = x * ax + y * ay;
      minB = Math.min(minB, p);
      maxB = Math.max(maxB, p);
    }
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

// Is a point inside a turned box?
function inside(b, [px, py], margin = 0) {
  const c = Math.cos(-b.heading);
  const s = Math.sin(-b.heading);
  const dx = px - b.x;
  const dy = py - b.y;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= b.w / 2 + margin && Math.abs(ly) <= b.h / 2 + margin;
}

export const islandBox = (i) => ({ x: i.x + i.w / 2, y: i.y + i.h / 2, w: i.w, h: i.h, heading: 0 });

// What the car hit, or null: "car", "grass", "curb" (the lot's edge).
export function hitWhat(level, body) {
  for (const [x, y] of corners(body)) {
    if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return "curb";
    if (level.curb && x > level.curb.x) return "curb";
  }
  for (const c of level.cars) if (overlaps(body, c)) return "car";
  for (const i of level.islands) if (overlaps(body, islandBox(i))) return "grass";
  return null;
}

// Heading difference, -π…π.
const turnBetween = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// All four corners in the spot (and facing the right way, on levels that
// say which: a back-in spot wants the car's nose out).
export function inSpot(level, body) {
  if (level.mustFace !== undefined && Math.abs(turnBetween(body.heading, level.mustFace)) > (25 * Math.PI) / 180) return false;
  return corners(body).every((p) => inside(level.spot, p));
}

// ---------- the game ----------

export function newPark(level) {
  return {
    level,
    x: level.start.x,
    y: level.start.y,
    heading: level.start.heading,
    speed: 0, // units/s, negative = reversing
    steer: 0, // -1 (full left) … 1 (full right)
    time: 0,
    still: 0, // seconds stopped inside the spot
    state: "driving", // driving | parked | crashed
    hit: null,
    gear: "D", // D or R, for the reverse beep and lights
  };
}

export const bodyOf = (g) => ({ x: g.x, y: g.y, heading: g.heading, w: CAR.w, h: CAR.h });

// One step. input: { gas, brake, steer (-1…1) }.
export function tick(g, input, dt = STEP) {
  if (g.state !== "driving") return g;
  g.time += dt;
  g.steer = Math.max(-1, Math.min(1, input.steer || 0));

  let v = g.speed;
  if (input.gas) {
    v = v < -PARK_SPEED / 2 ? Math.min(0, v + BRAKE * dt) : Math.min(MAX_FORWARD, v + ACCEL * dt);
  } else if (input.brake) {
    v = v > PARK_SPEED / 2 ? Math.max(0, v - BRAKE * dt) : Math.max(-MAX_REVERSE, v - REVERSE_ACCEL * dt);
  } else {
    v = v > 0 ? Math.max(0, v - COAST * dt) : Math.min(0, v + COAST * dt);
  }
  g.speed = v;
  if (v < -1) g.gear = "R";
  else if (v > 1) g.gear = "D";

  const turn = (v * Math.tan(g.steer * MAX_STEER)) / CAR.wheelbase;
  const heading = g.heading + turn * dt;
  const x = g.x + v * Math.sin(heading) * dt;
  const y = g.y - v * Math.cos(heading) * dt;
  const hit = hitWhat(g.level, { x, y, heading, w: CAR.w, h: CAR.h });
  if (hit) {
    g.state = "crashed";
    g.hit = hit;
    g.speed = 0;
    return g;
  }
  g.x = x;
  g.y = y;
  g.heading = heading;

  if (Math.abs(v) < PARK_SPEED && inSpot(g.level, bodyOf(g))) {
    g.still += dt;
    if (g.still >= PARK_HOLD) g.state = "parked";
  } else {
    g.still = 0;
  }
  return g;
}

// Stars for a finished park: 3 within par, 2 within 1.6 × par, else 1.
export function starsFor(level, seconds) {
  if (seconds <= level.par) return 3;
  if (seconds <= level.par * 1.6) return 2;
  return 1;
}

export const HIT_COPY = {
  car: "You touched another car.",
  grass: "You ran into the grass.",
  curb: "You hit the curb.",
};

// The steering wheel's turn (degrees) → steer (-1…1).
export const steerFromWheel = (deg) => Math.max(-1, Math.min(1, deg / WHEEL_TURNS));

// ---------- saved progress (this phone only) ----------

const PROGRESS_KEY = "tunr.park.progress";

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch (e) {
    console.warn("Couldn't read Park Up progress:", e.message);
    return {};
  }
}

export function saveStars(progress, levelId, stars) {
  const next = { ...progress, [levelId]: Math.max(stars, progress[levelId] || 0) };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't save Park Up progress:", e.message);
  }
  return next;
}

// A level opens once the one before it is parked.
export const unlocked = (progress, index) => index === 0 || (progress[LEVELS[index - 1].id] || 0) > 0;
