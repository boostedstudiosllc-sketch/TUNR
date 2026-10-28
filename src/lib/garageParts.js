// Garage parts that cost reward points (088_garage_parts.sql): the big wing,
// bronze / gold / chrome wheels, lift kit and slammed. Bought once, yours on
// every car. Everything else in the garage is free.

import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { loadAllAccess } from "./store.js";
import { unlockMessage } from "./rush.js";

// The part id for a style choice ("spoiler:wing"), or null for paint/body.
export const partId = (key, value) => (["spoiler", "rims", "height"].includes(key) && value ? `${key}:${value}` : null);

// { prices: { [id]: { name, price } }, owned: Set }. Loaded once and kept
// (prices hardly change); an unlock adds to it.
let cached = null;
export function loadGarageParts() {
  if (!cached) cached = fetchGarageParts().catch((e) => ((cached = null), Promise.reject(e)));
  return cached;
}

async function fetchGarageParts() {
  if (!supabase) return { prices: {}, owned: new Set() };
  const [{ data: parts, error }, { data: session }] = await Promise.all([supabase.from("garage_parts").select("id, name, price, active"), supabase.auth.getSession()]);
  if (error) throw new Error(withReason("Couldn't load the garage parts.", error));
  const prices = {};
  for (const p of parts || []) if (p.active && p.price > 0) prices[p.id] = { name: p.name, price: p.price };
  const uid = session?.session?.user?.id || null;
  if (!uid) return { prices, owned: new Set() };
  const [all, mine] = await Promise.all([loadAllAccess(uid), supabase.from("garage_parts_owned").select("part").eq("user_id", uid)]);
  if (all) return { prices, owned: new Set(Object.keys(prices)) };
  if (mine.error) throw new Error(withReason("Couldn't load your garage parts.", mine.error));
  return { prices, owned: new Set((mine.data || []).map((r) => r.part)) };
}

// Spend the points. Returns { balance }; throws with the reason if not.
export async function unlockGaragePart(id) {
  if (!supabase) throw new Error("Sign in to unlock parts.");
  const { data, error } = await supabase.rpc("unlock_garage_part", { p_part: id });
  if (error) throw new Error(withReason("Couldn't unlock that part.", error));
  if (data?.status !== "ok" && data?.status !== "owned") throw new Error(unlockMessage(data, "parts"));
  if (cached) cached = cached.then((c) => ({ ...c, owned: new Set([...c.owned, id]) }));
  return data;
}

// Admin: every part with its price and whether it's on sale.
export async function loadGaragePartsAdmin() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("garage_parts").select("id, name, price, active, sort").order("sort");
  if (error) throw new Error(withReason("Couldn't load the garage parts.", error));
  return data || [];
}

export async function saveGaragePartPrice(id, patch) {
  if (!supabase) throw new Error("Not connected.");
  const { error } = await supabase.from("garage_parts").update(patch).eq("id", id);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that part's price."));
}
