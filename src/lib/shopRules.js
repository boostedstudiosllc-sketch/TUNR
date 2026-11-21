// Merch shop (124_merch_shop.sql): cart maths for showing totals (the
// database sets the real prices at checkout), stock, order status, error
// messages. No network here, so it's unit-tested (test/shop.test.js).

// Left of one size; null means no limit.
export function leftOf(product, size) {
  const n = product?.stock?.[size];
  return n === undefined || n === null ? null : Math.max(0, Number(n) || 0);
}

export const soldOut = (product) => (product?.sizes || []).every((s) => leftOf(product, s) === 0);

// cart: [{ product, size, qty }]; products: from the database; settings: shop_settings.
export function cartTotals(cart, products, settings, member = false) {
  const pct = member ? Number(settings?.member_discount_pct || 0) : 0;
  let full = 0;
  let sub = 0;
  for (const item of cart) {
    const p = products.find((x) => x.id === item.product);
    if (!p) continue;
    const unit = pct ? Math.round((p.price_cents * (100 - pct)) / 100) : p.price_cents;
    full += p.price_cents * item.qty;
    sub += unit * item.qty;
  }
  const freeOver = settings?.free_shipping_over_cents;
  const shipping = !cart.length ? 0 : freeOver !== null && freeOver !== undefined && sub >= freeOver ? 0 : Number(settings?.shipping_cents || 0);
  return { subtotal: full, discount: full - sub, shipping, total: sub + shipping, count: cart.reduce((n, i) => n + i.qty, 0) };
}

// Adds to the cart (same product and size: more of it, up to 5).
export function addToCart(cart, product, size, qty = 1) {
  const i = cart.findIndex((x) => x.product === product && x.size === size);
  if (i < 0) return [...cart, { product, size, qty: Math.min(5, qty) }];
  return cart.map((x, k) => (k === i ? { ...x, qty: Math.min(5, x.qty + qty) } : x));
}

export function orderStatus(o) {
  if (o.status === "shipped") return o.tracking ? `Shipped · tracking ${o.tracking}` : "Shipped";
  if (o.status === "paid") return "Paid · getting it ready";
  if (o.status === "cancelled") return "Cancelled";
  return "Waiting for payment";
}

export const ERRORS = {
  payments_not_set_up: "Card payments aren't switched on yet. Check back soon.",
  closed: "The shop isn't open yet. Check back soon.",
  not_signed_in: "Sign in to buy merch.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  empty: "Your cart is empty.",
  bad_size: "Pick a size.",
  bad_qty: "Up to 5 of each item.",
  not_for_sale: "Something in your cart isn't for sale anymore.",
  rate_limit: "That's a lot of orders today. Try again tomorrow.",
  stripe_failed: "The payment page wouldn't open.",
};

// The message for a failed /api/shop reply.
export function errorMessage(status, body = {}) {
  if (body.error === "sold_out") {
    const size = body.size && body.size !== "One size" ? ` in ${body.size}` : "";
    return body.left ? `Only ${body.left} ${body.product || "left"}${size} left. Lower the number.` : `${body.product || "That"}${size} is sold out.`;
  }
  const msg = ERRORS[body.error] || `Couldn't open the payment page. (${body.error || `status ${status}`})`;
  return body.detail && body.error === "stripe_failed" ? `${msg} (${body.detail})` : msg;
}
