import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

// Photo of the week: vote for your favourite meet photo posted this week;
// last week's top photo wins points. See migration 096.

const VOTE_ERRORS = {
  not_signed_in: "Sign in to vote.",
  unconfirmed: "Confirm your email to vote.",
  not_this_week: "That photo isn't in this week's vote anymore.",
  own_photo: "You can't vote for your own photo.",
};

// Last week's winner, or null before the first one.
export async function loadPhotoOfWeek() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("photo_of_the_week");
  if (error) throw new Error(withReason("Couldn't load Photo of the week.", error));
  return data || null;
}

// { week, ends_at, my_vote, photos: [{ id, photo_url, username, event_title, votes, mine }] }
export async function loadPhotoBallot() {
  if (!supabase) return { photos: [] };
  const { data, error } = await supabase.rpc("photo_week_ballot");
  if (error) throw new Error(withReason("Couldn't load this week's photos.", error));
  return data || { photos: [] };
}

export async function votePhoto(photoId) {
  if (!supabase) throw new Error("Voting needs an account.");
  const { data, error } = await supabase.rpc("vote_photo", { p_photo: photoId });
  if (error) throw new Error(withReason("Couldn't save your vote.", error));
  if (data?.status !== "ok") throw new Error(VOTE_ERRORS[data?.status] || `Couldn't save your vote. (${data?.status || "no answer"})`);
}
