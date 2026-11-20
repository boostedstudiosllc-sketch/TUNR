import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
import { loadPackages, savePackage, loadAllPromotions, grantPromotion, cancelPromotion } from "../lib/promotions.js";
import { priceLabel } from "../lib/promoRules.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

// Settings → Admin → Promoted meets (120_meet_promotions.sql): set prices,
// promote a meet for free (paid in person, or a comp), see what's running
// and what's been paid, cancel one.

async function upcomingMeets() {
  const { data, error } = await supabase.from("events_public").select("id, title, start_at").gt("start_at", new Date().toISOString()).order("start_at").limit(60);
  if (error) throw new Error(withReason("Couldn't load upcoming meets.", error));
  return data || [];
}

export default function PromotionsAdmin({ onToast }) {
  const [packages, setPackages] = useState([]);
  const [list, setList] = useState(null);
  const [meets, setMeets] = useState([]);
  const [grant, setGrant] = useState({ event: "", pkg: "featured" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    Promise.all([loadPackages(), loadAllPromotions()])
      .then(([p, l]) => (setPackages(p.map((x) => ({ ...x, price: (x.price_cents / 100).toString() }))), setList(l), setError("")))
      .catch((e) => (setList([]), setError(e.message)));
  useEffect(() => {
    refresh();
    upcomingMeets()
      .then(setMeets)
      .catch((e) => setError(e.message));
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

  const now = Date.now();
  const live = (list || []).filter((p) => p.status === "active" && Date.parse(p.ends_at) > now);
  const paidTotal = (list || []).filter((p) => p.paid_via === "stripe").reduce((n, p) => n + p.amount_cents, 0);

  return (
    <div>
      <div style={muted}>Hosts pay by card from their meet page (🚀 PROMOTE THIS MEET). Card payments need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel; until then, promote meets here for free and take payment however you like.</div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}

      <div style={{ ...label, marginTop: 16 }}>PRICES</div>
      {packages.map((p, i) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 6 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 900, paddingBottom: 10 }}>{p.id === "spotlight" ? "🔦" : "⭐"} {p.name}</div>
          <div style={{ width: 90 }}>
            <div style={label}>$</div>
            <input style={field} inputMode="decimal" value={p.price} onChange={(e) => setPackages((all) => all.map((x, k) => (k === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
          </div>
          <div style={{ width: 70 }}>
            <div style={label}>DAYS</div>
            <input style={field} inputMode="numeric" value={p.days} onChange={(e) => setPackages((all) => all.map((x, k) => (k === i ? { ...x, days: e.target.value.replace(/\D/g, "") } : x)))} />
          </div>
          <button disabled={busy} onClick={() => act(() => savePackage(p), `${p.name} saved`)} style={{ ...quietButton, width: "auto", padding: "10px 12px" }}>
            SAVE
          </button>
        </div>
      ))}

      <div style={{ ...label, marginTop: 18 }}>PROMOTE A MEET FOR FREE</div>
      <select style={field} value={grant.event} onChange={(e) => setGrant((g) => ({ ...g, event: e.target.value }))} aria-label="Meet to promote">
        <option value="">Pick an upcoming meet…</option>
        {meets.map((m) => (
          <option key={m.id} value={m.id}>
            {new Date(m.start_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {m.title}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <select style={{ ...field, flex: 1 }} value={grant.pkg} onChange={(e) => setGrant((g) => ({ ...g, pkg: e.target.value }))} aria-label="Package">
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button disabled={busy || !grant.event} onClick={() => act(() => grantPromotion(grant.event, grant.pkg), "Promoted")} style={{ ...bigButton, width: 130, marginTop: 0 }}>
          PROMOTE
        </button>
      </div>

      <div style={{ ...label, marginTop: 18 }}>
        RUNNING NOW ({live.length}) · PAID BY CARD SO FAR: {priceLabel(paidTotal) || "$0"}
      </div>
      {list === null && <div style={muted}>Loading…</div>}
      {list?.length === 0 && <div style={muted}>No promotions yet.</div>}
      {list?.map((p) => {
        const running = p.status === "active" && Date.parse(p.ends_at) > now;
        // Paid, but the meet was hidden or over by then: never went live; refund it.
        const refund = p.status === "pending" && p.paid_via === "stripe";
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.events?.title || "A meet"}</span>
              <span style={{ display: "block", fontSize: 12, color: running ? "#10B981" : "var(--n-888888)", fontWeight: 700 }}>
                {p.package === "spotlight" ? "Spotlight" : "Featured"} · {running ? `live until ${new Date(p.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : refund ? "meet hidden or over: refund in Stripe" : p.status === "active" ? "ended" : p.status}
                {" · "}
                {p.paid_via === "stripe" ? `paid ${priceLabel(p.amount_cents)}` : p.paid_via === "admin" ? "free (admin)" : "not paid"}
              </span>
            </span>
            {(running || refund) && (
              <button disabled={busy} onClick={() => window.confirm(refund ? "Refunded it in Stripe? Mark it stopped." : "Stop this promotion now? (Refund any payment in Stripe yourself.)") && act(() => cancelPromotion(p.id), "Promotion stopped")} style={{ ...quietButton, width: "auto", padding: "6px 10px", fontSize: 12.5, color: "var(--a-f87171)" }}>
                STOP
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
