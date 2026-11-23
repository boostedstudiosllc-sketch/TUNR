import { test } from "node:test";
import assert from "node:assert/strict";
import { cardContent } from "../src/lib/shareCard.js";

const now = Date.parse("2026-11-23T13:35:00Z");
const opts = { origin: "https://tunr.app", now };

test("a meet card", () => {
  const c = cardContent("meet", { id: "e1", slug: "show-night", title: "Show Night Lenox", when: "Tue, Nov 24 · 7:00 PM", city: "Atlanta", location: "Lenox Square", host: "drift.king", vibe: "JDM", goingCount: 42, verified: true, photoUrl: "https://x/p.jpg" }, opts);
  assert.equal(c.kicker, "CAR MEET");
  assert.equal(c.sub, "Tue, Nov 24 · 7:00 PM · Atlanta");
  assert.deepEqual(c.lines, ["📍 Lenox Square", "Hosted by @drift.king"]);
  assert.deepEqual(c.chips, ["JDM", "42 going", "✓ Verified host"]);
  assert.equal(c.link, "https://tunr.app/m/show-night");
  assert.equal(c.image, "https://x/p.jpg");
  assert.equal(c.footer, "Nov 23, 2026 @ 8:35 AM", "a timestamp like a receipt, Atlanta time");
  assert.equal(cardContent("meet", { id: "e2", title: "X", promoted: "spotlight" }, opts).kicker, "⭐ PROMOTED MEET");
  assert.deepEqual(cardContent("meet", { id: "e3", title: "X", goingCount: 0 }, opts).chips, [], "no '0 going'");
});

test("a car card", () => {
  const c = cardContent("car", { id: "v1", year: 2019, make: "BMW", model: "540i", trim: "xDrive G30", nickname: "Midnight", engine: "3.0L B58", horsepower: 420, torque: 450, drivetrain: "AWD", transmission: "Automatic", mods: [{}, {}], owner: { username: "karan" } }, opts);
  assert.equal(c.title, "Midnight");
  assert.equal(c.sub, "2019 BMW 540i");
  assert.deepEqual(c.lines, ["⚙️ 3.0L B58", "420 hp · 450 lb-ft"]);
  assert.deepEqual(c.chips, ["AWD", "Automatic", "2 mods"]);
  assert.equal(c.link, "https://tunr.app/?car=v1");
  assert.equal(cardContent("car", { id: "v2", year: 2018, make: "BMW", model: "M2", trim: "F87", owner: { username: "ana" } }, opts).sub, "F87 · @ana");
});

test("a part card", () => {
  const c = cardContent("listing", { id: "l1", title: "G30 adaptive LED headlight", price_cents: 65000, city: "Duluth", fitLabel: "2017–2020 BMW 540i G30", part_number: "63117214961", conditionLabel: "Used", categoryLabel: "Lighting", photos: ["https://x/1.jpg"] }, opts);
  assert.equal(c.sub, "$650 · Duluth");
  assert.deepEqual(c.lines, ["🚗 Fits 2017–2020 BMW 540i G30", "Part # 63117214961"]);
  assert.equal(c.link, "https://tunr.app/?open=listing:l1");
  assert.equal(cardContent("listing", { id: "l2", title: "Seat", price_cents: null }, opts).sub, "Make an offer");
  assert.equal(cardContent("listing", { id: "l3", title: "Seat", price_cents: 0 }, opts).sub, "Free");
  assert.equal(cardContent("listing", { id: "l4", title: "Seat", price_cents: 12550 }, opts).sub, "$125.50");
  assert.throws(() => cardContent("pizza", {}, opts), /Unknown share card/);
});
