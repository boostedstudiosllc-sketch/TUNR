// GET/POST /api/instagram-sync — import new meets from @tunr.app's Instagram
// (api/_lib/instagram.js). Started by a schedule (vercel.json once a day,
// .github/workflows/instagram.yml every two hours) or by an admin's
// "Check now". If CRON_SECRET is set in Vercel, only the schedule (with that
// secret) or a signed-in admin can start it; without it, anyone can, but at
// most one run every 5 minutes (an admin can always run it).
//
// Returns { ok, checked, imported, held, skipped, failed, left } or
// { ok: false, error, detail }. Errors: not_allowed, too_soon,
// instagram_not_connected, instagram_token_expired, instagram_failed,
// not_configured, push_not_configured.

import { createPushService } from "./_lib/push.js";
import { createInstagramImport } from "./_lib/instagram.js";

const MIN_GAP_MS = 5 * 60 * 1000;

export function createHandler({ env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const service = createPushService({ env, fetchImpl });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }

    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const fromSchedule = Boolean(env.CRON_SECRET) && bearer === env.CRON_SECRET;
    let admin = false;
    if (bearer && !fromSchedule) {
      const who = await fetchImpl(`${service.config.url}/auth/v1/user`, {
        headers: { apikey: env.VITE_SUPABASE_ANON_KEY || service.config.key, Authorization: `Bearer ${bearer}` },
      });
      const user = who.ok ? await who.json() : null;
      if (user?.id) {
        const rows = await service.rest(`/rest/v1/profiles?select=is_admin&id=eq.${user.id}`);
        admin = Boolean(Array.isArray(rows) && rows[0]?.is_admin);
      }
    }
    if (env.CRON_SECRET && !fromSchedule && !admin) return res.status(401).json({ error: "not_allowed" });

    if (!fromSchedule && !admin) {
      const rows = await service.rest("/rest/v1/instagram_link?select=last_run_at&id=eq.true");
      const last = Array.isArray(rows) && rows[0]?.last_run_at ? new Date(rows[0].last_run_at).getTime() : 0;
      if (now().getTime() - last < MIN_GAP_MS) return res.status(429).json({ error: "too_soon" });
    }

    const result = await createInstagramImport({ service, env, fetchImpl, now }).run();
    if (!result.ok) console.error("instagram-sync", result);
    const status = result.ok ? 200 : result.error === "instagram_not_connected" || result.error === "not_configured" ? 503 : 502;
    return res.status(status).json(result);
  };
}

export default createHandler();
