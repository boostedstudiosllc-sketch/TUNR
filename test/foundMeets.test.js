import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFoundMeets } from "../scripts/check-found-meets.mjs";
import { whenLabel } from "../src/lib/foundMeetRules.js";

const good = { title: "Macon Night Meet", kind: "meet", starts_local: "2026-12-05T18:00", location: "Macon Mall, Macon, GA", source_url: "https://example.com/e/1", instagram: "@macon.meets" };

test("the finder's file is checked before it reaches the database", () => {
  assert.deepEqual(checkFoundMeets({ meets: [good] }), []);
  assert.deepEqual(checkFoundMeets({}), ['The file needs a "meets" list.']);
  const bad = checkFoundMeets({ meets: [{ ...good, starts_local: "Dec 5 6pm", source_url: "http://x.com", kind: "party", instagram: "not a handle!" }] });
  assert.equal(bad.length, 4);
  assert.match(bad[0], /starts_local must look like/);
  assert.match(bad[1], /https link/);
  assert.match(checkFoundMeets({ meets: [{ ...good, location: "" }] })[0], /needs a location/);
});

test("found meet times read as written (they're already Georgia time)", () => {
  assert.equal(whenLabel("2026-12-05T18:00"), "Sat, Dec 5 · 6:00 PM");
  assert.equal(whenLabel("2026-12-06T09:30"), "Sun, Dec 6 · 9:30 AM");
  assert.equal(whenLabel("2026-12-06T00:05"), "Sun, Dec 6 · 12:05 AM");
});
