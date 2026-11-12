// POST /api/turn  { convoyId }  (Authorization: Bearer <session>)
//
// The connection servers for a convoy's voice chat (Convoy.jsx, voice.js).
// Phones talk to each other directly (WebRTC); a public STUN server helps
// them find each other, and a TURN relay carries the audio when a phone
// network won't allow a direct link (common on cellular). The relay is
// Cloudflare's (free tier; CLOUDFLARE_TURN_KEY_ID and
// CLOUDFLARE_TURN_API_TOKEN in Vercel): this mints short-lived credentials
// so the key never reaches a phone. Only members of a running convoy get
// them. Without the keys, it answers with STUN only (relay: false).
//
// → 200 { iceServers: [...], relay: boolean }
//   401 not_signed_in · 403 not_in_convoy · 400 bad_convoy · 503 not_configured

export const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

// Cloudflare answers { iceServers: [...] } (generate-ice-servers) or
// { iceServers: { urls, username, credential } } (the older generate).
export function normalizeIceServers(body) {
  const list = Array.isArray(body?.iceServers) ? body.iceServers : body?.iceServers ? [body.iceServers] : [];
  return list
    .map((s) => ({ urls: [].concat(s?.urls || []).filter((u) => typeof u === "string" && /^(stun|turns?):/.test(u)), username: s?.username, credential: s?.credential }))
    .filter((s) => s.urls.length)
    .map((s) => (s.username ? s : { urls: s.urls }));
}

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
    const anonKey = env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: "not_configured" });

    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "not_signed_in" });
    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const convoyId = typeof body.convoyId === "string" ? body.convoyId : "";
    if (!/^[0-9a-f-]{36}$/i.test(convoyId)) return res.status(400).json({ error: "bad_convoy" });

    const supa = (path, init = {}) =>
      fetchImpl(`${supabaseUrl}${path}`, { ...init, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });

    const userRes = await supa("/auth/v1/user");
    if (!userRes.ok) return res.status(401).json({ error: "not_signed_in" });
    // In this convoy, and it's still running (the database decides, as them).
    const memberRes = await supa("/rest/v1/rpc/in_live_convoy", { method: "POST", body: JSON.stringify({ p_convoy: convoyId }) });
    if (!memberRes.ok || (await memberRes.json()) !== true) return res.status(403).json({ error: "not_in_convoy" });

    const keyId = env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = env.CLOUDFLARE_TURN_API_TOKEN;
    if (!keyId || !apiToken) return res.status(200).json({ iceServers: STUN, relay: false });

    const base = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials`;
    const ask = (path) => fetchImpl(`${base}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ ttl: 3600 }) });
    try {
      let r = await ask("generate-ice-servers");
      if (r.status === 404) r = await ask("generate");
      if (!r.ok) {
        // Voice still works on most networks without the relay.
        console.warn(`TURN credentials failed: ${r.status}`);
        return res.status(200).json({ iceServers: STUN, relay: false, error: "turn_failed", detail: `cloudflare ${r.status}` });
      }
      const servers = normalizeIceServers(await r.json());
      return res.status(200).json({ iceServers: servers.length ? servers : STUN, relay: servers.some((s) => s.urls.some((u) => u.startsWith("turn"))) });
    } catch (e) {
      console.warn(`TURN credentials failed: ${e.message}`);
      return res.status(200).json({ iceServers: STUN, relay: false, error: "turn_failed", detail: e.message });
    }
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export default createHandler();
