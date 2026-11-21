// POST /api/vin  { vin }  (Authorization: Bearer <session>)
//
// Decodes a VIN with NHTSA's free vPIC decoder (no key) and returns the
// garage fields: year, make, model, trim, body, drivetrain, transmission,
// engine. Nothing is stored here; the app saves the VIN privately with the
// car (vehicle_vins, 131) if the owner chooses.
//
// → 200 { decoded, note? }  ·  400 bad_vin (+ detail)  ·  401 not_signed_in
//   404 not_found (NHTSA has no data)  ·  502 decoder_failed | auth_check_failed
//   503 not_configured (no Supabase settings: can't check who's asking)

import { cleanVin, vinProblem, fromVpic } from "../../src/lib/vin.js";

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
    try {
      const who = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
      const me = who.ok ? await who.json().catch(() => null) : null;
      if (!me?.id) return res.status(401).json({ error: "not_signed_in" });
    } catch (e) {
      return res.status(502).json({ error: "auth_check_failed", detail: e.message });
    }
    const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
    const vin = cleanVin(body.vin);
    const problem = vinProblem(vin);
    if (problem) return res.status(400).json({ error: "bad_vin", detail: problem });

    let data;
    try {
      const r = await fetchImpl(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`);
      if (!r.ok) return res.status(502).json({ error: "decoder_failed", detail: `NHTSA answered ${r.status}` });
      data = await r.json();
    } catch (e) {
      return res.status(502).json({ error: "decoder_failed", detail: e.message });
    }
    const result = data?.Results?.[0];
    const decoded = fromVpic(result) // the app matches the make to TUNR's list;
    if (!decoded || !decoded.model) return res.status(404).json({ error: "not_found", detail: result?.ErrorText || "NHTSA has no data for that VIN." });
    // Error code 0 is clean; others (like a partial decode) are passed on.
    const note = result.ErrorCode && String(result.ErrorCode) !== "0" ? String(result.ErrorText || "").slice(0, 200) : undefined;
    return res.status(200).json({ decoded, vin, note });
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
