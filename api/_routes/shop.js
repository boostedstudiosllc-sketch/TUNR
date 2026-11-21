// POST /api/shop  { items: [{ product, size, qty }] }  (Authorization: Bearer <session>)
//
// Buy TUNR merch (124_merch_shop.sql). The database checks the cart and sets
// every price, the member discount and shipping (start_order, run as you);
// this opens Stripe Checkout, which also takes the shipping address. Stripe
// tells api/_routes/stripe-webhook.js when it's paid.
//
// → 200 { url, id }  ·  401 not_signed_in  ·  400 bad_request | empty | bad_size
//   | bad_qty | not_for_sale | unconfirmed | rate_limit  ·  409 sold_out (+ product,
//   size, left)  ·  403 closed  ·  502 stripe_failed
//   503 payments_not_set_up (no STRIPE_SECRET_KEY)

import { createShopCheckout } from "../_lib/stripe.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "not_configured" });
    if (!env.STRIPE_SECRET_KEY) return res.status(503).json({ error: "payments_not_set_up" });

    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "not_signed_in" });
    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || !items.length || items.length > 10 || !items.every((i) => i && UUID.test(String(i.product || "")))) {
      return res.status(400).json({ error: "bad_request" });
    }
    const clean = items.map((i) => ({ product: i.product, size: typeof i.size === "string" ? i.size.slice(0, 20) : undefined, qty: Number(i.qty) || 1 }));

    const supa = (path, init = {}) =>
      fetchImpl(`${supabaseUrl}${path}`, { ...init, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const userRes = await supa("/auth/v1/user");
    if (!userRes.ok) return res.status(401).json({ error: "not_signed_in" });
    const user = await userRes.json();

    const startRes = await supa("/rest/v1/rpc/start_order", { method: "POST", body: JSON.stringify({ p_items: clean }) });
    const r = await startRes.json().catch(() => ({}));
    if (!startRes.ok) return res.status(502).json({ error: "request_failed", detail: r?.message || `status ${startRes.status}` });
    if (r.status !== "ok") {
      const code = r.status === "sold_out" ? 409 : r.status === "closed" ? 403 : r.status === "not_signed_in" ? 401 : 400;
      return res.status(code).json({ error: r.status || "request_failed", product: r.product, size: r.size, left: r.left });
    }
    const site = (env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, "");
    try {
      const session = await createShopCheckout({
        secretKey: env.STRIPE_SECRET_KEY,
        fetchImpl,
        orderId: r.id,
        lines: r.lines,
        shippingCents: r.shipping_cents,
        email: user?.email,
        successUrl: `${site}/?shop=thanks`,
        cancelUrl: `${site}/?open=open:shop`,
      });
      return res.status(200).json({ url: session.url, id: r.id });
    } catch (e) {
      return res.status(502).json({ error: "stripe_failed", detail: e.message });
    }
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export default createHandler();
