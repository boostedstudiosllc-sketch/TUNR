import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { shippingFromSession } from "../api/_lib/stripe.js";
import { createHandler as shopHandler } from "../api/_routes/shop.js";
import { createHandler as webhookHandler } from "../api/_routes/stripe-webhook.js";
import { cartTotals, addToCart, leftOf, soldOut, orderStatus, errorMessage } from "../src/lib/shopRules.js";

const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", STRIPE_SECRET_KEY: "sk_test_x", SITE_URL: "https://tunr.app", STRIPE_WEBHOOK_SECRET: "whsec_test", SUPABASE_SERVICE_ROLE_KEY: "service" };
const HAT = "11111111-2222-3333-4444-555555555555";
const SHIRT = "11111111-2222-3333-4444-666666666666";
function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
const ORDER = { status: "ok", id: "ord-1", lines: [{ product_id: HAT, name: "TUNR Hat", size: "One size", qty: 1, unit_cents: 2250 }, { product_id: SHIRT, name: "TUNR Shirt", size: "M", qty: 2, unit_cents: 2700 }], shipping_cents: 0, total_cents: 7650 };

function apiFetch({ order = ORDER, stripeOk = true } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return reply(init.headers.Authorization === "Bearer good" ? 200 : 401, { id: "u1", email: "b@x.com" });
    if (url.endsWith("/rpc/start_order")) return reply(200, order);
    if (url.includes("api.stripe.com")) return stripeOk ? reply(200, { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }) : reply(400, { error: { message: "Invalid API Key" } });
    return reply(404, {});
  };
  f.calls = calls;
  return f;
}
const post = (items, token = "good") => ({ method: "POST", headers: { host: "tunr.app", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: { items } });

test("shop: a Stripe checkout at the database's prices, with shipping and an address", async () => {
  const f = apiFetch();
  const r = res();
  await shopHandler({ env, fetchImpl: f })(post([{ product: HAT }, { product: SHIRT, size: "M", qty: 2, price: 1 }]), r);
  assert.equal(r.code, 200);
  const sent = JSON.parse(f.calls.find((c) => c.url.endsWith("/rpc/start_order")).init.body);
  assert.deepEqual(sent.p_items[1], { product: SHIRT, size: "M", qty: 2 }, "a price from the phone is dropped");
  const s = f.calls.find((c) => c.url.includes("api.stripe.com")).init.body;
  assert.match(s, /unit_amount%5D=2250/, "the member price from the database");
  assert.match(s, /TUNR%20Shirt%20\(M\)/);
  assert.doesNotMatch(s, /One%20size/, "no size shown for a hat");
  assert.match(s, /shipping_address_collection%5Ballowed_countries%5D%5B0%5D=US/);
  assert.match(s, /Free%20shipping/);
  assert.match(s, /metadata%5Bkind%5D=shop/);
  assert.match(s, /success_url=https%3A%2F%2Ftunr.app%2F%3Fshop%3Dthanks/);
  assert.match(s, /payment_method_types%5D?%5B?0%5D=card|payment_method_types%5B0%5D=card/, "cards only");
  const exp = Number(/expires_at=(\d+)/.exec(s)[1]);
  assert.ok(exp - Date.now() / 1000 > 30 * 60 && exp - Date.now() / 1000 < 32 * 60, "the payment page expires after about half an hour");
});

test("shop: the problems, each with its own code", async () => {
  const cases = [
    [{}, post([{ product: HAT }], null), 401, "not_signed_in"],
    [{}, post([]), 400, "bad_request"],
    [{}, post([{ product: "x" }]), 400, "bad_request"],
    [{ order: { status: "closed" } }, post([{ product: HAT }]), 403, "closed"],
    [{ order: { status: "sold_out", product: "TUNR Shirt", size: "M", left: 1 } }, post([{ product: SHIRT, size: "M", qty: 2 }]), 409, "sold_out"],
    [{ order: { status: "bad_size" } }, post([{ product: SHIRT, size: "Z" }]), 400, "bad_size"],
    [{ stripeOk: false }, post([{ product: HAT }]), 502, "stripe_failed"],
  ];
  for (const [opts, req, code, error] of cases) {
    const r = res();
    await shopHandler({ env, fetchImpl: apiFetch(opts) })(req, r);
    assert.deepEqual([r.code, r.body.error], [code, error], error);
  }
  const r = res();
  await shopHandler({ env: { ...env, STRIPE_SECRET_KEY: "" }, fetchImpl: apiFetch() })(post([{ product: HAT }]), r);
  assert.deepEqual([r.code, r.body.error], [503, "payments_not_set_up"]);
});

function signed(event, t = 1_800_000_000) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", "whsec_test").update(`${t}.${raw}`).digest("hex");
  return { method: "POST", rawBody: raw, headers: { "stripe-signature": `t=${t},v1=${sig}` } };
}

