// Meets found online (125_found_meets.sql): the admins' review queue, filled
// by the daily meet finder. Screen: FoundMeetsAdmin.jsx.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { geocodeLocation } from "./geocode.js";
import { MAPBOX_TOKEN } from "./mapboxLoader.js";
export { whenLabel } from "./foundMeetRules.js";

export async function loadFoundMeets() {
  const { data, error } = await supabase.from("found_meets").select("*").in("status", ["new", "duplicate"]).order("starts_local").limit(200);
  if (error) throw new Error(withReason("Couldn't load the meets found online.", error));
  return data || [];
}

// Pins the place on the map, then lists it. → the new meet's id.
export async function addFoundMeet(f, vibe) {
  const place = await geocodeLocation(f.location, f.city || "", { token: MAPBOX_TOKEN });
  const { data, error } = await supabase.rpc("admin_add_found_meet", { p_id: f.id, p_lat: place.lat ?? null, p_lng: place.lng ?? null, p_vibe: vibe });
  if (error) throw new Error(withReason(`Couldn't add “${f.title}”.`, error));
  if (data?.status !== "ok") throw new Error(`Couldn't add “${f.title}”. (${data?.status === "not_found" ? "it was already added or dismissed" : data?.status})`);
  return { id: data.event_id, pinned: place.status !== "none" };
}

export async function dismissFoundMeet(id) {
  const { error } = await supabase.rpc("admin_dismiss_found_meet", { p_id: id });
  if (error) throw new Error(withReason("Couldn't dismiss it.", error));
}
