// Passcode handling for private meets.
//
// Pure so it can be unit tested in plain Node — store.js reaches Vite's
// import.meta.env through supabase.js, which isn't available outside a build.

// The generator (see 008_private_meets.sql) leaves out 0/O and 1/I/L, so a
// code read off a phone screen types in cleanly. Accept the ambiguous
// characters anyway and fold them onto what the generator would have used,
// since that's what people will type.
const CONFUSABLES = { "0": "O", "1": "I", "L": "I", "O": "O", "I": "I" };

export const PASSCODE_LENGTH = 6;

// Uppercases, drops spaces/dashes people add while reading a code aloud, and
// trims to length so a pasted "abc-123 " still matches.
export function normalizePasscode(input) {
  const cleaned = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned
    .split("")
    .map((ch) => CONFUSABLES[ch] || ch)
    .join("")
    .slice(0, PASSCODE_LENGTH);
}

export function isCompletePasscode(input) {
  return normalizePasscode(input).length === PASSCODE_LENGTH;
}

// Statuses returned by the redeem_event_passcode RPC.
const REDEEM_COPY = {
  ok: null,
  invalid: "That code doesn't match. Check it with the host.",
  not_found: "That meet no longer exists.",
  not_signed_in: "Sign in first, then enter the code.",
  passcode_disabled: "This meet is request-only — ask the host to approve you.",
  rate_limited: "Too many code attempts. Try again in an hour.",
};

// Returns null when the redemption succeeded, otherwise the message to show.
export function redeemMessage(status) {
  if (status === "ok") return null;
  return REDEEM_COPY[status] || "Couldn't join that meet. Try again.";
}
