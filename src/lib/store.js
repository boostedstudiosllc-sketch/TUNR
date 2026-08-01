// Data layer. Today: seed data + localStorage (RSVPs, user-submitted meets).
// Later: swap the internals for Supabase without touching components.

import { seedEvents } from "../data/events.js";

const RSVP_KEY = "tunr.rsvps.v1";
const SUBMITTED_KEY = "tunr.submitted.v1";
const PROFILE_KEY = "tunr.profile.v1";

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

export function loadEvents() {
  const submitted = read(SUBMITTED_KEY, []);
  return [...submitted, ...seedEvents];
}

export function loadRsvps() {
  return read(RSVP_KEY, {});
}

export function saveRsvp(rsvps, eventId, status) {
  const next = { ...rsvps };
  if (next[eventId] === status) delete next[eventId];
  else next[eventId] = status;
  write(RSVP_KEY, next);
  return next;
}

export function submitEvent(draft) {
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
    recurrence: draft.recurrence || null,
    vibe: draft.vibe || "JDM",
    going: 1,
    interested: 0,
    tags: draft.tags && draft.tags.length ? draft.tags : ["Just Posted"],
    description: draft.description || "No description yet.",
    source: draft.igLink ? "instagram" : null,
    sourceUrl: draft.igLink || null,
    lng: draft.lng ?? -84.39,
    lat: draft.lat ?? 33.75,
    submittedByUser: true,
  };
  const next = [event, ...submitted];
  write(SUBMITTED_KEY, next);
  return event;
}

export function removeSubmitted(eventId) {
  const submitted = read(SUBMITTED_KEY, []);
  write(
    SUBMITTED_KEY,
    submitted.filter((e) => e.id !== eventId)
  );
}

export function loadProfile() {
  return read(PROFILE_KEY, { username: "", city: "Atlanta, GA" });
}

export function saveProfile(profile) {
  write(PROFILE_KEY, profile);
  return profile;
}
