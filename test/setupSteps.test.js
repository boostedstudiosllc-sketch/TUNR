import { test } from "node:test";
import assert from "node:assert/strict";
import { platformOf, setupSteps, shouldAutoShow, homeScreenSteps } from "../src/lib/setupSteps.js";
import { compassHeading, pickHeading } from "../src/lib/compass.js";
import { weekDots, bonusLine } from "../src/lib/pitStopRules.js";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

test("which phone", () => {
  assert.equal(platformOf(iphone), "ios");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, "MacIntel"), "ios", "an iPad says it's a Mac");
  assert.equal(platformOf(android), "android");
  assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0)"), "desktop");
});

test("a new iPhone in Safari gets every screen, in order", () => {
  const steps = setupSteps({ platform: "ios", standalone: false, geo: "prompt", push: "ios_home_screen", pushOn: false, motionAsk: true, motionOn: false, pitStopOn: true });
  assert.deepEqual(steps, ["location", "homescreen", "alerts", "motion", "pitstop"]);
});

test("things already on are skipped; Settings shows them all", () => {
  const env = { platform: "android", standalone: true, geo: "granted", push: "ready", pushOn: true, motionAsk: false, motionOn: false, pitStopOn: true };
  assert.deepEqual(setupSteps(env), ["pitstop"], "Android doesn't ask for motion, and the rest is on");
  assert.deepEqual(setupSteps({ ...env, all: true }), ["location", "homescreen", "alerts", "pitstop"]);
  assert.deepEqual(setupSteps({ platform: "desktop", geo: "unsupported", push: "unsupported", pitStopOn: false }), [], "nothing to do");
  assert.deepEqual(setupSteps({ platform: "desktop", geo: "prompt", push: "ready", pushOn: false, pitStopOn: false }), ["location", "alerts"], "no home screen step on a computer");
});

test("shown by itself to new accounts, once", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(shouldAutoShow({ seen: false, createdAt: "2026-11-05T11:00:00Z", now }), true);
  assert.equal(shouldAutoShow({ seen: true, createdAt: "2026-11-05T11:00:00Z", now }), false);
  assert.equal(shouldAutoShow({ seen: false, createdAt: "2026-09-01T00:00:00Z", now }), false, "older members use Settings");
  assert.equal(shouldAutoShow({ seen: false, createdAt: null, now }), false);
});

test("home screen help for each phone", () => {
  assert.match(homeScreenSteps("ios")[1], /Add to Home Screen/);
  assert.equal(homeScreenSteps("android", true).length, 1, "Chrome can show its own Install prompt");
  assert.match(homeScreenSteps("android", false)[0], /⋮ menu/);
});

test("the compass", () => {
  assert.equal(compassHeading({ webkitCompassHeading: 90 }), 90, "iPhone");
  assert.equal(compassHeading({ absolute: true, alpha: 90 }), 270, "Android counts the other way");
  assert.equal(compassHeading({ absolute: false, alpha: 90 }), null, "not tied to north: no use");
  assert.equal(compassHeading(null), null);
  assert.equal(pickHeading(45, 30, 200), 45, "moving: GPS knows best");
  assert.equal(pickHeading(45, 0, 200), 200, "stopped: the compass");
  assert.equal(pickHeading(null, 30, 199.6), 200, "no GPS heading: the compass");
  assert.equal(pickHeading(45, 0, null), 45, "no compass: whatever GPS last said");
  assert.equal(pickHeading(null, null, null), null);
});

test("the pit stop week row", () => {
  const fresh = weekDots(0, false);
  assert.deepEqual(fresh.map((d) => d.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(fresh[0].today, true);
  assert.equal(fresh.filter((d) => d.done).length, 0);
  assert.equal(fresh[6].bonus, true);
  const day3 = weekDots(3, true);
  assert.deepEqual(day3.map((d) => d.done), [true, true, true, false, false, false, false]);
  assert.equal(day3[2].today, true);
  const day8 = weekDots(7, false);
  assert.deepEqual([day8[0].day, day8[0].today], [8, true], "a new run of 7 after the bonus");
  assert.equal(bonusLine(2, true, 5), "5 more days to the +5 bonus");
  assert.equal(bonusLine(6, false, 5), "Bonus today: +5 on top");
  assert.equal(bonusLine(7, true, 5), "Bonus earned: +5 today");
  assert.equal(bonusLine(6, true, 5), "1 more day to the +5 bonus");
  assert.equal(bonusLine(5, true, 5), "2 more days to the +5 bonus");
  assert.equal(bonusLine(3, true, 0), "");
});
