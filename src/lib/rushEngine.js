// TUNR Rush: the game engine and drawing, kept apart from React so it can be
// tested in plain Node. A 3-lane desert highway in pseudo-3D (like the old
// flash taxi games): dodge traffic, cones and barrels, grab ⏱ for time and
// the Boosted Studios badge for a boost.
//
// Runs are exact replays: the game always advances in fixed steps (STEP),
// the course (where traffic and pickups sit) comes from a seed, and your
// lane changes are logged by step. So the same seed and moves always give
// the same run. The server uses that to replay every run itself and pay
// points on the distance it gets (api/rush-finish.js), and the ghost of
// your best attempt is a replay running beside you.
// No imports here, so it runs in plain Node (tests and the server).

// The game's rules. Admins change them in the app (063_rush_settings.sql);
// these are the defaults when the settings can't be loaded.
export const DEFAULT_RULES = {
  enabled: true,
  goal: 3000, // meters for the daily points
  dailyPoints: 1,
  startTime: 60, // seconds on the clock at the start
  clockSeconds: 3, // a ⏱ pickup adds this
  crashSeconds: 4, // hitting traffic costs this
  boostSeconds: 3, // the Boosted badge lasts this (0 = no boosts)
  boostChance: 0.08, // share of traffic rows with a badge
  clockChance: 0.22, // share with a ⏱
  traffic: 1, // more than 1 = traffic comes faster
  startSpeed: 28, // m/s at the start
  ramp: 70, // meters driven per +1 m/s of speed (lower = speeds up quicker)
  topSpeed: 85, // m/s
  boostSpeed: 115, // m/s while boosting; the server allows the faster of the two plus 5
};
// The three difficulty levels (065–068 set the same defaults on the
// server; admins can change them). Tuned against a driver that plans
// ahead, at human reaction times, and checked against real play. Each is shorter, faster and busier
// than the one before, and worth more points.
export const LEVEL_IDS = ["easy", "medium", "hard"];
export const DEFAULT_LEVELS = {
  easy: { goal: 1600, points: 1, startTime: 35, clockSeconds: 3, crashSeconds: 3, boostSeconds: 3, boostChance: 0.1, clockChance: 0.2, traffic: 0.85, startSpeed: 40, ramp: 45, topSpeed: 86, boostSpeed: 120 },
  medium: { goal: 2750, points: 2, startTime: 30, clockSeconds: 2.5, crashSeconds: 4, boostSeconds: 3, boostChance: 0.08, clockChance: 0.14, traffic: 1.12, startSpeed: 46, ramp: 40, topSpeed: 98, boostSpeed: 132 },
  hard: { goal: 3400, points: 3, startTime: 26, clockSeconds: 2, crashSeconds: 5, boostSeconds: 3, boostChance: 0.06, clockChance: 0.11, traffic: 1.25, startSpeed: 52, ramp: 35, topSpeed: 110, boostSpeed: 144 },
};
export const GOAL_METERS = DEFAULT_RULES.goal;
export const START_TIME = DEFAULT_RULES.startTime;
export const MAX_SPEED = DEFAULT_RULES.topSpeed;
export const BOOST_SPEED = DEFAULT_RULES.boostSpeed;
export const BOOST_TIME = DEFAULT_RULES.boostSeconds;
export const SPOILERS = ["none", "lip", "wing"];
export const BODIES = ["coupe", "sedan", "hatch", "suv", "truck"];
export const GAME_COLORS = ["#E11D2E", "#FF7A00", "#FACC15", "#10B981", "#1D4ED8", "#A855F7", "#F5F5F5", "#9CA3AF", "#111827"];
// What each car can look like (vehicles.game_*): names for the garage's
// style rows.
export const COLOR_NAMES = { "#E11D2E": "Red", "#FF7A00": "Orange", "#FACC15": "Yellow", "#10B981": "Green", "#1D4ED8": "Blue", "#A855F7": "Violet", "#F5F5F5": "White", "#9CA3AF": "Silver", "#111827": "Black" };
export const BODY_NAMES = { coupe: "Coupe", sedan: "Sedan", hatch: "Hatch", suv: "SUV", truck: "Truck" };
export const SPOILER_NAMES = { none: "None", lip: "Lip", wing: "Wing" };
export const RIMS = ["silver", "black", "gold", "bronze", "chrome"];
export const RIM_NAMES = { silver: "Silver", black: "Black", gold: "Gold", bronze: "Bronze", chrome: "Chrome" };
export const HEIGHTS = ["stock", "lowered", "slammed", "lifted"];
export const HEIGHT_NAMES = { stock: "Stock", lowered: "Lowered", slammed: "Slammed", lifted: "Lifted" };
export const DEFAULT_LOOK = { color: "#1D4ED8", body: "coupe", spoiler: "lip", rims: "silver", height: "stock" };

// The body style a real car is closest to, from its make and model (and
// chassis codes like G30 or F82), so a new car looks right before anyone
// restyles it. Checked in order: truck, SUV, hatch, coupe; otherwise sedan.
const BODY_WORDS = {
  truck: ["f-?150", "f-?250", "f-?350", "raptor", "silverado", "sierra", "ram", "1500", "2500", "tacoma", "tundra", "ranger", "colorado", "canyon", "frontier", "titan", "gladiator", "ridgeline", "maverick", "cybertruck", "santa cruz", "truck", "pickup", "r1t", "lightning"],
  suv: ["x[1-7]", "ix", "q[3-8]", "sq[5-8]", "e-?tron", "gl[abces]", "gle", "glc", "gls", "g-?class", "g ?wagon", "g ?63", "ml", "rav-?4", "highlander", "4runner", "land cruiser", "sequoia", "venza", "cr-?v", "hr-?v", "pilot", "passport", "mdx", "rdx", "zdx", "cx-?\\d+", "explorer", "expedition", "bronco", "escape", "edge", "tahoe", "suburban", "yukon", "escalade", "traverse", "equinox", "blazer", "trailblazer", "wrangler", "cherokee", "compass", "renegade", "wagoneer", "durango", "telluride", "sorento", "sportage", "seltos", "palisade", "santa fe", "tucson", "kona", "rogue", "pathfinder", "murano", "armada", "kicks", "qx\\d+", "outback", "forester", "ascent", "crosstrek", "model [xy]", "cayenne", "macan", "urus", "range rover", "defender", "discovery", "tiguan", "atlas", "touareg", "id\\.?4", "[rngl]x ?\\d+", "xc\\d+", "gv\\d+", "outlander", "eclipse cross", "suv", "r1s"],
  hatch: ["golf", "gti", "golf r", "civic type r", "fit", "cooper", "mini", "fiesta", "focus", "veloster", "yaris", "elantra n", "i30", "500", "polo", "sportback", "1 series", "impreza", "prius", "leaf", "bolt", "gr ?corolla", "corolla hatch", "mazda ?3 hatch", "hatch", "rs ?3", "a3", "ioniq 5"],
  coupe: ["mustang", "camaro", "challenger", "corvette", "86", "gr ?86", "z4", "brz", "supra", "\\d{3}z", "z", "miata", "mx-?5", "m2", "m4", "m6", "m8", "[248] series", "e(36|46|82|92)", "f(22|32|82|87)", "g(42|82)", "rc ?f?", "lc ?\\d*", "nsx", "gt-?r", "911", "cayman", "boxster", "718", "tt", "r8", "amg gt", "s2000", "integra", "prelude", "crx", "240sx", "silvia", "s1[345]", "180sx", "rx-?[78]", "celica", "eclipse", "3000gt", "genesis coupe", "huracan", "aventador", "f8", "488", "458", "720s", "coupe", "q60", "g37", "g35"],
};
const MAKE_BODY = { jeep: "suv", "land rover": "suv", ram: "truck", ferrari: "coupe", lamborghini: "coupe", mclaren: "coupe", mini: "hatch" };
const bodyRules = Object.entries(BODY_WORDS).map(([body, words]) => [body, new RegExp(`(^|[^a-z0-9])(${words.join("|")})($|[^a-z0-9])`, "i")]);

