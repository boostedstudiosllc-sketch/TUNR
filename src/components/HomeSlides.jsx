import { useEffect, useMemo, useRef, useState } from "react";
import { loadHomeSlides } from "../lib/homeSlides.js";
import { buildSlides, THEMES, isExternal } from "../lib/slides.js";
import { loadTaco } from "../lib/tunrTuesdays.js";
import { loadPitStop } from "../lib/pitStop.js";
import { loadBoost } from "../lib/boost.js";

// The swipeable banner at the top of Discover: what's new and what's on.
// Admins' slides (Settings → Admin → Home banner) mixed with the app's own
// (your next meet, the hottest meet this week, TUNR Tuesdays, your Daily Pit
// Stop); rules in slides.js. Swipe, or it moves on by itself every 6 s.
// Always dark (white text on colour), like a poster.

const go = (link) => (isExternal(link) ? window.open(link, "_blank", "noopener") : window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link } })));

// The big picture on the right when a slide has no photo.
const ICON = (link) =>
  link.startsWith("meet:") ? "🏁" : link === "open:photo-spots" ? "📸" : link === "open:pitstop" || link === "open:boost" ? "🔥" : link === "tab:community" ? "🚗" : link.startsWith("play:") || link === "tab:perks" ? "🎮" : link.startsWith("https:") ? "🔗" : "⭐";

export function Slide({ s, onGo = go }) {
  const [a, b, c] = THEMES[s.theme] || THEMES.blue;
  return (
    <div style={{ position: "relative", height: 232, borderRadius: 18, overflow: "hidden", background: `linear-gradient(135deg, ${a} 0%, ${b} 62%, ${c} 130%)`, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {/* Speed lines. */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg, transparent 0 34px, rgba(255,255,255,0.05) 34px 36px)" }} />
      <div aria-hidden="true" style={{ position: "absolute", right: -8, top: 18, width: "42%", height: 196, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(7deg)" }}>
        {s.image ? (
          <img src={s.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12, border: "3px solid rgba(255,255,255,0.85)", boxShadow: "0 14px 30px rgba(0,0,0,0.45)" }} />
        ) : (
          <span style={{ fontSize: 96, filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.35))" }}>{ICON(s.link)}</span>
        )}
      </div>
      <div style={{ position: "relative", width: "62%", padding: "18px 0 0 18px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: 2, opacity: 0.85 }}>{s.kicker}</div>
        <div style={{ fontSize: 27, fontWeight: 900, lineHeight: 1.02, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>{s.title}</div>
        {s.body && <div style={{ fontSize: 13.5, fontFamily: "'Barlow', sans-serif", lineHeight: 1.35, marginTop: 6, opacity: 0.9, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.body}</div>}
        <button
          onClick={() => onGo(s.link)}
          style={{ alignSelf: "flex-start", marginTop: "auto", marginBottom: 18, padding: "9px 16px", borderRadius: 999, border: "none", background: "#fff", color: a, fontSize: 14.5, fontWeight: 900, letterSpacing: 0.6, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}
        >
          {s.cta} {isExternal(s.link) ? "↗" : "›"}
        </button>
      </div>
    </div>
  );
}

export default function HomeSlides({ user, events, rsvps }) {
  const [admin, setAdmin] = useState([]);
  const [taco, setTaco] = useState(null);
  const [pit, setPit] = useState(null);
  const [boost, setBoost] = useState(null);
  const [at, setAt] = useState(0);
  const strip = useRef(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    loadHomeSlides()
      .then(setAdmin)
      .catch((e) => console.warn(e.message));
    loadTaco()
      .then(setTaco)
      .catch((e) => console.warn(e.message));
    const refreshBoost = () =>
      loadBoost()
        .then(setBoost)
        .catch((e) => console.warn(e.message));
    refreshBoost();
    window.addEventListener("tunr:boost", refreshBoost);
    return () => window.removeEventListener("tunr:boost", refreshBoost);
  }, [user?.id]);
  useEffect(() => {
    if (!user) return setPit(null);
    const refresh = () =>
      loadPitStop()
        .then(setPit)
        .catch((e) => console.warn(e.message));
    refresh();
    window.addEventListener("tunr:points", refresh);
    return () => window.removeEventListener("tunr:points", refresh);
  }, [user?.id]);

  const slides = useMemo(() => buildSlides({ admin, events, rsvps, taco, pit, boost, now: Date.now() }), [admin, events, rsvps, taco, pit, boost]);

  // Which slide is showing, from the scroll position (swiping moves it).
  const onScroll = () => {
    const el = strip.current;
    if (el) setAt(Math.round(el.scrollLeft / el.clientWidth));
  };
  const show = (i) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  // On by itself every 6 s, paused for a while after a touch, never when
  // the phone asks for less motion.
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current || document.hidden) return;
      show((at + 1) % slides.length);
    }, 6000);
    return () => clearInterval(t);
  }, [at, slides.length]);

  if (!slides.length) return null;
  return (
    <section aria-label="What's new on TUNR" style={{ padding: "0 20px 12px" }}>
      <div
        ref={strip}
        onScroll={onScroll}
        onPointerDown={() => (pausedUntil.current = Date.now() + 12000)}
        onTouchStart={() => (pausedUntil.current = Date.now() + 12000)}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", borderRadius: 18 }}
      >
        {slides.map((s, i) => (
          <div key={s.id} aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.title}`} style={{ flex: "0 0 100%", scrollSnapAlign: "center" }}>
            <Slide s={s} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => ((pausedUntil.current = Date.now() + 12000), show(i))}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === at}
              style={{ width: i === at ? 20 : 7, height: 7, borderRadius: 4, border: "none", padding: 0, background: i === at ? "#0080F0" : "rgba(128,128,128,0.45)", cursor: "pointer", transition: "width 0.25s ease" }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
