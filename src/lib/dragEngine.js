// Drag Race: a quarter mile, two lanes. The tree counts down three ambers
// to green; launch on green (early is a red light and you lose), then shift
// each gear with the needle in the green. One shot of nitro. Five rivals to
// beat in turn, each quicker off the line and cleaner through the gears.
// Pure logic, no drawing: the same race runs the same way everywhere.

export const QUARTER = 402.336; // m
export const SIXTY_FT = 18.288; // m
export const REDLINE = 8000;
export const IDLE = 1200;
export const SHIFT_ZONE = [6900, 7700]; // perfect
export const GOOD_ZONE = [6200, 6900];
export const RATIOS = [3.3, 2.1, 1.5, 1.15, 0.92];
const RPM_PER_MS = 142.6; // engine rpm per m/s per unit of gear ratio
const GRIP = 11.5; // m/s², the most the tyres can put down
const DRAG = 0.00042; // air
export const AMBER_AT = [0.6, 1.1, 1.6]; // s after staging
export const GREEN_AT = 2.1;
export const NITRO_SECONDS = 2.2;
export const STEP = 1 / 120;

// The rivals, easiest first: how fast they react, where they shift
// (± wobble), and when they hit the nitro (seconds after launch, or null).
export const RIVALS = [
  { id: "street", name: "Street Sleeper", tag: "Daily driver, big talk", react: 0.42, shiftAt: 6300, wobble: 450, nitroAt: null, color: "#9CA3AF", body: "sedan" },
  { id: "weekend", name: "Weekend Warrior", tag: "Fresh tune, no practice", react: 0.33, shiftAt: 6700, wobble: 300, nitroAt: null, color: "#16A34A", body: "hatch" },
  { id: "tuner", name: "Midnight Tuner", tag: "Knows the strip", react: 0.26, shiftAt: 7050, wobble: 220, nitroAt: 5.5, color: "#7C3AED", body: "coupe" },
  { id: "pro", name: "Pro Mod Pete", tag: "Lives at the track", react: 0.22, shiftAt: 7150, wobble: 160, nitroAt: 4.2, color: "#DC2626", body: "coupe" },
  { id: "boss", name: "Boosted Boss", tag: "Has never lost here", react: 0.17, shiftAt: 7250, wobble: 110, nitroAt: 3.4, color: "#EAB308", body: "coupe" },
];

// A repeatable random number source.
export function seeded(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// How hard the engine pulls at an rpm (0..1): weak low down, peak about
// 6,000, tailing off toward the redline.
export function torque(rpm) {
  if (rpm <= IDLE) return 0.35;
  const t = (Math.min(rpm, REDLINE) - IDLE) / (REDLINE - IDLE);
  return 0.42 + 0.58 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.86);
}

const rpmAt = (speed, gear) => Math.max(IDLE, speed * RATIOS[gear] * RPM_PER_MS);

function newDriver() {
  return { x: 0, v: 0, gear: 0, rpm: IDLE, launchedAt: null, shifts: [], nitroLeft: NITRO_SECONDS, nitroOn: false, nitroUsed: false, sixtyAt: null, finishAt: null, trap: 0, limiter: 0, shiftLag: 0 };
}

// `remote`: a two-player race; the other car is another phone's, fed in
// by remoteSample() and remoteDone() instead of driven by the computer.
export function newRace(rivalIndex = 0, seed = 1, { remote = false } = {}) {
  const rand = seeded(seed);
  const rival = RIVALS[Math.max(0, Math.min(RIVALS.length - 1, rivalIndex))];
  // The rival's plan for this race: reaction, and a shift point per gear.
  const plan = {
    react: rival.react + (rand() - 0.5) * 0.06,
    shifts: RATIOS.slice(1).map(() => rival.shiftAt + (rand() * 2 - 1) * rival.wobble),
    nitroAt: rival.nitroAt,
  };
  return { t: 0, rival, plan, phase: "tree", me: newDriver(), them: newDriver(), result: null, events: [], foul: false, remote: remote ? { samples: [], out: null, doneAt: null } : null };
}

// Two-player races. Each phone runs its own tree and its own car, and
// both clocks count from that phone's start, so the times compare fairly
// whatever the network lag. The other car is drawn from its last reports.

// A position report from the other phone: { t, x, v, nitro }.
export function remoteSample(race, s) {
  const r = race.remote;
  if (!r || typeof s?.t !== "number") return;
  r.samples.push(s);
  if (r.samples.length > 30) r.samples.shift();
}

// The other phone's race is over: { finishAt, launchedAt, trap } or
// { out: "red" | "asleep" | "left" }.
export function remoteDone(race, d) {
  const r = race.remote;
  if (!r) return;
  const them = race.them;
  if (d?.out) {
    r.out = d.out;
  } else if (typeof d?.finishAt === "number") {
    them.finishAt = d.finishAt;
    them.launchedAt = d.launchedAt ?? them.launchedAt;
    them.trap = d.trap || 0;
    them.x = Math.max(them.x, QUARTER);
  }
  r.doneAt = race.t;
}

