// "Scan my build": a car's public page and the QR sticker that opens it
// (058_referrals_and_car_scans.sql). Pages are off until the owner turns
// them on.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { INVITE_PARAM } from "./invites.js";

export const CAR_PARAM = "car";

// What the sticker's QR holds: the car, plus the owner's invite code so a
// scanner who signs up counts as the owner's referral.
export const buildPageUrl = (vehicleId, inviteCode) =>
  `${window.location.origin}/?${CAR_PARAM}=${vehicleId}${inviteCode ? `&${INVITE_PARAM}=${inviteCode}` : ""}`;

export async function loadBuildPage(vehicleId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_build_page", { p_vehicle: vehicleId });
  if (error) throw new Error(withReason("Couldn't load that build.", error));
  return data || null;
}

// Once per car per browser session; the database also skips repeats.
export async function recordCarScan(vehicleId) {
  if (!supabase) return;
  const key = `tunr.scanned.${vehicleId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Private mode: let the database's 30-minute rule handle repeats.
  }
  const { error } = await supabase.rpc("record_car_scan", { p_vehicle: vehicleId });
  if (error) console.warn(withReason("Couldn't count that scan.", error));
}

export async function loadScanStats(vehicleId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("car_scan_stats", { p_vehicle: vehicleId });
  if (error) throw new Error(withReason("Couldn't load scan counts.", error));
  return data || { month: 0, total: 0, joined: 0 };
}

export async function setBuildPagePublic(vehicleId, on) {
  if (!supabase) return;
  const { error } = await supabase.from("vehicles").update({ public_page: on }).eq("id", vehicleId);
  if (error) throw new Error(friendlyWriteError(error, on ? "Couldn't turn on the build page." : "Couldn't turn off the build page."));
}
