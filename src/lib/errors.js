// Maps database errors from writes into user-facing copy.
//
// Kept separate from store.js so it can be unit tested in plain Node —
// store.js reaches Vite's import.meta.env through supabase.js, which isn't
// available outside a Vite build.

const WRITE_ERROR_COPY = {
  rate_limit_comments:
    "You're commenting quickly — give it a few minutes and try again.",
  duplicate_comment: "You already posted that comment.",
  rate_limit_events_hourly:
    "You've posted several meets in the last hour. Try again a bit later.",
  rate_limit_events_daily:
    "You've hit the daily limit for posting meets. Try again tomorrow.",
};

// `fallback` is what the caller would have said anyway, so unrelated failures
// keep their existing wording.
export function friendlyWriteError(error, fallback) {
  const message = (error && error.message) || "";
  for (const marker of Object.keys(WRITE_ERROR_COPY)) {
    if (message.includes(marker)) return WRITE_ERROR_COPY[marker];
  }
  return fallback;
}
