// POST /api/stripe-webhook  (from Stripe; signed with STRIPE_WEBHOOK_SECRET)
//
// Promoted meets: when a Checkout payment completes, turns the promotion on
// (activate_promotion, with the service key; the database checks the amount
// paid covers the price and ignores repeats).
// Merch shop: a paid order is marked paid with its shipping address (pay_order).
// TUNR+: a finished subscription checkout and every customer.subscription.*
// event update the membership (sync_membership; older events are ignored).
// Anything else is acknowledged and ignored.
//
// → 200 { received: true, result? }  ·  400 bad_signature  ·  503 not_configured

import { verifyStripeSignature, readRawBody, membershipFromSubscription, shippingFromSession } from "../_lib/stripe.js";

export function createHandler({ env = process.env, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";
    if (!env.STRIPE_WEBHOOK_SECRET || !url || !key) return res.status(503).json({ error: "not_configured" });

    const raw = await readRawBody(req);
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"], env.STRIPE_WEBHOOK_SECRET, now())) {
      return res.status(400).json({ error: "bad_signature" });
    }
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: "bad_body" });
    }
    const s = event?.data?.object || {};
    const rpc = async (fn, args) => {
      const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const result = await r.json().catch(() => null);
      // A 500 makes Stripe retry later; a database "no" (underpaid, unknown, stale) won't change on retry.
      if (!r.ok) return res.status(500).json({ error: `${fn}_failed`, detail: result?.message || `status ${r.status}` });
      return res.status(200).json({ received: true, result });
    };
    const at = new Date((Number(event.created) || now()) * 1000).toISOString();

    // TUNR+ (122): a subscription started, renewed, changed or ended.
    if (/^customer\.subscription\.(created|updated|deleted)$/.test(event.type || "")) {
      const m = membershipFromSubscription(s, event.type);
      if (s.metadata?.kind !== "membership" || !m.p_user) return res.status(200).json({ received: true });
      return rpc("sync_membership", { ...m, p_event_at: at });
    }
    if (event.type === "checkout.session.completed" && s.mode === "subscription") {
      const userId = s.metadata?.user_id || s.client_reference_id;
      if (s.metadata?.kind !== "membership" || !userId || (s.payment_status !== "paid" && s.payment_status !== "no_payment_required")) {
        return res.status(200).json({ received: true });
      }
      return rpc("sync_membership", {
        p_user: userId,
        p_status: "active",
        p_plan: s.metadata?.plan || null,
        p_until: null,
        p_cancel_at: null,
        p_customer: typeof s.customer === "string" ? s.customer : null,
        p_subscription: typeof s.subscription === "string" ? s.subscription : null,
        p_event_at: at,
      });
    }

    // Merch shop (124): a paid order, with where to ship it.
    if (event.type === "checkout.session.completed" && s.metadata?.kind === "shop") {
      if (s.payment_status !== "paid" || !s.metadata?.order_id) return res.status(200).json({ received: true });
      const ship = shippingFromSession(s);
      return rpc("pay_order", { p_id: s.metadata.order_id, p_session: s.id, p_amount_cents: s.amount_total, p_ship_name: ship.name, p_ship_address: ship.address });
    }

    // Promoted meets (120).
    const promotionId = s.metadata?.promotion_id || s.client_reference_id;
    if (event.type !== "checkout.session.completed" || s.payment_status !== "paid" || !promotionId) {
      return res.status(200).json({ received: true });
    }
    return rpc("activate_promotion", { p_id: promotionId, p_session: s.id, p_amount_cents: s.amount_total });
  };
}

export default createHandler();
