// Stripe, without the Stripe library: Checkout sessions over its REST API,
// and checking a webhook's signature (HMAC-SHA256 over "<timestamp>.<body>"
// with the webhook secret). Used by api/promote.js and api/stripe-webhook.js.

import { createHmac, timingSafeEqual } from "node:crypto";

// Stripe wants form fields: { a: { b: 1 } } → a[b]=1.
export function formEncode(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

export async function createCheckout({ secretKey, fetchImpl = fetch, amountCents, name, promotionId, successUrl, cancelUrl, email }) {
  const body = formEncode({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: promotionId,
    customer_email: email || undefined,
    metadata: { promotion_id: promotionId },
    payment_intent_data: { metadata: { promotion_id: promotionId } },
    line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name } } } },
  });
  const r = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.url) throw new Error(data?.error?.message || `stripe ${r.status}`);
  return data;
}

async function stripePost(secretKey, fetchImpl, path, fields) {
  const r = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode(fields),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.url) throw new Error(data?.error?.message || `stripe ${r.status}`);
  return data;
}

// TUNR+ (122): a monthly or yearly subscription at the database's price.
// The member's id rides on the session and the subscription, so every
// webhook about it knows whose it is.
export function createMembershipCheckout({ secretKey, fetchImpl = fetch, userId, plan, amountCents, customer, email, successUrl, cancelUrl }) {
  return stripePost(secretKey, fetchImpl, "checkout/sessions", {
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    customer: customer || undefined,
    customer_email: customer ? undefined : email || undefined,
    metadata: { kind: "membership", user_id: userId, plan },
    subscription_data: { metadata: { kind: "membership", user_id: userId, plan } },
    line_items: { 0: { quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, recurring: { interval: plan }, product_data: { name: "TUNR+ membership" } } } },
  });
}

// Stripe's billing page: change card, switch plan, cancel.
export function createBillingPortal({ secretKey, fetchImpl = fetch, customer, returnUrl }) {
  return stripePost(secretKey, fetchImpl, "billing_portal/sessions", { customer, return_url: returnUrl });
}

// What a subscription event means for membership (sync_membership's args).
export function membershipFromSubscription(sub, eventType) {
  const item = sub?.items?.data?.[0];
  const until = sub?.current_period_end ?? item?.current_period_end ?? null;
  const cancelAt = sub?.cancel_at ?? (sub?.cancel_at_period_end ? until : null);
  const iso = (t) => (t ? new Date(t * 1000).toISOString() : null);
  return {
    p_user: sub?.metadata?.user_id || null,
    p_status: eventType === "customer.subscription.deleted" ? "canceled" : sub?.status || null,
    p_plan: item?.price?.recurring?.interval || sub?.metadata?.plan || null,
    p_until: iso(until),
    p_cancel_at: iso(cancelAt),
    p_customer: typeof sub?.customer === "string" ? sub.customer : sub?.customer?.id || null,
    p_subscription: sub?.id || null,
  };
}

// true when the Stripe-Signature header matches the raw body, signed in the
// last 5 minutes.
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret || typeof rawBody !== "string") return false;
  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((kv) => kv.length === 2 && kv[0] === "t")
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const sigs = String(header)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  // Not hex (forged or garbled): no match, rather than a crash.
  return sigs.some((s) => /^[0-9a-f]+$/i.test(s) && s.length === expected.length && timingSafeEqual(Buffer.from(s, "hex"), Buffer.from(expected, "hex")));
}

// The request body exactly as sent (signatures are over the raw bytes).
export async function readRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}
