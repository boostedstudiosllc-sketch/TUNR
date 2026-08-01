// Date helpers for events. All events are Georgia-local; we treat the ISO
// strings in the data as local wall-clock times.

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function parseLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// For a recurring event, the next occurrence on/after `from`.
// For one-offs, the start date itself (past or not).
export function nextOccurrence(event, from = new Date()) {
  const start = parseLocal(event.start);
  if (!event.recurrence) return start;
  if (!start) return null;

  const [kind, a, b] = event.recurrence.split(":");
  const timeH = start.getHours();
  const timeM = start.getMinutes();

  if (kind === "weekly") {
    const targetDow = DAY_INDEX[a];
    const d = new Date(from);
    d.setHours(timeH, timeM, 0, 0);
    while (d.getDay() !== targetDow || d < from) {
      d.setDate(d.getDate() + 1);
      d.setHours(timeH, timeM, 0, 0);
    }
    return d;
  }

  if (kind === "monthly" && a === "first") {
    const targetDow = DAY_INDEX[b];
    const candidate = firstDowOfMonth(from.getFullYear(), from.getMonth(), targetDow, timeH, timeM);
    if (candidate >= from) return candidate;
    const next = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    return firstDowOfMonth(next.getFullYear(), next.getMonth(), targetDow, timeH, timeM);
  }

  return start;
}

function firstDowOfMonth(year, month, dow, h, m) {
  const d = new Date(year, month, 1, h, m, 0, 0);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

export function displayDate(event) {
  if (!event.start) return "DATE TBC";
  if (event.recurrence) {
    const [kind, a, b] = event.recurrence.split(":");
    if (kind === "weekly") return "EVERY " + dayName(a);
    if (kind === "monthly" && a === "first") return "1ST " + dayName(b) + "/MO";
  }
  const d = parseLocal(event.start);
  return `${DAY_CODES[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function dayName(code) {
  const full = {
    SUN: "SUNDAY", MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY",
    THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY",
  };
  return full[code] || code;
}

export function displayTime(event) {
  if (!event.start) return "TBC";
  const d = parseLocal(event.start);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")} ${ampm}` : `${h}:00 ${ampm}`;
}

export function isToday(event, now = new Date()) {
  const occ = nextOccurrence(event, startOfDay(now));
  if (!occ) return false;
  return sameDay(occ, now);
}

export function isThisWeekend(event, now = new Date()) {
  // Upcoming (or current) Sat/Sun of this week.
  const sat = new Date(now);
  sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  if (now.getDay() === 0) {
    // It's Sunday: the weekend is yesterday+today.
    sun.setTime(startOfDay(now).getTime());
    sat.setTime(sun.getTime() - 24 * 3600 * 1000);
  }
  const occ = nextOccurrence(event, startOfDay(now));
  if (!occ) return false;
  return sameDay(occ, sat) || sameDay(occ, sun);
}

export function isPast(event, now = new Date()) {
  if (event.recurrence) return false;
  const end = parseLocal(event.end) || parseLocal(event.start);
  if (!end) return false; // TBC events aren't "past"
  return end < now;
}

export function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Sort key: soonest upcoming first; TBC dates last.
export function sortKey(event, now = new Date()) {
  const occ = nextOccurrence(event, now);
  if (!occ) return Infinity;
  if (isPast(event, now)) return Infinity - 1;
  return occ.getTime();
}
