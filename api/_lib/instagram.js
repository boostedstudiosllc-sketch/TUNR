// Importing meets from TUNR's own Instagram (@tunr.app), with no hands on it.
// Each run: keep the access token fresh, read the account's newest posts
// through Instagram's official API, and for each post not seen before, read
// the flyer with the same AI as "post a meet" and list the meet. Posts that
// aren't meets are skipped; ones missing a date, time or findable place are
// held for an admin (076_instagram_import.sql).
//
// Setup: INSTAGRAM_ACCESS_TOKEN in Vercel (a token for @tunr.app from Meta's
// developer site). After the first run the token lives in instagram_link
// and is renewed weekly, so it never lapses. Putting a new token in Vercel
// later takes over from the stored one.

import { createHash } from "node:crypto";
import { readFlyerWithGemini, DEFAULT_MODEL } from "./gemini.js";
import { normalizeFlyer } from "./flyer.js";
import { geocodeLocation } from "../../src/lib/geocode.js";
import { parseLocal, DEFAULT_TZ } from "../../src/lib/dates.js";

const GRAPH = "https://graph.instagram.com";
const REFRESH_EVERY_MS = 7 * 864e5; // tokens last 60 days; renew weekly
const LOOKBACK_MS = 21 * 864e5; // posts older than this aren't new meets
const PER_RUN = 4; // flyers read per run (each takes a few seconds)
const MAX_TRIES = 3; // a post that failed (AI busy, image gone) is retried this many times
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";

const sha = (text) => createHash("sha256").update(String(text)).digest("hex");

// The image to read: the photo, a carousel's first photo, or a video's cover.
export function pickImage(media) {
  if (!media) return null;
  if (media.media_type === "IMAGE") return media.media_url || null;
  if (media.media_type === "VIDEO") return media.thumbnail_url || null;
  if (media.media_type === "CAROUSEL_ALBUM") {
    const kids = media.children?.data || [];
    const photo = kids.find((k) => k.media_type === "IMAGE" && k.media_url);
    if (photo) return photo.media_url;
    const video = kids.find((k) => k.thumbnail_url);
    return video?.thumbnail_url || media.media_url || null;
  }
  return media.media_url || null;
}

// Georgia's date today, as YYYY-MM-DD.
export const georgiaDay = (now) => new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ }).format(now);

// What to do with what the AI read: { list: true, … } with the meet's
// fields, or { list: false, status, reason }.
export function judgeFlyer(flyer, now = new Date()) {
  if (!flyer.isMeet) return { list: false, status: "not_a_meet", reason: "Not a meet flyer (a car photo, recap or other post)." };
  if (!flyer.date) return { list: false, status: "needs_review", reason: "Couldn't tell the date from the flyer or caption." };
  if (flyer.date < georgiaDay(now)) return { list: false, status: "past", reason: `The meet's date (${flyer.date}) has passed.` };
  if (flyer.dateConflict) return { list: false, status: "needs_review", reason: flyer.check[0] || "The flyer's weekday and date don't agree." };
  if (!flyer.startTime) return { list: false, status: "needs_review", reason: "Couldn't tell the start time." };
  if (!flyer.venue && !flyer.address) return { list: false, status: "needs_review", reason: "Couldn't tell where it is." };
  return { list: true };
}

// The events row for a meet read from a post.
export function eventRow(flyer, place, post) {
  const start = parseLocal(`${flyer.date}T${flyer.startTime}`, DEFAULT_TZ);
  let end = flyer.endTime ? parseLocal(`${flyer.date}T${flyer.endTime}`, DEFAULT_TZ) : null;
  if (end && end <= start) end = new Date(end.getTime() + 864e5); // runs past midnight
  const host = String(flyer.hosts[0] || "").replace(/^@+/, "").trim().slice(0, 40) || "tunr.app";
  return {
    title: flyer.title || `${flyer.venue || "Car"} meet`,
    host,
    location: [flyer.venue, flyer.address].filter(Boolean).join(", ").slice(0, 200) || "TBA",
    city: flyer.city || place.city || "Atlanta, GA",
    start_at: start.toISOString(),
    end_at: end ? end.toISOString() : null,
    vibe: flyer.vibe || "JDM",
    tags: ["From Instagram"],
    description: flyer.description || "Posted on @tunr.app.",
    source: "instagram",
    source_url: post.permalink || null,
    photo_url: post.imageUrl,
    flyer_url: post.imageUrl,
    lat: place.lat,
    lng: place.lng,
    timezone: DEFAULT_TZ,
    visibility: "public",
    access_mode: "both",
    created_by: null,
  };
}

