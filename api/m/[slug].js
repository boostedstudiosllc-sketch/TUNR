// Serves /m/:slug for people, link-preview bots, search engines and AI
// assistants. Bots don't run JavaScript, so the meet's title, description,
// photo, readable details and schema.org Event data are put into the built
// index.html here (api/_lib/seo.js). The URL stays the same, so the app's own
// deep-link handling still opens the meet for real visitors.
//
// events_public, not events: a private meet comes back redacted (location,
// photo and description null, `locked` true), so nothing here can leak an
// address. Private meets also get noindex and no Event data.
import { loadIndexHtml, injectPage, eventJsonLd, meetBody, cityName } from "../_lib/seo.js";

const COLS = "slug,title,host,city,location,lat,lng,description,photo_url,flyer_url,start_at,end_at,recurrence,recurrence_until,timezone,visibility,locked,cancelled_at,cancel_reason,vibe";

export default async function handler(req, res) {
  const slug = String(req.query.slug || "");
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  let event = null;
  if (supabaseUrl && anonKey && slug) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/events_public?slug=eq.${encodeURIComponent(slug)}&select=${COLS}&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (r.ok) event = (await r.json())[0] || null;
      else console.error("meet page: events_public", r.status);
    } catch (e) {
      console.error("meet page:", e.message); // generic tags below
    }
  }

  const { origin, html } = await loadIndexHtml(req);
  const url = `${origin}/m/${encodeURIComponent(slug)}`;
  if (!event) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).send(injectPage(html, { title: "TUNR — Find Your Meet", description: "Find car meets near you. Discover, RSVP, and post local meets.", url, noindex: true }));
  }

  const city = cityName(event.city);
  const title = `${event.cancelled_at ? "Cancelled: " : ""}${event.title}${city ? ` · ${city} car meet` : ""} — TUNR`;
  const description = event.locked
    ? "Private meet on TUNR. Open the link to request access."
    : [event.location, event.city].filter(Boolean).join(", ") || "Car meet on TUNR.";
  const page = injectPage(html, {
    title,
    description,
    url,
    image: event.locked ? null : event.photo_url || event.flyer_url || null,
    jsonLd: eventJsonLd(event, { origin }),
    body: meetBody(event, { origin }),
    noindex: Boolean(event.locked),
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(page);
}
