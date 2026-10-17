// Confirm-later email, the app's half (041_email_confirmation.sql,
// api/confirm-email.js).
import { createContext, useContext } from "react";
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

// { confirmed, deleteOn, welcomeSentAt } for the signed-in account, or null
// while unknown / signed out. Components that gate chat read it from here.
export const AccountContext = createContext(null);
export const useAccount = () => useContext(AccountContext);

// Asks the database to confirm this account if this session came from an
// emailed link (or Google), and says where things stand.
export async function confirmMyEmail() {
  if (!supabase) return { confirmed: true };
  const { data, error } = await supabase.rpc("confirm_my_email");
  if (error) throw new Error(withReason("Couldn't check whether your email is confirmed.", error));
  return {
    confirmed: Boolean(data?.confirmed),
    deleteOn: data?.delete_on || null,
    welcomeSentAt: data?.welcome_sent_at || null,
  };
}

const SEND_ERRORS = {
  confirm_email_wait: "We just sent one — check your inbox and spam folder. You can ask again in 10 minutes.",
  not_signed_in: "Sign in again, then tap Resend.",
  push_not_configured: "The confirmation email isn't set up on the server yet",
  email_send_failed: "The confirmation email didn't send",
};

// Email the confirm link. Returns { sent, email, deleteOn } or { confirmed }.
export async function requestConfirmationEmail() {
  if (!supabase) throw new Error("Accounts aren't set up.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(SEND_ERRORS.not_signed_in);
  let res;
  try {
    res = await fetch("/api/confirm-email", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new Error(withReason("Couldn't reach TUNR to send the email.", e));
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const what = SEND_ERRORS[body.error] || `The confirmation email didn't send (${body.error || `HTTP ${res.status}`})`;
    if (body.error === "confirm_email_wait") throw new Error(what);
    throw new Error(body.detail ? `${what}: ${body.detail}.` : `${what}.`);
  }
  return body;
}

// "2026-10-24" → "Sat, Oct 24"
export function shortDate(key) {
  if (!key) return "";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

export const CLEANUP_WHY =
  "Why we do this: an email address that's never confirmed may have been typed wrong or used by someone it doesn't belong to. Removing those accounts after 7 days keeps TUNR's members real, protects people whose address was used without their permission, and means we don't hold personal information we can't link to its owner. Once your email is confirmed, your account stays for as long as you want it.";

// Admins: accounts removed for never confirming, and how many are pending.
export async function loadCleanupStats() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("account_cleanup_stats");
  if (error) throw new Error(withReason("Couldn't load account cleanup numbers.", error));
  return Array.isArray(data) ? data[0] || null : data;
}
