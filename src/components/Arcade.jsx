import { useEffect, useState } from "react";
import TunrRush from "./TunrRush.jsx";
import ParkUp from "./ParkUp.jsx";
import DriftKing from "./DriftKing.jsx";
import KartGame from "./KartGame.jsx";
import CarSoccer from "./CarSoccer.jsx";
import EggHaul from "./EggHaul.jsx";
import DragRace from "./DragRace.jsx";
import GuessCar from "./GuessCar.jsx";
import { LEVELS as PARK_LEVELS, loadProgress } from "../lib/parkEngine.js";
import { loadBests as loadDriftBests } from "../lib/f1Engine.js";
import { loadKartBests } from "../lib/kartEngine.js";
import { loadRecord as loadBallRecord } from "../lib/soccerEngine.js";
import { loadEggBest } from "../lib/eggEngine.js";
import { loadDragProgress, RIVALS } from "../lib/dragEngine.js";
import { loadAllAccess } from "../lib/store.js";
import { muted, quietButton } from "./Sheet.jsx";

// Every TUNR game in one place. One game pays points each day (TUNR Rush);
// the rest are free play.
const GAMES = [
  { id: "rush", icon: "🏁", title: "TUNR Rush", blurb: "Your car, real traffic. Up to +3 points a day.", art: "linear-gradient(145deg, #0b3d91 0%, #0080F0 55%, #38bdf8 100%)", glow: "rgba(0,128,240,0.55)", tag: "+3" },
  { id: "drift", icon: "🏎️", title: "Drift King", blurb: "22 circuits, 4 car types, drift the corners.", art: "linear-gradient(145deg, #450a0a 0%, #dc2626 55%, #fb923c 100%)", glow: "rgba(220,38,38,0.5)" },
  { id: "karts", icon: "🛞", title: "Boosted Karts", blurb: "Drift for turbos, nitro, boost pads.", art: "linear-gradient(145deg, #3b0764 0%, #9333ea 55%, #f472b6 100%)", glow: "rgba(147,51,234,0.5)" },
  { id: "ball", icon: "⚽", title: "Turbo Ball", blurb: "Car soccer: boost, jump, flip.", art: "linear-gradient(145deg, #052e16 0%, #16a34a 55%, #a3e635 100%)", glow: "rgba(22,163,74,0.5)" },
  { id: "guess", icon: "🔍", title: "Guess the Car", blurb: "Blurry photo, four answers. Daily points.", art: "linear-gradient(145deg, #082f49 0%, #0284c7 50%, #a5f3fc 100%)", glow: "rgba(2,132,199,0.5)", tag: "+3" },
  { id: "drag", icon: "🚦", title: "Drag Race", blurb: "Quarter mile. Race the ladder or a friend, live.", art: "linear-gradient(145deg, #0c0a09 0%, #16a34a 50%, #facc15 100%)", glow: "rgba(22,163,74,0.5)", tag: "NEW" },
  { id: "egg", icon: "🥚", title: "Egg Haul", blurb: "Hills with an egg on your roof.", art: "linear-gradient(145deg, #7c2d12 0%, #f97316 50%, #fde047 100%)", glow: "rgba(249,115,22,0.5)" },
  { id: "park", icon: "🅿️", title: "Park Up", blurb: "Squeeze into the spot. No scratches.", art: "linear-gradient(145deg, #1e293b 0%, #475569 55%, #facc15 100%)", glow: "rgba(250,204,21,0.4)" },
];

