// Proves every Park Up level can be beaten: a path-finder (hybrid A*) that
// drives the real car model (src/lib/parkEngine.js) forward and in reverse
// at parking speed until it stops inside the spot without touching
// anything. Run: node scripts/park-solve.mjs  (test/park.test.js runs it too)

import { LEVELS, CAR, MAX_STEER, hitWhat, inSpot } from "../src/lib/parkEngine.js";

const CELL = 6;
const ANGLES = 72;
const DT = 1 / 60;
const PRIM_TIME = 0.3;
const FWD = 70;
const REV = -45;
const STEERS = [-1, -0.5, 0, 0.5, 1];

function key(x, y, h) {
  const a = ((Math.round((h / (2 * Math.PI)) * ANGLES) % ANGLES) + ANGLES) % ANGLES;
  return `${Math.round(x / CELL)},${Math.round(y / CELL)},${a}`;
}

// Drive one short move; null if it touches anything.
function move(level, s, v, steer) {
  let { x, y, heading } = s;
  for (let t = 0; t < PRIM_TIME - 1e-9; t += DT) {
    heading += ((v * Math.tan(steer * MAX_STEER)) / CAR.wheelbase) * DT;
    x += v * Math.sin(heading) * DT;
    y -= v * Math.cos(heading) * DT;
    if (hitWhat(level, { x, y, heading, w: CAR.w, h: CAR.h })) return null;
  }
  return { x, y, heading };
}

// A min-heap on f.
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(x) {
    const a = this.a;
    a.push(x);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export function solve(level, { maxNodes = 120000 } = {}) {
  const start = { ...level.start, g: 0, prev: null, v: 0, steer: 0 };
  const h = (s) => Math.hypot(s.x - level.spot.x, s.y - level.spot.y) / FWD;
  const open = new Heap();
  open.push({ s: start, f: h(start) });
  const seen = new Set([key(start.x, start.y, start.heading)]);
  let nodes = 0;
  while (open.size && nodes < maxNodes) {
    const { s } = open.pop();
    nodes += 1;
    if (inSpot(level, { x: s.x, y: s.y, heading: s.heading, w: CAR.w, h: CAR.h })) {
      const path = [];
      for (let n = s; n; n = n.prev) path.unshift(n);
      return { ok: true, nodes, seconds: s.g, path };
    }
    for (const v of [FWD, REV]) {
      for (const steer of STEERS) {
        const n = move(level, s, v, steer);
        if (!n) continue;
        const k = key(n.x, n.y, n.heading);
        if (seen.has(k)) continue;
        seen.add(k);
        const flip = s.v && Math.sign(s.v) !== Math.sign(v) ? 1.2 : 0; // stopping to change direction
        const g = s.g + PRIM_TIME + flip + (v < 0 ? 0.1 : 0);
        const node = { ...n, g, prev: s, v, steer };
        open.push({ s: node, f: g + h(node) * 1.2 });
      }
    }
  }
  return { ok: false, nodes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const level of LEVELS) {
    const t = Date.now();
    const r = solve(level, { maxNodes: 300000 });
    const reversals = r.ok ? r.path.filter((n, i) => i > 1 && n.v && r.path[i - 1].v && Math.sign(n.v) !== Math.sign(r.path[i - 1].v)).length : null;
    console.log(level.id.padEnd(12), r.ok ? `solved in ~${r.seconds.toFixed(1)}s of driving, ${reversals} direction changes (par ${level.par}s)` : "NOT SOLVED", `· ${r.nodes} nodes · ${Date.now() - t} ms`);
  }
}
