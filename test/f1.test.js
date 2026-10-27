import test from "node:test";
import assert from "node:assert/strict";
import { buildTrack, newRace, tickRace, pointAt, locate, speedProfile, placeOf, standings, lapClock, TRACK_W, DIFFICULTY } from "../src/lib/f1Engine.js";
import { TRACKS } from "../src/lib/f1Tracks.js";

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// A steady driver: aim a little down the road, keep to a share of the
// fastest speed for what's coming up.
function drive(race, prof, pace = 0.95) {
  const p = race.player;
  const t = race.track;
  const tp = pointAt(t, p.s + 10 + Math.abs(p.speed) * 0.35, 0);
  const e = angleDiff(Math.atan2(-(tp.x - p.x), -(tp.z - p.z)), p.heading);
  const vt = prof[(p.idx + Math.round((8 + p.speed * 0.5) / (t.L / t.n))) % t.n] * pace;
  return { left: e > 0.03, right: e < -0.03, gas: p.speed < vt, brake: p.speed > vt + 4 };
}

test("22 circuits, closed and the right size", () => {
  assert.equal(TRACKS.length, 22);
  for (const def of TRACKS) {
    const t = buildTrack(def);
    // Half the real length, give or take the smoothing.
    assert.ok(Math.abs(t.L - def.realLength / 2) / (def.realLength / 2) < 0.12, `${def.name}: ${t.L} vs ${def.realLength / 2}`);
    assert.ok(Math.hypot(t.x[0] - t.x[t.n - 1], t.z[0] - t.z[t.n - 1]) < 5, `${def.name} is closed`);
    for (let i = 0; i < t.n; i++) assert.ok(t.roL[i] >= 1.2 && t.roR[i] >= 1.2);
  }
});

test("locating a point: along and sideways", () => {
  const t = buildTrack(TRACKS[0]);
  const p = pointAt(t, 500, 3);
  const w = locate(t, p.x, p.z, p.i);
  assert.ok(Math.abs(w.s - 500) < 1.5);
  assert.ok(Math.abs(w.side - 3) < 0.3, `side ${w.side}`);
});

test("lights out after the countdown; gas goes, brake stops", () => {
  const race = newRace(buildTrack(TRACKS[0]), { laps: 1 });
  for (let i = 0; i < 120 * 2; i++) tickRace(race, { gas: true });
  assert.equal(race.state, "countdown");
  assert.equal(race.player.speed, 0, "no jump start");
  for (let i = 0; i < 120 * 4; i++) tickRace(race, { gas: true });
  assert.ok(race.player.speed > 25);
  for (let i = 0; i < 120 * 3; i++) tickRace(race, { brake: true });
  assert.ok(race.player.speed <= 0);
});

test("steering on the gas drifts: the tail slides out", () => {
  const race = newRace(buildTrack(TRACKS[2]), { laps: 1, rivals: 0 });
  for (let i = 0; i < 120 * 6; i++) tickRace(race, { gas: true });
  let drifted = false;
  let maxSlip = 0;
  for (let i = 0; i < 40; i++) {
    tickRace(race, { gas: true, left: true });
    drifted ||= race.player.drifting;
    maxSlip = Math.max(maxSlip, race.player.slip);
  }
  assert.ok(drifted);
  assert.ok(maxSlip > 0.1, `slip ${maxSlip}`);
  // Without the gas it just turns.
  for (let i = 0; i < 20; i++) tickRace(race, { left: true });
  assert.equal(race.player.drifting, false);
});

test("the wall stops you leaving the circuit", () => {
  const race = newRace(buildTrack(TRACKS[0]), { laps: 1, rivals: 0 });
  for (let i = 0; i < 120 * 12; i++) tickRace(race, { gas: true, right: i > 120 * 4 });
  const p = race.player;
  const room = TRACK_W / 2 + (p.side > 0 ? race.track.roL[p.idx] : race.track.roR[p.idx]);
  assert.ok(Math.abs(p.side) <= room + 0.5, `side ${p.side} room ${room}`);
  assert.ok(race.events.some((e) => e.kind === "wall"));
});

test("a race on three circuits: laps count, places add up", { timeout: 120000 }, () => {
  for (const def of [TRACKS[0], TRACKS[6], TRACKS[13]]) {
    const t = buildTrack(def);
    const race = newRace(t, { laps: 2, seed: 4 });
    const prof = speedProfile(t);
    for (let i = 0; i < 120 * 300 && race.state !== "finished"; i++) tickRace(race, drive(race, prof));
    assert.equal(race.state, "finished", `${def.name} finished`);
    assert.equal(race.player.lapTimes.length, 2);
    assert.ok(race.player.lapTimes.every((s) => s > 20 && s < 120), `${def.name} laps ${race.player.lapTimes}`);
    const place = placeOf(race);
    assert.ok(place >= 1 && place <= 4);
    assert.equal(standings(race).length, 4);
  }
  assert.equal(lapClock(83.4567), "1:23.457");
});

test("harder difficulty means faster rivals", () => {
  const ran = (difficulty) => {
    const race = newRace(buildTrack(TRACKS[0]), { laps: 3, seed: 7, difficulty });
    for (let i = 0; i < 120 * 40; i++) tickRace(race, {});
    const lead = standings(race)[0];
    return lead.lap * race.track.L + lead.s;
  };
  assert.ok(DIFFICULTY.easy < DIFFICULTY.medium && DIFFICULTY.medium < DIFFICULTY.hard);
  const easy = ran("easy");
  const medium = ran("medium");
  const hard = ran("hard");
  assert.ok(easy < medium && medium < hard, `easy ${easy} medium ${medium} hard ${hard}`);
});
