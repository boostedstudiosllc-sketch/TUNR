// TUNR Rush: the game engine and drawing, kept apart from React so it can be
// tested in plain Node. A 3-lane desert highway in pseudo-3D (like the old
// flash taxi games): dodge traffic, cones and barrels, grab ⏱ for time and
// the Boosted Studios badge for a boost.
// The server re-checks every run (060_tunr_rush.sql); its calls are in
// rush.js. No imports here, so it runs in plain Node for the tests.

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
  topSpeed: 85, // m/s
  boostSpeed: 115, // m/s while boosting; the server allows the faster of the two plus 5
};
export const GOAL_METERS = DEFAULT_RULES.goal;
export const START_TIME = DEFAULT_RULES.startTime;
export const MAX_SPEED = DEFAULT_RULES.topSpeed;
export const BOOST_SPEED = DEFAULT_RULES.boostSpeed;
export const BOOST_TIME = DEFAULT_RULES.boostSeconds;
export const SPOILERS = ["none", "lip", "wing"];
export const BODIES = ["coupe", "sedan", "hatch", "suv", "truck"];
export const GAME_COLORS = ["#E11D2E", "#FF7A00", "#FACC15", "#10B981", "#1D4ED8", "#A855F7", "#F5F5F5", "#9CA3AF", "#111827"];
const TRAFFIC_COLORS = ["#F59E0B", "#2563EB", "#7C3AED", "#16A34A", "#DC2626", "#0EA5E9", "#9333EA"];
const ROAD_DEPTH = 190; // meters of road on screen

// ---------- engine ----------

export function newGame(rand = Math.random, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  return {
    rand,
    rules: r,
    t: 0,
    timeLeft: r.startTime,
    speed: 28,
    dist: 0,
    lane: 1,
    laneX: 1,
    objects: [],
    scenery: [0.15, 0.4, 0.65, 0.9].map((z, i) => ({ z, side: i % 2 ? 1 : -1 })),
    spawnIn: 1.2,
    stripe: 0,
    crashT: 0,
    crashes: 0,
    pickups: 0,
    boosts: 0,
    boostT: 0,
    smashed: 0,
    over: false,
  };
}

export function steer(g, dir) {
  if (g.over) return;
  g.lane = Math.max(0, Math.min(2, g.lane + dir));
}

function spawnRow(g) {
  const r = g.rand;
  const blocked = r() < 0.35 ? 2 : 1;
  const lanes = [0, 1, 2].sort(() => r() - 0.5);
  for (let i = 0; i < blocked; i++) {
    const roll = r();
    g.objects.push({
      z: 1,
      lane: lanes[i],
      kind: roll < 0.7 ? "car" : roll < 0.85 ? "cone" : "barrel",
      color: TRAFFIC_COLORS[Math.floor(r() * TRAFFIC_COLORS.length)],
      body: BODIES[Math.floor(r() * BODIES.length)],
    });
  }
  const { clockChance, boostChance, boostSeconds } = g.rules;
  const bonus = r();
  if (bonus < clockChance) g.objects.push({ z: 1, lane: lanes[2], kind: "clock" });
  else if (bonus < clockChance + boostChance && boostSeconds > 0 && g.boostT <= 0) g.objects.push({ z: 1, lane: lanes[2], kind: "boost" });
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
  const target = boosting ? R.boostSpeed : Math.min(R.topSpeed, 28 + g.dist / 70);
  g.speed += (target - g.speed) * Math.min(1, dt * (boosting ? 3 : g.crashT > 0 ? 0.6 : 1.5));
  g.crashT = Math.max(0, g.crashT - dt);
  g.boostT = Math.max(0, g.boostT - dt);
  g.dist += g.speed * dt;
  g.laneX += Math.sign(g.lane - g.laneX) * Math.min(Math.abs(g.lane - g.laneX), dt * 9);

  const dz = (g.speed * dt) / ROAD_DEPTH;
  g.stripe = (g.stripe + dz * 6) % 1;
  for (const s of g.scenery) {
    s.z -= dz;
    if (s.z < 0) {
      s.z += 1;
      s.side = g.rand() < 0.5 ? -1 : 1;
    }
  }

  g.spawnIn -= dt;
  if (g.spawnIn <= 0) {
    spawnRow(g);
    g.spawnIn = (Math.max(0.5, 1.25 - g.dist / 9000) * (0.8 + g.rand() * 0.4)) / R.traffic;
  }

  const myLane = Math.round(g.laneX);
  for (const o of g.objects) {
    o.z -= dz;
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
    } else if (boosting) {
      // Boosted: plow straight through.
      o.smashed = true;
      g.smashed += 1;
      events.push("smash");
    } else if (g.crashT <= 0) {
      g.timeLeft -= R.crashSeconds;
      g.speed *= 0.45;
      g.crashT = 1.2;
      g.crashes += 1;
      events.push("crash");
    }
  }
  g.objects = g.objects.filter((o) => o.z > -0.05 && !(o.hit && (o.kind === "clock" || o.kind === "boost" || o.smashed)));

  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    g.over = true;
    events.push("over");
  }
  return events;
}

