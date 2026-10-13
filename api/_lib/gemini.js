// Reading a flyer with Google Gemini (free tier). Gemini takes the image
// inline, so it's fetched from our own storage first, and wants its output
// schema in its own OpenAPI-style dialect, derived here from FLYER_SCHEMA.

import { FLYER_SCHEMA, SYSTEM_PROMPT, buildUserText } from "./flyer.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";
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
export async function readFlyerWithGemini({ apiKey, model = DEFAULT_MODEL, imageUrl, caption, now, fetchImpl = fetch }) {
  const img = await fetchImpl(imageUrl);
  if (!img.ok) return { error: "unreadable" };
  const mime = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!mime.startsWith("image/")) return { error: "unreadable" };
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return { error: "unreadable" };

  const res = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mime, data: bytes.toString("base64") } },
              { text: buildUserText({ caption, now }) },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 },
      }),
    }
  );

  if (!res.ok) {
    console.error("read-flyer gemini:", res.status, (await res.text()).slice(0, 300));
    if (res.status === 429 || res.status === 503) return { error: "busy" };
    if (res.status === 400) return { error: "unreadable" };
    return { error: "ai_failed" };
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
