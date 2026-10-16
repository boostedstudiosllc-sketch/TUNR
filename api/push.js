// GET  /api/push  → { publicKey }  the key browsers subscribe with
// POST /api/push  → delivers any alerts the database has waiting
//
// The app pings POST after anything that might have queued an alert (posting
// or joining a linkup, a chat message, a confirmation). It decides nothing
// about who's told what — see api/_lib/push.js.

import { createPushService } from "./_lib/push.js";

export function createHandler({ env = process.env, fetchImpl = fetch, webpushImpl } = {}) {
  return async function handler(req, res) {
    const service = createPushService({ env, fetchImpl, ...(webpushImpl ? { webpushImpl } : {}) });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }
    try {
      if (req.method === "GET") {
        const { publicKey } = await service.keys();
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.status(200).json({ publicKey });
      }
      if (req.method === "POST") {
        return res.status(200).json(await service.flush());
      }
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "method_not_allowed" });
    } catch (e) {
      console.error("push", e);
      return res.status(502).json({ error: "push_failed", detail: String(e?.message || e).slice(0, 200) });
    }
  };
}

export default createHandler();