test("webhook: a paid shop order is marked paid with where to ship it", async () => {
  const calls = [];
  const f = async (url, init) => (calls.push({ url, body: JSON.parse(init.body) }), reply(200, { status: "ok" }));
  const r = res();
  const address = { line1: "1 Peachtree St", city: "Atlanta", state: "GA", postal_code: "30303", country: "US" };
  await webhookHandler({ env, fetchImpl: f, now: () => 1_800_000_000 })(
    signed({ type: "checkout.session.completed", data: { object: { id: "cs_9", mode: "payment", payment_status: "paid", amount_total: 7650, client_reference_id: "ord-1", metadata: { kind: "shop", order_id: "ord-1" }, collected_information: { shipping_details: { name: "Ana Driver", address } } } } }),
    r
  );
  assert.equal(r.code, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rpc\/pay_order$/, "not mistaken for a promotion");
  assert.deepEqual(calls[0].body, { p_id: "ord-1", p_session: "cs_9", p_amount_cents: 7650, p_ship_name: "Ana Driver", p_ship_address: address });
});

test("shipping details from older Stripe versions too", () => {
  assert.deepEqual(shippingFromSession({ shipping_details: { name: "A", address: { city: "Macon" } } }), { name: "A", address: { city: "Macon" } });
  assert.deepEqual(shippingFromSession({ customer_details: { name: "B" } }), { name: "B", address: null });
});

const products = [
  { id: HAT, price_cents: 2500, sizes: ["One size"], stock: {} },
  { id: SHIRT, price_cents: 3000, sizes: ["S", "M", "L"], stock: { S: 0, M: 2 } },
];
const settings = { shipping_cents: 500, free_shipping_over_cents: 5000, member_discount_pct: 10 };

test("cart totals match the database's rules", () => {
  assert.deepEqual(cartTotals([{ product: HAT, size: "One size", qty: 1 }], products, settings), { subtotal: 2500, discount: 0, shipping: 500, total: 3000, count: 1 });
  assert.deepEqual(cartTotals([{ product: HAT, size: "One size", qty: 1 }, { product: SHIRT, size: "M", qty: 2 }], products, settings), { subtotal: 8500, discount: 0, shipping: 0, total: 8500, count: 3 });
  assert.equal(cartTotals([{ product: HAT, size: "One size", qty: 1 }], products, settings, true).total, 2750, "members: 10% off, plus shipping");
  assert.equal(cartTotals([{ product: SHIRT, size: "M", qty: 2 }], products, settings, true).shipping, 0, "$54 after the discount still ships free");
  assert.equal(cartTotals([], products, settings).total, 0);
  assert.equal(cartTotals([{ product: HAT, size: "One size", qty: 2 }], products, { ...settings, free_shipping_over_cents: null }).shipping, 500, "no free shipping set");
});

test("the cart and stock", () => {
  let cart = addToCart([], SHIRT, "M");
  cart = addToCart(cart, SHIRT, "M", 9);
  assert.deepEqual(cart, [{ product: SHIRT, size: "M", qty: 5 }], "up to 5 of a thing");
  assert.equal(addToCart(cart, SHIRT, "L").length, 2, "another size is another line");
  assert.equal(leftOf(products[1], "S"), 0);
  assert.equal(leftOf(products[1], "L"), null, "no number: no limit");
  assert.equal(soldOut(products[1]), false);
  assert.equal(soldOut({ sizes: ["One size"], stock: { "One size": 0 } }), true);
});

test("order status and errors in words", () => {
  assert.equal(orderStatus({ status: "shipped", tracking: "1Z9" }), "Shipped · tracking 1Z9");
  assert.equal(orderStatus({ status: "paid" }), "Paid · getting it ready");
  assert.equal(errorMessage(409, { error: "sold_out", product: "TUNR Shirt", size: "M", left: 1 }), "Only 1 TUNR Shirt in M left. Lower the number.");
  assert.equal(errorMessage(409, { error: "sold_out", product: "TUNR Hat", size: "One size", left: 0 }), "TUNR Hat is sold out.");
  assert.match(errorMessage(403, { error: "closed" }), /isn't open yet/);
  assert.equal(errorMessage(500, {}), "Couldn't open the payment page. (status 500)");
});
