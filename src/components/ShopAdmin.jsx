import { useEffect, useState } from "react";
import { loadShop, loadOrders, saveSettings, saveProduct, shipOrder, cancelOrder } from "../lib/shop.js";
import { orderStatus } from "../lib/shopRules.js";
import { priceLabel } from "../lib/memberRules.js";
import { uploadEventPhoto } from "../lib/store.js";
import { compressImage } from "../lib/image.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const dollars = (c) => (c === null || c === undefined ? "" : (c / 100).toString());
const toForm = (p) => ({ ...p, price: dollars(p.price_cents), sizesText: p.sizes.join(", "), stockText: Object.fromEntries(p.sizes.map((s) => [s, p.stock?.[s] ?? ""])) });

// Settings → Admin → Merch shop (124_merch_shop.sql): open or close it,
// shipping and the member discount, products (photo, price, sizes, stock),
// and orders to ship.
export default function ShopAdmin({ user, onToast }) {
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState(null);
  const [tracking, setTracking] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    Promise.all([loadShop(), loadOrders({ all: true })])
      .then(([s, o]) => {
        setSettings({ ...s.settings, shipping: dollars(s.settings?.shipping_cents), freeOver: dollars(s.settings?.free_shipping_over_cents), pct: String(s.settings?.member_discount_pct ?? 10) });
        setProducts(s.products.map(toForm));
        setOrders(o);
      })
      .catch((e) => (setOrders([]), setError(e.message)));
  useEffect(() => {
    refresh();
  }, []);

  const act = async (fn, done) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (done) onToast?.(done);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveShopSettings = () =>
    act(() => {
      const ship = Math.round(Number(settings.shipping || 0) * 100);
      const free = settings.freeOver === "" ? null : Math.round(Number(settings.freeOver) * 100);
      const pct = Math.round(Number(settings.pct || 0));
      if (!(ship >= 0 && ship <= 5000)) throw new Error("Shipping must be $0 to $50.");
      if (!(pct >= 0 && pct <= 50)) throw new Error("The member discount must be 0 to 50%.");
      return saveSettings({ shipping_cents: ship, free_shipping_over_cents: free, member_discount_pct: pct });
    }, "Shop settings saved");

  const setP = (i, patch) => setProducts((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const upload = async (i, file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setP(i, { photo_url: await uploadEventPhoto(await compressImage(file, { maxDim: 1400 }), user.id) });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toShip = (orders || []).filter((o) => o.status === "paid");
  const rest = (orders || []).filter((o) => o.status !== "paid");
  const sales = (orders || []).filter((o) => o.status === "paid" || o.status === "shipped").reduce((n, o) => n + o.total_cents, 0);

  return (
    <div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginBottom: 8 }}>
          {error}
        </div>
      )}
      {settings && (
        <>
          <button
            disabled={busy}
            onClick={() => (settings.open || window.confirm("Open the shop to everyone? Check the photos, prices and stock first.")) && act(() => saveSettings({ open: !settings.open }), settings.open ? "Shop closed" : "Shop open")}
            style={{ ...bigButton, marginTop: 0, background: settings.open ? "var(--n-1a1a1a)" : "#10B981", color: settings.open ? "var(--a-f87171)" : "#fff" }}
          >
            {settings.open ? "CLOSE THE SHOP" : "OPEN THE SHOP"}
          </button>
          <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>{settings.open ? "Open: everyone can buy (Perks → TUNR merch)." : "Closed: members see “opening soon”; admins can test a checkout. Card payments need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel."}</div>

          <div style={{ ...label, marginTop: 16 }}>SHIPPING AND DISCOUNT</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Num label="SHIPPING $" value={settings.shipping} onChange={(v) => setSettings((s) => ({ ...s, shipping: v }))} />
            <Num label="FREE OVER $" value={settings.freeOver} placeholder="never" onChange={(v) => setSettings((s) => ({ ...s, freeOver: v }))} />
            <Num label="TUNR+ % OFF" value={settings.pct} onChange={(v) => setSettings((s) => ({ ...s, pct: v.replace(/\D/g, "") }))} />
          </div>
          <button disabled={busy} onClick={saveShopSettings} style={{ ...quietButton, marginTop: 6 }}>
            SAVE
          </button>
        </>
      )}

      <div style={{ ...label, marginTop: 18 }}>PRODUCTS</div>
      {products.map((p, i) => (
        <div key={p.id || i} style={{ padding: "12px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>{p.emoji}</span>}
            <label style={{ ...quietButton, width: "auto", padding: "8px 10px", marginTop: 0, cursor: "pointer" }}>
              📷 {p.photo_url ? "CHANGE PHOTO" : "ADD PHOTO"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => upload(i, e.target.files?.[0])} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={{ ...field, flex: 2 }} value={p.name} onChange={(e) => setP(i, { name: e.target.value })} aria-label="Name" />
            <input style={{ ...field, flex: 1 }} inputMode="decimal" value={p.price} onChange={(e) => setP(i, { price: e.target.value.replace(/[^\d.]/g, "") })} aria-label="Price in dollars" />
          </div>
          <input style={{ ...field, marginTop: 6 }} value={p.description || ""} placeholder="Description" onChange={(e) => setP(i, { description: e.target.value })} aria-label="Description" />
          <div style={{ ...label, marginTop: 8 }}>SIZES (COMMAS) · LEFT IN EACH (BLANK = NO LIMIT)</div>
          <input style={field} value={p.sizesText} onChange={(e) => setP(i, { sizesText: e.target.value })} aria-label="Sizes" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {p.sizesText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => (
                <label key={s} style={{ ...muted, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  {s}
                  <input style={{ ...field, width: 56, padding: "6px 8px" }} inputMode="numeric" value={p.stockText?.[s] ?? ""} onChange={(e) => setP(i, { stockText: { ...p.stockText, [s]: e.target.value.replace(/\D/g, "") } })} aria-label={`Left in ${s}`} />
                </label>
              ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button disabled={busy} onClick={() => act(() => saveProduct(p), `${p.name} saved`)} style={{ ...quietButton, marginTop: 0, flex: 1 }}>
              SAVE
            </button>
            <button disabled={busy} onClick={() => act(() => saveProduct({ ...p, active: !p.active }), p.active ? `${p.name} hidden` : `${p.name} for sale`)} style={{ ...quietButton, marginTop: 0, flex: 1 }}>
              {p.active ? "HIDE" : "PUT ON SALE"}
            </button>
          </div>
        </div>
      ))}

      <div style={{ ...label, marginTop: 18 }}>
        TO SHIP ({toShip.length}) · SALES SO FAR: {priceLabel(sales) || "$0"}
      </div>
      {orders === null && <div style={muted}>Loading…</div>}
      {orders?.length === 0 && <div style={muted}>No orders yet.</div>}
      {[...toShip, ...rest].map((o) => {
        const a = o.ship_address || {};
        return (
          <div key={o.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{o.lines.map((l) => `${l.qty}× ${l.name}${l.size !== "One size" ? ` (${l.size})` : ""}`).join(", ")}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: o.status === "paid" ? "#FACC15" : "var(--n-888888)" }}>
              {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} · {priceLabel(o.total_cents)}
              {o.member_price ? " · TUNR+ price" : ""} · {orderStatus(o)}
            </div>
            {o.status === "paid" && (
              <>
                <div style={{ ...muted, fontSize: 13, marginTop: 4, color: "var(--n-cccccc)", whiteSpace: "pre-line" }}>
                  {[o.ship_name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(", ")].filter(Boolean).join("\n") || "No address (check Stripe)"}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input style={{ ...field, flex: 1 }} placeholder="Tracking number (optional)" value={tracking[o.id] || ""} onChange={(e) => setTracking((t) => ({ ...t, [o.id]: e.target.value }))} aria-label="Tracking number" />
                  <button disabled={busy} onClick={() => act(() => shipOrder(o.id, tracking[o.id]), "Marked shipped; they've been told")} style={{ ...bigButton, width: 90, marginTop: 0 }}>
                    SHIPPED
                  </button>
                </div>
                <button disabled={busy} onClick={() => window.confirm("Cancel this order? Refund it in Stripe yourself; the stock goes back.") && act(() => cancelOrder(o.id), "Order cancelled")} style={{ background: "none", border: "none", color: "var(--a-f87171)", fontSize: 12.5, fontWeight: 800, padding: "6px 0 0", cursor: "pointer" }}>
                  CANCEL ORDER
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Num({ label: l, value, onChange, placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={label}>{l}</div>
      <input style={field} inputMode="decimal" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
    </div>
  );
}
