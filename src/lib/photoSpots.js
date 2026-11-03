// Photo spots: places to shoot cars (116_photo_spots.sql). Each spot is a
// forum post tagged 'spot' in GA Photo Spots; this loads the discover list
// and saves spots. Sorting and words: spotRules.js. Screen: PhotoSpots.jsx.

import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";

export const SPOTS_FORUM = "ga-photo-spots";
export const OPEN_EVENT = "tunr:photo-spots"; // open the discover screen

export const openPhotoSpots = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));

export async function loadSpots() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("photo_spots").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(withReason("Couldn't load the photo spots.", error));
  return data || [];
}

// The GA Photo Spots forum, to post a new spot in: { id, name, slug } or null.
export async function spotsForum() {
  if (!supabase) return null;
  const { data, error } = await supabase.from("forums").select("id, name, slug").eq("slug", SPOTS_FORUM).maybeSingle();
  if (error) throw new Error(withReason("Couldn't find the photo spots forum.", error));
  return data;
}

export async function setSpotSaved(postId, saved) {
  if (!supabase) throw new Error("Saving spots needs an account.");
  const q = saved ? supabase.from("photo_spot_saves").insert({ post_id: postId }) : supabase.from("photo_spot_saves").delete().eq("post_id", postId);
  const { error } = await q;
  if (error && error.code !== "23505") throw new Error(friendlyWriteError(error, saved ? "Couldn't save that spot." : "Couldn't unsave that spot."));
}
