import test from "node:test";
import assert from "node:assert/strict";
import { pickImage, judgeFlyer, eventRow, createInstagramImport, tokenKind, cleanUsername } from "../api/_lib/instagram.js";

const NOW = new Date("2026-10-26T16:00:00Z"); // Monday, noon in Atlanta

const flyer = (over = {}) => ({
  isMeet: true,
  title: "Midnight Euro Meet",
  date: "2026-10-31",
  dateConflict: false,
  startTime: "21:00",
  endTime: "00:30",
  venue: "Avalon",
  address: "400 Avalon Blvd",
  city: "Alpharetta, GA",
  description: "Euro night.",
  vibe: "Euro",
  hosts: ["@eurosouth"],
  check: [],
  ...over,
});

test("the image to read: photo, carousel's first photo, or a video's cover", () => {
  assert.equal(pickImage({ media_type: "IMAGE", media_url: "a" }), "a");
  assert.equal(pickImage({ media_type: "VIDEO", media_url: "v", thumbnail_url: "t" }), "t");
  const album = { media_type: "CAROUSEL_ALBUM", children: { data: [{ media_type: "VIDEO", thumbnail_url: "t" }, { media_type: "IMAGE", media_url: "p" }] } };
  assert.equal(pickImage(album), "p");
  assert.equal(pickImage({ media_type: "CAROUSEL_ALBUM", children: { data: [{ media_type: "VIDEO", thumbnail_url: "t" }] } }), "t");
  assert.equal(pickImage(null), null);
});

test("what gets listed, skipped or held", () => {
  assert.deepEqual(judgeFlyer(flyer(), NOW), { list: true });
  assert.equal(judgeFlyer(flyer({ isMeet: false }), NOW).status, "not_a_meet");
  assert.equal(judgeFlyer(flyer({ date: null }), NOW).status, "needs_review");
  assert.equal(judgeFlyer(flyer({ date: "2026-10-20" }), NOW).status, "past");
  assert.equal(judgeFlyer(flyer({ date: "2026-10-26" }), NOW).list, true); // today still counts
  assert.equal(judgeFlyer(flyer({ startTime: null }), NOW).status, "needs_review");
  assert.equal(judgeFlyer(flyer({ venue: null, address: null }), NOW).status, "needs_review");
  assert.match(judgeFlyer(flyer({ dateConflict: true, check: ["Says Friday"] }), NOW).reason, /Friday/);
});

test("the meet row: Georgia times, past-midnight end, host from the flyer", () => {
  const row = eventRow(flyer(), { lat: 34.07, lng: -84.27 }, { permalink: "https://instagram.com/p/x", imageUrl: "https://s/img.jpg" });
  assert.equal(row.start_at, "2026-11-01T01:00:00.000Z"); // 9 PM EDT
  assert.equal(row.end_at, "2026-11-01T04:30:00.000Z"); // 12:30 AM the next day
  assert.equal(row.host, "eurosouth");
  assert.equal(row.source_url, "https://instagram.com/p/x");
  assert.equal(row.created_by, null);
  assert.deepEqual(row.tags, ["From Instagram"]);
  assert.equal(eventRow(flyer({ hosts: [] }), { lat: 1, lng: 1 }, {}).host, "tunr.app");
});

// A fake Supabase (service) and a fake internet (Instagram, storage, Gemini, Mapbox).
function world({ posts, ai, dup = null, stored = {}, sources = [], other = {}, link = { access_token: "tok", seed_hash: null, refreshed_at: NOW.toISOString() } }) {
  const calls = [];
  const rest = async (path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method || "GET", body });
    if (path.startsWith("/rest/v1/instagram_link?select")) return [link];
    if (path.startsWith("/rest/v1/instagram_link")) return null;
    if (path.startsWith("/rest/v1/instagram_posts?select")) return Object.values(stored);
    if (path.startsWith("/rest/v1/instagram_posts")) return null;
    if (path.startsWith("/rest/v1/instagram_sources?select")) return sources.map((username) => ({ username }));
    if (path.startsWith("/rest/v1/instagram_sources")) return null;
    if (path === "/rest/v1/rpc/instagram_duplicate") return dup;
    if (path === "/rest/v1/rpc/notify_admins") return null;
    if (path === "/rest/v1/events") return [{ id: "ev1" }];
    throw new Error(`unexpected ${path}`);
  };
  const service = { rest, config: { url: "https://db.test", key: "service" } };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    const u = String(url);
    const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b), headers: new Map() });
    if (u.startsWith("https://graph.instagram.com/me?")) return json({ username: "tunr.app" });
    if (u.startsWith("https://graph.facebook.com/oauth/access_token")) return json({ access_token: "EAAlong" });
    if (u.startsWith("https://graph.facebook.com/me/accounts")) {
      return json({ data: [{ name: "TUNR", access_token: "EAApage", instagram_business_account: { id: "1784", username: "tunr.app" } }] });
    }
    if (u.startsWith("https://graph.facebook.com/1784/media")) return json({ data: posts });
    if (u.startsWith("https://graph.facebook.com/1784?fields=business_discovery")) {
      const name = decodeURIComponent(u).match(/username\(([^)]+)\)/)[1];
      if (!other[name]) return json({ error: { message: `Invalid user id (${name})`, code: 110 } }, 400);
      return json({ business_discovery: { username: name, media: { data: other[name] } }, id: "1784" });
    }
    if (u.startsWith("https://graph.instagram.com/me/media")) return json({ data: posts });
    if (u.startsWith("https://graph.instagram.com/refresh_access_token")) return json({ access_token: "tok2", expires_in: 5184000 });
    if (u.startsWith("https://cdn.ig/") || u.startsWith("https://db.test/storage/v1/object/public/")) {
      return { ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    }
    if (u.startsWith("https://db.test/storage/v1/object/event-photos/")) return json({ Key: "ok" });
    if (u.includes("generativelanguage.googleapis.com")) {
      const next = ai.shift();
      return json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(next) }] } }] });
    }
    if (u.startsWith("https://api.mapbox.com/")) {
      return json({ features: [{ center: [-84.27, 34.07], relevance: 0.95, place_type: ["poi"], place_name: "Avalon", context: [{ id: "region.1", short_code: "US-GA" }] }] });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { calls, service, fetchImpl };
}

