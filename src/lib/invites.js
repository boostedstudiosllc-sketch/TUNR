// Invite friends, unlock features. Who counts and what unlocks is decided in
// the database (049_invites.sql); this is the app's side of it.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

export const INVITE_PARAM = "invite";
const PENDING_INVITE_KEY = "tunr.pendingInvite";

export const UNLOCKS = [
  { need: 1, key: "cars", icon: "🚗", title: "More cars in your garage", sub: "Your first car is free; add the rest." },
  { need: 1, key: "clubs", icon: "🏁", title: "Start your own club", sub: "Joining clubs is always free." },
  { need: 5, key: "flair", icon: "🎨", title: "Profile flair", sub: "Pick your profile color and get the 🔗 Connector badge." },
];

export const FLAIR_COLORS = ["#FF4500", "#FACC15", "#10B981", "#38BDF8", "#A855F7", "#EC4899", "#EF4444", "#F0F0F0"];

export const inviteLink = (code) => `${window.location.origin}/?${INVITE_PARAM}=${code}`;

// Someone opened a friend's link: keep the code until they've signed up.
export function rememberPendingInvite(code) {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
  } catch (e) {
    console.warn(`Couldn't remember the invite: ${e.message}`);
  }
}

export function takePendingInvite() {
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_KEY) || "";
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    return code;
  } catch (e) {
    console.warn(`Couldn't read the invite: ${e.message}`);
    return "";
  }
}

export async function claimInvite(code) {
  if (!supabase || !code) return null;
  const { data, error } = await supabase.rpc("claim_invite", { p_code: code });
  if (error) throw new Error(withReason("Couldn't link your friend's invite.", error));
  return data || {};
}

export async function loadMyInvites() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_invites");
  if (error) throw new Error(withReason("Couldn't load your invites.", error));
  return data || null;
}

// Opens the invite screen from anywhere (a locked feature, the profile…).
export function openInvites(reason = "") {
  window.dispatchEvent(new CustomEvent("tunr:invites", { detail: { reason } }));
}

export async function shareInvite(code) {
  const url = inviteLink(code);
  const text = "Join me on TUNR, the app for Georgia car meets 🏁";
  if (navigator.share) {
    try {
      await navigator.share({ title: "TUNR", text, url });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
      // Fall through to copying.
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return "copied";
}
