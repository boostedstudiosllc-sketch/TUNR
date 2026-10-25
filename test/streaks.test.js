import test from "node:test";
import assert from "node:assert/strict";
import { queueStreakReminders } from "../api/daily.js";

function fakeService() {
  const calls = [];
  return {
    calls,
    rest: async (path, init = {}) => {
      calls.push({ path, method: init.method || "GET" });
      return 3;
    },
  };
}

test("streak reminders go out on Saturday morning in Atlanta, and only then", async () => {
  // 13:00 UTC is the cron time: 9 AM in Atlanta.
  const saturday = fakeService();
  assert.equal(await queueStreakReminders(saturday, new Date("2026-10-24T13:00:00Z")), 3);
  assert.deepEqual(saturday.calls, [{ path: "/rest/v1/rpc/queue_streak_reminders", method: "POST" }]);

  const friday = fakeService();
  assert.equal(await queueStreakReminders(friday, new Date("2026-10-23T13:00:00Z")), null);
  assert.equal(friday.calls.length, 0);

  // Saturday in UTC but still Friday night in Atlanta: not yet.
  const lateFriday = fakeService();
  assert.equal(await queueStreakReminders(lateFriday, new Date("2026-10-24T02:00:00Z")), null);
});
