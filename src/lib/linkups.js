// Linkups: get-togethers starting now, later today or tomorrow. The rules (who
// sees the spot, who can join, the limits) live in the database
// (040_linkups.sql); this is the app's side of it.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { kickPush } from "./alerts.js";
import { cleanForSending } from "./clean.js";

export const LINKUP_KINDS = [
  { id: "photos", emoji: "📸", label: "Photos", blurb: "Shooting cars" },
  { id: "cruise", emoji: "🛣️", label: "Cruise", blurb: "Driving together" },
  { id: "hang", emoji: "🍔", label: "Hang", blurb: "Park up and chill" },
];

export const kindOf = (id) => LINKUP_KINDS.find((k) => k.id === id) || LINKUP_KINDS[2];

// Bumped when the rules change materially, so everyone agrees again.
export const LINKUP_TERMS_VERSION = 1;

// Headcount at which the host is reminded of the ground rules.
export const BIG_LINKUP = 25;

function need() {
  if (!supabase) throw new Error("Linkups need an account.");
}

function rowToLinkup(r) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    photographer: Boolean(r.photographer),
    photographerVerified: Boolean(r.photographer_verified),
    dayOne: Boolean(r.day_one),
    dayOneNumber: r.day_one_number ?? null,
    kind: r.kind,
    visibility: r.visibility,
    area: r.area || "",
    place: r.place || null,
    note: r.note || "",
    lat: r.lat,
    lng: r.lng,
    locked: Boolean(r.locked),
    goingAs: r.going_as,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    cancelled: Boolean(r.cancelled_at),
    headcount: r.headcount || 1,
    requests: r.requests || 0,
    myRole: r.my_role || null,
  };
}

export async function loadLinkups() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("linkups_feed").select("*").order("starts_at");
  if (error) throw new Error(withReason("Couldn't load linkups.", error));
  return (data || []).map(rowToLinkup);
}

export async function hasAcceptedLinkupTerms(userId) {
  if (!supabase || !userId) return false;
  const { data, error } = await supabase.from("linkup_agreements").select("version").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(withReason("Couldn't check the linkup rules.", error));
  return Boolean(data && data.version >= LINKUP_TERMS_VERSION);
}

export async function acceptLinkupTerms() {
  need();
  const { error } = await supabase.rpc("accept_linkup_terms", { p_version: LINKUP_TERMS_VERSION });
  if (error) throw new Error(withReason("Couldn't save that you agreed.", error));
}

// draft: { kind, visibility, place, area, lat, lng, note, startsAt (a Date), hours, goingAs }
export async function postLinkup(draft, userId) {
  need();
  const start = new Date(Math.max(Date.now(), new Date(draft.startsAt || Date.now()).getTime()));
  const end = new Date(start.getTime() + Math.min(4, Math.max(0.5, Number(draft.hours) || 2)) * 3600000);
  // Made here rather than read back: the "can you see it" check runs on a
  // snapshot from before the insert, so returning the new row would fail.
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("linkups")
    .insert({
      id,
      user_id: userId,
      kind: draft.kind,
      visibility: draft.visibility === "private" ? "private" : "public",
      place: draft.place.trim(),
      area: (draft.area || "").trim().slice(0, 80) || null,
      lat: draft.lat,
      lng: draft.lng,
      note: (draft.note || "").trim().slice(0, 280) || null,
      going_as: draft.goingAs || "car",
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't post your linkup."));
  kickPush();
  return id;
}

export async function joinLinkup(linkupId, userId, goingAs = "car") {
  need();
  const { error } = await supabase.from("linkup_members").insert({ linkup_id: linkupId, user_id: userId, going_as: goingAs });
  if (error) {
    if (error.code === "23505") throw new Error("You've already joined or asked to join this linkup.");
    throw new Error(friendlyWriteError(error, "Couldn't join that linkup."));
  }
  kickPush();
}

export async function setLinkupGoingAs(linkupId, userId, goingAs) {
  need();
  const { error } = await supabase.from("linkup_members").update({ going_as: goingAs }).eq("linkup_id", linkupId).eq("user_id", userId);
  if (error) throw new Error(withReason("Couldn't change how you're coming.", error));
}

// Leave (yourself), or as the host decline a request / remove someone.
export async function removeFromLinkup(linkupId, userId) {
  need();
  const { error } = await supabase.from("linkup_members").delete().eq("linkup_id", linkupId).eq("user_id", userId);
  if (error) throw new Error(withReason("Couldn't remove them from the linkup.", error));
}

export async function acceptRequest(linkupId, userId) {
  need();
  const { data, error } = await supabase
    .from("linkup_members")
    .update({ status: "in" })
    .eq("linkup_id", linkupId)
    .eq("user_id", userId)
    .select("status");
  if (error) throw new Error(withReason("Couldn't accept that request.", error));
  if (!data?.length || data[0].status !== "in") throw new Error("Couldn't accept that request (only the host can).");
  kickPush();
}

export async function cancelLinkup(linkupId) {
  need();
  const { error } = await supabase.from("linkups").update({ cancelled_at: new Date().toISOString() }).eq("id", linkupId);
  if (error) throw new Error(withReason("Couldn't cancel the linkup.", error));
  kickPush();
}

export async function updateLinkupNote(linkupId, note) {
  need();
  const { error } = await supabase.from("linkups").update({ note: note.trim().slice(0, 280) || null }).eq("id", linkupId);
  if (error) throw new Error(withReason("Couldn't save the note.", error));
}

export async function loadLinkupPeople(linkupId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("linkup_people", { p_linkup: linkupId });
  if (error) throw new Error(withReason("Couldn't load who's in.", error));
  return data || [];
}

export async function loadLinkupMessages(linkupId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("linkup_messages_with_author")
    .select("*")
    .eq("linkup_id", linkupId)
    .order("created_at")
    .limit(300);
  if (error) throw new Error(withReason("Couldn't load the chat.", error));
  return data || [];
}

export async function sendLinkupMessage(linkupId, body, userId) {
  need();
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  if (text.length > 500) throw new Error("That message is too long (500 characters max).");
  const { error } = await supabase.from("linkup_messages").insert({ linkup_id: linkupId, user_id: userId, body: cleanForSending(text) });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send that message."));
  kickPush();
}

export async function deleteLinkupMessage(id) {
  need();
  const { error } = await supabase.from("linkup_messages").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't delete that message.", error));
}

// Chat and membership changes on one linkup, live.
export function subscribeToLinkup(linkupId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`linkup:${linkupId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "linkup_messages", filter: `linkup_id=eq.${linkupId}` }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "linkup_members", filter: `linkup_id=eq.${linkupId}` }, () => onChange())
    .subscribe();
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") onChange();
  }, 15000);
  return () => {
    clearInterval(timer);
    supabase.removeChannel(channel);
  };
}

export async function loadLinkupStats() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("linkup_stats");
  if (error) throw new Error(withReason("Couldn't load linkup numbers.", error));
  return Array.isArray(data) ? data[0] || null : data;
}
