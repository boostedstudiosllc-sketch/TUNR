import { useEffect, useState } from "react";
import { dollars, toCents } from "../lib/points.js";
import { buildPageUrl } from "../lib/buildpage.js";
import { loadStickerSettings, saveStickerSettings, loadStickerOrders, setStickerOrder, ORDER_STATUS } from "../lib/stickerOrders.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";
import PrintPage from "./PrintPage.jsx";
import { stickerHtml, STICKER_CSS } from "./StickerSheet.jsx";

// Admin: the mailed-sticker price and payment link, and the orders to make
// and ship (075_sticker_orders.sql).
export default function StickerOrdersAdmin({ onToast }) {
  const [draft, setDraft] = useState(null);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [printing, setPrinting] = useState("");

  async function refresh() {
    try {
      setOrders(await loadStickerOrders());
      setError("");
    } catch (e) {
      setError(e.message);
      setOrders([]);
    }
  }

  useEffect(() => {
    loadStickerSettings()
      .then((s) =>
        setDraft({
          open: s.open,
          price: s.price_cents ? (s.price_cents / 100).toFixed(2) : "",
          points: String(s.points_price || 0),
          payLink: s.pay_link || "",
          blurb: s.blurb || "",
        })
      )
      .catch((e) => setError(e.message));
    refresh();
  }, []);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    setError("");
    const cents = draft.price.trim() === "" ? 0 : toCents(draft.price);
    const points = Number(draft.points || 0);
    const link = draft.payLink.trim();
    if (cents === null) return setError("Set the price as dollars, like 8 or 8.50.");
    if (!(points >= 0 && points <= 100000)) return setError("Set the points price between 0 and 100000 (0 means points can't pay).");
    if (link && !/^https:\/\/\S+$/.test(link)) return setError("The payment link has to start with https:// (for example a Stripe Payment Link).");
    setBusy("save");
    try {
      await saveStickerSettings({ open: draft.open, price_cents: cents, points_price: points, pay_link: link || null, blurb: draft.blurb.trim().slice(0, 300) });
      onToast("Sticker settings saved");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function move(o, status) {
    let tracking = null;
    if (status === "sent") {
      tracking = window.prompt("Tracking number (optional)", "");
      if (tracking === null) return;
    }
    if (status === "cancelled" && !window.confirm(`Cancel ${o.ship_name}'s order?${o.paid_with === "points" ? ` Their ${o.points} points go back.` : " If they paid by card, refund them in Stripe too."}`)) return;
    setBusy(o.id);
    try {
      await setStickerOrder(o.id, status, tracking);
      onToast(status === "paid" ? "Marked paid" : status === "sent" ? "Marked shipped. They got an alert." : "Order cancelled");
      refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  async function printFile(o) {
    try {
      setPrinting(await stickerHtml(buildPageUrl(o.vehicle_id, o.invite_code), o.car, ["L"]));
    } catch (e) {
      onToast(`Couldn't make the sticker. (${e.message})`);
    }
  }

  async function copyAddress(o) {
    const text = [o.ship_name, o.line1, o.line2, `${o.city}, ${o.state} ${o.zip}`].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      onToast("Address copied");
    } catch (e) {
      onToast(`Couldn't copy. (${e.message})`);
    }
  }

  if (printing) {
    return (
      <PrintPage
        title="Sticker print file"
        tip="Save as PDF to upload to the print shop, or print it here."
        html={printing}
        css={STICKER_CSS}
        onBack={() => setPrinting("")}
      />
    );
  }

  return (
    <div>
      <div style={muted}>
        Members can order a printed copy of their car's QR sticker. They see the price before they order. Card payments go
        through your payment link (for example a Stripe Payment Link); each order's id shows on the payment as its reference.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}

      {draft && (
        <div style={box}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
            <input type="checkbox" checked={draft.open} onChange={(e) => set({ open: e.target.checked })} style={{ accentColor: "#0080F0", width: 18, height: 18 }} />
            Taking orders
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>PRICE ($)</div>
              <input style={field} inputMode="decimal" placeholder="8" value={draft.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>OR POINTS (0 = OFF)</div>
              <input style={field} inputMode="numeric" placeholder="80" value={draft.points} onChange={(e) => set({ points: e.target.value.replace(/\D/g, "") })} />
            </div>
          </div>
          <div style={{ ...label, marginTop: 12 }}>CARD PAYMENT LINK</div>
          <input style={field} type="url" placeholder="https://buy.stripe.com/…" value={draft.payLink} onChange={(e) => set({ payLink: e.target.value })} />
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>
            Make a payment link for the price above (Stripe: Payment Links → New). Empty = card payments off; members can still use points.
          </div>
          <div style={{ ...label, marginTop: 12 }}>WHAT THEY GET</div>
          <textarea style={{ ...field, minHeight: 56, resize: "vertical" }} maxLength={300} value={draft.blurb} onChange={(e) => set({ blurb: e.target.value })} />
          <button className="action-btn" disabled={busy === "save"} onClick={save} style={{ ...bigButton, marginTop: 12 }}>
            {busy === "save" ? "SAVING…" : "SAVE"}
          </button>
        </div>
      )}

      <div style={{ ...label, marginTop: 20, color: "var(--n-8a8a8a)" }}>ORDERS</div>
      {orders === null && <div style={muted}>Loading…</div>}
      {orders && orders.length === 0 && <div style={muted}>No sticker orders yet.</div>}
      {(orders || []).map((o) => (
        <div key={o.id} style={{ ...box, opacity: o.status === "cancelled" ? 0.55 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>{o.car}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: ORDER_STATUS[o.status]?.color, whiteSpace: "nowrap" }}>{ORDER_STATUS[o.status]?.label || o.status}</div>
          </div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>
            {o.ship_name}
            <br />
            {o.line1}
            {o.line2 ? `, ${o.line2}` : ""}
            <br />
            {o.city}, {o.state} {o.zip}
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>
            {new Date(o.created_at).toLocaleString()} · {o.paid_with === "points" ? `${o.points} points` : `${dollars(o.price_cents)} by card`} · ref {o.id}
            {o.tracking ? ` · tracking ${o.tracking}` : ""}
          </div>
          {o.status !== "cancelled" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <button className="action-btn" onClick={() => printFile(o)} style={small}>PRINT FILE</button>
              <button className="action-btn" onClick={() => copyAddress(o)} style={small}>COPY ADDRESS</button>
              {o.status === "awaiting_payment" && (
                <button className="action-btn" disabled={busy === o.id} onClick={() => move(o, "paid")} style={{ ...small, color: "var(--a-3cabfd)" }}>MARK PAID</button>
              )}
              {o.status !== "sent" && (
                <button className="action-btn" disabled={busy === o.id} onClick={() => move(o, "sent")} style={{ ...small, color: "#10B981" }}>MARK SHIPPED</button>
              )}
              {o.status !== "sent" && (
                <button className="action-btn" disabled={busy === o.id} onClick={() => move(o, "cancelled")} style={{ ...small, color: "var(--a-f87171)" }}>CANCEL</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const box = { marginTop: 10, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px", boxSizing: "border-box" };
const small = { ...quietButton, width: "auto", padding: "8px 12px", fontSize: 12.5 };
