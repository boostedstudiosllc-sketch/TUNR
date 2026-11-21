// TUNR+ (122_membership.sql): what members get and how the status reads.
// No network here, so it's unit-tested (test/membership.test.js).

export function perksList(restoreDays = 30) {
  const every = restoreDays === 30 ? "once a month" : `once every ${restoreDays} days`;
  return [
    { icon: "🏷️", title: "Members-only discounts", text: "Codes for Atlanta detail, tint, wrap and parts shops." },
    { icon: "🔥", title: "Streak restore", text: `Missed a day? Bring your Pit Stop streak back, ${every}.` },
    { icon: "🎨", title: "Profile colors", text: "Color your name and photo ring. No invites needed." },
    { icon: "🚗", title: "Your whole garage", text: "Add every car you own, and start your own club." },
    { icon: "🅿️", title: "Every Park Up level", text: "All levels open, no stars needed." },
  ];
}

export function priceLabel(cents) {
  if (!Number.isFinite(cents) || cents <= 0) return "";
  const n = cents / 100;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// The yearly plan's saving against 12 months, in whole percent (0 if none).
export function yearlySaving(plans = []) {
  const m = plans.find((p) => p.id === "month")?.price_cents;
  const y = plans.find((p) => p.id === "year")?.price_cents;
  if (!m || !y || y >= m * 12) return 0;
  return Math.round((1 - y / (m * 12)) * 100);
}

// "Dec 21", or "Nov 21, 2027" when it's another year (a yearly renewal
// mustn't read like today). Atlanta time, like the rest of TUNR.
export function shortDate(iso, now = Date.now()) {
  const d = new Date(iso);
  const year = (t) => new Date(t).toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" });
  const opts = { month: "short", day: "numeric", timeZone: "America/New_York" };
  if (year(d) !== year(now)) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

// One line about your membership: "Monthly plan · renews Dec 21.", …
export function statusLine(m, now = Date.now()) {
  const day = (iso) => shortDate(iso, now);
  if (!m?.member) return "";
  if (m.all_access && !m.via) return "All access: everything's unlocked.";
  if (m.via === "admin") return m.active_until ? `Free membership until ${day(m.active_until)}.` : "Free membership from TUNR.";
  if (m.cancel_at) return `Cancelled. You keep everything until ${day(m.cancel_at)}.`;
  const plan = m.plan === "year" ? "Yearly" : "Monthly";
  return m.active_until ? `${plan} plan · renews ${day(m.active_until)}.` : `${plan} plan.`;
}

// Messages for /api/membership's error codes.
export const ERRORS = {
  payments_not_set_up: "Card payments aren't switched on yet. Check back soon.",
  billing_page_not_set_up: "The billing page isn't switched on yet. Message TUNR and we'll change it for you.",
  already: "You're already a member. Change your plan from MANAGE BILLING.",
  no_subscription: "There's no card subscription on this account to manage.",
  bad_plan: "That plan isn't available.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_signed_in: "Sign in to join TUNR+.",
  stripe_failed: "The payment page wouldn't open.",
};

// The message for a failed /api/membership reply.
export function errorMessage(status, body = {}) {
  const msg = ERRORS[body.error] || `Couldn't open the payment page. (${body.error || `status ${status}`})`;
  return body.detail && body.error === "stripe_failed" ? `${msg} (${body.detail})` : msg;
}