export const scoreOf = (g) => Math.floor(g.dist) + g.pickups * 100 + g.boosts * 100 + g.smashed * 50;

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

// Proportions per body, as fractions of the car's width: total height,
// the glass/roof share of it, and the roof and window-base widths.
const BODY_SHAPE = {
  coupe: { h: 0.5, cabin: 0.4, roof: 0.5, base: 0.72 },
  sedan: { h: 0.55, cabin: 0.42, roof: 0.56, base: 0.75 },
  hatch: { h: 0.6, cabin: 0.47, roof: 0.62, base: 0.77 },
  suv: { h: 0.74, cabin: 0.47, roof: 0.74, base: 0.82 },
  truck: { h: 0.72, cabin: 0.4, roof: 0.6, base: 0.64 },
};

// A car seen from behind, centered at cx, sitting on bottomY, w wide.
// `sport` is the player's car: diffuser, quad exhaust and a spoiler
// ("none", "lip" or "wing"); traffic gets a plain bumper.
export function drawCar(ctx, cx, bottomY, w, { color = "#FF4500", body = "coupe", plate = "", sport = false, spoiler = "lip" } = {}) {
  const s = BODY_SHAPE[body] || BODY_SHAPE.coupe;
  const h = w * s.h;
  const x = cx - w / 2;
  const top = bottomY - h;
  const belt = top + h * s.cabin; // where the glass meets the body
  const bodyBottom = bottomY - h * 0.1;
  const bh = bodyBottom - belt;
  const detail = w > 34; // skip the small stuff on far-away cars

  // Shadow, underbody and tires.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, bottomY, w * 0.56, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0B0B0B";
  ctx.fillRect(x + w * 0.08, bodyBottom - bh * 0.1, w * 0.84, bottomY - bodyBottom);
  for (const tx of [x + w * 0.04, x + w * 0.76]) {
    ctx.fillStyle = "#141414";
    roundRect(ctx, tx, bodyBottom - bh * 0.18, w * 0.2, bottomY - bodyBottom + bh * 0.18, w * 0.035);
    ctx.fill();
    if (detail) {
      ctx.fillStyle = "#262626";
      ctx.fillRect(tx + w * 0.02, bottomY - h * 0.075, w * 0.16, h * 0.02);
    }
  }

  // Cabin: pillars and roof in body color, curved roofline.
  const roofW = w * s.roof;
  const baseW = w * s.base;
  const ch = belt - top;
  const cabin = new Path2D();
  cabin.moveTo(cx - baseW / 2, belt + 1);
  cabin.lineTo(cx - roofW / 2, top + ch * 0.14);
  cabin.quadraticCurveTo(cx, top - ch * 0.08, cx + roofW / 2, top + ch * 0.14);
  cabin.lineTo(cx + baseW / 2, belt + 1);
  cabin.closePath();
  ctx.fillStyle = shade(color, -0.08);
  ctx.fill(cabin);

  // Rear glass: dark, tinted, with a streak of reflection.
  const inX = w * 0.045;
  const glass = new Path2D();
  glass.moveTo(cx - baseW / 2 + inX, belt - ch * 0.06);
  glass.lineTo(cx - roofW / 2 + inX * 0.8, top + ch * 0.24);
  glass.quadraticCurveTo(cx, top + ch * 0.06, cx + roofW / 2 - inX * 0.8, top + ch * 0.24);
  glass.lineTo(cx + baseW / 2 - inX, belt - ch * 0.06);
  glass.closePath();
  const tint = ctx.createLinearGradient(0, top, 0, belt);
  tint.addColorStop(0, "#1E293B");
  tint.addColorStop(1, "#05070D");
  ctx.fillStyle = tint;
  ctx.fill(glass);
  if (detail) {
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
    // Third brake light.
    ctx.fillStyle = "#EF4444";
    ctx.fillRect(cx - roofW * 0.14, top + ch * 0.17, roofW * 0.28, Math.max(1, ch * 0.04));
    // Side mirrors.
    ctx.fillStyle = shade(color, -0.15);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * (baseW / 2 + w * 0.035), belt - ch * 0.16, w * 0.045, ch * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Body: flared hips, glossy paint (light on top, darker low down).
  const shell = new Path2D();
  shell.moveTo(x + w * 0.05, bodyBottom);
  shell.lineTo(x + w * 0.005, bodyBottom - bh * 0.3);
  shell.quadraticCurveTo(x - w * 0.01, belt + bh * 0.12, x + w * 0.07, belt);
  shell.lineTo(x + w * 0.93, belt);
  shell.quadraticCurveTo(x + w * 1.01, belt + bh * 0.12, x + w * 0.995, bodyBottom - bh * 0.3);
  shell.lineTo(x + w * 0.95, bodyBottom);
  shell.closePath();
  const paint = ctx.createLinearGradient(0, belt, 0, bodyBottom);
  paint.addColorStop(0, shade(color, 0.22));
  paint.addColorStop(0.28, color);
  paint.addColorStop(1, shade(color, -0.28));
  ctx.fillStyle = paint;
  ctx.fill(shell);

  // Trunk lip line, or a tailgate crease on the truck.
  ctx.fillStyle = shade(color, -0.32);
  ctx.fillRect(x + w * 0.12, belt + bh * (body === "truck" ? 0.36 : 0.05), w * 0.76, Math.max(1, bh * 0.025));

  // Tail lights: slim LED wedges joined by a light bar, with a soft glow.
  const ty = belt + bh * 0.12;
  const lh = bh * 0.2;
  if (detail) {
    ctx.fillStyle = "rgba(239,68,68,0.16)";
    for (const gx of [x - w * 0.01, x + w * 0.72]) {
      roundRect(ctx, gx, ty - lh * 0.35, w * 0.29, lh * 1.7, lh * 0.6);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#DC2626";
  if (body === "truck") {
    for (const lx of [x + w * 0.02, x + w * 0.9]) {
      roundRect(ctx, lx, ty - lh * 0.2, w * 0.08, lh * 2.2, w * 0.015);
      ctx.fill();
    }
  } else {
    for (const side of [-1, 1]) {
      const o = cx + side * w * 0.47; // outer edge
      const i = cx + side * w * 0.23; // inner edge
      ctx.beginPath();
      ctx.moveTo(o, ty);
      ctx.lineTo(i, ty + lh * 0.18);
      ctx.lineTo(i + side * w * 0.015, ty + lh);
      ctx.lineTo(o - side * w * 0.02, ty + lh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(cx - w * 0.23, ty + lh * 0.3, w * 0.46, Math.max(1, lh * 0.2));
  }
  if (detail) {
    ctx.fillStyle = "#FCA5A5";
    ctx.fillRect(x + w * 0.05, ty + lh * 0.05, w * 0.16, Math.max(1, lh * 0.12));
    ctx.fillRect(x + w * 0.79, ty + lh * 0.05, w * 0.16, Math.max(1, lh * 0.12));
  }

  // Plate.
  const pw = w * 0.27;
  const ph = bh * 0.2;
  const py = belt + bh * (body === "truck" ? 0.5 : 0.42);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, cx - pw / 2 - w * 0.012, py - w * 0.01, pw + w * 0.024, ph + w * 0.02, w * 0.02);
  ctx.fill();
  ctx.fillStyle = "#F8FAFC";
  roundRect(ctx, cx - pw / 2, py, pw, ph, w * 0.012);
  ctx.fill();
  if (plate && w > 40) {
    ctx.fillStyle = "#111";
    ctx.font = `800 ${Math.max(6, ph * 0.66)}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(plate.slice(0, 9).toUpperCase(), cx, py + ph / 2 + 0.5, pw * 0.92);
  }

  // Bumper: a black diffuser with fins and quad tips on your car; a plain
  // lower bumper with one tip on traffic.
  const dy = bodyBottom - bh * 0.22;
  if (sport) {
    ctx.fillStyle = "#0F0F0F";
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, dy);
    ctx.lineTo(x + w * 0.9, dy);
    ctx.lineTo(x + w * 0.86, bodyBottom + h * 0.02);
    ctx.lineTo(x + w * 0.14, bodyBottom + h * 0.02);
    ctx.closePath();
    ctx.fill();
    if (detail) {
      ctx.fillStyle = "#2A2A2A";
      for (let f = 0; f < 5; f++) ctx.fillRect(cx - w * 0.12 + f * w * 0.06, dy + bh * 0.04, Math.max(1, w * 0.012), bh * 0.2);
    }
    for (const ex of [0.2, 0.29, 0.71, 0.8]) exhaust(ctx, x + w * ex, bodyBottom - bh * 0.07, w * 0.036);
  } else {
    ctx.fillStyle = shade(color, -0.38);
    ctx.fillRect(x + w * 0.1, dy + bh * 0.08, w * 0.8, bh * 0.16);
    exhaust(ctx, x + w * 0.24, bodyBottom - bh * 0.04, w * 0.028);
  }

  // Spoiler, on your car.
  if (sport && spoiler === "wing" && body !== "truck") {
    const wy = belt - h * 0.17;
    ctx.fillStyle = "#151515";
    for (const side of [-1, 1]) ctx.fillRect(cx + side * w * 0.24 - w * 0.015, wy, w * 0.03, belt - wy + bh * 0.04);
    roundRect(ctx, x + w * 0.02, wy - h * 0.04, w * 0.96, h * 0.055, h * 0.015);
    ctx.fill();
    ctx.fillStyle = shade(color, -0.1);
    ctx.fillRect(x + w * 0.02, wy - h * 0.04, w * 0.96, Math.max(1, h * 0.012));
    ctx.fillStyle = "#151515";
    ctx.fillRect(x + w * 0.01, wy - h * 0.07, w * 0.025, h * 0.1);
    ctx.fillRect(x + w * 0.965, wy - h * 0.07, w * 0.025, h * 0.1);
  } else if (sport && spoiler === "lip") {
    ctx.fillStyle = "#151515";
    if (body === "hatch" || body === "suv") {
      roundRect(ctx, cx - roofW * 0.56, top + ch * 0.02, roofW * 1.12, ch * 0.1, ch * 0.04);
    } else {
      roundRect(ctx, x + w * 0.16, belt - h * 0.035, w * 0.68, h * 0.045, h * 0.02);
    }
    ctx.fill();
  }
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

export function drawGame(ctx, W, H, g, me, art = {}) {
  const y0 = H * 0.3;
  const yPlayer = H * 0.86;
  const hw0 = W * 0.03;
  const hwB = W * 0.52;
  const yOf = (z) => y0 + (yPlayer - y0) * Math.pow(Math.max(0, 1 - z), 2.2);
  const hwOf = (y) => hw0 + ((hwB - hw0) * (y - y0)) / (yPlayer - y0);
  const laneXAt = (lane, y) => W / 2 + (lane - 1) * hwOf(y) * 0.64;

  // Sky and sand.
  const sky = ctx.createLinearGradient(0, 0, 0, y0);
  sky.addColorStop(0, "#7DD3FC");
  sky.addColorStop(1, "#E0F2FE");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, y0);
  ctx.fillStyle = "#F3D58B";
  ctx.fillRect(0, y0, W, H - y0);

  // Road.
  ctx.fillStyle = "#9CA3AF";
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

  // Cacti beside the road.
  for (const s of [...g.scenery].sort((a, b) => b.z - a.z)) {
    const y = yOf(s.z);
    const size = Math.max(6, hwOf(y) * 0.28);
    ctx.font = `${size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("🌵", W / 2 + s.side * (hwOf(y) * 1.25 + size * 0.4), y);
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
    // Blue exhaust flames out the back.
    const flame = 0.8 + Math.sin(g.t * 40) * 0.2;
    for (const side of [-1, 1]) {
      const fx = myX + side * myW * 0.255;
      const fy = yPlayer + H * 0.02 - myW * 0.06;
      const len = myW * 0.32 * flame;
      const fl = ctx.createLinearGradient(fx, fy, fx, fy + len);
      fl.addColorStop(0, "rgba(255,255,255,0.95)");
      fl.addColorStop(0.35, "rgba(56,189,248,0.9)");
      fl.addColorStop(1, "rgba(29,78,216,0)");
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.moveTo(fx - myW * 0.06, fy);
      ctx.lineTo(fx + myW * 0.06, fy);
      ctx.lineTo(fx, fy + len);
      ctx.closePath();
      ctx.fill();
    }
  }

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
}

