// Tune TUNR Rush levels: plays each level 40 times with a driver that plans
// ahead, at several reaction times, and prints how often it reaches the
// goal. 0.1 s is about a top player (the owner cleared Hard like this one),
// 0.2 s a good one, 0.3 s decent, 0.45 s casual.
//
//   node scripts/rush-tune.mjs                       # current levels
//   node scripts/rush-tune.mjs '{"hard":{"goal":3600}}' '[0.2,0.1]'
import { newGame, tick, seededRand, DEFAULT_LEVELS } from "../src/lib/rushEngine.js";
const OVR = JSON.parse(process.argv[2] || "{}");
const REACT = JSON.parse(process.argv[3] || "[0.45,0.3,0.2]"); // seconds: casual-ish, good, great
// A planning driver: every `react` seconds it looks ahead, scores each lane by
// how far the nearest obstacle is (bonus for pickups), and moves one lane
// toward the best one if the lane it passes through is clear.
function run(rules, react, seed) {
  const g = newGame(seededRand(seed), rules, () => 0.5);
  const every = Math.max(1, Math.round(react * 60));
  let jitter = seed % every;
  while (!g.over && g.t < 180) {
    const dirs = [];
    if ((g.stepNo + jitter) % every === 0) {
      const ahead = (lane) => {
        let near = 1.2, bonus = 0;
        for (const o of g.objects) {
          if (o.lane !== lane || o.z < 0.02 || o.hit) continue;
          if (o.kind === "clock" || o.kind === "boost") { if (o.z < 0.45) bonus += o.kind === "clock" ? 0.25 : 0.15; }
          else near = Math.min(near, o.z);
        }
        return near + bonus;
      };
      const scores = [0, 1, 2].map(ahead);
      let best = g.lane;
      for (const l of [0, 1, 2]) if (scores[l] > scores[best] + 0.05) best = l;
      if (best !== g.lane) {
        const dir = best > g.lane ? 1 : -1;
        const via = g.lane + dir;
        const blocked = g.objects.some((o) => o.lane === via && o.kind !== "clock" && o.kind !== "boost" && o.z > -0.01 && o.z < 0.09);
        if (!blocked) dirs.push(dir);
      }
    }
    tick(g, dirs);
  }
  return g;
}
for (const id of ["easy", "medium", "hard"]) {
  const r = { ...DEFAULT_LEVELS[id], ...(OVR[id] || {}) };
  const line = [];
  for (const react of REACT) {
    let ok = 0, dist = 0, secs = 0; const N = 40;
    for (let i = 1; i <= N; i++) { const g = run(r, react, i * 7919); if (g.dist >= r.goal) ok++; dist += g.dist; secs += g.t; }
    line.push(`react ${react}s: ${String(Math.round(ok / N * 100)).padStart(3)}% avg ${Math.round(dist / N)}m ${Math.round(secs / N)}s`);
  }
  console.log(`${id.padEnd(7)} goal ${r.goal}`, line.join(" | "));
}
