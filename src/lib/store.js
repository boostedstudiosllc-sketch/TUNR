// Data layer.
// With Supabase configured: events + RSVPs + profile live in the database
// (RSVPs/profile require sign-in; signed-out visitors browse shared events
// and keep device-local RSVPs). Without Supabase env vars everything falls
// back to seed data + localStorage so the app still runs.

import { cleanForSending, cleanOrNull, assertClean } from "./clean.js";
import { seedEvents } from "../data/events.js";
import { supabase } from "./supabase.js";
import { DEFAULT_TZ, parseLocal, isoInTz } from "./dates.js";
import { friendlyWriteError, withReason, authErrorMessage } from "./errors.js";
import { cleanUsername } from "./instagramName.js";
import { normalizePasscode } from "./passcode.js";
import { kickPush } from "./alerts.js";
import { compressImage } from "./image.js";
import { passwordProblem } from "./passwordRules.js";

const RSVP_KEY = "tunr.rsvps.v1";
const SUBMITTED_KEY = "tunr.submitted.v1";
const PROFILE_KEY = "tunr.profile.v1";
const TOS_KEY = "tunr.tos.v1";
const SIGNUP_SOURCE_KEY = "tunr.signup_source.v1";
const HOST_INVITE_KEY = "tunr.host_invite.v1";

// Bumped when the terms change in a way that affects anyone's rights, which
// re-prompts accounts that accepted an earlier version.
// 3: 18+, verification and badges, perks, membership, warranties,
// indemnity, termination, governing law (October 2026).
// 4: sticker orders, spending points, games, meets imported from
// Instagram (late October 2026).
export const TOS_VERSION = 4;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/unavailable: state stays in memory for the session
  }
}


function rowToEvent(row, counts, userId) {
  const c = counts.get(row.id) || { going: 0, interested: 0, cars: 0, photographers: 0 };
  const tz = row.timezone || DEFAULT_TZ;
  // events_public already blanked the address fields for private meets the
  // viewer isn't in; `locked` just tells the UI to show the teaser treatment.
  const locked = Boolean(row.locked);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    host: row.host,
    verified: row.verified,
    location: locked ? null : row.location,
    city: row.city,
    visibility: row.visibility || "public",
    accessMode: row.access_mode || "both",
    locked,
    membershipStatus: row.membership_status || null,
    passcode: row.passcode || null,
    timezone: tz,
    start: isoInTz(row.start_at, tz),
    end: isoInTz(row.end_at, tz),
    recurrence: row.recurrence,
    // Last day a seasonal series runs ("YYYY-MM-DD"), or null if it doesn't stop.
    recurrenceUntil: row.recurrence_until || null,
    vibe: row.vibe,
    meetStyle: row.meet_style || "open",
    showcaseNote: row.showcase_note || "",
    going: (row.base_going || 0) + c.going,
    interested: (row.base_interested || 0) + c.interested,
    // Of the people going (real RSVPs only): bringing a car, and shooting.
    cars: Number(c.cars) || 0,
    photographers: Number(c.photographers) || 0,
    tags: row.tags || [],
    description: row.description,
    source: row.source,
    sourceUrl: row.source_url,
    lng: row.lng,
    lat: row.lat,
    photoUrl: row.photo_url || null,
    flyerUrl: row.flyer_url || null,
    // A discrepancy three or more people have reported, e.g. "Cancelled or postponed".
    issueFlag: row.issue_flag || null,
    issueCount: row.issue_count || 0,
    submittedByUser: Boolean(userId && row.created_by === userId),
    // The owner or an accepted co-host: may edit, approve requests, see the
    // passcode. Only the owner (submittedByUser) deletes or manages co-hosts.
    canManage: Boolean(userId && (row.created_by === userId || row.viewer_is_host)),
    // Listed by TUNR rather than posted by an account — the organizer can
    // ask for it to be removed, corrected or handed over.
    imported: !row.created_by,
    createdBy: row.created_by || null,
    cohosts: Array.isArray(row.cohosts) ? row.cohosts : [],
  };
}

// ---------- events ----------

export async function loadEvents(userId = null) {
  if (!supabase) {
    return [...read(SUBMITTED_KEY, []), ...seedEvents];
  }
  let [eventsRes, countsRes, foundingRes, boostRes, pointsRes] = await Promise.all([
    supabase.from("events_public").select("*"),
    supabase.from("event_rsvp_counts").select("*"),
    supabase.from("verified_hosts").select("host").eq("founding", true),
    supabase.from("points_meets").select("event_id, points"),
    supabase.from("points_settings").select("base_meet_points").maybeSingle(),
  ]);

  // events_public arrives with migration 008. Until that has been run, read
  // the table directly — there are no private meets before it either, so
  // there is nothing for the view to redact.
  if (eventsRes?.error?.code === "PGRST205") {
    eventsRes = await supabase.from("events").select("*");
  }

  const rows = eventsRes?.data;
  if (eventsRes?.error || !Array.isArray(rows)) {
    // Network/db hiccup: degrade to local so the app still shows meets.
    return [...read(SUBMITTED_KEY, []), ...seedEvents];
  }

  // Counts are decorative: if that query fails, still show the meets rather
  // than blanking the whole feed.
  const countRows = Array.isArray(countsRes?.data) ? countsRes.data : [];
  const counts = new Map(
    countRows.filter((r) => r && r.event_id).map((r) => [r.event_id, r])
  );
  // Founding hosts are a badge on the card, so they're decorative too.
  const founding = new Set(
    (Array.isArray(foundingRes?.data) ? foundingRes.data : []).map((r) => normalizeHost(r.host))
  );
  // Points are decorative on the list too: boosted meets, and the amount any
  // meet gives for checking in (the database makes the real call).
  const boosts = new Map((Array.isArray(boostRes?.data) ? boostRes.data : []).map((r) => [r.event_id, r.points]));
  const basePoints = Number(pointsRes?.data?.base_meet_points ?? 0);
  return rows.map((r) => {
    const event = rowToEvent(r, counts, userId);
    event.foundingHost = founding.has(normalizeHost(r.host));
    event.boostPoints = boosts.get(r.id) ?? null;
    // Same rules as check_in_at_meet (052): a map pin, and a one-off posted
    // at least a day ahead.
    const postedAhead =
      Boolean(r.recurrence) || (r.start_at && r.created_at && new Date(r.created_at) <= new Date(new Date(r.start_at).getTime() - 864e5));
    event.basePoints = basePoints > 0 && r.lat != null && r.lng != null && postedAhead ? basePoints : 0;
    return event;
  });
}

// Same rule as public.normalize_host(): host names match case-insensitively.
function normalizeHost(host) {
  return String(host || "").trim().toLowerCase();
}

