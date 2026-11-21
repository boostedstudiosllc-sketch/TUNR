// POST /api/promote  { eventId, package: "featured" | "spotlight" }  (Authorization: Bearer <session>)
//
// A host pays to promote their meet (120_meet_promotions.sql). The database
// checks they're a host and sets the price (request_promotion, run as them);
// this opens a Stripe Checkout page for that amount and returns its address.
// Stripe tells api/_routes/stripe-webhook.js when it's paid, which turns it on.
//
// → 200 { url }  ·  401 not_signed_in  ·  400 bad_request  ·  403 not_host
//   409 already  ·  503 payments_not_set_up (no STRIPE_SECRET_KEY)
//   other request_promotion statuses (meet_over, unconfirmed, …) with 400

import { createCheckout } from "../_lib/stripe.js";

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
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const pkg = body.package === "featured" || body.package === "spotlight" ? body.package : "";
    if (!/^[0-9a-f-]{36}$/i.test(eventId) || !pkg) return res.status(400).json({ error: "bad_request" });

    const supa = (path, init = {}) =>
      fetchImpl(`${supabaseUrl}${path}`, { ...init, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const userRes = await supa("/auth/v1/user");
    if (!userRes.ok) return res.status(401).json({ error: "not_signed_in" });
    const user = await userRes.json();

    const reqRes = await supa("/rest/v1/rpc/request_promotion", { method: "POST", body: JSON.stringify({ p_event: eventId, p_package: pkg }) });
    const r = await reqRes.json().catch(() => ({}));
    if (!reqRes.ok) return res.status(502).json({ error: "request_failed", detail: r?.message || `status ${reqRes.status}` });
    if (r.status !== "ok") {
      const code = r.status === "not_host" ? 403 : r.status === "already" ? 409 : r.status === "not_signed_in" ? 401 : 400;
      return res.status(code).json({ error: r.status || "request_failed" });
    }

    const site = (env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, "");
    try {
      const session = await createCheckout({
        secretKey: env.STRIPE_SECRET_KEY,
        fetchImpl,
        amountCents: r.amount_cents,
        name: `TUNR ${r.package}: ${String(r.title || "your meet").slice(0, 80)}`,
        promotionId: r.id,
        email: user?.email,
        successUrl: `${site}/?promoted=${r.id}`,
        cancelUrl: `${site}/?open=meet:${eventId}`,
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
