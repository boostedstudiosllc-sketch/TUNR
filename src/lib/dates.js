// Date helpers.
//
// Event times are WALL-CLOCK TIMES AT THE VENUE. A meet listed at 9:00 AM in
// Kennesaw reads "9:00 AM" whether you're in Atlanta or Tokyo, so every
// format/compare here runs in the event's own timezone, never the viewer's.
//
// `event.start` is a bare "YYYY-MM-DDTHH:MM" (wall clock, no offset) and
// `event.timezone` names the zone it belongs to.

export const DEFAULT_TZ = "America/New_York";

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
// Offsets from the first matching weekday of the month; "last" is handled
// separately since it counts backwards.
const NTH_INDEX = { first: 0, second: 1, third: 2, fourth: 3, last: -1 };
const NTH_LABELS = { first: "1ST", second: "2ND", third: "3RD", fourth: "4TH", last: "LAST" };

const DAY_NAMES = {
  SUN: "SUNDAY", MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY",
  THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY",
};
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function tzOf(event) {
  return (event && event.timezone) || DEFAULT_TZ;
}

// Minutes the zone is ahead of UTC at that instant (handles DST).
function tzOffsetMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour % 24), Number(parts.minute), Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

// Real instant for a wall-clock time in a zone.
function instantFrom(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const off = tzOffsetMinutes(new Date(guess), tz);
  const first = new Date(guess - off * 60000);
  // Re-check once: handles the hour on either side of a DST transition.
  const off2 = tzOffsetMinutes(first, tz);
  return off2 === off ? first : new Date(guess - off2 * 60000);
}

// The calendar/clock fields of `event.start`, as written.
function wallParts(event) {
  if (!event || !event.start) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(event.start);
  if (!m) return null;
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    h: m[4] === undefined ? 12 : Number(m[4]),
    min: m[5] === undefined ? 0 : Number(m[5]),
  };
}

// "YYYY-MM-DD" for an instant, in the given zone.
function dayKeyInTz(date, tz) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {});
  return `${p.year}-${p.month}-${p.day}`;
}

function dowInTz(date, tz) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" })
    .format(date)
    .toUpperCase();
  return DAY_INDEX[name.slice(0, 3)];
}

function keyToParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function addDaysToKey(key, n) {
  const { y, m, d } = keyToParts(key);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dowOfKey(key) {
  const { y, m, d } = keyToParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function parseLocal(iso, tz = DEFAULT_TZ) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  return instantFrom(
    Number(m[1]), Number(m[2]), Number(m[3]),
    m[4] === undefined ? 12 : Number(m[4]),
    m[5] === undefined ? 0 : Number(m[5]),
    tz
  );
}

// The day (YYYY-MM-DD in event tz) this event next happens on/after `from`.
// A seasonal series (a summer cruise-in, a run that pauses for winter) stops
// after its last date. Past that there is no next occurrence, and the meet
// drops off the feed until someone sets the new season.
function inSeason(event, key) {
  return !event.recurrenceUntil || key <= event.recurrenceUntil;
}

export function nextOccurrenceKey(event, from = new Date()) {
  const parts = wallParts(event);
  if (!parts) return null;
  const tz = tzOf(event);
  const startKey = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;

  if (!event.recurrence) return startKey;

  const todayKey = dayKeyInTz(from, tz);
  const [kind, a, b] = event.recurrence.split(":");

  if (kind === "weekly") {
    const target = DAY_INDEX[a];
    let key = todayKey;
    for (let i = 0; i < 8; i++) {
      if (dowOfKey(key) === target && key >= todayKey) return inSeason(event, key) ? key : null;
      key = addDaysToKey(key, 1);
    }
    return startKey;
  }

  if (kind === "monthly" && NTH_INDEX[a] !== undefined) {
    const target = DAY_INDEX[b];
    const { y, m } = keyToParts(todayKey);
    for (const [yy, mm] of [
      [y, m],
      [m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1],
    ]) {
      const key = nthWeekdayOfMonth(yy, mm, target, a);
      if (key && key >= todayKey) return inSeason(event, key) ? key : null;
    }
    return startKey;
  }

  return startKey;
}

// "second Sunday of August 2026" -> "2026-08-09". `nth` is first/second/
// third/fourth/last; a month without a fifth Tuesday simply has no answer.
function nthWeekdayOfMonth(year, month, targetDow, nth) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (nth === "last") {
    let key = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
    for (let i = 0; i < 7; i++) {
      if (dowOfKey(key) === targetDow) return key;
      key = addDaysToKey(key, -1);
    }
    return null;
  }

  let key = first;
  for (let i = 0; i < 7; i++) {
    if (dowOfKey(key) === targetDow) break;
    key = addDaysToKey(key, 1);
  }
  key = addDaysToKey(key, 7 * NTH_INDEX[nth]);
  return Number(key.slice(8)) <= daysInMonth && key.slice(0, 7) === first.slice(0, 7)
    ? key
    : null;
}

