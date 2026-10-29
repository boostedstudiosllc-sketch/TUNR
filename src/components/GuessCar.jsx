import { useEffect, useRef, useState } from "react";
import { loadTodaysCar, guessCar, loadPracticeCar, loadMyGuesses } from "../lib/guessCar.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";

// Guess the Car: a blurred photo sharpens over 20 seconds; pick the make
// and model from four. Today's car is the same for everyone and pays 1–3
// points (quicker pays more). Practice is free, as many as you like; with
// no photos yet, practice is "guess the brand" from 3D front ends.

const REVEAL = 20; // seconds to fully sharp
const REDUCED = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Brands whose 3D front ends are distinct enough to guess.
const BRANDS = [
  ["bmw", "BMW"], ["audi", "Audi"], ["mercedes", "Mercedes-Benz"], ["subaru", "Subaru"], ["jeep", "Jeep"], ["mini", "MINI"],
  ["porsche", "Porsche"], ["toyota", "Toyota"], ["honda", "Honda"], ["ford", "Ford"], ["dodge", "Dodge"], ["chevrolet", "Chevrolet"],
  ["nissan", "Nissan"], ["lamborghini", "Lamborghini"], ["ferrari", "Ferrari"], ["tesla", "Tesla"], ["genesis", "Genesis"], ["mazda", "Mazda"],
];
const PAINTS = ["#DC2626", "#1D4ED8", "#F5F5F5", "#111827", "#EAB308", "#10B981", "#7C3AED", "#9CA3AF"];
const pick = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);

async function brandRound() {
  const four = pick(BRANDS, 4);
  const [brand, name] = four[0];
  const body = brand === "jeep" ? "suv" : ["lamborghini", "ferrari", "porsche"].includes(brand) ? "coupe" : pick(["coupe", "sedan", "hatch"], 1)[0];
  const { carThumbs } = await import("../lib/showroom3d.js");
  const [url] = carThumbs([{ brand, body, color: pick(PAINTS, 1)[0], spoiler: "none", rims: "silver", height: "stock" }], 720, 450, Math.PI + 0.12);
  return { photo_url: url, answer: name, options: pick(four.map((b) => b[1]), 4), credit: "TUNR 3D garage", brands: true };
}

