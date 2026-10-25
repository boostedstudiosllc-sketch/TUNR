// TUNR Rush: the game engine and drawing, kept apart from React so it can be
// tested in plain Node. A 3-lane desert highway in pseudo-3D (like the old
// flash taxi games): dodge traffic, cones and barrels, grab ⏱ for time.
// The server re-checks every run (060_tunr_rush.sql); its calls are in
// rush.js. No imports here, so it runs in plain Node for the tests.

export const GOAL_METERS = 3000;
export const START_TIME = 60;
export const MAX_SPEED = 85; // m/s; the server allows up to 90
export const BODIES = ["coupe", "sedan", "hatch", "suv", "truck"];
export const GAME_COLORS = ["#E11D2E", "#FF7A00", "#FACC15", "#10B981", "#1D4ED8", "#A855F7", "#F5F5F5", "#9CA3AF", "#111827"];
const TRAFFIC_COLORS = ["#F59E0B", "#2563EB", "#7C3AED", "#16A34A", "#DC2626", "#0EA5E9", "#9333EA"];
const ROAD_DEPTH = 190; // meters of road on screen

// ---------- engine ----------

export function newGame(rand = Math.random) {
  return {
    rand,
    t: 0,
    timeLeft: START_TIME,
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
      body: BODIES[Math.floor(r() * 3)],
      num: 1 + Math.floor(r() * 49),
    });
  }
  if (r() < 0.22) g.objects.push({ z: 1, lane: lanes[2], kind: "clock" });
}

// Advance the game by dt seconds. Returns events for sounds/vibration.
export function step(g, dt) {
  const events = [];
  if (g.over) return events;
  dt = Math.min(dt, 0.05);
  g.t += dt;
  g.timeLeft -= dt;
  const target = Math.min(MAX_SPEED, 28 + g.dist / 70);
  g.speed += (target - g.speed) * Math.min(1, dt * (g.crashT > 0 ? 0.6 : 1.5));
  g.crashT = Math.max(0, g.crashT - dt);
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
    g.spawnIn = Math.max(0.5, 1.25 - g.dist / 9000) * (0.8 + g.rand() * 0.4);
  }

  const myLane = Math.round(g.laneX);
  for (const o of g.objects) {
    o.z -= dz;
    if (o.hit || o.z > 0.06 || o.z < -0.02 || o.lane !== myLane) continue;
    o.hit = true;
    if (o.kind === "clock") {
      g.timeLeft += 3;
      g.pickups += 1;
      events.push("pickup");
    } else if (g.crashT <= 0) {
      g.timeLeft -= 4;
      g.speed *= 0.45;
      g.crashT = 1.2;
      g.crashes += 1;
      events.push("crash");
    }
  }
  g.objects = g.objects.filter((o) => o.z > -0.05 && !(o.hit && o.kind === "clock"));

  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    g.over = true;
    events.push("over");
  }
  return events;
}

export const scoreOf = (g) => Math.floor(g.dist) + g.pickups * 100;

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

const BODY_SHAPE = {
  coupe: { h: 0.56, cabin: 0.42, top: 0.5 },
  sedan: { h: 0.62, cabin: 0.45, top: 0.56 },
  hatch: { h: 0.66, cabin: 0.5, top: 0.62 },
  suv: { h: 0.8, cabin: 0.52, top: 0.68 },
  truck: { h: 0.76, cabin: 0.44, top: 0.6 },
};

