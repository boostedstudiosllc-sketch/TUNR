// Merch shop (124_merch_shop.sql): products, settings, your orders, paying
// (api/shop → Stripe Checkout), and the admin's side. Rules: shopRules.js.
// Screens: Shop.jsx, ShopAdmin.jsx.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { ERRORS, errorMessage } from "./shopRules.js";

export async function loadShop() {
  if (!supabase) return { products: [], settings: null };
  const [p, s] = await Promise.all([
    supabase.from("shop_products").select("*").order("sort").order("created_at"),
    supabase.from("shop_settings").select("*").maybeSingle(),
  ]);
  if (p.error) throw new Error(withReason("Couldn't load the shop.", p.error));
  if (s.error) throw new Error(withReason("Couldn't load the shop settings.", s.error));
  return { products: p.data || [], settings: s.data };
}

// Your orders (admins: everyone's).
export async function loadOrders({ all = false } = {}) {
  if (!supabase) return [];
  let q = supabase.from("shop_orders").select("*").neq("status", "pending").order("created_at", { ascending: false }).limit(all ? 200 : 20);
  if (!all) {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return [];
    q = q.eq("user_id", data.user.id);
  }
  const { data, error } = await q;
  if (error) throw new Error(withReason("Couldn't load orders.", error));
  return data || [];
}

export async function checkout(cart) {
  if (!supabase) throw new Error("The shop needs a connection to TUNR.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(ERRORS.not_signed_in);
  let r, res;
  try {
    r = await fetch("/api/shop", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ items: cart }) });
    res = await r.json().catch(() => ({}));
  } catch (e) {
    throw new Error(`Couldn't reach TUNR. (${e.message})`);
  }
  if (!r.ok || !res.url) throw new Error(errorMessage(r.status, res));
  window.location.href = res.url;
}

// ---------- admin ----------

export async function saveSettings(patch) {
  const { error } = await supabase.from("shop_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the shop settings."));
}

export async function saveProduct(p) {
  const cents = Math.round(Number(p.price) * 100);
  if (!Number.isFinite(cents) || cents < 100) throw new Error("Price must be at least $1.");
  const sizes = String(p.sizesText || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stock = {};
  for (const [size, n] of Object.entries(p.stockText || {})) {
    if (String(n).trim() !== "" && sizes.includes(size)) stock[size] = Math.max(0, Math.round(Number(n) || 0));
  }
  const row = {
    name: String(p.name || "").trim(),
    description: String(p.description || "").trim() || null,
    price_cents: cents,
    photo_url: p.photo_url || null,
    emoji: p.emoji || "🛍️",
    sizes: sizes.length ? sizes : ["One size"],
    stock,
    active: p.active !== false,
  };
  if (row.name.length < 2) throw new Error("Give it a name.");
  const q = p.id ? supabase.from("shop_products").update(row).eq("id", p.id) : supabase.from("shop_products").insert({ ...row, sort: 99 });
  const { error } = await q;
  if (error) throw new Error(friendlyWriteError(error, `Couldn't save ${row.name}.`));
}

export async function shipOrder(id, tracking) {
  const { data, error } = await supabase.rpc("admin_ship_order", { p_id: id, p_tracking: tracking || null });
  if (error) throw new Error(withReason("Couldn't mark it shipped.", error));
  if (data?.status !== "ok") throw new Error(`Couldn't mark it shipped. (${data?.status === "not_paid" ? "it isn't paid" : data?.status})`);
}

export async function cancelOrder(id) {
  const { data, error } = await supabase.rpc("admin_cancel_order", { p_id: id });
  if (error) throw new Error(withReason("Couldn't cancel the order.", error));
  if (data?.status !== "ok") throw new Error(`Couldn't cancel the order. (${data?.status === "cant_cancel" ? "it's shipped or already cancelled" : data?.status})`);
}
