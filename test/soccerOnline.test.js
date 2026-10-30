import { test } from "node:test";
import assert from "node:assert/strict";
import { newMatch, tickMatch, snapshot, applySnapshot, STEP } from "../src/lib/soccerEngine.js";

const steps = (m, n, input) => {
  for (let i = 0; i < n; i++) tickMatch(m, input);
};

test("turbo ball online: the guest's car is driven by its controls on the host", () => {
  const host = newMatch({ online: "host", length: 60 });
  assert.equal(host.player, host.cars[0]);
  assert.equal(host.cars[1].remote, true);
  assert.equal(host.cars[1].ai, null);
  steps(host, 3.2 / STEP, {});
  const z0 = host.cars[1].z;
  host.cars[1].input = { throttle: 1, steer: 0 };
  steps(host, 120, {});
  assert.ok(Math.abs(host.cars[1].z - z0) > 1, "the guest's car moved");
});

test("turbo ball online: the guest follows the host's snapshots, events included", () => {
  const host = newMatch({ online: "host", length: 60 });
  const guest = newMatch({ online: "guest", length: 60 });
  assert.equal(guest.player, guest.cars[1]);
  assert.equal(guest.cars[0].remote, true);
  // The guest never leaves kickoff by itself.
  steps(guest, 4 / STEP, {});
  assert.equal(guest.state, "kickoff");
  steps(host, 3.2 / STEP, { throttle: 1 });
  let ev = applySnapshot(guest, snapshot(host));
  assert.deepEqual(ev.map((e) => e.kind), ["go"]);
  assert.equal(guest.state, "play");
  assert.ok(Math.abs(guest.cars[0].z - host.cars[0].z) < 1e-2, "the host's car is where the host says");
  // A goal on the host shows up on the guest, once.
  host.score = [1, 0];
  host.state = "goal";
  ev = applySnapshot(guest, snapshot(host));
  assert.deepEqual(ev.map((e) => [e.kind, e.team]), [["goal", 0]]);
  assert.equal(applySnapshot(guest, snapshot(host)).length, 0);
  // Goals and the clock are only ever the host's call.
  guest.ball.z = 999;
  const before = [...guest.score];
  steps(guest, 30, {});
  assert.deepEqual(guest.score, before);
  host.state = "over";
  assert.deepEqual(applySnapshot(guest, snapshot(host)).map((e) => e.kind), ["over"]);
});
