// GET /api/daily — Vercel Cron, each morning (vercel.json). Two jobs:
//   1. meet-day reminders (api/reminders.js)
//   2. confirm-later email: first emails that didn't send, day-3 reminders,
//      and removing accounts still unconfirmed past their date
// then delivers any alerts that queued. If CRON_SECRET is set in Vercel,
// only Vercel Cron can start it.

import { createPushService } from "./_lib/push.js";
import { createAccounts } from "./_lib/accounts.js";
import { queueMeetReminders } from "./reminders.js";

export function createHandler({ env = process.env, fetchImpl = fetch, webpushImpl, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (env.CRON_SECRET && req.headers.authorization !== `Bearer ${env.CRON_SECRET}`) {
      return res.status(401).json({ error: "bad_cron_secret" });
    }
    const service = createPushService({ env, fetchImpl, ...(webpushImpl ? { webpushImpl } : {}) });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }
    const out = {};
    try {
      out.reminders = await queueMeetReminders(service, now());
    } catch (e) {
      out.remindersError = String(e?.message || e).slice(0, 200);
    }
    try {
      out.accounts = await createAccounts(service, { now }).runDaily();
    } catch (e) {
      out.accountsError = String(e?.message || e).slice(0, 200);
    }
    try {
      out.delivered = await service.flush();
    } catch (e) {
      out.deliveryError = String(e?.message || e).slice(0, 200);
    }
    const failed = out.remindersError || out.accountsError || out.deliveryError;
    if (failed) console.error("daily", out);
    return res.status(failed ? 502 : 200).json(out);
  };
}

export default createHandler();