// What this phone tells the other one about its race.
export const myReport = (race) => {
  const me = race.me;
  if (race.result?.why === "red" || race.result?.why === "asleep") return { out: race.result.why };
  return { finishAt: me.finishAt, launchedAt: me.launchedAt, trap: me.trap };
};

function followRemote(race) {
  const them = race.them;
  const last = race.remote.samples[race.remote.samples.length - 1];
  if (!last || them.finishAt != null) return;
  // Carry it on from the last report, so it doesn't stutter between them.
  const ahead = Math.max(0, Math.min(0.5, race.t - last.t));
  them.x = Math.min(QUARTER - 0.01, last.x + last.v * ahead);
  them.v = last.v;
  them.nitroOn = Boolean(last.nitro);
  if (them.launchedAt == null && last.x > 0) them.launchedAt = last.t;
}

// Which lights are on: ambers lit so far, green, or red (jumped).
export function treeLights(race) {
  return { ambers: AMBER_AT.filter((a) => race.t >= a).length, green: race.t >= GREEN_AT && !race.foul, red: race.foul };
}

// The player taps: before green it's a launch attempt (too early is a red
// light), after launch it's a shift.
export function tap(race) {
  const me = race.me;
  if (race.phase === "done") return;
  if (me.launchedAt == null) {
    if (race.t < GREEN_AT) {
      race.foul = true;
      race.events.push({ type: "red" });
      finish(race, "red");
      return;
    }
    me.launchedAt = race.t;
    race.events.push({ type: "launch", reaction: race.t - GREEN_AT });
    return;
  }
  shift(race, me, "me");
}

export function nitro(race) {
  const me = race.me;
  if (me.launchedAt == null || me.nitroUsed || race.phase === "done") return;
  me.nitroUsed = true;
  me.nitroOn = true;
  race.events.push({ type: "nitro", who: "me" });
}

// How good a shift at this rpm is.
export function shiftQuality(rpm) {
  if (rpm >= SHIFT_ZONE[0] && rpm <= SHIFT_ZONE[1]) return "perfect";
  if (rpm > SHIFT_ZONE[1]) return "late";
  if (rpm >= GOOD_ZONE[0]) return "good";
  return "early";
}

function shift(race, d, who) {
  if (d.gear >= RATIOS.length - 1 || d.shiftLag > 0) return;
  const quality = shiftQuality(d.rpm);
  d.shifts.push({ gear: d.gear + 1, rpm: Math.round(d.rpm), quality });
  d.gear += 1;
  // A clean shift is quick; a sloppy one costs time with no drive.
  d.shiftLag = quality === "perfect" ? 0.06 : quality === "good" ? 0.14 : 0.22;
  if (quality === "perfect") d.perfectBoost = 0.5;
  race.events.push({ type: "shift", who, quality, gear: d.gear + 1 });
}

function drive(race, d, dt) {
  if (d.launchedAt == null || d.finishAt != null) {
    // Staged: revving against the limiter, not moving.
    if (d.launchedAt == null) d.rpm += ((race.phase === "tree" ? 4200 : IDLE) - d.rpm) * Math.min(1, dt * 6);
    return;
  }
  const since = race.t - d.launchedAt;
  let a = 0;
  if (d.shiftLag > 0) {
    d.shiftLag -= dt;
  } else {
    // In first the clutch slips at launch revs until the road catches up.
    const rpm = d.gear === 0 ? Math.max(rpmAt(d.v, 0), 5200) : rpmAt(d.v, d.gear);
    // On the limiter the engine cuts: no pull.
    const onLimiter = rpm >= REDLINE;
    if (onLimiter) d.limiter += dt;
    a = onLimiter ? 0 : torque(rpm) * RATIOS[d.gear] * 3.6;
    if (d.perfectBoost > 0) {
      a *= 1.12;
      d.perfectBoost -= dt;
    }
    if (d.nitroOn) {
      a += 3.4;
      d.nitroLeft -= dt;
      if (d.nitroLeft <= 0) d.nitroOn = false;
    }
    // Launch: the tyres can only take so much.
    a = Math.min(a, GRIP + (d.nitroOn ? 2 : 0) + since * 0.6);
  }
  a -= DRAG * d.v * d.v + 0.12;
  d.v = Math.max(0, d.v + a * dt);
  d.x += d.v * dt;
  // The needle: follows road speed, but a launch rev hangs high.
  const road = rpmAt(d.v, d.gear);
  d.rpm = d.shiftLag > 0 ? d.rpm + (road - d.rpm) * Math.min(1, dt * 18) : Math.min(REDLINE + 150, Math.max(road, since < 0.35 ? 5200 - since * 6000 : road));
  if (d.sixtyAt == null && d.x >= SIXTY_FT) d.sixtyAt = race.t - d.launchedAt;
  if (d.x >= QUARTER) {
    d.finishAt = race.t;
    d.trap = d.v;
  }
}

