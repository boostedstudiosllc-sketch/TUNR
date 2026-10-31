import { useEffect, useRef, useState } from "react";
import { loadTodaysCar, guessCar, loadPracticeCar, loadMyGuesses } from "../lib/guessCar.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import FriendRoom from "./FriendRoom.jsx";
import { sharedGame } from "../lib/gameRooms.js";
import { RushAudio } from "../lib/rushAudio.js";
import MusicButtons from "./MusicButtons.jsx";

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

// A "which brand?" round from the 3D garage: what to draw (small enough to
// send to a friend's phone), then the picture itself.
function brandSpec() {
  const four = pick(BRANDS, 4);
  const [brand, name] = four[0];
  const body = brand === "jeep" ? "suv" : ["lamborghini", "ferrari", "porsche"].includes(brand) ? "coupe" : pick(["coupe", "sedan", "hatch"], 1)[0];
  return { brand, body, color: pick(PAINTS, 1)[0], answer: name, options: pick(four.map((b) => b[1]), 4), credit: "TUNR 3D garage", brands: true };
}

async function drawBrand(spec) {
  const { carThumbs } = await import("../lib/showroom3d.js");
  const [url] = carThumbs([{ brand: spec.brand, body: spec.body, color: spec.color, spoiler: "none", rims: "silver", height: "stock" }], 720, 450, Math.PI + 0.12);
  return { ...spec, photo_url: url };
}

const brandRound = () => drawBrand(brandSpec());

// The cars for a quiz against a friend: photos if there are any, the 3D
// brands if not.
const DUEL_CARS = 5;
async function duelCars() {
  const cars = [];
  const skip = [];
  for (let i = 0; i < DUEL_CARS; i++) {
    const c = await loadPracticeCar(skip);
    if (!c?.photo_url) break;
    skip.push(c.key);
    cars.push({ photo_url: c.photo_url, answer: c.answer, options: c.options, credit: c.credit, source_url: c.source_url });
  }
  while (cars.length < DUEL_CARS) cars.push(brandSpec());
  return cars;
}

// Points for an answer: right and quick is best.
export const duelPoints = (correct, seconds) => (correct ? Math.max(20, Math.round(100 - seconds * 4)) : 0);