export async function submitEvent(draft, userId = null) {
  if (supabase && userId) {
    // Post under the account's own handle. Verification binds a host name to
    // an account, so "you" for everyone would make the badge meaningless.
    let host = draft.host;
    if (!host) {
      const { data: p } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      host = p?.username || "you";
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: cleanForSending(draft.title || "Untitled Meet"),
        host,
        location: draft.location || "TBA",
        city: draft.city || "Atlanta, GA",
        start_at: draft.start ? parseLocal(draft.start, DEFAULT_TZ).toISOString() : null,
        vibe: draft.vibe || "JDM",
        meet_style: draft.meetStyle === "showcase" ? "showcase" : "open",
        showcase_note: draft.meetStyle === "showcase" ? cleanForSending((draft.showcaseNote || "").trim().slice(0, 200)) || null : null,
        tags: ["Just Posted"],
        description: cleanForSending(draft.description || "No description yet."),
        source: draft.igLink ? "instagram" : null,
        source_url: draft.igLink || null,
        photo_url: draft.photoUrl || null,
        flyer_url: draft.flyerUrl || null,
        flyer_hash: draft.flyerHash || null,
        lng: draft.lng ?? -84.39,
        lat: draft.lat ?? 33.75,
        timezone: DEFAULT_TZ,
        visibility: draft.visibility === "private" ? "private" : "public",
        access_mode: draft.accessMode || "both",
        created_by: userId,
      })
      .select()
      .single();
    if (error) {
      throw new Error(friendlyWriteError(error, "Couldn't post the meet. Try again."));
    }
    return data;
  }

  // Local fallback (guest or no backend)
  const submitted = read(SUBMITTED_KEY, []);
  const event = {
    id: "user-" + Date.now(),
    title: draft.title || "Untitled Meet",
    host: draft.host || "you",
    verified: false,
    location: draft.location || "TBA",
    city: draft.city || "Atlanta, GA",
    start: draft.start || null,
    end: draft.end || null,
    recurrence: null,
    timezone: DEFAULT_TZ,
    vibe: draft.vibe || "JDM",
    going: 1,
    interested: 0,
    tags: ["Just Posted"],
    description: draft.description || "No description yet.",
    source: draft.igLink ? "instagram" : null,
    sourceUrl: draft.igLink || null,
    photoUrl: draft.photoUrl || null,
    flyerUrl: draft.flyerUrl || null,
    lng: draft.lng ?? -84.39,
    lat: draft.lat ?? 33.75,
    visibility: draft.visibility === "private" ? "private" : "public",
    accessMode: draft.accessMode || "both",
    locked: false,
    submittedByUser: true,
    canManage: true,
  };
  write(SUBMITTED_KEY, [event, ...submitted]);
  return event;
}

// ---------- rsvps ----------

export function loadLocalRsvps() {
  return read(RSVP_KEY, {});
}

export async function loadRsvps(userId = null) {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("rsvps")
      .select("event_id,status")
      .eq("user_id", userId);
    if (!error && data) {
      const map = {};
      data.forEach((r) => {
        map[r.event_id] = r.status;
      });
      return map;
    }
  }
  return loadLocalRsvps();
}

// How you're going to each meet you've said yes to: { eventId: "car" | … }.
export async function loadGoingAs(userId) {
  if (!supabase || !userId) return {};
  const { data, error } = await supabase.from("rsvps").select("event_id,going_as").eq("user_id", userId);
  if (error || !Array.isArray(data)) return {};
  return Object.fromEntries(data.map((r) => [r.event_id, r.going_as || "car"]));
}

// Change how you're going to a meet you've already said yes to. Coming only
// to shoot brings no car; otherwise your main car comes along.
export async function saveGoingAs(eventId, goingAs, userId) {
  if (!supabase || !userId) return;
  const { data: primary } =
    goingAs === "photographer"
      ? { data: null }
      : await supabase.from("vehicles").select("id").eq("owner_id", userId).eq("is_primary", true).maybeSingle();
  const { error } = await supabase
    .from("rsvps")
    .update({ going_as: goingAs, vehicle_id: primary?.id || null })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw new Error(withReason("Couldn't change how you're going.", error));
}

export async function saveRsvp(rsvps, eventId, status, userId = null, goingAs = "car") {
  const turningOff = rsvps[eventId] === status;
  const next = { ...rsvps };
  if (turningOff) delete next[eventId];
  else next[eventId] = status;

  if (supabase && userId) {
    if (turningOff) {
      const { error } = await supabase.from("rsvps").delete().eq("user_id", userId).eq("event_id", eventId);
      if (error) throw new Error(withReason("Couldn't clear your RSVP.", error));
    } else if (status === "not_going") {
      const { error } = await supabase
        .from("rsvps")
        .upsert({ user_id: userId, event_id: eventId, status, vehicle_id: null }, { onConflict: "user_id,event_id" });
      if (error) throw new Error(withReason("Couldn't save your RSVP.", error));
    } else {
      // Bring your main car by default. A car isn't required to RSVP, so this
      // stays null for anyone who hasn't added one — they just don't appear in
      // the meet's car list. Going only as a photographer brings no car.
      const withCar = goingAs !== "photographer";
      const { data: primary } = withCar
        ? await supabase
            .from("vehicles")
            .select("id")
            .eq("owner_id", userId)
            .eq("is_primary", true)
            .maybeSingle()
        : { data: null };
      const { error } = await supabase.from("rsvps").upsert(
        {
          user_id: userId,
          event_id: eventId,
          status,
          going_as: goingAs,
          vehicle_id: withCar ? primary?.id || null : null,
        },
        { onConflict: "user_id,event_id" }
      );
      if (error) throw new Error(withReason("Couldn't save your RSVP.", error));
    }
  } else {
    write(RSVP_KEY, next);
  }
  return next;
}

// ---------- vehicles ----------

export async function loadCarMakes() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("car_makes").select("name").order("name");
  if (error || !Array.isArray(data)) return [];
  // 'Other' is the escape hatch, so it belongs at the bottom rather than
  // alphabetically between Nissan and Porsche.
  const names = data.map((r) => r.name);
  return [...names.filter((n) => n !== "Other"), ...names.filter((n) => n === "Other")];
}

export async function loadVehicles(ownerId) {
  if (!supabase || !ownerId) return [];
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("owner_id", ownerId)
    .order("is_primary", { ascending: false })
    .order("created_at");
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function saveVehicle(vehicle, ownerId) {
  if (!supabase || !ownerId) throw new Error("Sign in first");
  const payload = {
    owner_id: ownerId,
    year: vehicle.year ? Number(vehicle.year) : null,
    make: vehicle.make,
    model: cleanForSending((vehicle.model || "").trim()),
    build_notes: cleanOrNull(vehicle.buildNotes),
    photo_url: vehicle.photoUrl || null,
  };
  // Its paint for the 3D garage and the games (the body is worked out from
  // the make and model until someone picks one).
  if (vehicle.paint) payload.game_color = vehicle.paint;
  if (!payload.make) throw new Error("Pick a make.");
  if (!payload.model) throw new Error("Add the model.");

  const query = vehicle.id
    ? supabase.from("vehicles").update(payload).eq("id", vehicle.id)
    : supabase.from("vehicles").insert(payload);
  const { error } = await query;
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save that car. Try again."));
}

export async function deleteVehicle(vehicleId) {
  if (!supabase) return;
  await supabase.from("vehicles").delete().eq("id", vehicleId);
}

// The trigger from 015 demotes whichever car was primary before.
export async function setPrimaryVehicle(vehicleId) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase
    .from("vehicles")
    .update({ is_primary: true })
    .eq("id", vehicleId);
  if (error) throw new Error(withReason("Couldn't set that as your main car.", error));
}

