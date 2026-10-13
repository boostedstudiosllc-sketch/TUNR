// The online check on a meet's location: look it up on Mapbox and see
// whether it's a real place, and whether it's in Georgia. Also gives the map
// pin real coordinates instead of the middle of Atlanta.
//
//   found   — a street address or a named place, in Georgia
//   area    — only a city or neighbourhood matched, in Georgia (pin is rough)
//   outside — the best match isn't in Georgia
//   none    — nothing matched well enough, or the lookup failed

const GEORGIA = "US-GA";

const regionOf = (feature) => {
  if (String(feature.id || "").startsWith("region.")) return feature.properties?.short_code || null;
  const region = (feature.context || []).find((c) => String(c.id || "").startsWith("region."));
  return region?.short_code || null;
};

export function judgeGeocode(json) {
  const feature = json?.features?.[0];
  if (!feature || !Array.isArray(feature.center) || (feature.relevance ?? 0) < 0.7) {
    return { status: "none" };
  }
  const [lng, lat] = feature.center;
  const result = { lat, lng, placeName: feature.place_name || "" };
  if (String(regionOf(feature) || "").toUpperCase() !== GEORGIA) return { status: "outside", ...result };
  const types = feature.place_type || [];
  const precise = types.includes("address") || types.includes("poi");
  return { status: precise ? "found" : "area", ...result };
}

export async function geocodeLocation(location, city, { token, fetchImpl = fetch } = {}) {
  const query = [location, city].map((s) => (s || "").trim()).filter(Boolean).join(", ");
  if (!token || query.length < 3) return { status: "none" };
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?country=us&limit=1&proximity=-84.39,33.75&types=address,poi,place,locality,neighborhood` +
    `&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { status: "none" };
    return judgeGeocode(await res.json());
  } catch {
    return { status: "none" };
  }
}
