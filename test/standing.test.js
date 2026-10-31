import { test } from "node:test";
import assert from "node:assert/strict";
import { memberSince, standingLabel, standingLine, rankLine, initials } from "../src/lib/standingText.js";

test("member since", () => {
  assert.equal(memberSince("2025-10-14T15:00:00Z"), "Member since October 2025");
  assert.equal(memberSince(null), "");
});

test("the badge and its words", () => {
  const st = { top: 5, area: "Atlanta", rank: 3, of: 214 };
  assert.equal(standingLabel(st), "Top 5% · Atlanta");
  assert.equal(standingLabel({ top: null }), "");
  assert.match(standingLine(st), /^You're in the top 5% of the car scene in Atlanta: one of its most active members!$/);
  assert.match(standingLine({ top: 25, area: "TUNR" }, "g30.rollie"), /^@g30\.rollie is in the top 25% of the car scene on TUNR: one of its regulars!$/);
  assert.equal(rankLine(st), "#3 of 214 in Atlanta · last 12 months");
});

test("initials", () => {
  assert.equal(initials("karan.laliwala"), "KL");
  assert.equal(initials("boostedstudios"), "B");
  assert.equal(initials(""), "T");
});
