import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LEVELS,
  LEVEL_IDS,
  START_COPY,
  levelRules,
  DEFAULT_LOOK,
  lookOf,
  newGame,
  tick,
  seededRand,
  themeFor,
  gameToday,
  STEP,
  scoreOf,
  drawGame,
  startRun,
  finishRun,
  loadMyGame,
  loadGameLeaderboard,
  saveGameLook,
  loadGameSettings,
  loadGhost,
  SCENERY,
  loadScenery,
  unlockScenery,
  unlockMessage,
  loadPickedScenery,
  savePickedScenery,
  lookColumns,
} from "../lib/rush.js";
import { loadMyPoints, pointsEarned, CLAIM_HINT } from "../lib/points.js";
import { RushAudio, loadSoundPrefs } from "../lib/rushAudio.js";
import TrackButton from "./TrackButton.jsx";
import { loadVehicles, loadProfile } from "../lib/store.js";
import { Avatar } from "./EditProfile.jsx";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";
import { GarageShowroom, RideCard, carName as nameOf } from "./Showroom.jsx";

// The Boosted Studios badge (the boost pickup) and the full logo (shown
// while boosting). Loaded once; the game draws them when ready.
const ART = typeof Image === "undefined" ? {} : { boost: new Image(), logo: new Image() };
if (ART.boost) {
  ART.boost.src = "/game/boost.webp";
  ART.logo.src = "/game/boosted-logo.webp";
}

const GFX_KEY = "tunr.rush.graphics";
// Phones with few cores get 3D without shadows, to stay smooth.
const LOW_POWER = typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 8) <= 4;

// Graphics are 3D (rush3d.js) unless the player picks Classic, which is
// lighter for older phones; a phone that can't run 3D falls back to
// Classic by itself. The choice is remembered on the device.
function loadGfx() {
  try {
    return localStorage.getItem(GFX_KEY) === "classic" ? "classic" : "3d";
  } catch (e) {
    console.warn("Couldn't read the graphics setting:", e.message);
    return "3d";
  }
}
function saveGfx(v) {
  try {
    localStorage.setItem(GFX_KEY, v);
  } catch (e) {
    console.warn("Couldn't save the graphics setting:", e.message);
  }
}
export const LEVELS = {
  easy: { name: "Easy", color: "#10B981" },
  medium: { name: "Medium", color: "#FACC15" },
  hard: { name: "Hard", color: "#EF4444" },
};