export async function uploadVehiclePhoto(file, userId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 6 * 1024 * 1024) throw new Error("Image must be under 6MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Storage policy scopes writes to a folder named after the uploader.
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("vehicle-photos").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(withReason("Upload failed. Try a different image.", error));
  return supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
}

// ---------- attendees ----------

// Reads the view, which publishes make and model only — never who.
export async function loadAttendees(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("event_attendees")
    .select("make,model,status")
    .eq("event_id", eventId)
    .order("created_at");
  if (error || !Array.isArray(data)) return [];
  return data;
}

// ---------- profile ----------

export function loadLocalProfile() {
  return read(PROFILE_KEY, { username: "", city: "Atlanta, GA" });
}

// Whether this account has all access (081): every paid and locked
// feature, without paying, inviting or earning it. Asked once per account.
const allAccessCache = new Map();
export async function loadAllAccess(userId) {
  if (!supabase || !userId) return false;
  if (!allAccessCache.has(userId)) {
    allAccessCache.set(
      userId,
      supabase
        .from("profiles")
        .select("all_access")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            allAccessCache.delete(userId);
            console.warn("Couldn't check all access:", error.message);
            return false;
          }
          return Boolean(data?.all_access);
        })
    );
  }
  return allAccessCache.get(userId);
}

export async function loadProfile(userId = null) {
  if (supabase && userId) {
    const [{ data }, { data: hostRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("verified_hosts").select("founding").eq("user_id", userId),
    ]);
    const foundingHost = Array.isArray(hostRows) && hostRows.some((r) => r.founding);
    if (data) {
      return {
        username: data.username || "",
        city: data.city || "Atlanta, GA",
        isAdmin: Boolean(data.is_admin),
        // All access (081): the operator's account gets every paid and locked feature.
        isMember: Boolean(data.is_member || data.all_access),
        allAccess: Boolean(data.all_access),
        memberSince: data.member_since || null,
        dayOne: Boolean(data.day_one),
        dayOneNumber: data.day_one_number ?? null,
        foundingHost,
        isPhotographer: Boolean(data.is_photographer),
        photoPage: data.photo_page || "",
        avatarUrl: data.avatar_url || "",
        bio: data.bio || "",
        profileColor: data.profile_color || "",
      };
    }
    return { username: "", city: "Atlanta, GA", isAdmin: false, isMember: false };
  }
  return loadLocalProfile();
}

export async function saveProfile(profile, userId = null) {
  if (supabase && userId) {
    if (profile.username) assertClean(profile.username, "usernames");
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: userId,
        username: profile.username || null,
        city: profile.city,
        ...(profile.isPhotographer !== undefined ? { is_photographer: Boolean(profile.isPhotographer) } : {}),
        ...(profile.photoPage !== undefined ? { photo_page: profile.photoPage.trim() || null } : {}),
        ...(profile.avatarUrl !== undefined ? { avatar_url: String(profile.avatarUrl ?? "").trim() || null } : {}),
        ...(profile.bio !== undefined ? { bio: cleanOrNull(profile.bio) } : {}),
        ...(profile.profileColor !== undefined ? { profile_color: profile.profileColor || null } : {}),
      });
    if (error) {
      if (error.code === "23505") throw new Error("That username is taken — pick another.");
      throw new Error(friendlyWriteError(error, "Couldn't save your profile."));
    }
    return profile;
  }
  write(PROFILE_KEY, profile);
  return profile;
}

