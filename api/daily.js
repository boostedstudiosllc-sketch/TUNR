// GET /api/daily — Vercel Cron, each morning (vercel.json). Three jobs:
//   1. meet-day reminders (api/reminders.js)
//   2. confirm-later email: first emails that didn't send, day-3 reminders,
//      and removing accounts still unconfirmed past their date
//   3. on Saturdays, "keep your streak alive" for streaks with no check-in
//      yet this week (queue_streak_reminders, 054)
// then delivers any alerts that queued. If CRON_SECRET is set in Vercel,
// only Vercel Cron can start it.

import { createPushService } from "./_lib/push.js";
import { createAccounts } from "./_lib/accounts.js";
import { queueMeetReminders } from "./reminders.js";

// Saturdays (Atlanta time) only: the weekend is the last chance to keep a
// streak. Returns how many were queued, or null on other days.
export async function queueStreakReminders(service, now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  if (weekday !== "Sat") return null;
  return service.rest("/rest/v1/rpc/queue_streak_reminders", { method: "POST", body: "{}" });
}

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
      out.reminders = await queueMeetReminders(service, now(), fetchImpl);
    } catch (e) {
      out.remindersError = String(e?.message || e).slice(0, 200);
    }
    try {
      const sent = await queueStreakReminders(service, now());
      if (sent !== null) out.streakReminders = sent;
    } catch (e) {
      out.streaksError = String(e?.message || e).slice(0, 200);
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
    const failed = out.remindersError || out.streaksError || out.accountsError || out.deliveryError;
    if (failed) console.error("daily", out);
    return res.status(failed ? 502 : 200).json(out);
  };
}

export default createHandler();
