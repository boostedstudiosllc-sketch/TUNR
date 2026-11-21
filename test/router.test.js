import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import handler, { ROUTE_NAMES } from "../api/[route].js";

// Vercel's free plan deploys at most 12 functions; every file directly in
// api/ (and its folders not starting with "_") is one. Over 12, every
// deploy fails (Nov 2026: the site stopped updating for two weeks).
test("the app deploys as at most 12 Vercel functions", () => {
  const count = (dir) =>
    readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
      if (e.name.startsWith("_") || e.name.startsWith(".")) return n;
      if (e.isDirectory()) return n + count(`${dir}/${e.name}`);
      return n + (/\.(js|mjs|ts)$/.test(e.name) ? 1 : 0);
    }, 0);
  assert.ok(count("api") <= 12, `api/ has ${count("api")} functions; put new routes in api/_routes/ and list them in api/[route].js`);
});

test("every route in api/_routes is reachable", () => {
  const files = readdirSync("api/_routes").filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
  assert.deepEqual([...ROUTE_NAMES].sort(), files.sort());
});

test("unknown routes get a 404, known ones reach their handler", async () => {
  const res = () => {
    const r = { code: 0, body: null, headers: {} };
    r.status = (c) => ((r.code = c), r);
    r.json = (b) => ((r.body = b), r);
    r.setHeader = (k, v) => (r.headers[k] = v);
    return r;
  };
  let r = res();
  await handler({ query: { route: "constructor" }, method: "GET", headers: {} }, r);
  assert.deepEqual([r.code, r.body.error], [404, "not_found"]);
  r = res();
  await handler({ query: { route: "shop" }, method: "GET", headers: {} }, r);
  assert.equal(r.code, 405, "the shop route answered (GET isn't allowed there)");
});
