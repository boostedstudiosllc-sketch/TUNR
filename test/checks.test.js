import test from "node:test";
import assert from "node:assert/strict";
import { dHashFromGrey, hammingHex } from "../src/lib/phash.js";
import { judgeGeocode, geocodeLocation } from "../src/lib/geocode.js";
import { normalizeFlyer } from "../api/_lib/flyer.js";

const NOW = new Date("2026-10-12T16:00:00Z");

// A 9×8 "image" as brightness values.
const gradient = Array.from({ length: 72 }, (_, i) => (i % 9) * 20 + Math.floor(i / 9) * 3);

test("the same flyer, recompressed, fingerprints within a few bits", () => {
  const original = dHashFromGrey(gradient);
  assert.match(original, /^[0-9a-f]{16}$/);
  // Small brightness noise, like JPEG recompression.
  const noisy = gradient.map((v, i) => v + ((i * 7) % 3) - 1);
  assert.ok(hammingHex(original, dHashFromGrey(noisy)) <= 6);
  // Brighter overall (a filter) changes nothing: only neighbours are compared.
  assert.equal(dHashFromGrey(gradient.map((v) => v * 1.3 + 10)), original);
  // A different picture is far away.
  const other = Array.from({ length: 72 }, (_, i) => ((i * 37) % 11) * 23);
  assert.ok(hammingHex(original, dHashFromGrey(other)) > 15);
});

const feature = (over) => ({
  features: [
    {
      id: "address.1",
      place_type: ["address"],
      relevance: 1,
      center: [-84.29, 33.39],
      place_name: "1500 Tara Pl, Hampton, Georgia 30228, United States",
      context: [{ id: "place.9", text: "Hampton" }, { id: "region.5", short_code: "US-GA", text: "Georgia" }],
      ...over,
    },
  ],
});

test("an address is found, with its coordinates and state", () => {
  assert.deepEqual(judgeGeocode(feature({})), {
    status: "found",
    lat: 33.39,
    lng: -84.29,
    state: "GA",
    placeName: "1500 Tara Pl, Hampton, Georgia 30228, United States",
  });
  assert.equal(judgeGeocode(feature({ place_type: ["poi"] })).status, "found");
  assert.equal(judgeGeocode(feature({ place_type: ["place"] })).status, "area");
});

test("outside Georgia still pins; weak matches and empty results are caught", () => {
  const sc = judgeGeocode(feature({ center: [-82.2, 34.9], context: [{ id: "region.7", short_code: "US-SC", text: "South Carolina" }] }));
  assert.equal(sc.status, "found");
  assert.equal(sc.state, "SC");
  assert.equal(sc.lat, 34.9);
  assert.equal(judgeGeocode(feature({ relevance: 0.5 })).status, "none");
  assert.equal(judgeGeocode({ features: [] }).status, "none");
  // A match on the state itself carries its code in properties.
  assert.equal(
    judgeGeocode(feature({ id: "region.5", place_type: ["region"], context: [], properties: { short_code: "US-GA" } })).status,
    "area"
  );
});

test("the lookup never throws, and needs a token", async () => {
  assert.equal((await geocodeLocation("x st", "Atlanta, GA", {})).status, "none");
  const failing = async () => {
    throw new Error("offline");
  };
  assert.equal((await geocodeLocation("1 Main St", "Atlanta, GA", { token: "t", fetchImpl: failing })).status, "none");
  let asked = "";
  const ok = async (url) => {
    asked = url;
    return new Response(JSON.stringify(feature({})));
  };
  const r = await geocodeLocation("1500 Tara Pl", "Hampton, GA", { token: "t", fetchImpl: ok });
  assert.equal(r.status, "found");
  assert.match(asked, /1500%20Tara%20Pl%2C%20Hampton%2C%20GA\.json\?country=us/);
});

test("a weekday that disagrees with the date is flagged first in the check list", () => {
  const ok = normalizeFlyer({ is_meet: true, date: "2026-10-24", weekday: "SAT" }, NOW);
  assert.equal(ok.dateConflict, false);
  const bad = normalizeFlyer({ is_meet: true, date: "2026-10-23", weekday: "Saturdays", check: ["x"] }, NOW);
  assert.equal(bad.dateConflict, true);
  assert.match(bad.check[0], /says Saturday, but the date read is Friday, Oct 23/);
  assert.equal(normalizeFlyer({ is_meet: true, date: "2026-10-23", weekday: "tonight" }, NOW).dateConflict, false);
});
