// POST /api/confirm-email   (Authorization: Bearer <session>)
//
// Emails the signed-in person a link to confirm their address: right after
// sign-up, and whenever they tap "Resend". Once every 10 minutes at most.
//
// Errors: not_signed_in, confirm_email_wait, push_not_configured (the
// server key is missing), email_send_failed (Supabase refused; `detail`
// says why, e.g. its email limit).

import { createPushService } from "./_lib/push.js";
import { createAccounts } from "./_lib/accounts.js";

const WAIT_MS = 10 * 60000;

export function createHandler({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
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
    if (!user?.id || !user.email) return res.status(401).json({ error: "not_signed_in" });

    try {
      const rows = await service.rest(`/rest/v1/account_status?user_id=eq.${user.id}&select=*`);
      const status = Array.isArray(rows) ? rows[0] : null;
      if (status?.confirmed_at) return res.status(200).json({ confirmed: true });
      if (status?.last_send_at && now() - new Date(status.last_send_at) < WAIT_MS) {
        return res.status(429).json({ error: "confirm_email_wait", detail: "an email was sent in the last 10 minutes" });
      }
      const accounts = createAccounts(service, { now });
      const deleteOn = await accounts.send({
        userId: user.id,
        email: user.email,
        createdAt: user.created_at,
        stage: status?.welcome_sent_at ? "resend" : "welcome",
        existingDeleteOn: status?.delete_on || null,
        reminderSent: Boolean(status?.reminder_sent_at),
      });
      return res.status(200).json({ sent: true, email: user.email, deleteOn });
    } catch (e) {
      console.error("confirm-email", e);
      return res.status(502).json({ error: "email_send_failed", detail: String(e?.message || e).slice(0, 200) });
    }
  };
}

export default createHandler();
