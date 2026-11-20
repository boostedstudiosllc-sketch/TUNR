// POST /api/stripe-webhook  (from Stripe; signed with STRIPE_WEBHOOK_SECRET)
//
// When a Checkout payment for a promoted meet completes, turns the promotion
// on (activate_promotion, with the service key; the database checks the
// amount paid covers the price and ignores repeats). Anything else is
// acknowledged and ignored.
//
// → 200 { received: true, result? }  ·  400 bad_signature  ·  503 not_configured

import { verifyStripeSignature, readRawBody } from "./_lib/stripe.js";

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
    const promotionId = s.metadata?.promotion_id || s.client_reference_id;
    if (event.type !== "checkout.session.completed" || s.payment_status !== "paid" || !promotionId) {
      return res.status(200).json({ received: true });
    }
    const r = await fetchImpl(`${url}/rest/v1/rpc/activate_promotion`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: promotionId, p_session: s.id, p_amount_cents: s.amount_total }),
    });
    const result = await r.json().catch(() => null);
    // A 500 makes Stripe retry later; a database "no" (underpaid, unknown) won't change on retry.
    if (!r.ok) return res.status(500).json({ error: "activate_failed", detail: result?.message || `status ${r.status}` });
    return res.status(200).json({ received: true, result });
  };
}

export default createHandler();