export function guessBody(make = "", model = "") {
  const m = String(model).toLowerCase();
  const mk = String(make).toLowerCase();
  // A word in the model wins; then what the brand mostly makes.
  if (mk === "jeep" && /gladiator/.test(m)) return "truck";
  if (mk === "lamborghini" && /urus/.test(m)) return "suv";
  if (mk === "porsche" && /cayenne|macan/.test(m)) return "suv";
  if (mk === "porsche" && /panamera|taycan/.test(m)) return "sedan";
  for (const [body, re] of bodyRules) if (re.test(m)) return body;
  return MAKE_BODY[mk] || "sedan";
}

// The brand's front-end look (grille, lights) for the 3D cars.
const BRANDS = ["bmw", "mercedes", "audi", "volkswagen", "porsche", "toyota", "lexus", "honda", "acura", "nissan", "infiniti", "mazda", "subaru", "mitsubishi", "ford", "chevrolet", "dodge", "tesla", "hyundai", "kia", "genesis", "jeep", "ram", "gmc", "cadillac", "volvo", "land rover", "mini", "lamborghini", "ferrari"];
export function brandOf(make = "") {
  const mk = String(make).toLowerCase().replace("-benz", "");
  return BRANDS.find((b) => mk.startsWith(b)) || "generic";
}

// A saved car's look, with the defaults filled in. Its body, if never
// picked, comes from the make and model; its brand gives the front end.
export const lookOf = (v) => ({
  color: v?.game_color || DEFAULT_LOOK.color,
  body: v?.game_body || (v?.model ? guessBody(v.make, v.model) : DEFAULT_LOOK.body),
  brand: brandOf(v?.make),
  spoiler: v?.game_spoiler || DEFAULT_LOOK.spoiler,
  rims: v?.game_rims || DEFAULT_LOOK.rims,
  height: v?.game_height || DEFAULT_LOOK.height,
});
const TRAFFIC_COLORS = ["#F59E0B", "#2563EB", "#7C3AED", "#16A34A", "#DC2626", "#0EA5E9", "#9333EA"];
const ROAD_DEPTH = 190; // meters of road on screen
export const STEP = 1 / 60; // seconds per game step
const FIRST_ROW = 110; // meters to the first row of traffic

// A repeatable random number source from a seed (1 to 2147483646).
export function seededRand(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Each day looks different too: noon, golden hour or dusk, in turn.
export const THEMES = [
  { id: "noon", name: "Noon", sky: ["#7DD3FC", "#E0F2FE"], sand: "#F3D58B", sun: 58 },
  { id: "golden", name: "Golden hour", sky: ["#F59E0B", "#FDE68A"], sand: "#E8B872", sun: 14 },
  { id: "dusk", name: "Dusk", sky: ["#3B2A6B", "#F9A8D4"], sand: "#C79A74", sun: 5 },
];
// Scenery: where the road runs. Looks only (the course is the same
// everywhere). The desert is free; the rest are unlocked with reward points
// (078_rush_scenery.sql has the prices). For the Classic (2D) drawing: the
// ground, the road, roadside emoji, and a sky of its own where the day's
// sky wouldn't fit. The 3D looks are in rush3d.js.
export const SCENERY = {
  desert: { name: "Desert", emoji: "🌵", side: ["🌵", "🌵", "🪨"] },
  city: { name: "City", emoji: "🏙️", ground: "#6B7280", side: ["🏢", "🏬", "🏢", "🚦"] },
  forest: { name: "Forest", emoji: "🌲", ground: "#3F7D3A", side: ["🌲", "🌳", "🌲", "🍄"] },
  beach: { name: "Beach", emoji: "🏖️", ground: "#F3DFA2", side: ["🌴", "🌴", "⛱️", "🐚"] },
  mountain: { name: "Mountains", emoji: "🏔️", ground: "#6E8B4E", side: ["🌲", "🪨", "🏔️", "🌲"] },
  swamp: { name: "Swamp", emoji: "🐊", ground: "#4B5D3A", sky: ["#4A5A40", "#B5C3A0"], side: ["🌿", "🪵", "🐊", "🌾"] },
  arctic: { name: "Arctic", emoji: "❄️", ground: "#EAF4FA", sky: ["#7CC4F0", "#EAF6FF"], side: ["☃️", "🧊", "❄️", "🐧"] },
  volcano: { name: "Volcano", emoji: "🌋", ground: "#2A2420", road: "#4B4642", sky: ["#2A0707", "#C2410C"], side: ["🌋", "🔥", "🪨", "🔥"] },
  space: { name: "Space", emoji: "🪐", ground: "#3B3552", road: "#2E2A40", sky: ["#05010F", "#1E1B4B"], side: ["🪐", "⭐", "☄️", "🛸"] },
};
export const SCENERY_IDS = Object.keys(SCENERY);

// "2026-10-26" → that day's theme.
export function themeFor(day) {
  const n = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
  return THEMES[((n % THEMES.length) + THEMES.length) % THEMES.length] || THEMES[0];
}
// Today's date in Atlanta, like the server's game_today().
export function gameToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

// ---------- engine ----------

// rand lays out the course; fx is for looks only (exhaust pops, cacti), so
// it never changes how a run plays out.
export function newGame(rand = Math.random, rules = {}, fx = Math.random) {
  const r = { ...DEFAULT_RULES, ...rules };
  return {
    rand,
    fx,
    rules: r,
    stepNo: 0,
    log: [], // [step, direction] for every lane change
    script: null, // a replay's moves
    scriptAt: 0,
    nextRow: FIRST_ROW,
    theme: THEMES[0],
    t: 0,
    timeLeft: r.startTime,
    speed: r.startSpeed,
    dist: 0,
    lane: 1,
    laneX: 1,
    objects: [],
    scenery: [0.15, 0.4, 0.65, 0.9].map((z, i) => ({ z, side: i % 2 ? 1 : -1, pick: i / 4 })),
    stripe: 0,
    crashT: 0,
    crashes: 0,
    pickups: 0,
    boosts: 0,
    boostT: 0,
    popT: 0,
    over: false,
  };
}

export function steer(g, dir) {
  if (g.over) return;
  g.lane = Math.max(0, Math.min(2, g.lane + dir));
}

// A row of traffic at `at` meters, and the gap to the next row: rows get
// closer the further you go, and closer still with more traffic.
function spawnRow(g, at) {
  const r = g.rand;
  const blocked = r() < 0.35 ? 2 : 1;
  // Shuffle the lanes the same way on every phone and the server (a sort
  // with a random comparison differs between browsers).
  const lanes = [0, 1, 2];
  for (let i = 2; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  for (let i = 0; i < blocked; i++) {
    const roll = r();
    g.objects.push({
      at,
      z: 1,
      lane: lanes[i],
      kind: roll < 0.7 ? "car" : roll < 0.85 ? "cone" : "barrel",
      color: TRAFFIC_COLORS[Math.floor(r() * TRAFFIC_COLORS.length)],
      body: BODIES[Math.floor(r() * BODIES.length)],
    });
  }
  const { clockChance, boostChance, boostSeconds, traffic } = g.rules;
  const bonus = r();
  if (bonus < clockChance) g.objects.push({ at, z: 1, lane: lanes[2], kind: "clock" });
  else if (bonus < clockChance + boostChance && boostSeconds > 0) g.objects.push({ at, z: 1, lane: lanes[2], kind: "boost" });
  return (Math.max(34, 64 - at / 150) * (0.8 + r() * 0.4)) / traffic;
}

// One fixed step: apply this step's lane changes (yours, logged, or a
// replay's), then advance. Returns the step's events.
export function tick(g, dirs = []) {
  if (g.over) return [];
  if (g.script) {
    while (g.scriptAt < g.script.length && g.script[g.scriptAt][0] <= g.stepNo) {
      steer(g, g.script[g.scriptAt][1]);
      g.scriptAt += 1;
    }
  }
  for (const d of dirs) {
    steer(g, d);
    g.log.push([g.stepNo, d]);
  }
  const events = step(g, STEP);
  g.stepNo += 1;
  return events;
}

// Play a whole run from its seed and moves, as the server does.
export function replay(seed, rules, moves, maxSteps = 600 / STEP) {
  const g = newGame(seededRand(seed), rules, () => 0.5);
  g.script = moves;
  while (!g.over && g.stepNo < maxSteps) tick(g);
  return g;
}

// The moves a client sends: up to 5,000 [step, ±1] pairs in step order.
export function validMoves(moves) {
  if (!Array.isArray(moves) || moves.length > 5000) return false;
  let last = 0;
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || m[0] < last || (m[1] !== 1 && m[1] !== -1)) return false;
    last = m[0];
  }
  return true;
}

