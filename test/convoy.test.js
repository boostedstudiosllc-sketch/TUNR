import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanConvoyCode, ageSeconds, lastSeen, convoyMembers, behindLine, shouldSend, fromCoords, boundsOf, radar, niceMiles, STALE_SECONDS } from "../src/lib/convoyMath.js";

const NOW = Date.parse("2026-11-02T20:00:00Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();

test("convoy codes are cleaned like the database stores them", () => {
  assert.equal(cleanConvoyCode(" ab-c 12d9x "), "ABC12D");
  assert.equal(cleanConvoyCode(null), "");
});

test("how fresh a position is", () => {
  assert.equal(ageSeconds(ago(10), NOW), 10);
  assert.equal(lastSeen(ago(5), NOW), "live");
  assert.equal(lastSeen(ago(STALE_SECONDS + 1), NOW), "1 min ago");
  assert.equal(lastSeen(ago(600), NOW), "10 min ago");
  assert.equal(lastSeen(ago(7200), NOW), "over an hour ago");
  assert.equal(lastSeen(null, NOW), "not sharing");
});

test("members: leader, me, distances and who's fallen behind", () => {
  const state = {
    leader_id: "L",
    members: [
      { user_id: "L", username: "lead", car: "2020 BMW M340i", pos: { lat: 33.78, lng: -84.39, at: ago(3) } },
      { user_id: "ME", username: "me", pos: { lat: 33.785, lng: -84.39, at: ago(2) } },
      { user_id: "FAR", username: "far", pos: { lat: 33.83, lng: -84.39, at: ago(4) } },
      { user_id: "OLD", username: "old", pos: { lat: 33.9, lng: -84.39, at: ago(300) } },
      { user_id: "OFF", username: "off" },
    ],
  };
  const rows = convoyMembers(state, "ME", NOW);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.L.leader, true);
  assert.equal(by.L.car, "2020 BMW M340i");
  assert.equal(by.ME.me, true);
  assert.equal(by.ME.fromMe, 0);
  assert.ok(by.L.fromMe > 0.3 && by.L.fromMe < 0.4, "about a third of a mile");
  assert.equal(by.FAR.behind, true, "3.5 mi back from the leader");
  assert.equal(by.ME.behind, false);
  assert.equal(by.OLD.live, false);
  assert.equal(by.OLD.behind, false, "a stale position doesn't count as behind");
  assert.equal(by.OFF.pos, null);
  assert.equal(by.OFF.seen, "not sharing");
  assert.equal(by.OFF.fromMe, null);
  assert.deepEqual(convoyMembers(null, "ME", NOW), []);
});

test("a phone sends at most every 3 s, when it moved or every 20 s", () => {
  const last = { lat: 33.78, lng: -84.39, sentAt: NOW - 5000 };
  assert.equal(shouldSend(null, { lat: 1, lng: 1 }, NOW), true, "first fix goes straight away");
  assert.equal(shouldSend({ ...last, sentAt: NOW - 1000 }, { lat: 33.79, lng: -84.39 }, NOW), false, "not within 3 s");
  assert.equal(shouldSend(last, { lat: 33.7801, lng: -84.39 }, NOW), false, "11 m is standing still");
  assert.equal(shouldSend(last, { lat: 33.7803, lng: -84.39 }, NOW), true, "33 m is moving");
  assert.equal(shouldSend({ ...last, sentAt: NOW - 21000 }, { lat: 33.78, lng: -84.39 }, NOW), true, "parked, but keep it live");
  assert.equal(shouldSend(last, null, NOW), false);
});

test("browser coordinates become what we send", () => {
  assert.deepEqual(fromCoords({ latitude: 33.7, longitude: -84.3, heading: 370, speed: 20, accuracy: 7.6 }), { lat: 33.7, lng: -84.3, heading: 10, speedMph: 45, accuracyM: 8 });
  assert.deepEqual(fromCoords({ latitude: 33.7, longitude: -84.3, heading: NaN, speed: null, accuracy: 20 }), { lat: 33.7, lng: -84.3, heading: null, speedMph: null, accuracyM: 20 });
  assert.equal(fromCoords({}), null);
});

test("framing everyone on the map", () => {
  assert.equal(boundsOf([]), null);
  const one = boundsOf([{ lat: 33.78, lng: -84.39 }]);
  assert.ok(one[1][1] - one[0][1] >= 0.0099, "one car still gets some room");
  assert.deepEqual(boundsOf([{ lat: 33.7, lng: -84.4 }, { lat: 33.9, lng: -84.1 }, null]), [[-84.4, 33.7], [-84.1, 33.9]]);
});

test("the radar places everyone around the centre", () => {
  const center = { lat: 33.78, lng: -84.39 };
  const { dots, miles } = radar([center, { lat: 33.79, lng: -84.39 }], center, 200);
  assert.equal(miles, 1, "0.69 mi away → 1 mi rings");
  assert.deepEqual([dots[0].x, dots[0].y], [100, 100]);
  assert.ok(dots[1].y < 100 && Math.abs(dots[1].x - 100) < 0.01, "north is up");
  assert.deepEqual(radar([], center, 200).dots, []);
  assert.equal(niceMiles(3), 5);
  assert.equal(niceMiles(0.1), 0.25);
  assert.equal(niceMiles(420), 500);
});

test("who's fallen behind, in words", () => {
  assert.equal(behindLine([{ name: "a", behind: false }]), "");
  assert.equal(behindLine([{ name: "s2k", behind: true, fromLeader: 3.34 }]), "@s2k has fallen behind the leader (3.3 mi back)");
  assert.equal(behindLine([{ name: "me", me: true, behind: true, fromLeader: 1.2 }]), "You have fallen behind the leader (1.2 mi back)");
  assert.equal(
    behindLine([{ name: "s2k", behind: true, fromLeader: 3.3 }, { name: "me", me: true, behind: true, fromLeader: 1.2 }, { name: "evo", behind: true, fromLeader: 12.4 }]),
    "You, @s2k and @evo have fallen behind the leader (12 mi back)"
  );
});
