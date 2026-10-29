// Light or dark mode. The choice ("dark", "light" or "system" to follow the
// phone) is kept on this device; index.html applies it before the app
// draws so there's no dark flash. Colours come from src/theme.css.

const KEY = "tunr.theme";
const BG = { dark: "#0A0A0A", light: "#F4F4F4" };
const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: light)") : null;

export function themePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch (e) {
    console.warn("Couldn't read the theme setting:", e.message);
    return "dark";
  }
}

// What's showing now: "dark" or "light".
export const activeTheme = (pref = themePref()) => (pref === "system" ? (media?.matches ? "light" : "dark") : pref);

export function applyTheme(pref = themePref()) {
  const t = activeTheme(pref);
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BG[t]);
  window.dispatchEvent(new CustomEvent("tunr:theme", { detail: t }));
  return t;
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch (e) {
    throw new Error(`Couldn't save the theme on this phone. (${e.message})`);
  }
  return applyTheme(pref);
}

// Follow the phone's setting while on "system".
media?.addEventListener?.("change", () => themePref() === "system" && applyTheme("system"));
