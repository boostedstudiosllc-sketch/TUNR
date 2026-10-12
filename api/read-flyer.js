// POST /api/read-flyer  { imageUrl, caption? }  (Authorization: Bearer <session>)
//
// Reads a meet flyer the signed-in user has already uploaded and returns the
// fields for the "post a meet" form. Only images in the caller's own folder
// of the event-photos bucket are accepted, and every read is logged as the
// caller first, so the database's per-account limit applies before anything
// is spent.

import Anthropic from "@anthropic-ai/sdk";
import { FLYER_SCHEMA, SYSTEM_PROMPT, buildUserText, normalizeFlyer } from "./_lib/flyer.js";

export function createHandler({
  env = process.env,
  fetchImpl = fetch,
  makeClient = (apiKey) => new Anthropic({ apiKey }),
  now = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey || !env.ANTHROPIC_API_KEY) {
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

    const client = makeClient(env.ANTHROPIC_API_KEY);
    let response;
    try {
      response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        // If a safety classifier declines, re-run on Anthropic's recommended
        // fallback model instead of failing the read.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: FLYER_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: imageUrl } },
              { type: "text", text: buildUserText({ caption, now: now() }) },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("read-flyer:", err?.status, err?.message);
      if (err instanceof Anthropic.RateLimitError) return res.status(503).json({ error: "busy" });
      if (err instanceof Anthropic.BadRequestError) return res.status(422).json({ error: "unreadable" });
      if (err instanceof Anthropic.APIError) return res.status(502).json({ error: "ai_failed" });
      throw err;
    }

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "unreadable" });
    if (response.stop_reason === "max_tokens") return res.status(502).json({ error: "ai_failed" });

    const text = (response.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = safeJson(text);
    if (!parsed) return res.status(502).json({ error: "ai_failed" });

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
