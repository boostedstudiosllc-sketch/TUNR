// GET /api/daily — Vercel Cron, each morning (vercel.json). Three jobs:
//   1. meet-day reminders (api/_routes/reminders.js)
//   2. confirm-later email: first emails that didn't send, day-3 reminders,
//      and removing accounts still unconfirmed past their date
//   3. on Saturdays, "keep your streak alive" for streaks with no check-in
//      yet this week (queue_streak_reminders, 054)
//   4. meet awards: tell the winners of any vote that closed (127)
//   5. Boost Day (132): Sunday picks next week's day; the morning alert
// then delivers any alerts that queued. If CRON_SECRET is set in Vercel,
// only Vercel Cron can start it.

import { createPushService } from "../_lib/push.js";
import { createAccounts } from "../_lib/accounts.js";
import { queueMeetReminders } from "./reminders.js";

// Boost Day (132): on Sundays (Atlanta time) pick next week's day; every
// day, send the morning alert if today is it (the database does it once).
export async function runBoost(service, now = new Date()) {
  const out = {};
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  if (weekday === "Sun") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now); // YYYY-MM-DD
    const monday = new Date(`${today}T12:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + 1);
    out.picked = await service.rest("/rest/v1/rpc/pick_boost_day", { method: "POST", body: JSON.stringify({ p_monday: monday.toISOString().slice(0, 10) }) });
  }
  out.alerted = await service.rest("/rest/v1/rpc/boost_morning_alerts", { method: "POST", body: "{}" });
  return out;
}

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
      out.boost = await runBoost(service, now());
    } catch (e) {
      out.boostError = String(e?.message || e).slice(0, 200);
    }
    try {
      // Meet awards (127): announce winners of any vote that closed.
      out.awardsAnnounced = await service.rest("/rest/v1/rpc/finish_all_meet_awards", { method: "POST", body: "{}" });
    } catch (e) {
      out.awardsError = String(e?.message || e).slice(0, 200);
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