// A profile photo: shrunk to 512px on the device, then stored in your own
// folder of the avatars bucket (the only place the database accepts a
// profile photo from, and one you can delete from). Returns the public URL
// for saveProfile's avatarUrl.
export async function uploadAvatar(file, userId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (!file) throw new Error("Couldn't upload your profile photo. (no file picked)");
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  let small;
  try {
    small = await compressImage(file, { maxDim: 512 });
  } catch (e) {
    throw new Error(withReason("Couldn't shrink that photo for upload.", e));
  }
  if (small.size > 6 * 1024 * 1024) throw new Error("Image must be under 6MB.");
  const ext = small.type === "image/jpeg" ? "jpg" : (small.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, small, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(withReason("Couldn't upload your profile photo.", error));
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

// Delete an old profile photo from storage once it's been replaced or removed.
// Only ever touches your own folder.
export async function removeAvatarFile(url, userId) {
  if (!supabase || !userId || !url) return;
  const marker = "/storage/v1/object/public/avatars/";
  const at = url.indexOf(marker);
  if (at === -1) return;
  const path = decodeURIComponent(url.slice(at + marker.length));
  if (!path.startsWith(`${userId}/`)) return;
  const { error } = await supabase.storage.from("avatars").remove([path]);
  if (error) throw new Error(withReason("Your profile is saved, but the old photo couldn't be deleted.", error));
}

// Every profile photo you've uploaded, for account deletion.
export async function removeAllAvatarFiles(userId) {
  if (!supabase || !userId) return;
  const { data, error } = await supabase.storage.from("avatars").list(userId, { limit: 1000 });
  if (error) throw new Error(withReason("Couldn't delete your profile photos.", error));
  const paths = (data || []).map((f) => `${userId}/${f.name}`);
  if (!paths.length) return;
  const { error: removeError } = await supabase.storage.from("avatars").remove(paths);
  if (removeError) throw new Error(withReason("Couldn't delete your profile photos.", removeError));
}

// ---------- terms of service ----------

export function loadTosAccepted() {
  return read(TOS_KEY, null);
}

// Accepting an older version doesn't count once the terms have materially
// changed — otherwise bumping TOS_VERSION would be decorative. With a userId,
// only that account's agreement counts (a guest's doesn't carry over to an
// account: new accounts read and agree to the terms themselves).
export function hasAcceptedCurrentTos(userId = null) {
  const record = loadTosAccepted();
  if (!record || Number(record.version) < TOS_VERSION) return false;
  return userId ? record.userId === userId : true;
}

// method: "terms_screen" (the full terms, agreed to, for an account),
// "guest_welcome" (Continue as guest on the welcome page, beside a line
// saying that's agreeing) or "guest_terms" (a guest agreeing to changed
// terms). Guests' agreements stay on this device only.
export async function saveTosAccepted(userId = null, method = "terms_screen") {
  const record = { acceptedAt: new Date().toISOString(), version: TOS_VERSION, method, userId: userId || null };
  write(TOS_KEY, record);
  if (supabase && userId) await recordTermsAcceptance(userId, record);
  return record;
}

async function recordTermsAcceptance(userId, record) {
  // The server stamps the time; the device's is kept alongside as evidence.
  const { error } = await supabase.from("terms_acceptances").insert({
    user_id: userId,
    version: record.version,
    method: record.method === "account_form" ? "account_form" : "terms_screen",
    client_accepted_at: record.acceptedAt || null,
  });
  return !error;
}

const syncing = new Map();

// Called on every sign-in. Records an agreement made on this device (maybe
// before the account existed) if the account doesn't have that version yet,
// and returns true when the account has agreed to the current terms — so a
// new device doesn't ask again.
export function syncTosToAccount(user) {
  if (!supabase || !user) return Promise.resolve(false);
  // Auth fires several events on sign-in; one sync per account at a time.
  if (!syncing.has(user.id)) {
    const run = doSyncTos(user).finally(() => syncing.delete(user.id));
    syncing.set(user.id, run);
  }
  return syncing.get(user.id);
}

async function doSyncTos(user) {
  const { data, error } = await supabase
    .from("terms_acceptances")
    .select("version,accepted_at")
    .eq("user_id", user.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return false;
  let accountVersion = data?.version || 0;

  // On this device, or carried in the sign-up for an email confirmed elsewhere.
  const meta = user.user_metadata || {};
  const fromSignup = meta.tos_version
    ? { version: meta.tos_version, acceptedAt: meta.tos_accepted_at, method: "account_form" }
    : null;
  // An agreement on this device counts for this account if it was this
  // account's (or from before agreements were tied to one), never a guest's.
  const saved = loadTosAccepted();
  const onDevice = saved && !String(saved.method || "").startsWith("guest") && (!saved.userId || saved.userId === user.id) ? saved : null;
  const local =
    onDevice && Number(onDevice.version) >= Number(fromSignup?.version || 0) ? onDevice : fromSignup;

  if (local && Number(local.version) > accountVersion) {
    if (await recordTermsAcceptance(user.id, local)) accountVersion = Number(local.version);
  }

  if (accountVersion >= TOS_VERSION) {
    if (!hasAcceptedCurrentTos(user.id)) {
      write(TOS_KEY, { acceptedAt: data?.accepted_at || new Date().toISOString(), version: accountVersion, method: "terms_screen", userId: user.id });
    }
    return true;
  }
  return false;
}

// ---------- auth ----------

export function hasBackend() {
  return Boolean(supabase);
}

export async function isUsernameTaken(username) {
  if (!supabase || !username) return false;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  return Boolean(data);
}

// ---------- signup source ----------

// /join?ref=tiktok remembers "tiktok" until the account exists. Kept on the
// device because Google sign-in leaves the page and comes back, and also put
// in the account's metadata for email sign-ups, whose confirmation link often
// opens in a different browser.
export function cleanSignupSource(value) {
  const s = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  return s || null;
}

export function rememberSignupSource(value) {
  const s = cleanSignupSource(value);
  if (s) write(SIGNUP_SOURCE_KEY, s);
}

function pendingSignupSource(user = null) {
  return cleanSignupSource(user?.user_metadata?.signup_source) || read(SIGNUP_SOURCE_KEY, null);
}

function clearSignupSource() {
  try {
    localStorage.removeItem(SIGNUP_SOURCE_KEY);
  } catch {
    // nothing to clear
  }
}

// Whether accounts created now still get the Day 1 badge.
export async function dayOneOpen() {
  if (!supabase) return true;
  const { data } = await supabase
    .from("launch_settings")
    .select("day_one_closes_at")
    .maybeSingle();
  if (!data || !data.day_one_closes_at) return true;
  return new Date(data.day_one_closes_at) > new Date();
}

// Admin only — the view returns nothing for anyone else.
export async function loadSignupStats() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("signup_stats")
    .select("source,signups,day_one,last_7_days")
    .order("signups", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data;
}

// Admin-only (the views return nothing for anyone else): headline numbers,
// the last 60 days, and per-host and per-meet traction.
export async function loadAdminInsights() {
  if (!supabase) return null;
  const [overview, daily, hosts, meets] = await Promise.all([
    supabase.from("admin_overview").select("*").maybeSingle(),
    supabase.from("admin_daily").select("*").order("day"),
    supabase.from("admin_host_stats").select("*"),
    supabase.from("admin_meet_stats").select("*"),
  ]);
  if (overview.error || !overview.data) return null;
  return {
    overview: overview.data,
    daily: daily.data || [],
    hosts: hosts.data || [],
    meets: meets.data || [],
  };
}

// Where an emailed link or Google sends people back to. Signing up from /join
// or /hosts returns there, so they land on the next step rather than the bare
// app. Needs <site>/join and <site>/hosts in Supabase's redirect URLs; without
// them Supabase falls back to the site URL, which is where everyone went before.
// Adding <site>/** covers both, query string included.
function returnUrl() {
  const match = /^\/(join|hosts)\/?$/.exec(window.location.pathname);
  if (!match) return window.location.origin;
  // A confirmation email often opens in another browser, which won't have
  // the invite saved — so it goes back in the link.
  const invite = match[1] === "hosts" ? pendingHostInvite() : null;
  return `${window.location.origin}/${match[1]}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
}

export async function signUpWithPassword(email, password, username) {
  if (!supabase) throw new Error("Backend not configured");
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);

  if (await isUsernameTaken(username)) {
    throw new Error("That username is taken — pick another.");
  }

  const source = pendingSignupSource();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        ...(source && { signup_source: source }),
        // The terms come next, on their own screen, once signed in.
      },
      emailRedirectTo: returnUrl(),
    },
  });
  if (error) throw new Error(friendlyAuthError(error));

  // With email confirmation on, there's no session until the link is clicked.
  if (!data.session) return { needsConfirmation: true };

  await supabase
    .from("profiles")
    .upsert({ id: data.user.id, username, city: "Atlanta, GA", ...(source && { signup_source: source }) });
  clearSignupSource();
  return { signedIn: true };
}

// Through TUNR's server (api/sign-in.js), which applies the lockout: 10
// wrong passwords in a row lock the account for 30 minutes.
export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error("Backend not configured");
  const body = await callApi("/api/sign-in", { email, password });
  if (body.error) throw new Error(signInErrorMessage(body));
  const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  if (error) throw new Error(friendlyAuthError(error));
  return { signedIn: true };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function signInErrorMessage(b) {
  if (b.error === "bad_login") {
    return b.left <= 5
      ? `Wrong email or password. ${b.left} ${b.left === 1 ? "try" : "tries"} left before this account locks for 30 minutes.`
      : "Wrong email or password.";
  }
  if (b.error === "account_locked") {
    return `Too many wrong passwords, so this account is locked for ${plural(b.minutes, "more minute")}. Reset your password to get in now.`;
  }
  if (b.error === "too_many_tries") return `Too many wrong passwords from this network. Try again in ${plural(b.minutes, "minute")}.`;
  if (b.error === "missing_fields") return "Enter your email and password.";
  if (b.error === "sign_in_failed") return authErrorMessage({ message: b.detail || "", code: b.code || "" });
  return `Couldn't sign in. (${b.error}${b.detail ? `: ${b.detail}` : ""})`;
}

// POST to one of TUNR's server functions; the reply's JSON, with `error`
// set when it failed.
async function callApi(path, payload, token = null) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { error: "network", detail: e.message };
  }
  const body = await res.json().catch((e) => ({ error: `http_${res.status}`, detail: e.message }));
  return res.ok ? body : { ...body, error: body.error || `http_${res.status}` };
}

export async function sendPasswordReset(email) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(friendlyAuthError(error));
}

