import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { FLYER_SCHEMA, buildUserText, normalizeFlyer } from "../api/_lib/flyer.js";
import { createHandler } from "../api/read-flyer.js";
import { flyerToDraft } from "../src/lib/flyer.js";

const NOW = new Date("2026-10-12T16:00:00Z");
const SUPA = "https://proj.supabase.co";
const UID = "11111111-1111-1111-1111-111111111111";
const IMG = `${SUPA}/storage/v1/object/public/event-photos/${UID}/1760284800000.jpg`;

const RAW = {
  is_meet: true,
  title: "  Spooky   Supercars ",
  date: "2026-10-23",
  start_time: "19:00",
  end_time: "22:00",
  venue: "Avalon",
  address: "400 Avalon Blvd",
  city: "Alpharetta, GA",
  description: "Halloween supercar night. Costumes welcome. Runs 7–10 PM.",
  vibe: "Exotic",
  hosts: ["@spookysupercars"],
  check: ["Year not on flyer — assumed 2026"],
};

test("the schema meets structured-output rules: every object closed, every property required", () => {
  const walk = (node) => {
    if (node && typeof node === "object") {
      if (node.type === "object") {
        assert.equal(node.additionalProperties, false);
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      }
      Object.values(node).forEach(walk);
    }
  };
  walk(FLYER_SCHEMA);
});

test("normalizeFlyer tidies good output and drops bad values", () => {
  const f = normalizeFlyer(RAW, NOW);
  assert.equal(f.isMeet, true);
  assert.equal(f.title, "Spooky Supercars");
  assert.equal(f.date, "2026-10-23");
  assert.equal(f.startTime, "19:00");
  assert.equal(f.vibe, "Exotic");
  assert.deepEqual(f.check, ["Year not on flyer — assumed 2026"]);

  const bad = normalizeFlyer(
    { ...RAW, date: "2026-02-30", start_time: "7pm", vibe: "Muscle", title: 42, hosts: "x", check: null },
    NOW
  );
  assert.equal(bad.date, null);
  assert.equal(bad.startTime, null);
  assert.equal(bad.vibe, null);
  assert.equal(bad.title, null);
  assert.deepEqual(bad.hosts, []);
  assert.deepEqual(bad.check, []);

  assert.equal(normalizeFlyer({ ...RAW, date: "2025-10-23" }, NOW).date, null, "a year back is a misread");
  assert.equal(normalizeFlyer(null, NOW).isMeet, false);
});

test("the prompt carries the post date in Eastern time, and the caption when given", () => {
  // 01:30 UTC on the 13th is still the 12th in Atlanta.
  const text = buildUserText({ caption: " Pull up! 123 Main St ", now: new Date("2026-10-13T01:30:00Z") });
  assert.match(text, /Monday, October 12, 2026/);
  assert.match(text, /Caption:\nPull up! 123 Main St$/);
  assert.doesNotMatch(buildUserText({ now: NOW }), /Caption/);
});

test("flyerToDraft fills only what the flyer gave", () => {
  const before = { title: "", location: "", city: "Atlanta, GA", vibe: "JDM", date: "", time: "", description: "mine" };
  const { draft, filled } = flyerToDraft(normalizeFlyer(RAW, NOW), before);
  assert.equal(draft.location, "Avalon, 400 Avalon Blvd");
  assert.equal(draft.city, "Alpharetta, GA");
  assert.equal(draft.time, "19:00");
  assert.equal(draft.vibe, "Exotic");
  assert.deepEqual(filled, ["title", "location", "city", "date", "time", "vibe", "description"]);

  const sparse = flyerToDraft(normalizeFlyer({ is_meet: true, title: "Cars & Coffee" }, NOW), before);
  assert.equal(sparse.draft.city, "Atlanta, GA");
  assert.equal(sparse.draft.description, "mine");
  assert.deepEqual(sparse.filled, ["title"]);
});

// ---------- the endpoint ----------

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

