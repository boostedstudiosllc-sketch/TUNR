// Points and rewards: check in at meets, earn points, trade them for merch
// and vendor discounts. Every rule that matters (where, when, the code, the
// limits, who can redeem) is enforced in the database (045_points_and_rewards.sql);
// this is the app's side of it.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";

export const POINTS = { checkin: 10, rsvpBonus: 5, profile: 10, car: 10, alerts: 5 };
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
  own_meet: "Hosts don't earn points at their own meet.",
  not_happening: "Check-in opens 30 minutes before the meet starts and closes when it ends.",
  no_pin: "This meet has no map pin yet, so check-in can't confirm you're there. Ask the host to add the address.",
  location_needed: "Allow location so TUNR can confirm you're at the meet.",
  weak_location: "Your location isn't precise enough. Turn on precise location (or step outside) and try again.",
  wrong_code: "That code isn't right. Get today's code from the host or the sign at the meet.",
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

export async function setPointsMeet(eventId, on) {
  need();
  const { error } = await supabase.rpc("set_points_meet", { p_event: eventId, p_on: on });
  if (error) throw new Error(friendlyWriteError(error, on ? "Couldn't turn on points for this meet." : "Couldn't turn off points for this meet."));
}

export async function getCheckinCode(eventId) {
  need();
  const { data, error } = await supabase.rpc("get_checkin_code", { p_event: eventId });
  if (error) throw new Error(withReason("Couldn't get today's check-in code.", error));
  return data || {};
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
              ? "Location is blocked for TUNR. Allow it in your browser or phone settings to check in."
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
  return data || {};
}

export async function myCheckin(eventId, userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("meet_checkins")
    .select("occurrence, created_at, voided_at")
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

const REASON_LABELS = {
  checkin: "Checked in",
  rsvp_bonus: "Said you'd go, and showed up",
  starter_profile: "Finished your profile",
  starter_car: "Added your car",
  starter_alerts: "Turned on alerts",
  redeem: "Redeemed",
  refund: "Points returned",
  revoke: "Check-in removed",
  admin_adjust: "Adjusted by TUNR",
};

export async function loadPointHistory(userId) {
  need();
  const { data, error } = await supabase
    .from("point_ledger")
    .select("id, delta, reason, note, created_at, event_id, events(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(withReason("Couldn't load your points history.", error));
  return (data || []).map((r) => ({
    id: r.id,
    delta: r.delta,
    label: REASON_LABELS[r.reason] || r.reason,
    detail: r.events?.title || r.note || "",
    at: r.created_at,
  }));
}

export async function loadRewards() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rewards")
    .select("id, title, description, kind, cost, how_to_claim, stock, per_person, active, partner_id, partners(name)")
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

// ============ ADMIN ============
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
