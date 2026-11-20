// Promoted meets (120_meet_promotions.sql): marking and pinning them in the
// Discover list, and prices in words. Pure, tested in test/promote.test.js.

// Adds `promoted` ("featured" | "spotlight") to the meets that have one live.
// promoted: [{ event_id, package, banner, ends_at }] from promoted_meets().
export function withPromoted(events, promoted) {
  const by = new Map((promoted || []).map((p) => [p.event_id, p]));
  if (!by.size) return events;
  return (events || []).map((e) => (by.has(e.id) ? { ...e, promoted: by.get(e.id).package, promotedBanner: Boolean(by.get(e.id).banner) } : e));
}

// Promoted meets first (up to `max`, Spotlight before Featured), the rest in
// the order they were already sorted. Only within whatever the list shows.
export function pinPromoted(list, max = 3) {
  const rank = (e) => (e.promoted === "spotlight" ? 0 : e.promoted === "featured" ? 1 : 2);
  const top = list.filter((e) => e.promoted).sort((a, b) => rank(a) - rank(b)).slice(0, max);
  const ids = new Set(top.map((e) => e.id));
  return [...top, ...list.filter((e) => !ids.has(e.id))];
}

export const priceLabel = (cents) => (Number.isFinite(cents) ? `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}` : "");

// What each package gets, for the promote sheet.
export const PERKS = {
  featured: ["Pinned at the top of Discover", "A ⭐ PROMOTED label on your meet"],
  spotlight: ["Everything in Featured", "A slide in the Discover banner", "One alert to members nearby who allow promoted alerts"],
};
