// /sitemap.xml: the home page, /meets, a page per city and every upcoming
// public meet, so search engines and AI crawlers find them (api/_lib/seo.js).
import { fetchPublicMeets, sitemapXml } from "../_lib/seo.js";

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
  let rows = [];
  try {
    rows = await fetchPublicMeets(process.env);
  } catch (e) {
    console.error("sitemap:", e.message);
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(sitemapXml(rows, { origin }));
}
