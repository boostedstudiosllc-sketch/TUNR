import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadWrapped } from "../lib/points.js";
import { wrappedSlides, shareStats } from "../lib/wrappedSlides.js";
import { lookOf } from "../lib/rushEngine.js";

// TUNR Wrapped: your year as tap-through story slides, ending in a card
// you can share. Tap right for next, left for back; hold to pause.

const SLIDE_MS = 6000;
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Wrapped({ year, onClose, onToast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [carPic, setCarPic] = useState(null);
  const started = useRef(Date.now());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadWrapped(year)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [year]);

  const slides = wrappedSlides(data);
  const slide = slides[at];

  // The car slide shows your car in 3D, rendered once, a slide early (the
  // render is heavy, so not while the first slides animate in).
  const carAt = slides.findIndex((x) => x.car);
  const carSoon = carAt >= 0 && at >= carAt - 1;
  useEffect(() => {
    if (!carSoon || carPic) return;
    import("../lib/showroom3d.js")
      .then((m) => setCarPic(m.carThumbs([lookOf(data.car)], 720, 440)[0]))
      .catch((e) => console.warn(e.message));
  }, [carSoon]);

  // Auto-advance, paused while held.
  useEffect(() => {
    if (!slides.length || paused || slide?.share) return;
    started.current = Date.now() - progress * SLIDE_MS;
    const id = setInterval(() => {
      const p = (Date.now() - started.current) / SLIDE_MS;
      if (p >= 1) {
        setProgress(0);
        setAt((i) => Math.min(i + 1, slides.length - 1));
      } else setProgress(p);
    }, 80);
    return () => clearInterval(id);
  }, [at, paused, slides.length]);

  const go = (d) => {
    setProgress(0);
    setAt((i) => Math.max(0, Math.min(slides.length - 1, i + d)));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  async function share() {
    try {
      const blob = await shareCard(data);
      const file = new File([blob], `tunr-wrapped-${data.year}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My TUNR Wrapped ${data.year}`, text: `My ${data.year} on TUNR 🚗` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        onToast?.("Saved your Wrapped card");
      }
    } catch (e) {
      if (e.name !== "AbortError") onToast?.(`Couldn't share your Wrapped. (${e.message})`);
    }
  }

  const body = !slide ? (
    <div style={{ ...center, background: "#0B1E3F" }}>
      <div style={{ fontSize: 14, color: error ? "#FCA5A5" : "#CBD5E1", fontFamily: "'Barlow', sans-serif", padding: 24, textAlign: "center" }}>{error || "Wrapping up your year…"}</div>
    </div>
  ) : (
    <div
      key={slide.id}
      style={{ ...center, background: `radial-gradient(120% 80% at 80% 0%, ${slide.bg[1]}, ${slide.bg[0]} 70%)`, animation: REDUCED ? "none" : "wrapIn 0.45s ease" }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={(e) => {
        setPaused(false);
        if (slide.share) return;
        const x = e.clientX / window.innerWidth;
        go(x < 0.33 ? -1 : 1);
      }}
      onPointerLeave={() => setPaused(false)}
    >
      <div style={{ padding: "0 28px", width: "100%", maxWidth: 480, boxSizing: "border-box" }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 3, color: "rgba(255,255,255,0.75)" }}>{slide.kicker}</div>
        {slide.car && carPic && <img src={carPic} alt={slide.big} style={{ width: "100%", borderRadius: 16, margin: "16px 0 4px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }} />}
        <div style={{ fontSize: slide.text ? (slide.big.length > 22 ? 34 : 44) : 96, fontWeight: 900, lineHeight: 1.02, marginTop: 10, letterSpacing: slide.text ? 0 : -2, overflowWrap: "anywhere" }}>
          {slide.text || slide.raw ? slide.big : <CountUp value={slide.big} />}
        </div>
        {slide.unit && <div style={{ fontSize: 26, fontWeight: 900, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{slide.unit}</div>}
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {slide.lines.map((l) => (
            <div key={l} style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, color: "rgba(255,255,255,0.92)", fontFamily: "'Barlow', sans-serif" }}>
              {l}
            </div>
          ))}
        </div>
        {slide.share && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
              {shareStats(data).map(([n, label]) => (
                <div key={label} style={{ background: "rgba(0,0,0,0.25)", borderRadius: 14, padding: "14px 12px" }}>
                  <div style={{ fontSize: 34, fontWeight: 900 }}>{n}</div>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.7)" }}>{label}</div>
                </div>
              ))}
            </div>
            <button onPointerUp={(e) => e.stopPropagation()} onClick={share} style={{ width: "100%", marginTop: 22, padding: "15px 0", borderRadius: 14, border: "none", background: "#fff", color: "#0B1E3F", fontSize: 17, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}>
              SHARE MY WRAPPED
            </button>
            <button onPointerUp={(e) => e.stopPropagation()} onClick={() => go(-(slides.length - 1))} style={{ width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}>
              WATCH AGAIN
            </button>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(
    <div role="dialog" aria-label={`TUNR Wrapped ${year}`} style={{ position: "fixed", inset: 0, zIndex: 600, color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", userSelect: "none", touchAction: "manipulation" }}>
      <style>{"@keyframes wrapIn { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: none; } }"}</style>
      {body}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: 12, right: 12, display: "flex", gap: 4, pointerEvents: "none" }}>
        {slides.map((s, i) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#fff", width: `${i < at ? 100 : i === at ? (slide?.share ? 100 : progress * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <button aria-label="Close Wrapped" onClick={onClose} style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 22px)", right: 12, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 18, cursor: "pointer" }}>
        ✕
      </button>
    </div>,
    document.body
  );
}

const center = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" };

// Numbers count up as the slide opens ("⭐ 1,240" keeps its star).
function CountUp({ value }) {
  const m = String(value).match(/^(\D*)([\d,]+)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, "")) : 0;
  const [n, setN] = useState(REDUCED || !m ? target : 0);
  useEffect(() => {
    if (REDUCED || !m) return;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (!m) return value;
  return `${m[1]}${n.toLocaleString("en-US")}${m[3]}`;
}

// The share card: 1080×1350, the year's headline numbers.
function shareCard(w) {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(900, 0, 50, 700, 300, 1400);
  g.addColorStop(0, "#0080F0");
  g.addColorStop(1, "#0B1E3F");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#fff";
  ctx.font = "900 44px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillText(`TUNR WRAPPED ${w.year}`, 80, 140);
  ctx.font = "900 92px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillText(w.username ? `@${w.username}` : "My year", 80, 250, 920);
  shareStats(w).forEach(([n, label], i) => {
    const x = 80 + (i % 2) * 470;
    const y = 360 + Math.floor(i / 2) * 300;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.roundRect(x, y, 450, 270, 32);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 130px 'Barlow Condensed', Arial, sans-serif";
    ctx.fillText(n, x + 40, y + 160, 380);
    ctx.font = "900 36px 'Barlow Condensed', Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(label, x + 40, y + 225);
  });
  ctx.fillStyle = "#fff";
  ctx.font = "700 44px 'Barlow', Arial, sans-serif";
  const line = [w.top_meet?.title && `Spot: ${w.top_meet.title}`, w.top_vibe && `Scene: ${w.top_vibe}`].filter(Boolean);
  line.forEach((l, i) => ctx.fillText(l, 80, 1030 + i * 64, 920));
  ctx.font = "900 40px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("TUNR · Georgia car meets", 80, 1270);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("the picture couldn't be made"))), "image/png"));
}
