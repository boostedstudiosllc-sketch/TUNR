// Data layer.
// With Supabase configured: events + RSVPs + profile live in the database
// (RSVPs/profile require sign-in; signed-out visitors browse shared events
// and keep device-local RSVPs). Without Supabase env vars everything falls
// back to seed data + localStorage so the app still runs.

import { seedEvents } from "../data/events.js";
import { supabase } from "./supabase.js";
import { DEFAULT_TZ, parseLocal } from "./dates.js";
import { friendlyWriteError } from "./errors.js";
import { normalizePasscode } from "./passcode.js";

const RSVP_KEY = "tunr.rsvps.v1";
const SUBMITTED_KEY = "tunr.submitted.v1";
const PROFILE_KEY = "tunr.profile.v1";
const TOS_KEY = "tunr.tos.v1";

// Bumped when the terms change in a way that affects anyone's rights, which
// re-prompts accounts that accepted an earlier version.
export const TOS_VERSION = 2;

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

function isoInTz(ts, tz) {
  // timestamptz -> "YYYY-MM-DDTHH:MM" wall clock in the event's own timezone,
  // which is the shape the date helpers expect.
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc, x) => ((acc[x.type] = x.value), acc), {});
  const hour = String(Number(p.hour) % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

function rowToEvent(row, counts, userId) {
  const c = counts.get(row.id) || { going: 0, interested: 0 };
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
    vibe: row.vibe,
    going: (row.base_going || 0) + c.going,
    interested: (row.base_interested || 0) + c.interested,
    tags: row.tags || [],
    description: row.description,
    source: row.source,
    sourceUrl: row.source_url,
    lng: row.lng,
    lat: row.lat,
    photoUrl: row.photo_url || null,
    submittedByUser: Boolean(userId && row.created_by === userId),
  };
}

// ---------- events ----------

export async function loadEvents(userId = null) {
  if (!supabase) {
    return [...read(SUBMITTED_KEY, []), ...seedEvents];
  }
  let [eventsRes, countsRes] = await Promise.all([
    supabase.from("events_public").select("*"),
    supabase.from("event_rsvp_counts").select("*"),
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
  return rows.map((r) => rowToEvent(r, counts, userId));
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
        title: draft.title || "Untitled Meet",
        host,
        location: draft.location || "TBA",
        city: draft.city || "Atlanta, GA",
        start_at: draft.start ? parseLocal(draft.start, DEFAULT_TZ).toISOString() : null,
        vibe: draft.vibe || "JDM",
        tags: ["Just Posted"],
        description: draft.description || "No description yet.",
        source: draft.igLink ? "instagram" : null,
        source_url: draft.igLink || null,
        photo_url: draft.photoUrl || null,
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
    lng: draft.lng ?? -84.39,
    lat: draft.lat ?? 33.75,
    visibility: draft.visibility === "private" ? "private" : "public",
    accessMode: draft.accessMode || "both",
    locked: false,
    submittedByUser: true,
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

export async function saveRsvp(rsvps, eventId, status, userId = null) {
  const turningOff = rsvps[eventId] === status;
  const next = { ...rsvps };
  if (turningOff) delete next[eventId];
  else next[eventId] = status;

  if (supabase && userId) {
    if (turningOff) {
      await supabase.from("rsvps").delete().eq("user_id", userId).eq("event_id", eventId);
    } else {
      // Bring your main car by default. A car isn't required to RSVP, so this
      // stays null for anyone who hasn't added one — they just don't appear in
      // the meet's car list.
      const { data: primary } = await supabase
        .from("vehicles")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_primary", true)
        .maybeSingle();
      await supabase.from("rsvps").upsert(
        {
          user_id: userId,
          event_id: eventId,
          status,
          ...(primary?.id ? { vehicle_id: primary.id } : {}),
        },
        { onConflict: "user_id,event_id" }
      );
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
    model: (vehicle.model || "").trim(),
    build_notes: (vehicle.buildNotes || "").trim() || null,
    photo_url: vehicle.photoUrl || null,
  };
  if (!payload.make) throw new Error("Pick a make.");
  if (!payload.model) throw new Error("Add the model.");

  const query = vehicle.id
    ? supabase.from("vehicles").update(payload).eq("id", vehicle.id)
    : supabase.from("vehicles").insert(payload);
  const { error } = await query;
  if (error) throw new Error("Couldn't save that car. Try again.");
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
  if (error) throw new Error("Couldn't set that as your main car.");
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
  if (error) throw new Error("Upload failed. Try a different image.");
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

export async function loadProfile(userId = null) {
  if (supabase && userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) {
      return {
        username: data.username || "",
        city: data.city || "Atlanta, GA",
        isAdmin: Boolean(data.is_admin),
      };
    }
    return { username: "", city: "Atlanta, GA", isAdmin: false };
  }
  return loadLocalProfile();
}

export async function saveProfile(profile, userId = null) {
  if (supabase && userId) {
    await supabase
      .from("profiles")
      .upsert({ id: userId, username: profile.username || null, city: profile.city });
    return profile;
  }
  write(PROFILE_KEY, profile);
  return profile;
}

// ---------- terms of service ----------

export function loadTosAccepted() {
  return read(TOS_KEY, null);
}

// Accepting an older version doesn't count once the terms have materially
// changed — otherwise bumping TOS_VERSION would be decorative.
export function hasAcceptedCurrentTos() {
  const record = loadTosAccepted();
  return Boolean(record && Number(record.version) >= TOS_VERSION);
}

export async function saveTosAccepted(userId = null) {
  const record = { acceptedAt: new Date().toISOString(), version: TOS_VERSION };
  write(TOS_KEY, record);
  if (supabase && userId) {
    await supabase
      .from("profiles")
      .upsert({ id: userId, tos_accepted_at: record.acceptedAt, tos_version: TOS_VERSION });
  }
  return record;
}

// Called after sign-in: persist a device-local ToS acceptance to the account.
export async function syncTosToAccount(userId) {
  if (!supabase || !userId) return;
  const local = loadTosAccepted();
  if (!local) return;
  const { data } = await supabase
    .from("profiles")
    .select("tos_accepted_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.tos_accepted_at) {
    await supabase
      .from("profiles")
      .upsert({ id: userId, tos_accepted_at: local.acceptedAt, tos_version: local.version });
  }
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

export async function signUpWithPassword(email, password, username) {
  if (!supabase) throw new Error("Backend not configured");

  if (await isUsernameTaken(username)) {
    throw new Error("That username is taken — pick another.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(friendlyAuthError(error));

  // With email confirmation on, there's no session until the link is clicked.
  if (!data.session) return { needsConfirmation: true };

  await supabase
    .from("profiles")
    .upsert({ id: data.user.id, username, city: "Atlanta, GA" });
  return { signedIn: true };
}

export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error));
  return { signedIn: true };
}

export async function sendPasswordReset(email) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function updatePassword(password) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error));
}

function friendlyAuthError(error) {
  const msg = (error && error.message) || "";
  const code = (error && error.code) || "";
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox.";
  if (/already registered|already been registered/i.test(msg))
    return "That email already has an account. Log in instead.";
  if (/password/i.test(msg) && /(short|least|6)/i.test(msg))
    return "Password must be at least 6 characters.";
  if (/rate|too many/i.test(msg) || code === "over_email_send_rate_limit")
    return "Too many attempts. Wait a few minutes and try again.";
  if (/invalid/i.test(msg) && /email/i.test(msg)) return "That email address isn't valid.";
  return msg || "Something went wrong. Try again.";
}

// Ensures a profile row exists for a freshly confirmed account, carrying the
// username chosen at sign-up.
export async function ensureProfile(user) {
  if (!supabase || !user) return;
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  const username = user.user_metadata?.username || null;
  await supabase.from("profiles").upsert({ id: user.id, username, city: "Atlanta, GA" });
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
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
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
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
  if (fields.title !== undefined) payload.title = fields.title;
  if (fields.location !== undefined) payload.location = fields.location;
  if (fields.city !== undefined) payload.city = fields.city;
  if (fields.description !== undefined) payload.description = fields.description;
  if (fields.vibe !== undefined) payload.vibe = fields.vibe;
  if (fields.photoUrl !== undefined) payload.photo_url = fields.photoUrl;
  if (fields.start !== undefined) {
    payload.start_at = fields.start ? parseLocal(fields.start, DEFAULT_TZ).toISOString() : null;
  }
  const { error } = await supabase.from("events").update(payload).eq("id", eventId);
  if (error) throw new Error("Couldn't save those changes.");
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
    throw new Error("Couldn't send that request. Try again.");
  }
  return data;
}

