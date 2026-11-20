import { useEffect, useState } from "react";
import { loadPackages, loadMeetPromotions, payToPromote } from "../lib/promotions.js";
import { priceLabel, PERKS } from "../lib/promoRules.js";
import Sheet, { sheetTitle, muted, bigButton } from "./Sheet.jsx";

// "Promote this meet" (a host's tool on the meet page): Featured or
// Spotlight, paid by card on Stripe's page (120_meet_promotions.sql).
export default function PromoteSheet({ event, onClose }) {
  const [packages, setPackages] = useState(null);
  const [running, setRunning] = useState([]);
  const [pick, setPick] = useState("spotlight");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPackages()
      .then((p) => setPackages(p.filter((x) => x.active)))
      .catch((e) => (setPackages([]), setError(e.message)));
    loadMeetPromotions(event.id)
      .then((list) => setRunning(list.filter((p) => p.status === "active" && Date.parse(p.ends_at) > Date.now())))
      .catch((e) => console.warn(e.message));
  }, [event.id]);

  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      await payToPromote(event.id, pick);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const chosen = packages?.find((p) => p.id === pick);
  return (
    <Sheet onClose={onClose} label="Promote this meet" zIndex={300}>
      <div style={sheetTitle}>🚀 PROMOTE THIS MEET</div>
      <div style={{ ...muted, marginTop: 4 }}>Get “{event.title}” in front of more drivers. Promoted meets are labelled ⭐ PROMOTED.</div>
      {running.map((p) => (
        <div key={p.id} style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #10B981", color: "#10B981", fontSize: 13.5, fontWeight: 800 }}>
          ✓ {p.package === "spotlight" ? "Spotlight" : "Featured"} is live until {new Date(p.ends_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </div>
      ))}
      {packages === null && <div style={{ ...muted, marginTop: 12 }}>Loading prices…</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {packages?.map((p) => {
          const on = pick === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPick(p.id)}
              aria-pressed={on}
              style={{ textAlign: "left", padding: "14px 14px", borderRadius: 14, cursor: "pointer", border: `2px solid ${on ? "#0080F0" : "var(--n-2a2a2a)"}`, background: on ? "rgba(0,128,240,0.1)" : "var(--n-131313)", color: "var(--n-f0f0f0)", fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 21, fontWeight: 900 }}>
                  {p.id === "spotlight" ? "🔦" : "⭐"} {p.name.toUpperCase()}
                  {p.id === "spotlight" && <span style={{ fontSize: 11, marginLeft: 8, padding: "2px 7px", borderRadius: 999, background: "#FACC15", color: "#111", verticalAlign: 3 }}>BEST VALUE</span>}
                </span>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#FACC15" }}>{priceLabel(p.price_cents)}</span>
              </span>
              <span style={{ display: "block", ...muted, fontSize: 12.5, marginTop: 2 }}>{p.days} days, or until the meet ends</span>
              {(PERKS[p.id] || []).map((t) => (
                <span key={t} style={{ display: "block", fontSize: 14, fontFamily: "'Barlow', sans-serif", color: "var(--n-cccccc)", marginTop: 4 }}>
                  ✓ {t}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 10 }}>
          {error}
        </div>
      )}
      {chosen && (
        <button disabled={busy} onClick={pay} style={{ ...bigButton, marginTop: 14 }}>
          {busy ? "OPENING SECURE CHECKOUT…" : `PAY ${priceLabel(chosen.price_cents)} · ${chosen.name.toUpperCase()}`}
        </button>
      )}
      <div style={{ ...muted, fontSize: 11.5, marginTop: 8 }}>Paid by card on Stripe's secure page. It goes live as soon as the payment's through. One-time charge, no subscription.</div>
    </Sheet>
  );
}