const aiMeet = {
  is_meet: true, title: "Midnight Euro Meet", date: "2026-10-31", weekday: "Saturday", start_time: "21:00", end_time: null,
  venue: "Avalon", address: "400 Avalon Blvd", city: "Alpharetta, GA", description: "Euro night.", vibe: "Euro", hosts: ["@eurosouth"], check: [],
};
const aiNotMeet = { ...aiMeet, is_meet: false };
const post = (id, hoursAgo) => ({
  id, media_type: "IMAGE", media_url: `https://cdn.ig/${id}.jpg`, permalink: `https://instagram.com/p/${id}`,
  caption: "Saturday!", timestamp: new Date(NOW.getTime() - hoursAgo * 3600e3).toISOString(),
});
const env = { GEMINI_API_KEY: "g", VITE_MAPBOX_TOKEN: "m" };

test("a run lists a new meet, skips a non-meet, and alerts the admins", async () => {
  const w = world({ posts: [post("m2", 1), post("m1", 3), post("old", 24 * 30)], ai: [aiMeet, aiNotMeet] });
  const out = await createInstagramImport({ service: w.service, env, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.deepEqual(
    { ok: out.ok, checked: out.checked, imported: out.imported, skipped: out.skipped, held: out.held },
    { ok: true, checked: 2, imported: 1, skipped: 1, held: 0 }
  );
  const event = w.calls.find((c) => c.path === "/rest/v1/events").body;
  assert.equal(event.title, "Midnight Euro Meet");
  assert.equal(event.source_url, "https://instagram.com/p/m1"); // oldest first
  assert.equal(event.flyer_url, "https://db.test/storage/v1/object/public/event-photos/instagram/m1.jpg");
  const recorded = w.calls.filter((c) => (c.path || "").startsWith("/rest/v1/instagram_posts?on_conflict")).map((c) => [c.body.media_id, c.body.status]);
  assert.deepEqual(recorded, [["m1", "imported"], ["m2", "not_a_meet"]]);
  assert.match(w.calls.find((c) => c.path === "/rest/v1/rpc/notify_admins").body.p_title, /1 meet added/);
  assert.equal(w.calls.some((c) => String(c.url || "").includes("refresh_access_token")), false); // refreshed today already
});

test("already-seen posts are left alone; a duplicate isn't listed twice", async () => {
  const w = world({ posts: [post("m1", 3), post("m3", 2)], ai: [aiMeet], dup: "existing", stored: { m1: { media_id: "m1", status: "imported", attempts: 1 } } });
  const out = await createInstagramImport({ service: w.service, env, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.equal(out.skipped, 1);
  assert.equal(w.calls.some((c) => c.path === "/rest/v1/events"), false);
  const rec = w.calls.find((c) => (c.path || "").startsWith("/rest/v1/instagram_posts?on_conflict")).body;
  assert.deepEqual([rec.media_id, rec.status, rec.event_id], ["m3", "duplicate", "existing"]);
});

test("a new token in Vercel takes over, and a week-old token is renewed", async () => {
  const w = world({ posts: [], ai: [], link: { access_token: "old", seed_hash: "x", refreshed_at: "2026-10-01T00:00:00Z" } });
  await createInstagramImport({ service: w.service, env: { ...env, INSTAGRAM_ACCESS_TOKEN: "fresh" }, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  const saves = w.calls.filter((c) => c.path === "/rest/v1/instagram_link?id=eq.true").map((c) => c.body);
  assert.equal(saves[0].access_token, "fresh");
  assert.equal(saves[1].access_token, "tok2"); // renewed
  assert.ok(w.calls.some((c) => String(c.url || "").includes("refresh_access_token?grant_type=ig_refresh_token&access_token=fresh")));
});

test("not connected says why", async () => {
  const w = world({ posts: [], ai: [], link: { access_token: null } });
  const out = await createInstagramImport({ service: w.service, env, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.equal(out.ok, false);
  assert.equal(out.error, "instagram_not_connected");
  assert.match(out.detail, /INSTAGRAM_ACCESS_TOKEN/);
});

test("who can start an import", async () => {
  const { createHandler } = await import("../api/instagram-sync.js");
  const res = () => {
    const r = { code: 0, body: null, headers: {} };
    r.status = (c) => ((r.code = c), r);
    r.json = (b) => ((r.body = b), r);
    r.setHeader = (k, v) => (r.headers[k] = v);
    return r;
  };
  const base = { VITE_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service" };
  const lastRun = new Date(NOW.getTime() - 60e3).toISOString();
  const fetchImpl = async (url) => {
    const u = String(url);
    const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.endsWith("/auth/v1/user")) return json({}, 401);
    if (u.includes("instagram_link?select=last_run_at")) return json([{ last_run_at: lastRun }]);
    throw new Error(`unexpected ${u}`);
  };
  // With a secret set: a stranger is turned away.
  let r = res();
  await createHandler({ env: { ...base, CRON_SECRET: "s" }, fetchImpl, now: () => NOW })({ method: "POST", headers: {} }, r);
  assert.deepEqual([r.code, r.body.error], [401, "not_allowed"]);
  // Without one: anyone, but not twice in 5 minutes.
  r = res();
  await createHandler({ env: base, fetchImpl, now: () => NOW })({ method: "POST", headers: {} }, r);
  assert.deepEqual([r.code, r.body.error], [429, "too_soon"]);
  r = res();
  await createHandler({ env: base, fetchImpl, now: () => NOW })({ method: "DELETE", headers: {} }, r);
  assert.equal(r.code, 405);
});


test("token kinds and account names", () => {
  assert.equal(tokenKind("EAAGm0PX4ZCps"), "facebook");
  assert.equal(tokenKind("IGAAJ1x"), "instagram");
  assert.equal(cleanUsername(" @NawfSide.TM "), "nawfside.tm");
  assert.equal(cleanUsername("https://www.instagram.com/nawfside.tm/"), "nawfside.tm");
  assert.equal(cleanUsername("not a name!"), null);
});

test("the Facebook connection reads @tunr.app and watched accounts, crediting each", async () => {
  const w = world({
    posts: [post("own1", 5)],
    ai: [aiNotMeet, { ...aiMeet, hosts: [] }],
    sources: ["nawfside.tm", "gone.account"],
    other: { "nawfside.tm": [post("nf1", 2)] },
    link: { access_token: null, seed_hash: null },
  });
  const fbEnv = { ...env, INSTAGRAM_ACCESS_TOKEN: "EAAshort", FACEBOOK_APP_ID: "1", FACEBOOK_APP_SECRET: "s" };
  const out = await createInstagramImport({ service: w.service, env: fbEnv, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.equal(out.ok, true);
  assert.equal(out.imported, 1);
  const saved = w.calls.find((c) => c.path === "/rest/v1/instagram_link?id=eq.true").body;
  assert.deepEqual([saved.access_token, saved.token_kind, saved.ig_user_id], ["EAApage", "facebook", "1784"]);
  const event = w.calls.find((c) => c.path === "/rest/v1/events").body;
  assert.equal(event.host, "nawfside.tm"); // no host on the flyer: the account that posted it
  assert.match(event.description, /Flyer from @nawfside.tm/);
  const notes = w.calls.filter((c) => (c.path || "").startsWith("/rest/v1/instagram_sources?username")).map((c) => [c.path.split("=eq.")[1], c.body.last_count, Boolean(c.body.last_error)]);
  assert.deepEqual(notes, [["nawfside.tm", 1, false], ["gone.account", null, true]]);
  const rec = w.calls.filter((c) => (c.path || "").startsWith("/rest/v1/instagram_posts?on_conflict")).map((c) => [c.body.media_id, c.body.account]);
  assert.deepEqual(rec, [["own1", "tunr.app"], ["nf1", "nawfside.tm"]]);
  assert.match(w.calls.find((c) => c.path === "/rest/v1/rpc/notify_admins").body.p_body, /@nawfside\.tm/);
});

test("watched accounts with an Instagram-login token say they need the Facebook connection", async () => {
  const w = world({ posts: [], ai: [], sources: ["nawfside.tm"] });
  const out = await createInstagramImport({ service: w.service, env, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.equal(out.ok, true);
  assert.deepEqual(out.accounts, [{ username: "nawfside.tm", error: "needs_facebook" }]);
  assert.match(w.calls.find((c) => (c.path || "").startsWith("/rest/v1/instagram_sources?username")).body.last_error, /Facebook-linked/);
});

test("a Facebook token without the app id and secret says so", async () => {
  const w = world({ posts: [], ai: [], link: { access_token: null } });
  const out = await createInstagramImport({ service: w.service, env: { ...env, INSTAGRAM_ACCESS_TOKEN: "EAAshort" }, fetchImpl: w.fetchImpl, now: () => NOW }).run();
  assert.equal(out.error, "instagram_not_connected");
  assert.match(out.detail, /FACEBOOK_APP_ID and FACEBOOK_APP_SECRET/);
});