// Through TUNR's server (api/password.js), which applies the policy:
// 8+ characters, 3 of 4 kinds, none of your last 24 passwords.
export async function updatePassword(password) {
  if (!supabase) throw new Error("Backend not configured");
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);
  const { data } = await supabase.auth.getSession();
  const body = await callApi("/api/password", { password }, data?.session?.access_token);
  if (!body.error) return;
  if (body.error === "password_reused") throw new Error("That's one of your last 24 passwords. Pick one you haven't used before.");
  if (body.error === "weak_password") throw new Error(body.detail || "That password is too weak.");
  if (body.error === "not_signed_in") throw new Error("You were signed out. Sign in again (or use a fresh reset link), then set the password.");
  throw new Error(`Couldn't change your password. (${body.error}${body.detail ? `: ${body.detail}` : ""})`);
}

function friendlyAuthError(error) {
  return authErrorMessage(error);
}

// Ensures a profile row exists for a freshly confirmed account, carrying the
// username and the link they signed up from.
export async function ensureProfile(user) {
  if (!supabase || !user) return;
  const source = pendingSignupSource(user);
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (data) {
    // Another call created the row first; fill the source in if it's missing.
    // The database ignores this once a source is set. Only for a row made in
    // the last day, so an old account that taps the bio link and logs in
    // isn't counted as a new sign-up from it.
    const fresh = Date.now() - new Date(data.created_at).getTime() < 24 * 60 * 60 * 1000;
    if (source && fresh && !data.signup_source) {
      await supabase.from("profiles").update({ signup_source: source }).eq("id", user.id);
    }
    if (source) clearSignupSource();
    return;
  }
  const username = user.user_metadata?.username || null;
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username, city: "Atlanta, GA", ...(source && { signup_source: source }) });
  if (!error && source) clearSignupSource();
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: returnUrl() },
  });
  if (error) throw new Error(friendlyAuthError(error));
}

// True once the Google provider is switched on in the Supabase dashboard, so
// the button only appears when it will actually work.
export async function googleEnabled() {
  if (!supabase) return false;
  try {
    const res = await fetch(
      import.meta.env.VITE_SUPABASE_URL + "/auth/v1/settings",
      { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } }
    );
    const json = await res.json();
    return Boolean(json?.external?.google);
  } catch {
    return false;
  }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  if (!supabase) {
    callback(null);
    return () => {};
  }
  // Single source of truth. supabase-js emits INITIAL_SESSION once it has
  // finished reading any session out of the URL, so subscribing is enough —
  // pairing it with a getSession() call races and can clobber a fresh sign-in
  // back to signed-out.
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    // The event tells the app when someone arrived from a password-reset
    // link (PASSWORD_RECOVERY), so it can ask for the new password.
    callback(session?.user || null, event);
  });
  return () => subscription.unsubscribe();
}

// Reads the sign-in result out of the URL after the emailed link lands, then
// strips the tokens from the address bar. Returns an error message when the
// link failed (expired, already used, wrong browser) so the UI can say so
// instead of silently showing a signed-out app.
export async function completeSignInFromUrl() {
  if (!supabase || typeof window === "undefined") return null;

  const hash = window.location.hash.startsWith("#")
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  const query = new URLSearchParams(window.location.search);

  const errorDescription = hash.get("error_description") || query.get("error_description");
  const hasToken = Boolean(hash.get("access_token"));
  const code = query.get("code");

  let result = null;

  if (errorDescription) {
    result = { error: errorDescription };
  } else if (code) {
    // A link minted while the app still used PKCE.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    result = error
      ? { error: "That sign-in link couldn't be completed. Request a new one." }
      : { signedIn: true };
  } else if (hasToken) {
    // detectSessionInUrl already consumed it; confirm the session took.
    const { data } = await supabase.auth.getSession();
    result = data.session ? { signedIn: true } : { error: "Sign-in link expired. Request a new one." };
  }

  if (result) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  return result;
}

// ---------- editing your own meets ----------

export async function updateEvent(eventId, fields) {
  if (!supabase) throw new Error("Backend not configured");
  const payload = {};
  if (fields.title !== undefined) payload.title = cleanForSending(fields.title);
  if (fields.location !== undefined) payload.location = fields.location;
  if (fields.city !== undefined) payload.city = fields.city;
  if (fields.description !== undefined) payload.description = cleanForSending(fields.description);
  if (fields.vibe !== undefined) payload.vibe = fields.vibe;
  if (fields.meetStyle !== undefined) {
    payload.meet_style = fields.meetStyle === "showcase" ? "showcase" : "open";
    payload.showcase_note = payload.meet_style === "showcase" ? (fields.showcaseNote || "").trim().slice(0, 200) || null : null;
  }
  if (fields.photoUrl !== undefined) payload.photo_url = fields.photoUrl;
  if (fields.flyerUrl !== undefined) payload.flyer_url = fields.flyerUrl;
  if (fields.flyerHash !== undefined) payload.flyer_hash = fields.flyerHash;
  if (typeof fields.lat === "number" && typeof fields.lng === "number") {
    payload.lat = fields.lat;
    payload.lng = fields.lng;
  }
  if (fields.start !== undefined) {
    payload.start_at = fields.start ? parseLocal(fields.start, DEFAULT_TZ).toISOString() : null;
  }
  // Row-level security turns an update you're no longer allowed to make into
  // "0 rows changed", not an error — so check something was actually saved.
  const { data, error } = await supabase.from("events").update(payload).eq("id", eventId).select("id");
  if (error) throw new Error(withReason("Couldn't save those changes.", error));
  if (!data || !data.length) throw new Error("You can't edit this meet any more.");
}

// ---------- co-hosts ----------

// invited | not_owner | no_such_user | self | already | limit | not_found
export async function inviteCohost(eventId, username) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("invite_cohost", {
    p_event_id: eventId,
    p_username: username,
  });
  if (error) throw new Error(withReason("Couldn't send that invite.", error));
  return data;
}

// Everyone on a meet: accepted for anyone, pending too for the owner.
export async function loadEventCohosts(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("event_cohosts")
    .select("id,host,user_id,status")
    .eq("event_id", eventId)
    .order("created_at");
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function removeCohost(id) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.from("event_cohosts").delete().eq("id", id);
  if (error) throw new Error(withReason("Couldn't remove that co-host.", error));
}

