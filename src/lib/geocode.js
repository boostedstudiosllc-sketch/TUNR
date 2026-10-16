// The online check on a meet's location: look it up on Mapbox and see
// whether it's a real place. Also gives the map pin real coordinates instead
// of the middle of Atlanta. Anywhere in the US is fine — TUNR is marketed in
// Georgia but works nationally — so the state is reported, not judged.
//
//   found — a street address or a named place
//   area  — only a city or neighbourhood matched (the pin is rough)
//   none  — nothing matched well enough, or the lookup failed

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
  const state = String(regionOf(feature) || "").toUpperCase().replace(/^US-/, "") || null;
  const result = { lat, lng, state, placeName: feature.place_name || "" };
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

// The other way: a spot (from the phone's GPS) to an address and the area
// it's in, e.g. { placeName: "250 Jackson St NE", area: "Old Fourth Ward, Atlanta" }.
export function judgeReverse(json) {
  const feature = json?.features?.[0];
  if (!feature) return { placeName: "", area: "" };
  const ctx = feature.context || [];
  const pick = (prefix) => {
    if (String(feature.id || "").startsWith(prefix)) return feature.text || "";
    return (ctx.find((c) => String(c.id || "").startsWith(prefix)) || {}).text || "";
  };
  const hood = pick("neighborhood.") || pick("locality.");
  const city = pick("place.");
  const area = [hood, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
  const types = feature.place_type || [];
  const street = types.includes("address")
    ? [feature.address, feature.text].filter(Boolean).join(" ")
    : types.includes("poi")
      ? feature.text || ""
      : "";
  return { placeName: street, area };
}

export async function reverseGeocode(lat, lng, { token, fetchImpl = fetch } = {}) {
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return { placeName: "", area: "" };
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng.toFixed(5)},${lat.toFixed(5)}.json` +
    `?types=address,poi,neighborhood,locality,place&limit=1&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return { placeName: "", area: "" };
    return judgeReverse(await res.json());
  } catch (e) {
    console.warn("reverse geocode:", e?.message);
    return { placeName: "", area: "" };
  }
}
