// Meet awards (127_meet_awards.sql): loading, entering, voting, and the
// host's setup. Words: awardRules.js. Screen: MeetAwards.jsx.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { errorFor } from "./awardRules.js";

export async function loadAwards(eventId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("meet_awards_view", { p_event: eventId });
  if (error) throw new Error(withReason("Couldn't load the awards.", error));
  // Voting closed and winners not told yet: tell them now (it only happens once).
  if (data?.phase === "closed") supabase.rpc("finish_meet_awards", { p_event: eventId }).then(() => {}, () => {});
  return data;
}

export async function loadPresets() {
  const { data, error } = await supabase.from("award_presets").select("*").order("sort");
  if (error) throw new Error(withReason("Couldn't load the award list.", error));
  return data || [];
}

async function call(fn, args, what) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(withReason(what, error));
  if (data?.status !== "ok") throw new Error(errorFor(data?.status, data));
  return data;
}

export const enterAwards = (eventId, pos, vehicleId) =>
  call("enter_meet_awards", { p_event: eventId, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_vehicle: vehicleId || null }, "Couldn't check you in for the awards.");

export const voteAward = (awardId, vehicleId) => call("vote_meet_award", { p_award: awardId, p_vehicle: vehicleId }, "Couldn't save your vote.");

export const closeAwards = (eventId) => call("close_meet_awards", { p_event: eventId }, "Couldn't close voting.");

// Hosts: the meet's award list. picked: [{ name, emoji, preset }] in order.
export async function saveAwards(eventId, current, picked) {
  const key = (n) => n.trim().toLowerCase();
  const keep = new Set(picked.map((p) => key(p.name)));
  const gone = current.filter((a) => !keep.has(key(a.name)));
  if (gone.length) {
    const { error } = await supabase.from("meet_awards").delete().in("id", gone.map((a) => a.id));
    if (error) throw new Error(friendlyWriteError(error, "Couldn't remove an award."));
  }
  const have = new Set(current.map((a) => key(a.name)));
  const add = picked.map((p, i) => ({ ...p, sort: i })).filter((p) => !have.has(key(p.name)));
  if (add.length) {
    const { error } = await supabase.from("meet_awards").insert(add.map((p) => ({ event_id: eventId, name: p.name.trim(), emoji: p.emoji || "🏆", preset: p.preset || null, sort: p.sort })));
    if (error) throw new Error(friendlyWriteError(error, "Couldn't add the awards."));
  }
}

// The meet's awards as rows (for the setup screen).
export async function loadMeetAwardRows(eventId) {
  const { data, error } = await supabase.from("meet_awards").select("*").eq("event_id", eventId).order("sort");
  if (error) throw new Error(withReason("Couldn't load this meet's awards.", error));
  return data || [];
}
