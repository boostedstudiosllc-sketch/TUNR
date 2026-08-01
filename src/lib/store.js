// Data layer.
// With Supabase configured: events + RSVPs + profile live in the database
// (RSVPs/profile require sign-in; signed-out visitors browse shared events
// and keep device-local RSVPs). Without Supabase env vars everything falls
// back to seed data + localStorage so the app still runs.

import { seedEvents } from "../data/events.js";
import { supabase } from "./supabase.js";
import { DEFAULT_TZ, parseLocal } from "./dates.js";

const RSVP_KEY = "tunr.rsvps.v1";
const SUBMITTED_KEY = "tunr.submitted.v1";
const PROFILE_KEY = "tunr.profile.v1";
const TOS_KEY = "tunr.tos.v1";

export const TOS_VERSION = 1;

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
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    host: row.host,
    verified: row.verified,
    location: row.location,
    city: row.city,
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
    submittedByUser: Boolean(userId && row.created_by === userId),
  };
}

// ---------- events ----------

export async function loadEvents(userId = null) {
  if (!supabase) {
    return [...read(SUBMITTED_KEY, []), ...seedEvents];
  }
  const [eventsRes, countsRes] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("event_rsvp_counts").select("*"),
  ]);

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
    const { data, error } = await supabase
      .from("events")
      .insert({
        title: draft.title || "Untitled Meet",
        host: draft.host || "you",
        location: draft.location || "TBA",
        city: draft.city || "Atlanta, GA",
        start_at: draft.start ? parseLocal(draft.start, DEFAULT_TZ).toISOString() : null,
        vibe: draft.vibe || "JDM",
        tags: ["Just Posted"],
        description: draft.description || "No description yet.",
        source: draft.igLink ? "instagram" : null,
        source_url: draft.igLink || null,
        lng: draft.lng ?? -84.39,
        lat: draft.lat ?? 33.75,
        timezone: DEFAULT_TZ,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
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
    lng: draft.lng ?? -84.39,
    lat: draft.lat ?? 33.75,
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
      await supabase
        .from("rsvps")
        .upsert({ user_id: userId, event_id: eventId, status }, { onConflict: "user_id,event_id" });
    }
  } else {
    write(RSVP_KEY, next);
  }
  return next;
}

// ---------- profile ----------

export function loadLocalProfile() {
  return read(PROFILE_KEY, { username: "", city: "Atlanta, GA" });
}

export async function loadProfile(userId = null) {
  if (supabase && userId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) return { username: data.username || "", city: data.city || "Atlanta, GA" };
    return { username: "", city: "Atlanta, GA" };
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
