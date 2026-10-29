// Points and rewards: check in at meets, earn points, trade them for merch
// and vendor discounts. Every rule that matters (where, when, the code, the
// limits, who can redeem) is enforced in the database (045_points_and_rewards.sql);
// this is the app's side of it.
import { supabase } from "./supabase.js";
import { compressImage } from "./image.js";
import { friendlyWriteError, withReason } from "./errors.js";

// The Boosted shop isn't open yet. While false, buying, points cards and
// missing-points reports are hidden and the app says "coming soon"; the
// database side is ready for when it opens.
export const SHOP_OPEN = false;

export const POINTS = { checkin: 10, rsvpBonus: 1, profile: 10, car: 10, alerts: 5 };
export const REDEEM_RULES = { accountDays: 14, checkins: 2 };

function need() {
  if (!supabase) throw new Error("Points need an account.");
}

// What each check-in result means, in plain words. Anything new falls
// through to its code, so the reason is never hidden.
const CHECKIN_COPY = {
  not_signed_in: "Sign in to check in.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  not_found: "This meet isn't available.",
  not_points_meet: "This meet doesn't give points.",
  posted_too_late: "This meet was posted less than a day before it started, so it doesn't give points.",
  own_meet: "Hosts don't earn points at their own meet.",
  not_happening: "Check-in opens 30 minutes before the meet starts and closes when it ends.",
  no_pin: "This meet has no map pin yet, so check-in can't confirm you're there. Ask the host to add the address.",
  location_needed: "Turn on location so TUNR can confirm you're at the meet (Settings → Location).",
  weak_location: "Your location isn't precise enough. Turn on precise location (or step outside) and try again.",
  already: "You already checked in to this meet today.",
  daily_limit: "That's 3 check-ins in 24 hours, the limit. Try again tomorrow.",
};

export function checkinMessage(result) {
  const status = result?.status || "unknown";
  if (status === "too_far") {
    const miles = (Number(result.distance_m || 0) / 1609.34).toFixed(1);
    return `You're about ${miles} miles from this meet. Check in once you're there.`;
  }
  return CHECKIN_COPY[status] || `Couldn't check in. (${status})`;
}

const REDEEM_COPY = {
  not_signed_in: "Sign in to redeem.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_found: "That reward isn't available any more.",
  sold_out: "That reward just sold out.",
  limit: "You've already claimed this reward the most times allowed.",
};

export function redeemMessage(result) {
  const status = result?.status || "unknown";
  if (status === "too_new") {
    const d = Number(result.days_left || 0);
    return `New accounts can redeem after ${REDEEM_RULES.accountDays} days. ${d} day${d === 1 ? "" : "s"} to go.`;
  }
  if (status === "need_checkins") {
    return `Check in at ${REDEEM_RULES.checkins} meets to unlock rewards. You have ${result.checkins || 0}.`;
  }
  if (status === "not_enough") {
    return `You need ${result.cost} points and have ${result.balance}.`;
  }
  if (status === "need_spend") {
    return `This reward is for people who've spent at least ${dollars(result.min_spend_cents)} on Boosted merch. You've spent ${dollars(result.spent_cents)}.`;
  }
  return REDEEM_COPY[status] || `Couldn't redeem that. (${status})`;
}

// Ids of the meets that pay points, for the ⭐ on cards and the check-in box.
export async function loadPointsMeets() {
  if (!supabase) return new Set();
  const { data, error } = await supabase.from("points_meets").select("event_id");
  if (error) throw new Error(withReason("Couldn't load which meets give points.", error));
  return new Set((data || []).map((r) => r.event_id));
}

export async function isPointsMeet(eventId) {
  if (!supabase) return false;
  const { data, error } = await supabase.from("points_meets").select("event_id").eq("event_id", eventId).limit(1);
  if (error) throw new Error(withReason("Couldn't check whether this meet gives points.", error));
  return Boolean(data && data.length);
}

// An admin boosts a meet to more points (0 or null puts it back to normal).
export async function setMeetPoints(eventId, points) {
  need();
  const { error } = await supabase.rpc("set_meet_points", { p_event: eventId, p_points: points || null });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't change this meet's points."));
}

export async function setPointsMeet(eventId, on) {
  need();
  const { error } = await supabase.rpc("set_points_meet", { p_event: eventId, p_on: on });
  if (error) throw new Error(friendlyWriteError(error, on ? "Couldn't turn on points for this meet." : "Couldn't turn off points for this meet."));
}

