import { test } from "node:test";
import assert from "node:assert/strict";
import { claimError, clampPoints, claimBy } from "../src/lib/comebackRules.js";

test("claim errors in plain words, unknown ones without underscores", () => {
  assert.match(claimError("expired"), /ended/);
  assert.match(claimError("already"), /already claimed/);
  assert.match(claimError("not_found"), /isn't yours/);
  assert.equal(claimError("weird_status"), "Couldn't claim it. (weird status)");
  assert.equal(claimError(undefined), "Couldn't claim it. (no answer)");
});

test("admin points are whole numbers from 0 to 100", () => {
  assert.equal(clampPoints("15"), 15);
  assert.equal(clampPoints("12.6"), 13);
  assert.equal(clampPoints(-5), 0);
  assert.equal(clampPoints(500), 100);
  assert.equal(clampPoints("abc"), 0);
});

test("the claim deadline reads in Atlanta time", () => {
  assert.equal(claimBy("2026-11-28T21:12:00Z"), "Sat 4:12 PM");
});
