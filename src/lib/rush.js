// TUNR Rush: talking to the server (060_tunr_rush.sql). The game itself is
// in rushEngine.js.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";
import { scoreOf } from "./rushEngine.js";

export * from "./rushEngine.js";

export async function startRun(vehicleId) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("start_game_run", { p_vehicle: vehicleId || null });
  if (error) throw new Error(withReason("Couldn't start the run.", error));
  return data?.status === "ok" ? data.run_id : null;
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

export async function saveGameLook(vehicleId, color, body) {
  if (!supabase || !vehicleId) return;
  const { error } = await supabase.from("vehicles").update({ game_color: color, game_body: body }).eq("id", vehicleId);
  if (error) throw new Error(withReason("Couldn't save your car's look.", error));
}