// Asks the phone where it is, once, at the moment of checking in.
export function preciseLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location, so it can't check you in."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? "Location is blocked for TUNR, so it can't check you in. Settings → Location shows how to turn it on."
              : withReason("Couldn't find your location.", err)
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export async function checkIn(eventId, code, pos) {
  need();
  const { data, error } = await supabase.rpc("check_in_at_meet", {
    p_event: eventId,
    p_code: code,
    p_lat: pos?.lat ?? null,
    p_lng: pos?.lng ?? null,
    p_accuracy: pos?.accuracy ?? null,
  });
  if (error) throw new Error(withReason("Couldn't check in.", error));
  if (data?.status === "ok") pointsEarned();
  return data || {};
}

const STAY_COPY = {
  not_signed_in: "Sign in first.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  not_found: "This meet isn't available.",
  not_happening: "The stay bonus closes an hour after the meet's end time.",
  not_checked_in: "Check in when you arrive first; the stay bonus is for people who were there from the start.",
  late_arrival: "The stay bonus is for people who checked in within the first hour of the meet.",
  already: "You already got the stay bonus for this meet.",
  no_pin: "This meet has no map pin, so TUNR can't confirm you're still there.",
  location_needed: "Allow location so TUNR can confirm you're still at the meet.",
  weak_location: "Your location isn't precise enough. Turn on precise location (or step outside) and try again.",
};

export function stayMessage(result) {
  const status = result?.status || "unknown";
  if (status === "too_early") {
    const at = new Date(result.opens_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `Not yet: the stay bonus opens at ${at}, 30 minutes before the listed end time.`;
  }
  if (status === "too_far") {
    const miles = (Number(result.distance_m || 0) / 1609.34).toFixed(1);
    return `You're about ${miles} miles from the meet. The stay bonus is for being there at the end.`;
  }
  return STAY_COPY[status] || `Couldn't add the stay bonus. (${status})`;
}

// Checked in at the start and still there at the end: +1.
export async function stayCheckIn(eventId, pos) {
  need();
  const { data, error } = await supabase.rpc("stay_check_in", {
    p_event: eventId,
    p_lat: pos?.lat ?? null,
    p_lng: pos?.lng ?? null,
    p_accuracy: pos?.accuracy ?? null,
  });
  if (error) throw new Error(withReason("Couldn't add the stay bonus.", error));
  if (data?.status === "ok") pointsEarned();
  return data || {};
}

export async function myCheckin(eventId, userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("meet_checkins")
    .select("occurrence, created_at, voided_at, stayed_at")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(withReason("Couldn't load your check-in.", error));
  return data?.[0] || null;
}

export async function loadMyPoints() {
  need();
  const { data, error } = await supabase.rpc("my_points");
  if (error) throw new Error(withReason("Couldn't load your points.", error));
  return data || {};
}

export async function claimStarterPoints() {
  need();
  const { data, error } = await supabase.rpc("claim_starter_points");
  if (error) throw new Error(withReason("Couldn't check your getting-started points.", error));
  return data || {};
}

// Meets someone has hosted: { hosted, level (0, 5, 10 or 25), next }. Cached
// for the visit, since a profile shows it in a few places.
const hostBadges = new Map();
export function loadHostBadge(userId) {
  if (!supabase || !userId) return Promise.resolve(null);
  if (!hostBadges.has(userId)) {
    hostBadges.set(
      userId,
      supabase.rpc("host_badge", { p_user: userId }).then(({ data, error }) => {
        if (error) {
          hostBadges.delete(userId);
          throw new Error(withReason("Couldn't load the host badge.", error));
        }
        return data;
      })
    );
  }
  return hostBadges.get(userId);
}

// Pays any host milestones reached (5, 10, 25 meets): { added, hosted }.
export async function claimHostBadges() {
  need();
  const { data, error } = await supabase.rpc("claim_host_badges");
  if (error) throw new Error(withReason("Couldn't check your hosting points.", error));
  return data || {};
}

// TUNR Wrapped: your year's numbers (098).
export async function loadWrapped(year) {
  need();
  const { data, error } = await supabase.rpc("my_wrapped", { p_year: year });
  if (error) throw new Error(withReason("Couldn't load your Wrapped.", error));
  if (!data) throw new Error("Sign in to see your Wrapped.");
  return data;
}

const REASON_LABELS = {
  checkin: "Checked in",
  rsvp_bonus: "Said you'd go, and showed up",
  stay_bonus: "Stayed the whole meet",
  streak_bonus: "Weekly streak bonus",
  referral_bonus: "A friend you brought checked in",
  welcome_bonus: "Welcome bonus: your first meet",
  game_bonus: "TUNR Rush daily drive",
  starter_profile: "Finished your profile",
  starter_car: "Added your car",
  starter_alerts: "Turned on alerts",
  purchase: "Boosted purchase",
  member_bonus: "Membership bonus",
  spin_bonus: "Weekly spin",
  host_bonus: "Hosting milestone",
  photo_bonus: "Photo of the week",
  guess_bonus: "Guess the Car",
  redeem: "Redeemed",
  refund: "Points returned",
  revoke: "Check-in removed",
  admin_adjust: "Adjusted by TUNR",
};

export async function loadPointHistory(userId) {
  need();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("id, delta, reason, note, created_at, claimed_at, event_id, events(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(withReason("Couldn't load your points history.", error));
  return (data || []).map((r) => ({
    id: r.id,
    delta: r.delta,
    label: REASON_LABELS[r.reason] || r.reason,
    detail: [r.events?.title || r.note, r.claimed_at ? "" : "waiting to claim in 📋"].filter(Boolean).join(" · "),
    at: r.created_at,
  }));
}

// Points you've earned that wait in the checklist until you tap CLAIM.
// Anything that earns points calls pointsEarned() so the 📋 badge updates.
export const CLAIM_HINT = "Claim in your 📋 checklist.";
export function pointsEarned() {
  window.dispatchEvent(new CustomEvent("tunr:points"));
}

export async function loadUnclaimed(userId) {
  need();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("id, delta, reason, note, created_at, events(title)")
    .eq("user_id", userId)
    .is("claimed_at", null)
    .gt("delta", 0)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(withReason("Couldn't load your points to claim.", error));
  return (data || []).map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, label: REASON_LABELS[r.reason] || r.reason, detail: r.events?.title || r.note || "", at: r.created_at }));
}

