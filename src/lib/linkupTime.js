// How a linkup's timing reads: "Starting now", "In 35 min", "Live · until 9:15 PM".
const clock = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function linkupStatus(linkup, now = new Date()) {
  const start = new Date(linkup.startsAt).getTime();
  const end = new Date(linkup.endsAt).getTime();
  const t = now.getTime();
  if (linkup.cancelled) return { live: false, over: true, text: "Cancelled" };
  if (t >= end) return { live: false, over: true, text: "Ended" };
  if (t >= start) return { live: true, over: false, text: `Live · until ${clock(linkup.endsAt)}` };
  const mins = Math.round((start - t) / 60000);
  if (mins <= 2) return { live: true, over: false, text: "Starting now" };
  if (mins < 60) return { live: false, over: false, text: `In ${mins} min · ${clock(linkup.startsAt)}` };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { live: false, over: false, text: `In ${h} hr${m ? ` ${m} min` : ""} · ${clock(linkup.startsAt)}` };
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
