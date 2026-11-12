import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_VOICE, shouldOffer, voicePeers, talkingNow, micError } from "../src/lib/voiceMath.js";
import { createHandler, normalizeIceServers, STUN } from "../api/turn.js";

test("exactly one of each pair makes the offer", () => {
  assert.equal(shouldOffer("a", "b"), true);
  assert.equal(shouldOffer("b", "a"), false);
});

test("who's in voice, first come first in", () => {
  const states = [
    { id: "me", joinedAt: 30 },
    { id: "lead", joinedAt: 10 },
    { id: "lead", joinedAt: 50 }, // a second tab: the first one counts
    { id: "s2k", joinedAt: 20 },
    null,
  ];
  const r = voicePeers(states, "me");
  assert.deepEqual(r.peers.map((p) => p.id), ["lead", "s2k"]);
  assert.equal(r.full, false);
  assert.equal(r.count, 3);
  const crowd = Array.from({ length: MAX_VOICE }, (_, i) => ({ id: `p${i}`, joinedAt: i }));
  const late = voicePeers([...crowd, { id: "me", joinedAt: 99 }], "me");
  assert.equal(late.full, true, "the 9th car can't join");
  assert.deepEqual(late.peers, []);
  assert.equal(voicePeers([...crowd, { id: "me", joinedAt: 99 }], "p0").peers.length, MAX_VOICE - 1, "the first 8 still talk to each other");
});

test("talking: on when loud, off only once it's quiet for a moment", () => {
  let s = talkingNow(null, 0.01);
  assert.equal(s.talking, false);
  s = talkingNow(s, 0.1);
  assert.equal(s.talking, true);
  s = talkingNow(s, 0.0);
  assert.equal(s.talking, true, "a short pause between words stays on");
  for (let i = 0; i < 12; i++) s = talkingNow(s, 0);
  assert.equal(s.talking, false);
});

test("microphone problems in plain words", () => {
  assert.match(micError({ name: "NotAllowedError" }), /blocked for TUNR/);
  assert.match(micError({ name: "NotFoundError" }), /No microphone/);
  assert.match(micError({ name: "NotReadableError" }), /Another app/);
  assert.match(micError({ name: "X", message: "boom" }), /\(boom\)/);
});

// ---------- the connection-servers route (api/turn.js) ----------
const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", CLOUDFLARE_TURN_KEY_ID: "kid", CLOUDFLARE_TURN_API_TOKEN: "tok" };
const CONVOY = "11111111-2222-3333-4444-555555555555";
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
function fakeFetch({ member = true, cf = [200, { iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" }] }] } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return reply(init.headers.Authorization === "Bearer good" ? 200 : 401, { id: "me" });
    if (url.endsWith("/rpc/in_live_convoy")) return reply(200, member);
    if (url.includes("rtc.live.cloudflare.com")) return reply(...cf);
    return reply(404, {});
  };
  f.calls = calls;
  return f;
}
const post = (token = "good", body = { convoyId: CONVOY }) => ({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body });

test("turn: only signed-in members of the convoy", async () => {
  let r = res();
  await createHandler({ env, fetchImpl: fakeFetch() })(post(null), r);
  assert.deepEqual([r.code, r.body.error], [401, "not_signed_in"]);
  r = res();
  await createHandler({ env, fetchImpl: fakeFetch() })(post("bad"), r);
  assert.equal(r.code, 401);
  r = res();
  await createHandler({ env, fetchImpl: fakeFetch({ member: false }) })(post(), r);
  assert.deepEqual([r.code, r.body.error], [403, "not_in_convoy"]);
  r = res();
  await createHandler({ env, fetchImpl: fakeFetch() })(post("good", { convoyId: "nope" }), r);
  assert.deepEqual([r.code, r.body.error], [400, "bad_convoy"]);
  r = res();
  await createHandler({ env, fetchImpl: fakeFetch() })({ method: "GET", headers: {} }, r);
  assert.equal(r.code, 405);
});

test("turn: mints relay credentials, keeping the key on the server", async () => {
  const f = fakeFetch();
  const r = res();
  await createHandler({ env, fetchImpl: f })(post(), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.relay, true);
  assert.equal(r.body.iceServers[0].username, "u");
  const cf = f.calls.find((c) => c.url.includes("cloudflare"));
  assert.match(cf.url, /\/v1\/turn\/keys\/kid\/credentials\/generate-ice-servers$/);
  assert.equal(cf.init.headers.Authorization, "Bearer tok");
  assert.ok(!JSON.stringify(r.body).includes("tok"), "the API token never goes to the phone");
});

test("turn: no keys, or Cloudflare down: STUN only, voice still tries", async () => {
  let r = res();
  await createHandler({ env: { ...env, CLOUDFLARE_TURN_KEY_ID: "" }, fetchImpl: fakeFetch() })(post(), r);
  assert.deepEqual(r.body, { iceServers: STUN, relay: false });
  r = res();
  await createHandler({ env, fetchImpl: fakeFetch({ cf: [500, {}] }) })(post(), r);
  assert.deepEqual([r.code, r.body.relay, r.body.error], [200, false, "turn_failed"]);
});

test("turn: either Cloudflare answer shape", () => {
  assert.deepEqual(normalizeIceServers({ iceServers: { urls: ["turn:a"], username: "u", credential: "c" } }), [{ urls: ["turn:a"], username: "u", credential: "c" }]);
  assert.deepEqual(normalizeIceServers({ iceServers: [{ urls: "stun:b" }, { urls: ["http://evil"] }] }), [{ urls: ["stun:b"] }]);
  assert.deepEqual(normalizeIceServers(null), []);
});
