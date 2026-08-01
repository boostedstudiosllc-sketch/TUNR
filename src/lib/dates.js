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

  if (kind === "monthly" && a === "first") {
    const target = DAY_INDEX[b];
    const { y, m } = keyToParts(todayKey);
    for (const [yy, mm] of [
      [y, m],
      [m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1],
    ]) {
      let key = `${yy}-${String(mm).padStart(2, "0")}-01`;
      for (let i = 0; i < 7; i++) {
        if (dowOfKey(key) === target) break;
        key = addDaysToKey(key, 1);
      }
      if (key >= todayKey) return key;
    }
    return startKey;
  }

  return startKey;
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
    if (kind === "monthly" && a === "first") return "1ST " + (DAY_NAMES[b] || b) + "/MO";
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
