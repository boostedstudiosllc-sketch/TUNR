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
