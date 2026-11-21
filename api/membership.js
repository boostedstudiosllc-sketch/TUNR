// POST /api/membership  (Authorization: Bearer <session>)
//   { action: "join", plan: "month" | "year" } → Stripe Checkout for TUNR+
//   { action: "manage" }                        → Stripe's billing page (card, plan, cancel)
//
// The database says whether you can join and at what price (start_membership,
// run as you); Stripe tells api/stripe-webhook.js when it's paid or changes.
//
// → 200 { url }  ·  401 not_signed_in  ·  400 bad_request | bad_plan | unconfirmed
//   409 already  ·  404 no_subscription  ·  502 stripe_failed
//   503 payments_not_set_up (no STRIPE_SECRET_KEY) | billing_page_not_set_up

import { createMembershipCheckout, createBillingPortal } from "./_lib/stripe.js";

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
    const action = body.action === "join" || body.action === "manage" ? body.action : "";
    const plan = body.plan === "month" || body.plan === "year" ? body.plan : "";
    if (!action || (action === "join" && !plan)) return res.status(400).json({ error: "bad_request" });

    const supa = (path, init = {}) =>
      fetchImpl(`${supabaseUrl}${path}`, { ...init, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
    const userRes = await supa("/auth/v1/user");
    if (!userRes.ok) return res.status(401).json({ error: "not_signed_in" });
    const user = await userRes.json();
    const site = (env.SITE_URL || `https://${req.headers.host}`).replace(/\/+$/, "");

    if (action === "manage") {
      // Your own row only (row security); the customer id never leaves the server.
      const mRes = await supa(`/rest/v1/memberships?select=stripe_customer&user_id=eq.${encodeURIComponent(user.id)}`);
      const rows = await mRes.json().catch(() => []);
      const customer = Array.isArray(rows) ? rows[0]?.stripe_customer : null;
      if (!customer) return res.status(404).json({ error: "no_subscription" });
      try {
        const portal = await createBillingPortal({ secretKey: env.STRIPE_SECRET_KEY, fetchImpl, customer, returnUrl: `${site}/?open=open:membership` });
        return res.status(200).json({ url: portal.url });
      } catch (e) {
        // Stripe needs its customer portal saved once in the dashboard.
        if (/configuration/i.test(e.message)) return res.status(503).json({ error: "billing_page_not_set_up", detail: e.message });
        return res.status(502).json({ error: "stripe_failed", detail: e.message });
      }
    }

    const startRes = await supa("/rest/v1/rpc/start_membership", { method: "POST", body: JSON.stringify({ p_plan: plan }) });
    const r = await startRes.json().catch(() => ({}));
    if (!startRes.ok) return res.status(502).json({ error: "request_failed", detail: r?.message || `status ${startRes.status}` });
    if (r.status !== "ok") {
      const code = r.status === "already" ? 409 : r.status === "not_signed_in" ? 401 : 400;
      return res.status(code).json({ error: r.status || "request_failed" });
    }
    try {
      const session = await createMembershipCheckout({
        secretKey: env.STRIPE_SECRET_KEY,
        fetchImpl,
        userId: user.id,
        plan: r.plan,
        amountCents: r.price_cents,
        customer: r.customer || null,
        email: user?.email,
        successUrl: `${site}/?member=welcome`,
        cancelUrl: `${site}/?open=open:membership`,
      });
      return res.status(200).json({ url: session.url });
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
