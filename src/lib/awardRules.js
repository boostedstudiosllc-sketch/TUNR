// Meet awards (127_meet_awards.sql): words and sums for the awards screen.
// No network here, so it's unit-tested (test/awards.test.js).

const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const time = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

// The line under the AWARDS heading.
export function phaseLine(view) {
  if (!view || view.phase === "none") return "";
  if (view.phase === "soon") return `Fan voting opens ${time(view.opens_at)}, once you're at the meet.`;
  if (view.phase === "open") return `Voting is open until ${clock(view.closes_at)}. Pick the car that deserves each award.`;
  return "Voting's closed. Here are the winners.";
}

// Each award's cars in order, most votes first (when counts are shown).
export function standings(award, cars) {
  const tally = award?.tally || {};
  const rows = cars.map((c) => ({ ...c, votes: tally[c.vehicle_id] || 0, won: (award?.winners || []).includes(c.vehicle_id) }));
  return award?.tally ? rows.sort((a, b) => b.votes - a.votes) : rows;
}

export function winnersOf(award, cars) {
  return (award?.winners || []).map((id) => cars.find((c) => c.vehicle_id === id)).filter(Boolean);
}

export const carLabel = (c) => (c?.nickname ? `${c.nickname} · ${c.car}` : c?.car || "A car");

export const ERRORS = {
  not_signed_in: "Sign in to vote.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_found: "This meet's awards aren't open to you.",
  not_open: "Voting isn't open right now.",
  not_your_car: "Pick one of your own cars.",
  too_far: "You need to be at the meet to vote. Get closer and try again.",
  need_location: "Share your location so TUNR can see you're at the meet.",
  closed: "Voting has closed.",
  not_here: "Tap I'M HERE first.",
  not_entered: "That car isn't in the running.",
  own_car: "You can't vote for your own car.",
  too_many_awards: "Up to 15 awards a meet.",
  awards_closed: "Voting has closed, so awards can't be added.",
};

export function errorFor(status, extra = {}) {
  if (status === "too_far" && extra.distance_m) {
    const mi = extra.distance_m / 1609.34;
    return `You're ${mi >= 0.5 ? `${mi.toFixed(1)} miles` : `${Math.round(extra.distance_m)} m`} away. You need to be at the meet to vote.`;
  }
  return ERRORS[status] || `Couldn't do that. (${status})`;
}
