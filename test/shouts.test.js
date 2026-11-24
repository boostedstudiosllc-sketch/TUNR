import { test } from "node:test";
import assert from "node:assert/strict";
import { shoutError, shoutHeadline, shoutMeta, downLine, linkupFromShout, SHOUT_WHEN } from "../src/lib/shoutRules.js";

test("every database status has words, unknown ones show the code", () => {
  for (const s of ["not_signed_in", "unconfirmed", "bad_request", "already_live", "rate_limit", "not_found", "own_shout", "not_your_linkup"]) {
    assert.ok(!shoutError(s).includes("Couldn't do that"), s);
  }
  assert.equal(shoutError("weird"), "Couldn't do that. (weird)");
  assert.equal(shoutError(undefined), "Couldn't do that. (no answer)");
});

test("headline and details", () => {
  assert.equal(shoutHeadline({ when: "tonight" }, "Cruise"), "Cruise tonight");
  assert.equal(shoutHeadline({ when: "now" }, "Hang"), "Hang right now");
  assert.equal(shoutMeta({ username: "kai", area: "Midtown", miles: 3.4 }), "@kai · Midtown · 3 mi");
  assert.equal(shoutMeta({ username: "kai", miles: 0.4 }), "@kai · <1 mi");
  assert.equal(shoutMeta({ mine: true, username: "me", area: "Buford", miles: 0 }), "You · Buford", "no distance to yourself");
  assert.deepEqual(SHOUT_WHEN.map(([id]) => id), ["now", "tonight", "tomorrow"], "the same three the database takes");
});

test("who's down: names only for the poster", () => {
  assert.equal(downLine({ downs: 2, mine: true, down_names: ["a", "b"] }), "2 down: @a, @b");
  assert.equal(downLine({ downs: 2, mine: false, down_names: null }), "2 down");
  assert.match(downLine({ downs: 0, mine: true }), /Nobody yet/);
  assert.equal(downLine({ downs: 0 }), "Be the first.");
});

test("make it a linkup: same kind, day, area and note; the spot is picked fresh", () => {
  assert.deepEqual(linkupFromShout({ kind: "cruise", when: "tonight", area: "Midtown", note: "Back roads", lat: 33.78, lng: -84.38 }), { kind: "cruise", when: "today", area: "Midtown", note: "Back roads" });
  assert.equal(linkupFromShout({ kind: "hang", when: "now" }).when, "now");
  assert.equal(linkupFromShout({ kind: "photos", when: "tomorrow", area: null, note: null }).area, "");
});
