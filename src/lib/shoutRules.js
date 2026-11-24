// "Who's down?" shouts (134_meet_tools.sql): the wording and the hand-off to
// a real linkup. No network here, so it's unit-tested (test/shouts.test.js).

export const SHOUT_WHEN = [
  ["now", "NOW"],
  ["tonight", "TONIGHT"],
  ["tomorrow", "TOMORROW"],
];

export const SHOUT_ERRORS = {
  not_signed_in: "Sign in to ask who's down.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  bad_request: "Pick what you want to do and share where you are.",
  already_live: "You already have a shout out. Cancel it or make it a linkup first.",
  rate_limit: "That's 3 shouts today, the limit. Try again tomorrow.",
  not_found: "That shout is over or was cancelled.",
  own_shout: "That's your own shout.",
  not_your_linkup: "That linkup isn't yours.",
};

export const shoutError = (status) => SHOUT_ERRORS[status] || `Couldn't do that. (${status || "no answer"})`;

const WHEN_WORDS = { now: "right now", tonight: "tonight", tomorrow: "tomorrow" };

// "Cruise tonight · Midtown · 3.2 mi"
export function shoutHeadline(s, kindLabel) {
  return `${kindLabel} ${WHEN_WORDS[s.when] || s.when}`;
}

export function shoutMeta(s) {
  return [s.mine ? "You" : s.username ? `@${s.username}` : "", s.area, s.miles != null && !s.mine ? `${Number(s.miles) < 1 ? "<1" : Math.round(Number(s.miles))} mi` : ""].filter(Boolean).join(" · ");
}

// "2 down: @a, @b" for the poster; "2 down" for everyone else.
export function downLine(s) {
  const n = Number(s.downs) || 0;
  if (!n) return s.mine ? "Nobody yet. People nearby with linkup alerts were told." : "Be the first.";
  const names = Array.isArray(s.down_names) && s.down_names.length ? `: ${s.down_names.map((u) => `@${u}`).join(", ")}` : "";
  return `${n} down${names}`;
}

// The poster taps MAKE IT A LINKUP: LinkupForm starts with the same kind,
// day, area and note. The spot is picked fresh (the shout's pin is rounded).
export function linkupFromShout(s) {
  return {
    kind: s.kind,
    when: s.when === "tonight" ? "today" : s.when,
    area: s.area || "",
    note: s.note || "",
  };
}
