// Egg Haul, drawn on a 2D canvas: a sunset sky, rolling hills, the road,
// distance posts, your car (in your garage car's paint) and the egg.

import { CAR, EGG, groundY, wheels, roofPoints } from "./eggEngine.js";

// Body outline, side view, nose to the right (+x), in the car's frame.
const BODY = [
  [-1.5, 0.12],
  [-1.45, -0.12],
  [1.45, -0.12],
  [1.52, 0.1],
  [1.45, 0.2],
  [0.95, 0.27],
  [0.55, 0.53],
  [-0.8, 0.55],
  [-1.2, 0.3],
];
const GLASS = [
  [0.82, 0.29],
  [0.5, 0.49],
  [-0.12, 0.5],
  [-0.12, 0.3],
];
const GLASS2 = [
  [-0.2, 0.3],
  [-0.2, 0.5],
  [-0.75, 0.5],
  [-1.05, 0.3],
];

function shade(hex, f) {
  const n = parseInt(String(hex).slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function drawEgg(ctx, run, view, w, h, look) {
  const c = run.car;
  const ppm = view.ppm;
  const sx = (x) => (x - view.x) * ppm + w / 2;
  const sy = (y) => h * 0.58 - (y - view.y) * ppm;

  // Sky and sun.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1e1b4b");
  sky.addColorStop(0.45, "#7c3aed");
  sky.addColorStop(0.75, "#f97316");
  sky.addColorStop(1, "#fbbf24");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,236,170,0.9)";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.42, Math.min(w, h) * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Far hills, moving slower than the road.
  for (const [speed, color, height, wave] of [
    [0.15, "#4c1d95", 0.34, 0.004],
    [0.35, "#6d28d9", 0.24, 0.007],
  ]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let px = 0; px <= w + 8; px += 8) {
      const wx = px + view.x * ppm * speed;
      ctx.lineTo(px, h * (1 - height) + Math.sin(wx * wave) * h * 0.05 + Math.sin(wx * wave * 2.7) * h * 0.025);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }

  // The ground: dirt with a grass edge.
  const left = view.x - w / 2 / ppm - 1;
  const right = view.x + w / 2 / ppm + 1;
  const pts = [];
  for (let x = left; x <= right; x += 0.4) pts.push([sx(x), sy(groundY(run.seed, x))]);
  const dirt = ctx.createLinearGradient(0, h * 0.4, 0, h);
  dirt.addColorStop(0, "#7c4a21");
  dirt.addColorStop(1, "#3b2210");
  ctx.fillStyle = dirt;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], h);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(pts[pts.length - 1][0], h);
  ctx.fill();
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = Math.max(4, ppm * 0.22);
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = Math.max(1.5, ppm * 0.05);
  ctx.stroke();

  // Distance posts every 50 m, and your best.
  ctx.font = `900 ${Math.round(ppm * 0.42)}px 'Barlow Condensed', Arial, sans-serif`;
  ctx.textAlign = "center";
  for (let m = Math.ceil(left / 50) * 50; m <= right; m += 50) {
    if (m <= 0) continue;
    const gx = sx(m);
    const gy = sy(groundY(run.seed, m));
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(gx - 2, gy - ppm * 1.6, 4, ppm * 1.6);
    ctx.fillStyle = "#111827";
    ctx.fillRect(gx - ppm * 0.6, gy - ppm * 2.1, ppm * 1.2, ppm * 0.55);
    ctx.fillStyle = "#facc15";
    ctx.fillText(`${m} m`, gx, gy - ppm * 1.68);
  }
  if (view.best > 5 && view.best >= left && view.best <= right) {
    const gx = sx(view.best);
    const gy = sy(groundY(run.seed, view.best));
    ctx.fillStyle = "#fff";
    ctx.fillRect(gx - 1.5, gy - ppm * 2.4, 3, ppm * 2.4);
    ctx.fillStyle = "#0080F0";
    ctx.beginPath();
    ctx.moveTo(gx + 1.5, gy - ppm * 2.4);
    ctx.lineTo(gx + ppm * 1.1, gy - ppm * 2.15);
    ctx.lineTo(gx + 1.5, gy - ppm * 1.9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("BEST", gx, gy - ppm * 2.55);
  }

  // The car.
  const paint = look?.color || "#1D4ED8";
  const toScreen = ([lx, ly]) => {
    const cs = Math.cos(c.a);
    const sn = Math.sin(c.a);
    return [sx(c.x + lx * cs - ly * sn), sy(c.y + lx * sn + ly * cs)];
  };
  const poly = (list, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    list.map(toScreen).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  // Shadow under it.
  const gy = sy(groundY(run.seed, c.x));
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(sx(c.x), gy + 2, ppm * 1.5, ppm * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wheels behind the body's lower edge.
  for (const wh of wheels(c)) {
    const x = sx(wh.x);
    const y = sy(wh.y);
    const r = CAR.wheelR * ppm;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -c.spin + (k / 5) * Math.PI * 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55);
    }
    ctx.stroke();
  }
  poly(BODY, paint);
  // A darker lower half, for shape.
  poly(
    [
      [-1.45, -0.12],
      [1.45, -0.12],
      [1.5, 0.04],
      [-1.5, 0.04],
    ],
    shade(paint, 0.7)
  );
  poly(GLASS, "#0f172a");
  poly(GLASS2, "#0f172a");
  // Lights.
  poly(
    [
      [1.38, 0.1],
      [1.5, 0.1],
      [1.46, 0.19],
      [1.3, 0.2],
    ],
    "#fef9c3"
  );
  poly(
    [
      [-1.5, 0.08],
      [-1.38, 0.08],
      [-1.38, 0.2],
      [-1.47, 0.2],
    ],
    "#ef4444"
  );
  // The egg tray on the roof.
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(2, ppm * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  roofPoints(c).forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
  ctx.stroke();

  // The egg.
  const e = run.egg;
  const ex = sx(e.x);
  const ey = sy(e.y);
  if (e.broken && !e.onRoof && run.state === "over") {
    // Splat.
    ctx.fillStyle = "#fffbeb";
    ctx.beginPath();
    ctx.ellipse(ex, ey + EGG.r * ppm * 0.5, EGG.r * ppm * 1.6, EGG.r * ppm * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(ex, ey + EGG.r * ppm * 0.35, EGG.r * ppm * 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(-e.roll);
  const g = ctx.createRadialGradient(-EGG.r * ppm * 0.3, -EGG.r * ppm * 0.4, 1, 0, 0, EGG.r * ppm * 1.2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#e7dcc4");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -EGG.r * ppm * 0.1, EGG.r * ppm * 0.88, EGG.r * ppm * 1.12, 0, 0, Math.PI * 2);
  ctx.fill();
  if (e.cracks > 0) {
    ctx.strokeStyle = "#57534e";
    ctx.lineWidth = Math.max(1, ppm * 0.025);
    const s = EGG.r * ppm;
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.2);
    ctx.lineTo(-s * 0.3, s * 0.05);
    ctx.lineTo(0, -s * 0.25);
    if (e.cracks > 1) {
      ctx.lineTo(s * 0.3, s * 0.1);
      ctx.lineTo(s * 0.7, -s * 0.15);
    }
    if (e.cracks > 2) {
      ctx.moveTo(0, -s * 0.25);
      ctx.lineTo(s * 0.05, -s * 0.75);
    }
    ctx.stroke();
  }
  ctx.restore();
}