// A car seen from behind, centered at cx, sitting on bottomY, w wide.
export function drawCar(ctx, cx, bottomY, w, { color = "#FF4500", body = "coupe", plate = "", num = null } = {}) {
  const s = BODY_SHAPE[body] || BODY_SHAPE.coupe;
  const h = w * s.h;
  const x = cx - w / 2;
  const top = bottomY - h;
  const lowerTop = bottomY - h * (1 - s.cabin);

  // Shadow and tires.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, bottomY, w * 0.55, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#151515";
  roundRect(ctx, x + w * 0.04, bottomY - h * 0.2, w * 0.2, h * 0.22, w * 0.03);
  ctx.fill();
  roundRect(ctx, x + w * 0.76, bottomY - h * 0.2, w * 0.2, h * 0.22, w * 0.03);
  ctx.fill();

  // Cabin (roof and rear window).
  const cabW0 = w * (body === "truck" ? 0.62 : 0.78);
  const cabW1 = cabW0 * (body === "suv" ? 0.9 : 0.72);
  ctx.fillStyle = shade(color, -0.12);
  ctx.beginPath();
  ctx.moveTo(cx - cabW0 / 2, lowerTop + 1);
  ctx.lineTo(cx - cabW1 / 2, top);
  ctx.lineTo(cx + cabW1 / 2, top);
  ctx.lineTo(cx + cabW0 / 2, lowerTop + 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1E3A8A";
  const inset = w * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx - cabW0 / 2 + inset, lowerTop - h * 0.02);
  ctx.lineTo(cx - cabW1 / 2 + inset * 0.7, top + h * 0.07);
  ctx.lineTo(cx + cabW1 / 2 - inset * 0.7, top + h * 0.07);
  ctx.lineTo(cx + cabW0 / 2 - inset, lowerTop - h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(cx - cabW1 / 2 + inset, top + h * 0.09, cabW1 * 0.25, h * 0.04);

  // Lower body.
  ctx.fillStyle = color;
  roundRect(ctx, x, lowerTop, w, bottomY - h * 0.12 - lowerTop, w * 0.08);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.2);
  ctx.fillRect(x + w * 0.03, bottomY - h * 0.2, w * 0.94, h * 0.08);
  if (body === "truck") {
    ctx.fillStyle = shade(color, -0.3);
    ctx.fillRect(x + w * 0.08, lowerTop + h * 0.04, w * 0.84, h * 0.03);
  }

  // Tail lights.
  ctx.fillStyle = "#EF4444";
  roundRect(ctx, x + w * 0.04, lowerTop + h * 0.07, w * 0.2, h * 0.1, w * 0.02);
  ctx.fill();
  roundRect(ctx, x + w * 0.76, lowerTop + h * 0.07, w * 0.2, h * 0.1, w * 0.02);
  ctx.fill();

  // Plate.
  const pw = w * 0.34;
  const ph = h * 0.13;
  ctx.fillStyle = "#F8FAFC";
  roundRect(ctx, cx - pw / 2, lowerTop + h * 0.2, pw, ph, w * 0.015);
  ctx.fill();
  if (plate && w > 40) {
    ctx.fillStyle = "#111";
    ctx.font = `800 ${Math.max(6, ph * 0.62)}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(plate.slice(0, 9).toUpperCase(), cx, lowerTop + h * 0.2 + ph / 2 + 0.5, pw * 0.92);
  }

  // Traffic numbers on the roof, like the old taxi games.
  if (num != null && w > 24) {
    ctx.fillStyle = "#FDE047";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(1, w * 0.03);
    ctx.font = `900 ${w * 0.34}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(String(num), cx, top + h * 0.2);
    ctx.fillText(String(num), cx, top + h * 0.2);
  }
}

// Draw the whole frame. `me` is { color, body, plate }.
export function drawGame(ctx, W, H, g, me) {
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
      drawCar(ctx, x, y, w, { color: o.color, body: o.body, num: o.num });
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
    }
  }

  // You.
  const blink = g.crashT > 0 && Math.floor(g.crashT * 10) % 2 === 0;
  if (!blink) {
    drawCar(ctx, W / 2 + (g.laneX - 1) * hwOf(yPlayer) * 0.64, yPlayer + H * 0.02, W * 0.27, me);
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
  const pct = Math.min(1, g.dist / GOAL_METERS);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(W - 118, 38, 100, 6);
  ctx.fillStyle = pct >= 1 ? "#10B981" : "#FACC15";
  ctx.fillRect(W - 118, 38, 100 * pct, 6);
}

