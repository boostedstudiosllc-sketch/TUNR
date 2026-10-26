// Drift King: an endless zig-zag road floating over the city. The car never
// stops; hold to swing up-right, let go to swing up-left. The tail slides
// out through every corner. Run off the edge and you fall. The further you
// get, the faster it goes. Pure logic, no imports, so the game and the tests
// share it.
//
// Screen-space units (the view is 360 wide). Headings: 0 = up, clockwise.
// The road only runs two ways: up-right (π/4) and up-left (-π/4).

export const STEP = 1 / 120;
export const ROAD_W = 70;
export const CAR = { w: 24, h: 50 };
export const RIGHT = Math.PI / 4; // holding
export const LEFT = -Math.PI / 4; // let go
const TURN_RATE = 5.2; // how fast the nose swings (rad/s)
const GRIP = 4.2; // how fast the slide catches up with the nose (rad/s)
const START_SPEED = 210;
const TOP_SPEED = 330;
const SPEED_UP = 2.2; // units/s gained each second
const FALL_TIME = 0.9; // seconds of falling before it's over
export const UNITS_PER_METER = 12;

// A steady random sequence (same seed, same road).
export function seededRand(seed) {
  let s = Math.floor(seed) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const dirOf = (heading) => [Math.sin(heading), -Math.cos(heading)];

// Add road pieces until the road reaches past `y` (further up = smaller y).
// Each piece turns the other way from the one before; lengths get shorter
// (corners come quicker) as the run goes on.
function extend(g, y) {
  while (g.road[g.road.length - 1].y2 > y) {
    const last = g.road[g.road.length - 1];
    const heading = last.heading === RIGHT ? LEFT : RIGHT;
    const n = (g.made += 1);
    const shortest = Math.max(70, 150 - n * 1.2);
    const longest = Math.max(shortest + 60, 380 - n * 2);
    let len = shortest + g.rand() * (longest - shortest);
    // Keep the road on screen: pull back toward the middle.
    const [dx] = dirOf(heading);
    const endX = last.x2 + dx * len;
    if (Math.abs(endX) > 100) len = Math.max(shortest, (100 - Math.sign(dx) * last.x2) / Math.abs(dx));
    const [ux, uy] = dirOf(heading);
    g.road.push({ i: n, heading, x1: last.x2, y1: last.y2, x2: last.x2 + ux * len, y2: last.y2 + uy * len, len });
  }
  // Forget pieces long behind the car.
  while (g.road.length > 3 && g.road[1].y1 > g.y + 900) g.road.shift();
}

export function newDrift(seed = Date.now()) {
  const g = {
    rand: seededRand(seed),
    road: [],
    made: 0, // pieces of road laid so far
    x: 0,
    y: 0,
    heading: LEFT, // where the nose points
    slide: LEFT, // where the car is actually going
    speed: START_SPEED,
    distance: 0, // along the road, in units
    time: 0,
    state: "ready", // ready | driving | falling | over
    fall: 0,
    skids: [], // recent tyre marks [{ x, y, a }]
    corners: 0, // corners taken
  };
  // A long straight to start on, heading up-left.
  const [ux, uy] = dirOf(LEFT);
  g.road.push({ i: 0, heading: LEFT, x1: -ux * 80, y1: -uy * 80, x2: ux * 150, y2: uy * 150, len: 230 });
  extend(g, -1600);
  return g;
}

// Is the point on the road? Each piece is a strip ROAD_W wide, stretched
// half a width past both ends so the corners are filled in.
export function onRoad(g, x, y) {
  for (const s of g.road) {
    const [ux, uy] = dirOf(s.heading);
    const dx = x - s.x1;
    const dy = y - s.y1;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (along >= -ROAD_W / 2 && along <= s.len + ROAD_W / 2 && Math.abs(across) <= ROAD_W / 2) return true;
  }
  return false;
}

const turnToward = (a, target, max) => {
  const d = Math.atan2(Math.sin(target - a), Math.cos(target - a));
  return Math.abs(d) <= max ? target : a + Math.sign(d) * max;
};

// The slide: how far the tail is out (radians), for smoke and tyre squeal.
export const slipOf = (g) => Math.abs(Math.atan2(Math.sin(g.heading - g.slide), Math.cos(g.heading - g.slide)));

// Which piece of road the car is on (the furthest one it's inside).
function pieceAt(g) {
  let found = null;
  for (const s of g.road) {
    const [ux, uy] = dirOf(s.heading);
    const along = (g.x - s.x1) * ux + (g.y - s.y1) * uy;
    const across = -(g.x - s.x1) * uy + (g.y - s.y1) * ux;
    if (along >= -ROAD_W / 2 && along <= s.len + ROAD_W / 2 && Math.abs(across) <= ROAD_W / 2) found = s;
  }
  return found;
}

// One step. holding: the screen (or a key) is held down.
export function tick(g, holding, dt = STEP) {
  if (g.state === "over") return g;
  if (g.state === "ready") {
    if (!holding) return g;
    g.state = "driving";
  }
  g.time += dt;
  if (g.state === "falling") {
    g.fall += dt;
    const [vx, vy] = dirOf(g.slide);
    g.x += vx * g.speed * 0.6 * dt;
    g.y += vy * g.speed * 0.6 * dt;
    if (g.fall >= FALL_TIME) g.state = "over";
    return g;
  }

  g.heading = turnToward(g.heading, holding ? RIGHT : LEFT, TURN_RATE * dt);
  g.slide = turnToward(g.slide, g.heading, GRIP * dt);
  g.speed = Math.min(TOP_SPEED, g.speed + SPEED_UP * dt);
  const [vx, vy] = dirOf(g.slide);
  g.x += vx * g.speed * dt;
  g.y += vy * g.speed * dt;
  g.distance += g.speed * dt;

  if (slipOf(g) > 0.18) {
    g.skids.push({ x: g.x, y: g.y, a: g.heading });
    if (g.skids.length > 600) g.skids.shift();
  }
  const piece = pieceAt(g);
  if (!piece) {
    g.state = "falling";
    return g;
  }
  g.corners = Math.max(g.corners, piece.i);
  extend(g, g.y - 1600);
  return g;
}

export const meters = (g) => Math.floor(g.distance / UNITS_PER_METER);

// ---------- best score (this phone only) ----------

const BEST_KEY = "tunr.drift.best";

export function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch (e) {
    console.warn("Couldn't read the Drift King best:", e.message);
    return 0;
  }
}

export function saveBest(score) {
  const best = Math.max(score, loadBest());
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch (e) {
    console.warn("Couldn't save the Drift King best:", e.message);
  }
  return best;
}
