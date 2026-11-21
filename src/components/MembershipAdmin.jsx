import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
import { loadMembershipStats, loadPlans, savePlan, saveRestoreDays, setMember } from "../lib/membership.js";
import { priceLabel, shortDate } from "../lib/memberRules.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

// Settings → Admin → TUNR+ (122_membership.sql): prices, how often members
// can restore a streak, free memberships (comps), and who's a member.
export default function MembershipAdmin({ onToast }) {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState(null);
  const [days, setDays] = useState("");
  const [grant, setGrant] = useState({ username: "", days: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    Promise.all([loadPlans(), loadMembershipStats(), supabase.from("points_settings").select("member_restore_days").maybeSingle()])
      .then(([p, s, r]) => {
        if (r.error) throw new Error(withReason("Couldn't load the streak restore wait.", r.error));
        setPlans(p.map((x) => ({ ...x, price: (x.price_cents / 100).toString() })));
        setStats(s);
        setDays(String(r.data?.member_restore_days ?? 30));
      })
      .catch((e) => (setStats({ recent: [] }), setError(e.message)));
  useEffect(() => {
    refresh();
  }, []);

  const act = async (fn, done) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast?.(done);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const day = (iso) => shortDate(iso);

  return (
    <div>
      <details style={muted}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>How to switch on card payments</summary>
        Members pay by card through Stripe. In Vercel add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; in Stripe, send checkout.session.completed and the three customer.subscription events to /api/stripe-webhook, and save the customer portal once (Settings → Billing → Customer portal). Until then, give memberships below.
      </details>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {[
            ["MEMBERS", stats.members ?? 0],
            ["PAYING", stats.paying ?? 0],
            ["FREE", stats.free ?? 0],
            ["A MONTH", priceLabel(stats.monthly_cents) || "$0"],
          ].map(([k, v]) => (
            <div key={k} style={{ flex: 1, padding: "10px 8px", borderRadius: 10, background: "var(--n-131313)", border: "1px solid var(--n-222222)", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div>
              <div style={{ ...label, marginBottom: 0 }}>{k}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...label, marginTop: 18 }}>PRICES (NEW MEMBERS; CURRENT ONES KEEP THEIR PRICE)</div>
      {plans.map((p, i) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 6 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 900, paddingBottom: 10 }}>💎 {p.name}</div>
          <div style={{ width: 100 }}>
            <div style={label}>$ / {p.id === "year" ? "YEAR" : "MONTH"}</div>
            <input style={field} inputMode="decimal" value={p.price} onChange={(e) => setPlans((all) => all.map((x, k) => (k === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
          </div>
          <button disabled={busy} onClick={() => act(() => savePlan(p), `${p.name} price saved`)} style={{ ...quietButton, width: "auto", padding: "10px 12px" }}>
            SAVE
          </button>
        </div>
      ))}

      <div style={{ ...label, marginTop: 18 }}>STREAK RESTORE: ONCE EVERY … DAYS</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...field, flex: 1 }} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} aria-label="Days between streak restores" />
        <button disabled={busy} onClick={() => act(() => saveRestoreDays(days), "Saved")} style={{ ...quietButton, width: "auto", padding: "10px 12px" }}>
          SAVE
        </button>
      </div>

      <div style={{ ...label, marginTop: 18 }}>GIVE OR TAKE AWAY MEMBERSHIP</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...field, flex: 2 }} placeholder="@username" value={grant.username} onChange={(e) => setGrant((g) => ({ ...g, username: e.target.value }))} aria-label="Username" />
        <input style={{ ...field, flex: 1 }} placeholder="Days" inputMode="numeric" value={grant.days} onChange={(e) => setGrant((g) => ({ ...g, days: e.target.value.replace(/\D/g, "") }))} aria-label="Days (blank for no end)" />
      </div>
      <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>Leave days blank for no end.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button disabled={busy || !grant.username.trim()} onClick={() => act(() => setMember(grant.username, true, grant.days), "Membership given")} style={{ ...bigButton, marginTop: 0, flex: 1 }}>
          GIVE
        </button>
        <button disabled={busy || !grant.username.trim()} onClick={() => window.confirm(`Take membership away from ${grant.username}?`) && act(() => setMember(grant.username, false), "Membership removed")} style={{ ...quietButton, marginTop: 0, flex: 1, color: "var(--a-f87171)" }}>
          TAKE AWAY
        </button>
      </div>

      <div style={{ ...label, marginTop: 18 }}>RECENT</div>
      {stats === null && <div style={muted}>Loading…</div>}
      {stats?.recent?.length === 0 && <div style={muted}>No members yet.</div>}
      {stats?.recent?.map((r) => (
        <div key={`${r.username}-${r.updated_at}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
          <span style={{ fontSize: 15, fontWeight: 900 }}>@{r.username}</span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: r.member ? "#10B981" : "var(--n-888888)" }}>
            {r.member ? "member" : "ended"} · {r.via === "admin" ? "free" : r.plan === "year" ? "yearly" : "monthly"}
            {r.cancel_at ? ` · cancelled, ends ${day(r.cancel_at)}` : r.active_until && r.member ? ` · until ${day(r.active_until)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