// ids: the ones to claim, or null for all of them. Returns { claimed, balance }.
export async function claimPoints(ids = null) {
  need();
  const { data, error } = await supabase.rpc("claim_points", { p_ids: ids });
  if (error) throw new Error(withReason("Couldn't claim your points.", error));
  if (data?.status !== "ok") throw new Error(`Couldn't claim your points. (${data?.status})`);
  return data;
}

// Which kinds of points you've had since a moment (for the checklist):
// [{ reason, at }], newest first.
export async function loadPointsSince(userId, sinceIso) {
  need();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("reason, created_at")
    .eq("user_id", userId)
    .gt("delta", 0)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(withReason("Couldn't load your recent points.", error));
  return (data || []).map((r) => ({ reason: r.reason, at: r.created_at }));
}

export async function loadRewards() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rewards")
    .select("id, title, description, kind, cost, min_spend_cents, how_to_claim, stock, per_person, active, partner_id, partners(name)")
    .order("cost");
  if (error) throw new Error(withReason("Couldn't load rewards.", error));
  return (data || []).map((r) => ({ ...r, partnerName: r.partners?.name || "" }));
}

export async function redeemReward(rewardId) {
  need();
  const { data, error } = await supabase.rpc("redeem_reward", { p_reward: rewardId });
  if (error) throw new Error(withReason("Couldn't redeem that.", error));
  return data || {};
}

export async function loadMyRedemptions(userId) {
  need();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select("id, claim_code, status, cost, created_at, rewards(title, how_to_claim, partners(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load your rewards.", error));
  return (data || []).map((r) => ({
    id: r.id,
    code: r.claim_code,
    status: r.status,
    cost: r.cost,
    at: r.created_at,
    title: r.rewards?.title || "Reward",
    howToClaim: r.rewards?.how_to_claim || "",
    partnerName: r.rewards?.partners?.name || "",
  }));
}

export const dollars = (cents) =>
  "$" + (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, "");

