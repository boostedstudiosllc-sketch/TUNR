// Reading a flyer with Google Gemini (free tier). Gemini takes the image
// inline, so it's fetched from our own storage first, and wants its output
// schema in its own OpenAPI-style dialect, derived here from FLYER_SCHEMA.

import { FLYER_SCHEMA, SYSTEM_PROMPT, buildUserText } from "./flyer.js";

// "gemini-flash-latest" follows Google's current Flash model; the pinned
// names are fallbacks if an alias isn't available to the key.
export const DEFAULT_MODEL = "gemini-flash-latest";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// JSON Schema (with anyOf [x, null]) -> Gemini responseSchema (nullable).
export function toGeminiSchema(node) {
  if (node.anyOf) {
    const real = node.anyOf.find((n) => n.type !== "null");
    return { ...toGeminiSchema(real), nullable: true, ...(node.description ? { description: node.description } : {}) };
  }
  const out = { type: String(node.type).toUpperCase() };
  if (node.description) out.description = node.description;
  if (node.enum) out.enum = node.enum;
  if (node.type === "object") {
    out.properties = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    out.required = node.required;
    out.propertyOrdering = Object.keys(node.properties);
  }
  if (node.type === "array") out.items = toGeminiSchema(node.items);
  return out;
}

const RESPONSE_SCHEMA = toGeminiSchema(FLYER_SCHEMA);

// { parsed } on success, or { error: "busy" | "unreadable" | "ai_failed" }.
export async function readFlyerWithGemini({ apiKey, model = DEFAULT_MODEL, imageUrl, caption, postedAt, now, fetchImpl = fetch }) {
  const img = await fetchImpl(imageUrl);
  if (!img.ok) return { error: "unreadable" };
  const mime = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!mime.startsWith("image/")) return { error: "unreadable" };
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return { error: "unreadable" };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: bytes.toString("base64") } },
          { text: buildUserText({ caption, postedAt, now }) },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 },
  });
  let res;
  // A model that's retired (404) or has no free quota on this key (429)
  // gets skipped for the next one.
  for (const name of [model, ...FALLBACK_MODELS.filter((m) => m !== model)]) {
    res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body }
    );
    if (res.status !== 404 && res.status !== 429) break;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error("read-flyer gemini:", res.status, text.slice(0, 500));
    // Google's own explanation, shown to the user.
    let detail = `HTTP ${res.status}`;
    try {
      detail = JSON.parse(text)?.error?.message || detail;
    } catch {
      // not JSON; keep the status
    }
    detail = detail.replace(/\s+/g, " ").slice(0, 200);
    if (res.status === 429 || res.status === 503) return { error: "busy", detail };
    if (res.status === 401 || res.status === 403) return { error: "bad_key", detail };
    if (res.status === 404) return { error: "no_model", detail };
    if (res.status === 400) return { error: "unreadable", detail };
    return { error: "ai_failed", detail };
  }
  const data = await res.json();
  if (data.promptFeedback?.blockReason) return { error: "unreadable" };
  const cand = data.candidates?.[0];
  if (!cand || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(cand.finishReason)) return { error: "unreadable" };
  if (cand.finishReason === "MAX_TOKENS") return { error: "ai_failed" };
  const text = (cand.content?.parts || []).map((p) => p.text || "").join("");
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return { error: "ai_failed" };
  }
}
