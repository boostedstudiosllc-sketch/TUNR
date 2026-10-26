import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { passwordProblem, passwordChecks } from "../src/lib/passwordRules.js";
import { createHandler as signInHandler } from "../api/sign-in.js";
import { createHandler as passwordHandler } from "../api/password.js";

const env = { VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" };
const res = () => ({ statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status });

test("passwords need 8+ characters and 3 of the 4 kinds", () => {
  assert.match(passwordProblem("Ab1!"), /at least 8/);
  assert.match(passwordProblem("abcdefgh"), /3 of the 4/);
  assert.match(passwordProblem("abcdefg1"), /Mix in 1 more/);
  assert.equal(passwordProblem("abcdefG1"), null); // lower, upper, number
  assert.equal(passwordProblem("abcdefg!1"), null); // lower, symbol, number
  assert.equal(passwordProblem("ABCDEF!@"), passwordProblem("ABCDEF!@")); // upper + symbol only
  assert.match(passwordProblem("ABCDEF!@"), /Mix in 1 more/);
  assert.match(passwordProblem("Aa1!".repeat(20)), /72 characters or fewer/);
  assert.equal(passwordChecks("Aa1!xxxx").kindsMet, 4);
});

// A fake Supabase: the login_failures rules from 069, and a password check.
function fakeSupabase({ realPassword = "Right123!" } = {}) {
  const rows = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://p.supabase.co", "");
    const body = init.body ? JSON.parse(init.body) : {};
    calls.push(path);
    if (path === "/auth/v1/token?grant_type=password") {
      return body.password === realPassword
        ? json({ access_token: "at", refresh_token: "rt", expires_in: 3600 })
        : json({ error: "invalid_grant", error_code: "invalid_credentials", error_description: "Invalid login credentials" }, 400);
    }
    if (path === "/rest/v1/rpc/login_locked") {
      const r = rows.get(body.p_key);
      return json(r?.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0);
    }
    if (path === "/rest/v1/rpc/login_failed") {
      const r = rows.get(body.p_key) || { failures: 0 };
      r.failures += 1;
      let locked = 0;
      if (r.failures >= body.p_max) {
        r.until = Date.now() + body.p_minutes * 60000;
        locked = body.p_minutes;
        r.failures = 0;
      }
      rows.set(body.p_key, r);
      return json({ failures: locked ? body.p_max : r.failures, locked_minutes: locked });
    }
    if (path === "/rest/v1/rpc/login_ok") {
      rows.delete(body.p_key);
      return json(null);
    }
    throw new Error("unexpected " + path);
  };
  return { fetchImpl, rows, calls };
}

test("10 wrong passwords in a row lock the account for 30 minutes; a right one clears the count", async () => {
  const fake = fakeSupabase();
  const handler = signInHandler({ env, fetchImpl: fake.fetchImpl });
  const signIn = async (password, email = "Karan@X.com") => {
    const r = res();
    await handler({ method: "POST", headers: { "x-forwarded-for": "1.2.3.4" }, body: { email, password } }, r);
    return r;
  };
  let r = await signIn("nope");
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { error: "bad_login", left: 9 });
  // A right password resets the count.
  r = await signIn("Right123!");
  assert.equal(r.body.access_token, "at");
  for (let i = 1; i <= 9; i++) assert.equal((await signIn("nope")).body.left, 10 - i);
  r = await signIn("nope");
  assert.equal(r.statusCode, 423);
  assert.deepEqual(r.body, { error: "account_locked", minutes: 30 });
  // Locked: even the right password waits (emails are matched case-blind).
  r = await signIn("Right123!", "karan@x.com");
  assert.equal(r.body.error, "account_locked");
  // Another account from elsewhere is fine.
  const other = signInHandler({ env, fetchImpl: fake.fetchImpl });
  const r2 = res();
  await other({ method: "POST", headers: { "x-forwarded-for": "5.6.7.8" }, body: { email: "a@b.co", password: "Right123!" } }, r2);
  assert.equal(r2.body.access_token, "at");
  assert.equal((await signIn("")).body.error, "missing_fields");
});

test("a new password must meet the policy and not be one of the last 24", async () => {
  const old = await bcrypt.hash("Before123!", 4);
  const current = await bcrypt.hash("Current123!", 4);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://p.supabase.co", "");
    calls.push(`${init.method || "GET"} ${path}`);
    if (path === "/auth/v1/user") return json({ id: "u1", email: "K@x.com" });
    if (path === "/rest/v1/rpc/password_hashes") return json([current, old]);
    if (path === "/rest/v1/rpc/remember_password" || path === "/rest/v1/rpc/login_ok") return json(null);
    if (path === "/auth/v1/admin/users/u1") return json({ id: "u1" });
    throw new Error("unexpected " + path);
  };
  const handler = passwordHandler({ env, fetchImpl });
  const change = async (password, auth = "Bearer t") => {
    const r = res();
    await handler({ method: "POST", headers: auth ? { authorization: auth } : {}, body: { password } }, r);
    return r;
  };
  assert.equal((await change("Fresh123!", null)).body.error, "not_signed_in");
  assert.equal((await change("short")).body.error, "weak_password");
  assert.equal((await change("Current123!")).body.error, "password_reused");
  assert.equal((await change("Before123!")).body.error, "password_reused");
  assert.equal(calls.filter((c) => c.includes("admin/users")).length, 0);
  const ok = await change("Fresh123!");
  assert.deepEqual(ok.body, { changed: true });
  // The old one is kept before the change, and any sign-in lock is cleared.
  const order = calls.slice(-3);
  assert.deepEqual(order, ["POST /rest/v1/rpc/remember_password", "PUT /auth/v1/admin/users/u1", "POST /rest/v1/rpc/login_ok"]);
});
