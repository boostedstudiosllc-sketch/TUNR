// Alerts: the in-app inbox, alert settings, and turning on phone/desktop
// alerts (Web Push) for this device.
import { supabase } from "./supabase.js";
import { withReason, errorReason } from "./errors.js";

// ---------- this device ----------

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Opened from the home screen rather than a browser tab.
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone);
}

// What this device can do: "ready", "ios_home_screen" (iPhone in Safari: alerts
// only work once TUNR is on the home screen), "blocked" (the person said no
// in the browser's prompt), or "unsupported".
export function pushSupport() {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos() && !isStandalone()) return "ios_home_screen";
  if (!hasApis) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ready";
}

async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  return navigator.serviceWorker.ready.then(() => reg);
}

export async function deviceSubscribed() {
  if (pushSupport() !== "ready") return false;
  try {
    const reg = await registration();
    return Boolean(await reg.pushManager.getSubscription());
  } catch (e) {
    return false;
  }
}

function base64UrlToBytes(value) {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const SERVER_ERRORS = {
  push_not_configured: "Phone alerts aren't switched on for TUNR yet",
  push_failed: "The alert server had a problem",
};

async function serverKey() {
  let res;
  try {
    res = await fetch("/api/push");
  } catch (e) {
    throw new Error(withReason("Couldn't reach the alert server.", e));
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.publicKey) {
    const what = SERVER_ERRORS[body.error] || `Couldn't turn on alerts (${body.error || `HTTP ${res.status}`})`;
    throw new Error(body.detail ? `${what}: ${body.detail}.` : `${what}.`);
  }
  return body.publicKey;
}

// Ask the browser, subscribe, and save the device to this account.
export async function enablePush() {
  const support = pushSupport();
  if (support === "ios_home_screen") throw new Error("On iPhone, add TUNR to your Home Screen first, then turn alerts on from there.");
  if (support === "unsupported") throw new Error("This browser can't show alerts. Try Chrome, or Safari on an iPhone with TUNR on the Home Screen.");
  if (support === "blocked") throw new Error("Alerts are blocked for TUNR in this browser's settings. Allow them there, then try again.");
  if (!supabase) throw new Error("Alerts need an account.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "You said no to alerts. Allow them in your browser's settings to turn them on." : "Alerts weren't allowed.");
  }
  const key = await serverKey();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an older key won't work with this one.
  if (sub && sub.options?.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey);
    const wanted = base64UrlToBytes(key);
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  try {
    sub = sub || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }));
  } catch (e) {
    throw new Error(withReason("This browser wouldn't set up alerts.", e));
  }
  const json = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh || "",
    p_auth: json.keys?.auth || "",
  });
  if (error) throw new Error(withReason("Couldn't save this device for alerts.", error));
  return true;
}

export async function disablePush() {
  if (pushSupport() !== "ready") return;
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (supabase) {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw new Error(withReason("Alerts are off on this device, but it couldn't be removed from your account.", error));
  }
}

// Something may have queued an alert for someone: ask the server to deliver
// it now. Failing here only delays alerts until the next delivery run, so
// it's logged rather than shown.
export function kickPush() {
  if (typeof fetch === "undefined") return;
  fetch("/api/push", { method: "POST", keepalive: true }).catch((e) => console.warn("alert delivery:", errorReason(e)));
}

// ---------- settings ----------

export const DEFAULT_ALERT_SETTINGS = { radius_miles: 25, lat: null, lng: null, linkups: true, activity: true, reminders: true };

export async function loadAlertSettings(userId) {
  if (!supabase || !userId) return { ...DEFAULT_ALERT_SETTINGS };
  const { data, error } = await supabase.from("alert_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(withReason("Couldn't load your alert settings.", error));
  return { ...DEFAULT_ALERT_SETTINGS, ...(data || {}) };
}

export async function saveAlertSettings(userId, settings) {
  if (!supabase || !userId) throw new Error("Sign in to save alert settings.");
  const row = {
    user_id: userId,
    radius_miles: Math.max(1, Math.min(250, Math.round(Number(settings.radius_miles) || 25))),
    lat: settings.lat ?? null,
    lng: settings.lng ?? null,
    linkups: Boolean(settings.linkups),
    activity: Boolean(settings.activity),
    reminders: Boolean(settings.reminders),
  };
  const { data, error } = await supabase.from("alert_settings").upsert(row, { onConflict: "user_id" }).select().single();
  if (error) throw new Error(withReason("Couldn't save your alert settings.", error));
  return { ...DEFAULT_ALERT_SETTINGS, ...data };
}

// ---------- inbox ----------

export async function loadNotifications() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id,kind,title,body,link,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(withReason("Couldn't load your alerts.", error));
  return data || [];
}

export async function markNotificationsRead() {
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) throw new Error(withReason("Couldn't mark your alerts as read.", error));
}

export async function clearNotifications() {
  if (!supabase) return;
  const { error } = await supabase.from("notifications").delete().not("id", "is", null);
  if (error) throw new Error(withReason("Couldn't clear your alerts.", error));
}

export function subscribeToNotifications(userId, onChange) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => onChange())
    .subscribe();
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") onChange();
  }, 60000);
  return () => {
    clearInterval(timer);
    supabase.removeChannel(channel);
  };
}

// ---------- where you are ----------

// The device's location, rounded to about a kilometre for anything saved.
export function currentPosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? "Location is blocked for TUNR. Allow it in your browser or phone settings."
              : err.code === 3
                ? "Finding your location took too long. Try again."
                : `Couldn't find your location (${err.message || "unknown error"}).`
          )
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}
