import { useEffect, useState } from "react";

// Games played with the phone sideways. A web app can't turn the screen for
// you on an iPhone, so held upright the game draws itself turned on its side
// (see KartRace); where the phone allows it (Android), it's also asked to
// lock to landscape for the race.

export function usePortrait() {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)") : null;
  const [portrait, setPortrait] = useState(() => Boolean(query?.matches));
  useEffect(() => {
    if (!query) return undefined;
    const on = () => setPortrait(query.matches);
    query.addEventListener?.("change", on);
    window.addEventListener("resize", on);
    return () => {
      query.removeEventListener?.("change", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return portrait;
}

export function useLandscapeLock() {
  useEffect(() => {
    const o = typeof screen !== "undefined" ? screen.orientation : null;
    // Phones that can't lock (iPhones, most browsers outside full screen)
    // say no; the race turns itself on its side there.
    o?.lock?.("landscape").catch((e) => console.info("Landscape lock not available here:", e.message));
    return () => o?.unlock?.();
  }, []);
}
