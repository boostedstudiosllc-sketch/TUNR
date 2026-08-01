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
  const [{ data: rows, error }, { data: countRows }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from("event_rsvp_counts").select("*"),
  ]);
  if (error || !rows) {
    // Network/db hiccup: degrade to local so the app still shows meets.
    return [...read(SUBMITTED_KEY, []), ...seedEvents];
  }
  const counts = new Map((countRows || []).map((r) => [r.event_id, r]));
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

export async function signInWithEmail(email) {
  if (!supabase) throw new Error("Backend not configured");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_evt, session) => {
    callback(session?.user || null);
  });
  supabase.auth.getSession().then(({ data }) => callback(data.session?.user || null));
  return () => subscription.unsubscribe();
}
