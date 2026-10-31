import { useEffect, useState } from "react";
import { dollars, loadMyPoints } from "../lib/points.js";
import {
  loadStickerSettings,
  loadMyStickerOrders,
  orderSticker,
  orderMessage,
  payLinkFor,
  cancelMyStickerOrder,
  ORDER_STATUS,
} from "../lib/stickerOrders.js";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";
import AddressFields, { loadSavedAddress, rememberAddress } from "./AddressFields.jsx";

// "Get it mailed": the price on the button, then the order form with the
// price up top, the address, and how to pay. Shown inside the sticker sheet.
export default function StickerOrder({ vehicle, name, isPublic, onToast }) {
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [addr, setAddr] = useState(loadSavedAddress);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // the order just placed

  async function refreshOrders() {
    try {
      setOrders(await loadMyStickerOrders(vehicle.id));
    } catch (e) {
      onToast(e.message);
    }
  }

  useEffect(() => {
    loadStickerSettings()
      .then(setSettings)
      .catch((e) => (setSettings({ open: false }), onToast(e.message)));
    refreshOrders();
  }, [vehicle.id]);

  useEffect(() => {
    if (!open || balance !== null || !settings?.points_price) return;
    loadMyPoints()
      .then((p) => setBalance(Number(p.balance || 0)))
      .catch((e) => setError(e.message));
  }, [open, settings]);

  if (!settings) return null;
  const card = Boolean(settings.pay_link);
  const points = settings.points_price > 0;
  const orderable = settings.open && (card || points);
  const price = dollars(settings.price_cents);

  async function place(pay) {
    setError("");
    setBusy(pay);
    try {
      const result = await orderSticker(vehicle.id, pay, addr);
      if (result.status !== "ok") return setError(orderMessage(result));
      rememberAddress(addr);
      setDone(result);
      refreshOrders();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function cancel(id) {
    try {
      await cancelMyStickerOrder(id);
      onToast("Order cancelled");
      refreshOrders();
    } catch (e) {
      onToast(e.message);
    }
  }

  const list = orders.filter((o) => o.status !== "cancelled");
  const myOrders = list.length > 0 && (
    <div style={{ marginTop: 14 }}>
      <div style={label}>YOUR STICKER ORDERS</div>
      {list.map((o) => (
        <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: ORDER_STATUS[o.status]?.color }}>{ORDER_STATUS[o.status]?.label || o.status}</span>
            <span style={{ display: "block", ...muted, fontSize: 11.5 }}>
              {new Date(o.created_at).toLocaleDateString()} · {o.paid_with === "points" ? `${o.points} points` : dollars(o.price_cents)}
              {o.tracking ? ` · Tracking ${o.tracking}` : ""}
            </span>
          </span>
          {o.status === "awaiting_payment" && card && (
            <a className="action-btn" href={payLinkFor(settings.pay_link, o.id)} target="_blank" rel="noopener noreferrer" style={{ ...quietButton, width: "auto", padding: "8px 12px", color: "var(--a-3cabfd)", textDecoration: "none", fontSize: 13 }}>
              PAY
            </a>
          )}
          {o.status === "awaiting_payment" && (
            <button className="action-btn" onClick={() => cancel(o.id)} style={{ ...quietButton, width: "auto", padding: "8px 12px", fontSize: 13 }}>
              CANCEL
            </button>
          )}
        </div>
      ))}
    </div>
  );

  if (!orderable) {
    return (
      <>
        <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>Free to print at home.</div>
        {myOrders}
      </>
    );
  }

  if (!open) {
    return (
      <>
        <button
          className="action-btn"
          disabled={!isPublic}
          onClick={() => (setOpen(true), setDone(null), setError(""))}
          style={{ ...quietButton, marginTop: 8, opacity: isPublic ? 1 : 0.5, color: "var(--n-e6e6e6)" }}
        >
          📦 GET IT MAILED · {settings.price_cents > 0 && card ? price : `${settings.points_price} POINTS`}
        </button>
        <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>Printing at home is free. Or we'll mail you a printed sticker.</div>
        {myOrders}
      </>
    );
  }

  if (done) {
    const payUrl = done.pay_link ? payLinkFor(done.pay_link, done.id) : null;
    return (
      <div style={{ marginTop: 14, background: "var(--n-0f1a12)", border: "1px solid #14532D", borderRadius: 12, padding: 14 }}>
        {done.paid_with === "points" ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#10B981" }}>✓ Ordered with {settings.points_price} points</div>
            <div style={{ ...muted, marginTop: 4 }}>
              We'll alert you when your {name} sticker ships.{done.balance != null ? ` You have ${done.balance} points left.` : ""}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--n-e6e6e6)" }}>Order saved. One step left: pay {price}.</div>
            <div style={{ ...muted, marginTop: 4 }}>We start on it once the payment comes through, and alert you when it ships.</div>
            <a className="action-btn" href={payUrl} target="_blank" rel="noopener noreferrer" style={{ ...bigButton, display: "block", textAlign: "center", textDecoration: "none", marginTop: 10, boxSizing: "border-box" }}>
              💳 PAY {price} NOW
            </a>
          </>
        )}
        <button className="action-btn" onClick={() => setOpen(false)} style={{ ...quietButton, marginTop: 8 }}>
          DONE
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14, background: "var(--n-101010)", border: "1px solid var(--n-2a2a2a)", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.5 }}>📦 MAILED STICKER</div>
        <div style={{ textAlign: "right" }}>
          {card && settings.price_cents > 0 && <div style={{ fontSize: 28, fontWeight: 900, color: "var(--a-3cabfd)", lineHeight: 1 }}>{price}</div>}
          {points && (
            <div style={{ fontSize: card ? 12.5 : 24, fontWeight: card ? 700 : 900, color: card ? "var(--n-9ca3af)" : "#FACC15", marginTop: 2 }}>
              {card ? "or " : ""}
              {settings.points_price} points
            </div>
          )}
        </div>
      </div>
      <div style={{ ...muted, fontSize: 12.5, marginTop: 6 }}>
        {settings.blurb} {card ? "Shipping included." : ""}
      </div>

      <AddressFields addr={addr} onChange={setAddr} />

      {error && <div role="alert" style={{ ...muted, color: "var(--a-ef4444)", marginTop: 10 }}>{error}</div>}
      {card && (
        <button className="action-btn" disabled={Boolean(busy)} onClick={() => place("card")} style={{ ...bigButton, marginTop: 12, opacity: busy ? 0.6 : 1 }}>
          {busy === "card" ? "SAVING…" : `💳 PAY ${price} BY CARD`}
        </button>
      )}
      {points && (
        <button className="action-btn" disabled={Boolean(busy)} onClick={() => place("points")} style={{ ...quietButton, marginTop: 8, color: "#FACC15", opacity: busy ? 0.6 : 1 }}>
          {busy === "points" ? "ORDERING…" : `⭐ USE ${settings.points_price} POINTS${balance !== null ? ` · YOU HAVE ${balance}` : ""}`}
        </button>
      )}
      <button className="action-btn" onClick={() => setOpen(false)} style={{ ...quietButton, marginTop: 8 }}>
        BACK
      </button>
      {myOrders}
    </div>
  );
}
