import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { cleanForSending } from "./clean.js";
import { uploadEventPhoto } from "./store.js";
import { compressImage } from "./image.js";

// Parts for sale (103_parts_marketplace.sql): listings, and a private chat
// between a buyer and the seller. Deals happen off the app.

export const CATEGORIES = [
  ["wheels", "🛞", "Wheels & tires"],
  ["exhaust", "💨", "Exhaust"],
  ["intake", "🌀", "Intake & turbo"],
  ["suspension", "🔩", "Suspension"],
  ["aero", "🪽", "Aero & body"],
  ["interior", "💺", "Interior"],
  ["lighting", "💡", "Lighting"],
  ["engine", "⚙️", "Engine"],
  ["electronics", "📟", "Electronics"],
  ["other", "📦", "Other"],
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map(([id, icon, name]) => [id, { icon, name }]));
export const CONDITIONS = [
  ["new", "New"],
  ["like_new", "Like new"],
  ["used", "Used"],
  ["for_parts", "For parts"],
];
export const CONDITION = Object.fromEntries(CONDITIONS);
export const MAX_PHOTOS = 6;

// "$1,800", "Free", or "Make an offer".
export function priceText(cents) {
  if (cents == null) return "Make an offer";
  if (cents === 0) return "Free";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 });
}

// "1,800" or "$1,800.50" typed in → cents; "" → null (make an offer).
export function parsePrice(text) {
  const t = String(text || "").replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return NaN;
  return Math.round(n * 100);
}

const ERRORS = {
  email_unconfirmed: "Confirm your email first. Tap the link we sent you.",
  rate_limit_listings: "That's 10 listings today. Try again tomorrow.",
  too_many_listings: "You have 40 live listings. Mark some sold first.",
  listing_photo_not_ours: "Upload the photos here in the app.",
  admins_remove_listings: "Only TUNR can remove a listing. Mark it sold, or delete it.",
  blocked: "You can't message this person.",
  rate_limit_messages: "Slow down a little: too many messages in a minute.",
};
const CHAT_ERRORS = {
  not_signed_in: "Sign in to message the seller.",
  unconfirmed: "Confirm your email to message sellers.",
  not_found: "This listing isn't available anymore.",
  own_listing: "That's your own listing.",
  blocked: "You can't message this seller.",
  sold: "This part has sold.",
};
const why = (error, fallback) => {
  const code = Object.keys(ERRORS).find((k) => String(error?.message || "").includes(k));
  return code ? ERRORS[code] : friendlyWriteError(error, fallback);
};
const need = () => {
  if (!supabase) throw new Error("The marketplace needs an internet connection to TUNR.");
};

// Live listings (and pending/sold ones, faded), newest first.
export async function loadListings({ category = null, q = "", status = "live", seller = null } = {}) {
  if (!supabase) return [];
  let query = supabase.from("listings_feed").select("*").order("created_at", { ascending: false }).limit(120);
  if (seller) query = query.eq("seller_id", seller).neq("status", "removed");
  else query = query.in("status", status === "live" ? ["active", "pending"] : ["active", "pending", "sold"]);
  if (category) query = query.eq("category", category);
  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) query = query.or(`title.ilike.%${term}%,fits.ilike.%${term}%,description.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error(withReason("Couldn't load the parts for sale.", error));
  return data || [];
}

export async function loadListing(id) {
  need();
  const { data, error } = await supabase.from("listings_feed").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(withReason("Couldn't load that listing.", error));
  if (!data) throw new Error("This listing isn't available anymore.");
  return data;
}

export async function uploadListingPhoto(file, userId) {
  if (!file.type.startsWith("image/")) throw new Error("Pick a photo.");
  return uploadEventPhoto(await compressImage(file), userId);
}

// draft: { title, description, category, condition, price (text), fits, city, photos }
function toRow(d) {
  const price = parsePrice(d.price);
  if (Number.isNaN(price)) throw new Error("Price: just the number, like 450.");
  if (!d.photos?.length) throw new Error("Add at least one photo.");
  if ((d.title || "").trim().length < 3) throw new Error("Give it a title (what the part is).");
  return {
    title: cleanForSending(d.title.trim()),
    description: cleanForSending((d.description || "").trim()),
    category: d.category,
    condition: d.condition,
    price_cents: price,
    fits: cleanForSending((d.fits || "").trim()) || null,
    city: (d.city || "").trim() || null,
    photos: d.photos,
  };
}

export async function createListing(draft) {
  need();
  const { data, error } = await supabase.from("listings").insert(toRow(draft)).select("id").single();
  if (error) throw new Error(why(error, "Couldn't post your listing."));
  return data.id;
}

export async function updateListing(id, patch) {
  need();
  const row = patch.title !== undefined ? toRow(patch) : patch;
  const { error } = await supabase.from("listings").update(row).eq("id", id);
  if (error) throw new Error(why(error, "Couldn't save that change."));
}

export async function deleteListing(id) {
  need();
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't delete the listing.", error));
}

// ---------- chats ----------

export async function startChat(listingId) {
  need();
  const { data, error } = await supabase.rpc("start_listing_chat", { p_listing: listingId });
  if (error) throw new Error(withReason("Couldn't open the chat.", error));
  if (data?.status !== "ok") throw new Error(CHAT_ERRORS[data?.status] || `Couldn't open the chat. (${data?.status || "no answer"})`);
  return data.thread;
}

export async function loadChats() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_listing_chats");
  if (error) throw new Error(withReason("Couldn't load your messages.", error));
  return data || [];
}

export async function loadThread(threadId) {
  need();
  const { data, error } = await supabase.from("listing_threads").select("id, listing_id, buyer_id, seller_id").eq("id", threadId).maybeSingle();
  if (error) throw new Error(withReason("Couldn't open that chat.", error));
  if (!data) throw new Error("That chat isn't available.");
  return data;
}

export async function loadMessages(threadId) {
  need();
  const { data, error } = await supabase.from("listing_messages").select("id, user_id, body, created_at").eq("thread_id", threadId).order("created_at").limit(500);
  if (error) throw new Error(withReason("Couldn't load the messages.", error));
  return data || [];
}

export async function sendMessage(threadId, body) {
  need();
  const text = (body || "").trim();
  if (!text) throw new Error("Write something first.");
  const { data, error } = await supabase.from("listing_messages").insert({ thread_id: threadId, body: cleanForSending(text) }).select("id, user_id, body, created_at").single();
  if (error) throw new Error(why(error, "Couldn't send that."));
  return data;
}

export async function markChatRead(threadId) {
  if (!supabase) return;
  const { error } = await supabase.rpc("read_listing_chat", { p_thread: threadId });
  if (error) console.warn("Couldn't mark the chat read:", error.message);
}

// New messages as they arrive. Returns a function to stop listening.
export function watchThread(threadId, onMessage) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`listing-chat:${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "listing_messages", filter: `thread_id=eq.${threadId}` }, (p) => onMessage(p.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