export default function GuessCar({ onClose, user = null, onNeedAccount }) {
  const [today, setToday] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [round, setRound] = useState(null); // { mode: "today" | "practice", car }
  const [practiceScore, setPracticeScore] = useState({ right: 0, played: 0 });
  // Music (the game's own track), from the first tap that starts a round.
  const audio = useRef(null);
  if (!audio.current) audio.current = new RushAudio({ game: "guess" });
  useEffect(() => () => audio.current?.dispose(), []);
  const music = () => {
    if (audio.current.unlock() && audio.current.prefs.music) audio.current.startMusic();
  };
  // Playing a friend (opens straight there from a shared room link).
  const [friend, setFriend] = useState(() => {
    try {
      return sharedGame() === "guess";
    } catch (e) {
      console.warn("Couldn't read the shared room:", e.message);
      return false;
    }
  });
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
    if (round || friend) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, friend, onClose]);

  async function practice() {
    setError("");
    music();
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
    music();
    setRound({ mode: "today", car: today, id: Date.now() });
  }

  const guessed = today?.guessed;
  if (friend) {
    return (
      <div role="dialog" aria-label="Guess the Car: play a friend" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif", paddingTop: "calc(8px + env(safe-area-inset-top))" }}>
        <FriendRoom
          game="guess"
          title="QUIZ A FRIEND"
          intro={`The same ${DUEL_CARS} cars on both phones. Right answers score up to 100, more the quicker you are. Most points wins.`}
          user={user}
          audio={audio}
          onExit={() => setFriend(false)}
          onNeedAccount={onNeedAccount}
          prepare={duelCars}
          renderPlay={({ start, room, hooks, opponent, onDone, onQuit }) => <Duel key={start.round} start={start} room={room} hooks={hooks} opponent={opponent} onDone={onDone} onQuit={onQuit} />}
          renderResult={(r, opp) => (
            <div style={{ padding: 14, borderRadius: 14, background: r.won ? "linear-gradient(135deg, rgba(34,197,94,0.18), #15181e)" : "#15181e", border: `1px solid ${r.won ? "#16A34A" : "#2A2E36"}`, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: r.won ? "#4ADE80" : r.draw ? "#FACC15" : "#F87171" }}>{r.won ? "🏆 WIN" : r.draw ? "DRAW" : "LOSS"}</div>
              <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05 }}>
                {r.mine} – {r.theirs}
              </div>
              <div style={{ ...muted }}>
                You got {r.right}/{DUEL_CARS} · @{opp?.name || "your friend"} got {r.theirRight}/{DUEL_CARS}
                {r.out ? " (they left)" : ""}
              </div>
            </div>
          )}
        />
      </div>
    );
  }
  return (
    <div role="dialog" aria-label="Guess the Car" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: "clamp(18px, 5.6vw, 25px)", fontWeight: 900, letterSpacing: 1, whiteSpace: "nowrap" }}>
          🔍 GUESS THE <span style={{ color: "#0080F0" }}>CAR</span>
        </div>
        <MusicButtons audio={audio} style={{ ...quietButton, width: 40, height: 40, padding: 0, fontSize: 16 }} />
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
                return { correct, answer: round.car.answer, credit: round.car.credit, source_url: round.car.source_url, points: 0 };
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
                    <Credit text={guessed.credit} url={guessed.source_url} />
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
              <button className="action-btn" onClick={() => setFriend(true)} style={{ ...bigButton, marginTop: 10, background: "linear-gradient(135deg, #DB2777, #7C3AED)", color: "#fff", fontSize: 17, letterSpacing: 2 }}>
                👥 QUIZ A FRIEND · LIVE
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A quiz against a friend: the same cars on both phones, each at your own
// pace; their answers show as they come in. Done when you've both answered
// them all (or they leave, or a minute after you finish).
function Duel({ start, room, hooks, opponent, onDone, onQuit }) {
  const cars = start.data || [];
  const [at, setAt] = useState(0);
  const [car, setCar] = useState(null);
  const [mine, setMine] = useState([]);
  const [theirs, setTheirs] = useState([]);
  const [out, setOut] = useState(false);
  const [error, setError] = useState("");
  const finished = mine.length >= cars.length;
  const sum = (list) => list.reduce((n, a) => n + a.points, 0);

  useEffect(() => {
    hooks.current = {
      answer: (p) => p?.round === start.round && setTheirs((t) => (t.some((a) => a.i === p.i) ? t : [...t, p])),
      bye: () => setOut(true),
    };
  }, []);

  // The car for this round (3D brands are drawn here).
  useEffect(() => {
    if (at >= cars.length) return;
    let live = true;
    setCar(null);
    const c = cars[at];
    (c.photo_url ? Promise.resolve(c) : drawBrand(c))
      .then((ready) => {
        if (!live) return;
        setCar({ ...ready, id: at });
        // For the browser checks.
        if (import.meta.env.DEV) window.__duelCar = ready;
      })
      .catch((e) => setError(`Couldn't show that car. (${e.message})`));
    return () => {
      live = false;
    };
  }, [at]);

  // Over: both done, they left, or a minute after you finished.
  useEffect(() => {
    if (!finished) return;
    const end = () => {
      const a = sum(mine);
      const b = sum(theirs);
      onDone({ mine: a, theirs: b, won: out || a > b, draw: !out && a === b, right: mine.filter((x) => x.correct).length, theirRight: theirs.filter((x) => x.correct).length, out });
    };
    if (theirs.length >= cars.length || out) {
      const id = setTimeout(end, 1200);
      return () => clearTimeout(id);
    }
    const id = setTimeout(end, 60000);
    return () => clearTimeout(id);
  }, [finished, theirs.length, out]);

  const ticks = (list) =>
    cars.map((_, i) => {
      const a = list.find((x) => x.i === i);
      return a ? (a.correct ? "✓" : "✗") : "·";
    });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onQuit} style={{ ...quietButton, padding: "8px 12px", fontSize: 13 }}>
            ← LEAVE
          </button>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 14, fontSize: 15, fontWeight: 900 }}>
            <span>
              YOU {sum(mine)} <span style={{ letterSpacing: 2, color: "#8A94A3" }}>{ticks(mine).join("")}</span>
            </span>
            <span>
              @{opponent.name} {sum(theirs)} <span style={{ letterSpacing: 2, color: "#8A94A3" }}>{ticks(theirs).join("")}</span>
            </span>
          </div>
        </div>
        {error && (
          <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
            {error}
          </div>
        )}
        {finished ? (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 30 }}>⏳</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Waiting on @{opponent.name}…</div>
            <div style={{ ...muted }}>
              They've answered {theirs.length} of {cars.length}.
            </div>
          </div>
        ) : car ? (
          <div style={{ marginTop: 10 }}>
            <Round
              key={car.id}
              mode="duel"
              car={car}
              onAnswer={async (choice, seconds) => {
                const correct = choice === car.answer;
                const entry = { i: at, correct, seconds, points: duelPoints(correct, seconds) };
                setMine((m) => [...m, entry]);
                Promise.resolve(room?.send("answer", { round: start.round, ...entry })).catch((e) => setError(`Couldn't send your answer to your friend. (${e.message})`));
                return { correct, answer: car.answer, credit: car.credit, source_url: car.source_url, points: 0 };
              }}
              onNext={() => setAt((n) => n + 1)}
              nextLabel={at + 1 < cars.length ? `▶ CAR ${at + 2} OF ${cars.length}` : "▶ SEE THE SCORE"}
            />
          </div>
        ) : (
          <div style={{ ...muted, textAlign: "center", marginTop: 40 }}>Loading car {at + 1} of {cars.length}…</div>
        )}
      </div>
    </div>
  );
}

// Who took the photo (and its licence, for Wikimedia photos), linked to the
// photo's page when there is one.
function Credit({ text, url }) {
  if (!text) return null;
  return (
    <div style={{ ...muted, fontSize: 12 }}>
      📸{" "}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ color: "#93C5FD" }}>
          {text}
        </a>
      ) : (
        text
      )}
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
        <span>{mode === "today" ? "TODAY'S CAR" : mode === "duel" ? (car.brands ? "QUIZ · WHICH BRAND?" : "QUIZ · WHICH CAR?") : car.brands ? "PRACTICE · WHICH BRAND?" : "PRACTICE"}</span>
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
          <Credit text={result.credit} url={result.source_url} />
          <button className="action-btn" onClick={onNext} style={{ ...bigButton, marginTop: 10, background: "#FACC15", color: "#111", fontSize: 18, letterSpacing: 2 }}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
