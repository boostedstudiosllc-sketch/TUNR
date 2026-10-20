// Forums and clubs: the app's side of 042_forums.sql and 043_clubs.sql.
import { supabase } from "./supabase.js";
import { friendlyWriteError, withReason } from "./errors.js";
import { kickPush } from "./alerts.js";

export const POST_TAGS = [
  { id: "question", label: "❓ Question" },
  { id: "build", label: "🏗️ Build" },
  { id: "spot", label: "📸 Photo spot" },
  { id: "guide", label: "📘 Guide" },
  { id: "discussion", label: "💬 Discussion" },
];
export const tagLabel = (id) => (POST_TAGS.find((t) => t.id === id) || POST_TAGS[4]).label;

export const CLUB_KINDS = [
  { id: "car_club", label: "🚗 Car club" },
  { id: "crew", label: "🏁 Crew" },
  { id: "photo", label: "📸 Photography" },
];
export const kindLabel = (id) => (CLUB_KINDS.find((k) => k.id === id) || CLUB_KINDS[0]).label;

// "G30 Fix-It!" → "g30-fix-it-k3f9" (the suffix keeps slugs unique).
export function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const tail = Math.random().toString(36).slice(2, 6);
  return `${base || "x"}-${tail}`.replace(/^-/, "").slice(0, 48).padEnd(3, "x");
}

function need() {
  if (!supabase) throw new Error("Forums and clubs need an account.");
}

// ---------- forums ----------

export async function loadForums() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("forums_list").select("*").order("last_post_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(withReason("Couldn't load forums.", error));
  return data || [];
}

export async function createForum({ name, description, icon }, userId) {
  need();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("forums").insert({
    id,
    slug: slugify(name),
    name: name.trim(),
    description: (description || "").trim() || null,
    icon: icon || "💬",
    created_by: userId,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't create the forum."));
  return id;
}

export async function setForumFollow(forumId, userId, follow) {
  need();
  const q = follow
    ? supabase.from("forum_follows").insert({ forum_id: forumId, user_id: userId })
    : supabase.from("forum_follows").delete().eq("forum_id", forumId).eq("user_id", userId);
  const { error } = await q;
  if (error && error.code !== "23505") throw new Error(withReason(follow ? "Couldn't follow the forum." : "Couldn't unfollow.", error));
}

export async function updateForum(forumId, patch) {
  need();
  const { error } = await supabase.from("forums").update(patch).eq("id", forumId);
  if (error) throw new Error(withReason("Couldn't update the forum.", error));
}

// sort: "hot" | "new" | "top". forumIds: limit to these (null = all).
// userId: only that person's posts (their profile).
export async function loadPosts({ forumId = null, forumIds = null, sort = "hot", tag = null, search = "", limit = 40, userId = null } = {}) {
  if (!supabase) return [];
  let q = supabase.from("forum_posts_feed").select("*").eq("removed", false);
  if (forumId) q = q.eq("forum_id", forumId);
  if (forumIds) q = q.in("forum_id", forumIds.length ? forumIds : ["00000000-0000-0000-0000-000000000000"]);
  if (tag) q = q.eq("tag", tag);
  if (userId) q = q.eq("user_id", userId);
  if (search.trim()) {
    const term = search.trim().replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }
  if (forumId) q = q.order("pinned", { ascending: false });
  q = sort === "new" ? q.order("created_at", { ascending: false }) : sort === "top" ? q.order("score", { ascending: false }) : q.order("hot", { ascending: false });
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(withReason("Couldn't load posts.", error));
  return data || [];
}

export async function loadPost(postId) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("forum_posts_feed").select("*").eq("id", postId).maybeSingle();
  if (error) throw new Error(withReason("Couldn't load the post.", error));
  return data;
}

// Photo-spot posts with a pin, for the map.
export async function loadPhotoSpots() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("forum_posts_feed")
    .select("id,title,place,lat,lng,photo_urls,score,forum_name")
    .eq("tag", "spot")
    .eq("removed", false)
    .not("lat", "is", null)
    .order("score", { ascending: false })
    .limit(200);
  if (error) throw new Error(withReason("Couldn't load photo spots.", error));
  return data || [];
}

