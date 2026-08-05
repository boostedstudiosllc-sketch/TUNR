// Distance between the viewer and a meet.
//
// Pure functions, no browser APIs, so they can be unit tested in plain Node.
// Getting the viewer's coordinates lives in the app (navigator.geolocation).

const EARTH_RADIUS_MILES = 3958.8;

const toRadians = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in miles. Straight-line, not driving distance —
// enough for "how far is this roughly" and for ordering meets by proximity.
export function haversineMiles(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Short label for a card: sub-mile reads as "0.4 mi", double digits drop the
// decimal so the line stays tidy.
export function formatMiles(miles) {
  if (miles === null || miles === undefined || !Number.isFinite(miles)) return null;
  if (miles < 0.1) return "< 0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// Adds distanceMi (number) and distanceLabel (string) to each event, given the
// viewer's position. Returns events untouched when position is unknown.
export function withDistances(events, position) {
  if (!position || typeof position.lat !== "number" || typeof position.lng !== "number") {
    return events;
  }
  return events.map((event) => {
    const miles = haversineMiles(position.lat, position.lng, event.lat, event.lng);
    return miles === null
      ? event
      : { ...event, distanceMi: miles, distanceLabel: formatMiles(miles) };
  });
}