export async function withdrawVerification(id) {
  if (!supabase) return;
  await supabase.from("host_verifications").delete().eq("id", id);
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
  if (error) throw new Error("Couldn't record that decision.");
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
    throw new Error("Couldn't send that request. Try again.");
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
  const { error } = await supabase
    .from("event_members")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error("Couldn't approve that request.");
}

export async function denyJoinRequest(eventId, userId) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase
    .from("event_members")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error("Couldn't update that request.");
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
  if (error) throw new Error("Upload failed. Try a different image.");
  const { data } = supabase.storage.from("event-photos").getPublicUrl(path);
  return data.publicUrl;
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

export async function addComment(eventId, body, userId) {
  if (!supabase || !userId) throw new Error("Sign in to comment");
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  if (text.length > 1000) throw new Error("Comment is too long.");
  const { error } = await supabase
    .from("comments")
    .insert({ event_id: eventId, user_id: userId, body: text });
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
  if (error) throw new Error("Couldn't block that account.");
}

export async function unblockUser(userId, blockedId) {
  if (!supabase || !userId) return;
  await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
}

export async function loadBlockedAccounts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("blocked_accounts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data;
}

// ---------- account deletion ----------

// Irreversible. The database drops the auth user and everything hanging off
// it; the meets they posted go too, since nobody would be left to run them.
export async function deleteMyAccount() {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error("Couldn't delete the account. Try again.");
  await supabase.auth.signOut();
}

// ---------- follows ----------

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

export async function submitReport(eventId, reason, note, userId) {
  if (!supabase || !userId) throw new Error("Sign in to report a meet");
  const { error } = await supabase
    .from("reports")
    .insert({ event_id: eventId, reporter_id: userId, reason, note: note?.trim() || null });
  if (error) {
    if (error.code === "23505") throw new Error("You already reported this meet — thanks.");
    throw new Error("Couldn't submit the report. Try again.");
  }
}