// TUNR Rush: a full-screen driving game in your own car. Each day you pick
// Easy (+1), Medium (+2) or Hard (+3); the first run locks it in, and you
// get a few tries to reach its goal (checked by the server). Other runs are
// practice. Leaderboards per level. Admins set the rules (Settings → Admin
// → TUNR Rush).
export default function TunrRush({ user, onClose, onToast, onNeedAccount, startVehicle = null }) {
  const [screen, setScreen] = useState("garage"); // garage | play | result | board
  const [cars, setCars] = useState([]);
  const [carId, setCarId] = useState(null);
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [settings, setSettings] = useState({ enabled: true, triesPerDay: 3, levels: DEFAULT_LEVELS });
  const [level, setLevel] = useState("medium");
  const [boardLevel, setBoardLevel] = useState("medium");
  const [theme] = useState(() => themeFor(gameToday()));
  const [ghost, setGhost] = useState(null);
  const rules = levelRules(settings, level);
  const [plate, setPlate] = useState("TUNR");
  const [mine, setMine] = useState(null);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState(null);
  const [boardPeriod, setBoardPeriod] = useState("week");
  const saveTimers = useRef({});
  const [garageOpen, setGarageOpen] = useState(false);
  const audio = useRef(null);
  const [sound, setSound] = useState(loadSoundPrefs);
  const [gfx, setGfx] = useState(loadGfx);
  const [scenery, setScenery] = useState({ list: [], owned: new Set(["desert"]) });
  const [place, setPlace] = useState(loadPickedScenery);
  const [buying, setBuying] = useState(null); // the scenery being unlocked
  const [balance, setBalance] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  // Sound can only start from a tap, so it begins with the first START.
  function play() {
    if (!audio.current) audio.current = new RushAudio({ game: "rush" });
    if (audio.current.unlock()) audio.current.startMusic();
    setScreen("play");
  }
  function toggle(kind) {
    const next = { ...sound, [kind]: !sound[kind] };
    setSound(next);
    if (!audio.current) audio.current = new RushAudio({ game: "rush" });
    if (kind === "music") audio.current.setMusic(next.music);
    else audio.current.setSfx(next.sfx);
  }
  useEffect(() => () => audio.current?.dispose(), []);
  const [error, setError] = useState("");

  const car = cars.find((c) => c.id === carId) || null;
  const carName = nameOf(car);

  useEffect(() => {
    loadGameSettings()
      .then(setSettings)
      .catch((e) => console.warn(e.message));
  }, []);

  useEffect(() => {
    loadScenery(user?.id)
      .then(setScenery)
      .catch((e) => setError(e.message));
  }, [user?.id]);
  // Only drive somewhere you own (a pick from another account falls back).
  const placeNow = scenery.owned.has(place) ? place : "desert";

  function choosePlace(id) {
    setPlace(id);
    savePickedScenery(id);
  }

  async function startBuying(item) {
    if (!user) return onNeedAccount();
    setBuying(item);
    setBalance(null);
    try {
      const p = await loadMyPoints();
      setBalance(Number(p.balance || 0));
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmBuy() {
    setUnlocking(true);
    try {
      const r = await unlockScenery(buying.id);
      if (r.status !== "ok" && r.status !== "owned") {
        onToast(unlockMessage(r));
        return;
      }
      setScenery((sc) => ({ ...sc, owned: new Set([...sc.owned, buying.id]) }));
      choosePlace(buying.id);
      onToast(`${SCENERY[buying.id].emoji} ${buying.name} unlocked${r.balance != null ? ` · ${r.balance} points left` : ""}`);
      setBuying(null);
    } catch (e) {
      onToast(e.message);
    } finally {
      setUnlocking(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadVehicles(user.id)
      .then((list) => {
        setCars(list);
        // The car you came to drive (the garage's DRIVE button), else your main car.
        const first = list.find((c) => c.id === startVehicle) || list.find((c) => c.is_primary) || list[0];
        if (first) pick(first);
      })
      .catch((e) => setError(e.message));
    loadProfile(user.id)
      .then((p) => {
        if (p?.username) setPlate(p.username);
      })
      .catch((e) => console.warn(e.message));
    refreshMine(true);
  }, [user?.id]);

  // Your best run today on this level is the ghost for your next try.
  useEffect(() => {
    setGhost(null);
    if (!user) return;
    loadGhost(level)
      .then(setGhost)
      .catch((e) => console.warn(e.message));
  }, [user?.id, level]);

  // Today's pick and tries, and your bests. On first load, start on the
  // level you picked today.
  function refreshMine(first = false) {
    loadMyGame()
      .then((m) => {
        setMine(m);
        if (first && m?.today?.difficulty) setLevel(m.today.difficulty);
      })
      .catch((e) => console.warn(e.message));
  }

  const today = mine?.today || null;
  const triesLimit = settings.triesPerDay;
  const outOfTries = Boolean(today && triesLimit > 0 && today.tries >= triesLimit);
  const forPoints = Boolean(user) && (!today || (today.difficulty === level && !today.done && !outOfTries));
  const todayName = today ? LEVELS[today.difficulty].name : "";
  const todayPoints = today ? settings.levels[today.difficulty].points : 0;

  function pick(c) {
    setCarId(c.id);
    setLook(lookOf(c));
  }

  // Restyling in the garage: shown at once, saved to the car once you stop
  // tapping. The loaner (no car of your own) just keeps its look here.
  function restyle(c, next) {
    if (c.id === "loaner" || c.id === carId) setLook(next);
    if (c.id === "loaner") return;
    setCars((list) =>
      list.map((x) => (x.id === c.id ? { ...x, ...lookColumns(next) } : x))
    );
    clearTimeout(saveTimers.current[c.id]);
    saveTimers.current[c.id] = setTimeout(() => saveGameLook(c.id, next).catch((e) => onToast(e.message)), 500);
  }
  const garageCars = cars.length
    ? cars
    : [{ id: "loaner", make: "TUNR", model: "Loaner", ...lookColumns(look) }];

  async function loadBoard(period = "week", lvl = boardLevel) {
    setBoardPeriod(period);
    setBoardLevel(lvl);
    setBoard(null);
    try {
      setBoard(await loadGameLeaderboard(period, lvl));
    } catch (e) {
      setError(e.message);
      setBoard([]);
    }
  }

  function openBoard(period = "week", lvl = boardLevel) {
    setScreen("board");
    loadBoard(period, lvl);
  }

  // The phone's back gesture and Escape close the game.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="TUNR Rush"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "#0A0A0A",
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'Barlow Condensed', sans-serif",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          // Clear of the phone's status bar and home bar.
          padding: "calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom))",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "clamp(20px, 6.2vw, 26px)", fontWeight: 900, letterSpacing: 1, whiteSpace: "nowrap" }}>
            🎮 TUNR <span style={{ color: "#0080F0" }}>RUSH</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => toggle("music")}
              aria-label={sound.music ? "Turn music off" : "Turn music on"}
              aria-pressed={sound.music}
              style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17, opacity: sound.music ? 1 : 0.4 }}
            >
              🎵
            </button>
            <TrackButton audio={audio} ensure={() => (audio.current = new RushAudio({ game: "rush" }))} style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 }} />
            <button
              onClick={() => toggle("sfx")}
              aria-label={sound.sfx ? "Turn sound effects off" : "Turn sound effects on"}
              aria-pressed={sound.sfx}
              style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 }}
            >
              {sound.sfx ? "🔊" : "🔇"}
            </button>
            <button onClick={onClose} aria-label="Close the game" style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 18 }}>
              ✕
            </button>
          </div>
        </div>
        {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

        {screen === "garage" && (
          <>
            <div style={{ ...muted, marginTop: 6 }}>
              Dodge traffic and grab ⏱ for extra time. Grab the Boosted badge{" "}
              <img src="/game/boost.webp" alt="" style={{ width: 22, height: "auto", verticalAlign: "middle" }} /> for a{" "}
              <b style={{ color: "#38BDF8" }}>boost</b>: a few seconds flat out with big blue flames. You still have to dodge, and a crash ends it.
            </div>

            <div style={{ ...label, marginTop: 14 }}>TODAY'S LEVEL</div>
            <div style={{ display: "flex", gap: 6 }}>
              {LEVEL_IDS.map((id) => {
                const L = settings.levels[id];
                const on = level === id;
                const isToday = today?.difficulty === id;
                return (
                  <button
                    key={id}
                    onClick={() => setLevel(id)}
                    aria-pressed={on}
                    style={{
                      flex: 1,
                      padding: "10px 4px",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: on ? `${LEVELS[id].color}22` : "#141414",
                      border: `${on ? 2 : 1}px solid ${on ? LEVELS[id].color : "#2A2A2A"}`,
                      color: "#F0F0F0",
                      fontFamily: "'Barlow Condensed', sans-serif",
                      opacity: today && !isToday ? 0.6 : 1,
                    }}
                  >
                    <span style={{ display: "block", fontSize: 17, fontWeight: 900, color: LEVELS[id].color }}>{LEVELS[id].name.toUpperCase()}</span>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>+{L.points} PT{L.points === 1 ? "" : "S"}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "#999", fontFamily: "'Barlow', sans-serif" }}>
                      {L.startTime}s · {L.goal.toLocaleString()} m
                    </span>
                    {isToday && <span style={{ display: "block", fontSize: 10.5, fontWeight: 900, color: LEVELS[id].color, marginTop: 2 }}>TODAY</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ ...muted, color: "#DDD", marginTop: 8, fontSize: 13 }}>
              {!user
                ? "Playing as a guest: practice only."
                : !today
                  ? `Pick one. Your first run locks it in until tomorrow, with ${triesLimit > 0 ? `${triesLimit} ${triesLimit === 1 ? "try" : "tries"}` : "unlimited tries"} to reach the goal.`
                  : today.done
                    ? `✓ Today's +${todayPoints} from ${todayName} is in. Every run now is practice.`
                    : outOfTries
                      ? `Out of tries on ${todayName} today. Practice only until tomorrow.`
                      : today.difficulty !== level
                        ? `Today's level is ${todayName}. Runs on ${LEVELS[level].name} are practice (no points).`
                        : `Today: ${todayName}. ${triesLimit > 0 ? `${triesLimit - today.tries} of ${triesLimit} tries left.` : "Unlimited tries."}`}
            </div>
            <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
              Goal: <b style={{ color: "#FACC15" }}>{rules.goal.toLocaleString()} m</b> in one run, starting with {rules.startTime} seconds.
              Today's course: {theme.name}. A new course every day, the same for all your tries today.
            </div>
            {ghost && (
              <div style={{ ...muted, fontSize: 12.5, marginTop: 4, color: "#C4B5FD" }}>
                👻 Your ghost drives your best today ({Number(ghost.distance).toLocaleString()} m). Beat it!
              </div>
            )}
            <div style={{ ...label, marginTop: 14 }}>YOUR RIDE</div>
            <RideCard name={carName} look={look} onOpen={() => setGarageOpen(true)} />
            {user && cars.length === 0 && (
              <div style={{ ...muted, fontSize: 12.5, marginTop: 5 }}>
                Add your car in your garage (Profile → Garage) to drive it here. For now you're in the TUNR loaner.
              </div>
            )}
            {garageOpen && (
              <GarageShowroom
                title="GARAGE"
                cars={garageCars}
                startId={carId || "loaner"}
                plate={plate}
                flat={gfx === "classic"}
                editable
                onLook={restyle}
                onClose={() => setGarageOpen(false)}
                action={{
                  label: "SELECT",
                  sub: "DRIVE IT IN TUNR RUSH",
                  onPick: (c) => {
                    if (c && c.id !== "loaner") pick(c);
                    setGarageOpen(false);
                  },
                }}
              />
            )}

            <div style={{ ...label, marginTop: 12 }}>GRAPHICS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                ["3d", "3D"],
                ["classic", "Classic (lighter, for older phones)"],
              ].map(([id, name]) => (
                <button key={id} onClick={() => (setGfx(id), saveGfx(id))} style={{ ...chip, ...(gfx === id ? chipOn : {}) }}>
                  {name}
                </button>
              ))}
            </div>

            <div style={{ ...label, marginTop: 12 }}>SCENERY · UNLOCK MORE WITH POINTS</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {scenery.list
                .filter((sc) => sc.active || scenery.owned.has(sc.id))
                .map((sc) => {
                  const look = SCENERY[sc.id];
                  const owned = scenery.owned.has(sc.id);
                  const on = placeNow === sc.id;
                  const sky = look.sky || ["#7DD3FC", "#E0F2FE"];
                  return (
                    <button
                      key={sc.id}
                      className="action-btn"
                      aria-pressed={on}
                      aria-label={owned ? `Drive in the ${sc.name}` : `Unlock ${sc.name} for ${sc.price} points`}
                      onClick={() => (owned ? choosePlace(sc.id) : startBuying(sc))}
                      style={{
                        position: "relative",
                        height: 74,
                        borderRadius: 10,
                        cursor: "pointer",
                        border: on ? "2px solid #3CABFD" : "1px solid #2A2A2A",
                        background: `linear-gradient(180deg, ${sky[0]} 0%, ${sky[1]} 52%, ${look.ground || "#d8b27a"} 52%)`,
                        color: "#fff",
                        padding: 0,
                        overflow: "hidden",
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: 26, filter: owned ? "none" : "grayscale(0.6)" }}>
                        {look.emoji}
                      </span>
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", fontSize: 12, fontWeight: 800, padding: "2px 0", letterSpacing: 0.5 }}>
                        {on ? "✓ " : ""}
                        {sc.name}
                        {!owned && <span style={{ color: "#FACC15" }}> · 🔒 {sc.price} pts</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
            {buying && (
              <div role="dialog" aria-label={`Unlock ${buying.name}`} style={{ marginTop: 8, background: "#141414", border: "1px solid #3A3000", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 900 }}>
                  {SCENERY[buying.id].emoji} Unlock {buying.name} for <span style={{ color: "#FACC15" }}>{buying.price} points</span>?
                </div>
                <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
                  {balance === null ? "Checking your points…" : `You have ${balance} points.`} Yours to keep, on every run. Scenery is looks
                  only: the course and points are the same everywhere.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="action-btn"
                    disabled={unlocking || balance === null || balance < buying.price}
                    onClick={confirmBuy}
                    style={{ ...bigButton, flex: 2, padding: "11px 0", opacity: unlocking || balance === null || balance < buying.price ? 0.5 : 1 }}
                  >
                    {unlocking ? "UNLOCKING…" : balance !== null && balance < buying.price ? `NEED ${buying.price - balance} MORE` : `UNLOCK · ${buying.price} PTS`}
                  </button>
                  <button className="action-btn" onClick={() => setBuying(null)} style={{ ...quietButton, flex: 1, padding: "11px 0" }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {rules.enabled ? (
              <button
                className="action-btn"
                onClick={play}
                style={{ ...bigButton, marginTop: 18, fontSize: 18, padding: "16px 0", ...(forPoints ? {} : { background: "#2A2A2A" }) }}
              >
                {forPoints ? (today ? "🏁 START" : `🏁 START · LOCK IN ${LEVELS[level].name.toUpperCase()}`) : "🏁 PRACTICE RUN"}
              </button>
            ) : (
              <div style={{ ...muted, marginTop: 18, textAlign: "center", color: "#FACC15" }}>
                🅿️ TUNR Rush is parked for now. Check back soon.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="action-btn" onClick={() => openBoard("week", level)} style={{ ...quietButton, flex: 1 }}>🏆 LEADERBOARD</button>
            </div>
            {mine && (
              <div style={{ ...muted, textAlign: "center", marginTop: 10 }}>
                Your best on {LEVELS[level].name}: {Number(mine.best?.[level] || 0).toLocaleString()} m · this week:{" "}
                {Number(mine.week_best?.[level] || 0).toLocaleString()} m
              </div>
            )}
            {!user && (
              <div style={{ ...muted, fontSize: 12.5, marginTop: 10, textAlign: "center" }}>
                Playing as a guest: runs don't earn points or make the leaderboard.{" "}
                <button onClick={onNeedAccount} style={{ background: "none", border: "none", color: "#38BDF8", cursor: "pointer", padding: 0, font: "inherit" }}>
                  Sign in
                </button>
              </div>
            )}
            <div style={{ ...muted, fontSize: 11.5, marginTop: 14 }}>
              Tap the left or right side (or swipe, or use the arrow keys) to change lanes. Crashing costs{" "}
              {rules.crashSeconds} seconds. Free to play; points are for skill, never luck. Please don't play while driving.
            </div>
          </>
        )}

        {screen === "play" && (
          <Game
            look={look}
            plate={plate}
            rules={rules}
            ghostRun={ghost}
            theme={theme}
            place={placeNow}
            difficulty={level}
            forPoints={forPoints}
            onStarted={(res) => res?.today && setMine((m) => ({ ...(m || {}), today: res.today }))}
            audio={audio.current}
            gfx={gfx}
            onFallback={(why) => (setGfx("classic"), saveGfx("classic"), onToast(why))}
            vehicleId={user ? carId : null}
            signedIn={Boolean(user)}
            onDone={(r) => {
              setResult({ ...r, level, goal: rules.goal });
              setScreen("result");
              // The run is saved by now, so the board includes it.
              loadBoard("week", level);
              if (user) {
                refreshMine();
                loadGhost(level)
                  .then(setGhost)
                  .catch((e) => console.warn(e.message));
              }
            }}
            onQuit={() => setScreen("garage")}
          />
        )}

        {screen === "result" && result && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div style={{ ...label, marginBottom: 0 }}>YOU DROVE</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: LEVELS[result.level].color, letterSpacing: 1.5 }}>
              {LEVELS[result.level].name.toUpperCase()}
              {result.server && !result.server.counts ? " · PRACTICE" : ""}
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: result.dist >= result.goal ? "#10B981" : "#F0F0F0" }}>
              {result.dist.toLocaleString()} m
            </div>
            <div style={{ ...muted, marginTop: 6 }}>
              ⏱ {result.pickups} · 🚀 {result.boosts} boost{result.boosts === 1 ? "" : "s"}
              {" "}· 💥 {result.crashes} crash{result.crashes === 1 ? "" : "es"} · score{" "}
              {result.score.toLocaleString()}
            </div>
            <div style={{ marginTop: 14, fontSize: 17, fontWeight: 900, color: result.server?.earned ? "#FACC15" : "#AAA" }}>
              <ResultLine result={result} triesLimit={triesLimit} today={today} />
            </div>
            {result.server && result.dist >= (result.server.best || 0) && result.dist > 0 && (
              <div style={{ marginTop: 6, color: "#3CABFD", fontWeight: 900 }}>🔥 NEW PERSONAL BEST</div>
            )}
            {result.ghostDist !== null && result.ghostDist !== undefined && (
              <div style={{ marginTop: 6, color: result.dist > result.ghostDist ? "#34D399" : "#C4B5FD", fontWeight: 800 }}>
                {result.dist > result.ghostDist
                  ? `👻 You beat your ghost by ${(result.dist - result.ghostDist).toLocaleString()} m!`
                  : `👻 ${(result.ghostDist - result.dist).toLocaleString()} m behind your ghost.`}
              </div>
            )}
            <button className="action-btn" onClick={play} style={{ ...bigButton, marginTop: 18, ...(forPoints ? {} : { background: "#2A2A2A" }) }}>
              {forPoints ? "🔁 RUN IT BACK" : "🔁 PRACTICE RUN"}
            </button>

            <div style={{ textAlign: "left", marginTop: 20 }}>
              <div style={label}>🏆 THIS WEEK ON {LEVELS[result.level].name.toUpperCase()}</div>
              <RankLine rows={board} period="week" level={result.level} signedIn={Boolean(user)} onNeedAccount={onNeedAccount} />
              <BoardList rows={board} top={5} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="action-btn" onClick={() => setScreen("garage")} style={{ ...quietButton, flex: 1 }}>GARAGE</button>
              <button className="action-btn" onClick={() => openBoard("week", result.level)} style={{ ...quietButton, flex: 1 }}>FULL BOARD</button>
            </div>
          </div>
        )}

        {screen === "board" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {LEVEL_IDS.map((id) => (
                <button
                  key={id}
                  onClick={() => loadBoard(boardPeriod, id)}
                  style={{
                    ...quietButton,
                    flex: 1,
                    padding: "10px 0",
                    ...(boardLevel === id ? { border: `1px solid ${LEVELS[id].color}`, color: LEVELS[id].color } : {}),
                  }}
                >
                  {LEVELS[id].name.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["week", "THIS WEEK"],
                ["all", "ALL TIME"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => loadBoard(id, boardLevel)}
                  style={{ ...quietButton, flex: 1, padding: "10px 0", ...(boardPeriod === id ? { border: "1px solid #0080F0", color: "#3CABFD" } : {}) }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div style={{ ...muted, marginTop: 10 }}>
              Longest single run on {LEVELS[boardLevel].name} {boardPeriod === "week" ? "this week (Monday to Sunday)" : "ever"}.
            </div>
            <RankLine rows={board} period={boardPeriod} level={boardLevel} signedIn={Boolean(user)} />
            <BoardList rows={board} />
            <button className="action-btn" onClick={() => setScreen(result ? "result" : "garage")} style={{ ...quietButton, marginTop: 14 }}>
              ‹ BACK
            </button>
          </div>
        )}

        {/* Easy to reach with a thumb: leave the game for TUNR's home screen. */}
        {screen !== "play" && (
          <button
            className="action-btn"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link: "tab:discover" } }));
            }}
            style={{ ...quietButton, marginTop: 18, padding: "15px 0", fontSize: 15 }}
          >
            🏠 BACK TO HOME
          </button>
        )}
      </div>
    </div>
  );
}

// What this run earned, or why it didn't.
function ResultLine({ result, triesLimit, today }) {
  const { server, dist, goal } = result;
  const short = `${(goal - dist).toLocaleString()} m short of the goal.`;
  if (result.serverError) return result.serverError;
  if (!server) return dist >= goal ? "Goal hit! Sign in to earn points for it." : short;
  if (!server.counts) return `Practice run: no points.${dist >= goal ? " You'd have cleared it!" : ""}`;
  if (server.earned) return `⭐ +${server.earned} point${server.earned === 1 ? "" : "s"}! ${LEVELS[result.level].name} cleared for today. ${CLAIM_HINT}`;
  if (dist >= goal) return "✓ Goal hit, but points need a confirmed email. Check Settings → Account.";
  const left = triesLimit > 0 && today ? triesLimit - today.tries : null;
  if (left === 0) return `${short} No tries left today. Practice, and come back tomorrow!`;
  return `${short} ${left === null ? "Go again!" : `${left} ${left === 1 ? "try" : "tries"} left today.`}`;
}

// Where you stand: "You're #4 of 23 drivers on Hard this week."
function RankLine({ rows, period, level, signedIn, onNeedAccount }) {
  if (!rows) return <div style={{ ...muted, marginTop: 10 }}>Loading…</div>;
  const me = rows.find((r) => r.is_me);
  const drivers = rows[0]?.drivers || 0;
  const when = `on ${LEVELS[level].name} ${period === "week" ? "this week" : "all time"}`;
  let text;
  if (me) {
    const ahead = rows.filter((r) => r.score > me.score).at(-1) || null;
    text = (
      <>
        You're <b style={{ color: "#FACC15" }}>#{me.rank}</b> of {drivers} driver{drivers === 1 ? "" : "s"} {when}
        {me.rank === 1 ? ". 👑 Top of the board!" : ahead ? `. ${(ahead.score - me.score + 1).toLocaleString()} m more to pass @${ahead.username}.` : "."}
      </>
    );
  } else if (!signedIn) {
    text = (
      <>
        {drivers} driver{drivers === 1 ? "" : "s"} on the board {when}.{" "}
        {onNeedAccount && (
          <button onClick={onNeedAccount} style={{ background: "none", border: "none", color: "#38BDF8", cursor: "pointer", padding: 0, font: "inherit" }}>
            Sign in to get on it.
          </button>
        )}
      </>
    );
  } else {
    text = `${drivers} driver${drivers === 1 ? "" : "s"} on the board ${when}. Finish a run to join them.`;
  }
  return <div style={{ ...muted, color: "#DDD", marginTop: 8, marginBottom: 4 }}>{text}</div>;
}

// The board's rows. With `top`, just the leaders plus you if you're lower.
function BoardList({ rows, top = null }) {
  if (!rows) return null;
  if (rows.length === 0) return <div style={{ ...muted, marginTop: 12 }}>No runs yet. Be the first.</div>;
  let list = rows;
  if (top) {
    list = rows.filter((r, i) => i < top || r.is_me);
  }
  return list.map((r, i) => (
    <div key={r.user_id}>
      {i > 0 && r.rank > list[i - 1].rank + 1 && <div style={{ ...muted, textAlign: "center", lineHeight: 1 }}>⋮</div>}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 6px",
          borderBottom: "1px solid #1A1A1A",
          background: r.is_me ? "rgba(0, 128, 240,0.1)" : "none",
          borderRadius: 8,
        }}
      >
        <span style={{ width: 28, textAlign: "center", fontWeight: 900, color: "#A0A0A0" }}>
          {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
        </span>
        <Avatar url={r.avatar_url} name={r.username} size={34} ring={Boolean(r.profile_color)} ringColor={r.profile_color || undefined} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 900, color: r.profile_color || undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            @{r.username}
            {r.is_me ? " (you)" : ""}
          </span>
          {r.car && <span style={{ display: "block", ...muted, fontSize: 12 }}>{r.car}</span>}
        </span>
        <span style={{ fontWeight: 900, color: "#FACC15" }}>{Number(r.score).toLocaleString()} m</span>
      </div>
    </div>
  ));
}

