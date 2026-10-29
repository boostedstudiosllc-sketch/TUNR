import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { withReason } from "../lib/errors.js";
import { muted } from "./Sheet.jsx";

// Settings → Admin → Admin log: every change an admin made (094_admin_log.sql),
// newest first: when, who, what, and what changed.

const WHAT = {
  point_ledger: "Points",
  purchase_claims: "Purchase / receipt",
  reward_redemptions: "Reward redemption",
  rewards: "Reward",
  points_settings: "Points rates",
  point_cards: "Points card",
  rush_scenery: "Rush scenery",
  garage_parts: "Garage part",
  game_settings: "TUNR Rush settings",
  events: "Meet",
  meet_checkins: "Check-in",
  points_meets: "Points meet",
  host_verifications: "Host verification",
  verified_hosts: "Verified host",
  host_invites: "Host invite",
  feedback: "Inbox message",
  community_reports: "Community report",
  reports: "Meet report",
  points_issues: "Points help",
  boosted_businesses: "Boosted business",
  perks: "Perk",
  partners: "Partner",
  profiles: "Profile",
  clubs: "Club",
  forums: "Forum",
  sticker_orders: "Sticker order",
  sticker_settings: "Sticker settings",
  listing_requests: "Listing request",
};
const VERB = { INSERT: "added", UPDATE: "changed", DELETE: "removed" };
// For something added or removed, the few fields that say what it was.
const KEY_FIELDS = ["title", "name", "username", "reason", "delta", "note", "status", "price", "label", "order_ref"];

const short = (v) => (v == null || v === "" ? "—" : String(v).length > 60 ? `${String(v).slice(0, 60)}…` : String(v));

function summary(row) {
  const c = row.changes || {};
  if (row.action === "UPDATE") return Object.entries(c).map(([k, [a, b]]) => `${k}: ${short(a)} → ${short(b)}`);
  return KEY_FIELDS.filter((k) => c[k] != null && c[k] !== "").map((k) => `${k}: ${short(c[k])}`);
}

export default function AdminLog() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!supabase) return setRows([]);
    supabase
      .rpc("admin_log_recent", { p_limit: 300 })
      .then(({ data, error: e }) => {
        if (e) throw new Error(withReason("Couldn't load the admin log.", e));
        setRows(data || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  const shown = (rows || []).filter((r) => !filter || r.target === filter);
  const targets = [...new Set((rows || []).map((r) => r.target))];

  return (
    <div>
      <div style={muted}>Every change an admin makes is written here by itself. Nobody can edit or delete it.</div>
      {error && (
        <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
          {error}
        </div>
      )}
      {targets.length > 1 && (
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: "#111", color: "#DDD", border: "1px solid #2A2A2A", fontSize: 14 }}>
          <option value="">Everything</option>
          {targets.map((t) => (
            <option key={t} value={t}>
              {WHAT[t] || t}
            </option>
          ))}
        </select>
      )}
      {rows === null && !error && <div style={{ ...muted, marginTop: 10 }}>Loading…</div>}
      {rows && !shown.length && <div style={{ ...muted, marginTop: 10 }}>No admin changes yet.</div>}
      <div style={{ marginTop: 10 }}>
        {shown.map((r) => (
          <div key={r.id} style={{ padding: "9px 0", borderBottom: "1px solid #1C1C1C" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>
                @{r.admin} {VERB[r.action]} · {WHAT[r.target] || r.target}
              </span>
              <span style={{ fontSize: 11.5, color: "#777", whiteSpace: "nowrap" }}>
                {new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            {summary(r).map((line) => (
              <div key={line} style={{ fontSize: 12.5, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", overflowWrap: "anywhere" }}>
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