// Invites waiting on this account, with the meet they're for.
export async function loadMyCohostInvites(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("event_cohosts")
    .select("id,event_id")
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error || !Array.isArray(data) || !data.length) return [];
  const { data: events } = await supabase
    .from("events_public")
    .select("id,title,host,start_at,city")
    .in("id", data.map((r) => r.event_id));
  const byId = new Map((events || []).map((e) => [e.id, e]));
  return data.map((r) => ({ ...r, event: byId.get(r.event_id) || null }));
}

// accepted | declined | not_found
export async function respondCohostInvite(id, accept) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("respond_cohost_invite", {
    p_id: id,
    p_accept: accept,
  });
  if (error) throw new Error(withReason("Couldn't answer that invite.", error));
  return data;
}

// ---------- listing requests ----------

// Anyone can file one, signed in or not. Not read back: only admins can see
// requests, so the insert can't ask for the row.
export async function fileListingRequest({ eventId, kind, name, contact, details }) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.from("listing_requests").insert({
    event_id: eventId,
    kind,
    requester_name: (name || "").trim() || null,
    contact: (contact || "").trim(),
    details: cleanOrNull(details),
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't send that. Try again, or email us."));
}

// Admin-only; RLS returns nothing for everyone else.
export async function loadListingRequests() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("listing_requests_queue")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function resolveListingRequest(id, status, adminId) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase
    .from("listing_requests")
    .update({ status, resolved_at: new Date().toISOString(), resolved_by: adminId })
    .eq("id", id);
  if (error) throw new Error(withReason("Couldn't update that request.", error));
}

// ---------- host verification ----------

export async function loadMyVerification(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("host_verifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function requestVerification(host, instagramHandle, userId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  const handle = String(instagramHandle || "").trim().replace(/^@/, "");
  if (!host) throw new Error("Set a username on your profile first.");
  if (!handle) throw new Error("Add the Instagram account that runs this meet.");
  const { data, error } = await supabase
    .from("host_verifications")
    .insert({ user_id: userId, host, instagram_handle: handle, status: "pending" })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("You've already requested this. Check back soon.");
    throw new Error(withReason("Couldn't send that request. Try again.", error));
  }
  return data;
}

export async function withdrawVerification(id) {
  if (!supabase) return;
  await supabase.from("host_verifications").delete().eq("id", id);
}

// ---------- host invites ----------

// The token rides in the URL, but Google sign-in leaves the page and comes
// back to a bare /hosts — so it's kept on the device until it's spent.
export function rememberHostInvite(token) {
  if (token) write(HOST_INVITE_KEY, String(token).slice(0, 64));
}

export function pendingHostInvite() {
  return read(HOST_INVITE_KEY, null);
}

export function clearHostInvite() {
  try {
    localStorage.removeItem(HOST_INVITE_KEY);
  } catch {
    // nothing to clear
  }
}

// { instagram_handle, status: valid | used | expired } or null if unknown.
export async function peekHostInvite(token) {
  if (!supabase || !token) return null;
  const { data, error } = await supabase.rpc("peek_host_invite", { p_token: token });
  if (error || !Array.isArray(data) || !data.length) return null;
  return data[0];
}

// verified | already_yours | used | expired | not_found | needs_username |
// host_taken | not_signed_in
export async function redeemHostInvite(token) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("redeem_host_invite", { p_token: token });
  if (error) throw new Error(withReason("Couldn't use that invite. Try again.", error));
  return data;
}

export function hostInviteUrl(token) {
  return `${window.location.origin}/hosts?invite=${encodeURIComponent(token)}`;
}

// Admin-only.
// With a listing (and the request that asked for it), redeeming the invite
// also hands that listing over to the organizer.
export async function createHostInvite(handle, eventId = null, requestId = null) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("create_host_invite", {
    p_handle: handle,
    p_event_id: eventId,
    p_request_id: requestId,
  });
  if (error) {
    if (/bad_handle/.test(error.message)) throw new Error("That isn't a valid Instagram handle.");
    if (/not_claimable/.test(error.message)) throw new Error("That listing already has an owner.");
    throw new Error(withReason("Couldn't create that invite.", error));
  }
  return data;
}

// Admin-only; RLS returns nothing for everyone else.
export async function loadHostInvites() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("host_invites")
    .select("id,token,instagram_handle,created_at,expires_at,used_at,used_host")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !Array.isArray(data)) return [];
  return data;
}

// Admin-only; RLS returns nothing for everyone else.
export async function loadPendingVerifications() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("host_verifications")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function decideVerification(id, approve, note = null) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("decide_host_verification", {
    p_id: id,
    p_approve: approve,
    p_note: note,
  });
  if (error) throw new Error(withReason("Couldn't record that decision.", error));
  return data;
}

// ---------- private meets ----------

// The passcode is checked inside the database, so a wrong guess reveals
// nothing and the real code never reaches the client.
export async function redeemPasscode(eventId, passcode) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("redeem_event_passcode", {
    p_event_id: eventId,
    p_passcode: normalizePasscode(passcode),
  });
  if (error) return "error";
  return data || "error";
}

export async function requestToJoin(eventId, userId) {
  if (!supabase || !userId) throw new Error("Sign in to request access");
  const { error } = await supabase
    .from("event_members")
    .insert({ event_id: eventId, user_id: userId, status: "pending" });
  if (error) {
    if (error.code === "23505") throw new Error("You've already asked to join this meet.");
    throw new Error(withReason("Couldn't send that request. Try again.", error));
  }
}

// Host-side: everyone who has asked for or been given access to their meet.
export async function loadJoinRequests(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("event_members_with_profile")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function approveJoinRequest(eventId, userId) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase
    .from("event_members")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new Error(withReason("Couldn't approve that request.", error));
  if (!data || !data.length) throw new Error("You can't manage this meet any more.");
}

export async function denyJoinRequest(eventId, userId) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase
    .from("event_members")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error(withReason("Couldn't update that request.", error));
}

// ---------- photos ----------

