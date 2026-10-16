import test from "node:test";
import assert from "node:assert/strict";
import { createHandler as pushHandler } from "../api/push.js";
import { createHandler as remindersHandler, remindersFor } from "../api/reminders.js";

const SUPA = "https://proj.supabase.co";
const ENV = { VITE_SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: "service" };

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function fakeDb({ keys = null, claimed = [], rsvps = [] } = {}) {
  const calls = [];
  const state = { keys, deleted: [], notified: [] };
  const fetchImpl = async (url, init = {}) => {
    const path = url.slice(SUPA.length);
    calls.push({ path, init });
    assert.equal(init.headers.apikey, "service");
    if (path.startsWith("/rest/v1/push_keys?")) return new Response(JSON.stringify(state.keys ? [state.keys] : []));
    if (path === "/rest/v1/push_keys") {
      const b = JSON.parse(init.body);
      state.keys = state.keys || { public_key: b.public_key, private_key: b.private_key };
      return new Response("", { status: 201 });
    }
    if (path === "/rest/v1/rpc/claim_pushes") {
      const out = claimed;
      claimed = [];
      return new Response(JSON.stringify(out));
    }
    if (path.startsWith("/rest/v1/push_subscriptions?")) {
      state.deleted.push(decodeURIComponent(path.split("endpoint=eq.")[1]));
      return new Response("", { status: 204 });
    }
    if (path.startsWith("/rest/v1/rsvps?")) return new Response(JSON.stringify(rsvps));
    if (path === "/rest/v1/rpc/notify_many") {
      state.notified.push(...JSON.parse(init.body).p_items);
      return new Response("1");
    }
    throw new Error("unexpected " + path);
  };
  return { fetchImpl, calls, state };
}

const fakePush = () => {
  const sent = [];
  return {
    sent,
    generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
    sendNotification: async (sub, payload, opts) => {
      sent.push({ sub, payload: JSON.parse(payload), opts });
      if (sub.endpoint.includes("gone")) {
        const e = new Error("gone");
        e.statusCode = 410;
        throw e;
      }
    },
  };
};

test("without the service role key, push says exactly what's missing", async () => {
  const res = fakeRes();
  await pushHandler({ env: { VITE_SUPABASE_URL: SUPA } })({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "push_not_configured");
  assert.match(res.body.detail, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("the signing keys are made once and then reused", async () => {
  const db = fakeDb();
  const wp = fakePush();
  const handler = pushHandler({ env: ENV, fetchImpl: db.fetchImpl, webpushImpl: wp });
  let res = fakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.deepEqual(res.body, { publicKey: "PUB" });
  assert.equal(db.state.keys.private_key, "PRIV");
  res = fakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(db.calls.filter((c) => c.path === "/rest/v1/push_keys").length, 1);
});

test("delivery sends each claimed alert to each device and drops dead ones", async () => {
  const db = fakeDb({
    keys: { public_key: "PUB", private_key: "PRIV" },
    claimed: [
      {
        id: 1,
        user_id: "u1",
        title: "📸 Photo linkup near you",
        body: "@k · in 20 min",
        link: "linkup:abc",
        kind: "linkup_nearby",
        endpoints: [
          { endpoint: "https://push.example/ok", p256dh: "p", auth: "a" },
          { endpoint: "https://push.example/gone", p256dh: "p", auth: "a" },
        ],
      },
      { id: 2, user_id: "u2", title: "x", body: "", link: null, kind: "photographer", endpoints: [] },
    ],
  });
  const wp = fakePush();
  const res = fakeRes();
  await pushHandler({ env: ENV, fetchImpl: db.fetchImpl, webpushImpl: wp })({ method: "POST", headers: {} }, res);
  assert.deepEqual(res.body, { notifications: 2, sent: 1, failed: 1, removed: 1 });
  assert.equal(wp.sent[0].payload.link, "linkup:abc");
  assert.equal(wp.sent[0].opts.urgency, "high");
  assert.equal(wp.sent[0].opts.vapidDetails.privateKey, "PRIV");
  assert.match(wp.sent[0].opts.vapidDetails.subject, /^mailto:/);
  assert.deepEqual(db.state.deleted, ["https://push.example/gone"]);
});

const NOW = new Date("2026-10-17T13:00:00Z"); // Saturday 9 AM in Atlanta
const ev = (over) => ({
  id: "e1",
  title: "Tuner Night",
  city: "Atlanta, GA",
  start_at: "2026-10-17T23:00:00Z",
  end_at: null,
  recurrence: null,
  recurrence_until: null,
  timezone: "America/New_York",
  hidden: false,
  ...over,
});

test("reminders: today's meets, weekly ones on their day, nothing else", () => {
  const items = remindersFor(
    [
      { user_id: "u1", events: ev() },
      { user_id: "u2", events: ev({ id: "e2", title: "Sat Coffee", start_at: "2026-09-05T13:00:00Z", recurrence: "weekly:SAT" }) },
      { user_id: "u3", events: ev({ id: "e3", start_at: "2026-10-18T23:00:00Z" }) },
      { user_id: "u4", events: ev({ id: "e4", hidden: true }) },
      { user_id: "u5", events: null },
    ],
    NOW
  );
  assert.deepEqual(
    items.map((i) => [i.user_id, i.title, i.body, i.dedupe]),
    [
      ["u1", "Today: Tuner Night", "7:00 PM · Atlanta, GA", "meet:e1:2026-10-17"],
      ["u2", "Today: Sat Coffee", "9:00 AM · Atlanta, GA", "meet:e2:2026-10-17"],
    ]
  );
});

test("the reminder run queues, then delivers; a wrong cron secret is refused", async () => {
  const db = fakeDb({ keys: { public_key: "PUB", private_key: "PRIV" }, rsvps: [{ user_id: "u1", events: ev() }] });
  const handler = remindersHandler({ env: { ...ENV, CRON_SECRET: "s" }, fetchImpl: db.fetchImpl, webpushImpl: fakePush(), now: () => NOW });
  let res = fakeRes();
  await handler({ method: "GET", headers: { authorization: "Bearer nope" } }, res);
  assert.equal(res.statusCode, 401);
  res = fakeRes();
  await handler({ method: "GET", headers: { authorization: "Bearer s" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reminders, 1);
  assert.equal(db.state.notified[0].kind, "meet_reminder");
  assert.ok(db.calls.some((c) => c.path === "/rest/v1/rpc/claim_pushes"));
});