// "$35" or "35.50" → cents; null when it isn't a sensible amount.
export function toCents(text) {
  const n = Number(String(text || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export const STORES = [
  { id: "square", label: "Online shop (Square)" },
  { id: "depop", label: "Depop" },
  { id: "in_person", label: "In person at a meet" },
  { id: "other", label: "Somewhere else" },
];

export async function loadPointsSettings() {
  const fallback = { points_per_dollar: 1, member_bonus: 50, referral_points: 5, welcome_points: 1, receipt_points: 10, photo_points: 25 };
  if (!supabase) return fallback;
  const { data, error } = await supabase
    .from("points_settings")
    .select("points_per_dollar, member_bonus, referral_points, welcome_points, receipt_points, photo_points")
    .maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the points rates.", error));
  return data || fallback;
}

// ============ POINTS CARDS ============
// One-time codes on a card in every order bag (or handed over after a sale
// or a detail). Scanning one adds its points at once; nobody checks orders.
export const CARD_PARAM = "card";
const PENDING_CARD_KEY = "tunr.pendingCard";

export const cleanCardCode = (text) => String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

// A scanned link (?card=…) waits here until the person is signed in.
export function rememberPendingCard(code) {
  try {
    sessionStorage.setItem(PENDING_CARD_KEY, cleanCardCode(code));
  } catch (e) {
    console.warn(`Couldn't remember the scanned card: ${e.message}`);
  }
}

export function takePendingCard() {
  try {
    const code = sessionStorage.getItem(PENDING_CARD_KEY) || "";
    sessionStorage.removeItem(PENDING_CARD_KEY);
    return code;
  } catch (e) {
    console.warn(`Couldn't read the scanned card: ${e.message}`);
    return "";
  }
}

export function hasPendingCard() {
  try {
    return Boolean(sessionStorage.getItem(PENDING_CARD_KEY));
  } catch (e) {
    console.warn(`Couldn't read the scanned card: ${e.message}`);
    return false;
  }
}

const CARD_COPY = {
  not_signed_in: "Sign in to add your points card.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  rate_limited: "Too many tries. Wait an hour and try again.",
  invalid: "That code doesn't exist. Check each letter and try again.",
  used: "That card was already used by another account.",
  yours: "You already added this card. The points are in your history.",
  expired: "That card has expired.",
};

export async function redeemPointCard(code) {
  need();
  const { data, error } = await supabase.rpc("redeem_point_card", { p_code: code });
  if (error) throw new Error(withReason("Couldn't add that card.", error));
  if (data?.status !== "ok") throw new Error(CARD_COPY[data?.status] || `Couldn't add that card. (${data?.status})`);
  pointsEarned();
  return data;
}

// ============ ADMIN ============
export async function savePointsSettings(settings) {
  need();
  const { error } = await supabase
    .from("points_settings")
    .update({
      points_per_dollar: Number(settings.points_per_dollar),
      member_bonus: Number(settings.member_bonus),
      referral_points: Number(settings.referral_points),
      welcome_points: Number(settings.welcome_points),
      receipt_points: Number(settings.receipt_points ?? 10),
      photo_points: Number(settings.photo_points ?? 25),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the points rates."));
}

// ---------- the weekly spin (093_weekly_spin.sql) ----------

// { spun, points, next_at } for this week (Monday–Sunday, Atlanta time).
export async function loadMySpin() {
  need();
  const { data, error } = await supabase.rpc("my_spin");
  if (error) throw new Error(withReason("Couldn't check your weekly spin.", error));
  return data || { spun: false };
}

// Spin: the server picks 1–5 and adds it to your balance. { points, next_at, again }.
export async function spinWheel() {
  need();
  const { data, error } = await supabase.rpc("spin_wheel");
  if (error) throw new Error(withReason("Couldn't spin the wheel.", error));
  if (data?.status === "ok" || data?.status === "already") return { points: data.points, next_at: data.next_at, again: data.status === "already" };
  if (data?.status === "unconfirmed") throw new Error("Confirm your email first. Tap the link we emailed you.");
  if (data?.status === "not_signed_in") throw new Error("Sign in to spin.");
  throw new Error(`Couldn't spin the wheel. (${data?.status})`);
}

// ---------- Boosted receipts (091_receipts_and_detail_tiers.sql) ----------

export const RECEIPT_BUSINESSES = [
  ["detailing", "🧽 Detailing"],
  ["photography", "📸 Photography"],
  ["merch", "👕 Merch"],
  ["other", "🏁 Other Boosted"],
];

const RECEIPT_COPY = {
  not_signed_in: "Sign in to send a receipt.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  bad_business: "Pick which Boosted business it's from.",
  bad_order: "Add the receipt or invoice number (3 to 60 characters).",
  bad_amount: "Add the amount you paid, between $1 and $10,000.",
  need_receipt: "Add a photo of the receipt or invoice.",
  rate_limited: "One receipt a day. Send the next one tomorrow.",
  duplicate: "That receipt number has already been sent. Each receipt counts once.",
};

// A photo of a receipt or invoice from any Boosted business, for points once
// TUNR checks it. The photo is private (only you and TUNR's admins see it).
export async function submitReceipt({ userId, business, orderRef, amountCents, file }) {
  need();
  if (!userId) throw new Error("Sign in to send a receipt.");
  if (!file) throw new Error(RECEIPT_COPY.need_receipt);
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo of the receipt (an image file).");
  const small = await compressImage(file, { maxDim: 1800 });
  const path = `${userId}/${Date.now()}.jpg`;
  const up = await supabase.storage.from("receipts").upload(path, small, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw new Error(withReason("Couldn't upload the receipt photo.", up.error));
  const { data, error } = await supabase.rpc("submit_receipt", { p_business: business, p_order_ref: orderRef.trim(), p_amount_cents: amountCents, p_receipt_path: path });
  if (error) throw new Error(withReason("Couldn't send your receipt.", error));
  if (data?.status !== "ok") throw new Error(RECEIPT_COPY[data?.status] || `Couldn't send your receipt. (${data?.status})`);
}

// Your receipts and where they're at, newest first.
export async function loadMyReceipts(userId) {
  need();
  const { data, error } = await supabase
    .from("purchase_claims")
    .select("id, business, order_ref, amount_cents, status, points, note, created_at")
    .eq("user_id", userId)
    .not("receipt_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(withReason("Couldn't load your receipts.", error));
  return data || [];
}

// Admin: a link to look at a receipt photo (good for an hour).
export async function receiptLink(path) {
  need();
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
  if (error) throw new Error(withReason("Couldn't open that receipt.", error));
  return data.signedUrl;
}

// Admin: approve (optionally fixing the amount) or turn down a receipt.
export async function decidePurchase(id, approve, amountCents = null, note = null) {
  need();
  const { data, error } = await supabase.rpc("decide_purchase", { p_claim: id, p_approve: approve, p_amount_cents: amountCents, p_note: note });
  if (error) throw new Error(withReason(approve ? "Couldn't approve that receipt." : "Couldn't turn down that receipt.", error));
  return data;
}

export async function loadPurchaseQueue(status = "pending") {
  need();
  const { data, error } = await supabase.rpc("purchase_queue", { p_status: status });
  if (error) throw new Error(withReason("Couldn't load purchases.", error));
  return data || [];
}

export async function recordPurchase(userId, store, orderRef, amountCents) {
  need();
  const { data, error } = await supabase.rpc("record_purchase", {
    p_user: userId,
    p_store: store,
    p_order_ref: orderRef,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't record that sale."));
  return data;
}

export async function createPointCards({ label, points, valueCents, count, expiresAt }) {
  need();
  const { data, error } = await supabase.rpc("create_point_cards", {
    p_label: label,
    p_points: points,
    p_value_cents: valueCents,
    p_count: count,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't make the cards."));
  return (data || []).map((r) => r.card_code);
}

export async function loadCardBatches() {
  need();
  const { data, error } = await supabase.rpc("point_card_batches");
  if (error) throw new Error(withReason("Couldn't load your points cards.", error));
  return data || [];
}

export async function loadUnusedCards(batchId) {
  need();
  const { data, error } = await supabase.rpc("point_card_codes", { p_batch: batchId });
  if (error) throw new Error(withReason("Couldn't load that batch's codes.", error));
  return data || [];
}

export async function voidCardBatch(batchId) {
  need();
  const { data, error } = await supabase.rpc("void_point_cards", { p_batch: batchId });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't cancel those cards."));
  return data;
}

// @username → account id, for the admin forms.
export async function findUserId(username) {
  need();
  const name = String(username || "").trim().replace(/^@/, "").toLowerCase();
  const { data, error } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle();
  if (error) throw new Error(withReason("Couldn't look up that username.", error));
  if (!data) throw new Error(`No account with the username @${name}.`);
  return data.id;
}
export async function saveReward(reward) {
  need();
  const row = {
    title: reward.title.trim(),
    description: reward.description?.trim() || null,
    kind: reward.kind,
    cost: Number(reward.cost),
    partner_id: reward.partnerId || null,
    how_to_claim: reward.howToClaim?.trim() || null,
    stock: reward.stock === "" || reward.stock == null ? null : Number(reward.stock),
    per_person: Number(reward.perPerson || 1),
    min_spend_cents: toCents(reward.minSpend) || 0,
    active: reward.active !== false,
  };
  const q = reward.id
    ? supabase.from("rewards").update(row).eq("id", reward.id)
    : supabase.from("rewards").insert(row);
  const { error } = await q;
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that reward."));
}

export async function loadPartnersForRewards() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("partners").select("id, name").order("name");
  if (error) throw new Error(withReason("Couldn't load partner shops.", error));
  return data || [];
}

export async function loadRedemptionQueue(status = "pending") {
  need();
  const { data, error } = await supabase.rpc("redemption_queue", { p_status: status });
  if (error) throw new Error(withReason("Couldn't load reward claims.", error));
  return data || [];
}

export async function decideRedemption(id, status) {
  need();
  const { error } = await supabase.rpc("decide_redemption", { p_id: id, p_status: status });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't update that claim."));
}

export async function loadRecentCheckins() {
  need();
  const { data, error } = await supabase.rpc("recent_checkins");
  if (error) throw new Error(withReason("Couldn't load check-ins.", error));
  return data || [];
}

export async function voidCheckin(id) {
  need();
  const { error } = await supabase.rpc("void_checkin", { p_id: id });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't remove that check-in."));
}

export async function adjustPoints(userId, delta, note) {
  need();
  const { error } = await supabase.rpc("adjust_points", { p_user: userId, p_delta: delta, p_note: note });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't adjust points."));
}

// ============ MISSING POINTS ============
const ISSUE_COPY = {
  not_signed_in: "Sign in to report missing points.",
  bad_order: "Enter the order or receipt number (at least 3 characters).",
  bad_email: "Enter the email you used when you bought it, like name@gmail.com.",
  rate_limited: "That's 3 reports today, the limit. Try again tomorrow, or email us.",
  already_open: "You already reported this order. We'll get back to you.",
  already_paid: "Points for that order were already added (check your history). If they went to the wrong account, email us.",
};

export async function reportPointsIssue({ store, orderRef, purchaseEmail, item, message }) {
  need();
  const { data, error } = await supabase.rpc("report_points_issue", {
    p_store: store,
    p_order_ref: orderRef,
    p_purchase_email: purchaseEmail,
    p_item: item,
    p_message: message,
  });
  if (error) throw new Error(withReason("Couldn't send your report.", error));
  if (data?.status !== "ok") throw new Error(ISSUE_COPY[data?.status] || `Couldn't send your report. (${data?.status})`);
}

export async function loadMyPointsIssues(userId) {
  need();
  const { data, error } = await supabase
    .from("points_issues")
    .select("id, order_ref, status, reply, points_added, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(withReason("Couldn't load your reports.", error));
  return data || [];
}

export async function loadPointsIssueQueue(status = "open") {
  need();
  const { data, error } = await supabase.rpc("points_issue_queue", { p_status: status });
  if (error) throw new Error(withReason("Couldn't load points reports.", error));
  return data || [];
}

// amountCents set: add points for the order. Null: decline with the reply.
export async function resolvePointsIssue(id, amountCents, reply) {
  need();
  const { data, error } = await supabase.rpc("resolve_points_issue", {
    p_id: id,
    p_amount_cents: amountCents,
    p_reply: reply,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't answer that report."));
  return data;
}

// ============ STREAKS AND LEADERBOARD ============
export const STREAK_MILESTONES = [
  [4, 2],
  [8, 3],
  [12, 5],
  [26, 15],
  [52, 30],
];

export async function loadMyStreak() {
  need();
  const { data, error } = await supabase.rpc("my_streak");
  if (error) throw new Error(withReason("Couldn't load your streak.", error));
  return data || { current: 0, best: 0, this_week: false, hidden: false };
}

// "streaks" (current weekly streak) or "month" (check-ins this month).
export async function loadLeaderboard(kind = "streaks") {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("leaderboard", { p_kind: kind, p_limit: 50 });
  if (error) throw new Error(withReason("Couldn't load the leaderboard.", error));
  return data || [];
}

export async function setHiddenFromLeaderboards(userId, hidden) {
  need();
  const { error } = await supabase.from("profiles").update({ hide_from_leaderboards: hidden }).eq("id", userId);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't change your leaderboard setting."));
}
