// Pages search engines and AI assistants can read. TUNR is a JavaScript app,
// and most AI crawlers (ChatGPT, Perplexity, Claude, …) don't run JavaScript,
// so without this they'd see an empty page. Plain HTML + schema.org data for
// meet pages (/m/<slug>), "Car meets in Georgia" (/meets, /meets/<city>) and
// the sitemap. Pure functions: unit-tested in test/seo.test.js.
import { isoInTz, nextOccurrence, isPast, DEFAULT_TZ } from "../../src/lib/dates.js";

export const SITE_NAME = "TUNR";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// "Alpharetta, GA" → "alpharetta"; "Stone Mountain" → "stone-mountain".
export function citySlug(city) {
  return cityName(city).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
export const cityName = (city) => String(city || "").split(",")[0].trim();
const stateOf = (city) => (String(city || "").split(",")[1] || "GA").trim() || "GA";

// A database row → the shape the date helpers take.
const toMeet = (r) => {
  const tz = r.timezone || DEFAULT_TZ;
  return { start: isoInTz(r.start_at, tz), end: isoInTz(r.end_at, tz), timezone: tz, recurrence: r.recurrence || null, recurrenceUntil: r.recurrence_until || null };
};

// "Sat, Nov 29, 7:00 PM" in the meet's own time zone.
export function whenText(date, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function repeatText(recurrence) {
  if (!recurrence) return "";
  const [kind, a, b] = recurrence.split(":");
  const day = (code) => ({ SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday" })[code] || code;
  if (kind === "weekly") return `Every ${day(a)}`;
  if (kind === "monthly") return `The ${a} ${day(b)} of every month`;
  return "";
}

// The meet's next date (or its only one), and when that ends.
export function nextDates(row, now = new Date()) {
  const meet = toMeet(row);
  const start = nextOccurrence(meet, now);
  if (!start) return null;
  const length = row.end_at && row.start_at ? Date.parse(row.end_at) - Date.parse(row.start_at) : 0;
  const end = length > 0 && length < 2 * 864e5 ? new Date(start.getTime() + length) : null;
  return { start, end, past: isPast(meet, now) };
}

// Public meets coming up in the next `days`, soonest first. Private,
// hidden and cancelled meets are left out.
export function upcoming(rows, now = new Date(), days = 45) {
  return (rows || [])
    .filter((r) => r.slug && r.title && (r.visibility || "public") === "public" && !r.locked && !r.hidden && !r.cancelled_at)
    .map((row) => ({ row, dates: nextDates(row, now) }))
    .filter(({ dates }) => dates && !dates.past && dates.start.getTime() - now.getTime() <= days * 864e5)
    .sort((a, b) => a.dates.start - b.dates.start);
}

// schema.org Event: what Google's event results and AI answers read.
// Private (locked) meets get none: their place isn't public.
export function eventJsonLd(row, { origin, now = new Date() } = {}) {
  if (!row || row.locked) return null;
  const dates = nextDates(row, now);
  if (!dates) return null;
  const city = cityName(row.city);
  const place = String(row.location || "").trim();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: row.title,
    startDate: dates.start.toISOString(),
    ...(dates.end ? { endDate: dates.end.toISOString() } : {}),
    eventStatus: row.cancelled_at ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: place || city || "Georgia",
      address: {
        "@type": "PostalAddress",
        ...(/\d/.test(place) ? { streetAddress: place } : {}),
        ...(city ? { addressLocality: city } : {}),
        addressRegion: stateOf(row.city),
        addressCountry: "US",
      },
      ...(typeof row.lat === "number" && typeof row.lng === "number" ? { geo: { "@type": "GeoCoordinates", latitude: row.lat, longitude: row.lng } } : {}),
    },
    description: String(row.description || `Car meet${city ? ` in ${city}, ${stateOf(row.city)}` : ""}${row.vibe ? ` (${row.vibe})` : ""}.`).slice(0, 500),
    url: `${origin}/m/${encodeURIComponent(row.slug)}`,
  };
  const image = row.photo_url || row.flyer_url;
  if (image) ld.image = [image];
  if (row.host) ld.organizer = { "@type": "Organization", name: String(row.host).replace(/^@/, "") };
  return ld;
}

const box = 'style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif;line-height:1.5"';

// The readable part of a meet page.
export function meetBody(row, { origin, now = new Date() } = {}) {
  const city = cityName(row.city);
  const dates = nextDates(row, now);
  const lines = [];
  if (row.cancelled_at) lines.push(`<p><strong>Cancelled.</strong> ${escapeHtml(row.cancel_reason || "The host cancelled this meet.")}</p>`);
  if (dates) lines.push(`<p>When: ${escapeHtml([repeatText(row.recurrence), (row.recurrence ? "next " : "") + whenText(dates.start, row.timezone || DEFAULT_TZ)].filter(Boolean).join(", "))}</p>`);
  if (row.locked) lines.push("<p>Private meet: the place is shared with people the host lets in. Open it in TUNR to ask.</p>");
  else lines.push(`<p>Where: ${escapeHtml([row.location, row.city].filter(Boolean).join(", ") || "Georgia")}</p>`);
  if (row.host) lines.push(`<p>Host: ${escapeHtml(String(row.host).startsWith("@") ? row.host : `@${row.host}`)}</p>`);
  if (row.vibe) lines.push(`<p>Style: ${escapeHtml(row.vibe)}</p>`);
  if (!row.locked && row.description) lines.push(`<p>${escapeHtml(String(row.description).slice(0, 1200))}</p>`);
  const more = city ? `<a href="${origin}/meets/${citySlug(row.city)}">More car meets in ${escapeHtml(city)}</a> · ` : "";
  return `<main ${box}><h1>${escapeHtml(row.title)}</h1>${lines.join("")}<p>RSVP, get directions and see who's going on TUNR.</p><p>${more}<a href="${origin}/meets">All car meets in Georgia</a></p></main>`;
}

// Answers people ask AI assistants, shown on /meets and in FAQPage data.
export const FAQ = [
  ["How do I find car meets near me in Georgia?", "Open TUNR (free, works in any phone browser). Discover lists car meets, car shows and cruise-ins near you, soonest first, with a map, directions and who's going."],
  ["Is TUNR free?", "Yes. Finding meets, RSVPing, posting meets and the garage are free. TUNR+ is an optional membership with extras."],
  ["How do I post my car meet?", "Hosts post meets for free on TUNR: add a flyer and TUNR fills in the date, time and place. Your meet goes on the map with RSVPs and a guest list."],
  ["What's on TUNR besides meets?", "Linkups (quick cruises and photo shoots today or tomorrow), a parts marketplace that checks if a part fits your car, car clubs, forums, photo spots and car games."],
];

// /meets (all of Georgia) or /meets/<city>.
export function meetsPage(rows, { origin, city = "", now = new Date() } = {}) {
  const all = upcoming(rows, now);
  const list = city ? all.filter(({ row }) => citySlug(row.city) === city) : all;
  const place = city ? cityName(list[0]?.row.city) || city.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Georgia";
  const title = `Car meets in ${place}${city ? ", GA" : ""}: this week and upcoming | TUNR`;
  const description = list.length
    ? `${list.length} upcoming car meets, car shows and cruise-ins in ${place}${city ? ", GA" : ""}, with dates, places and hosts. Updated live on TUNR.`
    : `Car meets in ${place} on TUNR. None are listed right now; check back soon or post your own.`;
  const items = list
    .map(({ row, dates }) => `<li><a href="${origin}/m/${encodeURIComponent(row.slug)}">${escapeHtml(row.title)}</a>: ${escapeHtml(whenText(dates.start, row.timezone || DEFAULT_TZ))}${row.recurrence ? ` (${escapeHtml(repeatText(row.recurrence).replace(/^\w/, (c) => c.toLowerCase()))})` : ""} · ${escapeHtml([row.location, row.city].filter(Boolean).join(", "))}${row.host ? ` · hosted by ${escapeHtml(String(row.host).startsWith("@") ? row.host : `@${row.host}`)}` : ""}</li>`)
    .join("");
  const cities = [...new Map(all.filter(({ row }) => citySlug(row.city)).map(({ row }) => [citySlug(row.city), cityName(row.city)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const cityLinks = cities.map(([slug, name]) => `<a href="${origin}/meets/${slug}">${escapeHtml(name)}</a>`).join(" · ");
  const faq = city ? "" : `<h2>Questions</h2>${FAQ.map(([q, a]) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join("")}`;
  const body = `<main ${box}><h1>Car meets in ${escapeHtml(place)}${city ? ", GA" : ""}</h1><p>${escapeHtml(description)}</p>${items ? `<ol>${items}</ol>` : "<p>No upcoming meets listed here right now.</p>"}${cityLinks ? `<h2>Car meets by city</h2><p>${cityLinks}</p>` : ""}${city ? `<p><a href="${origin}/meets">All car meets in Georgia</a></p>` : ""}${faq}<p><a href="${origin}/">Open TUNR</a> · <a href="${origin}/hosts">Post your meet free</a></p></main>`;
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "ItemList", name: `Car meets in ${place}`, itemListElement: list.slice(0, 50).map(({ row }, i) => ({ "@type": "ListItem", position: i + 1, url: `${origin}/m/${encodeURIComponent(row.slug)}`, name: row.title })) },
    ...(city ? [] : [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }]),
  ];
  return { title, description, body, jsonLd, empty: list.length === 0, url: `${origin}/meets${city ? `/${city}` : ""}` };
}

export function sitemapXml(rows, { origin, now = new Date() } = {}) {
  const list = upcoming(rows, now, 120);
  const cities = [...new Set(list.map(({ row }) => citySlug(row.city)).filter(Boolean))].sort();
  const urls = [
    [`${origin}/`, "daily"],
    [`${origin}/meets`, "hourly"],
    ...cities.map((c) => [`${origin}/meets/${c}`, "daily"]),
    [`${origin}/hosts`, "monthly"],
    ...list.map(({ row }) => [`${origin}/m/${encodeURIComponent(row.slug)}`, "daily"]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, f]) => `  <url><loc>${escapeHtml(u)}</loc><changefreq>${f}</changefreq></url>`).join("\n")}\n</urlset>\n`;
}

// Puts a page's title, description, links, data and readable text into the
// built index.html (the app still opens normally on top of it).
export function injectPage(indexHtml, { title, description, url, image = null, jsonLd = [], body = "", noindex = false }) {
  const meta = `
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    ${noindex ? '<meta name="robots" content="noindex" />' : ""}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ""}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ""}
    ${(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean).map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`).join("\n    ")}
  `;
  let html = String(indexHtml)
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/g, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/g, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/g, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/g, "")
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace("</head>", `${meta}\n  </head>`);
  if (body) {
    html = /<!--seo-->[\s\S]*?<!--\/seo-->/.test(html)
      ? html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, () => `<!--seo-->${body}<!--/seo-->`)
      : html.replace('<div id="root"></div>', () => `<div id="root"><!--seo-->${body}<!--/seo--></div>`);
  }
  return html;
}

// The built index.html, from this same deployment.
export async function loadIndexHtml(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `${proto}://${host}`;
  try {
    const r = await fetch(`${origin}/index.html`);
    if (r.ok) return { origin, html: await r.text() };
  } catch {
    // fall through to a bare page
  }
  return { origin, html: '<!doctype html><html><head><meta charset="utf-8"><title>TUNR</title></head><body><div id="root"></div></body></html>' };
}

// Public meets, from the anon (read-only) view. Old one-offs are left out.
export async function fetchPublicMeets(env, now = new Date()) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const since = new Date(now.getTime() - 2 * 864e5).toISOString();
  const cols = "slug,title,host,city,location,lat,lng,description,photo_url,flyer_url,start_at,end_at,recurrence,recurrence_until,timezone,visibility,locked,hidden,cancelled_at,vibe";
  const r = await fetch(`${url}/rest/v1/events_public?select=${cols}&visibility=eq.public&or=(recurrence.not.is.null,start_at.gte.${encodeURIComponent(since)})&order=start_at.asc&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`meets didn't load (${r.status})`);
  return r.json();
}