export async function uploadEventPhoto(file, userId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 6 * 1024 * 1024) throw new Error("Image must be under 6MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("event-photos").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(withReason("Upload failed. Try a different image.", error));
  const { data } = supabase.storage.from("event-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Has the AI (Gemini) read a flyer the user just uploaded (see api/read-flyer.js) and
// returns the fields it found, for the post-a-meet form to fill in.
export async function readFlyer(imageUrl, caption = "") {
  if (!supabase) throw new Error("Reading flyers needs the live app.");
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in first.");
  let res;
  try {
    res = await fetch("/api/read-flyer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ imageUrl, caption }),
    });
  } catch (error) {
    throw new Error(withReason("Couldn't reach TUNR. Check your connection and try again.", error));
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.flyer) return body.flyer;
  const message =
    {
      rate_limit_flyers: "That's a lot of flyers for one day. Fill this one in by hand, or try again later.",
      unreadable: "We couldn't read that image. Fill the details in by hand.",
      busy: "The flyer reader hit Google's limit.",
      not_configured: "Flyer reading isn't switched on yet. Fill the details in by hand.",
      not_signed_in: "Sign in first.",
      bad_key: "Flyer reading isn't set up right (the AI key was refused). Fill the details in by hand.",
      no_model: "Flyer reading isn't set up right (AI model not found). Fill the details in by hand.",
    }[body.error] || `Couldn't read the flyer (${body.error || res.status}). Fill the details in by hand.`;
  // Say what actually happened, in Google's words when it gave a reason.
  throw new Error(body.detail ? `${message} (${body.detail})` : message);
}

// The meet's going count after every RSVP change, for its ticker chart.
export async function loadGoingHistory(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("meet_going_history", { p_event_id: eventId });
  return error || !Array.isArray(data) ? [] : data;
}

// Meets already carrying (nearly) the same flyer — a duplicate, or another
// account's copy to check the date against.
export async function findFlyerMatches(hash, excludeId = null) {
  if (!supabase || !hash) return [];
  const { data, error } = await supabase.rpc("find_flyer_matches", {
    p_hash: hash,
    p_exclude: excludeId,
  });
  return error || !Array.isArray(data) ? [] : data;
}

// ---------- comments ----------

export async function loadComments(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("comments_with_author")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !Array.isArray(data)) return [];
  return data;
}

