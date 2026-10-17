import test from "node:test";
import assert from "node:assert/strict";
import { checkEmail, domainExists, editDistance } from "../src/lib/emailCheck.js";

const fix = (e) => checkEmail(e).suggestion || null;

test("real addresses pass", () => {
  for (const e of [
    "karan@gmail.com",
    " Karan.L+tunr@Gmail.com ",
    "a@outlook.com",
    "a@hotmail.com",
    "a@yahoo.com",
    "a@icloud.com",
    "a@boostedstudios.co",
    "a@my-shop.net",
    "a@emory.edu",
    "a@mail.com",
    "a@hotmail.co.uk",
  ]) {
    assert.deepEqual(checkEmail(e), { ok: true }, e);
  }
});

test("misspelled gmail, outlook, hotmail, yahoo and icloud are caught with a fix", () => {
  assert.equal(fix("karan@gmial.com"), "karan@gmail.com");
  assert.equal(fix("karan@gamil.com"), "karan@gmail.com");
  assert.equal(fix("karan@gmai.com"), "karan@gmail.com");
  assert.equal(fix("karan@gmaill.com"), "karan@gmail.com");
  assert.equal(fix("karan@gnail.com"), "karan@gmail.com");
  assert.equal(fix("karan@hotmial.com"), "karan@hotmail.com");
  assert.equal(fix("karan@hotmal.com"), "karan@hotmail.com");
  assert.equal(fix("karan@outlok.com"), "karan@outlook.com");
  assert.equal(fix("karan@outloook.com"), "karan@outlook.com");
  assert.equal(fix("karan@yaho.com"), "karan@yahoo.com");
  assert.equal(fix("karan@icoud.com"), "karan@icloud.com");
});

test("the ending has to be spelled right too", () => {
  assert.equal(fix("karan@gmail.con"), "karan@gmail.com");
  assert.equal(fix("karan@gmail.co"), "karan@gmail.com");
  assert.equal(fix("karan@gmail.cm"), "karan@gmail.com");
  assert.equal(fix("karan@gmail.net"), "karan@gmail.com");
  assert.equal(fix("karan@hotmail.vom"), "karan@hotmail.com");
  assert.equal(fix("karan@aol.con"), "karan@aol.com");
  assert.equal(fix("karan@comcast.met"), "karan@comcast.net");
  assert.equal(fix("karan@myshop.con"), "karan@myshop.com");
  assert.equal(fix("karan@gmailcom"), "karan@gmail.com");
});

test("broken and throwaway addresses are refused with a reason", () => {
  assert.match(checkEmail("karan gmail.com").message, /spaces/);
  assert.match(checkEmail("karangmail.com").message, /one @/);
  assert.match(checkEmail("karan@@gmail.com").message, /one @/);
  assert.match(checkEmail("karan@shop").message, /ending/);
  assert.match(checkEmail("x@mailinator.com").message, /Throwaway/);
  assert.match(checkEmail("x@yopmail.com").message, /Throwaway/);
  assert.equal(checkEmail("").ok, false);
});

test("edit distance counts a swap as one", () => {
  assert.equal(editDistance("gmail", "gamil"), 1);
  assert.equal(editDistance("gmail", "gmail"), 0);
  assert.equal(editDistance("outlook", "outback"), 3);
});

test("a domain that doesn't exist fails; a failed lookup doesn't", async () => {
  const dns = (status) => async () => new Response(JSON.stringify({ Status: status }));
  assert.equal(await domainExists("a@nosuchplace123.com", { fetchImpl: dns(3) }), false);
  assert.equal(await domainExists("a@realshop.com", { fetchImpl: dns(0) }), true);
  assert.equal(await domainExists("a@realshop.com", { fetchImpl: async () => { throw new Error("offline"); } }), true);
  assert.equal(await domainExists("a@gmail.com", { fetchImpl: dns(3) }), true);
});
