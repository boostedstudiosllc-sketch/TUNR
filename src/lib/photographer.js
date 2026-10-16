// A photographer's page: an Instagram @handle or a link to their site.
// Returns { href, label } to show, or null when there's nothing safe to link.
export function photoPageLink(value) {
  const v = (value || "").trim();
  if (!v) return null;
  // "@name" is always a handle; a bare word with no dot is too. A dotted word
  // without the @ ("site.com") is read as a website.
  const handle = /^@?([A-Za-z0-9._]{1,30})$/.exec(v);
  if (handle && (v.startsWith("@") || !v.includes("."))) {
    return { href: `https://www.instagram.com/${handle[1]}/`, label: `@${handle[1]}` };
  }
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
  const label = (url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "")).slice(0, 60);
  return { href: url.href, label };
}

// How someone's coming to a meet they said yes to.
export const GOING_AS = [
  { id: "car", label: "🚗 CAR" },
  { id: "photographer", label: "📸 PHOTOGRAPHER" },
  { id: "both", label: "🚗📸 BOTH" },
];

// "36 cars · 8 photographers" — only the parts that aren't zero.
export function crowdLine(event) {
  const parts = [];
  if (event.cars) parts.push(`${event.cars} ${event.cars === 1 ? "car" : "cars"}`);
  if (event.photographers) {
    parts.push(`${event.photographers} ${event.photographers === 1 ? "photographer" : "photographers"}`);
  }
  return parts.join(" · ");
}