// Calls onChange whenever a message is added to or removed from this meet's
// chat, so an open meet page stays live. Returns the unsubscribe function.
// Polls as well, in case Realtime is off for the project or the socket drops.
export function subscribeToComments(eventId, onChange, { pollMs = 20000 } = {}) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`comments:${eventId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments", filter: `event_id=eq.${eventId}` },
      () => onChange()
    )
    .subscribe();
  const timer = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") onChange();
  }, pollMs);
  return () => {
    clearInterval(timer);
    supabase.removeChannel(channel);
  };
}

export async function addComment(eventId, body, userId) {
  if (!supabase || !userId) throw new Error("Sign in to comment");
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  if (text.length > 1000) throw new Error("Comment is too long.");
  const { error } = await supabase
    .from("comments")
    .insert({ event_id: eventId, user_id: userId, body: cleanForSending(text) });
  if (error) {
    throw new Error(friendlyWriteError(error, "Couldn't post that comment."));
  }
}

export async function deleteComment(commentId) {
  if (!supabase) return;
  await supabase.from("comments").delete().eq("id", commentId);
}

// ---------- blocking ----------

export async function blockUser(userId, blockedId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (userId === blockedId) throw new Error("You can't block yourself.");
  const { error } = await supabase
    .from("blocks")
    .upsert({ blocker_id: userId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id" });
  if (error) throw new Error(withReason("Couldn't block that account.", error));
}

export async function unblockUser(userId, blockedId) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
  if (error) throw new Error(withReason("Couldn't unblock that account.", error));
}

export async function loadBlockedAccounts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("blocked_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load your blocked accounts.", error));
  return Array.isArray(data) ? data : [];
}

// ---------- account deletion ----------

// Irreversible. The database drops the auth user and everything hanging off
// it; the meets they posted go too, since nobody would be left to run them.
export async function deleteMyAccount() {
  if (!supabase) throw new Error("Backend not configured");
  // Profile photos live in storage, not the database, so they go first.
  const { data: who } = await supabase.auth.getUser();
  if (who?.user) await removeAllAvatarFiles(who.user.id);
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(withReason("Couldn't delete the account. Try again.", error));
  await supabase.auth.signOut();
}

// ---------- follows ----------

// ---------- people ----------

// A person's public profile and how you're connected. null if not found;
// { unavailable: true } if they've blocked you.
export async function getPerson(personId) {
  if (!supabase || !personId) return null;
  const { data, error } = await supabase.rpc("get_person", { p_user: personId });
  if (error || !Array.isArray(data) || !data.length) return null;
  return data[0];
}

export async function followPerson(personId, userId, following) {
  if (!supabase || !userId) throw new Error("Sign in to follow people");
  if (following) {
    await supabase.from("user_follows").delete().eq("follower_id", userId).eq("followee_id", personId);
    return;
  }
  const { error } = await supabase
    .from("user_follows")
    .upsert({ follower_id: userId, followee_id: personId }, { onConflict: "follower_id,followee_id" });
  if (error) throw new Error(withReason("Couldn't follow that account.", error));
}

export async function removeFollower(personId, userId) {
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("user_follows")
    .delete()
    .eq("follower_id", personId)
    .eq("followee_id", userId);
  if (error) throw new Error(withReason("Couldn't remove that follower.", error));
}

// kind: "followers" | "following" — your own lists only.
export async function loadConnections(kind) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_connections", { p_kind: kind });
  return error || !Array.isArray(data) ? [] : data;
}

export async function restrictUser(userId, personId, restrict) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (restrict) {
    const { error } = await supabase
      .from("restrictions")
      .upsert({ restricter_id: userId, restricted_id: personId }, { onConflict: "restricter_id,restricted_id" });
    if (error) throw new Error(withReason("Couldn't restrict that account.", error));
  } else {
    const { error } = await supabase.from("restrictions").delete().eq("restricter_id", userId).eq("restricted_id", personId);
    if (error) throw new Error(withReason("Couldn't unrestrict that account.", error));
  }
}

export async function loadRestrictedAccounts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("restricted_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(withReason("Couldn't load your restricted accounts.", error));
  return Array.isArray(data) ? data : [];
}

// value: 1 (thumbs up) or -1 (thumbs down). Tapping your current choice
// again takes it back.
export async function reactToComment(commentId, userId, value, current) {
  if (!supabase || !userId) throw new Error("Sign in to react");
  if (current === value) {
    await supabase.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", userId);
    return null;
  }
  const { error } = await supabase
    .from("comment_reactions")
    .upsert({ comment_id: commentId, user_id: userId, value }, { onConflict: "comment_id,user_id" });
  if (error) throw new Error(withReason("Couldn't save that.", error));
  return value;
}

export async function loadFollows(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.from("follows").select("host").eq("user_id", userId);
  if (error || !Array.isArray(data)) return [];
  return data.map((r) => r.host);
}

export async function loadHostFollowerCount(host) {
  if (!supabase || !host) return 0;
  const { data, error } = await supabase
    .from("host_follower_counts")
    .select("followers")
    .eq("host", host)
    .maybeSingle();
  if (error || !data) return 0;
  return Number(data.followers) || 0;
}

export async function toggleFollow(host, userId, following) {
  if (!supabase || !userId) throw new Error("Sign in to follow hosts");
  if (following) {
    await supabase.from("follows").delete().eq("user_id", userId).eq("host", host);
  } else {
    await supabase.from("follows").upsert({ user_id: userId, host }, { onConflict: "user_id,host" });
  }
}

// ---------- meet photos ----------

export async function loadMeetPhotos(eventId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("meet_photos_with_author")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error || !Array.isArray(data)) return [];
  return data;
}

export async function uploadMeetPhoto(file, userId) {
  if (!supabase || !userId) throw new Error("Sign in first");
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
  if (file.size > 6 * 1024 * 1024) throw new Error("Image must be under 6MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("meet-photos").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(withReason("Upload failed. Try a different image.", error));
  return supabase.storage.from("meet-photos").getPublicUrl(path).data.publicUrl;
}

export async function addMeetPhoto(eventId, photoUrl, caption, userId) {
  if (!supabase || !userId) throw new Error("Sign in to add photos");
  const { error } = await supabase.from("meet_photos").insert({
    event_id: eventId,
    user_id: userId,
    photo_url: photoUrl,
    caption: cleanOrNull(caption),
  });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't add that photo."));
}

// The uploader, the meet's host and admins can delete; RLS decides which.
export async function deleteMeetPhoto(photoId) {
  if (!supabase) return;
  await supabase.from("meet_photos").delete().eq("id", photoId);
}

// ---------- perks ----------

// perks_public shows every live offer to everyone but nulls the code and
// link for non-members, so the paywall is the database's job rather than
// the screen's.
export async function loadPerks() {
  if (!supabase) return [];
  const [perksRes, countsRes] = await Promise.all([
    supabase.from("perks_public").select("*").order("partner_name"),
    supabase.from("perk_redemption_counts").select("*"),
  ]);
  const rows = perksRes?.data;
  if (perksRes?.error || !Array.isArray(rows)) return [];
  const counts = new Map(
    (Array.isArray(countsRes?.data) ? countsRes.data : []).map((r) => [r.perk_id, r.redemptions])
  );
  return rows.map((r) => ({ ...r, redemptions: Number(counts.get(r.id) || 0) }));
}

// Recorded so a partner can be shown how many people we sent them. Rejected
// by policy for non-members, so a failure here is not worth surfacing.
export async function recordRedemption(perkId, userId) {
  if (!supabase || !userId) return;
  await supabase.from("perk_redemptions").insert({ perk_id: perkId, user_id: userId });
}

// ---------- moderation (admin) ----------

// RLS returns nothing to non-admins, so this is empty for everyone else.
export async function loadReportQueue(includeResolved = false) {
  if (!supabase) return [];
  let q = supabase.from("reports_queue").select("*").order("created_at", { ascending: false });
  if (!includeResolved) q = q.is("resolved_at", null);
  const { data, error } = await q.limit(100);
  if (error || !Array.isArray(data)) return [];
  return data;
}

// Taking a meet down closes its open reports in the same call.
export async function moderateEvent(eventId, hidden) {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("moderate_event", {
    p_event_id: eventId,
    p_hidden: hidden,
  });
  if (error) throw new Error(withReason("Couldn't apply that.", error));
  return data;
}

export async function dismissReport(reportId) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase
    .from("reports")
    .update({ resolved_at: new Date().toISOString(), outcome: "dismissed" })
    .eq("id", reportId);
  if (error) throw new Error(withReason("Couldn't dismiss that report.", error));
}

// ---------- analytics ----------

export function track(name, props = {}) {
  if (!supabase) return;
  try {
    supabase.auth.getUser().then(({ data }) => {
      supabase
        .from("analytics_events")
        .insert({ name, props, user_id: data?.user?.id || null })
        .then(() => {}, () => {});
    });
  } catch {
    // analytics must never break the app
  }
}

// ---------- reports ----------

export async function submitReport(eventId, reason, note, userId, suggested = "") {
  if (!supabase || !userId) throw new Error("Sign in to report a meet");
  const { error } = await supabase.from("reports").insert({
    event_id: eventId,
    reporter_id: userId,
    reason,
    note: cleanOrNull(note),
    suggested: suggested?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("You already reported this meet — thanks.");
    throw new Error(withReason("Couldn't submit the report. Try again.", error));
  }
}

// ---------- verified photographers ----------

// Admins: "verified", or "auto" (not verified).
export async function setPhotographerStatus(userId, status) {
  if (!supabase) throw new Error("Sign in first.");
  const { error } = await supabase.rpc("set_photographer_status", { p_user: userId, p_status: status });
  if (error) throw new Error(friendlyWriteError(error, "Couldn't change their photographer check."));
  kickPush();
}

// ---------- Instagram import (admin) ----------

// Is @tunr.app connected, and how did the last run go (076_instagram_import.sql).
export async function loadInstagramStatus() {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase.rpc("instagram_status");
  if (error) throw new Error(withReason("Couldn't load the Instagram import status.", error));
  return data || {};
}

export async function loadInstagramPosts() {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase
    .from("instagram_posts")
    .select("media_id, account, permalink, posted_at, status, reason, event_id, image_url, attempts, updated_at")
    .order("posted_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(withReason("Couldn't load the imported posts.", error));
  return data || [];
}

const INSTAGRAM_ERRORS = {
  instagram_not_connected: "Instagram isn't connected yet (steps above).",
  instagram_token_expired: "The Instagram token expired. Make a new one and put it in Vercel as INSTAGRAM_ACCESS_TOKEN.",
  not_configured: "The flyer reader isn't set up: GEMINI_API_KEY is missing in Vercel.",
  not_allowed: "Only admins can start an import.",
  too_soon: "An import just ran. Try again in a few minutes.",
};

// Run the import now (api/instagram-sync.js). Returns the run's counts.
export async function runInstagramImport() {
  if (!supabase) throw new Error("Backend not configured");
  const { data } = await supabase.auth.getSession();
  const out = await callApi("/api/instagram-sync", {}, data?.session?.access_token);
  if (out.error) {
    const known = INSTAGRAM_ERRORS[out.error];
    throw new Error(known ? `${known}${out.detail && out.error !== "not_allowed" ? ` (${out.detail})` : ""}` : `Couldn't run the import. (${out.error}${out.detail ? `: ${out.detail}` : ""})`);
  }
  return out;
}

// Other accounts to import meets from (077_instagram_sources.sql).
export async function loadInstagramSources() {
  if (!supabase) throw new Error("Backend not configured");
  const { data, error } = await supabase
    .from("instagram_sources")
    .select("username, active, added_at, last_checked_at, last_count, last_error")
    .order("added_at");
  if (error) throw new Error(withReason("Couldn't load the accounts to watch.", error));
  return data || [];
}

export async function addInstagramSource(text) {
  if (!supabase) throw new Error("Backend not configured");
  const username = cleanUsername(text);
  if (!username) throw new Error("That isn't an Instagram name. Type it like @nawfside.tm.");
  const { error } = await supabase.from("instagram_sources").insert({ username });
  if (error) {
    if (error.code === "23505") throw new Error(`@${username} is already on the list.`);
    throw new Error(friendlyWriteError(error, `Couldn't add @${username}.`));
  }
  return username;
}

export async function removeInstagramSource(username) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.from("instagram_sources").delete().eq("username", username);
  if (error) throw new Error(friendlyWriteError(error, `Couldn't remove @${username}.`));
}
