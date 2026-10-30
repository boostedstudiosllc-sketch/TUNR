import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

// Scratch cards (105_taco_tuesday_scratch_cards.sql): spend points on a
// card, scratch it, win points straight into your balance. The server picks
// the prize; the odds are in scratch_cards and shown on every card.

const BUY_ERRORS = {
  not_signed_in: "Sign in to play.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  off: "Scratch cards are closed right now.",
  not_found: "That card isn't available.",
  sold_out: "Sold out today. Back tomorrow.",
  daily_limit: "That's 10 cards today. Come back tomorrow.",
  free_used: "You've used this week's free card. A new one comes Monday.",
};

// { on, balance, played_today, max_per_day, cards, recent }
export async function loadScratchShop() {
  if (!supabase) return { on: false, cards: [], recent: [] };
  const { data, error } = await supabase.rpc("scratch_shop");
  if (error) throw new Error(withReason("Couldn't load the scratch cards.", error));
  return data;
}

// { prize, cost, balance }. free: this week's free card (106_free_scratch_card.sql).
export async function buyScratch(cardId, free = false) {
  if (!supabase) throw new Error("Scratch cards need an internet connection to TUNR.");
  const { data, error } = await supabase.rpc("buy_scratch", { p_card: cardId, p_free: free });
  if (error) throw new Error(withReason("Couldn't buy that card.", error));
  if (data?.status === "ok") return data;
  if (data?.status === "not_enough") throw new Error(`You need ${data.cost} points; you have ${data.balance}.`);
  throw new Error(BUY_ERRORS[data?.status] || `Couldn't buy that card. (${data?.status || "no answer"})`);
}
