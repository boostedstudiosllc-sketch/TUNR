// POST /api/rush-finish   (Authorization: Bearer <session>)
// Body: { run: "<run id>", moves: [[step, ±1], …] }
//
// Finishes a TUNR Rush run. The phone only sends the lane changes it made;
// this replays the run with the same game engine, from the run's seed and
// its level's rules, and records the distance the replay reaches. Points
// come from that, never from a number the phone reports
// (finish_game_run_verified, 066_rush_daily_courses.sql).
//
// Errors: method_not_allowed, not_signed_in, bad_moves, not_found,
// already, push_not_configured (server key missing), finish_failed
// (`detail` says why). Otherwise the database's answer plus the replayed
// run: { status, earned, best, counts, today, run: { dist, score, … } }.

import { createPushService } from "./_lib/push.js";
import { replay, scoreOf, validMoves, DEFAULT_RULES, DEFAULT_LEVELS } from "../src/lib/rushEngine.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const service = createPushService({ env, fetchImpl });
    if (service.config.error) {
      return res.status(503).json({ error: service.config.error, detail: service.config.detail });
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "not_signed_in" });
    const who = await fetchImpl(`${service.config.url}/auth/v1/user`, {
      headers: { apikey: env.VITE_SUPABASE_ANON_KEY || service.config.key, Authorization: `Bearer ${token}` },
    });
    const user = who.ok ? await who.json() : null;
    if (!user?.id) return res.status(401).json({ error: "not_signed_in" });

    const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
    const runId = String(body.run || "");
    if (!UUID.test(runId)) return res.status(404).json({ error: "not_found" });
    if (!validMoves(body.moves)) return res.status(400).json({ error: "bad_moves" });

    try {
      const runs = await service.rest(
        `/rest/v1/game_runs?id=eq.${runId}&user_id=eq.${user.id}&select=id,seed,difficulty,finished_at`
      );
      const run = Array.isArray(runs) ? runs[0] : null;
      if (!run || !run.seed) return res.status(404).json({ error: "not_found" });
      if (run.finished_at) return res.status(409).json({ error: "already" });

      const settings = await service.rest("/rest/v1/game_settings?select=levels");
      const level = { ...DEFAULT_LEVELS[run.difficulty], ...(settings?.[0]?.levels?.[run.difficulty] || {}) };
      const g = replay(run.seed, { ...DEFAULT_RULES, ...level }, body.moves);
      const result = await service.rest("/rest/v1/rpc/finish_game_run_verified", {
        method: "POST",
        body: JSON.stringify({
          p_run: runId,
          p_user: user.id,
          p_distance: Math.floor(g.dist),
          p_score: scoreOf(g),
          p_sim_secs: Math.round(g.t * 100) / 100,
          p_moves: body.moves,
        }),
      });
      return res.status(200).json({
        ...result,
        run: { dist: Math.floor(g.dist), score: scoreOf(g), pickups: g.pickups, boosts: g.boosts, crashes: g.crashes, secs: g.t },
      });
    } catch (e) {
      console.error("rush-finish", e);
      return res.status(502).json({ error: "finish_failed", detail: String(e?.message || e).slice(0, 200) });
    }
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

export default createHandler();
