import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPhoto, searchUrl, findCarPhoto, CAR_LIST } from "../src/lib/wikimediaCars.js";

const page = (index, title, { w = 3000, h = 2000, license = "CC BY-SA 4.0", artist = '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' } = {}) => ({
  index,
  title: `File:${title}`,
  imageinfo: [{ width: w, height: h, thumburl: `https://upload.wikimedia.org/thumb/${index}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${index}`, extmetadata: { LicenseShortName: { value: license }, Artist: { value: artist } } }],
});

test("wikimedia: keeps a wide, free, whole-car shot that names the car", () => {
  const pages = {
    1: page(1, "Nissan GT-R R35 interior.jpg"),
    2: page(2, "Nissan GT-R R35 engine bay.jpg"),
    3: page(3, "Nissan GT-R tall.jpg", { w: 1200, h: 1800 }),
    4: page(4, "Nissan GT-R small.jpg", { w: 640, h: 400 }),
    5: page(5, "Nissan GT-R NC.jpg", { license: "CC BY-NC 2.0" }),
    6: page(6, "Nissan GT-R GFDL.jpg", { license: "GFDL" }),
    7: page(7, "Hot Wheels Nissan GT-R.jpg"),
    8: page(8, "Some street in Tokyo.jpg"),
    9: page(9, "2017 Nissan GT-R R35 front 3-4.jpg"),
    10: page(10, "Nissan GT-R at a show.jpg", { license: "CC0" }),
  };
  const got = pickPhoto(pages, "Nissan GT-R R35");
  assert.equal(got.photo_url, "https://upload.wikimedia.org/thumb/9.jpg");
  assert.equal(got.source_url, "https://commons.wikimedia.org/wiki/File:9");
  assert.equal(got.credit, "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons");
  assert.equal(pickPhoto({ 1: pages[1], 5: pages[5] }, "Nissan GT-R R35"), null);
  assert.equal(pickPhoto(undefined, "x"), null);
});

test("wikimedia: whole words only, so 'Trim' or 'Primera' don't count as rims", () => {
  assert.ok(pickPhoto({ 1: page(1, "Honda Civic Type R Sport trim.jpg") }, "Honda Civic Type R"));
  assert.equal(pickPhoto({ 1: page(1, "Honda Civic Type R wheels.jpg") }, "Honda Civic Type R"), null);
});

test("wikimedia: the request, and failures with their reason", async () => {
  const u = new URL(searchUrl("Toyota GR Supra"));
  assert.equal(u.searchParams.get("origin"), "*");
  assert.match(u.searchParams.get("gsrsearch"), /^"Toyota GR Supra" -interior/);
  const ok = await findCarPhoto("Toyota GR Supra", async () => new Response(JSON.stringify({ query: { pages: { 1: page(1, "Toyota GR Supra 2020.jpg") } } })));
  assert.ok(ok.photo_url);
  await assert.rejects(findCarPhoto("x", async () => new Response("", { status: 429 })), /Wikimedia said 429/);
  await assert.rejects(findCarPhoto("x", async () => new Response(JSON.stringify({ error: { code: "ratelimited" } }))), /ratelimited/);
  assert.ok(CAR_LIST.length >= 100);
  assert.equal(new Set(CAR_LIST.map(([m, n]) => `${m} ${n}`)).size, CAR_LIST.length);
});
