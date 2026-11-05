// The Daily Pit Stop (117_daily_pit_stop.sql): a point a day for opening
// TUNR, a streak, and a bonus every 7th day. Screen: PitStop.jsx.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

export const OPEN_EVENT = "tunr:pit-stop"; // open the Pit Stop card
export const SHOWN_KEY = "tunr.pitstop.shown"; // the Atlanta day it last popped up by itself

export const openPitStop = () => window.dispatchEvent(new CustomEvent(OPEN_EVENT));

// { on, today_done, streak, daily_points, streak_bonus } or null when signed out.
export async function loadPitStop() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("pit_stop_status");
  if (error) throw new Error(withReason("Couldn't load your Daily Pit Stop.", error));
  return data;
}

const ERRORS = {
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  off: "The Daily Pit Stop is switched off right now.",
  not_signed_in: "Sign in to claim your Daily Pit Stop.",
};

// → { points, streak, bonus, balance, already }
export async function claimPitStop() {
  if (!supabase) throw new Error("The Daily Pit Stop needs an account.");
  const { data, error } = await supabase.rpc("claim_pit_stop");
  if (error) throw new Error(withReason("Couldn't claim your Daily Pit Stop.", error));
  if (data?.status === "ok") {
    window.dispatchEvent(new CustomEvent("tunr:points"));
    return { ...data, already: false };
  }
  if (data?.status === "already") return { ...data, already: true };
  throw new Error(ERRORS[data?.status] || `Couldn't claim your Daily Pit Stop. (${data?.status || "no answer"})`);
}

// Today in Atlanta, "2026-11-05", for "once a day".
export const atlToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