// Advance the game by dt seconds. Returns events for sounds/vibration.
export function step(g, dt) {
  const events = [];
  if (g.over) return events;
  dt = Math.min(dt, 0.05);
  g.t += dt;
  g.timeLeft -= dt;
  const R = g.rules;
  const boosting = g.boostT > 0;
  const target = boosting ? R.boostSpeed : Math.min(R.topSpeed, R.startSpeed + g.dist / R.ramp);
  g.speed += (target - g.speed) * Math.min(1, dt * (boosting ? 3 : g.crashT > 0 ? 0.6 : 1.5));
  g.crashT = Math.max(0, g.crashT - dt);
  g.boostT = Math.max(0, g.boostT - dt);
  g.popT = Math.max(0, g.popT - dt);
  if (boosting && g.boostT === 0) events.push("boostEnd");
  // Exhaust pops and burbles while boosting.
  if (g.boostT > 0 && g.fx() < dt * 7) {
    g.popT = 0.1;
    events.push("pop");
  }
  g.dist += g.speed * dt;
  g.laneX += Math.sign(g.lane - g.laneX) * Math.min(Math.abs(g.lane - g.laneX), dt * 11);

  const dz = (g.speed * dt) / ROAD_DEPTH;
  g.stripe = (g.stripe + dz * 6) % 1;
  for (const s of g.scenery) {
    s.z -= dz;
    if (s.z < 0) {
      s.z += 1;
      s.side = g.fx() < 0.5 ? -1 : 1;
      s.pick = g.fx();
    }
  }

  while (g.nextRow <= g.dist + ROAD_DEPTH) g.nextRow += spawnRow(g, g.nextRow);

  const myLane = Math.round(g.laneX);
  for (const o of g.objects) {
    if (o.at === undefined) o.at = g.dist - g.speed * dt + o.z * ROAD_DEPTH; // placed by hand (tests, previews)
    o.z = (o.at - g.dist) / ROAD_DEPTH;
    if (o.hit || o.z > 0.06 || o.z < -0.02 || o.lane !== myLane) continue;
    o.hit = true;
    if (o.kind === "clock") {
      g.timeLeft += R.clockSeconds;
      g.pickups += 1;
      events.push("pickup");
    } else if (o.kind === "boost") {
      g.boostT = R.boostSeconds;
      g.crashT = 0;
      g.boosts += 1;
      events.push("boost");
    } else if (g.crashT <= 0) {
      // Boosted or not, you still have to steer around things; a crash
      // also ends the boost.
      g.boostT = 0;
      g.timeLeft -= R.crashSeconds;
      g.speed *= 0.45;
      g.crashT = 1.2;
      g.crashes += 1;
      events.push("crash");
    }
  }
  g.objects = g.objects.filter((o) => o.z > -0.05 && !(o.hit && (o.kind === "clock" || o.kind === "boost")));

  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    g.over = true;
    events.push("over");
  }
  return events;
}

export const scoreOf = (g) => Math.floor(g.dist) + g.pickups * 100 + g.boosts * 100;

// ---------- drawing ----------

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- cars, seen from behind ----------
// Three families, with no brand logos:
//   * coupe, sedan, hatch: styled like a modern German sport sedan, with
//     L-shaped LED tail lights reaching onto the trunk, fastback glass, a
//     crisp trunk lip, the plate on the trunk between the lights, and a
//     diffuser with exhaust tips in pairs.
//   * suv: tall upright tailgate, roof spoiler and rails, wide tail lights,
//     black wheel-arch trim, a silver skid plate and more ground clearance.
//   * truck: a pickup, with the cab's sliding rear window over an open bed,
//     a flat tailgate with a center handle, tall corner lights, a chrome step
//     bumper with the plate and a tow hitch, and big tires.
// Sizes are fractions of the width: total height, the glass/cab share of
// it, roof and window-base widths, and ground clearance.
const CAR_SHAPE = {
  coupe: { h: 0.5, cabin: 0.42, roof: 0.5, base: 0.74, clear: 0.1 },
  sedan: { h: 0.56, cabin: 0.42, roof: 0.56, base: 0.76, clear: 0.1 },
  hatch: { h: 0.6, cabin: 0.48, roof: 0.64, base: 0.8, clear: 0.11 },
  suv: { h: 0.8, cabin: 0.45, roof: 0.78, base: 0.84, clear: 0.17 },
  truck: { h: 0.86, cabin: 0.4, roof: 0.68, base: 0.74, clear: 0.2 },
};

