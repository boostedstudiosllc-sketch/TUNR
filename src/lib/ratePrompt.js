// When to ask "Enjoying TUNR?", kept on this phone. Never pushy: after a
// few visits over a few days, at most every 60 days, not again for 180 days
// after a rating, and never after three "not now"s.

const KEY = "tunr.rate";
const DAY = 864e5;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch (e) {
    console.warn("Couldn't read the rating reminder:", e.message);
    return {};
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("Couldn't save the rating reminder:", e.message);
  }
}

// Count a visit (once per app load). Returns whether to ask this time.
export function noteVisitAndShouldAsk(now = Date.now(), roll = Math.random()) {
  const s = read();
  s.first = s.first || now;
  s.visits = (s.visits || 0) + 1;
  write(s);
  if (s.visits < 5 || now - s.first < 3 * DAY) return false;
  if ((s.notNow || 0) >= 3) return false;
  if (s.rated && now - s.rated < 180 * DAY) return false;
  if (s.asked && now - s.asked < 60 * DAY) return false;
  // Now and then, not the moment someone's eligible.
  return roll < 0.35;
}

export function markAsked(how) {
  const s = read();
  s.asked = Date.now();
  if (how === "not_now") s.notNow = (s.notNow || 0) + 1;
  if (how === "rated") s.rated = Date.now();
  write(s);
}
