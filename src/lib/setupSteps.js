// The first-run setup screens (SetupTour.jsx), one thing per screen like a
// language app's: location, the home screen, alerts, motion, and the Daily
// Pit Stop. Pure, so it's tested in test/setupSteps.test.js: which screens a
// phone needs, and what to tell it.

export const SETUP_KEY = "tunr.setup.v1"; // localStorage: the tour's been seen on this phone
export const MOTION_KEY = "tunr.motion"; // localStorage: "granted" once motion is allowed
export const OPEN_EVENT = "tunr:setup-tour"; // open the tour from Settings

// "ios" | "android" | "desktop", from what the browser says it is.
export function platformOf(ua = "", maxTouchPoints = 0, platform = "") {
  if (/iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

// The screens, in order. env: { platform, standalone, geo ("granted" |
// "denied" | "prompt" | "unsupported"), push ("ready" | "ios_home_screen" |
// "blocked" | "unsupported"), pushOn, motionAsk (the phone asks for motion:
// iPhones), motionOn, pitStopOn, all (from Settings: show every screen,
// already-on ones included) }.
export function setupSteps(env) {
  const steps = [];
  if (env.geo !== "unsupported" && (env.all || env.geo !== "granted")) steps.push("location");
  if (env.platform !== "desktop" && (env.all || !env.standalone)) steps.push("homescreen");
  if (env.push !== "unsupported" && (env.all || !env.pushOn)) steps.push("alerts");
  if (env.motionAsk && (env.all || !env.motionOn)) steps.push("motion");
  if (env.pitStopOn) steps.push("pitstop");
  return steps;
}

// Show the tour by itself? Once per phone, to accounts made in the last week
// (older members open it from Settings).
export function shouldAutoShow({ seen, createdAt, now = Date.now() }) {
  if (seen) return false;
  const made = Date.parse(createdAt || "");
  return Number.isFinite(made) && now - made < 7 * 24 * 3600 * 1000;
}

// How to put TUNR on the home screen, step by step.
export function homeScreenSteps(platform, canPrompt = false) {
  if (platform === "ios") {
    return ["Tap the Share button (the square with the arrow) at the bottom of Safari.", "Scroll down and tap “Add to Home Screen”.", "Tap Add, then open TUNR from your home screen."];
  }
  if (canPrompt) return ["Tap ADD TO HOME SCREEN below, then Install."];
  return ["Tap the ⋮ menu at the top right of Chrome.", "Tap “Add to Home screen” (or “Install app”).", "Open TUNR from your home screen."];
}

// Why each permission matters, for the screen and for "Not now".
export const LATER = "No problem. You can turn it on anytime in Profile → ⚙️ Settings → Setup & permissions.";
