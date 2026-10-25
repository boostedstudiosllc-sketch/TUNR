// TUNR Rush: talking to the server (060_tunr_rush.sql). The game itself is
// in rushEngine.js.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { scoreOf, DEFAULT_RULES } from "./rushEngine.js";

export * from "./rushEngine.js";

export async function startRun(vehicleId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("start_game_run", { p_vehicle: vehicleId || null });
  if (error) throw new Error(withReason("Couldn't start the run.", error));
  return data?.status === "ok" ? data.run_id : null;
}

// The game's rules, set by admins (063_rush_settings.sql). Chances are
// stored as whole percents.
const fromRow = (r) => ({
  enabled: r.enabled,
  goal: r.goal_meters,
  dailyPoints: r.daily_points,
  startTime: r.start_seconds,
  clockSeconds: Number(r.clock_seconds),
  crashSeconds: Number(r.crash_seconds),
  boostSeconds: Number(r.boost_seconds),
  boostChance: r.boost_chance / 100,
  clockChance: r.clock_chance / 100,
  traffic: Number(r.traffic),
  topSpeed: r.top_speed,
  boostSpeed: r.boost_speed,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export async function loadGameSettings() {
  if (!supabase) return { ...DEFAULT_RULES };
  const { data, error } = await supabase.from("game_settings").select("*").maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the game settings.", error));
  return data ? { ...DEFAULT_RULES, ...fromRow(data) } : { ...DEFAULT_RULES };
}

export async function saveGameSettings(r) {
  if (!supabase) return;
  const { error } = await supabase
    .from("game_settings")
    .update({
      enabled: Boolean(r.enabled),
      goal_meters: Math.round(r.goal),
      daily_points: Math.round(r.dailyPoints),
      start_seconds: Math.round(r.startTime),
      clock_seconds: r.clockSeconds,
      crash_seconds: r.crashSeconds,
      boost_seconds: r.boostSeconds,
      boost_chance: Math.round(r.boostChance * 100),
      clock_chance: Math.round(r.clockChance * 100),
      traffic: r.traffic,
      top_speed: Math.round(r.topSpeed),
      boost_speed: Math.round(r.boostSpeed),
    })
    .eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the game settings."));
}

export async function finishRun(runId, g) {
  if (!supabase || !runId) return null;
  const { data, error } = await supabase.rpc("finish_game_run", {
    p_run: runId,
    p_distance: Math.floor(g.dist),
    p_score: scoreOf(g),
  });
  if (error) throw new Error(withReason("Couldn't save your run.", error));
  return data || null;
}

export async function loadMyGame() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_game");
  if (error) throw new Error(withReason("Couldn't load your best run.", error));
  return data || null;
}

export async function loadGameLeaderboard() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("game_leaderboard", { p_limit: 50 });
  if (error) throw new Error(withReason("Couldn't load the leaderboard.", error));
  return data || [];
}

export async function saveGameLook(vehicleId, { color, body, spoiler }) {
  if (!supabase || !vehicleId) return;
  const { error } = await supabase
    .from("vehicles")
    .update({ game_color: color, game_body: body, game_spoiler: spoiler })
    .eq("id", vehicleId);
  if (error) throw new Error(withReason("Couldn't save your car's look.", error));
}
