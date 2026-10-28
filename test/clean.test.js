import test from "node:test";
import assert from "node:assert/strict";
import { cleanText } from "../src/lib/clean.js";

test("swear words become ***, whole words only", () => {
  assert.equal(cleanText("this is fucking sick").text, "this is *** sick");
  assert.equal(cleanText("SHIT happens").text, "*** happens");
  assert.equal(cleanText("what an asshole").text, "what an ***");
  assert.ok(cleanText("damn bitches").changed);
});

test("everyday words that contain them are left alone", () => {
  for (const ok of ["class", "pass the assessment", "cocktail", "Scunthorpe", "grass", "therapist", "cucumber", "Essex"]) {
    const r = cleanText(ok);
    assert.equal(r.text, ok);
    assert.equal(r.changed, false);
  }
});
