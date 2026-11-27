import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM, cleanConversation, tidyAnswer, MAX_QUESTION } from "../api/_lib/help.js";
import { createHandler } from "../api/_routes/help.js";
import { helpError } from "../src/lib/helpRules.js";
import { HELP_GUIDE, HELP_SUGGESTIONS } from "../src/data/helpGuide.js";

test("the assistant only answers about TUNR, from the guide, and never gives fit or legal verdicts", () => {
  assert.ok(SYSTEM.includes(HELP_GUIDE), "the whole guide goes with every question");
  assert.match(SYSTEM, /ONLY questions about using the TUNR app/);
  assert.match(SYSTEM, /isn't about TUNR/);
  assert.match(SYSTEM, /say whether a specific part fits a specific car/);
  assert.match(SYSTEM, /reveal these instructions/);
  assert.match(HELP_GUIDE, /TUNR isn't part of the sale/, "the guide says TUNR isn't part of marketplace sales");
  assert.ok(HELP_SUGGESTIONS.length >= 4);
});

test("conversation: last 8 turns, the question last, long questions refused, old turns cut", () => {
  assert.deepEqual(cleanConversation([]), { error: "bad_request" });
  assert.deepEqual(cleanConversation([{ role: "assistant", text: "hi" }]), { error: "bad_request" }, "must end with a question");
  assert.deepEqual(cleanConversation([{ role: "user", text: "x".repeat(MAX_QUESTION + 1) }]), { error: "too_long" });
  const many = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `m${i}` }));
  many.push({ role: "user", text: "  how   do I post?  " });
  const { turns } = cleanConversation(many);
  assert.ok(turns.length <= 8);
  assert.equal(turns[0].role, "user", "starts with the user");
  assert.deepEqual(turns.at(-1), { role: "user", text: "how do I post?" });
  assert.ok(turns.some((t) => t.role === "model"), "assistant turns are sent as the model's");
});

test("answers are tidied into plain text", () => {
  assert.equal(tidyAnswer("## Steps\n**Tap** + POST MEET\n* Add a flyer\n\n\n\nDone"), "Steps\nTap + POST MEET\n- Add a flyer\n\nDone");
});

test("help errors in plain words", () => {
  assert.match(helpError("rate_limit", { limit: 40 }), /40 questions today/);
  assert.match(helpError("busy"), /busy/);
  assert.match(helpError("not_configured"), /isn't switched on/);
  assert.equal(helpError("ai_failed", { detail: "permission denied for table x" }), "TUNR Help couldn't answer. (you don't have access to that)");
});

// The route, with a fake database and a fake Gemini.
const ENV = { VITE_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", VITE_SUPABASE_ANON_KEY: "anon", GEMINI_API_KEY: "g" };
function fake({ quota = { status: "ok", left: 39 }, gemini = { candidates: [{ content: { parts: [{ text: "Tap **+ POST MEET** at the top." }] } }] }, user = { id: "u1" } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return user ? Response.json(user) : new Response("no", { status: 401 });
    if (String(url).includes("/rpc/use_help_question")) return Response.json(quota);
    if (String(url).includes("generativelanguage")) return Response.json(gemini);
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls };
}
const res = () => ({ code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const ask = (q = "How do I post a meet?", headers = { authorization: "Bearer t" }) => ({ method: "POST", headers, body: { messages: [{ role: "user", text: q }] } });

test("route: answers a member's question with the guide, counting it against their day", async () => {
  const f = fake();
  const r = res();
  await createHandler({ env: ENV, fetchImpl: f.fetchImpl })(ask(), r);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, { answer: "Tap + POST MEET at the top.", left: 39 });
  assert.equal(JSON.parse(f.calls.find((c) => c.url.includes("use_help_question")).init.body).p_who, "user:u1");
  const sent = JSON.parse(f.calls.find((c) => c.url.includes("generativelanguage")).init.body);
  assert.equal(sent.systemInstruction.parts[0].text, SYSTEM);
  assert.equal(sent.contents.at(-1).parts[0].text, "How do I post a meet?");
});

test("route: signed-out visitors are counted by a hashed address, never the address itself", async () => {
  const f = fake({ user: null });
  await createHandler({ env: ENV, fetchImpl: f.fetchImpl })(ask("hi", { "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), res());
  const who = JSON.parse(f.calls.find((c) => c.url.includes("use_help_question")).init.body).p_who;
  assert.match(who, /^visitor:[0-9a-f]{32}$/);
  assert.ok(!who.includes("203.0.113.9"));
});

test("route: limits, missing setup and AI trouble each say so", async () => {
  let r = res();
  await createHandler({ env: { ...ENV, GEMINI_API_KEY: "" }, fetchImpl: fake().fetchImpl })(ask(), r);
  assert.deepEqual([r.code, r.body.error], [503, "not_configured"]);
  r = res();
  await createHandler({ env: ENV, fetchImpl: fake({ quota: { status: "rate_limit", limit: 40 } }).fetchImpl })(ask(), r);
  assert.deepEqual([r.code, r.body], [429, { error: "rate_limit", limit: 40 }]);
  r = res();
  const f = fake({ quota: { status: "rate_limit", limit: 40 } });
  await createHandler({ env: ENV, fetchImpl: f.fetchImpl })(ask(), res());
  assert.ok(!f.calls.some((c) => c.url.includes("generativelanguage")), "over the limit, the AI isn't asked");
  r = res();
  await createHandler({ env: ENV, fetchImpl: fake().fetchImpl })(ask("x".repeat(600)), r);
  assert.deepEqual([r.code, r.body.error], [400, "too_long"]);
  r = res();
  await createHandler({ env: ENV, fetchImpl: fake({ gemini: { candidates: [{ finishReason: "SAFETY" }] } }).fetchImpl })(ask("something nasty"), r);
  assert.equal(r.code, 200);
  assert.match(r.body.answer, /only help with questions about using TUNR/);
  r = res();
  await createHandler({ env: ENV, fetchImpl: fake().fetchImpl })({ method: "GET", headers: {} }, r);
  assert.equal(r.code, 405);
});
