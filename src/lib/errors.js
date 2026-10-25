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
  linkup_terms_required: "Agree to the linkup rules first.",
  linkup_starts_within_2_hours: "A linkup has to start within the next 2 hours.",
  linkup_already_live: "You already have a live linkup. End or cancel it before starting another.",
  rate_limit_linkups: "That's 6 linkups today — the limit. Try again tomorrow.",
  linkup_over: "That linkup is over or was cancelled.",
  linkup_is_yours: "That's your own linkup — you're already in.",
  linkup_unavailable: "You can't join that linkup.",
  linkup_chat_closed: "This linkup's chat has closed.",
  rate_limit_messages: "You're sending messages quickly — wait a minute and try again.",
  needs_a_car: "Add your car to your garage first — confirmations come from car owners.",
  not_a_photographer: "They haven't turned on the photographer badge.",
  confirmation_blocked: "You can't confirm this photographer.",
  rate_limit_confirmations: "That's 10 confirmations today — the limit. Try again tomorrow.",
  admins_only: "Only TUNR admins can do that.",
  rate_limit_forums: "That's 3 new forums this week — the limit. Try again in a few days.",
  forum_name_taken: "There's already a forum with that name — join that one, or pick another name.",
  forum_unavailable: "That forum isn't available any more.",
  rate_limit_posts: "That's 5 posts in an hour — the limit. Try again a bit later.",
  post_unavailable: "That post was removed.",
  post_locked: "This post is locked — no new comments.",
  bad_reply: "The comment you replied to is gone.",
  bad_solution: "Pick a comment on this post as the answer.",
  mods_only: "Only this forum's moderators can do that.",
  rate_limit_clubs: "That's 2 new clubs this month — the limit.",
  club_name_taken: "There's already a club with that name — pick another.",
  club_unavailable: "You can't join that club.",
  club_admins_only: "Only the club's owner or admins can do that.",
  owner_only: "Only the club's owner can do that.",
  cant_change_owner: "The club's owner can't be removed or changed.",
  not_a_member: "They aren't in this club any more.",
  profiles_bio_length_check: "Your bio has to be 160 characters or fewer, on 5 lines at most.",
  profiles_avatar_url_check: "Profile photos have to be uploaded through TUNR — pick the photo again.",
  redemption_already_decided: "That claim was already handed over or cancelled. Refresh to see it.",
  redemption_not_found: "That claim no longer exists.",
  checkin_already_voided: "That check-in was already removed.",
  checkin_not_found: "That check-in no longer exists.",
  note_required: "Add a reason. The person sees it in their points history.",
  bad_points_amount: "Use a number of points between -10000 and 10000 (not 0).",
  purchase_already_decided: "That purchase was already approved or rejected. Refresh to see it.",
  purchase_not_found: "That purchase no longer exists.",
  purchase_duplicate: "That order number has already been added. Each order counts once.",
  purchase_amount_check: "Use an amount between $1 and $10,000.",
  purchase_claims_order_once: "That order number has already been added. Each order counts once.",
  points_settings_points_per_dollar_check: "Points per $1 has to be between 0 and 1000.",
  points_settings_member_bonus_check: "The membership bonus has to be between 0 and 100,000 points.",
  rewards_min_spend_cents_check: "The minimum spend has to be between $0 and $100,000.",
  issue_already_answered: "That report was already answered. Refresh to see it.",
  issue_not_found: "That report no longer exists.",
  card_count_check: "Make between 1 and 500 cards at a time.",
  point_cards_points_check: "Each card can give between 1 and 100,000 points.",
  point_cards_label_check: "Say what the cards are for, in up to 60 characters.",
  invite_to_unlock_cars: "Invite 1 friend to add more cars. Profile → 🎁 Invite.",
  invite_to_unlock_clubs: "Invite 1 friend to start your own club. Profile → 🎁 Invite.",
  invite_to_unlock_flair: "Invite 5 friends to unlock profile colors. Profile → 🎁 Invite.",
  profiles_profile_color_check: "Pick one of the colors shown.",
  points_meets_points_check: "Boosted meets give 1 to 10 points.",
  rewards_cost_check: "A reward has to cost between 1 and 100,000 points.",
  rewards_title_check: "Give the reward a name of up to 80 characters.",
  rewards_per_person_check: "Max per person has to be between 1 and 50.",
  confirm_email_first:
    "Confirm your email first — tap the link we emailed you (or “Resend email” at the top of the app).",
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

// Sign-up and log-in failures from Supabase Auth, in plain words with the
// real reason after them, e.g. "Sign-up emails are maxed out … (email rate
// limit exceeded)".
export function authErrorMessage(error) {
  const msg = (error && error.message) || "";
  const code = (error && error.code) || "";
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox (and spam).";
  if (/already registered|already been registered/i.test(msg) || code === "user_already_exists")
    return "That email already has an account. Tap LOG IN instead.";
  if (/password/i.test(msg) && /(short|least|6)/i.test(msg)) return withReason("Password must be at least 6 characters.", error);
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(msg))
    return withReason(
      "TUNR has hit its limit on sign-up emails for now, so new accounts can't be created for a bit. This isn't your fault — try again in an hour, or log in if you already have an account.",
      error
    );
  if (code === "over_request_rate_limit" || /rate limit|too many/i.test(msg))
    return withReason("Too many tries from this device. Wait a few minutes and try again.", error);
  if (code === "email_address_not_authorized" || /not authorized/i.test(msg))
    return withReason("TUNR can't send a confirmation email to that address yet.", error);
  if (code === "email_address_invalid" || (/invalid/i.test(msg) && /email/i.test(msg)))
    return withReason("The sign-up service rejected that email address.", error);
  return withReason("Couldn't sign you in.", error);
}
