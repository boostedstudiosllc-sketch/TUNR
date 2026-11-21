// TUNR+ (122_membership.sql): your membership, joining and billing
// (api/membership → Stripe), and the admin's side. Rules: memberRules.js.
// Screen: Membership.jsx; admin: MembershipAdmin.jsx.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { ERRORS, errorMessage } from "./memberRules.js";

export async function loadMembership() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_membership");
  if (error) throw new Error(withReason("Couldn't load your membership.", error));
  return data;
}

async function call(body) {
  if (!supabase) throw new Error("TUNR+ needs a connection to TUNR.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(ERRORS.not_signed_in);
  let r, res;
  try {
    r = await fetch("/api/membership", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    res = await r.json().catch(() => ({}));
  } catch (e) {
    throw new Error(`Couldn't reach TUNR. (${e.message})`);
  }
  if (!r.ok || !res.url) throw new Error(errorMessage(r.status, res));
  window.location.href = res.url;
}

export const joinMembership = (plan) => call({ action: "join", plan });
export const manageMembership = () => call({ action: "manage" });

// ---------- admin ----------

export async function loadMembershipStats() {
  const { data, error } = await supabase.rpc("membership_stats");
  if (error) throw new Error(withReason("Couldn't load membership numbers.", error));
  return data;
}

export async function loadPlans() {
  const { data, error } = await supabase.from("membership_plans").select("*").order("price_cents");
  if (error) throw new Error(withReason("Couldn't load membership prices.", error));
  return data || [];
}

export async function savePlan(plan) {
  const cents = Math.round(Number(plan.price) * 100);
  if (!Number.isFinite(cents) || cents < 100) throw new Error("Price must be at least $1.");
  const { error } = await supabase.from("membership_plans").update({ price_cents: cents }).eq("id", plan.id);
  if (error) throw new Error(friendlyWriteError(error, `Couldn't save the ${plan.name} price.`));
}

export async function saveRestoreDays(days) {
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 7 || n > 365) throw new Error("Pick between 7 and 365 days.");
  const { error } = await supabase.from("points_settings").update({ member_restore_days: n }).eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the streak restore wait."));
}

const ADMIN_ERRORS = {
  not_found: "No account with that username.",
  bad_days: "Days must be between 1 and 3650 (or blank for no end).",
  paying: "They pay by card. Cancel it in Stripe instead.",
};

export async function setMember(username, on, days) {
  const { data, error } = await supabase.rpc("admin_set_member", { p_username: username, p_on: on, p_days: days ? Number(days) : null });
  if (error) throw new Error(withReason("Couldn't change that membership.", error));
  if (data?.status !== "ok") throw new Error(ADMIN_ERRORS[data?.status] || `Couldn't change that membership. (${data?.status})`);
  return data;
}
