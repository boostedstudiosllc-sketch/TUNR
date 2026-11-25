// Putting a message on screen from anywhere (a screen with no onToast, a
// background load, a library). App.jsx listens for "tunr:toast" and shows
// it. Every failure a member could notice ends up here or in the screen's own
// error line, with the reason (CLAUDE.md: errors always say what went wrong).
import { errorReason, technicalReason, looksTechnical } from "./errors.js";

// Messages written for people (src/lib wording), shown as they are. Ours
// start "Couldn't …" / "Can't …" and already carry a plain reason; any other
// sentence passes only if it has nothing technical in it ("No API key found
// in request" doesn't).
const CLEAN_START = /^(Couldn't|Can't|You|You're|That|This|Sign in|Confirm|Only|Too|No |Please|Pick|Add|Share|Turn|Enter|Check)/;
const isClean = (text) => CLEAN_START.test(text) && (/^(Couldn't|Can't) /.test(text) || !looksTechnical(text));

export function showToast(message, { error = false } = {}) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent("tunr:toast", { detail: { message: String(message), error } }));
}

// "Couldn't load the leaderboard. (no connection)"
export function errorText(what, e) {
  const why = errorReason(e, what);
  const msg = typeof e?.message === "string" ? e.message : "";
  // Messages from src/lib already say what failed and why: show as is.
  if (msg && isClean(msg)) return msg;
  return why ? `${what} (${why})` : what;
}

export function showError(what, e) {
  showToast(errorText(what, e), { error: true });
}

// For .catch(): loadThing().then(set).catch(failWith("Couldn't load your garage."))
export const failWith = (what) => (e) => showError(what, e);

// Failures nobody caught (a promise without .catch, a click handler that
// threw). Ignores the browser's own noise and the user cancelling a share.
const NOISE = /ResizeObserver loop|AbortError|The user aborted|Share canceled|cancell?ed by the user|^Script error\.?$|NotAllowedError: play\(\)|The play\(\) request was interrupted/i;
export function uncaughtText(reason) {
  const name = reason?.name || "";
  const raw = technicalReason(reason);
  if (!raw || name === "AbortError" || NOISE.test(raw) || NOISE.test(`${name}: ${raw}`)) return null;
  const text = errorReason(reason, "Something didn't work.");
  // Our own messages already say what failed and why.
  const full = typeof reason?.message === "string" ? reason.message : typeof reason === "string" ? reason : "";
  if (isClean(full)) return full.slice(0, 300);
  return `Something didn't work. (${text})`;
}

// How long a message stays up: long enough to read the reason.
export const toastMs = (message, error = false) => Math.min(9000, Math.max(error ? 4000 : 2400, String(message || "").length * 55));

// Show the failure, then carry on without that piece:
// loadTaco().catch(orNull("Couldn't load Taco Tuesday."))
export const orNull = (what) => (e) => {
  showError(what, e);
  return null;
};
