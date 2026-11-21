// Serves /join for humans and link-preview bots alike.
//
// This is the link in the bio, and the one people forward to each other, so
// the preview card is the first thing most of them see. Same approach as
// /hosts: fetch the built index.html, swap the generic tags for these.

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
  const pageUrl = `${proto}://${host}/join`;

  const title = "Get your Day 1 badge on TUNR";
  const description =
    "Every car meet in Atlanta, on one map. Sign up before launch and your profile carries a numbered Day 1 badge for good.";

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
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace("</head>", `${metaTags}\n  </head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=600");
  res.status(200).send(html);
}
