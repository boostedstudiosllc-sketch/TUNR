// "Enjoying TUNR?" ratings (090_app_ratings.sql). When to ask is in
// ratePrompt.js. Everyone who rates is offered the public Google review
// too, whatever their stars: Google doesn't allow asking only happy people.

import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { deviceLabel } from "./activity.js";
import { cleanOrNull } from "./clean.js";

// Set VITE_GOOGLE_REVIEW_URL in Vercel once the Google Business Profile is
// live (its "Ask for reviews" link). Without it, only the in-app rating shows.
export const GOOGLE_REVIEW_URL = import.meta.env?.VITE_GOOGLE_REVIEW_URL || "";

export async function sendRating(stars, comment) {
  if (!supabase) throw new Error("Rating needs an account.");
  const { error } = await supabase.from("app_ratings").insert({ stars, comment: cleanOrNull(comment), device: deviceLabel() });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send your rating."));
}

// Admin: { count, average, count_30d, average_30d, stars: { 1..5 } }.
export async function loadRatingSummary() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("app_rating_summary");
  if (error) throw new Error(withReason("Couldn't load the app ratings.", error));
  return data;
}
