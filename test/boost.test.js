import { test } from "node:test";
import assert from "node:assert/strict";
import { boostStep, countdown, errorFor, mondayOf, weekdayName } from "../src/lib/boostRules.js";
import { buildSlides } from "../src/lib/slides.js";
import { runBoost } from "../api/_routes/daily.js";

const base = { active: true, points: 10, stay_minutes: 20 };
const now = Date.parse("2026-11-25T23:30:00Z");

test("where you are with today's boost", () => {
  assert.equal(boostStep({ active: false }).step, "off");
  assert.equal(boostStep({ ...base, opted_in: false }).step, "opt_in");
  assert.match(boostStep({ ...base, opted_in: false }).text, /\+10 bonus points/);
  assert.equal(boostStep({ ...base, opted_in: true }).step, "check_in");
  const checked = { ...base, opted_in: true, checked_in_at: "2026-11-25T23:20:00Z", confirm_at: "2026-11-25T23:40:00Z", event_title: "Show Night" };
  assert.equal(boostStep(checked, now).step, "wait");
  assert.equal(boostStep(checked, Date.parse("2026-11-25T23:41:00Z")).step, "confirm");
  assert.equal(boostStep({ ...checked, confirmed_at: "2026-11-25T23:45:00Z", earned: 10 }, now).step, "done");
});

test("countdowns and messages", () => {
  assert.equal(countdown("2026-11-25T23:40:00Z", now), "10:00");
  assert.equal(countdown("2026-11-25T23:30:05Z", now), "0:05");
  assert.equal(countdown("2026-11-25T23:00:00Z", now), "0:00");
  assert.equal(errorFor("no_rsvp"), "You needed to RSVP Going before this meet started.");
  assert.equal(errorFor("too_far", { distance_m: 600 }), "You're 600 m from the meet. Get closer and try again.");
  assert.equal(errorFor("too_far", { distance_m: 3218 }), "You're 2.0 miles from the meet. Get closer and try again.");
  assert.match(errorFor("too_soon", { confirm_at: "2026-11-25T23:40:00Z" }), /confirm at 6:40 PM/);
  assert.equal(errorFor("weird"), "Couldn't do that. (weird)");
});

test("weeks start on Monday", () => {
  assert.equal(mondayOf("2026-11-23"), "2026-11-23");
  assert.equal(mondayOf("2026-11-29"), "2026-11-23", "Sunday belongs to the week before");
  assert.equal(mondayOf("2026-11-25"), "2026-11-23");
  assert.equal(weekdayName("2026-11-25"), "Wednesday, Nov 25");
});

test("the banner leads with Boost Day until you've earned it", () => {
  assert.equal(buildSlides({ boost: { ...base, opted_in: false }, now })[0].id, "boost");
  assert.equal(buildSlides({ boost: { ...base, opted_in: true }, now })[0].cta, "See it");
  assert.equal(buildSlides({ boost: { ...base, confirmed_at: "x" }, now }).some((s) => s.id === "boost"), false);
  assert.equal(buildSlides({ boost: { active: false }, now }).some((s) => s.id === "boost"), false);
});

test("the daily job picks next week's day on Sundays only", async () => {
  const calls = [];
  const service = { rest: async (path, init) => (calls.push([path, init.body]), 1) };
  await runBoost(service, new Date("2026-11-29T13:00:00Z")); // a Sunday in Atlanta
  assert.deepEqual(calls[0], ["/rest/v1/rpc/pick_boost_day", JSON.stringify({ p_monday: "2026-11-30" })]);
  assert.equal(calls[1][0], "/rest/v1/rpc/boost_morning_alerts");
  calls.length = 0;
  await runBoost(service, new Date("2026-11-25T13:00:00Z")); // a Wednesday
  assert.deepEqual(calls.map((c) => c[0]), ["/rest/v1/rpc/boost_morning_alerts"], "weekdays: just the morning alert");
});