// The rival's driving, from its plan.
function rivalBrain(race) {
  const d = race.them;
  const p = race.plan;
  if (d.launchedAt == null && race.t >= GREEN_AT + p.react) d.launchedAt = race.t;
  if (d.launchedAt == null) return;
  if (d.gear < RATIOS.length - 1 && d.shiftLag <= 0 && d.rpm >= p.shifts[d.gear]) shift(race, d, "them");
  if (p.nitroAt != null && !d.nitroUsed && race.t - d.launchedAt >= p.nitroAt) {
    d.nitroUsed = true;
    d.nitroOn = true;
    race.events.push({ type: "nitro", who: "them" });
  }
}

export function step(race, dt = STEP) {
  if (race.phase === "done") return;
  race.t += dt;
  if (race.phase === "tree" && race.t >= GREEN_AT) race.phase = "race";
  if (race.remote) followRemote(race);
  else rivalBrain(race);
  drive(race, race.me, dt);
  if (!race.remote) drive(race, race.them, dt);
  // Sat at the line too long: it counts as a lost race.
  if (race.me.launchedAt == null && race.t > GREEN_AT + 3) finish(race, "asleep");
  if (race.remote) {
    // Two players: done once both are through, or the other one is out
    // (red light, never left, gone) and you're through. If they never
    // report, you win after 15 seconds.
    const me = race.me;
    if (me.finishAt != null && (race.them.finishAt != null || race.remote.out || race.t - me.finishAt > 15)) finish(race);
    return;
  }
  if (race.me.finishAt != null && race.them.finishAt != null) finish(race);
  // Once one car is through, don't wait forever for the other.
  else if ((race.me.finishAt ?? race.them.finishAt) != null && race.t - (race.me.finishAt ?? race.them.finishAt) > 6) finish(race);
}

// Runs the clock forward in fixed steps (frame-rate independent).
export function tick(race, dt) {
  race.acc = (race.acc || 0) + Math.min(dt, 0.1);
  while (race.acc >= STEP && race.phase !== "done") {
    step(race);
    race.acc -= STEP;
  }
}

// Elapsed time runs from launch, as at a real strip; the race is won by
// whoever reaches the stripe first, so reaction time counts there.
const et = (d) => (d.finishAt != null && d.launchedAt != null ? d.finishAt - d.launchedAt : null);

function finish(race, why = null) {
  race.phase = "done";
  const me = race.me;
  const them = race.them;
  const mine = et(me);
  const theirs = et(them);
  const won = !why && me.finishAt != null && (them.finishAt == null || me.finishAt < them.finishAt);
  race.result = {
    won,
    why: why || (won ? "won" : "lost"),
    et: mine,
    rivalEt: theirs,
    reaction: me.launchedAt != null ? me.launchedAt - GREEN_AT : null,
    sixty: me.sixtyAt,
    trapMph: me.trap ? me.trap * 2.23694 : null,
    margin: me.finishAt != null && them.finishAt != null ? Math.abs(them.finishAt - me.finishAt) : null,
    shifts: me.shifts,
    perfect: me.shifts.filter((s) => s.quality === "perfect").length,
    rivalOut: race.remote?.out || (race.remote && them.finishAt == null && me.finishAt != null ? "left" : null),
  };
  race.events.push({ type: "done", won });
}

export const WHY = {
  red: "Red light: you left before the green.",
  asleep: "You never left the line.",
  won: "You took the win.",
  lost: "Beaten to the stripe.",
};

// The grade for a launch.
export function reactionWord(r) {
  if (r == null) return "";
  if (r < 0.1) return "Perfect light";
  if (r < 0.2) return "Great launch";
  if (r < 0.35) return "Good launch";
  return "Slow off the line";
}

// Progress on this phone: the furthest rival beaten and best times.
const KEY = "tunr.drag.progress";
export function loadDragProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { beaten: Number(p.beaten) || 0, bestEt: Number(p.bestEt) || null, bestTrap: Number(p.bestTrap) || null, bestRt: Number(p.bestRt) || null };
  } catch (e) {
    console.warn("Couldn't read your drag race times:", e.message);
    return { beaten: 0, bestEt: null, bestTrap: null, bestRt: null };
  }
}

export function saveDragResult(rivalIndex, result) {
  const p = loadDragProgress();
  if (result.won) p.beaten = Math.max(p.beaten, rivalIndex + 1);
  if (result.et && result.why !== "red") {
    if (!p.bestEt || result.et < p.bestEt) p.bestEt = Number(result.et.toFixed(3));
    if (!p.bestTrap || result.trapMph > p.bestTrap) p.bestTrap = Number(result.trapMph.toFixed(1));
    if (result.reaction != null && (!p.bestRt || result.reaction < p.bestRt)) p.bestRt = Number(result.reaction.toFixed(3));
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (e) {
    console.warn("Couldn't save your drag race times:", e.message);
  }
  return p;
}
