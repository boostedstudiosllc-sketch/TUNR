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

test("falls back for unrelated errors", () => {
  assert.equal(friendlyWriteError({ message: "connection reset" }, FALLBACK), FALLBACK);
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
