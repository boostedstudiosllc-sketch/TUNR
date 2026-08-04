// Serves /m/:slug for both humans and link-preview bots. Bots never run JS,
// so the meet-specific title/description/image have to be present in the
// initial HTML — this fetches the event, injects Open Graph/Twitter tags
// into the real built index.html, and returns that (with the URL unchanged,
// so the app's own client-side deep-link handling still opens the meet for
// real visitors).

const FALLBACK_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>TUNR</title></head><body></body></html>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default async function handler(req, res) {
  const slug = req.query.slug;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  let event = null;
  if (supabaseUrl && anonKey && slug) {
    try {
      const apiRes = await fetch(
        `${supabaseUrl}/rest/v1/events?slug=eq.${encodeURIComponent(slug)}&select=title,description,photo_url,city,location&limit=1`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
      );
      if (apiRes.ok) {
        const rows = await apiRes.json();
        event = rows[0] || null;
      }
    } catch {
      // no event data: fall through to generic tags
    }
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const pageUrl = `${proto}://${host}/m/${encodeURIComponent(slug || "")}`;

  const title = event ? `${event.title} — TUNR` : "TUNR — Find Your Meet";
  const description = event
    ? [event.location, event.city].filter(Boolean).join(", ") || "Car meet on TUNR."
    : "Find car meets near you. Discover, RSVP, and post local meets.";
  const image = event?.photo_url || null;

  let indexHtml;
  try {
    const selfRes = await fetch(`${proto}://${host}/index.html`);
    indexHtml = selfRes.ok ? await selfRes.text() : FALLBACK_HTML;
  } catch {
    indexHtml = FALLBACK_HTML;
  }

  const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ""}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ""}
  `;

  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace("</head>", `${metaTags}\n  </head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
}
