// POST /api/help { messages: [{ role, text }] } → { answer, left }
// The Help assistant: answers questions about the app from src/data/helpGuide.js
// (rules in api/_lib/help.js) with Google Gemini. Daily limits per member and
// per signed-out visitor (137_help_chat.sql). Questions aren't stored.
// Errors: not_configured, bad_request, too_long, rate_limit, busy, ai_failed.
import { createHash } from "node:crypto";
import { createPushService } from "../_lib/push.js";
import { chatWithGemini, DEFAULT_MODEL } from "../_lib/gemini.js";
import { SYSTEM, cleanConversation, tidyAnswer } from "../_lib/help.js";

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const service = createPushService({ env, fetchImpl });
    if (!env.GEMINI_API_KEY || service.config.error) {
      return res.status(503).json({ error: "not_configured", detail: !env.GEMINI_API_KEY ? "GEMINI_API_KEY is not set" : service.config.error });
    }
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: "bad_request", detail: e.message });
      }
    }
    const convo = cleanConversation(body?.messages);
    if (convo.error) return res.status(400).json({ error: convo.error });

    // Who's asking: a signed-in member, or a visitor by (hashed) address.
    let who = null;
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const r = await fetchImpl(`${service.config.url}/auth/v1/user`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY || service.config.key, Authorization: `Bearer ${bearer}` } });
      const user = r.ok ? await r.json() : null;
      if (user?.id) who = `user:${user.id}`;
    }
    if (!who) {
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
      who = `visitor:${createHash("sha256").update(`${ip}:tunr-help`).digest("hex").slice(0, 32)}`;
    }
    let quota;
    try {
      quota = await service.rest("/rest/v1/rpc/use_help_question", { method: "POST", body: JSON.stringify({ p_who: who }) });
    } catch (e) {
      console.error("help quota", e);
      return res.status(502).json({ error: "ai_failed", detail: "the question counter didn't answer" });
    }
    if (quota?.status === "rate_limit") return res.status(429).json({ error: "rate_limit", limit: quota.limit });
    if (quota?.status === "busy") return res.status(503).json({ error: "busy" });
    if (quota?.status !== "ok") return res.status(400).json({ error: "bad_request" });

    const out = await chatWithGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_MODEL, system: SYSTEM, contents: convo.turns, fetchImpl });
    if (out.error === "busy") return res.status(503).json({ error: "busy" });
    if (out.error === "blocked") return res.status(200).json({ answer: "I can only help with questions about using TUNR. Try asking about meets, parts, points or your account.", left: quota.left });
    if (out.error) return res.status(502).json({ error: "ai_failed", detail: out.detail || out.error });
    return res.status(200).json({ answer: tidyAnswer(out.text), left: quota.left });
  };
}

export default createHandler();
