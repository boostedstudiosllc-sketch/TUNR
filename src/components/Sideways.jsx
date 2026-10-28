import { useEffect, useState } from "react";

// Games played with the phone sideways. A web app can't turn the screen for
// you on an iPhone, so the game waits behind a "turn your phone" screen
// until it's held sideways; where the phone allows it (Android), it's also
// asked to lock to landscape for the race.

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
    // say no; the turn-your-phone screen covers those.
    o?.lock?.("landscape").catch((e) => console.info("Landscape lock not available here:", e.message));
    return () => o?.unlock?.();
  }, []);
}

export function TurnSideways() {
  return (
    <div
      role="alert"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 6,
        background: "rgba(5,8,20,0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "#F0F0F0",
      }}
    >
      <style>{"@keyframes tunr-turn { 0%, 20% { transform: rotate(0deg); } 60%, 100% { transform: rotate(-90deg); } }"}</style>
      <div aria-hidden="true" style={{ fontSize: 64, animation: "tunr-turn 1.8s ease-in-out infinite alternate" }}>
        📱
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>TURN YOUR PHONE SIDEWAYS</div>
      <div style={{ fontSize: 14, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", maxWidth: 300, lineHeight: 1.45 }}>
        This game is played sideways. The race waits for you. If the screen won't turn, switch off Portrait Orientation Lock (iPhone: swipe down from the top right corner).
      </div>
    </div>
  );
}
