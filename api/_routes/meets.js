// /meets and /meets/<city>: "Car meets in Georgia" as plain HTML for search
// engines and AI assistants (api/_lib/seo.js). People get the app on top.
import { fetchPublicMeets, loadIndexHtml, meetsPage, injectPage, citySlug } from "../_lib/seo.js";

export default async function handler(req, res) {
  const city = citySlug(req.query?.city || "");
  const { origin, html } = await loadIndexHtml(req);
  let rows = [];
  try {
    rows = await fetchPublicMeets(process.env);
  } catch (e) {
    console.error("meets page:", e.message);
  }
  const page = meetsPage(rows, { origin, city });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).send(injectPage(html, { ...page, noindex: page.empty && Boolean(city) }));
}
