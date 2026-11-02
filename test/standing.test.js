import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSES, classOf, memberSince, sinceShort, standingLabel, positionLine, classLine, slipRows, slipNumber, barcode } from "../src/lib/standingText.js";

test("member since", () => {
  assert.equal(memberSince("2025-10-14T15:00:00Z"), "Member since October 2025");
  assert.equal(memberSince(null), "");
  assert.equal(sinceShort("2025-10-14T15:00:00Z"), "10/2025");
  assert.equal(sinceShort(null), "");
});

test("each tier is a racing class", () => {
  assert.deepEqual(CLASSES.map((c) => c.top), [1, 5, 10, 25]);
  assert.equal(classOf({ top: 1 }).name, "PRO MOD");
  assert.equal(classOf({ top: 5 }).name, "PRO STOCK");
  assert.equal(classOf({ top: 10 }).name, "SUPER STREET");
  assert.equal(classOf({ top: 25 }).name, "STREET");
  assert.equal(classOf({ top: null }), null);
  assert.equal(classOf(null), null);
});

test("the tag, the position and the line", () => {
  const st = { top: 5, area: "Atlanta", rank: 9, of: 214, score: 241 };
  assert.equal(standingLabel(st), "PRO STOCK · Atlanta");
  assert.equal(standingLabel({ top: null }), "");
  assert.equal(positionLine(st), "P9 of 214 in Atlanta");
  assert.equal(positionLine({ rank: 1200, of: 3400, area: "TUNR" }), "P1,200 of 3,400 on TUNR");
  assert.equal(positionLine({ rank: null, of: 30 }), "");
  assert.equal(classLine(st), "You run Pro Stock in Atlanta: one of the scene's heavy hitters. That's the top 5% most active over the last 12 months.");
  assert.match(classLine({ top: 10, area: "TUNR" }, "g30.rollie"), /^@g30\.rollie runs Super Street on TUNR: /);
  assert.equal(classLine({ top: null }), "");
});

test("your own slip shows your activity; others see score and position only", () => {
  const st = { score: 1241, rank: 9, of: 214 };
  const mine = slipRows(st, { checkins: 14, hosted: 3, photos: 22, linkups: 2, posts: 9 });
  assert.deepEqual(mine.map(([l]) => l), ["CHECK-INS", "MEETS HOSTED", "MEET PHOTOS", "LINKUPS", "POSTS", "SCORE", "POSITION"]);
  assert.deepEqual(mine.at(-2), ["SCORE", "1,241"]);
  assert.deepEqual(mine.at(-1), ["POSITION", "P9/214"]);
  assert.deepEqual(slipRows(st).map(([l]) => l), ["SCORE", "POSITION"]);
  assert.deepEqual(slipRows({ score: 0, rank: null, of: 3 }), [["SCORE", "0"]]);
});

test("the slip number and barcode stay the same for a member", () => {
  assert.match(slipNumber("karan.laliwala"), /^No\. \d{6}$/);
  assert.equal(slipNumber("karan.laliwala"), slipNumber("karan.laliwala"));
  assert.notEqual(slipNumber("karan.laliwala"), slipNumber("g30.rollie"));
  const bars = barcode("karan.laliwala");
  assert.equal(bars.length, 44);
  assert.ok(bars.every((w) => w >= 1 && w <= 3));
  assert.deepEqual(barcode("karan.laliwala"), bars);
});
