import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";

// Taco Tuesday (105_taco_tuesday_scratch_cards.sql): every Tuesday a free
// MORE-or-LESS pick with a discounted "taco line"; a right pick pays points
// to claim in the checklist. Made automatically from the biggest meet coming
// up, unless an admin sets their own (TacoAdmin.jsx).

const PICK_ERRORS = {
  not_signed_in: "Sign in to make your pick.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  no_pick: "There's no pick today. Come back Tuesday.",
  closed: "Today's pick has closed.",
  already: "You've already made your pick.",
};

// 29.5 → "29.5", 30 → "30"
export const lineText = (n) => String(Number(n));

// { today, is_tuesday, next_tuesday, points, pick }
export async function loadTaco() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("taco_today");
  if (error) throw new Error(withReason("Couldn't load Taco Tuesday.", error));
  return data;
}

export async function makeTacoPick(choice) {
  if (!supabase) throw new Error("Taco Tuesday needs an internet connection to TUNR.");
  const { data, error } = await supabase.rpc("taco_pick", { p_choice: choice });
  if (error) throw new Error(withReason("Couldn't save your pick.", error));
  if (data?.status !== "ok") throw new Error(PICK_ERRORS[data?.status] || `Couldn't save your pick. (${data?.status || "no answer"})`);
}

// ---------- admin ----------

export async function loadTacoPicks() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("taco_picks").select("*").order("day", { ascending: false }).limit(8);
  if (error) throw new Error(withReason("Couldn't load the Taco Tuesday picks.", error));
  return data || [];
}

// An admin's own pick for a coming Tuesday (the automatic one is then skipped).
export async function saveTacoPick({ day, question, line, taco_line }) {
  // closes_at is left out: the database closes it at midnight Atlanta time.
  const row = { day, question: question.trim(), stat: "manual", event_id: null, line: Number(line), taco_line: Number(taco_line) };
  const { error } = await supabase.from("taco_picks").upsert(row, { onConflict: "day" });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the pick."));
}

export async function setTacoResult(id, result) {
  const { error } = await supabase.from("taco_picks").update({ result: Number(result) }).eq("id", id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the result."));
}

export async function deleteTacoPick(id) {
  const { error } = await supabase.from("taco_picks").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't delete the pick.", error));
}

// The next Tuesday on or after a YYYY-MM-DD day.
export function nextTuesday(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}
