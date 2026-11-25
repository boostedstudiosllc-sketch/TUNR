// The admins' app error log (135_app_errors.sql). Members see a plain reason
// (errors.js errorReason); the technical one is sent here a few seconds
// later, in a small batch, with the page and the phone's browser.
import { supabase } from "./supabase.js";
import { onTechnicalError, withReason } from "./errors.js";

let queue = [];
let timer = null;

async function flush() {
  timer = null;
  const batch = queue.splice(0, 10);
  queue = [];
  for (const r of batch) {
    const { error } = await supabase.rpc("report_app_error", r);
    // quiet: the member already saw their message; logging must never add another
    if (error) console.warn("app error log:", error.message);
  }
}

export function startErrorLog() {
  if (!supabase || typeof window === "undefined") return;
  onTechnicalError((detail, shown) => {
    if (queue.length >= 10) return;
    queue.push({
      p_shown: String(shown || "").slice(0, 400),
      p_detail: String(detail || "").slice(0, 400),
      p_page: `${window.location.pathname}${window.location.search}`.slice(0, 200),
      p_agent: String(navigator.userAgent || "").slice(0, 200),
    });
    timer ||= setTimeout(flush, 3000);
  });
}

// Admins: the log, grouped. → [{ detail, shown, times, people, first_at, last_at, page, agent, usernames }]
export async function loadAppErrors(days = 7) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_app_errors", { p_days: days });
  if (error) throw new Error(withReason("Couldn't load the app errors.", error));
  return Array.isArray(data) ? data : [];
}

export async function clearAppErrors(detail = null) {
  const { data, error } = await supabase.rpc("admin_clear_app_errors", { p_detail: detail });
  if (error) throw new Error(withReason("Couldn't clear that.", error));
  return data;
}
