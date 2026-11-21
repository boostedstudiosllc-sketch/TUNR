import { useEffect, useState } from "react";
import { loadShop, loadOrders, checkout } from "../lib/shop.js";
import { cartTotals, addToCart, leftOf, soldOut, orderStatus } from "../lib/shopRules.js";
import { priceLabel } from "../lib/memberRules.js";
import { loadProfile } from "../lib/store.js";
import Sheet, { sheetTitle, muted, label, bigButton, quietButton } from "./Sheet.jsx";

const openTunrPlus = () => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: "open:membership" } }));

// TUNR merch (124_merch_shop.sql): pick sizes, see the total (members' price,
// shipping), pay on Stripe's page, and see your orders. Opened by
// "open:shop" (the Perks tab, alerts about your order).
export default function Shop({ user, onClose, onNeedAccount }) {
  const [shop, setShop] = useState(null);
  const [me, setMe] = useState({ isAdmin: false, isMember: false });
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [sizes, setSizes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    loadShop()
      .then(setShop)
      .catch((e) => (setShop({ products: [], settings: null }), setError(e.message)));
  };
  useEffect(() => {
    load();
    if (!user?.id) return;
    loadProfile(user.id).then((p) => setMe({ isAdmin: Boolean(p?.isAdmin), isMember: Boolean(p?.isMember) }));
    loadOrders()
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, [user?.id]);

  const products = (shop?.products || []).filter((p) => p.active);
  const settings = shop?.settings;
  const open = Boolean(settings?.open) || me.isAdmin;
  const totals = cartTotals(cart, products, settings, me.isMember);
  const pct = Number(settings?.member_discount_pct || 0);

  const pay = async () => {
    if (!user) return onNeedAccount?.();
    setBusy(true);
    setError("");
    try {
      await checkout(cart);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="TUNR merch" zIndex={320}>
      <div style={sheetTitle}>🛍️ TUNR MERCH</div>
      {settings && !settings.open && (
        <div style={{ ...muted, marginTop: 4, color: "#FACC15" }}>{me.isAdmin ? "The shop is closed to members. You can test it as an admin; open it in Settings → Admin → Merch shop." : "Opening soon. Here's a look."}</div>
      )}
      {settings?.open && (
        <div style={{ ...muted, marginTop: 4 }}>
          {settings.free_shipping_over_cents ? `Free shipping over ${priceLabel(settings.free_shipping_over_cents)}. ` : ""}
          {pct > 0 && (me.isMember ? `Your TUNR+ ${pct}% off is on.` : `TUNR+ members get ${pct}% off.`)}
        </div>
      )}
      {shop === null && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}

      {products.map((p) => {
        const size = sizes[p.id] || (p.sizes.length === 1 ? p.sizes[0] : "");
        const left = size ? leftOf(p, size) : null;
        const out = soldOut(p);
        const memberPrice = Math.round((p.price_cents * (100 - pct)) / 100);
        return (
          <div key={p.id} style={{ marginTop: 14, borderRadius: 14, border: "1px solid var(--n-222222)", background: "var(--n-131313)", overflow: "hidden" }}>
            {p.photo_url ? (
              <img src={p.photo_url} alt={p.name} style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
            ) : (
              <div aria-hidden style={{ aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 84, background: "var(--n-1a1a1a)" }}>
                {p.emoji}
              </div>
            )}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 20, fontWeight: 900 }}>{p.name}</span>
                <span style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#FACC15", textDecoration: me.isMember && pct ? "line-through" : "none", opacity: me.isMember && pct ? 0.6 : 1 }}>{priceLabel(p.price_cents)}</span>
                  {pct > 0 && (
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--a-a855f7)" }}>
                      {priceLabel(memberPrice)} with TUNR+
                    </span>
                  )}
                </span>
              </div>
              {p.description && <div style={{ ...muted, fontSize: 13.5, marginTop: 2 }}>{p.description}</div>}
              {p.sizes.length > 1 && (
                <div role="radiogroup" aria-label={`${p.name} size`} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {p.sizes.map((s) => {
                    const gone = leftOf(p, s) === 0;
                    const on = size === s;
                    return (
                      <button
                        key={s}
                        role="radio"
                        aria-checked={on}
                        disabled={gone}
                        onClick={() => setSizes((x) => ({ ...x, [p.id]: s }))}
                        style={{ minWidth: 44, padding: "8px 10px", borderRadius: 9, border: `2px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`, background: on ? "rgba(0,128,240,0.12)" : "transparent", color: gone ? "var(--n-555555)" : "var(--n-f0f0f0)", fontWeight: 900, fontSize: 14, textDecoration: gone ? "line-through" : "none", cursor: gone ? "default" : "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
              {left !== null && left > 0 && left <= 5 && <div style={{ ...muted, fontSize: 12.5, color: "#F97316", marginTop: 6 }}>Only {left} left</div>}
              <button
                disabled={!open || out || !size || left === 0}
                onClick={() => setCart((c) => addToCart(c, p.id, size))}
                style={{ ...quietButton, marginTop: 10 }}
              >
                {out ? "SOLD OUT" : !size ? "PICK A SIZE" : "ADD TO CART"}
              </button>
            </div>
          </div>
        );
      })}

      {cart.length > 0 && (
        <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 14, border: "1px solid #0080F0" }}>
          <div style={label}>YOUR CART</div>
          {cart.map((item, i) => {
            const p = products.find((x) => x.id === item.product);
            return (
              <div key={`${item.product}-${item.size}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>
                  {p?.name}
                  {item.size !== "One size" ? ` · ${item.size}` : ""}
                </span>
                <button aria-label="One fewer" onClick={() => setCart((c) => c.map((x, k) => (k === i ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))} style={{ ...quietButton, width: 34, padding: "4px 0", marginTop: 0 }}>
                  −
                </button>
                <span style={{ width: 18, textAlign: "center", fontWeight: 900 }}>{item.qty}</span>
                <button aria-label="One more" disabled={item.qty >= 5} onClick={() => setCart((c) => addToCart(c, item.product, item.size))} style={{ ...quietButton, width: 34, padding: "4px 0", marginTop: 0 }}>
                  +
                </button>
              </div>
            );
          })}
          <Line k="Items" v={priceLabel(totals.subtotal)} />
          {totals.discount > 0 && <Line k={`TUNR+ ${pct}% off`} v={`−${priceLabel(totals.discount)}`} color="#A855F7" />}
          <Line k="Shipping" v={totals.shipping ? priceLabel(totals.shipping) : "Free"} />
          <Line k="Total" v={priceLabel(totals.total)} bold />
          {error && (
            <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
              {error}
            </div>
          )}
          <button disabled={busy} onClick={pay} style={{ ...bigButton, marginTop: 10 }}>
            {!user ? "CREATE A FREE ACCOUNT TO BUY" : busy ? "OPENING SECURE CHECKOUT…" : `CHECKOUT · ${priceLabel(totals.total)}`}
          </button>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 6 }}>Paid by card on Stripe's secure page, where you enter where to ship it (US only).</div>
          {!me.isMember && pct > 0 && (
            <button onClick={openTunrPlus} style={{ background: "none", border: "none", color: "var(--a-a855f7)", fontWeight: 800, fontSize: 13.5, padding: "6px 0 0", cursor: "pointer" }}>
              💎 Save {pct}% with TUNR+ ›
            </button>
          )}
        </div>
      )}
      {error && !cart.length && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}{" "}
          <button onClick={load} style={{ ...quietButton, marginTop: 8 }}>
            TRY AGAIN
          </button>
        </div>
      )}

      {orders.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 18 }}>YOUR ORDERS</div>
          {orders.map((o) => (
            <div key={o.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{o.lines.map((l) => `${l.qty}× ${l.name}${l.size !== "One size" ? ` (${l.size})` : ""}`).join(", ")}</span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: o.status === "shipped" ? "#10B981" : "var(--n-888888)" }}>
                {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} · {priceLabel(o.total_cents)} · {orderStatus(o)}
              </span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

function Line({ k, v, bold = false, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 17 : 14.5, fontWeight: bold ? 900 : 700, marginTop: bold ? 8 : 4, color }}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