export default function Arcade({ user, onClose, onToast, onNeedAccount, startGame = null, startVehicle = null }) {
  const [open, setOpen] = useState(() => {
    const game = GAMES.some((g) => g.id === startGame && !g.soon) ? startGame : null;
    // Came from the garage with a car: that game opens with it picked.
    if (game && game !== "rush" && startVehicle) {
      try {
        localStorage.setItem(`tunr.${game}.car`, startVehicle);
      } catch (e) {
        console.warn("Couldn't pick that car for the game:", e.message);
      }
    }
    return game;
  });
  const [parkStars, setParkStars] = useState(0);
  const [driftBest, setDriftBest] = useState(0);
  const [kartWins, setKartWins] = useState(0);
  const [ballRecord, setBallRecord] = useState(null);
  const [eggBest, setEggBest] = useState(0);
  const [drag, setDrag] = useState(null);
  // All access (the operator's account): every level open.
  const [allAccess, setAllAccess] = useState(false);
  useEffect(() => {
    loadAllAccess(user?.id).then(setAllAccess);
  }, [user?.id]);

  // Stars come back up to date after a round of Park Up.
  useEffect(() => {
    if (open) return;
    const p = loadProgress();
    setParkStars(PARK_LEVELS.reduce((n, l) => n + (p[l.id] || 0), 0));
    setDriftBest(Object.values(loadDriftBests()).filter((b) => b.place === 1).length);
    setKartWins(Object.values(loadKartBests()).filter((b) => b.place === 1).length);
    setBallRecord(loadBallRecord());
    setEggBest(loadEggBest());
    setDrag(loadDragProgress());
  }, [open]);

  useEffect(() => {
    if (open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // A line of progress under each icon.
  const stat = (id) =>
    ({
      park: parkStars ? `★ ${parkStars}/${PARK_LEVELS.length * 3}` : "",
      drift: driftBest ? `🏆 ${driftBest} ${driftBest === 1 ? "win" : "wins"}` : "",
      karts: kartWins ? `🏆 ${kartWins} ${kartWins === 1 ? "win" : "wins"}` : "",
      ball: ballRecord && ballRecord.wins + ballRecord.losses > 0 ? `${ballRecord.wins}–${ballRecord.losses}` : "",
      egg: eggBest ? `${eggBest} m` : "",
      drag: drag?.bestEt ? `${drag.beaten}/${RIVALS.length} · ${drag.bestEt.toFixed(2)}s` : "",
      rush: "Daily points",
      guess: "Daily points",
    })[id] || "";

  if (open === "rush") {
    return (
      <TunrRush
        user={user}
        startVehicle={startVehicle}
        onClose={() => setOpen(null)}
        onToast={onToast}
        onNeedAccount={onNeedAccount}
      />
    );
  }
  if (open === "park") return <ParkUp user={user} onClose={() => setOpen(null)} allAccess={allAccess} />;
  if (open === "drift") return <DriftKing user={user} onClose={() => setOpen(null)} />;
  if (open === "karts") return <KartGame user={user} onClose={() => setOpen(null)} />;
  if (open === "ball") return <CarSoccer user={user} onClose={() => setOpen(null)} />;
  if (open === "egg") return <EggHaul user={user} onClose={() => setOpen(null)} />;
  if (open === "drag") return <DragRace user={user} onClose={() => setOpen(null)} onNeedAccount={onNeedAccount} />;
  if (open === "guess") return <GuessCar user={user} onClose={() => setOpen(null)} onNeedAccount={onNeedAccount} />;

  return (
    <div
      role="dialog"
      aria-label="TUNR Arcade"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "#0A0A0A",
        color: "#F0F0F0",
        overflowY: "auto",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 430,
          margin: "0 auto",
          padding:
            "calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
            🎮 TUNR <span style={{ color: "#0080F0" }}>ARCADE</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close the arcade"
            style={{
              ...quietButton,
              width: 44,
              height: 44,
              padding: 0,
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ ...muted, fontSize: 13.5, marginTop: 6 }}>
          One game pays points each day: TUNR Rush. Everything else is just for
          fun.
        </div>

        {/* Today's points game, up top. */}
        <button
          className="action-btn"
          onClick={() => setOpen("rush")}
          style={{
            position: "relative",
            width: "100%",
            marginTop: 16,
            padding: "16px 16px",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "radial-gradient(120% 140% at 100% 0%, rgba(56,189,248,0.45), transparent 55%), linear-gradient(135deg, #0b1f3f, #0a4fa8)",
            color: "#fff",
            textAlign: "left",
            cursor: "pointer",
            overflow: "hidden",
            fontFamily: "'Barlow Condensed', sans-serif",
            boxShadow: "0 10px 30px rgba(0,128,240,0.35)",
          }}
        >
          <span aria-hidden="true" style={{ position: "absolute", right: -6, top: -10, fontSize: 92, opacity: 0.9, transform: "rotate(-12deg)", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.4))" }}>
            🏁
          </span>
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 900, letterSpacing: 1.5, color: "#111", background: "#FACC15", borderRadius: 6, padding: "3px 8px" }}>⭐ TODAY'S POINTS GAME</span>
          <span style={{ display: "block", fontSize: 30, fontWeight: 900, lineHeight: 1, marginTop: 8 }}>TUNR RUSH</span>
          <span style={{ display: "block", fontSize: 13.5, color: "#BFDBFE", marginTop: 4, maxWidth: "70%", fontFamily: "'Barlow', sans-serif" }}>Drive your car through traffic. Clear today's level for up to +3 points.</span>
          <span style={{ display: "inline-block", marginTop: 12, fontSize: 15, fontWeight: 900, letterSpacing: 1.5, background: "#fff", color: "#0a4fa8", borderRadius: 999, padding: "7px 18px" }}>PLAY ▶</span>
        </button>

        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "#7D8796", margin: "22px 2px 12px" }}>ALL GAMES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 10px" }}>
          {GAMES.map((g) => (
            <AppIcon key={g.id} game={g} stat={stat(g.id)} onOpen={() => setOpen(g.id)} />
          ))}
        </div>

        <button
          className="action-btn"
          onClick={() => {
            onClose();
            window.dispatchEvent(
              new CustomEvent("tunr:open", {
                detail: { link: "tab:discover" },
              }),
            );
          }}
          style={{
            ...quietButton,
            marginTop: 22,
            padding: "15px 0",
            fontSize: 15,
          }}
        >
          🏠 BACK TO HOME
        </button>
      </div>
    </div>
  );
}

