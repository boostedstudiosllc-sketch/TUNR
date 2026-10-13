// POST /api/read-flyer  { imageUrl, caption? }  (Authorization: Bearer <session>)
//
// Reads (with Google Gemini) a meet flyer the signed-in user has already uploaded and returns the
// fields for the "post a meet" form. Only images in the caller's own folder
// of the event-photos bucket are accepted, and every read is logged as the
// caller first, so the database's per-account limit applies before anything
// is spent.

import { normalizeFlyer } from "./_lib/flyer.js";
import { readFlyerWithGemini, DEFAULT_MODEL } from "./_lib/gemini.js";

export function createHandler({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || !env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "not_configured" });
    }

    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "not_signed_in" });

    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const caption = typeof body.caption === "string" ? body.caption.slice(0, 2200) : "";

    const supa = (path, init = {}) =>
      fetchImpl(`${supabaseUrl}${path}`, {
        ...init,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
      });

    // Who's asking.
    const userRes = await supa("/auth/v1/user");
    if (!userRes.ok) return res.status(401).json({ error: "not_signed_in" });
    const user = await userRes.json();
    if (!user?.id) return res.status(401).json({ error: "not_signed_in" });

    // Their own upload, nothing else.
    const folder = `${supabaseUrl}/storage/v1/object/public/event-photos/${user.id}/`;
    const rest = imageUrl.startsWith(folder) ? imageUrl.slice(folder.length) : "";
    if (!rest || !/^[A-Za-z0-9._-]+$/.test(rest) || rest.includes("..")) {
      return res.status(400).json({ error: "bad_image" });
    }

    // Count the read against their limit before spending anything.
    const logRes = await supa("/rest/v1/flyer_reads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: user.id, image_url: imageUrl }),
    });
    if (!logRes.ok) {
      const text = await logRes.text();
      if (text.includes("rate_limit_flyers")) return res.status(429).json({ error: "rate_limit_flyers" });
      return res.status(502).json({ error: "log_failed" });
    }

    const result = await readFlyerWithGemini({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || DEFAULT_MODEL,
      imageUrl,
      caption,
      now: now(),
      fetchImpl,
    });
    if (result.error) {
      const status = { busy: 503, unreadable: 422 }[result.error] || 502;
      return res.status(status).json({ error: result.error });
    }
    const parsed = result.parsed;

    return res.status(200).json({ flyer: normalizeFlyer(parsed, now()) });
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default createHandler();
