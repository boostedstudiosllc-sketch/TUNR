// Serves /hosts for humans and link-preview bots alike.
//
// This is the link that gets pasted into an Instagram DM, so the preview card
// is doing as much work as the page. Same approach as /m/:slug: fetch the
// built index.html, strip the generic tags, inject host-specific ones.

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
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const pageUrl = `${proto}://${host}/hosts`;

  const title = "Post your meets on TUNR";
  const description =
    "Your flyer disappears in 24 hours. Your meet shouldn't. Free for hosts — on the map, with RSVPs and a real guest list.";

  let indexHtml;
  try {
    const selfRes = await fetch(`${proto}://${host}/index.html`);
    indexHtml = selfRes.ok ? await selfRes.text() : FALLBACK_HTML;
  } catch {
    indexHtml = FALLBACK_HTML;
  }

  indexHtml = indexHtml
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/g, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/g, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/g, "");

  const metaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(`${proto}://${host}/icon-512.png`)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(`${proto}://${host}/icon-512.png`)}" />
  `;

  const html = indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} — TUNR</title>`)
    .replace("</head>", `${metaTags}\n  </head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
}
