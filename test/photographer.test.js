import test from "node:test";
import assert from "node:assert/strict";
import { photoPageLink, crowdLine } from "../src/lib/photographer.js";

test("a photo page becomes an Instagram link or a website link", () => {
  assert.deepEqual(photoPageLink("@shots.by.k"), { href: "https://www.instagram.com/shots.by.k/", label: "@shots.by.k" });
  assert.deepEqual(photoPageLink("shotsbyk"), { href: "https://www.instagram.com/shotsbyk/", label: "@shotsbyk" });
  assert.deepEqual(photoPageLink("kshoots.com"), { href: "https://kshoots.com/", label: "kshoots.com" });
  assert.equal(photoPageLink("https://www.kshoots.com/cars/").label, "kshoots.com/cars");
  assert.equal(photoPageLink("javascript:alert(1)"), null);
  assert.equal(photoPageLink(""), null);
  assert.equal(photoPageLink("not a link"), null);
});

test("crowdLine counts cars and photographers, skipping zeros", () => {
  assert.equal(crowdLine({ cars: 36, photographers: 8 }), "36 cars · 8 photographers");
  assert.equal(crowdLine({ cars: 1, photographers: 0 }), "1 car");
  assert.equal(crowdLine({ cars: 0, photographers: 1 }), "1 photographer");
  assert.equal(crowdLine({}), "");
});
