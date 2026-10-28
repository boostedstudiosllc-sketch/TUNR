// TUNR Rush: talking to the server (060_tunr_rush.sql, levels in
// 065_rush_difficulty.sql). The game itself is in rushEngine.js.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { DEFAULT_RULES, DEFAULT_LEVELS, LEVEL_IDS, SCENERY, SCENERY_IDS } from "./rushEngine.js";

export * from "./rushEngine.js";

// Start a run at a level. forPoints: a try at today's points (the day's
// first one locks in the level). Returns { status, run_id, seed, counts,
// today }; the seed is today's course.
export async function startRun(vehicleId, difficulty, forPoints) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("start_game_run", {
    p_vehicle: vehicleId || null,
    p_difficulty: difficulty,
    p_for_points: Boolean(forPoints),
  });
  if (error) throw new Error(withReason("Couldn't start the run.", error));
  return data || null;
}

// What start_game_run's refusals mean, for the results screen.
export const START_COPY = {
  off: "TUNR Rush is parked right now, so this run didn't count.",
  locked: "You already picked another level today, so this was practice.",
  no_tries: "You're out of tries today, so this was practice.",
  done: "Today's points are already in, so this was practice.",
  rate_limited: "That's 100 runs today, the limit, so this one didn't count.",
  bad_level: "That level doesn't exist, so this run didn't count.",
};

// The game's rules, set by admins (065_rush_difficulty.sql): on/off, tries
// a day, and each level's rules.
export async function loadGameSettings() {
  const fallback = { enabled: true, triesPerDay: 3, levels: DEFAULT_LEVELS, updatedAt: null };
  if (!supabase) return fallback;
  const { data, error } = await supabase.from("game_settings").select("enabled, tries_per_day, levels, updated_at").maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the game settings.", error));
  if (!data) return fallback;
  const levels = {};
  for (const id of LEVEL_IDS) levels[id] = { ...DEFAULT_LEVELS[id], ...(data.levels?.[id] || {}) };
  return { enabled: data.enabled, triesPerDay: data.tries_per_day, levels, updatedAt: data.updated_at };
}

export async function saveGameSettings({ enabled, triesPerDay, levels }) {
  if (!supabase) return;
  const { error } = await supabase
    .from("game_settings")
    .update({ enabled: Boolean(enabled), tries_per_day: Math.round(triesPerDay), levels })
    .eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the game settings."));
}

// The rules for one level, ready for newGame().
export const levelRules = (settings, id) => ({ ...DEFAULT_RULES, ...settings.levels[id], enabled: settings.enabled });

// Finish a run: send the lane changes; the server replays them and pays
// on its own result (api/rush-finish.js). Returns its answer, including
// the replayed run.
const FINISH_COPY = {
  not_signed_in: "You were signed out, so this run didn't count.",
  bad_moves: "This run's moves didn't make sense to the server, so it didn't count. (bad_moves)",
  not_found: "The server couldn't find this run, so it didn't count. (not_found)",
  already: "This run was already saved.",
};
export async function finishRun(runId, moves) {
  if (!supabase || !runId) return null;
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch("/api/rush-finish", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ run: runId, moves }),
  });
  const body = await res.json().catch((e) => ({ error: "bad_reply", detail: e.message }));
  if (!res.ok) {
    throw new Error(FINISH_COPY[body.error] || `Couldn't save your run. (${body.error || res.status}${body.detail ? `: ${body.detail}` : ""})`);
  }
  return body;
}

// Your best run today on this level: the ghost for your next try.
export async function loadGhost(difficulty) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_ghost", { p_difficulty: difficulty });
  if (error) throw new Error(withReason("Couldn't load your ghost.", error));
  return data || null;
}

export async function loadMyGame() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("my_game");
  if (error) throw new Error(withReason("Couldn't load your best run.", error));
  return data || null;
}

// Best distance per driver at a level, "week" (Monday to Sunday) or "all"
// time. Your own row always comes back, even outside the top.
export async function loadGameLeaderboard(period = "week", difficulty = "medium", limit = 50) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("game_leaderboard", { p_limit: limit, p_period: period, p_difficulty: difficulty });
  if (error) throw new Error(withReason("Couldn't load the leaderboard.", error));
  return data || [];
}

export async function saveGameLook(vehicleId, { color, body, spoiler, rims, height }) {
  if (!supabase || !vehicleId) return;
  const { error } = await supabase
    .from("vehicles")
    .update({ game_color: color, game_body: body, game_spoiler: spoiler, game_rims: rims, game_height: height })
    .eq("id", vehicleId);
  if (error) throw new Error(withReason("Couldn't save your car's look.", error));
}

// ---------- scenery (078_rush_scenery.sql) ----------

const SCENERY_KEY = "tunr.rush.scenery";

// What's for sale (price in points) and what you own. The desert is free.
export async function loadScenery(userId) {
  const fallback = SCENERY_IDS.map((id, i) => ({ id, name: SCENERY[id].name, price: id === "desert" ? 0 : null, active: id === "desert", sort: i }));
  if (!supabase) return { list: fallback, owned: new Set(["desert"]) };
  const { data, error } = await supabase.from("rush_scenery").select("id, name, price, active, sort").order("sort");
  if (error) throw new Error(withReason("Couldn't load the scenery.", error));
  const owned = new Set(["desert"]);
  if (userId) {
    const mine = await supabase.from("rush_scenery_owned").select("scenery").eq("user_id", userId);
    if (mine.error) throw new Error(withReason("Couldn't load your scenery.", mine.error));
    for (const r of mine.data || []) owned.add(r.scenery);
  }
  for (const r of data || []) if (r.price === 0) owned.add(r.id);
  // Only places the game knows how to draw.
  return { list: (data || []).filter((r) => SCENERY[r.id]), owned };
}

const UNLOCK_COPY = {
  not_signed_in: "Sign in to unlock scenery.",
  unconfirmed: "Confirm your email first. Tap the link we emailed you.",
  not_found: "That scenery isn't available right now.",
  owned: "You already have that one.",
};

export function unlockMessage(result) {
  const status = result?.status || "unknown";
  if (status === "not_enough") return `You need ${result.cost} points and have ${result.balance}.`;
  return UNLOCK_COPY[status] || `Couldn't unlock that. (${status})`;
}

// Spend points on a place. Returns { status: "ok", balance } or why not.
export async function unlockScenery(id) {
  if (!supabase) throw new Error("Unlocking scenery needs an account.");
  const { data, error } = await supabase.rpc("unlock_rush_scenery", { p_scenery: id });
  if (error) throw new Error(withReason("Couldn't unlock that scenery.", error));
  return data || {};
}

// Admin: change a place's price, or take it off sale.
export async function saveSceneryPrice(id, patch) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.from("rush_scenery").update(patch).eq("id", id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that scenery price."));
}

// The place picked on this phone (checked against what you own when used).
export function loadPickedScenery() {
  try {
    const id = localStorage.getItem(SCENERY_KEY);
    return SCENERY[id] ? id : "desert";
  } catch (e) {
    console.warn("Couldn't read the scenery pick:", e.message);
    return "desert";
  }
}

export function savePickedScenery(id) {
  try {
    localStorage.setItem(SCENERY_KEY, id);
  } catch (e) {
    console.warn("Couldn't save the scenery pick:", e.message);
  }
}
