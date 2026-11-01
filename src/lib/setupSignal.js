// Tells the points checklist (the 📋 in the header) that a setup step may
// just have been done: a profile photo, a car, alerts turned on. It checks
// at once, adds the step's points and shows CLAIM, instead of waiting until
// the next time the checklist is opened.

export const SETUP_EVENT = "tunr:setup";

export function setupChanged(target = globalThis) {
  try {
    target?.dispatchEvent?.(new CustomEvent(SETUP_EVENT));
  } catch (e) {
    console.warn(`Couldn't tell the checklist a setup step changed. (${e.message})`);
  }
}