function setup({ userOk = true, logStatus = 201, logBody = "", claude } = {}) {
  const calls = { fetch: [], claude: [] };
  const fetchImpl = async (url, init = {}) => {
    calls.fetch.push({ url, init });
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify(userOk ? { id: UID } : { msg: "bad jwt" }), { status: userOk ? 200 : 401 });
    }
    if (url.endsWith("/rest/v1/flyer_reads")) return new Response(logBody, { status: logStatus });
    throw new Error("unexpected fetch " + url);
  };
  const makeClient = (apiKey) => ({
    beta: {
      messages: {
        create: async (params) => {
          calls.claude.push({ apiKey, params });
          if (claude instanceof Error) throw claude;
          return (
            claude || {
              stop_reason: "end_turn",
              content: [
                { type: "thinking", thinking: "" },
                { type: "text", text: JSON.stringify(RAW) },
              ],
            }
          );
        },
      },
    },
  });
  const handler = createHandler({
    env: { VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: "anon", ANTHROPIC_API_KEY: "sk-test" },
    fetchImpl,
    makeClient,
    now: () => NOW,
  });
  const run = async (body, headers = { authorization: "Bearer user-jwt" }, method = "POST") => {
    const res = fakeRes();
    await handler({ method, headers, body }, res);
    return res;
  };
  return { run, calls };
}

test("reads the caller's own flyer and returns the cleaned fields", async () => {
  const { run, calls } = setup();
  const res = await run({ imageUrl: IMG, caption: "Avalon lot B" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.flyer.title, "Spooky Supercars");

  // Logged as the caller, before Claude was called.
  const log = calls.fetch.find((c) => c.url.endsWith("/rest/v1/flyer_reads"));
  assert.equal(log.init.headers.Authorization, "Bearer user-jwt");
  assert.deepEqual(JSON.parse(log.init.body), { user_id: UID, image_url: IMG });

  const { apiKey, params } = calls.claude[0];
  assert.equal(apiKey, "sk-test");
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.fallbacks, "default");
  assert.deepEqual(params.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(params.output_config.format.type, "json_schema");
  assert.equal(params.thinking, undefined, "Opus 5.5 rejects disabled thinking; leave it unset");
  assert.deepEqual(params.messages[0].content[0], { type: "image", source: { type: "url", url: IMG } });
  assert.match(params.messages[0].content[1].text, /Avalon lot B/);
});

test("refuses anything but the caller's own upload, before spending", async () => {
  const other = IMG.replace(UID, "22222222-2222-2222-2222-222222222222");
  for (const imageUrl of [
    other,
    "https://example.com/flyer.jpg",
    `${SUPA}/storage/v1/object/public/event-photos/${UID}/../x/a.jpg`,
    `${SUPA}/storage/v1/object/public/event-photos/${UID}/`,
    "",
  ]) {
    const { run, calls } = setup();
    const res = await run({ imageUrl });
    assert.equal(res.statusCode, 400, imageUrl);
    assert.equal(calls.claude.length, 0);
    assert.equal(calls.fetch.filter((c) => c.url.includes("flyer_reads")).length, 0);
  }
});

test("needs a valid session", async () => {
  let { run, calls } = setup();
  assert.equal((await run({ imageUrl: IMG }, {})).statusCode, 401);
  ({ run, calls } = setup({ userOk: false }));
  assert.equal((await run({ imageUrl: IMG })).statusCode, 401);
  assert.equal(calls.claude.length, 0);
});

test("over the limit: 429 and Claude is never called", async () => {
  const { run, calls } = setup({ logStatus: 400, logBody: '{"code":"P0001","message":"rate_limit_flyers"}' });
  const res = await run({ imageUrl: IMG });
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "rate_limit_flyers");
  assert.equal(calls.claude.length, 0);
});

test("refusals, truncation, bad JSON and API errors map to clean errors", async () => {
  const cases = [
    [{ stop_reason: "refusal", content: [] }, 422],
    [{ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }, 502],
    [{ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }, 502],
    [new Anthropic.RateLimitError(429, { error: {} }, "slow down", new Headers()), 503],
    [new Anthropic.InternalServerError(500, { error: {} }, "boom", new Headers()), 502],
  ];
  for (const [claude, status] of cases) {
    const { run } = setup({ claude });
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal((await run({ imageUrl: IMG })).statusCode, status);
    } finally {
      console.error = original;
    }
  }
});

test("not configured or wrong method", async () => {
  const handler = createHandler({ env: {} });
  const res = fakeRes();
  await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 503);
  const { run } = setup();
  assert.equal((await run({}, {}, "GET")).statusCode, 405);
});
