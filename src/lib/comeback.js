// Comeback nudges (136_comeback_and_parts.sql): opening the app ends an
// absence and hands back a welcome-back points offer to claim.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { claimError, clampPoints } from "./comebackRules.js";

export { claimBy } from "./comebackRules.js";

// → { id, points, expires_at } or null
export async function markSeen() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("mark_seen");
  if (error) throw new Error(withReason("Couldn't check for your welcome-back bonus.", error));
  return data?.offer || null;
}

export async function claimComeback(id) {
  const { data, error } = await supabase.rpc("claim_comeback", { p_offer: id });
  if (error) throw new Error(withReason("Couldn't claim your bonus.", error));
  if (data?.status !== "ok") throw new Error(claimError(data?.status));
  return data.earned;
}

// Admins.
export async function loadComebackAdmin() {
  const [stats, settings] = await Promise.all([
    supabase.rpc("admin_comeback_stats"),
    supabase.from("points_settings").select("comeback_on, comeback_points_7, comeback_points_14, comeback_points_30").maybeSingle(),
  ]);
  if (stats.error) throw new Error(withReason("Couldn't load the comeback numbers.", stats.error));
  if (settings.error) throw new Error(withReason("Couldn't load the comeback settings.", settings.error));
  return { stats: stats.data || {}, settings: settings.data || {} };
}

export async function saveComebackSettings(s) {
  const row = {
    comeback_on: Boolean(s.comeback_on),
    comeback_points_7: clampPoints(s.comeback_points_7),
    comeback_points_14: clampPoints(s.comeback_points_14),
    comeback_points_30: clampPoints(s.comeback_points_30),
  };
  const { data, error } = await supabase.from("points_settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", true).select("comeback_on");
  if (error) throw new Error(withReason("Couldn't save the comeback settings.", error));
  if (!data?.length) throw new Error("Couldn't save the comeback settings. (only admins can change them)");
}
