// GET /api/reminders — meet-day reminders on their own (the daily cron runs
// them through api/daily.js, in the morning Eastern time). Everyone going to
// a meet that happens today gets "Today: <meet> · 7:00 PM", in the inbox and, if they turned alerts on, on
// their phone. Weekly and monthly meets count on each day they run.
//
// Rough weather (storms, heavy rain, snow, strong wind, real heat or cold)
// is added to the reminder, and the host gets a heads-up of their own.
//
// Safe to run twice: each reminder is one per person, per meet, per day, so a
// second run queues nothing new. If CRON_SECRET is set in Vercel, only Vercel
// Cron (which sends it) can start a run.

import { createPushService } from "./_lib/push.js";
import { isoInTz, isToday, displayTime, todayKey, DEFAULT_TZ } from "../src/lib/dates.js";
import { fetchHourly, meetWindow, summarizeForecast } from "../src/lib/weather.js";

// The meet as the date helpers want it.
const asEvent = (e) => {
  const tz = e.timezone || DEFAULT_TZ;
  return {
    id: e.id,
    title: e.title,
    timezone: tz,
    start: isoInTz(e.start_at, tz),
    end: isoInTz(e.end_at, tz),
    recurrence: e.recurrence,
    recurrenceUntil: e.recurrence_until || null,
  };
};

export function remindersFor(rows, now = new Date()) {
  const items = [];
  for (const row of rows || []) {
    const e = row.events;
    if (!e || e.hidden) continue;
    const tz = e.timezone || DEFAULT_TZ;
    const event = asEvent(e);
    if (!event.start || !isToday(event, now)) continue;
    items.push({
      user_id: row.user_id,
      kind: "meet_reminder",
      title: `Today: ${e.title}`.slice(0, 120),
      body: [displayTime(event), e.city].filter(Boolean).join(" · "),
      link: `meet:${e.id}`,
      dedupe: `meet:${e.id}:${todayKey(now, tz)}`,
    });
  }
  return items;
}

// Weather alerts for today's meets: { [eventId]: "Rain likely (70%)" }.
// A forecast that can't be fetched is skipped, never a failed run.
export async function weatherAlerts(events, now = new Date(), fetchImpl = fetch) {
  const out = {};
  for (const e of events) {
    if (e.lat == null || e.lng == null) continue;
    try {
      const win = meetWindow(asEvent(e), now);
      const wx = win && summarizeForecast(await fetchHourly(e.lat, e.lng, e.timezone || DEFAULT_TZ, fetchImpl), win.start, win.end);
      if (wx?.alert) out[e.id] = { alert: wx.alert, icon: wx.icon };
    } catch (err) {
      console.warn("weather", e.id, err.message);
    }
  }
  return out;
}

// Adds the weather to the reminders, and a heads-up for each meet's host.
export function withWeather(items, events, alerts, now = new Date()) {
  const out = items.map((i) => {
    const w = alerts[i.link.slice("meet:".length)];
    return w ? { ...i, body: `${i.body} · ${w.icon} ${w.alert}`.slice(0, 300) } : i;
  });
  for (const e of events) {
    const w = alerts[e.id];
    if (!w || !e.created_by) continue;
    out.push({
      user_id: e.created_by,
      kind: "meet_weather",
      title: `${w.icon} ${w.alert} for ${e.title}`.slice(0, 120),
      body: "Your crew sees this on the meet page too. If plans change, post an update on the meet.",
      link: `meet:${e.id}`,
      dedupe: `weather:${e.id}:${todayKey(now, e.timezone || DEFAULT_TZ)}`,
    });
  }
  return out;
}

// Queue today's reminders. Returns how many.
export async function queueMeetReminders(service, now = new Date(), fetchImpl = fetch) {
  // Everyone's "going" answers with their meet, a page at a time.
  const rows = [];
  for (let from = 0; from < 50000; from += 1000) {
    const page = await service.rest(
      "/rest/v1/rsvps?status=eq.going&select=user_id,events(id,title,city,start_at,end_at,recurrence,recurrence_until,timezone,hidden,lat,lng,created_by)",
      { headers: { Range: `${from}-${from + 999}` } }
    );
    rows.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  const reminders = remindersFor(rows, now);
  const today = new Set(reminders.map((i) => i.link));
  const events = [...new Map(rows.filter((r) => r.events && today.has(`meet:${r.events.id}`)).map((r) => [r.events.id, r.events])).values()];
  const items = withWeather(reminders, events, await weatherAlerts(events, now, fetchImpl), now);
  for (let i = 0; i < items.length; i += 500) {
    await service.rest("/rest/v1/rpc/notify_many", {
      method: "POST",
      body: JSON.stringify({ p_items: items.slice(i, i + 500) }),
    });
  }
  return items.length;
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
    try {
      const reminders = await queueMeetReminders(service, now(), fetchImpl);
      const delivered = await service.flush();
      return res.status(200).json({ reminders, ...delivered });
    } catch (e) {
      console.error("reminders", e);
      return res.status(502).json({ error: "reminders_failed", detail: String(e?.message || e).slice(0, 200) });
    }
  };
}

export default createHandler();
