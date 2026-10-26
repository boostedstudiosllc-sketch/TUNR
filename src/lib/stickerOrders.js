// Mailed "Scan my build" stickers: the price, ordering, and the admin's
// order list. The rules (who can order, paying with points, refunds) live in
// the database (075_sticker_orders.sql); this is the app's side of it.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { redeemMessage } from "./points.js";

const FALLBACK = { open: false, price_cents: 0, points_price: 0, pay_link: null, blurb: "" };

function need() {
  if (!supabase) throw new Error("Ordering a sticker needs an account.");
}

export async function loadStickerSettings() {
  if (!supabase) return FALLBACK;
  const { data, error } = await supabase.from("sticker_settings").select("open, price_cents, points_price, pay_link, blurb").maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the sticker price.", error));
  return data || FALLBACK;
}

export async function saveStickerSettings(patch) {
  need();
  const { error } = await supabase.from("sticker_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the sticker settings."));
}

// What each order result means. Anything new falls through to its code.
const ORDER_COPY = {
  closed: "Sticker orders are paused right now. Print yours at home for free in the meantime.",
  not_your_car: "That car isn't in your garage.",
  page_off: "Turn on your public build page first, so the sticker has something to show.",
  bad_address: "Check the address: name, street, city, a 2-letter state (like GA) and a 5-digit ZIP.",
  too_many_open: "You have 3 orders waiting on payment. Pay for or cancel one first.",
  card_off: "Paying by card isn't set up yet. Use points, or try again later.",
  points_off: "Stickers can't be paid for with points right now.",
  bad_payment: "Pick how you'd like to pay.",
};

export function orderMessage(result) {
  const status = result?.status || "unknown";
  if (ORDER_COPY[status]) return ORDER_COPY[status];
  const msg = redeemMessage(result);
  return msg.startsWith("Couldn't redeem") ? `Couldn't place the order. (${status})` : msg;
}

// address: { name, line1, line2, city, state, zip }; pay: "card" | "points".
// Returns the database's answer: { status: "ok", id, pay_link?, balance? } or why not.
export async function orderSticker(vehicleId, pay, address) {
  need();
  const { data, error } = await supabase.rpc("order_sticker", {
    p_vehicle: vehicleId,
    p_pay: pay,
    p_name: address.name,
    p_line1: address.line1,
    p_line2: address.line2 || null,
    p_city: address.city,
    p_state: address.state,
    p_zip: address.zip,
  });
  if (error) throw new Error(withReason("Couldn't place the order.", error));
  return data || {};
}

// The card payment page for an order, tagged with the order so the admin can
// match the payment (Stripe shows it as the client reference).
export function payLinkFor(link, orderId, email) {
  try {
    const u = new URL(link);
    u.searchParams.set("client_reference_id", orderId);
    if (email) u.searchParams.set("prefilled_email", email);
    return u.toString();
  } catch (e) {
    return link;
  }
}

export async function loadMyStickerOrders(vehicleId) {
  need();
  const { data, error } = await supabase
    .from("sticker_orders")
    .select("id, status, paid_with, price_cents, points, tracking, created_at, sent_at")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load your sticker orders.", error));
  return data || [];
}

export async function cancelMyStickerOrder(id) {
  need();
  const { error } = await supabase.rpc("cancel_my_sticker_order", { p_id: id });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't cancel that order."));
}

// Admin: every order, newest first (open ones first).
export async function loadStickerOrders() {
  need();
  const { data, error } = await supabase.from("sticker_orders").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(withReason("Couldn't load sticker orders.", error));
  const rank = { paid: 0, awaiting_payment: 1, sent: 2, cancelled: 3 };
  return (data || []).sort((a, b) => rank[a.status] - rank[b.status]);
}

export async function setStickerOrder(id, status, tracking) {
  need();
  const { error } = await supabase.rpc("admin_sticker_order", { p_id: id, p_status: status, p_tracking: tracking || null });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't update that order."));
}

export const ORDER_STATUS = {
  awaiting_payment: { label: "Waiting on payment", color: "#FACC15" },
  paid: { label: "Paid · being made", color: "#3CABFD" },
  sent: { label: "Shipped", color: "#10B981" },
  cancelled: { label: "Cancelled", color: "#888" },
};
