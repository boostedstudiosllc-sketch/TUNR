// Convoys: drive together and see each other live (115_convoys.sql). The rules
// (who sees whose position, the limits) live in the database; this is the
// app's side. Maths in convoyMath.js; the screen is Convoy.jsx.

import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { kickPush } from "./alerts.js";
import { cleanConvoyCode } from "./convoyMath.js";

const ERRORS = {
  not_signed_in: "Sign in to drive in a convoy.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_found: "No convoy with that code is running. Check the code, or it may have ended.",
  blocked: "You can't join this convoy.",
  full: "That convoy is full (30 cars).",
  not_in_linkup: "This convoy is for the people in the linkup. Join the linkup first.",
  linkup_over: "That linkup has ended or was cancelled.",
  rate_limit: "That's a lot of convoys today. Try again tomorrow.",
  not_in_convoy: "You're not in this convoy any more.",
  bad_position: "Your phone sent a location that doesn't look right.",
  self: "That's you.",
  already: "Already invited.",
  already_in: "They're already in the convoy.",
};
const say = (what, status) => ERRORS[status] || `${what} (${status || "no answer"})`;

// Which convoy this phone was last in, to reopen it.
export const CONVOY_KEY = "tunr.convoy";
export const OPEN_EVENT = "tunr:convoy"; // detail: { id }

export function openConvoy(id) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }));
}

function need() {
  if (!supabase) throw new Error("Convoys need an internet connection to TUNR.");
}

async function call(fn, args, what) {
  need();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(withReason(what, error));
  return data;
}

// → { id, code }
export async function startConvoy(name = null, linkupId = null) {
  const r = await call("start_convoy", { p_name: name?.trim() || null, p_linkup: linkupId }, "Couldn't start the convoy.");
  if (r?.status !== "ok") throw new Error(say("Couldn't start the convoy.", r?.status));
  return { id: r.id, code: r.code };
}

export async function joinConvoy(code) {
  const clean = cleanConvoyCode(code);
  if (clean.length !== 6) throw new Error("A convoy code is 6 letters and numbers.");
  const r = await call("join_convoy", { p_code: clean }, "Couldn't join the convoy.");
  if (r?.status !== "ok") throw new Error(say("Couldn't join the convoy.", r?.status));
  return { id: r.id, code: r.code };
}

// The convoy, its members and their positions; null once it's over or you've left.
export const loadConvoy = (id) => call("convoy_state", { p_convoy: id }, "Couldn't load the convoy.");

// Convoys you're in that are still running: [{ id, code, name }].
export async function myConvoys() {
  need();
  const { data, error } = await supabase.from("convoys").select("id, code, name, ends_at").is("ended_at", null).gt("ends_at", new Date().toISOString()).order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load your convoys.", error));
  return data || [];
}

export async function sharePosition(id, p) {
  const r = await call(
    "share_position",
    { p_convoy: id, p_lat: p.lat, p_lng: p.lng, p_heading: p.heading, p_speed_mph: p.speedMph, p_accuracy_m: p.accuracyM },
    "Couldn't share your location."
  );
  if (r?.status === "too_soon") return false;
  if (r?.status !== "ok") throw new Error(say("Couldn't share your location.", r?.status));
  return true;
}

export const stopSharing = (id) => call("stop_sharing", { p_convoy: id }, "Couldn't stop sharing your location.");
export const leaveConvoy = (id) => call("leave_convoy", { p_convoy: id }, "Couldn't leave the convoy.");
export const endConvoy = (id) => call("end_convoy", { p_convoy: id }, "Couldn't end the convoy.");

export async function inviteToConvoy(userId, id) {
  const r = await call("invite_to_convoy", { p_to: userId, p_convoy: id }, "Couldn't send the invite.");
  if (r?.status !== "ok") throw new Error(say("Couldn't send the invite.", r?.status));
  kickPush();
}

// Live changes to the convoy (someone moved, joined or left). Calls onChange
// (the screen reloads convoy_state); returns a function that stops watching.
export function watchConvoy(id, onChange) {
  if (!supabase) return () => {};
  const ch = supabase
    .channel(`convoy-${id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "convoy_positions", filter: `convoy_id=eq.${id}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "convoy_members", filter: `convoy_id=eq.${id}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export const convoyLink = (code) => `${location.origin}/?convoy=${code}`;