// Every day ("YYYY-MM-DD", venue time) the meet happens in a calendar month
// (month is 1–12). A series counts from its first date and stops at the end
// of its season; a one-off is just its own date.
export function occurrencesInMonth(event, year, month) {
  const parts = wallParts(event);
  if (!parts) return [];
  const startKey = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const keep = (key) => key >= startKey && inSeason(event, key);

  if (!event.recurrence) return startKey.startsWith(prefix) ? [startKey] : [];

  const [kind, a, b] = event.recurrence.split(":");
  if (kind === "weekly" && DAY_INDEX[a] !== undefined) {
    const days = [];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${prefix}-${String(d).padStart(2, "0")}`;
      if (dowOfKey(key) === DAY_INDEX[a] && keep(key)) days.push(key);
    }
    return days;
  }
  if (kind === "monthly" && NTH_INDEX[a] !== undefined && DAY_INDEX[b] !== undefined) {
    const key = nthWeekdayOfMonth(year, month, DAY_INDEX[b], a);
    return key && keep(key) ? [key] : [];
  }
  return startKey.startsWith(prefix) ? [startKey] : [];
}

// A meet with no end time is assumed to run this long.
const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000;

function occursOnKey(event, key, startKey) {
  if (!event.recurrence) return key === startKey;
  if (key < startKey || !inSeason(event, key)) return false;
  const [kind, a, b] = event.recurrence.split(":");
  if (kind === "weekly") return dowOfKey(key) === DAY_INDEX[a];
  if (kind === "monthly" && NTH_INDEX[a] !== undefined) {
    const { y, m } = keyToParts(key);
    return nthWeekdayOfMonth(y, m, DAY_INDEX[b], a) === key;
  }
  return key === startKey;
}

// The meet's start and end instants for each time it overlaps [from, to].
// A zero-length window (from === to) means "on at that moment".
export function occurrencesBetween(event, from, to) {
  const parts = wallParts(event);
  if (!parts || !(from instanceof Date) || !(to instanceof Date) || to < from) return [];
  const tz = tzOf(event);
  const startKey = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
  const end = event.end ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(event.end) : null;

  const found = [];
  // Start the day before, for a meet that runs past midnight into the window.
  let key = addDaysToKey(dayKeyInTz(from, tz), -1);
  const lastKey = dayKeyInTz(to, tz);
  for (let i = 0; i < 31 && key <= lastKey; i++, key = addDaysToKey(key, 1)) {
    if (!occursOnKey(event, key, startKey)) continue;
    const { y, m, d } = keyToParts(key);
    const start = instantFrom(y, m, d, parts.h, parts.min, tz);
    let finish;
    if (end && !event.recurrence) {
      finish = instantFrom(
        Number(end[1]), Number(end[2]), Number(end[3]),
        end[4] === undefined ? 23 : Number(end[4]),
        end[5] === undefined ? 59 : Number(end[5]),
        tz
      );
    } else if (end && end[4] !== undefined) {
      finish = instantFrom(y, m, d, Number(end[4]), Number(end[5]), tz);
      if (finish <= start) finish = new Date(finish.getTime() + 24 * 60 * 60 * 1000);
    } else {
      finish = new Date(start.getTime() + DEFAULT_DURATION_MS);
    }
    if (start <= to && finish > from) found.push({ start, end: finish });
  }
  return found;
}

export function occursBetween(event, from, to) {
  return occurrencesBetween(event, from, to).length > 0;
}

// Preset windows for "when", in Atlanta time. Returns { from, to } or null
// for "any time". custom: { date: "YYYY-MM-DD", from: "HH:MM", to: "HH:MM" };
// a "to" at or before "from" runs past midnight.
export function timeWindow(preset, now = new Date(), custom = null, tz = DEFAULT_TZ) {
  const today = dayKeyInTz(now, tz);
  const at = (key, h, min = 0) => {
    const { y, m, d } = keyToParts(key);
    return instantFrom(y, m, d, h, min, tz);
  };
  switch (preset) {
    case "now":
      return { from: now, to: now };
    case "2h":
      return { from: now, to: new Date(now.getTime() + 2 * 60 * 60 * 1000) };
    case "tonight": {
      const evening = at(today, 17);
      return { from: now > evening ? now : evening, to: at(addDaysToKey(today, 1), 3) };
    }
    case "tomorrow": {
      const t = addDaysToKey(today, 1);
      return { from: at(t, 0), to: at(t, 23, 59) };
    }
    case "weekend": {
      const dow = dowInTz(now, tz);
      // Friday 5 PM to Sunday 11:59 PM of this week (or the current one).
      const friKey = dow === 6 ? addDaysToKey(today, -1) : dow === 0 ? addDaysToKey(today, -2) : addDaysToKey(today, 5 - dow);
      const fri = at(friKey, 17);
      return { from: now > fri ? now : fri, to: at(addDaysToKey(friKey, 2), 23, 59) };
    }
    case "custom": {
      if (!custom || !/^\d{4}-\d{2}-\d{2}$/.test(custom.date || "")) return null;
      const [fh, fm] = (custom.from || "00:00").split(":").map(Number);
      const [th, tm] = (custom.to || "23:59").split(":").map(Number);
      const from = at(custom.date, fh, fm);
      let to = at(custom.date, th, tm);
      if (to <= from) to = at(addDaysToKey(custom.date, 1), th, tm);
      return { from, to };
    }
    default:
      return null;
  }
}

// "YYYY-MM-DD" for today in Atlanta, for calendar highlighting.
export function todayKey(now = new Date(), tz = DEFAULT_TZ) {
  return dayKeyInTz(now, tz);
}

export function nextOccurrence(event, from = new Date()) {
  const parts = wallParts(event);
  const key = nextOccurrenceKey(event, from);
  if (!parts || !key) return null;
  const { y, m, d } = keyToParts(key);
  return instantFrom(y, m, d, parts.h, parts.min, tzOf(event));
}

export function displayDate(event) {
  if (!event || !event.start) return "DATE TBC";
  if (event.recurrence) {
    const [kind, a, b] = event.recurrence.split(":");
    if (kind === "weekly") return "EVERY " + (DAY_NAMES[a] || a);
    if (kind === "monthly" && NTH_LABELS[a]) {
      return `${NTH_LABELS[a]} ${DAY_NAMES[b] || b}/MO`;
    }
  }
  const p = wallParts(event);
  if (!p) return "DATE TBC";
  const key = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return `${DAY_CODES[dowOfKey(key)]} ${MONTHS[p.m - 1]} ${p.d}`;
}

export function displayTime(event) {
  const p = wallParts(event);
  if (!p) return "TBC";
  const ampm = p.h >= 12 ? "PM" : "AM";
  const h12 = p.h % 12 || 12;
  return `${h12}:${String(p.min).padStart(2, "0")} ${ampm}`;
}

export function isToday(event, now = new Date()) {
  const key = nextOccurrenceKey(event, now);
  if (!key) return false;
  return key === dayKeyInTz(now, tzOf(event));
}

export function isThisWeekend(event, now = new Date()) {
  const key = nextOccurrenceKey(event, now);
  if (!key) return false;
  const tz = tzOf(event);
  const todayKey = dayKeyInTz(now, tz);
  const todayDow = dowInTz(now, tz);

  // Saturday and Sunday of the current week (Sunday counts its own weekend).
  const satKey = todayDow === 0 ? addDaysToKey(todayKey, -1) : addDaysToKey(todayKey, 6 - todayDow);
  const sunKey = addDaysToKey(satKey, 1);
  return key === satKey || key === sunKey;
}

export function isPast(event, now = new Date()) {
  if (!event) return false;
  // A recurring meet is only over when its season has ended.
  if (event.recurrence) {
    return Boolean(event.recurrenceUntil) && nextOccurrenceKey(event, now) === null;
  }
  if (!event.start) return false; // date TBC events are never "past"
  const tz = tzOf(event);
  const endSrc = event.end || event.start;
  const p = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(endSrc);
  if (!p) return false;
  const end = instantFrom(
    Number(p[1]), Number(p[2]), Number(p[3]),
    p[4] === undefined ? 23 : Number(p[4]),
    p[5] === undefined ? 59 : Number(p[5]),
    tz
  );
  return end < now;
}

// When the next occurrence finishes. For a recurring meet the end time-of-day
// is taken from `event.end` and applied to the occurrence's own day; without
// an end we assume it runs until midnight.
function occurrenceEnd(event, now = new Date()) {
  const key = nextOccurrenceKey(event, now);
  if (!key) return null;
  const tz = tzOf(event);
  const e = event.end
    ? /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(event.end)
    : null;

  if (!e) {
    const { y, m, d } = keyToParts(key);
    return instantFrom(y, m, d, 23, 59, tz);
  }

  // One-off meets can span days, so use the end date as written.
  if (!event.recurrence) {
    return instantFrom(
      Number(e[1]), Number(e[2]), Number(e[3]),
      e[4] === undefined ? 23 : Number(e[4]),
      e[5] === undefined ? 59 : Number(e[5]),
      tz
    );
  }

  const { y, m, d } = keyToParts(key);
  return instantFrom(
    y, m, d,
    e[4] === undefined ? 23 : Number(e[4]),
    e[5] === undefined ? 59 : Number(e[5]),
    tz
  );
}

export function isHappeningNow(event, now = new Date()) {
  const start = nextOccurrence(event, now);
  const end = occurrenceEnd(event, now);
  if (!start || !end) return false;
  return start <= now && now <= end;
}

// Short countdown for a meet that's close enough for it to mean something.
// Null past a day out — the date line already says what's needed.
export function startsInLabel(event, now = new Date()) {
  const start = nextOccurrence(event, now);
  if (!start) return null;
  if (isHappeningNow(event, now)) return "ON NOW";

  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (minutes < 0) return null;
  if (minutes < 1) return "STARTING NOW";
  if (minutes < 60) return `IN ${minutes} MIN`;

  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return null;
  const rest = minutes % 60;
  return rest ? `IN ${hours}H ${rest}M` : `IN ${hours}H`;
}

export function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Soonest upcoming first; date-TBC last.
export function sortKey(event, now = new Date()) {
  const occ = nextOccurrence(event, now);
  if (!occ) return Number.MAX_SAFE_INTEGER;
  if (isPast(event, now)) return Number.MAX_SAFE_INTEGER - 1;
  return occ.getTime();
}
