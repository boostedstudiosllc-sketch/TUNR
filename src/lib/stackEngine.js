// Car Stack: a crane swings a car over the tower; tap to drop it. Land it
// on the car below and the tower grows; land it dead centre ("perfect")
// and it snaps straight, and perfects in a row pay a bonus. Off-centre
// drops make the tower lean, and a leaning tower sways. Miss the tower
// and you lose a car (three and you're out); lean too far and it all comes
// down. The swing speeds up as you climb. Pure logic, no drawing.

export const STEP = 1 / 120;
export const CAR_L = 4.3; // a car's length, side to side as it hangs (m)
export const CAR_H = 1.35; // each floor's height (m)
export const LIVES = 3;
export const PERFECT = 0.22; // within this of centre (m): perfect
export const DROP_H = 7; // the hook's height above the top of the tower (m)
const G = 30; // gravity, a little strong, so drops feel snappy (m/s²)
const TOPPLE = CAR_L * 0.62; // how far the tower's weight can lean before it goes

export function seeded(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const PAINT = ["#DC2626", "#1D4ED8", "#F5F5F5", "#111827", "#EAB308", "#10B981", "#7C3AED", "#F97316", "#0EA5E9", "#9CA3AF", "#DB2777"];
const BODIES = ["coupe", "sedan", "hatch", "coupe", "sedan", "suv"];

// The car for floor n: a random paint and body, except every tenth floor,
// which is yours (`mine` is set and the screen draws your garage car).
function carFor(rand, n) {
  if (n > 0 && n % 10 === 0) return { mine: true };
  return { color: PAINT[Math.floor(rand() * PAINT.length)], body: BODIES[Math.floor(rand() * BODIES.length)] };
}

export function newStack(seed = 1) {
  const rand = seeded(seed);
  const g = {
    rand,
    t: 0,
    // The base: a flatbed, dead centre.
    tower: [{ x: 0, ...carFor(rand, 0), base: true }],
    hanging: carFor(rand, 1),
    swingT: 0,
    falling: null, // { x, y, vy, car }
    dropping: [], // cars knocked off, tumbling away: { x, y, vy, vx, spin, car }
    lives: LIVES,
    perfects: 0, // in a row
    bestRun: 0,
    score: 0,
    state: "play", // play | over
    why: null,
    events: [],
  };
  return g;
}

export const floors = (g) => g.tower.length - 1;
const top = (g) => g.tower[g.tower.length - 1];
export const topY = (g) => (g.tower.length - 1) * CAR_H;

// How the crane swings at this height: wider and quicker as you climb.
export function swingOf(g) {
  const n = floors(g);
  return { amp: Math.min(5.2, 2.6 + n * 0.08), speed: Math.min(3.4, 1.35 + n * 0.045) };
}

// Where the hanging car is (side to side, relative to the tower's centre).
export const hookX = (g) => {
  const s = swingOf(g);
  return Math.sin(g.swingT * s.speed) * s.amp;
};

// The tower's lean: the average of every car's offset from the base, the
// higher ones counting more.
export function lean(g) {
  let w = 0;
  let sum = 0;
  g.tower.forEach((c, i) => {
    if (i === 0) return;
    sum += c.x * (1 + i * 0.05);
    w += 1 + i * 0.05;
  });
  return w ? sum / w : 0;
}

// The tower's sway right now (radians), for the screen: more lean, taller
// tower, more sway.
export const swayOf = (g) => {
  const l = lean(g);
  const amp = Math.min(0.09, (Math.abs(l) / TOPPLE) * 0.06 + floors(g) * 0.0006);
  return Math.sign(l || 1) * amp * (0.6 + 0.4 * Math.sin(g.t * 1.6));
};

// Tap: let go of the hanging car.
export function drop(g) {
  if (g.state !== "play" || g.falling) return false;
  g.falling = { x: hookX(g), y: topY(g) + DROP_H, vy: 0, car: g.hanging };
  g.events.push({ kind: "drop" });
  return true;
}

function land(g) {
  const f = g.falling;
  g.falling = null;
  const below = top(g);
  const off = f.x - below.x;
  if (Math.abs(off) > CAR_L * 0.55) {
    // Missed: it tumbles off.
    g.lives -= 1;
    g.perfects = 0;
    g.dropping.push({ x: f.x, y: topY(g) + CAR_H * 0.3, vy: -2, vx: Math.sign(off || 1) * 4, spin: 0, spinV: Math.sign(off || 1) * 3, car: f.car });
    g.events.push({ kind: "miss", lives: g.lives });
    if (g.lives <= 0) return over(g, "missed");
  } else {
    const perfect = Math.abs(off) <= PERFECT;
    const x = perfect ? below.x : f.x;
    g.tower.push({ x, ...f.car });
    g.perfects = perfect ? g.perfects + 1 : 0;
    g.bestRun = Math.max(g.bestRun, g.perfects);
    // A floor is 10; a perfect pays 5 more for each in a row (up to 25).
    const bonus = perfect ? Math.min(25, 5 * g.perfects) : 0;
    g.score += 10 + bonus;
    g.events.push({ kind: perfect ? "perfect" : "land", off, run: g.perfects, bonus, floors: floors(g) });
    if (Math.abs(lean(g)) > TOPPLE) return over(g, "toppled");
  }
  g.hanging = carFor(g.rand, g.tower.length);
  // Start the next swing from one side, at the top of its arc.
  g.swingT = (Math.PI / 2 / swingOf(g).speed) * (g.rand() < 0.5 ? 1 : -1);
}

function over(g, why) {
  g.state = "over";
  g.why = why;
  g.events.push({ kind: "over", why });
}

export function step(g, dt = STEP) {
  g.t += dt;
  if (g.state === "play" && !g.falling) g.swingT += dt;
  if (g.falling) {
    const f = g.falling;
    f.vy -= G * dt;
    f.y += f.vy * dt;
    if (f.y <= topY(g) + CAR_H * 0.5) land(g);
  }
  for (const d of g.dropping) {
    d.vy -= G * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.spin += d.spinV * dt;
  }
  g.dropping = g.dropping.filter((d) => d.y > topY(g) - 40);
}

// Runs the clock forward in fixed steps (frame-rate independent).
export function tick(g, dt) {
  g.acc = (g.acc || 0) + Math.min(dt, 0.1);
  while (g.acc >= STEP) {
    step(g);
    g.acc -= STEP;
  }
}

export const WHY = { missed: "Out of cars: three missed the tower.", toppled: "The tower leaned too far and came down." };

// Best on this phone.
const KEY = "tunr.stack.best";
export function loadStackBest() {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { floors: Number(b.floors) || 0, score: Number(b.score) || 0 };
  } catch (e) {
    console.warn("Couldn't read your Car Stack best:", e.message);
    return { floors: 0, score: 0 };
  }
}

export function saveStackBest(g) {
  const b = loadStackBest();
  const next = { floors: Math.max(b.floors, floors(g)), score: Math.max(b.score, g.score) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("Couldn't save your Car Stack best:", e.message);
  }
  return next;
}
