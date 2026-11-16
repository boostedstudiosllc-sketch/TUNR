// Offline: what the app keeps on the phone so it's still useful with no
// signal (the games and the parked-car card need nothing; this is for
// meets). After each good load, the meets list and your RSVPs, follows and
// going-as are saved here; when the network fails, they're shown instead,
// marked as saved. Pure apart from the storage passed in; tested in
// test/offline.test.js.

export const snapshotKey = (userId) => `tunr.meets.snapshot.${userId || "guest"}`;
const DAY = 24 * 3600 * 1000;

// Only meets that matter offline: repeating ones, and one-offs from a week
// ago to two months ahead.
export function keepForOffline(events, now = Date.now()) {
  return (events || []).filter((e) => {
    if (e.recurrence && (!e.recurrenceUntil || Date.parse(e.recurrenceUntil) > now - 7 * DAY)) return true;
    const t = Date.parse(e.end || e.start || "");
    return !Number.isFinite(t) || (t > now - 7 * DAY && t < now + 60 * DAY);
  });
}

export function saveSnapshot(storage, userId, { events, rsvps, follows, goingAs }, now = Date.now()) {
  if (!storage) return false;
  const body = { at: now, events: keepForOffline(events, now), rsvps, follows, goingAs };
  try {
    storage.setItem(snapshotKey(userId), JSON.stringify(body));
    return true;
  } catch (e) {
    // Out of room: keep just your own meets.
    try {
      const mine = new Set(Object.keys(rsvps || {}));
      storage.setItem(snapshotKey(userId), JSON.stringify({ ...body, events: body.events.filter((ev) => mine.has(String(ev.id))) }));
      return true;
    } catch (e2) {
      console.warn(`Couldn't save meets for offline. (${e2.message})`);
      return false;
    }
  }
}

export function loadSnapshot(storage, userId) {
  try {
    const raw = storage?.getItem(snapshotKey(userId));
    const s = raw ? JSON.parse(raw) : null;
    return s && Array.isArray(s.events) ? s : null;
  } catch (e) {
    console.warn(`Couldn't read the saved meets. (${e.message})`);
    return null;
  }
}

// "2:14 PM", "yesterday 9:03 PM" or "Nov 3": when the saved meets are from.
export function savedWhen(at, now = Date.now()) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return "";
  const opts = { timeZone: "America/New_York" };
  const day = (x) => new Date(x).toLocaleDateString("en-CA", opts);
  const time = d.toLocaleTimeString("en-US", { ...opts, hour: "numeric", minute: "2-digit" });
  if (day(at) === day(now)) return time;
  if (day(at) === day(now - DAY)) return `yesterday ${time}`;
  return d.toLocaleDateString("en-US", { ...opts, month: "short", day: "numeric" });
}

// The banner's words.
export function offlineLine({ online, savedAt, now = Date.now() }) {
  if (online && !savedAt) return "";
  const meets = savedAt ? ` Meets as of ${savedWhen(savedAt, now)}.` : "";
  return online ? `Couldn't reach TUNR, so these are your saved meets.${meets}` : `You're offline. Games, your parked car and saved meets still work.${meets}`;
}
