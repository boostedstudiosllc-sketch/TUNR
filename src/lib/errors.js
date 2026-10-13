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
  rate_limit_photos:
    "You're posting photos quickly — give it a few minutes and try again.",
  photo_limit_per_meet: "That's the photo limit for one meet.",
  rate_limit_requests:
    "We've had several requests about this recently. Email us instead and we'll sort it out.",
  not_listable:
    "That meet was posted by its organizer — use Report on the meet instead.",
  duplicate_request: "You've already sent us that request — we'll be in touch.",
  host_reserved:
    "That host name belongs to a verified host. Post under your own handle.",
};

// The short reason behind a failure, for showing next to the friendly
// message: "Couldn't save that car. (permission denied for table vehicles)".
// Every error the app shows says what actually went wrong.
export function errorReason(error) {
  if (!error) return "";
  if (typeof error === "string") return error.slice(0, 140);
  const raw = String(error.message || error.error_description || error.error || error.code || error.status || "").trim();
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) return "no connection";
  return raw.replace(/\s+/g, " ").slice(0, 140);
}

export function withReason(message, error) {
  const reason = errorReason(error);
  return reason ? `${message} (${reason})` : message;
}

// `fallback` is what the caller would have said anyway; known database
// errors get their own wording, anything else gets the fallback plus the
// reason.
export function friendlyWriteError(error, fallback) {
  const message = (error && error.message) || "";
  for (const marker of Object.keys(WRITE_ERROR_COPY)) {
    if (message.includes(marker)) return WRITE_ERROR_COPY[marker];
  }
  return withReason(fallback, error);
}