// A car seen from behind, centered at cx, sitting on bottomY, w wide.
// `sport` is the player's car (diffuser, quad exhaust, spoiler: "none",
// "lip" or "wing"); traffic stays plain.
export function drawCar(ctx, cx, bottomY, w, opts = {}) {
  const s = CAR_SHAPE[opts.body] || CAR_SHAPE.coupe;
  const h = w * s.h;
  const c = { cx, x: cx - w / 2, w, h, bottomY, s, top: bottomY - h, detail: w > 34, color: opts.color || "#0080F0" };
  c.belt = c.top + h * s.cabin;
  c.bodyBottom = bottomY - h * s.clear;
  c.bh = c.bodyBottom - c.belt;
  wheels(ctx, c, opts.body);
  if (opts.body === "truck") drawPickup(ctx, c, opts);
  else if (opts.body === "suv") drawSuv(ctx, c, opts);
  else drawSporty(ctx, c, opts);
}

function wheels(ctx, c, body) {
  const { x, w, h, bottomY, bodyBottom, bh } = c;
  const big = body === "suv" || body === "truck";
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(c.cx, bottomY, w * 0.56, h * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0B0B0B";
  ctx.fillRect(x + w * 0.1, bodyBottom - bh * 0.1, w * 0.8, bottomY - bodyBottom + bh * 0.05);
  const tw = w * (big ? 0.22 : 0.19);
  for (const tx of [x + w * 0.035, x + w * 0.965 - tw]) {
    ctx.fillStyle = "#151515";
    roundRect(ctx, tx, bodyBottom - bh * 0.16, tw, bottomY - bodyBottom + bh * 0.16, w * 0.035);
    ctx.fill();
    if (c.detail) {
      // Tread blocks.
      ctx.fillStyle = "#262626";
      for (let i = 0; i < (big ? 4 : 3); i++) ctx.fillRect(tx + tw * 0.12, bottomY - (bottomY - bodyBottom) * (0.25 + i * 0.22), tw * 0.76, Math.max(1, h * 0.012));
    }
  }
}

// Pillars and roof in paint, tinted glass with a streak of reflection.
function greenhouse(ctx, c, { roofW, baseW, upright = false }) {
  const { cx, top, belt, color } = c;
  const ch = belt - top;
  const lean = upright ? 0.04 : 0.14;
  const cabin = new Path2D();
  cabin.moveTo(cx - baseW / 2, belt + 1);
  cabin.lineTo(cx - roofW / 2, top + ch * lean);
  cabin.quadraticCurveTo(cx, top - ch * (upright ? 0.02 : 0.08), cx + roofW / 2, top + ch * lean);
  cabin.lineTo(cx + baseW / 2, belt + 1);
  cabin.closePath();
  ctx.fillStyle = shade(color, -0.06);
  ctx.fill(cabin);
  const inX = c.w * (upright ? 0.06 : 0.05);
  const glass = new Path2D();
  glass.moveTo(cx - baseW / 2 + inX, belt - ch * 0.07);
  glass.lineTo(cx - roofW / 2 + inX * 0.8, top + ch * (lean + 0.12));
  glass.quadraticCurveTo(cx, top + ch * (upright ? 0.12 : 0.06), cx + roofW / 2 - inX * 0.8, top + ch * (lean + 0.12));
  glass.lineTo(cx + baseW / 2 - inX, belt - ch * 0.07);
  glass.closePath();
  const tint = ctx.createLinearGradient(0, top, 0, belt);
  tint.addColorStop(0, "#1E293B");
  tint.addColorStop(1, "#05070D");
  ctx.fillStyle = tint;
  ctx.fill(glass);
  if (c.detail) {
    ctx.save();
    ctx.clip(glass);
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.beginPath();
    ctx.moveTo(cx - roofW * 0.35, top);
    ctx.lineTo(cx - roofW * 0.15, top);
    ctx.lineTo(cx - baseW * 0.35, belt);
    ctx.lineTo(cx - baseW * 0.55, belt);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#EF4444";
    ctx.fillRect(cx - roofW * 0.13, top + ch * (lean + 0.05), roofW * 0.26, Math.max(1, ch * 0.035));
  }
  return { ch, lean };
}

function mirrors(ctx, c, spread, y, size = 1) {
  if (!c.detail) return;
  ctx.fillStyle = shade(c.color, -0.15);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(c.cx + side * spread, y, c.w * 0.045 * size, (c.belt - c.top) * 0.1 * size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintGradient(ctx, c, from, to) {
  const g = ctx.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, shade(c.color, 0.22));
  g.addColorStop(0.28, c.color);
  g.addColorStop(1, shade(c.color, -0.28));
  return g;
}

function plateAt(ctx, c, y, plate, pw = c.w * 0.26, ph = c.bh * 0.17) {
  const { cx, w } = c;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, cx - pw / 2 - w * 0.012, y - w * 0.01, pw + w * 0.024, ph + w * 0.02, w * 0.02);
  ctx.fill();
  ctx.fillStyle = "#F8FAFC";
  roundRect(ctx, cx - pw / 2, y, pw, ph, w * 0.012);
  ctx.fill();
  if (plate && w > 40) {
    ctx.fillStyle = "#111";
    ctx.font = `800 ${Math.max(6, ph * 0.66)}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(plate.slice(0, 9).toUpperCase(), cx, y + ph / 2 + 0.5, pw * 0.92);
  }
}

function glow(ctx, c, x, y, w, h) {
  if (!c.detail) return;
  ctx.fillStyle = "rgba(239,68,68,0.16)";
  roundRect(ctx, x, y, w, h, Math.min(w, h) / 2);
  ctx.fill();
}

// Coupe, sedan and hatch.
function drawSporty(ctx, c, { body, plate = "", sport = false, spoiler = "lip" }) {
  const { cx, x, w, h, top, belt, bodyBottom, bh, s } = c;
  const roofW = w * s.roof;
  const baseW = w * s.base;
  greenhouse(ctx, c, { roofW, baseW, upright: body === "hatch" });
  mirrors(ctx, c, baseW / 2 + w * 0.035, belt - (belt - top) * 0.16);

  // Body: flared hips, glossy paint.
  const shell = new Path2D();
  shell.moveTo(x + w * 0.05, bodyBottom);
  shell.lineTo(x + w * 0.005, bodyBottom - bh * 0.3);
  shell.quadraticCurveTo(x - w * 0.012, belt + bh * 0.12, x + w * 0.07, belt);
  shell.lineTo(x + w * 0.93, belt);
  shell.quadraticCurveTo(x + w * 1.012, belt + bh * 0.12, x + w * 0.995, bodyBottom - bh * 0.3);
  shell.lineTo(x + w * 0.95, bodyBottom);
  shell.closePath();
  ctx.fillStyle = paintGradient(ctx, c, belt, bodyBottom);
  ctx.fill(shell);

  // Crisp trunk lip: a highlight with a shadow under it.
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + w * 0.1, belt + bh * 0.015, w * 0.8, Math.max(1, bh * 0.02));
  ctx.fillStyle = shade(c.color, -0.35);
  ctx.fillRect(x + w * 0.12, belt + bh * 0.045, w * 0.76, Math.max(1, bh * 0.018));

  // L-shaped LED tail lights in smoked housings, reaching onto the trunk.
  const ty = belt + bh * 0.08;
  const th = bh * 0.17;
  const legH = bh * 0.33;
  for (const side of [-1, 1]) {
    const outer = cx + side * w * 0.485;
    const inner = cx + side * w * 0.19;
    glow(ctx, c, Math.min(outer, inner) - w * 0.02, ty - th * 0.5, Math.abs(outer - inner) + w * 0.04, legH + th);
    ctx.fillStyle = "#2B0508";
    ctx.beginPath();
    ctx.moveTo(outer, ty);
    ctx.lineTo(inner, ty + th * 0.12);
    ctx.lineTo(inner + side * w * 0.01, ty + th);
    ctx.lineTo(outer - side * w * 0.1, ty + th);
    ctx.lineTo(outer - side * w * 0.085, ty + legH);
    ctx.lineTo(outer - side * w * 0.01, ty + legH * 0.92);
    ctx.closePath();
    ctx.fill();
    // The lit "L".
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [wd, col] of c.detail ? [[3.2, "rgba(255,60,60,0.35)"], [1.2, "#FF2D2D"]] : [[1.2, "#FF2D2D"]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, bh * 0.032 * wd);
      ctx.beginPath();
      ctx.moveTo(inner + side * w * 0.015, ty + th * 0.5);
      ctx.lineTo(outer - side * w * 0.06, ty + th * 0.42);
      ctx.lineTo(outer - side * w * 0.05, ty + legH * 0.8);
      ctx.stroke();
    }
  }

  // Plate on the trunk, between the lights; a crease along the bumper.
  plateAt(ctx, c, belt + bh * 0.2, plate);
  ctx.fillStyle = shade(c.color, -0.3);
  ctx.fillRect(x + w * 0.08, belt + bh * 0.56, w * 0.84, Math.max(1, bh * 0.02));
  if (c.detail) {
    ctx.fillStyle = "#991B1B";
    ctx.fillRect(x + w * 0.04, belt + bh * 0.66, w * 0.07, Math.max(1, bh * 0.035));
    ctx.fillRect(x + w * 0.89, belt + bh * 0.66, w * 0.07, Math.max(1, bh * 0.035));
  }

  // Bumper: diffuser with quad exhaust on your car; plain on traffic.
  const dy = bodyBottom - bh * 0.25;
  if (sport) {
    ctx.fillStyle = "#0F0F0F";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, dy);
    ctx.lineTo(x + w * 0.86, dy);
    ctx.lineTo(x + w * 0.82, bodyBottom + h * 0.02);
    ctx.lineTo(x + w * 0.18, bodyBottom + h * 0.02);
    ctx.closePath();
    ctx.fill();
    if (c.detail) {
      ctx.fillStyle = "#2A2A2A";
      for (let f = 0; f < 5; f++) ctx.fillRect(cx - w * 0.12 + f * w * 0.06, dy + bh * 0.04, Math.max(1, w * 0.012), bh * 0.2);
    }
    for (const ex of [0.21, 0.295, 0.705, 0.79]) exhaust(ctx, x + w * ex, bodyBottom - bh * 0.08, w * 0.034);
  } else {
    ctx.fillStyle = shade(c.color, -0.4);
    ctx.fillRect(x + w * 0.12, dy + bh * 0.08, w * 0.76, bh * 0.15);
    exhaust(ctx, x + w * 0.25, bodyBottom - bh * 0.04, w * 0.027);
  }

  // Spoiler, on your car.
  if (sport && spoiler === "wing") {
    const wy = belt - h * 0.17;
    ctx.fillStyle = "#151515";
    for (const side of [-1, 1]) ctx.fillRect(cx + side * w * 0.24 - w * 0.015, wy, w * 0.03, belt - wy + bh * 0.04);
    roundRect(ctx, x + w * 0.02, wy - h * 0.04, w * 0.96, h * 0.055, h * 0.015);
    ctx.fill();
    ctx.fillStyle = shade(c.color, -0.1);
    ctx.fillRect(x + w * 0.02, wy - h * 0.04, w * 0.96, Math.max(1, h * 0.012));
    ctx.fillStyle = "#151515";
    ctx.fillRect(x + w * 0.01, wy - h * 0.07, w * 0.025, h * 0.1);
    ctx.fillRect(x + w * 0.965, wy - h * 0.07, w * 0.025, h * 0.1);
  } else if (sport && spoiler === "lip") {
    ctx.fillStyle = "#151515";
    if (body === "hatch") roundRect(ctx, cx - roofW * 0.56, top + (belt - top) * 0.02, roofW * 1.12, (belt - top) * 0.1, (belt - top) * 0.04);
    else roundRect(ctx, x + w * 0.16, belt - h * 0.03, w * 0.68, h * 0.04, h * 0.02);
    ctx.fill();
  }
}

function drawSuv(ctx, c, { plate = "", sport = false, spoiler = "lip" }) {
  const { cx, x, w, h, top, belt, bodyBottom, bh, s } = c;
  const roofW = w * s.roof;
  const baseW = w * s.base;
  const { ch } = greenhouse(ctx, c, { roofW, baseW, upright: true });
  mirrors(ctx, c, baseW / 2 + w * 0.045, belt - ch * 0.15, 1.15);
  // Roof rails and the roof spoiler over the glass.
  if (c.detail) {
    ctx.fillStyle = "#B8BCC4";
    for (const side of [-1, 1]) ctx.fillRect(cx + side * roofW * 0.42 - w * 0.02, top - h * 0.035, w * 0.04, h * 0.04);
  }
  ctx.fillStyle = spoiler === "wing" && sport ? "#151515" : shade(c.color, -0.12);
  roundRect(ctx, cx - roofW * 0.53, top - h * 0.005, roofW * 1.06, ch * (spoiler === "wing" && sport ? 0.13 : 0.09), ch * 0.04);
  ctx.fill();

  // Boxy body.
  ctx.fillStyle = paintGradient(ctx, c, belt, bodyBottom);
  roundRect(ctx, x + w * 0.01, belt, w * 0.98, bh, w * 0.05);
  ctx.fill();
  // Tailgate edges.
  ctx.fillStyle = shade(c.color, -0.35);
  for (const side of [-1, 1]) ctx.fillRect(cx + side * w * 0.31 - 0.5, belt, Math.max(1, w * 0.006), bh * 0.52);
  ctx.fillRect(cx - w * 0.31, belt + bh * 0.52, w * 0.62, Math.max(1, w * 0.006));

  // Wide tail lights reaching onto the tailgate, joined by a chrome strip.
  const ty = belt + bh * 0.09;
  const th = bh * 0.13;
  for (const side of [-1, 1]) {
    const a = side < 0 ? x + w * 0.03 : cx + w * 0.16;
    const lw = w * 0.31;
    glow(ctx, c, a - w * 0.01, ty - th * 0.6, lw + w * 0.02, th * 2.2);
    ctx.fillStyle = "#C81E1E";
    roundRect(ctx, a, ty, lw, th, th * 0.3);
    ctx.fill();
    if (c.detail) {
      ctx.fillStyle = "#FF4D4D";
      ctx.fillRect(a + lw * 0.06, ty + th * 0.2, lw * 0.88, Math.max(1, th * 0.18));
      ctx.fillStyle = "#E5E7EB";
      ctx.fillRect(side < 0 ? a + lw * 0.04 : a + lw * 0.78, ty + th * 0.55, lw * 0.18, th * 0.3);
    }
  }
  ctx.fillStyle = "#D1D5DB";
  ctx.fillRect(cx - w * 0.16, ty + th * 0.4, w * 0.32, Math.max(1, th * 0.22));
  plateAt(ctx, c, belt + bh * 0.3, plate, w * 0.25, bh * 0.15);

  // Black arch trim, a chunky lower bumper and a silver skid plate.
  ctx.fillStyle = "#161616";
  for (const side of [-1, 1]) {
    const ax = side < 0 ? x : x + w * 0.88;
    roundRect(ctx, ax, belt + bh * 0.5, w * 0.12, bodyBottom - belt - bh * 0.5, w * 0.03);
    ctx.fill();
  }
  ctx.fillStyle = "#1C1C1C";
  roundRect(ctx, x + w * 0.08, belt + bh * 0.66, w * 0.84, bodyBottom - belt - bh * 0.66, w * 0.02);
  ctx.fill();
  const skid = ctx.createLinearGradient(0, bodyBottom - bh * 0.18, 0, bodyBottom);
  skid.addColorStop(0, "#E5E7EB");
  skid.addColorStop(1, "#8A8F98");
  ctx.fillStyle = skid;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.24, bodyBottom - bh * 0.17);
  ctx.lineTo(cx + w * 0.24, bodyBottom - bh * 0.17);
  ctx.lineTo(cx + w * 0.2, bodyBottom);
  ctx.lineTo(cx - w * 0.2, bodyBottom);
  ctx.closePath();
  ctx.fill();
  if (sport) {
    // Twin trapezoid tips set into the bumper.
    ctx.fillStyle = "#D1D5DB";
    for (const side of [-1, 1]) roundRect(ctx, cx + side * w * 0.33 - w * 0.05, bodyBottom - bh * 0.15, w * 0.1, bh * 0.07, bh * 0.02), ctx.fill();
    ctx.fillStyle = "#0A0A0A";
    for (const side of [-1, 1]) roundRect(ctx, cx + side * w * 0.33 - w * 0.04, bodyBottom - bh * 0.135, w * 0.08, bh * 0.04, bh * 0.015), ctx.fill();
  }
}

function drawPickup(ctx, c, { plate = "", sport = false }) {
  const { cx, x, w, h, top, belt, bodyBottom, bh, s } = c;
  const cabW = w * s.base;
  const ch = belt - top;
  // Cab back, with the sliding rear window and a cargo/brake light.
  ctx.fillStyle = paintGradient(ctx, c, top, belt);
  ctx.beginPath();
  ctx.moveTo(cx - cabW / 2, belt + 1);
  ctx.lineTo(cx - cabW * 0.47, top + ch * 0.06);
  ctx.quadraticCurveTo(cx, top - ch * 0.03, cx + cabW * 0.47, top + ch * 0.06);
  ctx.lineTo(cx + cabW / 2, belt + 1);
  ctx.closePath();
  ctx.fill();
  const wx = cx - cabW * 0.38;
  const wy = top + ch * 0.2;
  const ww = cabW * 0.76;
  const wh = ch * 0.48;
  const tint = ctx.createLinearGradient(0, wy, 0, wy + wh);
  tint.addColorStop(0, "#1E293B");
  tint.addColorStop(1, "#05070D");
  ctx.fillStyle = tint;
  roundRect(ctx, wx, wy, ww, wh, ch * 0.06);
  ctx.fill();
  if (c.detail) {
    ctx.fillStyle = "#0A0A0A";
    for (const f of [-0.13, 0.13]) ctx.fillRect(cx + cabW * f - w * 0.006, wy, w * 0.012, wh);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(wx + ww * 0.08, wy + wh * 0.12, ww * 0.18, wh * 0.12);
  }
  ctx.fillStyle = "#EF4444";
  ctx.fillRect(cx - cabW * 0.12, top + ch * 0.07, cabW * 0.24, Math.max(1, ch * 0.05));
  // Big towing mirrors.
  if (c.detail) {
    ctx.fillStyle = "#151515";
    for (const side of [-1, 1]) roundRect(ctx, cx + side * (cabW / 2 + w * 0.05) - w * 0.04, belt - ch * 0.45, w * 0.08, ch * 0.28, w * 0.01), ctx.fill();
  }

  // The open bed seen over the tailgate, and the bed rails.
  const railY = belt + bh * 0.07;
  ctx.fillStyle = "#151515";
  ctx.fillRect(x + w * 0.05, belt - bh * 0.02, w * 0.9, railY - belt + bh * 0.02);
  ctx.fillStyle = shade(c.color, 0.1);
  ctx.fillRect(x + w * 0.01, belt - bh * 0.03, w * 0.06, railY - belt + bh * 0.05);
  ctx.fillRect(x + w * 0.93, belt - bh * 0.03, w * 0.06, railY - belt + bh * 0.05);

  // Tailgate and the bed's back corners.
  const bumperTop = bodyBottom - bh * 0.27;
  ctx.fillStyle = paintGradient(ctx, c, railY, bumperTop);
  roundRect(ctx, x + w * 0.01, railY, w * 0.98, bumperTop - railY, w * 0.015);
  ctx.fill();
  ctx.strokeStyle = shade(c.color, -0.3);
  ctx.lineWidth = Math.max(1, w * 0.005);
  ctx.strokeRect(x + w * 0.12, railY + bh * 0.08, w * 0.76, (bumperTop - railY) * 0.72);
  ctx.fillStyle = "#111";
  roundRect(ctx, cx - w * 0.06, railY + bh * 0.03, w * 0.12, bh * 0.045, bh * 0.015);
  ctx.fill();
  // Tall corner lights: red, with a clear reverse lens.
  for (const lx of [x + w * 0.015, x + w * 0.925]) {
    glow(ctx, c, lx - w * 0.015, railY - bh * 0.02, w * 0.09, bh * 0.5);
    ctx.fillStyle = "#C81E1E";
    roundRect(ctx, lx, railY + bh * 0.02, w * 0.06, bh * 0.42, w * 0.01);
    ctx.fill();
    ctx.fillStyle = "#E5E7EB";
    ctx.fillRect(lx + w * 0.008, railY + bh * 0.28, w * 0.044, bh * 0.08);
  }

  // Chrome step bumper with step pads, the plate and a tow hitch.
  const chrome = ctx.createLinearGradient(0, bumperTop, 0, bodyBottom + h * 0.02);
  chrome.addColorStop(0, "#F5F5F5");
  chrome.addColorStop(0.5, "#B8BCC4");
  chrome.addColorStop(1, "#6B7280");
  ctx.fillStyle = chrome;
  roundRect(ctx, x, bumperTop, w, bodyBottom - bumperTop + h * 0.02, w * 0.02);
  ctx.fill();
  ctx.fillStyle = "#1A1A1A";
  ctx.fillRect(x + w * 0.05, bumperTop + bh * 0.01, w * 0.18, Math.max(1, bh * 0.03));
  ctx.fillRect(x + w * 0.77, bumperTop + bh * 0.01, w * 0.18, Math.max(1, bh * 0.03));
  plateAt(ctx, c, bumperTop + bh * 0.06, plate, w * 0.24, bh * 0.14);
  ctx.fillStyle = "#111";
  ctx.fillRect(cx - w * 0.03, bodyBottom + h * 0.015, w * 0.06, h * 0.04);
  if (sport) for (const ex of [0.18, 0.82]) exhaust(ctx, x + w * ex, bodyBottom + h * 0.035, w * 0.04);
  else exhaust(ctx, x + w * 0.8, bodyBottom + h * 0.035, w * 0.03);
}

function exhaust(ctx, ex, ey, r) {

  const chrome = ctx.createLinearGradient(ex, ey - r, ex, ey + r);
  chrome.addColorStop(0, "#F3F4F6");
  chrome.addColorStop(1, "#6B7280");
  ctx.fillStyle = chrome;
  ctx.beginPath();
  ctx.ellipse(ex, ey, r * 1.2, r * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0A0A0A";
  ctx.beginPath();
  ctx.ellipse(ex, ey, r * 0.85, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Draw the whole frame. `me` is { color, body, plate }; `art` holds loaded
// images ({ boost, logo }), drawn only once they've loaded.
const ready = (img) => img && img.complete && img.naturalWidth > 0;

// `ghost` is a replay of your best run today, drawn see-through.
export function drawGame(ctx, W, H, g, me, art = {}, ghost = null) {
  const theme = g.theme || THEMES[0];
  const place = SCENERY[g.place] || SCENERY.desert;
  const y0 = H * 0.3;
  const yPlayer = H * 0.86;
  const hw0 = W * 0.03;
  const hwB = W * 0.52;
  const yOf = (z) => y0 + (yPlayer - y0) * Math.pow(Math.max(0, 1 - z), 2.2);
  const hwOf = (y) => hw0 + ((hwB - hw0) * (y - y0)) / (yPlayer - y0);
  const laneXAt = (lane, y) => W / 2 + (lane - 1) * hwOf(y) * 0.64;

  // Sky and sand.
  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, (place.sky || theme.sky)[0]);
  sky.addColorStop(1, (place.sky || theme.sky)[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, y0);
  if (g.place === "space") {
    // Stars.
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 53) % y0, 1.5, 1.5);
  }
  ctx.fillStyle = place.ground || theme.sand;
  ctx.fillRect(0, y0, W, H - y0);

  // Road.
  ctx.fillStyle = place.road || "#9CA3AF";
  ctx.beginPath();
  ctx.moveTo(W / 2 - hw0, y0);
  ctx.lineTo(W / 2 + hw0, y0);
  ctx.lineTo(W / 2 + hwOf(H), H);
  ctx.lineTo(W / 2 - hwOf(H), H);
  ctx.closePath();
  ctx.fill();

  // Lane dashes, moving toward you.
  ctx.fillStyle = "#FFFFFF";
  for (let k = 0; k < 12; k++) {
    const za = (k / 12 + 1 - g.stripe) % 1;
    const zb = za - 0.03;
    if (zb < 0) continue;
    const ya = yOf(za);
    const yb = yOf(zb);
    for (const side of [-1, 1]) {
      const xa = W / 2 + side * hwOf(ya) * 0.32;
      const xb = W / 2 + side * hwOf(yb) * 0.32;
      const wa = Math.max(1, hwOf(ya) * 0.025);
      const wb = Math.max(1, hwOf(yb) * 0.025);
      ctx.beginPath();
      ctx.moveTo(xa - wa, ya);
      ctx.lineTo(xa + wa, ya);
      ctx.lineTo(xb + wb, yb);
      ctx.lineTo(xb - wb, yb);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Things beside the road (cacti in the desert).
  for (const s of [...g.scenery].sort((a, b) => b.z - a.z)) {
    const y = yOf(s.z);
    const size = Math.max(6, hwOf(y) * 0.28);
    ctx.font = `${size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const emoji = place.side[Math.floor((s.pick || 0) * place.side.length) % place.side.length];
    ctx.fillText(emoji, W / 2 + s.side * (hwOf(y) * 1.25 + size * 0.4), y);
  }

  // Traffic and pickups, far to near.
  for (const o of [...g.objects].sort((a, b) => b.z - a.z)) {
    if (o.z < 0 || o.z > 1) continue;
    const y = yOf(o.z);
    const x = laneXAt(o.lane, y);
    const scale = hwOf(y) / hwB;
    const w = W * 0.25 * scale;
    if (o.kind === "car") {
      drawCar(ctx, x, y, w, { color: o.color, body: o.body });
    } else if (o.kind === "cone") {
      ctx.fillStyle = "#F97316";
      ctx.beginPath();
      ctx.moveTo(x, y - w * 0.6);
      ctx.lineTo(x + w * 0.22, y);
      ctx.lineTo(x - w * 0.22, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - w * 0.12, y - w * 0.32, w * 0.24, w * 0.07);
    } else if (o.kind === "barrel") {
      ctx.fillStyle = "#B91C1C";
      roundRect(ctx, x - w * 0.22, y - w * 0.55, w * 0.44, w * 0.55, w * 0.06);
      ctx.fill();
      ctx.fillStyle = "#7F1D1D";
      ctx.fillRect(x - w * 0.22, y - w * 0.4, w * 0.44, w * 0.05);
      ctx.fillRect(x - w * 0.22, y - w * 0.2, w * 0.44, w * 0.05);
    } else if (o.kind === "clock") {
      ctx.fillStyle = "#FDE047";
      ctx.beginPath();
      ctx.arc(x, y - w * 0.35, w * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${w * 0.4}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⏱", x, y - w * 0.35);
    } else if (o.kind === "boost") {
      // The Boosted Studios badge, bobbing and spinning like a coin, with a blue glow.
      const cy = y - w * 0.45 - Math.sin(g.t * 6) * w * 0.06;
      const glow = ctx.createRadialGradient(x, cy, 0, x, cy, w * 0.6);
      glow.addColorStop(0, "rgba(56,189,248,0.75)");
      glow.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, cy, w * 0.6, 0, Math.PI * 2);
      ctx.fill();
      const s = w * 0.95;
      if (ready(art.boost)) {
        const spin = 0.3 + 0.7 * Math.abs(Math.cos(g.t * 3));
        ctx.drawImage(art.boost, x - (s * spin) / 2, cy - s / 2, s * spin, s);
      } else {
        ctx.fillStyle = "#1D4ED8";
        ctx.beginPath();
        ctx.arc(x, cy, w * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${w * 0.36}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("B", x, cy);
      }
    }
  }

  // Your ghost, if it's on screen ahead of you.
  if (ghost) {
    const gz = (ghost.dist - g.dist) / ROAD_DEPTH;
    if (gz > 0.01 && gz < 1) {
      const y = yOf(gz);
      ctx.globalAlpha = 0.42;
      drawCar(ctx, laneXAt(ghost.laneX, y), y, W * 0.27 * (hwOf(y) / hwB), { sport: true, ...me, plate: "GHOST" });
      ctx.globalAlpha = 1;
    }
  }

  // You.
  const myX = W / 2 + (g.laneX - 1) * hwOf(yPlayer) * 0.64;
  const myW = W * 0.27;
  if (g.boostT > 0) {
    // Speed streaks.
    ctx.strokeStyle = "rgba(186,230,253,0.55)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const sx = ((i * 97 + g.t * 900) % W);
      const sy = y0 + ((i * 53 + g.t * 1400) % (H - y0));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (sx - W / 2) * 0.12, sy + 26);
      ctx.stroke();
    }
  }
  const blink = g.crashT > 0 && Math.floor(g.crashT * 10) % 2 === 0;
  if (!blink) {
    drawCar(ctx, myX, yPlayer + H * 0.02, myW, { sport: true, ...me });
  }
  if (g.boostT > 0) {
    // Big blue exhaust flames, flaring on every pop.
    const flicker = 0.75 + Math.sin(g.t * 47) * 0.15 + Math.sin(g.t * 83) * 0.1;
    const pop = g.popT > 0 ? 1.6 : 1;
    const fy = yPlayer + H * 0.02 - myW * 0.06;
    for (const side of [-1, 1]) {
      const fx = myX + side * myW * 0.255;
      const len = myW * 0.62 * flicker * pop;
      const half = myW * 0.09 * pop;
      // Outer glow.
      const glow = ctx.createRadialGradient(fx, fy + len * 0.3, 0, fx, fy + len * 0.3, len * 0.7);
      glow.addColorStop(0, "rgba(56,189,248,0.45)");
      glow.addColorStop(1, "rgba(56,189,248,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy + len * 0.3, len * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Flame body: white-hot core to deep blue.
      const fl = ctx.createLinearGradient(fx, fy, fx, fy + len);
      fl.addColorStop(0, "rgba(255,255,255,1)");
      fl.addColorStop(0.25, "rgba(125,211,252,0.95)");
      fl.addColorStop(0.6, "rgba(37,99,235,0.8)");
      fl.addColorStop(1, "rgba(30,64,175,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.moveTo(fx - half, fy);
      ctx.quadraticCurveTo(fx - half * 1.3, fy + len * 0.45, fx, fy + len);
      ctx.quadraticCurveTo(fx + half * 1.3, fy + len * 0.45, fx + half, fy);
      ctx.closePath();
      ctx.fill();
      if (g.popT > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(fx, fy + myW * 0.02, myW * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawHud(ctx, W, H, g, art, ghost);
}

// The overlay on top of the road (shared with the 3D view in rush3d.js):
// the boost banner and the dashboard.
export function drawHud(ctx, W, H, g, art = {}, ghost = null) {
  // Boost banner: the Boosted Studios logo and what's left of the boost.
  if (g.boostT > 0) {
    const bw = Math.min(W * 0.62, 240);
    const bh = ready(art.logo) ? (bw * art.logo.naturalHeight) / art.logo.naturalWidth : 0;
    const by = 64;
    ctx.globalAlpha = Math.min(1, g.boostT * 3);
    if (bh) {
      ctx.drawImage(art.logo, W / 2 - bw / 2, by, bw, bh);
    } else {
      ctx.fillStyle = "#38BDF8";
      ctx.font = "900 28px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("BOOSTED!", W / 2, by);
    }
    const barY = by + (bh || 32) + 6;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(W / 2 - bw / 2, barY, bw, 5);
    ctx.fillStyle = "#38BDF8";
    ctx.fillRect(W / 2 - bw / 2, barY, (bw * g.boostT) / Math.max(0.1, g.rules.boostSeconds), 5);
    ctx.globalAlpha = 1;
  }

  // Dashboard.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, 8, 8, W - 16, 46, 10);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "800 15px 'Barlow Condensed', sans-serif";
  ctx.fillText(`${Math.floor(g.dist).toLocaleString()} m`, 18, 25);
  ctx.fillStyle = g.timeLeft < 10 ? "#F87171" : "#FDE047";
  ctx.fillText(`⏱ ${Math.ceil(g.timeLeft)}s`, 18, 43);
  ctx.textAlign = "right";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${Math.round(g.speed * 2.237)} MPH`, W - 18, 25);
  const pct = Math.min(1, g.dist / g.rules.goal);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(W - 118, 38, 100, 6);
  ctx.fillStyle = pct >= 1 ? "#10B981" : "#FACC15";
  ctx.fillRect(W - 118, 38, 100 * pct, 6);

  // Versus your ghost: ahead (green) or behind (red).
  if (ghost) {
    const gap = Math.round(g.dist - ghost.dist);
    const text = ghost.over && gap > 0 ? "👻 BEST BEATEN!" : `👻 ${gap >= 0 ? "+" : "−"}${Math.abs(gap).toLocaleString()} m`;
    ctx.font = "800 13px 'Barlow Condensed', sans-serif";
    const w = ctx.measureText(text).width + 18;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, 8, H - 32, w, 22, 8);
    ctx.fill();
    ctx.fillStyle = gap >= 0 ? "#34D399" : "#F87171";
    ctx.textAlign = "left";
    ctx.fillText(text, 17, H - 21);
  }
}

