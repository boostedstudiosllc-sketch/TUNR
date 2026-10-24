// Your own activity for the Settings pages: sign-in history, meet history,
// and this device's alert sound. Rules live in 050_activity.sql.
import { supabase } from "./supabase.js";
import { withReason } from "./errors.js";

// "Safari on iPhone", "Chrome on Windows"… from the browser's own label.
export function deviceLabel(ua = navigator.userAgent || "") {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "an unknown device";
  const app = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ? " (Home Screen app)" : "";
  return `${browser} on ${system}${app}`;
}

export async function recordSignIn() {
  if (!supabase) return;
  const { error } = await supabase.rpc("record_sign_in", { p_device: deviceLabel() });
  if (error) console.warn(withReason("Couldn't log this sign-in.", error));
}

export async function loadSignIns(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("sign_ins")
    .select("id, device, ip_hint, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(withReason("Couldn't load your sign-in history.", error));
  return data || [];
}

// Ends every other session; this one stays signed in.
export async function signOutOtherDevices() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) throw new Error(withReason("Couldn't sign out your other devices.", error));
}

export async function loadMeetHistory() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_meet_history");
  if (error) throw new Error(withReason("Couldn't load your meet history.", error));
  return data || [];
}

// ============ ALERT SOUND ============
// A short clip (your car, say) kept on this device and played when an alert
// lands while TUNR is open. Phones only allow the system sound for alerts
// that arrive while a web app is closed.
const SOUND_KEY = "tunr.alertSound";
export const SOUND_LIMITS = { seconds: 6, bytes: 600 * 1024 };

export function loadAlertSound() {
  try {
    return localStorage.getItem(SOUND_KEY) || "";
  } catch (e) {
    console.warn(`Couldn't read the alert sound: ${e.message}`);
    return "";
  }
}

export function saveAlertSound(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(SOUND_KEY, dataUrl);
    else localStorage.removeItem(SOUND_KEY);
  } catch (e) {
    throw new Error(`Couldn't save the sound on this device. (${e.message})`);
  }
}

export function playAlertSound(dataUrl = loadAlertSound()) {
  if (!dataUrl) return Promise.resolve(false);
  const audio = new Audio(dataUrl);
  return audio
    .play()
    .then(() => true)
    .catch((e) => {
      // Browsers block sound until you've tapped the page once; not worth a message.
      console.warn(`Alert sound didn't play: ${e.message}`);
      return false;
    });
}

// A picked or recorded clip → data URL, after checking it's short and small.
export async function clipToDataUrl(blob) {
  if (!blob || !/^audio\//.test(blob.type || "audio/")) throw new Error("Pick an audio file (like .mp3, .m4a or .wav).");
  if (blob.size > SOUND_LIMITS.bytes) {
    throw new Error(`That clip is too big (${Math.round(blob.size / 1024)} KB). Keep it under ${SOUND_LIMITS.bytes / 1024} KB, a few seconds long.`);
  }
  const url = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(withReason("Couldn't read that clip.", r.error)));
    r.readAsDataURL(blob);
  });
  const seconds = await new Promise((resolve) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(NaN);
    a.src = url;
  });
  if (!Number.isFinite(seconds) && !String(blob.type).includes("webm")) {
    throw new Error("This browser can't play that file. Try an .mp3 or .m4a.");
  }
  if (Number.isFinite(seconds) && seconds > SOUND_LIMITS.seconds + 0.5) {
    throw new Error(`That clip is ${Math.round(seconds)} seconds. Keep it to ${SOUND_LIMITS.seconds} seconds or less.`);
  }
  return url;
}
