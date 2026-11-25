import test from "node:test";
import assert from "node:assert/strict";
import { friendlyWriteError } from "../src/lib/errors.js";

const FALLBACK = "Couldn't post that.";

test("maps the comment rate limit marker", () => {
  const error = { message: 'new row violates ... "rate_limit_comments"' };
  assert.match(friendlyWriteError(error, FALLBACK), /commenting quickly/);
});

test("maps the duplicate comment marker", () => {
  assert.equal(
    friendlyWriteError({ message: "duplicate_comment" }, FALLBACK),
    "You already posted that comment."
  );
});

test("maps hourly and daily meet limits to different copy", () => {
  const hourly = friendlyWriteError({ message: "rate_limit_events_hourly" }, FALLBACK);
  const daily = friendlyWriteError({ message: "rate_limit_events_daily" }, FALLBACK);
  assert.match(hourly, /last hour/);
  assert.match(daily, /daily limit/);
  assert.notEqual(hourly, daily);
});

test("maps the reserved host marker", () => {
  const error = { message: 'new row violates ... "host_reserved"' };
  assert.match(friendlyWriteError(error, FALLBACK), /verified host/);
});

test("unrelated errors keep the fallback and say what went wrong", () => {
  assert.equal(friendlyWriteError({ message: "connection reset" }, FALLBACK), `${FALLBACK} (connection reset)`);
  assert.equal(friendlyWriteError({ message: "TypeError: Failed to fetch" }, FALLBACK), `${FALLBACK} (no connection)`);
  assert.equal(friendlyWriteError({ code: "42501" }, FALLBACK), `${FALLBACK} (42501)`);
});

test("falls back for null, undefined, and message-less errors", () => {
  assert.equal(friendlyWriteError(null, FALLBACK), FALLBACK);
  assert.equal(friendlyWriteError(undefined, FALLBACK), FALLBACK);
  assert.equal(friendlyWriteError({}, FALLBACK), FALLBACK);
});

test("does not confuse the hourly marker for the daily one", () => {
  // 'rate_limit_events_hourly' must not match on a 'daily' lookup and vice
  // versa; both share the 'rate_limit_events_' prefix.
  const daily = friendlyWriteError({ message: "rate_limit_events_daily" }, FALLBACK);
  assert.doesNotMatch(daily, /last hour/);
});

test("maps the photo limit markers to distinct copy", () => {
  const hourly = friendlyWriteError({ message: "rate_limit_photos" }, FALLBACK);
  const perMeet = friendlyWriteError({ message: "photo_limit_per_meet" }, FALLBACK);
  assert.match(hourly, /quickly/);
  assert.match(perMeet, /one meet/);
  assert.notEqual(hourly, perMeet);
});

test("listing-request errors get readable copy", async () => {
  const { friendlyWriteError } = await import("../src/lib/errors.js");
  assert.match(friendlyWriteError({ message: "not_listable" }, "x"), /Report/);
  assert.match(friendlyWriteError({ message: "duplicate_request" }, "x"), /already sent/);
});

test("members get plain reasons; the technical one goes to the admins' log", async () => {
  const { errorReason, withReason, onTechnicalError } = await import("../src/lib/errors.js");
  const logged = [];
  onTechnicalError((detail, shown) => logged.push([detail, shown]));
  const cases = [
    [{ message: "permission denied for table follows", code: "42501" }, "you don't have access to that"],
    [new TypeError("Failed to fetch"), "no connection"],
    [{ message: "JWT expired", code: "PGRST301" }, "you've been signed out. Sign in again"],
    [{ message: 'duplicate key value violates unique constraint "follows_pkey"', code: "23505" }, "that's already saved"],
    [{ message: "canceling statement due to statement timeout", code: "57014" }, "it took too long. Try again"],
    [{ message: "the database is restarting", code: "XX000" }, "TUNR's server is having trouble. Try again in a minute"],
    [{ message: "Could not find the function public.post_shout in the schema cache", code: "PGRST202" }, "TUNR is being updated. Try again in a few minutes"],
    [{ message: "User denied Geolocation", code: 1 }, "location is blocked for TUNR. Allow it in your phone's settings"],
    ["meet_cancelled", "meet cancelled"],
    [new TypeError("Cannot read properties of undefined (reading 'map')"), "something went wrong on our side"],
    ["Invalid API Key provided: sk_test_123", "something went wrong on our side"],
    ["The card was declined", "The card was declined"],
    [new Error("Couldn't load meets. (no connection)"), "no connection"],
  ];
  for (const [e, plain] of cases) assert.equal(errorReason(e), plain, JSON.stringify(e.message || e));
  for (const [e] of cases) assert.ok(!/table|function|schema|PGRST|constraint|sk_test/i.test(errorReason(e)), "no technical words for members");
  assert.equal(withReason("Couldn't follow @atl.", { message: "permission denied for table follows", code: "42501" }), "Couldn't follow @atl. (you don't have access to that)");
  assert.deepEqual(logged.at(-1), ["permission denied for table follows [42501]", "Couldn't follow @atl. (you don't have access to that)"], "the admin log gets the technical reason and what the member saw");
  const before = logged.length;
  errorReason(new TypeError("Failed to fetch"));
  assert.equal(logged.length, before, "no connection isn't logged (nothing to fix)");
  onTechnicalError(null);
});

test("sign-in errors say what actually happened", async () => {
  const { authErrorMessage } = await import("../src/lib/errors.js");
  assert.match(
    authErrorMessage({ message: "email rate limit exceeded", code: "over_email_send_rate_limit" }),
    /limit on sign-up emails.*already have an account\.$/
  );
  assert.match(
    authErrorMessage({ message: 'Email address "a@b.co" is invalid', code: "email_address_invalid" }),
    /rejected that email address\. \(Email address "a@b\.co" is invalid\)$/
  );
  assert.equal(authErrorMessage({ message: "Invalid login credentials" }), "Wrong email or password.");
  assert.equal(authErrorMessage({ message: "boom" }), "Couldn't sign you in. (boom)");
});
