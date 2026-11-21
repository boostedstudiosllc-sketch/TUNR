import { useEffect, useState } from "react";
import { loadMembership, joinMembership, manageMembership } from "../lib/membership.js";
import { perksList, priceLabel, yearlySaving, statusLine } from "../lib/memberRules.js";
import Sheet, { sheetTitle, muted, bigButton, quietButton } from "./Sheet.jsx";

const PURPLE = "#A855F7";

// TUNR+ (122_membership.sql): what members get, join (monthly or yearly,
// paid by card on Stripe's page), or manage billing if you're in. Opened
// from Settings, Perks, the Pit Stop and "open:membership" links.
export default function Membership({ user, onClose, onNeedAccount }) {
  const [m, setM] = useState(null);
  const [plan, setPlan] = useState("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    loadMembership()
      .then(setM)
      .catch((e) => (setM({ plans: [] }), setError(e.message)));
  };
  useEffect(load, [user?.id]);

  const go = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const errorBox = error ? (
    <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 12 }}>
      {error}
    </div>
  ) : null;
  const plans = m?.plans || [];
  const saving = yearlySaving(plans);
  const chosen = plans.find((p) => p.id === plan) || plans[0];
  const perks = perksList(m?.restore_days || 30);

  return (
    <Sheet onClose={onClose} label="TUNR+ membership" zIndex={320}>
      <div style={{ ...sheetTitle, color: PURPLE }}>💎 TUNR+</div>
      <div style={{ ...muted, marginTop: 4 }}>Finding and joining meets is free, always. TUNR+ is for the extras.</div>

      {m?.member && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${PURPLE}`, background: "rgba(168,85,247,0.1)" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: PURPLE }}>✓ YOU'RE A MEMBER</div>
          <div style={{ ...muted, color: "var(--n-cccccc)", marginTop: 2 }}>{statusLine(m)}</div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {perks.map((p) => (
          <div key={p.title} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
            <span style={{ fontSize: 22, lineHeight: 1.2 }} aria-hidden>
              {p.icon}
            </span>
            <span>
              <span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>
                {p.title}
                {m?.member && <span style={{ color: "#10B981", marginLeft: 6, fontSize: 13 }}>✓</span>}
              </span>
              <span style={{ display: "block", ...muted, fontSize: 13.5 }}>{p.text}</span>
            </span>
          </div>
        ))}
      </div>

      {m === null && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}

      {m && !m.member && plans.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {plans.map((p) => {
              const on = chosen?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  aria-pressed={on}
                  style={{ flex: 1, textAlign: "left", padding: "12px 12px", borderRadius: 14, cursor: "pointer", border: `2px solid ${on ? PURPLE : "var(--n-2a2a2a)"}`, background: on ? "rgba(168,85,247,0.1)" : "var(--n-131313)", color: "var(--n-f0f0f0)", fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  <span style={{ display: "block", fontSize: 15, fontWeight: 900, letterSpacing: 0.6 }}>
                    {p.name.toUpperCase()}
                    {p.id === "year" && saving > 0 && <span style={{ fontSize: 10.5, marginLeft: 6, padding: "2px 6px", borderRadius: 999, background: "#FACC15", color: "#111", verticalAlign: 2, whiteSpace: "nowrap", display: "inline-block" }}>SAVE {saving}%</span>}
                  </span>
                  <span style={{ display: "block", fontSize: 24, fontWeight: 900, color: PURPLE }}>
                    {priceLabel(p.price_cents)}
                    <span style={{ fontSize: 14, color: "var(--n-888888)" }}>/{p.id === "year" ? "yr" : "mo"}</span>
                  </span>
                  {p.id === "year" && <span style={{ display: "block", ...muted, fontSize: 12 }}>{priceLabel(Math.round(p.price_cents / 12))} a month</span>}
                </button>
              );
            })}
          </div>
          {errorBox}
          {user ? (
            <button disabled={busy || !chosen} onClick={() => go(() => joinMembership(chosen.id))} style={{ ...bigButton, marginTop: 14, background: PURPLE }}>
              {busy ? "OPENING SECURE CHECKOUT…" : `JOIN TUNR+ · ${priceLabel(chosen?.price_cents)}/${chosen?.id === "year" ? "YR" : "MO"}`}
            </button>
          ) : (
            <button onClick={onNeedAccount} style={{ ...bigButton, marginTop: 14 }}>
              CREATE A FREE ACCOUNT FIRST
            </button>
          )}
          <div style={{ ...muted, fontSize: 11.5, marginTop: 8 }}>Paid by card on Stripe's secure page. Renews automatically; cancel any time and keep everything until the end of what you paid for.</div>
        </>
      )}

      {m?.member && errorBox}
      {m?.member && m.can_manage && (
        <button disabled={busy} onClick={() => go(manageMembership)} style={{ ...quietButton, marginTop: 14 }}>
          {busy ? "OPENING…" : m.cancel_at ? "RESTART OR MANAGE BILLING" : "MANAGE BILLING (CARD, PLAN, CANCEL)"}
        </button>
      )}
      {m && !m.member && !plans.length && (
        <>
          {errorBox}
          <button onClick={load} style={{ ...quietButton, marginTop: 12 }}>
            TRY AGAIN
          </button>
        </>
      )}

    </Sheet>
  );
}