export default function GuessCar({ onClose, user = null, onNeedAccount }) {
  const [today, setToday] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(null); // { mode: "today" | "practice", car }
  const [practiceScore, setPracticeScore] = useState({ right: 0, played: 0 });
  const seen = useRef([]);

  const refresh = () => {
    loadTodaysCar()
      .then(setToday)
      .catch((e) => setError(e.message));
    if (user)
      loadMyGuesses()
        .then(setStats)
        .catch((e) => console.warn(e.message));
  };
  useEffect(refresh, [user?.id]);

  useEffect(() => {
    if (round) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, onClose]);

  async function practice() {
    setError("");
    try {
      let car = today?.pool > 0 ? await loadPracticeCar(seen.current.slice(-20)) : null;
      if (car?.key) seen.current.push(car.key);
      if (!car) car = await brandRound();
      setRound({ mode: "practice", car, id: Date.now() });
    } catch (e) {
      setError(e.message);
    }
  }

  function playToday() {
    if (!user) return onNeedAccount?.();
    setRound({ mode: "today", car: today, id: Date.now() });
  }

  const guessed = today?.guessed;
  return (
    <div role="dialog" aria-label="Guess the Car" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
          🔍 GUESS THE <span style={{ color: "#0080F0" }}>CAR</span>
        </div>
        <button onClick={round ? () => setRound(null) : onClose} aria-label={round ? "Back" : "Close the game"} style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 18 }}>
          {round ? "←" : "✕"}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
          {error && (
            <div role="alert" style={{ ...muted, color: "#F87171", marginBottom: 8 }}>
              {error}
            </div>
          )}
          {round ? (
            <Round
              key={round.id}
              mode={round.mode}
              car={round.car}
              onAnswer={async (choice, seconds) => {
                if (round.mode === "today") {
                  const r = await guessCar(choice, seconds);
                  refresh();
                  return r;
                }
                const correct = choice === round.car.answer;
                setPracticeScore((s) => ({ right: s.right + (correct ? 1 : 0), played: s.played + 1 }));
                return { correct, answer: round.car.answer, credit: round.car.credit, points: 0 };
              }}
              practiceScore={round.mode === "practice" ? practiceScore : null}
              onNext={round.mode === "practice" ? practice : () => setRound(null)}
              nextLabel={round.mode === "practice" ? "▶ NEXT CAR" : "DONE"}
            />
          ) : (
            <>
              <div style={{ ...muted, fontSize: 13.5 }}>
                A car photo starts blurred and sharpens over {REVEAL} seconds. Pick the make and model. Today's car is the same for everyone: get it right for <strong style={{ color: "#FACC15" }}>⭐ 1–3 points</strong>, more the quicker you are. One guess a day.
              </div>
              <div style={{ marginTop: 14, padding: 14, borderRadius: 16, border: "1px solid #232833", background: "linear-gradient(135deg, rgba(0,128,240,0.14), #13161c)" }}>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, color: "#8A94A3" }}>TODAY'S CAR</div>
                {!today ? (
                  <div style={{ ...muted, marginTop: 6 }}>Loading…</div>
                ) : !today.pool ? (
                  <div style={{ ...muted, marginTop: 6 }}>No car photos yet. Try practice: guess the brand from our 3D garage.</div>
                ) : guessed ? (
                  <div style={{ marginTop: 8 }}>
                    <img src={today.photo_url} alt={guessed.answer} style={{ width: "100%", borderRadius: 12, maxHeight: 260, objectFit: "cover" }} />
                    <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8, color: guessed.correct ? "#4ADE80" : "#F87171" }}>{guessed.correct ? "✓ Got it" : "✗ Not quite"}: {guessed.answer}</div>
                    {guessed.credit && <div style={{ ...muted, fontSize: 12 }}>📸 {guessed.credit}</div>}
                    <div style={{ ...muted, marginTop: 4 }}>A new car tomorrow.</div>
                  </div>
                ) : (
                  <button className="action-btn" onClick={playToday} style={{ ...bigButton, marginTop: 10, background: "#FACC15", color: "#111", fontSize: 20, letterSpacing: 2 }}>
                    ▶ PLAY TODAY'S CAR
                  </button>
                )}
              </div>
              {stats && stats.played > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                  {[
                    ["PLAYED", stats.played],
                    ["RIGHT", `${Math.round((stats.correct / stats.played) * 100)}%`],
                    ["STREAK", `🔥 ${stats.streak}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "#13161c", border: "1px solid #232833", borderRadius: 10, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "#8A94A3" }}>{k}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#FACC15" }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="action-btn" onClick={practice} style={{ ...quietButton, width: "100%", marginTop: 14, padding: "13px 0", fontSize: 16 }}>
                🎯 PRACTICE {today?.pool ? "(NO POINTS)" : ": GUESS THE BRAND"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Round({ mode, car, onAnswer, onNext, nextLabel, practiceScore }) {
  const img = useRef(null);
  const t0 = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(null);

  // Sharpen and zoom out as the seconds pass (straight to the image, no
  // re-render per frame).
  useEffect(() => {
    if (!loaded || result) return undefined;
    t0.current = performance.now();
    let raf;
    const frame = (now) => {
      const k = Math.min(1, (now - t0.current) / 1000 / REVEAL);
      const e = 1 - k;
      if (img.current) {
        img.current.style.filter = `blur(${(REDUCED ? 18 : 28) * e * e}px) saturate(${0.6 + 0.4 * k})`;
        img.current.style.transform = `scale(${1 + 0.9 * e})`;
      }
      if (timer.current) timer.current.style.width = `${(1 - k) * 100}%`;
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded, result]);

  async function choose(opt) {
    if (busy || result) return;
    const seconds = (performance.now() - (t0.current || performance.now())) / 1000;
    setPicked(opt);
    setBusy(true);
    setError("");
    try {
      const r = await onAnswer(opt, Math.round(seconds * 10) / 10);
      setResult({ ...r, seconds });
      if (img.current) {
        img.current.style.filter = "none";
        img.current.style.transform = "none";
      }
    } catch (e) {
      setError(e.message);
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 900, letterSpacing: 1.5, color: "#8A94A3" }}>
        <span>{mode === "today" ? "TODAY'S CAR" : car.brands ? "PRACTICE · WHICH BRAND?" : "PRACTICE"}</span>
        {practiceScore && practiceScore.played > 0 && (
          <span>
            {practiceScore.right}/{practiceScore.played} RIGHT
          </span>
        )}
      </div>
      <div style={{ position: "relative", marginTop: 8, borderRadius: 16, overflow: "hidden", background: "#111", aspectRatio: "16 / 10" }}>
        <img
          ref={img}
          src={car.photo_url}
          alt={result ? result.answer : "A mystery car, blurred"}
          onLoad={() => setLoaded(true)}
          onError={() => setError("Couldn't load the car photo. Try another one.")}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "blur(28px)", transform: "scale(1.9)", transition: result ? "filter 0.4s, transform 0.6s" : "none" }}
        />
        {!loaded && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...muted }}>Loading the car…</div>}
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#1f2430", overflow: "hidden", marginTop: 8 }}>
        <div ref={timer} style={{ height: "100%", width: "100%", background: "linear-gradient(90deg, #FACC15, #0080F0)" }} />
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 6 }}>
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        {(car.options || []).map((opt) => {
          const isAnswer = result && opt === result.answer;
          const wrongPick = result && opt === picked && !result.correct;
          return (
            <button
              key={opt}
              onClick={() => choose(opt)}
              disabled={!loaded || busy || Boolean(result)}
              style={{ minHeight: 58, padding: "8px 10px", borderRadius: 12, border: `2px solid ${isAnswer ? "#22C55E" : wrongPick ? "#EF4444" : picked === opt ? "#0080F0" : "#2A2F3A"}`, background: isAnswer ? "rgba(34,197,94,0.18)" : wrongPick ? "rgba(239,68,68,0.15)" : "#15181e", color: "#F0F0F0", fontSize: 16, fontWeight: 900, lineHeight: 1.1, cursor: result ? "default" : "pointer", fontFamily: "'Barlow Condensed', sans-serif", opacity: !loaded ? 0.5 : 1 }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {result && (
        <div role="status" style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: result.correct ? "#4ADE80" : "#F87171" }}>{result.correct ? `✓ ${result.answer}` : `✗ It's a ${result.answer}`}</div>
          <div style={{ ...muted }}>
            {result.correct ? `${result.seconds.toFixed(1)}s` : ""}
            {result.points ? ` · ⭐ +${result.points}, waiting in your checklist` : mode === "today" && !result.correct ? "New car tomorrow." : ""}
          </div>
          {result.credit && <div style={{ ...muted, fontSize: 12 }}>📸 {result.credit}</div>}
          <button className="action-btn" onClick={onNext} style={{ ...bigButton, marginTop: 10, background: "#FACC15", color: "#111", fontSize: 18, letterSpacing: 2 }}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
