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
      if (dowOfKey(key) === target && key >= todayKey) return key;
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
      if (key && key >= todayKey) return key;
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
  if (event.recurrence) return false;
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