// The running game. Registers the run with the server (which hands back
// today's course seed), plays it in fixed steps while logging your lane
// changes, then sends those for the server to replay. Your ghost, if any,
// is a replay of your best run today, driving alongside.
const FINISH_STATUS = {
  too_fast: "This run finished faster than the game allows, so it didn't count. (too_fast)",
  too_long: "This run took over 10 minutes, so it didn't count. (too_long)",
};
function Game({ look, plate, rules, difficulty, forPoints, onStarted, ghostRun, theme, place = "desert", audio, gfx = "classic", onFallback, vehicleId, signedIn, onDone, onQuit }) {
  const startNote = useRef("");
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const hudRef = useRef(null);
  const [mod3d, setMod3d] = useState(null);
  const [size] = useState(() => {
    const W = Math.min(430, window.innerWidth) - 32;
    return { W, H: Math.min(Math.round(W * 1.45), window.innerHeight - 120) };
  });
  const want3d = gfx === "3d";
  const runRef = useRef(null);
  const queue = useRef([]); // lane changes waiting for the next step
  const touch = useRef(null);
  const [countdown, setCountdown] = useState(3);
  // Guests (and runs the server wouldn't start) get a random course.
  const [seed, setSeed] = useState(signedIn ? null : 1 + Math.floor(Math.random() * 2147483645));

  useEffect(() => {
    if (signedIn) {
      startRun(vehicleId, difficulty, forPoints)
        .then((res) => {
          if (res?.status === "ok") {
            runRef.current = res.run_id;
            setSeed(res.seed);
          } else {
            startNote.current = START_COPY[res?.status] || `This run didn't count. (${res?.status || "no answer"})`;
            setSeed(1 + Math.floor(Math.random() * 2147483645));
          }
          onStarted?.(res);
        })
        .catch((e) => {
          startNote.current = e.message;
          setSeed(1 + Math.floor(Math.random() * 2147483645));
        });
    }
    // Load the 3D renderer during the countdown.
    if (want3d) {
      import("../lib/rush3d.js")
        .then(setMod3d)
        .catch((e) => onFallback?.(`3D graphics didn't load, so it's the classic look. (${e.message})`));
    }
    const timer = setInterval(
      () =>
        setCountdown((n) => {
          if (n <= 1) clearInterval(timer);
          return Math.max(0, n - 1);
        }),
      700
    );
    return () => clearInterval(timer);
  }, []);

  const ready = countdown <= 0 && seed !== null && (!want3d || mod3d);
  useEffect(() => {
    if (!ready) return;
    const { W, H } = size;
    const me = { color: look.color, body: look.body, spoiler: look.spoiler, plate };
    // The ghost only makes sense on the same course.
    const ghost = ghostRun && ghostRun.seed === seed ? newGame(seededRand(seed), rules, () => 0.5) : null;
    if (ghost) ghost.script = ghostRun.moves;
    let draw;
    let view3d = null;
    if (want3d) {
      try {
        view3d = mod3d.createRush3D(glRef.current, hudRef.current, W, H, me, ART, { theme, place, shadows: !LOW_POWER });
        draw = (g) => view3d.render(g, ghost);
      } catch (e) {
        onFallback?.(`This phone couldn't run 3D graphics, so it's the classic look. (${e.message})`);
        return;
      }
    } else {
      const c = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      c.width = W * dpr;
      c.height = H * dpr;
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      draw = (g) => drawGame(ctx, W, H, g, me, ART, ghost);
    }
    const g = newGame(seededRand(seed), rules);
    g.theme = theme;
    g.place = place;
    if (import.meta.env.DEV) window.__rush = g; // for checking replays in tests
    queue.current = [];
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    let ended = false;
    audio?.startEngine();

    const frame = (now) => {
      // Fixed steps, so the server's replay matches exactly. A long pause
      // (like switching apps) doesn't fast-forward the game.
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      const events = [];
      while (acc >= STEP && !g.over) {
        events.push(...tick(g, queue.current.splice(0)));
        if (ghost) tick(ghost);
        acc -= STEP;
      }
      if (events.includes("crash") && navigator.vibrate) navigator.vibrate(120);
      if (events.includes("boost") && navigator.vibrate) navigator.vibrate([40, 30, 40]);
      if (audio) {
        audio.engine(g.speed, g.boostT > 0);
        for (const ev of events) {
          if (ev === "crash") audio.crash();
          else if (ev === "pickup") audio.pickup();
          else if (ev === "boost") audio.boost();
          else if (ev === "pop") audio.pop();
          else if (ev === "boostEnd") audio.boostEnd();
        }
      }
      draw(g);
      if (g.over && !ended) {
        ended = true;
        audio?.stopEngine();
        const r = { dist: Math.floor(g.dist), score: scoreOf(g), pickups: g.pickups, boosts: g.boosts, crashes: g.crashes, ghostDist: ghost ? ghostRun.distance : null };
        if (!signedIn) return onDone(r);
        if (!runRef.current) return onDone({ ...r, serverError: startNote.current || "This run couldn't be saved, so it didn't count." });
        finishRun(runRef.current, g.log)
          .then((server) => {
            if (server?.status !== "ok") {
              return onDone({ ...r, serverError: FINISH_STATUS[server?.status] || `This run didn't count. (${server?.status || "no answer"})` });
            }
            // The server's replay is the official result.
            if (server.earned) pointsEarned();
            onDone({ ...r, ...(server.run ? { dist: server.run.dist, score: server.run.score } : {}), server });
          })
          .catch((e) => onDone({ ...r, serverError: e.message }));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") queue.current.push(-1);
      if (e.key === "ArrowRight" || e.key === "d") queue.current.push(1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      audio?.stopEngine();
      view3d?.dispose();
    };
  }, [ready, want3d]);

  function onPointerDown(e) {
    touch.current = { x: e.clientX, t: Date.now() };
  }
  function onPointerUp(e) {
    if (!touch.current) return;
    const dx = e.clientX - touch.current.x;
    if (Math.abs(dx) > 30) queue.current.push(dx > 0 ? 1 : -1);
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      queue.current.push(e.clientX < rect.left + rect.width / 2 ? -1 : 1);
    }
    touch.current = null;
  }

  return (
    <div style={{ marginTop: 10, position: "relative" }}>
      {!ready ? (
        <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", fontSize: countdown > 0 ? 96 : 22, fontWeight: 900, color: "#0080F0" }}>
          {countdown > 0 ? countdown : "Loading…"}
        </div>
      ) : want3d ? (
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ position: "relative", width: size.W, height: size.H, margin: "0 auto", borderRadius: 14, overflow: "hidden", touchAction: "none", userSelect: "none" }}
        >
          <canvas ref={glRef} style={{ display: "block", width: size.W, height: size.H }} />
          <canvas ref={hudRef} style={{ position: "absolute", inset: 0, width: size.W, height: size.H, pointerEvents: "none" }} />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ display: "block", borderRadius: 14, touchAction: "none", userSelect: "none", margin: "0 auto" }}
        />
      )}
      <button onClick={onQuit} style={{ ...quietButton, marginTop: 10 }}>QUIT RUN</button>
    </div>
  );
}

const chip = {
  padding: "8px 12px",
  minHeight: 36,
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 18,
  color: "#BBB",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  whiteSpace: "nowrap",
  fontFamily: "'Barlow Condensed', sans-serif",
};
const chipOn = { border: "1px solid #0080F0", color: "#3CABFD", background: "rgba(0, 128, 240,0.12)" };
