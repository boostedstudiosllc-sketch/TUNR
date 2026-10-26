// How a linkup's timing reads: "Starting now", "In 35 min", "Tomorrow · 9:00 AM",
// "Live · until 9:15 PM". Plus picking a start time on the linkup form.
const TZ = "America/New_York";
const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });

// A linkup can start any time today or tomorrow (the database holds the
// same limit, 074_linkup_start_time.sql).
export const LINKUP_DAYS = ["today", "tomorrow"];
export const MINUTE_STEP = 5;

// "Today", "Tomorrow", or the weekday.
export function dayWord(iso, now = new Date()) {
  const k = dayKey(iso);
  if (k === dayKey(now)) return "Today";
  if (k === dayKey(now.getTime() + 864e5)) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
}

// The wheel's hour (1-12), minute and AM/PM on that day, as a Date (the
// phone's own clock, which is Georgia time for TUNR's people).
export function pickedStart({ day, hour, minute, ampm }, now = new Date()) {
  const d = new Date(now);
  if (day === "tomorrow") d.setDate(d.getDate() + 1);
  const h24 = (Number(hour) % 12) + (ampm === "PM" ? 12 : 0);
  d.setHours(h24, Number(minute) || 0, 0, 0);
  return d;
}

// The wheel's starting position: about half an hour from now, on the next
// 5 minutes (tomorrow if that's past midnight).
export function defaultPick(now = new Date()) {
  const t = new Date(now.getTime() + 30 * 60000);
  const step = MINUTE_STEP * 60000;
  const at = new Date(Math.ceil(t.getTime() / step) * step);
  const h = at.getHours();
  return {
    day: at.getDate() === now.getDate() ? "today" : "tomorrow",
    hour: h % 12 || 12,
    minute: at.getMinutes(),
    ampm: h >= 12 ? "PM" : "AM",
  };
}

// null when that start works; otherwise what's wrong.
export function startProblem(start, now = new Date()) {
  if (start.getTime() < now.getTime() - 5 * 60000) {
    return `${clock(start.toISOString())} today has already passed. Pick a later time, or Tomorrow.`;
  }
  return null;
}

export function linkupStatus(linkup, now = new Date()) {
  const start = new Date(linkup.startsAt).getTime();
  const end = new Date(linkup.endsAt).getTime();
  const t = now.getTime();
  if (linkup.cancelled) return { live: false, over: true, text: "Cancelled" };
  if (t >= end) return { live: false, over: true, text: "Ended" };
  if (t >= start) return { live: true, over: false, text: `Live · until ${clock(linkup.endsAt)}` };
  const mins = Math.round((start - t) / 60000);
  if (mins <= 2) return { live: true, over: false, text: "Starting now" };
  const soon = untilWords(linkup.startsAt, now);
  return { live: false, over: false, text: `${soon || dayWord(linkup.startsAt, now)} · ${clock(linkup.startsAt)}` };
}

// "In 35 min" or "In 2 hr 10 min" when it's under 3 hours off; otherwise null
// (say the day and time instead).
export function untilWords(iso, now = new Date()) {
  const mins = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (mins < 1 || mins >= 180) return null;
  if (mins < 60) return `In ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `In ${h} hr${m ? ` ${m} min` : ""}`;
}

// Mine first (hosting, in, asked), then the rest nearest-first if we know
// where you are, otherwise soonest-first.
export function sortLinkups(list, distanceOf) {
  const rank = (l) => (l.myRole === "host" ? 0 : l.myRole === "in" ? 1 : l.myRole === "requested" ? 2 : 3);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const da = distanceOf(a);
    const db = distanceOf(b);
    if (da != null && db != null && Math.abs(da - db) > 0.5) return da - db;
    return new Date(a.startsAt) - new Date(b.startsAt);
  });
}
