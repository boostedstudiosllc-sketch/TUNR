// Promoted meets (120_meet_promotions.sql): what's promoted, the prices,
// paying (api/promote → Stripe Checkout), and the admin's side. Rules for
// the list: promoRules.js. Screens: PromoteSheet.jsx, PromotionsAdmin.jsx.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError, errorReason } from "./errors.js";

export async function loadPromoted() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("promoted_meets");
  if (error) throw new Error(withReason("Couldn't load promoted meets.", error));
  return data || [];
}

export async function loadPackages() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("promo_packages").select("*").order("price_cents");
  if (error) throw new Error(withReason("Couldn't load the promotion prices.", error));
  return data || [];
}

// This meet's promotions (its hosts and admins see them).
export async function loadMeetPromotions(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("meet_promotions").select("id, package, status, ends_at, amount_cents, paid_via, created_at").eq("event_id", eventId).order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load this meet's promotions.", error));
  return data || [];
}

const ERRORS = {
  payments_not_set_up: "Card payments aren't switched on yet. Message TUNR and we'll promote it for you.",
  not_host: "Only this meet's host or co-hosts can promote it.",
  already: "This meet already has that promotion running.",
  meet_over: "This meet is over (or hidden), so it can't be promoted.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_signed_in: "Sign in to promote your meet.",
  rate_limit: "That's a lot of tries today. Try again tomorrow.",
  stripe_failed: "The payment page wouldn't open.",
};

// Opens Stripe's payment page for this meet and package.
export async function payToPromote(eventId, pkg) {
  if (!supabase) throw new Error("Promoting needs a connection to TUNR.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(ERRORS.not_signed_in);
  let r, body;
  try {
    r = await fetch("/api/promote", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ eventId, package: pkg }) });
    body = await r.json().catch(() => ({}));
  } catch (e) {
    throw new Error(`Couldn't reach TUNR to start the payment. (${errorReason(e)})`);
  }
  if (!r.ok || !body.url) {
    const msg = ERRORS[body.error] || `Couldn't start the payment. (${body.error || `status ${r.status}`})`;
    throw new Error(body.detail && body.error === "stripe_failed" ? `${msg} (${errorReason(body.detail)})` : msg);
  }
  window.location.href = body.url;
}

// ---------- admin ----------
export async function loadAllPromotions() {
  const { data, error } = await supabase
    .from("meet_promotions")
    .select("id, event_id, package, status, starts_at, ends_at, amount_cents, paid_via, created_at, events(title)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(withReason("Couldn't load promotions.", error));
  return data || [];
}

export async function grantPromotion(eventId, pkg) {
  const { data, error } = await supabase.rpc("admin_grant_promotion", { p_event: eventId, p_package: pkg });
  if (error) throw new Error(withReason("Couldn't promote that meet.", error));
  return data;
}

export async function cancelPromotion(id) {
  const { error } = await supabase.rpc("cancel_promotion", { p_id: id });
  if (error) throw new Error(withReason("Couldn't cancel the promotion.", error));
}

export async function savePackage(pkg) {
  const cents = Math.round(Number(pkg.price) * 100);
  if (!(cents >= 100 && cents <= 100000)) throw new Error("Prices are between $1 and $1,000.");
  const days = Math.round(Number(pkg.days));
  if (!(days >= 1 && days <= 30)) throw new Error("A promotion runs 1 to 30 days.");
  const { error } = await supabase.from("promo_packages").update({ price_cents: cents, days, active: pkg.active !== false }).eq("id", pkg.id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the price."));
}
