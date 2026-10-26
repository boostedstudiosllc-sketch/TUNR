// POST /api/sign-in   Body: { email, password }
//
// Signs in with email and password through TUNR's server, so the password
// policy's lockout holds (src/lib/passwordRules.js): 10 wrong passwords in
// a row lock that account for 30 minutes. A network address that gets 50
// wrong in a row is paused the same way, so one source can't work through
// many accounts. Counts live in login_failures (069_password_policy.sql).
//
// On success: Supabase's session ({ access_token, refresh_token, … }), which
// the app hands to supabase.auth.setSession.
// Errors: method_not_allowed, missing_fields, account_locked (`minutes`),
// too_many_tries (`minutes`), bad_login (`left` = tries before the lock),
// sign_in_failed (`detail` says why), push_not_configured.

import { createPushService } from "./_lib/push.js";
import { LOCKOUT_TRIES, LOCKOUT_MINUTES } from "../src/lib/passwordRules.js";

const IP_TRIES = 50;

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const service = createPushService({ env, fetchImpl });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }
    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return res.status(400).json({ error: "missing_fields" });

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const emailKey = `email:${email}`;
    const ipKey = `ip:${ip}`;
    const rpc = (fn, args) => service.rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

    try {
      const emailLock = await rpc("login_locked", { p_key: emailKey });
      if (emailLock > 0) return res.status(423).json({ error: "account_locked", minutes: emailLock });
      const ipLock = await rpc("login_locked", { p_key: ipKey });
      if (ipLock > 0) return res.status(429).json({ error: "too_many_tries", minutes: ipLock });

      const auth = await fetchImpl(`${service.config.url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: env.VITE_SUPABASE_ANON_KEY || service.config.key, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const session = await auth.json().catch(() => ({}));
      if (auth.ok && session.access_token) {
        await rpc("login_ok", { p_key: emailKey });
        await rpc("login_ok", { p_key: ipKey });
        return res.status(200).json(session);
      }
      const code = session.error_code || session.code || session.error || "";
      if (auth.status === 400 && /invalid_credentials|invalid_grant/.test(code)) {
        const counted = await rpc("login_failed", { p_key: emailKey, p_max: LOCKOUT_TRIES, p_minutes: LOCKOUT_MINUTES });
        await rpc("login_failed", { p_key: ipKey, p_max: IP_TRIES, p_minutes: LOCKOUT_MINUTES });
        if (counted?.locked_minutes) return res.status(423).json({ error: "account_locked", minutes: counted.locked_minutes });
        return res.status(401).json({ error: "bad_login", left: Math.max(0, LOCKOUT_TRIES - (counted?.failures || 0)) });
      }
      // Anything else (Supabase's own limits, a banned account): say what it said.
      return res.status(auth.status >= 400 ? auth.status : 502).json({
        error: "sign_in_failed",
        code,
        detail: String(session.msg || session.error_description || session.message || `HTTP ${auth.status}`).slice(0, 200),
      });
    } catch (e) {
      console.error("sign-in", e);
      return res.status(502).json({ error: "sign_in_failed", detail: String(e?.message || e).slice(0, 200) });
    }
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

export default createHandler();
