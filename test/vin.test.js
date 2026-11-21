import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanVin, vinCheckDigitOk, vinProblem, fromVpic, decodedLine, maskVin } from "../src/lib/vin.js";
import { createHandler } from "../api/_routes/vin.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/vpic-2019-540i.json", import.meta.url)));
const VIN540 = "WBAJE7C52KWW23963"; // decoded by NHTSA as a 2019 BMW 540i xDrive

test("VINs are tidied and checked", () => {
  assert.equal(cleanVin(" wbaje7c52-kww 23963 "), VIN540);
  assert.equal(cleanVin("1HGCM82633AOO4352"), "1HGCM82633A004352", "O typed for zero is fixed");
  assert.equal(vinCheckDigitOk("1HGCM82633A004352"), true, "the textbook example VIN");
  assert.equal(vinCheckDigitOk("1M8GDM9AXKP042788"), true, "an X check digit");
  assert.equal(vinCheckDigitOk(VIN540), true);
  assert.equal(vinCheckDigitOk("WBAJE7C5XKWW23963"), false, "one character off");
  assert.match(vinProblem(""), /17-character VIN/);
  assert.match(vinProblem("WBAJE7C52KWW2396"), /that's 16/);
  assert.match(vinProblem("WBAJE7C5XKWW23963"), /probably a typo/);
  assert.equal(vinProblem(VIN540), "");
  assert.equal(maskVin(VIN540), "•••••••••••W23963", "only the last 6 shown");
});

test("NHTSA's answer becomes garage fields", () => {
  const d = fromVpic(fixture.Results[0], ["Audi", "BMW", "Mercedes-Benz", "Other"]);
  assert.deepEqual(d, { year: 2019, make: "BMW", model: "540i", trim: "xDrive", series: "5-Series", body: "Sedan", drivetrain: "AWD", transmission: "Automatic", engine: "3.0L 6-cylinder" });
  assert.equal(decodedLine(d), "2019 BMW 540i xDrive · Sedan · AWD · Automatic · 3.0L 6-cylinder");
  assert.equal(fromVpic({ Make: "MERCEDES-BENZ", Model: "C 300", DriveType: "4WD/4-Wheel Drive/4x4" }, ["Mercedes-Benz"]).make, "Mercedes-Benz");
  assert.equal(fromVpic({ Make: "LUCID", Model: "Air" }, ["BMW", "Other"]).make, "Other", "a make TUNR doesn't list");
  assert.equal(fromVpic({ Make: "HONDA", Model: "Civic" }).make, "HONDA", "the server passes the make through");
  assert.equal(fromVpic({ Make: "BMW", Model: "M2", TransmissionStyle: "Dual-Clutch Transmission (DCT)", DriveType: "RWD/Rear-Wheel Drive" }).transmission, "DCT");
  assert.equal(fromVpic({ Make: "Subaru", Model: "WRX", TransmissionStyle: "Manual/Standard", DriveType: "AWD/All-Wheel Drive" }).drivetrain, "AWD");
  assert.equal(fromVpic({}), null);
});

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" };
const fetchWith = (vpic) => async (url) => {
  if (url.endsWith("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "u1" }) };
  if (url.includes("vpic.nhtsa.dot.gov")) return vpic(url);
  return { ok: false, status: 404, json: async () => ({}) };
};

test("the VIN route decodes with NHTSA and stores nothing", async () => {
  const seen = [];
  const r = res();
  await createHandler({ env, fetchImpl: fetchWith((url) => (seen.push(url), { ok: true, status: 200, json: async () => fixture })) })({ method: "POST", headers: { authorization: "Bearer t" }, body: { vin: "wbaje7c52kww23963" } }, r);
  assert.equal(r.code, 200);
  assert.equal(r.body.decoded.model, "540i");
  assert.match(seen[0], /DecodeVinValuesExtended\/WBAJE7C52KWW23963\?format=json$/);
});

test("the VIN route's problems, each with its own code", async () => {
  const ok = () => ({ ok: true, status: 200, json: async () => fixture });
  const cases = [
    [{ authorization: "" }, { vin: VIN540 }, ok, 401, "not_signed_in"],
    [{ authorization: "Bearer t" }, { vin: "WBAJE7C5XKWW23963" }, ok, 400, "bad_vin"],
    [{ authorization: "Bearer t" }, { vin: VIN540 }, () => ({ ok: false, status: 503, json: async () => ({}) }), 502, "decoder_failed"],
    [{ authorization: "Bearer t" }, { vin: VIN540 }, () => ({ ok: true, status: 200, json: async () => ({ Results: [{ Make: "", ErrorText: "11 - Incorrect Model Year" }] }) }), 404, "not_found"],
  ];
  for (const [headers, body, vpic, code, error] of cases) {
    const r = res();
    await createHandler({ env, fetchImpl: fetchWith(vpic) })({ method: "POST", headers, body }, r);
    assert.deepEqual([r.code, r.body.error], [code, error], error);
  }
});

// Security audit: with the Supabase settings missing, the route must refuse
// (503 not_configured, like read-flyer, shop and turn), not skip the
// sign-in check and decode for any made-up token.
test("the VIN route refuses when it can't check who's asking", async () => {
  const seen = [];
  const r = res();
  await createHandler({ env: {}, fetchImpl: async (url) => (seen.push(url), { ok: true, status: 200, json: async () => fixture }) })(
    { method: "POST", headers: { authorization: "Bearer not-a-real-session" }, body: { vin: VIN540 } },
    r,
  );
  assert.deepEqual([r.code, r.body?.error], [503, "not_configured"], "a made-up token gets a decode when the Supabase settings are missing");
  assert.equal(seen.length, 0, "NHTSA isn't called for an unchecked caller");
});
