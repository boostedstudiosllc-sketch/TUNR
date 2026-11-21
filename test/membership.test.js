import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { membershipFromSubscription } from "../api/_lib/stripe.js";
import { createHandler as membershipHandler } from "../api/_routes/membership.js";
import { createHandler as webhookHandler } from "../api/_routes/stripe-webhook.js";
import { perksList, priceLabel, yearlySaving, statusLine, errorMessage, shortDate } from "../src/lib/memberRules.js";
import { restoreOffer } from "../src/lib/pitStopRules.js";

const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://tunr.app", STRIPE_WEBHOOK_SECRET: "whsec_test", SUPABASE_SERVICE_ROLE_KEY: "service" };
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

function apiFetch({ status = "ok", customer = null, rows = [], subs = [], stripe = [200, { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }] } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return reply(init.headers.Authorization === "Bearer good" ? 200 : 401, { id: "u1", email: "m@x.com" });
    if (url.endsWith("/rpc/start_membership")) return reply(200, status === "ok" ? { status, plan: JSON.parse(init.body).p_plan, name: "Yearly", price_cents: 3999, customer } : { status });
    if (url.includes("/rest/v1/memberships")) return reply(200, rows);
    if (url.includes("api.stripe.com/v1/subscriptions")) return reply(200, { data: subs });
    if (url.includes("api.stripe.com")) return reply(stripe[0], stripe[1]);
    return reply(404, {});
  };
  f.calls = calls;
  return f;
}
const post = (body, token = "good") => ({ method: "POST", headers: { host: "tunr.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });

test("join: a subscription checkout at the database's price, tagged with the member", async () => {
  const f = apiFetch();
  const r = res();
  await membershipHandler({ env, fetchImpl: f })(post({ action: "join", plan: "year" }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.url, "https://checkout.stripe.com/c/pay/cs_1");
  const s = f.calls.find((c) => c.url.includes("api.stripe.com")).init.body;
  assert.match(s, /mode=subscription/);
  assert.match(s, /unit_amount%5D=3999/, "the price comes from the database");
  assert.match(s, /recurring%5D%5Binterval%5D=year/);
  assert.match(s, /subscription_data%5Bmetadata%5D%5Buser_id%5D=u1/, "every subscription event knows whose it is");
  assert.match(s, /customer_email=m%40x.com/);
  assert.match(s, /success_url=https%3A%2F%2Ftunr.app%2F%3Fmember%3Dwelcome/);
});

test("join: a returning member reuses their Stripe customer", async () => {
  const f = apiFetch({ customer: "cus_9" });
  await membershipHandler({ env, fetchImpl: f })(post({ action: "join", plan: "month" }), res());
  const s = f.calls.find((c) => c.url.includes("checkout/sessions")).init.body;
  assert.match(s, /customer=cus_9/);
  assert.doesNotMatch(s, /customer_email/);
  assert.match(f.calls.find((c) => c.url.includes("/v1/subscriptions")).url, /customer=cus_9/, "Stripe is asked first");
});

test("join: a second checkout before the webhook lands is refused", async () => {
  const f = apiFetch({ customer: "cus_9", subs: [{ id: "sub_1", status: "active" }] });
  const r = res();
  await membershipHandler({ env, fetchImpl: f })(post({ action: "join", plan: "month" }), r);
  assert.deepEqual([r.code, r.body.error], [409, "already"]);
  assert.equal(f.calls.some((c) => c.url.includes("checkout/sessions")), false, "no second checkout");
  const ok = apiFetch({ customer: "cus_9", subs: [{ id: "sub_0", status: "canceled" }] });
  const r2 = res();
  await membershipHandler({ env, fetchImpl: ok })(post({ action: "join", plan: "month" }), r2);
  assert.equal(r2.code, 200, "an old cancelled one doesn't block rejoining");
});

test("manage: Stripe's billing page for your own customer", async () => {
  const f = apiFetch({ rows: [{ stripe_customer: "cus_9" }], stripe: [200, { url: "https://billing.stripe.com/p/session/x" }] });
  const r = res();
  await membershipHandler({ env, fetchImpl: f })(post({ action: "manage" }), r);
  assert.equal(r.body.url, "https://billing.stripe.com/p/session/x");
  const call = f.calls.find((c) => c.url.includes("api.stripe.com"));
  assert.match(call.url, /billing_portal\/sessions$/);
  assert.match(call.init.body, /customer=cus_9/);
  assert.match(f.calls.find((c) => c.url.includes("memberships")).url, /user_id=eq.u1/, "only your own row");
});

test("membership API: the problems, each with its own code", async () => {
  const cases = [
    [{}, post({ action: "join", plan: "year" }, null), 401, "not_signed_in"],
    [{}, post({ action: "join", plan: "lifetime" }), 400, "bad_request"],
    [{}, post({ action: "cancel" }), 400, "bad_request"],
    [{ status: "already" }, post({ action: "join", plan: "year" }), 409, "already"],
    [{ status: "unconfirmed" }, post({ action: "join", plan: "year" }), 400, "unconfirmed"],
    [{ stripe: [400, { error: { message: "Invalid API Key" } }] }, post({ action: "join", plan: "year" }), 502, "stripe_failed"],
    [{ rows: [] }, post({ action: "manage" }), 404, "no_subscription"],
    [{ rows: [{ stripe_customer: "cus_9" }], stripe: [400, { error: { message: "No configuration provided and your test mode default configuration has not been created." } }] }, post({ action: "manage" }), 503, "billing_page_not_set_up"],
  ];
  for (const [opts, req, code, error] of cases) {
    const r = res();
    await membershipHandler({ env, fetchImpl: apiFetch(opts) })(req, r);
    assert.deepEqual([r.code, r.body.error], [code, error], error);
  }
  const r = res();
  await membershipHandler({ env: { ...env, STRIPE_SECRET_KEY: "" }, fetchImpl: apiFetch() })(post({ action: "join", plan: "year" }), r);
  assert.deepEqual([r.code, r.body.error], [503, "payments_not_set_up"]);
});

function signed(event, t = 1_800_000_000) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${raw}`).digest("hex");
  return { method: "POST", rawBody: raw, headers: { "stripe-signature": `t=${t},v1=${sig}` } };
}
async function hook(event) {
  const calls = [];
  const f = async (url, init) => (calls.push({ url, body: JSON.parse(init.body) }), reply(200, { status: "ok" }));
  const r = res();
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(signed(event), r);
  return { r, calls };
}

test("webhook: a finished subscription checkout makes them a member", async () => {
  const { r, calls } = await hook({ type: "checkout.session.completed", created: 1_800_000_000, data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: "sub_1", client_reference_id: "u1", metadata: { kind: "membership", user_id: "u1", plan: "year" } } } });
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rpc\/sync_membership$/);
  assert.deepEqual(calls[0].body, { p_user: "u1", p_status: "active", p_plan: "year", p_until: null, p_cancel_at: null, p_customer: "cus_1", p_subscription: "sub_1", p_event_at: "2027-01-15T08:00:00.000Z" });
});

test("webhook: renewals, cancels and endings update membership", async () => {
  const sub = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: true, metadata: { kind: "membership", user_id: "u1" }, items: { data: [{ current_period_end: 1_802_592_000, price: { recurring: { interval: "month" } } }] } };
  let { calls } = await hook({ type: "customer.subscription.updated", created: 1_800_000_100, data: { object: sub } });
  assert.equal(calls[0].body.p_until, "2027-02-14T08:00:00.000Z", "the period end from the subscription item (newer Stripe versions)");
  assert.equal(calls[0].body.p_cancel_at, calls[0].body.p_until, "cancelled: it ends at the period end");
  assert.equal(calls[0].body.p_plan, "month");
  ({ calls } = await hook({ type: "customer.subscription.deleted", created: 1_800_000_200, data: { object: { ...sub, status: "active" } } }));
  assert.equal(calls[0].body.p_status, "canceled", "a deleted subscription always ends it");
  ({ calls } = await hook({ type: "customer.subscription.updated", data: { object: { ...sub, metadata: {} } } }));
  assert.equal(calls.length, 0, "someone else's subscription (not TUNR+) is ignored");
});

test("subscription events read older Stripe versions too", () => {
  const m = membershipFromSubscription({ id: "sub_2", customer: { id: "cus_2" }, status: "past_due", current_period_end: 1_802_592_000, metadata: { user_id: "u2", plan: "year" } }, "customer.subscription.updated");
  assert.deepEqual(m, { p_user: "u2", p_status: "past_due", p_plan: "year", p_until: "2027-02-14T08:00:00.000Z", p_cancel_at: null, p_customer: "cus_2", p_subscription: "sub_2" });
});

test("TUNR+ perks, prices and status in words", () => {
  assert.match(perksList(30).find((p) => p.icon === "🔥").text, /once a month/);
  assert.match(perksList(14).find((p) => p.icon === "🔥").text, /once every 14 days/);
  assert.equal(priceLabel(499), "$4.99");
  assert.equal(priceLabel(4000), "$40");
  assert.equal(yearlySaving([{ id: "month", price_cents: 499 }, { id: "year", price_cents: 3999 }]), 33);
  assert.equal(yearlySaving([{ id: "month", price_cents: 499 }, { id: "year", price_cents: 6000 }]), 0, "no saving, no badge");
  assert.equal(statusLine({ member: false }), "");
  assert.equal(shortDate("2026-12-21T15:00:00Z", Date.parse("2026-11-21T12:00:00Z")), "Dec 21", "this year: no year");
  assert.equal(shortDate("2027-11-21T15:00:00Z", Date.parse("2026-11-21T12:00:00Z")), "Nov 21, 2027", "a yearly renewal shows its year");
  assert.equal(priceLabel(512345), "$5,123.45");
  assert.equal(statusLine({ member: true, via: "stripe", plan: "month", cancel_at: "2026-12-21T15:00:00Z" }, Date.parse("2026-11-21T12:00:00Z")), "Cancelled. You keep everything until Dec 21.");
  assert.equal(statusLine({ member: true, via: "admin" }), "Free membership from TUNR.");
  assert.equal(statusLine({ member: true, all_access: true }), "All access: everything's unlocked.");
});

test("membership errors say what went wrong", () => {
  assert.match(errorMessage(503, { error: "payments_not_set_up" }), /aren't switched on/);
  assert.equal(errorMessage(502, { error: "stripe_failed", detail: "Invalid API Key" }), "The payment page wouldn't open. (Invalid API Key)");
  assert.equal(errorMessage(500, {}), "Couldn't open the payment page. (status 500)");
});

test("the streak restore offer uses the wait from the database", () => {
  assert.match(restoreOffer({ lost_streak: 9, can_restore: true, restore_days: 30 }).text, /once a month/);
  assert.match(restoreOffer({ lost_streak: 9, restore_days: 90 }).text, /once every 90 days/);
});
