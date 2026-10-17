// Sending the alerts the database has queued (public.notifications) to
// people's phones and browsers with Web Push.
//
// Runs with the Supabase service role key, because it reads everyone's
// devices. Nothing a caller sends decides who gets what: the database made
// the rows, this only delivers them, so anyone may ask for a delivery run.
//
// The signing keys (VAPID) are made here the first time they're needed and
// kept in public.push_keys, so there's nothing to generate or paste by hand.

import webpush from "web-push";
import { CONTACT_EMAIL } from "../../src/lib/contact.js";

export function pushConfig(env) {
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "";
  if (!url) return { error: "push_not_configured", detail: "VITE_SUPABASE_URL is not set in Vercel" };
  if (!key) return { error: "push_not_configured", detail: "SUPABASE_SERVICE_ROLE_KEY is not set in Vercel" };
  return { url, key };
}

export function createPushService({ env = process.env, fetchImpl = fetch, webpushImpl = webpush } = {}) {
  const config = pushConfig(env);

  async function rest(path, init = {}) {
    const res = await fetchImpl(`${config.url}${path}`, {
      ...init,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      const reason = (body && (body.msg || body.message || body.error_description || body.error || body.hint)) || text || `HTTP ${res.status}`;
      const err = new Error(String(reason).slice(0, 200));
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function keys() {
    const rows = await rest("/rest/v1/push_keys?select=public_key,private_key&id=eq.1");
    if (Array.isArray(rows) && rows[0]) return { publicKey: rows[0].public_key, privateKey: rows[0].private_key };
    const made = webpushImpl.generateVAPIDKeys();
    // Two first runs at once: whichever lands first wins, both read it back.
    await rest("/rest/v1/push_keys", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ id: 1, public_key: made.publicKey, private_key: made.privateKey }),
    });
    const again = await rest("/rest/v1/push_keys?select=public_key,private_key&id=eq.1");
    if (!Array.isArray(again) || !again[0]) throw new Error("push keys didn't save");
    return { publicKey: again[0].public_key, privateKey: again[0].private_key };
  }

  // Deliver whatever's waiting. Returns counts for the logs.
  async function flush({ subject = `mailto:${CONTACT_EMAIL}` } = {}) {
    const { publicKey, privateKey } = await keys();
    const rows = await rest("/rest/v1/rpc/claim_pushes", {
      method: "POST",
      body: JSON.stringify({ p_limit: 200 }),
    });
    const result = { notifications: 0, sent: 0, failed: 0, removed: 0 };
    const dead = new Set();
    const jobs = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      result.notifications += 1;
      const payload = JSON.stringify({
        id: row.id,
        title: row.title,
        body: row.body,
        link: row.link,
        kind: row.kind,
      });
      for (const sub of row.endpoints || []) {
        jobs.push(
          webpushImpl
            .sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
              {
                vapidDetails: { subject, publicKey, privateKey },
                // A linkup alert an hour late is no use.
                TTL: row.kind === "meet_reminder" ? 6 * 3600 : 3600,
                urgency: row.kind === "linkup_nearby" || row.kind === "linkup_activity" ? "high" : "normal",
              }
            )
            .then(() => {
              result.sent += 1;
            })
            .catch((e) => {
              result.failed += 1;
              // Gone for good: the browser unsubscribed or the app was removed.
              if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.add(sub.endpoint);
              else console.error("push failed", e?.statusCode, e?.body || e?.message);
            })
        );
      }
    }
    await Promise.all(jobs);
    for (const endpoint of dead) {
      await rest(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }).catch(() => {});
      result.removed += 1;
    }
    return result;
  }

  return { config, rest, keys, flush };
}
