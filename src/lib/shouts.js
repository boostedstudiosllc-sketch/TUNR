// "Who's down?" shouts: the network side (rules in 134_meet_tools.sql,
// wording in shoutRules.js).
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { kickPush } from "./alerts.js";
import { cleanOrNull } from "./clean.js";
import { shoutError } from "./shoutRules.js";

function need() {
  if (!supabase) throw new Error("Sign in to use Who's down.");
}

async function call(fn, args, what) {
  need();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(withReason(what, error));
  return data;
}

export async function loadShouts(position) {
  if (!supabase) return [];
  const data = await call("shouts_near", { p_lat: position?.lat ?? null, p_lng: position?.lng ?? null, p_miles: 50 }, "Couldn't load who's down.");
  return Array.isArray(data) ? data : [];
}

export async function postShout({ kind, when, area, lat, lng, note }) {
  const data = await call("post_shout", { p_kind: kind, p_when: when, p_area: cleanOrNull(area), p_lat: lat, p_lng: lng, p_note: cleanOrNull(note) }, "Couldn't send your shout.");
  if (data?.status !== "ok") throw new Error(shoutError(data?.status));
  kickPush();
  return data;
}

export async function shoutDown(id, down = true) {
  const data = await call("shout_down", { p_shout: id, p_down: down }, "Couldn't save that.");
  if (data?.status !== "ok") throw new Error(shoutError(data?.status));
  kickPush();
}

export async function shoutToLinkup(id, linkupId) {
  const data = await call("shout_to_linkup", { p_shout: id, p_linkup: linkupId }, "Couldn't tell everyone it's on.");
  if (data?.status !== "ok") throw new Error(shoutError(data?.status));
  kickPush();
}

export async function cancelShout(id) {
  await call("cancel_shout", { p_shout: id }, "Couldn't cancel your shout.");
}
