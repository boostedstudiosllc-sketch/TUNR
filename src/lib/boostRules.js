// Boost Day (132_meet_boost.sql): what the screens say. No network here, so
// it's unit-tested (test/boost.test.js).

export const ERRORS = {
  not_signed_in: "Sign in to join Boost Day.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_today: "Boost Day isn't today.",
  not_opted_in: "Opt in to Boost Day first.",
  already_paid: "You already got today's boost.",
  not_today_meet: "That meet isn't on today.",
  own_meet: "Hosts can't earn the boost at their own meet.",
  no_rsvp: "You needed to RSVP Going before this meet started.",
  meet_over: "This meet is over.",
  need_location: "Share your location so TUNR can see you're at the meet.",
  not_checked_in: "Check in at the meet first.",
};

export function errorFor(status, extra = {}) {
  if (status === "too_far" && extra.distance_m) {
    const mi = extra.distance_m / 1609.34;
    return `You're ${mi >= 0.5 ? `${mi.toFixed(1)} miles` : `${Math.round(extra.distance_m)} m`} from the meet. Get closer and try again.`;
  }
  if (status === "too_early" && extra.starts_at) return `Check-in opens 15 minutes before the meet starts (${clock(extra.starts_at)}).`;
  if (status === "too_soon" && extra.confirm_at) return `Stay a bit longer: you can confirm at ${clock(extra.confirm_at)}.`;
  return ERRORS[status] || `Couldn't do that. (${status})`;
}

export const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

// "12:34" left until a time (or "0:00").
export function countdown(iso, now = Date.now()) {
  const ms = Math.max(0, Date.parse(iso) - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Where you are with today's boost. → { step, text }
// step: "off" | "opt_in" | "rsvp" | "check_in" | "wait" | "confirm" | "done"
export function boostStep(status, now = Date.now()) {
  if (!status?.active) return { step: "off", text: "" };
  if (status.confirmed_at) return { step: "done", text: `🔥 Boost hit: +${status.earned ?? status.points} points today.` };
  if (!status.opted_in) return { step: "opt_in", text: `It's Boost Day: opt in, RSVP to any meet today before it starts, and show up for +${status.points} bonus points.` };
  if (status.checked_in_at) {
    if (Date.parse(status.confirm_at) > now) return { step: "wait", text: `Checked in at ${status.event_title || "the meet"}. Stay ${status.stay_minutes} minutes, then confirm you're still there.` };
    return { step: "confirm", text: `Time's up: confirm you're still at ${status.event_title || "the meet"} to get +${status.points}.` };
  }
  return { step: "check_in", text: `You're in. RSVP Going to a meet today before it starts, then check in when you get there.` };
}

// The Monday of the week a date is in (YYYY-MM-DD, local calendar date).
export function mondayOf(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const weekdayName = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