export function createInstagramImport({ service, env = process.env, fetchImpl = fetch, now = () => new Date() }) {
  const rpc = (fn, args) => service.rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  const saveLink = (patch) =>
    service.rest("/rest/v1/instagram_link?id=eq.true", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });

  async function ig(path, token) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetchImpl(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      const why = body.error?.message || `HTTP ${res.status}`;
      const err = new Error(`Instagram: ${why}`.slice(0, 200));
      err.code = body.error?.code === 190 ? "instagram_token_expired" : "instagram_failed";
      throw err;
    }
    return body;
  }

  // The token to use: a new one put in Vercel wins; otherwise the stored
  // one, renewed when it's a week old.
  async function token() {
    const rows = await service.rest("/rest/v1/instagram_link?select=access_token,seed_hash,refreshed_at,username&id=eq.true");
    const link = (Array.isArray(rows) && rows[0]) || {};
    const seed = (env.INSTAGRAM_ACCESS_TOKEN || "").trim();
    let current = link.access_token;
    let refreshedAt = link.refreshed_at ? new Date(link.refreshed_at).getTime() : 0;
    if (seed && sha(seed) !== link.seed_hash) {
      current = seed;
      refreshedAt = 0;
      await saveLink({ access_token: seed, seed_hash: sha(seed), refreshed_at: null, last_error: null });
    }
    if (!current) {
      const err = new Error("Instagram isn't connected: INSTAGRAM_ACCESS_TOKEN is not set in Vercel.");
      err.code = "instagram_not_connected";
      throw err;
    }
    if (now().getTime() - refreshedAt > REFRESH_EVERY_MS) {
      try {
        const fresh = await ig(`/refresh_access_token?grant_type=ig_refresh_token`, current);
        if (fresh.access_token) {
          current = fresh.access_token;
          await saveLink({ access_token: current, refreshed_at: now().toISOString() });
        }
      } catch (e) {
        // A brand-new token can't be renewed for its first day; it still works.
        if (e.code === "instagram_token_expired") throw e;
        console.warn("instagram refresh:", e.message);
      }
    }
    return current;
  }

  // Keep a copy of the flyer in TUNR's storage (Instagram's image links expire).
  async function storeImage(mediaId, url) {
    const img = await fetchImpl(url);
    if (!img.ok) throw new Error(`Couldn't download the post's image (HTTP ${img.status}).`);
    const type = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
    const bytes = Buffer.from(await img.arrayBuffer());
    const path = `instagram/${mediaId}.${type === "image/png" ? "png" : "jpg"}`;
    const { url: base, key } = service.config;
    const up = await fetchImpl(`${base}/storage/v1/object/event-photos/${path}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": type, "x-upsert": "true" },
      body: bytes,
    });
    if (!up.ok) throw new Error(`Couldn't save the flyer image (${(await up.text()).slice(0, 120)}).`);
    return `${base}/storage/v1/object/public/event-photos/${path}`;
  }

  async function record(media, patch, seen) {
    const row = {
      media_id: media.id,
      permalink: media.permalink || null,
      posted_at: media.timestamp || null,
      updated_at: now().toISOString(),
      attempts: (seen?.attempts || 0) + 1,
      ...patch,
    };
    await service.rest("/rest/v1/instagram_posts?on_conflict=media_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
  }

  // One post: read it, then list it, skip it or hold it. Returns its status.
  async function importOne(media, seen) {
    const source = pickImage(media);
    if (!source) {
      await record(media, { status: "not_a_meet", reason: "No image in the post." }, seen);
      return "not_a_meet";
    }
    let imageUrl;
    try {
      imageUrl = await storeImage(media.id, source);
    } catch (e) {
      await record(media, { status: "failed", reason: e.message.slice(0, 300) }, seen);
      return "failed";
    }
    const read = await readFlyerWithGemini({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || DEFAULT_MODEL,
      imageUrl,
      caption: (media.caption || "").slice(0, 2200),
      postedAt: media.timestamp,
      now: now(),
      fetchImpl,
    });
    if (read.error) {
      await record(media, { status: "failed", image_url: imageUrl, reason: `The flyer reader said ${read.error}${read.detail ? `: ${read.detail}` : ""}`.slice(0, 300) }, seen);
      return "failed";
    }
    const flyer = normalizeFlyer(read.parsed, now());
    const verdict = judgeFlyer(flyer, now());
    if (!verdict.list) {
      await record(media, { status: verdict.status, image_url: imageUrl, reason: verdict.reason }, seen);
      return verdict.status;
    }

    const token = env.VITE_MAPBOX_TOKEN || env.MAPBOX_TOKEN;
    const where = [flyer.venue, flyer.address].filter(Boolean).join(", ");
    let place = await geocodeLocation(where, flyer.city || "", { token, fetchImpl });
    if (place.status === "none" && flyer.address) place = await geocodeLocation(flyer.address, flyer.city || "", { token, fetchImpl });
    if (place.status === "none") {
      const reason = token ? `Couldn't find “${where}” on the map.` : "Can't look up places: VITE_MAPBOX_TOKEN is not set in Vercel.";
      await record(media, { status: "needs_review", image_url: imageUrl, reason }, seen);
      return "needs_review";
    }

    const dup = await rpc("instagram_duplicate", { p_permalink: media.permalink || null, p_day: flyer.date, p_lat: place.lat, p_lng: place.lng });
    if (dup) {
      await record(media, { status: "duplicate", image_url: imageUrl, event_id: dup, reason: "Already listed for that day and spot." }, seen);
      return "duplicate";
    }

    const made = await service.rest("/rest/v1/events", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(eventRow(flyer, place, { permalink: media.permalink, imageUrl })),
    });
    const event = Array.isArray(made) ? made[0] : made;
    await record(media, { status: "imported", image_url: imageUrl, event_id: event?.id || null, reason: place.status === "area" ? "Pinned to the area (no exact address)." : null }, seen);
    return "imported";
  }

  // The whole run. Returns counts for the logs and the admin page.
  async function run() {
    const started = now();
    const result = { checked: 0, imported: 0, held: 0, skipped: 0, failed: 0, left: 0 };
    try {
      if (!env.GEMINI_API_KEY) {
        const err = new Error("The flyer reader isn't set up: GEMINI_API_KEY is not set in Vercel.");
        err.code = "not_configured";
        throw err;
      }
      const tok = await token();
      const me = await ig("/me?fields=username", tok);
      const list = await ig(`/me/media?fields=${encodeURIComponent(FIELDS)}&limit=25`, tok);
      const recent = (list.data || []).filter((m) => m.timestamp && started.getTime() - new Date(m.timestamp).getTime() <= LOOKBACK_MS);
      result.checked = recent.length;

      const ids = recent.map((m) => m.id);
      const seenRows = ids.length
        ? await service.rest(`/rest/v1/instagram_posts?select=media_id,status,attempts&media_id=in.(${ids.map((i) => `"${i}"`).join(",")})`)
        : [];
      const seen = new Map((seenRows || []).map((r) => [r.media_id, r]));
      // New posts, oldest first, plus failures worth another go.
      const todo = recent
        .filter((m) => !seen.has(m.id) || (seen.get(m.id).status === "failed" && seen.get(m.id).attempts < MAX_TRIES))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      result.left = Math.max(0, todo.length - PER_RUN);

      const imported = [];
      let held = 0;
      for (const media of todo.slice(0, PER_RUN)) {
        const status = await importOne(media, seen.get(media.id));
        if (status === "imported") {
          result.imported += 1;
          imported.push(media);
        } else if (status === "needs_review") {
          result.held += 1;
          held += 1;
        } else if (status === "failed") {
          result.failed += 1;
        } else {
          result.skipped += 1;
        }
      }

      if (imported.length) {
        await rpc("notify_admins", {
          p_kind: "instagram_import",
          p_title: `📸 ${imported.length} meet${imported.length === 1 ? "" : "s"} added from Instagram`,
          p_body: "Listed from @tunr.app's new posts. Settings → Admin → Instagram import to see them.",
          p_dedupe: `ig_imported:${imported.map((m) => m.id).join(",")}`.slice(0, 200),
        });
      }
      if (held) {
        await rpc("notify_admins", {
          p_kind: "instagram_import",
          p_title: `📸 ${held} Instagram post${held === 1 ? "" : "s"} need a look`,
          p_body: "A flyer was missing a date, time or place. Settings → Admin → Instagram import says which.",
          p_dedupe: `ig_held:${started.toISOString().slice(0, 13)}`,
        });
      }
      await saveLink({ username: me.username || null, last_run_at: started.toISOString(), last_result: result, last_error: null });
      return { ok: true, ...result };
    } catch (e) {
      const message = String(e?.message || e).slice(0, 300);
      try {
        await saveLink({ last_run_at: started.toISOString(), last_result: result, last_error: message });
        if (e.code === "instagram_token_expired") {
          await rpc("notify_admins", {
            p_kind: "instagram_import",
            p_title: "📸 Instagram import stopped",
            p_body: "The Instagram token expired. Make a new one on Meta's developer site and put it in Vercel as INSTAGRAM_ACCESS_TOKEN.",
            p_dedupe: `ig_expired:${started.toISOString().slice(0, 10)}`,
          });
        }
      } catch (inner) {
        console.error("instagram status save:", inner.message);
      }
      return { ok: false, error: e.code || "instagram_failed", detail: message, ...result };
    }
  }

  return { run, importOne, token };
}
