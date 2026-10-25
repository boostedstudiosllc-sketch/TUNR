// The Boosted Studios businesses page (056_boosted_businesses.sql).
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";

export async function loadBoostedBusinesses() {
  if (!supabase) return [];
  const [biz, perks] = await Promise.all([
    supabase.from("boosted_businesses").select("*").order("sort"),
    supabase.from("perks_public").select("partner_slug, title, discount_text"),
  ]);
  if (biz.error) throw new Error(withReason("Couldn't load the Boosted Studios businesses.", biz.error));
  const perkBySlug = new Map((perks.data || []).map((p) => [p.partner_slug, p]));
  return (biz.data || []).map((b) => ({ ...b, perk: b.partner_slug ? perkBySlug.get(b.partner_slug) || null : null }));
}

const blank = (v) => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};

// "@a, @b" (or an array) → ["a", "b"], or null when empty. Up to three.
export function instagramList(value) {
  const list = (Array.isArray(value) ? value : String(value || "").split(/[\s,]+/))
    .map((h) => String(h).trim().replace(/^@/, ""))
    .filter(Boolean)
    .slice(0, 3);
  return list.length ? list : null;
}

export async function saveBoostedBusiness(b) {
  if (!supabase) return;
  const row = {
    name: String(b.name || "").trim(),
    icon: blank(b.icon) || "🏁",
    tagline: blank(b.tagline),
    description: blank(b.description),
    website: blank(b.website),
    booking_url: blank(b.booking_url),
    instagram: instagramList(b.instagram),
    email: blank(b.email),
    phone: blank(b.phone),
    sort: Number(b.sort) || 100,
    active: b.active !== false,
  };
  const q = b.id
    ? supabase.from("boosted_businesses").update(row).eq("id", b.id)
    : supabase.from("boosted_businesses").insert({ ...row, slug: String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "business" });
  const { error } = await q;
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that business."));
}