export async function createPost(draft, userId) {
  need();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("forum_posts").insert({
    id,
    forum_id: draft.forumId,
    user_id: userId,
    title: draft.title.trim(),
    body: (draft.body || "").trim(),
    tag: draft.tag,
    photo_urls: draft.photoUrls || [],
    place: draft.tag === "spot" ? (draft.place || "").trim() || null : null,
    lat: draft.tag === "spot" ? draft.lat ?? null : null,
    lng: draft.tag === "spot" ? draft.lng ?? null : null,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't post that."));
  return id;
}

export async function updatePost(postId, patch) {
  need();
  const { error } = await supabase.from("forum_posts").update(patch).eq("id", postId);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't update the post."));
  kickPush();
}

export async function deletePost(postId) {
  need();
  const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
  if (error) throw new Error(withReason("Couldn't delete the post.", error));
}

export async function loadComments(postId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("forum_comments_feed").select("*").eq("post_id", postId).order("created_at");
  if (error) throw new Error(withReason("Couldn't load comments.", error));
  return data || [];
}

export async function addForumComment(postId, body, userId, parentId = null) {
  need();
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  const { error } = await supabase.from("forum_comments").insert({ post_id: postId, user_id: userId, body: text, parent_id: parentId });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't post that comment."));
  kickPush();
}

export async function deleteForumComment(id) {
  need();
  const { error } = await supabase.from("forum_comments").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't delete the comment.", error));
}

export async function modRemoveComment(id, removed = true) {
  need();
  const { error } = await supabase.rpc("remove_forum_comment", { p_comment: id, p_removed: removed });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't remove the comment."));
}

// value: 1, -1, or 0 to take a vote back.
export async function vote(kind, id, value) {
  need();
  const { error } = await supabase.rpc("vote_forum", { p_kind: kind, p_id: String(id), p_value: value });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save your vote."));
}

export async function reportContent(type, id, reason) {
  need();
  const { error } = await supabase.from("community_reports").insert({ target_type: type, target_id: String(id), reason: reason.trim() });
  if (error) {
    if (error.code === "23505") throw new Error("You've already reported this — thanks, we're on it.");
    throw new Error(friendlyWriteError(error, "Couldn't send the report."));
  }
}

// ---------- clubs ----------

export async function loadClubs() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("clubs_list").select("*").order("members", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load clubs.", error));
  return data || [];
}

export async function createClub(draft, userId) {
  need();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("clubs").insert({
    id,
    slug: slugify(draft.name),
    name: draft.name.trim(),
    kind: draft.kind,
    city: (draft.city || "").trim() || null,
    description: (draft.description || "").trim() || null,
    logo_url: draft.logoUrl || null,
    visibility: draft.visibility === "private" ? "private" : "public",
    created_by: userId,
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't create the club."));
  return id;
}

export async function updateClub(clubId, patch) {
  need();
  const { error } = await supabase.from("clubs").update(patch).eq("id", clubId);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't update the club."));
}

export async function deleteClub(clubId) {
  need();
  const { error } = await supabase.from("clubs").delete().eq("id", clubId);
  if (error) throw new Error(withReason("Couldn't delete the club.", error));
}

export async function joinClub(clubId, userId) {
  need();
  const { error } = await supabase.from("club_members").insert({ club_id: clubId, user_id: userId });
  if (error) {
    if (error.code === "23505") throw new Error("You're already in this club (or asked to join).");
    throw new Error(friendlyWriteError(error, "Couldn't join the club."));
  }
  kickPush();
}

export async function leaveClub(clubId, userId) {
  need();
  const { error } = await supabase.from("club_members").delete().eq("club_id", clubId).eq("user_id", userId);
  if (error) throw new Error(withReason("Couldn't leave the club.", error));
}

export async function setClubOnProfile(clubId, userId, show) {
  need();
  const { error } = await supabase.from("club_members").update({ show_on_profile: show }).eq("club_id", clubId).eq("user_id", userId);
  if (error) throw new Error(withReason("Couldn't change that.", error));
}

// action: "accept" | "remove" | "make_admin" | "make_member"
export async function manageClubMember(clubId, userId, action) {
  need();
  const { error } = await supabase.rpc("manage_club_member", { p_club: clubId, p_user: userId, p_action: action });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't change that member."));
  kickPush();
}

export async function loadClubPeople(clubId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("club_people", { p_club: clubId });
  if (error) throw new Error(withReason("Couldn't load the members.", error));
  return data || [];
}

export async function loadClubMeets(clubId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("club_meets", { p_club: clubId });
  if (error) throw new Error(withReason("Couldn't load the club's meets.", error));
  return data || [];
}

export async function loadPersonClubs(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("person_clubs", { p_user: userId });
  if (error) throw new Error(withReason("Couldn't load their clubs.", error));
  return data || [];
}

export async function loadClubMessages(clubId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("club_messages_with_author")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw new Error(withReason("Couldn't load the club chat.", error));
  return (data || []).reverse();
}

export async function sendClubMessage(clubId, body, userId) {
  need();
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  const { error } = await supabase.from("club_messages").insert({ club_id: clubId, user_id: userId, body: text });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send that message."));
  kickPush();
}

export async function deleteClubMessage(id) {
  need();
  const { error } = await supabase.from("club_messages").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't delete that message.", error));
}

export function subscribeToClub(clubId, onChange) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`club:${clubId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "club_messages", filter: `club_id=eq.${clubId}` }, () => onChange())
    .subscribe();
  const timer = setInterval(() => document.visibilityState === "visible" && onChange(), 20000);
  return () => {
    clearInterval(timer);
    supabase.removeChannel(channel);
  };
}

// ---------- admin ----------

export async function loadCommunityReports() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("community_report_queue");
  if (error) throw new Error(withReason("Couldn't load community reports.", error));
  return data || [];
}

export async function resolveCommunityReport(type, target, action) {
  need();
  const { error } = await supabase.rpc("resolve_community_report", { p_type: type, p_target: String(target), p_action: action });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't resolve that report."));
}

// "3h", "2d"
export function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days}d` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
