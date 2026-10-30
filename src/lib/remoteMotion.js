// Smooth motion for a car seen through another phone's reports (a few a
// second): each report also gives a velocity (from the one before), the car
// is carried on along it between reports and eased toward where it should
// be, instead of jumping. Shared by the racing games' multiplayer modes.

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// A report: { t (their clock), x, z, heading }.
export function noteReport(car, r) {
  const prev = car.rep;
  if (prev && r.t > prev.t + 1e-3) {
    const dt = r.t - prev.t;
    car.rvx = (r.x - prev.x) / dt;
    car.rvz = (r.z - prev.z) / dt;
    car.rvh = angleDiff(r.heading, prev.heading) / dt;
  }
  car.rep = { t: r.t, x: r.x, z: r.z, heading: r.heading };
  // Far off (the first report, or a big lag spike): just put it there.
  if (!prev || Math.hypot(car.x - r.x, car.z - r.z) > 30) {
    car.x = r.x;
    car.z = r.z;
    car.heading = r.heading;
  }
}

// Each step: carry on from the last report, easing toward it. `now` is this
// phone's race clock (the two start together, give or take the lag).
export function followReports(car, now, dt) {
  const r = car.rep;
  if (!r) return;
  const ahead = Math.max(0, Math.min(0.4, now - r.t));
  const tx = r.x + (car.rvx || 0) * ahead;
  const tz = r.z + (car.rvz || 0) * ahead;
  const th = r.heading + (car.rvh || 0) * ahead;
  const k = Math.min(1, dt * 10);
  car.x += (tx - car.x) * k;
  car.z += (tz - car.z) * k;
  car.heading += angleDiff(th, car.heading) * k;
}

// How often to send reports (ms). Low on purpose: the free Supabase plan
// counts every message, and the smoothing above hides the gaps.
export const REPORT_MS = 125;
