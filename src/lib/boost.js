// Boost Day (132_meet_boost.sql): today's boost, opting in, the two-step
// check-in, and the admin's week. Words: boostRules.js. Screens:
// BoostSheet.jsx, BoostCard (MeetDetail), BoostAdmin.jsx.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { errorFor } from "./boostRules.js";
import { currentPosition } from "./alerts.js";

export async function loadBoost() {
  if (!supabase) return { active: false };
  const { data, error } = await supabase.rpc("boost_status");
  if (error) throw new Error(withReason("Couldn't load Boost Day.", error));
  return data || { active: false };
}

async function call(fn, args, what) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(withReason(what, error));
  if (data?.status !== "ok") throw new Error(errorFor(data?.status, data));
  return data;
}

// Ask the server to send any alerts that are due (the "tap to finish" one).
const nudgePush = () => fetch("/api/push", { method: "POST" }).catch(() => {});

export const optInBoost = () => call("boost_opt_in", {}, "Couldn't opt you in.");

export async function boostCheckIn(eventId) {
  const pos = await currentPosition();
  return call("boost_check_in", { p_event: eventId, p_lat: pos.lat, p_lng: pos.lng }, "Couldn't check you in for the boost.");
}

export async function boostConfirm() {
  const pos = await currentPosition();
  const r = await call("boost_confirm", { p_lat: pos.lat, p_lng: pos.lng }, "Couldn't confirm your boost.");
  nudgePush();
  return r;
}

// While the app is open: remind at the end of the wait (a phone notification
// if allowed, and the server's alert gets sent too).
export function remindAt(iso, onDue) {
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0) || ms > 3 * 3600e3) return () => {};
  const t = setTimeout(async () => {
    onDue?.();
    nudgePush();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("🔥 Tap to finish your Boost check-in", { body: "Confirm you're still at the meet to get your bonus.", tag: "boost-confirm", data: { link: "open:boost" } });
      }
    } catch (e) {
      console.warn("boost reminder", e?.message);
    }
  }, ms + 1000);
  return () => clearTimeout(t);
}

// ---------- admin ----------

export async function loadBoostWeek(monday) {
  const { data, error } = await supabase.rpc("admin_boost_week", { p_monday: monday });
  if (error) throw new Error(withReason("Couldn't load Boost Day for that week.", error));
  return data;
}

export async function setBoostDay(monday, day) {
  const { data, error } = await supabase.rpc("admin_set_boost_day", { p_monday: monday, p_day: day });
  if (error) throw new Error(withReason("Couldn't change Boost Day.", error));
  if (data?.status !== "ok") throw new Error(data?.status === "past" ? "That day has already passed." : `Couldn't change Boost Day. (${data?.status})`);
}

export async function saveBoostSettings({ points, minutes }) {
  const p = Math.round(Number(points));
  const m = Math.round(Number(minutes));
  if (!(p >= 0 && p <= 100)) throw new Error("Bonus points: 0 to 100 (0 turns Boost Day off).");
  if (!(m >= 5 && m <= 120)) throw new Error("Stay time: 5 to 120 minutes.");
  const { error } = await supabase.from("points_settings").update({ boost_points: p, boost_stay_minutes: m }).eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the Boost Day settings."));
}

export async function loadBoostSettings() {
  const { data, error } = await supabase.from("points_settings").select("boost_points, boost_stay_minutes").maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the Boost Day settings.", error));
  return data || { boost_points: 10, boost_stay_minutes: 20 };
}
