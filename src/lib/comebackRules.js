// Comeback nudges: the wording and checks, with no network (so they're
// unit-tested in test/comeback.test.js). The calls live in comeback.js.

const CLAIM_ERRORS = {
  not_found: "That bonus isn't yours or isn't there any more.",
  already: "You already claimed that bonus.",
  expired: "That bonus ended. Keep an eye out for the next one.",
};
export const claimError = (status) => CLAIM_ERRORS[status] || `Couldn't claim it. (${String(status || "no answer").replace(/_/g, " ")})`;

export function clampPoints(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

// "Claim by Sat 4:12 PM"
export const claimBy = (iso) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