// One game, as a phone app icon: a glossy rounded square with its art, a
// badge in the corner, the name and a line of progress under it.
function AppIcon({ game, stat, onOpen }) {
  return (
    <button
      className="action-btn"
      onClick={onOpen}
      aria-label={`${game.title}. ${game.blurb}`}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#F0F0F0", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, fontFamily: "'Barlow Condensed', sans-serif" }}
    >
      <span
        style={{
          position: "relative",
          width: "min(84px, 24vw)",
          aspectRatio: "1",
          borderRadius: "23%",
          background: game.art,
          boxShadow: `0 8px 22px ${game.glow}, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -10px 20px rgba(0,0,0,0.25)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        {/* Speed lines and a glossy top. */}
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "inherit", background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0 3px, transparent 3px 11px)" }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: "0 0 50% 0", borderRadius: "23% 23% 40% 40% / 23% 23% 18% 18%", background: "linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0.04))" }} />
        <span aria-hidden="true" style={{ position: "relative", fontSize: "min(44px, 12.5vw)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.45))" }}>
          {game.icon}
        </span>
        {game.tag && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, background: game.tag === "NEW" ? "#EF4444" : "#FACC15", color: game.tag === "NEW" ? "#fff" : "#111", fontSize: 11, fontWeight: 900, lineHeight: "22px", boxShadow: "0 2px 6px rgba(0,0,0,0.4)", border: "2px solid #0A0A0A" }}>
            {game.tag}
          </span>
        )}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.1, textAlign: "center" }}>{game.title}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#FACC15", minHeight: 13, marginTop: -4 }}>{stat}</span>
    </button>
  );
}
