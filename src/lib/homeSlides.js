// The Discover banner's slides (119_home_slides.sql): loading them, and the
// admin's add / change / remove. Building the banner: slides.js.
import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { safeLink } from "./slides.js";

const COLS = "id, title, body, cta, link, image_url, theme, starts_at, ends_at, sort, active, created_at";

// Live slides for everyone; admins get drafts and scheduled ones too (RLS).
export async function loadHomeSlides() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("home_slides").select(COLS).order("sort").order("created_at");
  if (error) throw new Error(withReason("Couldn't load the banner.", error));
  return data || [];
}

// Only what the banner shows to everyone right now (for the admin list's labels).
export function liveNow(s, now = Date.now()) {
  return s.active && (!s.starts_at || Date.parse(s.starts_at) <= now) && (!s.ends_at || Date.parse(s.ends_at) > now);
}

export async function saveHomeSlide(slide) {
  if (!supabase) throw new Error("The banner needs a connection to TUNR.");
  const link = safeLink(slide.link);
  if (!link) throw new Error("Pick where the button goes, or paste an https:// address.");
  if ((slide.title || "").trim().length < 2) throw new Error("Give the slide a title.");
  const row = {
    title: slide.title.trim().slice(0, 60),
    body: (slide.body || "").trim().slice(0, 140) || null,
    cta: (slide.cta || "Open").trim().slice(0, 24) || "Open",
    link,
    image_url: slide.image_url || null,
    theme: slide.theme || "blue",
    starts_at: slide.starts_at || null,
    ends_at: slide.ends_at || null,
    sort: Number(slide.sort) || 0,
    active: slide.active !== false,
  };
  const q = slide.id ? supabase.from("home_slides").update(row).eq("id", slide.id) : supabase.from("home_slides").insert(row);
  const { error } = await q;
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the slide."));
}

export async function removeHomeSlide(id) {
  const { error } = await supabase.from("home_slides").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't remove the slide.", error));
}
