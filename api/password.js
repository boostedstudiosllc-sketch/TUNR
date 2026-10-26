// POST /api/password   (Authorization: Bearer <session>)   Body: { password }
//
// Changes the signed-in person's password (from Settings, or after a reset
// link signed them in), holding to the password policy
// (src/lib/passwordRules.js): at least 8 characters, 3 of the 4 kinds, and
// none of their last 24 passwords. The old password's hash is kept
// (remember_password, 069_password_policy.sql) before the change, and a
// successful change clears any sign-in lock on the account.
//
// Errors: method_not_allowed, not_signed_in, weak_password (`detail` says
// what's missing), password_reused, password_failed (`detail` says why),
// push_not_configured.

import bcrypt from "bcryptjs";
import { createPushService } from "./_lib/push.js";
import { passwordProblem } from "../src/lib/passwordRules.js";

export function createHandler({ env = process.env, fetchImpl = fetch, compare = bcrypt.compare } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const service = createPushService({ env, fetchImpl });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "not_signed_in" });
    const who = await fetchImpl(`${service.config.url}/auth/v1/user`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY || service.config.key, Authorization: `Bearer ${token}` },
    });
    const user = who.ok ? await who.json() : null;
    if (!user?.id) return res.status(401).json({ error: "not_signed_in" });

    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const password = String(body.password || "");
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: "weak_password", detail: problem });

    const rpc = (fn, args) => service.rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
    try {
      const hashes = (await rpc("password_hashes", { p_user: user.id })) || [];
      for (const h of hashes) {
        const hash = typeof h === "string" ? h : h?.password_hashes;
        if (hash && (await compare(password, hash))) return res.status(400).json({ error: "password_reused" });
      }
      await rpc("remember_password", { p_user: user.id });
      await service.rest(`/auth/v1/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ password }) });
      if (user.email) await rpc("login_ok", { p_key: `email:${String(user.email).toLowerCase()}` });
      return res.status(200).json({ changed: true });
    } catch (e) {
      console.error("password", e);
      return res.status(502).json({ error: "password_failed", detail: String(e?.message || e).slice(0, 200) });
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
