import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { formEncode, verifyStripeSignature, readRawBody } from "../api/_lib/stripe.js";
import { createHandler as promoteHandler } from "../api/promote.js";
import { createHandler as webhookHandler } from "../api/stripe-webhook.js";

const EVENT = "11111111-2222-3333-4444-555555555555";
const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://tunr.app", STRIPE_WEBHOOK_SECRET: "whsec_test", SUPABASE_SERVICE_ROLE_KEY: "service" };
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

test("stripe form encoding", () => {
  assert.equal(formEncode({ a: 1, b: { c: "x y", d: { 0: 2 } }, skip: null }), "a=1&b%5Bc%5D=x%20y&b%5Bd%5D%5B0%5D=2");
});

test("webhook signatures: real ones pass, forged or old ones don't", () => {
  const body = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 10), true);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other", t + 10), false, "wrong secret");
  assert.equal(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, "whsec_test", t + 10), false, "body changed");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test", t + 3600), false, "an old message replayed");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=deadbeef`, "whsec_test", t), false);
  assert.equal(verifyStripeSignature(body, null, "whsec_test", t), false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${"z".repeat(64)}`, "whsec_test", t), false, "a non-hex signature is refused, not a crash");
});

test("raw body from a stream", async () => {
  async function* stream() {
    yield Buffer.from('{"a":');
    yield "1}";
  }
  assert.equal(await readRawBody(stream()), '{"a":1}');
  assert.equal(await readRawBody({ rawBody: "x" }), "x");
});

function promoteFetch({ status = "ok", stripeOk = true } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return reply(init.headers.Authorization === "Bearer good" ? 200 : 401, { id: "u1", email: "host@x.com" });
    if (url.endsWith("/rpc/request_promotion")) return reply(200, status === "ok" ? { status, id: "promo-1", amount_cents: 2900, package: "Spotlight", title: "Lenox Cars & Coffee" } : { status });
    if (url.includes("api.stripe.com")) return stripeOk ? reply(200, { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }) : reply(400, { error: { message: "Invalid API Key" } });
    return reply(404, {});
  };
  f.calls = calls;
  return f;
}
const post = (body = { eventId: EVENT, package: "spotlight" }, token = "good") => ({ method: "POST", headers: { host: "tunr.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });

test("promote: a host gets a Stripe checkout at the database's price", async () => {
  const f = promoteFetch();
  const r = res();
  await promoteHandler({ env, fetchImpl: f })(post(), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.url, "https://checkout.stripe.com/c/pay/cs_1");
  const stripe = f.calls.find((c) => c.url.includes("stripe"));
  assert.match(stripe.init.body, /unit_amount%5D=2900/, "the amount comes from the database, not the phone");
  assert.match(stripe.init.body, /promotion_id%5D=promo-1/);
  assert.match(stripe.init.body, /success_url=https%3A%2F%2Ftunr.app%2F%3Fpromoted%3Dpromo-1/);
  assert.equal(stripe.init.headers.Authorization, "Bearer sk_test_x");
});

test("promote: the problems, each with its own code", async () => {
  const cases = [
    [{}, post(undefined, null), 401, "not_signed_in"],
    [{}, post({ eventId: "x", package: "spotlight" }), 400, "bad_request"],
    [{}, post({ eventId: EVENT, package: "gold" }), 400, "bad_request"],
    [{ status: "not_host" }, post(), 403, "not_host"],
    [{ status: "already" }, post(), 409, "already"],
    [{ status: "meet_over" }, post(), 400, "meet_over"],
    [{ stripeOk: false }, post(), 502, "stripe_failed"],
  ];
  for (const [opts, req, code, error] of cases) {
    const r = res();
    await promoteHandler({ env, fetchImpl: promoteFetch(opts) })(req, r);
    assert.deepEqual([r.code, r.body.error], [code, error], error);
  }
  const r = res();
  await promoteHandler({ env: { ...env, STRIPE_SECRET_KEY: "" }, fetchImpl: promoteFetch() })(post(), r);
  assert.deepEqual([r.code, r.body.error], [503, "payments_not_set_up"]);
});

function signed(event, t = 1_800_000_000) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${raw}`).digest("hex");
  return { method: "POST", rawBody: raw, headers: { "stripe-signature": `t=${t},v1=${sig}` } };
}
const paidEvent = { type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", amount_total: 2900, metadata: { promotion_id: "promo-1" } } } };

test("webhook: a paid checkout turns the promotion on, with the service key", async () => {
  const calls = [];
  const f = async (url, init) => (calls.push({ url, init }), reply(200, { status: "ok" }));
  const r = res();
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(signed(paidEvent), r);
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rpc\/activate_promotion$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer service");
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_id: "promo-1", p_session: "cs_1", p_amount_cents: 2900 });
});

test("webhook: forged, unpaid and other events don't turn anything on", async () => {
  const calls = [];
  const f = async (url) => (calls.push(url), reply(200, {}));
  let r = res();
  const forged = { ...signed(paidEvent), headers: { "stripe-signature": "t=1800000000,v1=00" } };
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(forged, r);
  assert.deepEqual([r.code, r.body.error], [400, "bad_signature"]);
  r = res();
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(signed({ ...paidEvent, data: { object: { ...paidEvent.data.object, payment_status: "unpaid" } } }), r);
  assert.equal(r.code, 200);
  r = res();
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(signed({ type: "charge.refunded", data: { object: {} } }), r);
  assert.equal(r.code, 200);
  assert.equal(calls.length, 0, "nothing was activated");
  r = res();
  await webhookHandler({ env: { ...env, STRIPE_WEBHOOK_SECRET: "" }, fetchImpl: f })(signed(paidEvent), r);
  assert.equal(r.code, 503);
});

// ---------- the Discover list (src/lib/promoRules.js) ----------
import { withPromoted, pinPromoted, priceLabel } from "../src/lib/promoRules.js";

test("promoted meets are marked and pinned first, Spotlight before Featured", () => {
  const events = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const marked = withPromoted(events, [
    { event_id: "c", package: "featured", banner: false },
    { event_id: "d", package: "spotlight", banner: true },
  ]);
  assert.equal(marked[2].promoted, "featured");
  assert.equal(marked[3].promotedBanner, true);
  assert.equal(marked[0].promoted, undefined);
  assert.deepEqual(pinPromoted(marked).map((e) => e.id), ["d", "c", "a", "b"]);
  assert.equal(withPromoted(events, []), events, "nothing promoted: the same list");
  const lots = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, promoted: "featured" }));
  assert.deepEqual(pinPromoted([...lots, { id: "x" }], 3).slice(0, 4).map((e) => e.id), ["p0", "p1", "p2", "p3"], "at most 3 pinned; the rest keep their place");
});

test("prices in words", () => {
  assert.equal(priceLabel(1500), "$15");
  assert.equal(priceLabel(2950), "$29.50");
  assert.equal(priceLabel(undefined), "");
});
