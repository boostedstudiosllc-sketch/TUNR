import test from "node:test";
import assert from "node:assert/strict";
import { plannedDeleteOn, prettyDate, createAccounts } from "../api/_lib/accounts.js";
import { createHandler } from "../api/confirm-email.js";

const NOW = new Date("2026-10-17T13:00:00Z");

test("the removal date is 7 days after sign-up, and at least 3 days after a reminder", () => {
  assert.equal(plannedDeleteOn({ createdAt: "2026-10-17T02:00:00Z", stage: "welcome", now: NOW }), "2026-10-24");
  // Reminder going out late (day 6): pushed to 3 days from now.
  assert.equal(plannedDeleteOn({ createdAt: "2026-10-11T02:00:00Z", stage: "reminder", now: NOW }), "2026-10-20");
  // Never earlier than a date already promised.
  assert.equal(plannedDeleteOn({ createdAt: "2026-10-11T02:00:00Z", stage: "reminder", existing: "2026-10-22", now: NOW }), "2026-10-22");
  assert.equal(prettyDate("2026-10-24"), "Saturday, October 24");
});

function fakeService({ queue = [], failOtpFor = null } = {}) {
  const calls = [];
  const meta = {};
  const rest = async (path, init = {}) => {
    calls.push({ path, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (path === "/rest/v1/rpc/confirmation_queue") return queue;
    if (path.startsWith("/auth/v1/admin/users/") && (init.method || "GET") === "GET") return { user_metadata: { username: "k" } };
    if (path.startsWith("/auth/v1/admin/users/") && init.method === "PUT") {
      meta[path.split("/").pop()] = JSON.parse(init.body).user_metadata;
      return {};
    }
    if (path === "/auth/v1/otp") {
      if (JSON.parse(init.body).email === failOtpFor) throw new Error("email rate limit exceeded");
      return {};
    }
    if (path === "/rest/v1/rpc/mark_confirmation_sent") return JSON.parse(init.body).p_delete_on;
    return null;
  };
  return { calls, meta, service: { rest } };
}

test("the daily run sends, reminds and removes — and records nothing that failed", async () => {
  const { calls, meta, service } = fakeService({
    failOtpFor: "fail@x.com",
    queue: [
      { user_id: "u1", email: "new@x.com", created_at: "2026-10-16T20:00:00Z", stage: "welcome", delete_on: null },
      { user_id: "u2", email: "slow@x.com", created_at: "2026-10-13T20:00:00Z", stage: "reminder", delete_on: "2026-10-20" },
      { user_id: "u3", email: "fail@x.com", created_at: "2026-10-16T20:00:00Z", stage: "welcome", delete_on: null },
      { user_id: "u4", email: "gone@x.com", created_at: "2026-10-09T20:00:00Z", stage: "delete", delete_on: "2026-10-16" },
    ],
  });
  const result = await createAccounts(service, { now: () => NOW }).runDaily();
  assert.equal(result.welcome, 1);
  assert.equal(result.reminder, 1);
  assert.equal(result.deleted, 1);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /rate limit/);
  // The template values, with the existing metadata kept.
  assert.deepEqual(meta.u2, { username: "k", confirm_reminder: true, delete_on: "Tuesday, October 20" });
  assert.equal(meta.u1.confirm_reminder, false);
  const marks = calls.filter((c) => c.path === "/rest/v1/rpc/mark_confirmation_sent").map((c) => c.body.p_user);
  assert.deepEqual(marks, ["u1", "u2"]); // not u3, whose email failed
  assert.ok(calls.some((c) => c.path === "/auth/v1/admin/users/u4" && c.method === "DELETE"));
  assert.deepEqual(calls.find((c) => c.path === "/rest/v1/rpc/record_account_cleanup").body, { p_deleted: 1 });
});

const res = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});

test("resend: signed in only, at most every 10 minutes, and it says why it failed", async () => {
  const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" };
  let status = { user_id: "u1", last_send_at: "2026-10-17T12:55:00Z", welcome_sent_at: "2026-10-17T12:55:00Z" };
  let otpError = null;
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://p.supabase.co", "");
    if (path === "/auth/v1/user") return new Response(JSON.stringify({ id: "u1", email: "k@gmail.com", created_at: "2026-10-17T12:50:00Z" }));
    if (path.startsWith("/rest/v1/account_status")) return new Response(JSON.stringify([status]));
    if (path.startsWith("/auth/v1/admin/users/")) return new Response(JSON.stringify({ user_metadata: {} }));
    if (path === "/auth/v1/otp") return otpError ? new Response(JSON.stringify({ msg: otpError }), { status: 429 }) : new Response("{}");
    if (path === "/rest/v1/rpc/mark_confirmation_sent") return new Response(JSON.stringify("2026-10-24"));
    throw new Error("unexpected " + path);
  };
  const handler = createHandler({ env, fetchImpl, now: () => NOW });
  let r = res();
  await handler({ method: "POST", headers: {} }, r);
  assert.equal(r.statusCode, 401);
  r = res();
  await handler({ method: "POST", headers: { authorization: "Bearer t" } }, r);
  assert.equal(r.body.error, "confirm_email_wait");
  status = { user_id: "u1", last_send_at: "2026-10-17T12:00:00Z", welcome_sent_at: "2026-10-17T12:00:00Z" };
  r = res();
  await handler({ method: "POST", headers: { authorization: "Bearer t" } }, r);
  assert.deepEqual(r.body, { sent: true, email: "k@gmail.com", deleteOn: "2026-10-24" });
  otpError = "email rate limit exceeded";
  status = { user_id: "u1", last_send_at: null };
  r = res();
  await handler({ method: "POST", headers: { authorization: "Bearer t" } }, r);
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.error, "email_send_failed");
  assert.match(r.body.detail, /rate limit/);
  status = { user_id: "u1", confirmed_at: "2026-10-17T12:00:00Z" };
  r = res();
  await handler({ method: "POST", headers: { authorization: "Bearer t" } }, r);
  assert.deepEqual(r.body, { confirmed: true });
});
