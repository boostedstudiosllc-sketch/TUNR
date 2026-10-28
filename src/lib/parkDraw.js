// Drawing Park Up (parkEngine.js): the lot from above (asphalt, worn stall
// lines, grass islands with bushes, parked cars), your car with its lights,
// the yellow spot, and the steering wheel and pedals. Canvas 2D, no images.

import { WORLD, CAR, islandBox } from "./parkEngine.js";

// A steady random sequence, so a level's asphalt and bushes look the same
// every time.
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const seedOf = (text) => [...String(text)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
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

// ---------- cars ----------

// A car from above, nose up in its own frame. kind: sedan | coupe | suv |
// truck. lights: { brake, reverse, head }.
export function drawTopCar(ctx, c, lights = {}) {
  const { w, h } = c;
  const kind = c.kind || "sedan";
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.heading);

  // Shadow on the ground.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, -w / 2, -h / 2, w, h, 7);
  ctx.fill();
  ctx.restore();

  // Tyres peeking out at the corners.
  ctx.fillStyle = "#111";
  for (const [tx, ty] of [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]]) {
    roundRect(ctx, tx * (w / 2) - (tx < 0 ? 2 : 3), ty * h - 6, 5, 12, 2);
    ctx.fill();
  }

  // Body: rounded, darker at the sides, a highlight down the middle.
  const side = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  side.addColorStop(0, shade(c.color, -0.45));
  side.addColorStop(0.18, shade(c.color, -0.05));
  side.addColorStop(0.5, shade(c.color, 0.22));
  side.addColorStop(0.82, shade(c.color, -0.05));
  side.addColorStop(1, shade(c.color, -0.45));
  ctx.fillStyle = side;
  roundRect(ctx, -w / 2, -h / 2, w, h, kind === "truck" ? 5 : 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  const glass = (y1, y2, inset1, inset2) => {
    const g = ctx.createLinearGradient(0, y1, 0, y2);
    g.addColorStop(0, "#1b2733");
    g.addColorStop(0.55, "#2e4152");
    g.addColorStop(1, "#121a22");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + inset1, y1);
    ctx.lineTo(w / 2 - inset1, y1);
    ctx.lineTo(w / 2 - inset2, y2);
    ctx.lineTo(-w / 2 + inset2, y2);
    ctx.closePath();
    ctx.fill();
    // A streak of sky reflected in it.
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + inset1 + 4, y1 + 2);
    ctx.lineTo(-w / 2 + inset2 + 8, y2 - 1);
    ctx.stroke();
  };

  const roofFrom = kind === "truck" ? -0.2 : kind === "suv" ? -0.16 : -0.1;
  const roofTo = kind === "truck" ? 0.04 : kind === "suv" ? 0.3 : kind === "coupe" ? 0.16 : 0.2;
  const wsFrom = roofFrom - (kind === "truck" ? 0.1 : 0.15);
  // Windshield, roof, rear window.
  glass(wsFrom * h, roofFrom * h, 5, 3);
  const roof = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  roof.addColorStop(0, shade(c.color, -0.25));
  roof.addColorStop(0.5, shade(c.color, 0.3));
  roof.addColorStop(1, shade(c.color, -0.25));
  ctx.fillStyle = roof;
  roundRect(ctx, -w / 2 + 3.5, roofFrom * h, w - 7, (roofTo - roofFrom) * h, 4);
  ctx.fill();
  if (kind === "suv") {
    ctx.strokeStyle = "rgba(20,20,20,0.6)";
    ctx.lineWidth = 1.2;
    for (const rx of [-w / 2 + 6, w / 2 - 6]) {
      ctx.beginPath();
      ctx.moveTo(rx, roofFrom * h + 3);
      ctx.lineTo(rx, roofTo * h - 3);
      ctx.stroke();
    }
  }
  if (kind === "truck") {
    // The bed: open, ribbed, behind the cab.
    ctx.fillStyle = shade(c.color, -0.55);
    roundRect(ctx, -w / 2 + 3, 0.1 * h, w - 6, 0.36 * h, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = -w / 2 + 3 + ((w - 6) * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, 0.12 * h);
      ctx.lineTo(x, 0.44 * h);
      ctx.stroke();
    }
  } else {
    glass(roofTo * h, (roofTo + 0.1) * h, 3.5, 5.5);
  }
  // Hood crease lines.
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 0.8;
  for (const hx of [-w * 0.18, w * 0.18]) {
    ctx.beginPath();
    ctx.moveTo(hx, -h / 2 + 5);
    ctx.lineTo(hx * 0.8, wsFrom * h - 2);
    ctx.stroke();
  }
  // Mirrors.
  ctx.fillStyle = shade(c.color, -0.35);
  for (const mx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(mx * (w / 2 + 1.5), (wsFrom + 0.06) * h, 2.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headlights (front) and tail lights (rear).
  ctx.fillStyle = lights.head ? "#FFF6D5" : "#D9DDE2";
  for (const lx of [-1, 1]) {
    roundRect(ctx, lx > 0 ? w / 2 - 8 : -w / 2 + 2, -h / 2 + 1.2, 6, 3, 1.4);
    ctx.fill();
  }
  if (lights.head) {
    const beam = ctx.createRadialGradient(0, -h / 2, 2, 0, -h / 2 - 30, 40);
    beam.addColorStop(0, "rgba(255,246,213,0.28)");
    beam.addColorStop(1, "rgba(255,246,213,0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2 + 12, -h / 2 - 46);
    ctx.lineTo(-w / 2 - 12, -h / 2 - 46);
    ctx.closePath();
    ctx.fill();
  }
  for (const lx of [-1, 1]) {
    ctx.fillStyle = lights.brake ? "#FF2A2A" : "#8E1B1B";
    roundRect(ctx, lx > 0 ? w / 2 - 8 : -w / 2 + 2, h / 2 - 4.2, 6, 3, 1.4);
    ctx.fill();
    if (lights.reverse) {
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, lx > 0 ? w / 2 - 11 : -w / 2 + 8, h / 2 - 4, 3, 2.6, 1);
      ctx.fill();
    }
  }
  if (lights.brake || lights.reverse) {
    const glow = ctx.createRadialGradient(0, h / 2, 2, 0, h / 2 + 8, 26);
    glow.addColorStop(0, lights.reverse ? "rgba(255,255,255,0.3)" : "rgba(255,40,40,0.35)");
    glow.addColorStop(1, "rgba(255,40,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-w, h / 2 - 6, w * 2, 34);
  }
  ctx.restore();
}

// ---------- the lot ----------

function drawBush(ctx, r, x, y, size) {
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * size * 0.6;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d;
    const br = size * (0.45 + r() * 0.35);
    const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
    g.addColorStop(0, "#6FA84A");
    g.addColorStop(0.55, "#3D7A26");
    g.addColorStop(1, "#1E4612");
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(bx + 2, by + 3, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIsland(ctx, r, isl) {
  const { x, y, w, h } = isl;
  // Concrete curb, then grass.
  ctx.fillStyle = "#BDBDB5";
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  const grass = ctx.createLinearGradient(x, y, x, y + h);
  grass.addColorStop(0, "#5B8F3A");
  grass.addColorStop(1, "#4A7C2E");
  ctx.fillStyle = grass;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 10);
  ctx.fill();
  // Blades of grass.
  for (let i = 0; i < (w * h) / 18; i++) {
    ctx.fillStyle = r() < 0.5 ? "rgba(120,170,80,0.35)" : "rgba(40,80,25,0.35)";
    ctx.fillRect(x + 4 + r() * (w - 8), y + 4 + r() * (h - 8), 1, 2);
  }
  // Bushes: along a hedge, or a few clumps.
  const step = isl.hedge ? 18 : 34;
  for (let bx = x + 14; bx < x + w - 8; bx += step + r() * 8) {
    for (let by = y + 14; by < y + h - 8; by += step + r() * 8) {
      if (isl.hedge || r() < 0.55) drawBush(ctx, r, bx, by, isl.hedge ? 13 : 12);
    }
  }
}

function drawStallLines(ctx, r, s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.heading);
  ctx.strokeStyle = "rgba(240,240,236,0.85)";
  ctx.lineWidth = 2.4;
  ctx.setLineDash([10 + r() * 6, 2 + r() * 3]); // worn paint
  for (const lx of [-s.w / 2, s.w / 2]) {
    ctx.beginPath();
    ctx.moveTo(lx, -s.h / 2);
    ctx.lineTo(lx, s.h / 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // An oil stain where cars sit.
  ctx.fillStyle = "rgba(20,20,20,0.12)";
  ctx.beginPath();
  ctx.ellipse((r() - 0.5) * 6, (r() - 0.5) * 20, 8 + r() * 6, 12 + r() * 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Everything that doesn't move, drawn once per level at the given scale.
export function renderLot(level, scale) {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(WORLD.w * scale);
  cv.height = Math.ceil(WORLD.h * scale);
  const ctx = cv.getContext("2d");
  ctx.scale(scale, scale);
  const r = rng(seedOf(level.id));

  ctx.fillStyle = "#5D6064";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  // Asphalt grain.
  for (let i = 0; i < 9000; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(30,30,30,${0.15 + r() * 0.2})` : `rgba(200,200,200,${0.06 + r() * 0.1})`;
    ctx.fillRect(r() * WORLD.w, r() * WORLD.h, 1 + r(), 1 + r());
  }
  // Worn patches (soft, uneven) and cracks.
  for (let i = 0; i < 5; i++) {
    const px = r() * WORLD.w;
    const py = r() * WORLD.h;
    const pr = 30 + r() * 50;
    const patch = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr);
    patch.addColorStop(0, "rgba(38,40,43,0.22)");
    patch.addColorStop(1, "rgba(38,40,43,0)");
    ctx.fillStyle = patch;
    ctx.beginPath();
    ctx.ellipse(px, py, pr, pr * (0.5 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(25,25,25,0.35)";
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 8; i++) {
    let x = r() * WORLD.w;
    let y = r() * WORLD.h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 24;
      y += (r() - 0.5) * 24;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const s of level.stalls) drawStallLines(ctx, r, s);
  if (level.curb) {
    // Sidewalk past the curb, with a painted curb edge.
    ctx.fillStyle = "#A8A8A0";
    ctx.fillRect(level.curb.x, 0, WORLD.w - level.curb.x, WORLD.h);
    ctx.fillStyle = "#E3C341";
    ctx.fillRect(level.curb.x, 0, 3, WORLD.h);
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    for (let y = 0; y < WORLD.h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(level.curb.x + 3, y);
      ctx.lineTo(WORLD.w, y);
      ctx.stroke();
    }
  }
  for (const isl of level.islands) drawIsland(ctx, r, isl);
  for (const c of level.cars) drawTopCar(ctx, c);
  // The lot's edge.
  ctx.strokeStyle = "#BDBDB5";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WORLD.w - 4, WORLD.h - 4);
  return cv;
}

// The yellow spot, pulsing; an arrow shows which way to face if it matters.
export function drawSpot(ctx, level, t, done) {
  const s = level.spot;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.heading);
  const pulse = done ? 1 : 0.55 + 0.25 * Math.sin(t * 4);
  ctx.fillStyle = `rgba(250,204,21,${0.28 * pulse})`;
  ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
  ctx.strokeStyle = `rgba(250,204,21,${0.6 + 0.4 * pulse})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(-s.w / 2 + 1.5, -s.h / 2 + 1.5, s.w - 3, s.h - 3);
  ctx.restore();
  if (level.mustFace !== undefined && !done) {
    // "Nose this way" chevrons.
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(level.mustFace);
    ctx.strokeStyle = "rgba(250,204,21,0.9)";
    ctx.lineWidth = 3;
    for (const dy of [-10, 4]) {
      ctx.beginPath();
      ctx.moveTo(-8, dy + 8);
      ctx.lineTo(0, dy);
      ctx.lineTo(8, dy + 8);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A yellow arrow by your car pointing to the spot, while you're far from it.
export function drawPointer(ctx, g, level) {
  const dx = level.spot.x - g.x;
  const dy = level.spot.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 110) return;
  const a = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(g.x + Math.cos(a) * 58, g.y + Math.sin(a) * 58);
  ctx.rotate(a);
  ctx.fillStyle = "rgba(250,204,21,0.92)";
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The whole frame: lot, spot, your car, pointer.
export function drawPark(ctx, view, lot, g, input, t) {
  const { scale, ox, oy } = view;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.drawImage(lot, 0, 0, WORLD.w * scale, WORLD.h * scale);
  ctx.scale(scale, scale);
  drawSpot(ctx, g.level, t, g.state === "parked");
  // Your car's paint and shape (from your garage), on the same footprint.
  const color = view.color || "#1D4ED8";
  drawTopCar(
    ctx,
    { x: g.x, y: g.y, heading: g.heading, w: CAR.w, h: CAR.h, color, kind: view.kind || "coupe" },
    { head: true, brake: Boolean(input.brake && g.speed >= 0) || g.state === "parked", reverse: g.gear === "R" && g.speed < -0.5 }
  );
  if (g.state === "driving") drawPointer(ctx, g, g.level);
  ctx.restore();
}

// ---------- controls ----------

// Where the controls sit in the strip under the lot (canvas pixels).
export function controlLayout(width, top, height) {
  const r = Math.min(68, height * 0.42, width * 0.19);
  return {
    wheel: { x: Math.max(r + 16, width * 0.25), y: top + height / 2, r },
    brake: { x: width * 0.58, y: top + height / 2 - 30, w: Math.min(70, width * 0.17), h: 76 },
    gas: { x: width * 0.8, y: top + height / 2 - 52, w: Math.min(56, width * 0.14), h: 112 },
  };
}

function drawPedal(ctx, p, pressed, label) {
  ctx.save();
  const sink = pressed ? 3 : 0;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = pressed ? 2 : 8;
  ctx.shadowOffsetY = pressed ? 1 : 4;
  const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y);
  g.addColorStop(0, pressed ? "#4A4A4A" : "#3A3A3A");
  g.addColorStop(0.5, pressed ? "#5E5E5E" : "#4B4B4B");
  g.addColorStop(1, pressed ? "#3E3E3E" : "#2C2C2C");
  ctx.fillStyle = g;
  roundRect(ctx, p.x + sink, p.y + sink, p.w - sink * 2, p.h - sink * 2, 8);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = pressed ? "#3CABFD" : "rgba(0,0,0,0.7)";
  ctx.lineWidth = pressed ? 2 : 1.5;
  roundRect(ctx, p.x + sink, p.y + sink, p.w - sink * 2, p.h - sink * 2, 8);
  ctx.stroke();
  // Rubber ridges.
  ctx.strokeStyle = "rgba(15,15,15,0.85)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const rows = Math.floor((p.h - 20) / 16);
  for (let i = 0; i < rows; i++) {
    const y = p.y + 14 + i * 16 + sink;
    ctx.beginPath();
    ctx.moveTo(p.x + 12, y);
    ctx.lineTo(p.x + p.w - 12, y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.fillStyle = "rgba(230,230,230,0.75)";
  ctx.font = "700 11px 'Barlow Condensed', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, p.x + p.w / 2, p.y + p.h + 16);
}

export function drawControls(ctx, layout, state) {
  const { wheel } = layout;
  // Steering wheel.
  ctx.save();
  ctx.translate(wheel.x, wheel.y);
  ctx.rotate((state.wheelDeg * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.strokeStyle = "#1C1C1C";
  ctx.lineWidth = wheel.r * 0.24;
  ctx.beginPath();
  ctx.arc(0, 0, wheel.r * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#3A3A3A";
  ctx.lineWidth = wheel.r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, wheel.r * 0.86, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // Spokes and hub.
  ctx.fillStyle = "#262626";
  for (const a of [Math.PI / 2, Math.PI * 1.17, -Math.PI * 0.17]) {
    ctx.save();
    ctx.rotate(a);
    roundRect(ctx, -wheel.r * 0.09, 0, wheel.r * 0.18, wheel.r * 0.8, 4);
    ctx.fill();
    ctx.restore();
  }
  const hub = ctx.createRadialGradient(-4, -4, 2, 0, 0, wheel.r * 0.3);
  hub.addColorStop(0, "#4A4A4A");
  hub.addColorStop(1, "#1A1A1A");
  ctx.fillStyle = hub;
  ctx.beginPath();
  ctx.arc(0, 0, wheel.r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0080F0";
  ctx.font = `900 ${Math.round(wheel.r * 0.26)}px 'Barlow Condensed', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", 0, 1);
  // The top marker, so you can see how far it's turned.
  ctx.fillStyle = "#3CABFD";
  roundRect(ctx, -4, -wheel.r * 0.98, 8, wheel.r * 0.2, 3);
  ctx.fill();
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  drawPedal(ctx, layout.brake, state.brake, "BRAKE · REVERSE");
  drawPedal(ctx, layout.gas, state.gas, "GAS");
}
