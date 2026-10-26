// Drawing Drift King (driftEngine.js): an Atlanta-at-dusk skyline far
// below, the road as a floating slab with painted edges, tyre marks, drift
// smoke, and your car (the same top-down car as Park Up).

import { ROAD_W, CAR } from "./driftEngine.js";
import { drawTopCar } from "./parkDraw.js";

const DEPTH = 26; // how thick the road slab looks

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// The sky and skyline, drawn once per screen size.
export function renderSky(width, height, dpr) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(width * dpr);
  cv.height = Math.round(height * dpr);
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#070B1E");
  sky.addColorStop(0.45, "#1B1440");
  sky.addColorStop(0.75, "#5A2453");
  sky.addColorStop(1, "#D9663A");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const r = rng(99);
  // Stars, mostly up top.
  for (let i = 0; i < 90; i++) {
    const y = Math.pow(r(), 2) * height * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
    ctx.fillRect(r() * width, y, r() < 0.15 ? 2 : 1, r() < 0.15 ? 2 : 1);
  }
  // Two layers of skyline, the near one darker with lit windows.
  for (const [base, tall, color, lit] of [
    [0.8, 0.25, "#2B1638", false],
    [0.9, 0.3, "#120A1C", true],
  ]) {
    let x = -10;
    while (x < width + 10) {
      const w = 18 + r() * 34;
      const h = height * (0.05 + r() * tall);
      const top = height * base - h + height * 0.12;
      ctx.fillStyle = color;
      ctx.fillRect(x, top, w, height - top);
      if (r() < 0.25) ctx.fillRect(x + w / 2 - 1, top - 14, 2, 14); // antenna
      if (lit) {
        for (let wy = top + 6; wy < height - 4; wy += 9) {
          for (let wx = x + 4; wx < x + w - 4; wx += 7) {
            if (r() < 0.32) {
              ctx.fillStyle = r() < 0.8 ? "rgba(255,206,120,0.75)" : "rgba(120,190,255,0.7)";
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
        ctx.fillStyle = color;
      }
      x += w + r() * 6;
    }
  }
  // Haze over the city.
  const haze = ctx.createLinearGradient(0, height * 0.7, 0, height);
  haze.addColorStop(0, "rgba(217,102,58,0)");
  haze.addColorStop(1, "rgba(217,102,58,0.25)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  return cv;
}

// The road's middle line, start to end (each piece joins the next).
function trace(ctx, road, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(road[0].x1, road[0].y1 + dy);
  for (const s of road) ctx.lineTo(s.x2, s.y2 + dy);
}

// Smoke puffs (visual only, kept by the game screen).
export function addSmoke(smoke, g, slip) {
  if (slip < 0.2 || smoke.length > 160) return;
  const back = CAR.h * 0.38;
  const sx = g.x - Math.sin(g.heading) * back;
  const sy = g.y + Math.cos(g.heading) * back;
  for (const side of [-1, 1]) {
    const ox = Math.cos(g.heading) * side * CAR.w * 0.42;
    const oy = Math.sin(g.heading) * side * CAR.w * 0.42;
    smoke.push({ x: sx + ox, y: sy + oy, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 20, life: 0, max: 0.6 + Math.random() * 0.5, size: 5 + slip * 10 });
  }
}

export function updateSmoke(smoke, dt) {
  for (const p of smoke) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size += 18 * dt;
  }
  for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].life >= smoke[i].max) smoke.splice(i, 1);
}

// One frame. cam: { x, y } world point at the screen's (w/2, h * 0.68).
export function drawDrift(ctx, size, sky, g, cam, smoke, color = "#1D4ED8") {
  const { w, h } = size;
  const scale = Math.min(w / 360, 1.5);
  ctx.drawImage(sky, 0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h * 0.68);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  // Your car falling: under the road, shrinking into the haze.
  const falling = g.state === "falling" || g.state === "over";
  const drawCar = (yDrop = 0, shrink = 1, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(g.x, g.y + yDrop);
    ctx.scale(shrink, shrink);
    drawTopCar(ctx, { x: 0, y: 0, heading: g.heading, w: CAR.w, h: CAR.h, color, kind: "coupe" }, { head: true, brake: falling });
    ctx.restore();
  };
  if (falling) {
    const t = Math.min(1, g.fall / 0.9);
    drawCar(DEPTH + t * t * 260, 1 - t * 0.55, 1 - t * 0.7);
  }

  ctx.lineJoin = "miter";
  ctx.miterLimit = 4;
  ctx.lineCap = "square";
  // The slab's side: the road traced again lower down, darker.
  for (let d = DEPTH; d > 0; d -= 2) {
    trace(ctx, g.road, d);
    ctx.strokeStyle = d > DEPTH - 3 ? "#0E1018" : d > DEPTH / 2 ? "#1E2230" : "#2A2F40";
    ctx.lineWidth = ROAD_W;
    ctx.stroke();
  }
  // Glow strip under the edge.
  trace(ctx, g.road, DEPTH - 2);
  ctx.strokeStyle = "rgba(0,128,240,0.35)";
  ctx.lineWidth = ROAD_W + 2;
  ctx.setLineDash([2, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Top: white edges, asphalt, a dashed middle line.
  trace(ctx, g.road);
  ctx.strokeStyle = "#E8E8E8";
  ctx.lineWidth = ROAD_W;
  ctx.stroke();
  trace(ctx, g.road);
  ctx.strokeStyle = "#3B3F4A";
  ctx.lineWidth = ROAD_W - 7;
  ctx.stroke();
  trace(ctx, g.road);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.lineCap = "butt";
  ctx.setLineDash([14, 14]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tyre marks.
  ctx.fillStyle = "rgba(10,10,12,0.45)";
  const back = CAR.h * 0.36;
  for (const s of g.skids) {
    const sx = s.x - Math.sin(s.a) * back;
    const sy = s.y + Math.cos(s.a) * back;
    for (const side of [-1, 1]) {
      ctx.fillRect(sx + Math.cos(s.a) * side * CAR.w * 0.38 - 1.5, sy + Math.sin(s.a) * side * CAR.w * 0.38 - 1.5, 3, 3);
    }
  }

  for (const p of smoke) {
    const a = 1 - p.life / p.max;
    ctx.fillStyle = `rgba(225,225,232,${0.32 * a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!falling) drawCar();
  ctx.restore();
}
