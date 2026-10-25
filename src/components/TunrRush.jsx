import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_RULES,
  BODIES,
  SPOILERS,
  GAME_COLORS,
  newGame,
  step,
  steer,
  scoreOf,
  drawGame,
  drawCar,
  startRun,
  finishRun,
  loadMyGame,
  loadGameLeaderboard,
  saveGameLook,
  loadGameSettings,
} from "../lib/rush.js";
import { loadVehicles, loadProfile } from "../lib/store.js";
import { Avatar } from "./EditProfile.jsx";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";

// The Boosted Studios badge (the boost pickup) and the full logo (shown
// while boosting). Loaded once; the game draws them when ready.
const ART = typeof Image === "undefined" ? {} : { boost: new Image(), logo: new Image() };
if (ART.boost) {
  ART.boost.src = "/game/boost.webp";
  ART.logo.src = "/game/boosted-logo.webp";
}

const BODY_LABELS = { coupe: "Coupe", sedan: "Sedan", hatch: "Hatch", suv: "SUV", truck: "Truck" };
const SPOILER_LABELS = { none: "None", lip: "Lip", wing: "Wing" };
const DEFAULT_LOOK = { color: "#FF4500", body: "coupe", spoiler: "lip" };

// TUNR Rush: a full-screen driving game in your own car. Reach the daily
// distance for points once a day (checked by the server); weekly
// leaderboard. Admins set the rules (Settings → Admin → TUNR Rush).
export default function TunrRush({ user, onClose, onToast, onNeedAccount }) {
  const [screen, setScreen] = useState("garage"); // garage | play | result | board
  const [cars, setCars] = useState([]);
  const [carId, setCarId] = useState(null);
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [plate, setPlate] = useState("TUNR");
  const [mine, setMine] = useState(null);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState(null);
  const [boardPeriod, setBoardPeriod] = useState("week");
  const saveTimer = useRef(0);
  const [error, setError] = useState("");

  const car = cars.find((c) => c.id === carId) || null;
  const carName = car ? [car.year, car.make, car.model].filter(Boolean).join(" ") : "TUNR loaner";

  useEffect(() => {
    loadGameSettings()
      .then(setRules)
      .catch((e) => console.warn(e.message));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadVehicles(user.id)
      .then((list) => {
        setCars(list);
        const first = list.find((c) => c.is_primary) || list[0];
        if (first) pick(first);
      })
      .catch((e) => setError(e.message));
    loadProfile(user.id)
      .then((p) => p?.username && setPlate(p.username))
      .catch((e) => console.warn(e.message));
    loadMyGame()
      .then(setMine)
      .catch((e) => console.warn(e.message));
  }, [user?.id]);

  function pick(c) {
    setCarId(c.id);
    setLook({ color: c.game_color || DEFAULT_LOOK.color, body: c.game_body || DEFAULT_LOOK.body, spoiler: c.game_spoiler || DEFAULT_LOOK.spoiler });
  }

  function changeLook(patch) {
    const next = { ...look, ...patch };
    setLook(next);
    if (car) {
      // The color wheel fires on every drag, so save once it settles.
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveGameLook(car.id, next).catch((e) => onToast(e.message)), 500);
      setCars((list) =>
        list.map((c) => (c.id === car.id ? { ...c, game_color: next.color, game_body: next.body, game_spoiler: next.spoiler } : c))
      );
    }
  }

  async function loadBoard(period = "week") {
    setBoardPeriod(period);
    setBoard(null);
    try {
      setBoard(await loadGameLeaderboard(period));
    } catch (e) {
      setError(e.message);
      setBoard([]);
    }
  }

  function openBoard(period = "week") {
    setScreen("board");
    loadBoard(period);
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
      <div style={{ width: "100%", maxWidth: 430, padding: "12px 16px 32px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 1 }}>
            🎮 TUNR <span style={{ color: "#FF4500" }}>RUSH</span>
          </div>
          <button onClick={onClose} aria-label="Close the game" style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 18 }}>
            ✕
          </button>
        </div>
        {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>{error}</div>}

        {screen === "garage" && (
          <>
            <div style={{ ...muted, marginTop: 6 }}>
              Dodge traffic and grab ⏱ for extra time. Grab the Boosted badge{" "}
              <img src="/game/boost.webp" alt="" style={{ width: 22, height: "auto", verticalAlign: "middle" }} /> for a{" "}
              <b style={{ color: "#38BDF8" }}>boost</b>: a few seconds flat out, smashing through anything in your way. Reach <b style={{ color: "#FACC15" }}>{rules.goal.toLocaleString()} m</b>{" "}
              for <b style={{ color: "#FACC15" }}>+{rules.dailyPoints} point{rules.dailyPoints === 1 ? "" : "s"}</b>, once a day.{" "}
              {mine?.today_done ? <span style={{ color: "#10B981" }}>✓ Today's point is in.</span> : null}
            </div>
            <CarPreview look={look} plate={plate} />
            <div style={{ textAlign: "center", fontSize: 17, fontWeight: 900 }}>{carName}</div>

            {user && cars.length > 1 && (
              <>
                <div style={{ ...label, marginTop: 12 }}>YOUR CAR</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                  {cars.map((c) => (
                    <button key={c.id} onClick={() => pick(c)} style={{ ...chip, ...(c.id === carId ? chipOn : {}) }}>
                      {[c.year, c.make, c.model].filter(Boolean).join(" ")}
                    </button>
                  ))}
                </div>
              </>
            )}
            {user && cars.length === 0 && (
              <div style={{ ...muted, fontSize: 12.5, marginTop: 10 }}>
                Add your car in your garage (Profile → Garage) to drive it here. For now you're in the TUNR loaner.
              </div>
            )}

            <div style={{ ...label, marginTop: 12 }}>COLOR · TAP + FOR ANY COLOR</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GAME_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={`Color ${c}`}
                  aria-pressed={look.color === c}
                  onClick={() => changeLook({ color: c })}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: look.color === c ? "3px solid #fff" : "1px solid #333", cursor: "pointer" }}
                />
              ))}
              <OtherColor color={look.color} onChange={(c) => changeLook({ color: c })} />
            </div>
            <div style={{ ...label, marginTop: 12 }}>BODY</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {BODIES.map((b) => (
                <button key={b} onClick={() => changeLook({ body: b })} style={{ ...chip, ...(look.body === b ? chipOn : {}) }}>
                  {BODY_LABELS[b]}
                </button>
              ))}
            </div>
            <div style={{ ...label, marginTop: 12 }}>SPOILER</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SPOILERS.map((sp) => (
                <button key={sp} onClick={() => changeLook({ spoiler: sp })} style={{ ...chip, ...(look.spoiler === sp ? chipOn : {}) }}>
                  {SPOILER_LABELS[sp]}
                </button>
              ))}
            </div>

            {rules.enabled ? (
              <button className="action-btn" onClick={() => setScreen("play")} style={{ ...bigButton, marginTop: 18, fontSize: 18, padding: "16px 0" }}>
                🏁 START
              </button>
            ) : (
              <div style={{ ...muted, marginTop: 18, textAlign: "center", color: "#FACC15" }}>
                🅿️ TUNR Rush is parked for now. Check back soon.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="action-btn" onClick={() => openBoard("week")} style={{ ...quietButton, flex: 1 }}>🏆 LEADERBOARD</button>
            </div>
            {mine && (
              <div style={{ ...muted, textAlign: "center", marginTop: 10 }}>
                Your best: {Number(mine.best).toLocaleString()} m · this week: {Number(mine.week_best).toLocaleString()} m
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
            vehicleId={user ? carId : null}
            signedIn={Boolean(user)}
            onDone={(r) => {
              setResult(r);
              setScreen("result");
              // The run is saved by now, so the board includes it.
              loadBoard("week");
              if (r.server) setMine((m) => ({ ...(m || {}), best: r.server.best, today_done: r.server.today_done }));
            }}
            onQuit={() => setScreen("garage")}
          />
        )}

        {screen === "result" && result && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            <div style={{ ...label, marginBottom: 0 }}>YOU DROVE</div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: result.dist >= rules.goal ? "#10B981" : "#F0F0F0" }}>
              {result.dist.toLocaleString()} m
            </div>
            <div style={{ ...muted, marginTop: 6 }}>
              ⏱ {result.pickups} · 🚀 {result.boosts} boost{result.boosts === 1 ? "" : "s"}
              {result.smashed ? ` (${result.smashed} smashed)` : ""} · 💥 {result.crashes} crash{result.crashes === 1 ? "" : "es"} · score{" "}
              {result.score.toLocaleString()}
            </div>
            <div style={{ marginTop: 14, fontSize: 17, fontWeight: 900, color: result.server?.earned ? "#FACC15" : "#AAA" }}>
              {result.serverError
                ? result.serverError
                : result.server?.earned
                  ? `⭐ +${result.server.earned} point${result.server.earned === 1 ? "" : "s"}! Today's daily drive is done.`
                  : result.dist >= rules.goal
                    ? result.server
                      ? "✓ Goal hit. Today's point was already in; come back tomorrow."
                      : "Goal hit! Sign in to earn points for it."
                    : `${(rules.goal - result.dist).toLocaleString()} m short of today's points. One more?`}
            </div>
            {result.server && result.dist >= (result.server.best || 0) && result.dist > 0 && (
              <div style={{ marginTop: 6, color: "#FF7A00", fontWeight: 900 }}>🔥 NEW PERSONAL BEST</div>
            )}
            <button className="action-btn" onClick={() => setScreen("play")} style={{ ...bigButton, marginTop: 18 }}>
              🔁 RUN IT BACK
            </button>

            <div style={{ textAlign: "left", marginTop: 20 }}>
              <div style={label}>🏆 THIS WEEK'S LEADERBOARD</div>
              <RankLine rows={board} period="week" signedIn={Boolean(user)} onNeedAccount={onNeedAccount} />
              <BoardList rows={board} top={5} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="action-btn" onClick={() => setScreen("garage")} style={{ ...quietButton, flex: 1 }}>GARAGE</button>
              <button className="action-btn" onClick={() => openBoard("week")} style={{ ...quietButton, flex: 1 }}>FULL BOARD</button>
            </div>
          </div>
        )}

        {screen === "board" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["week", "THIS WEEK"],
                ["all", "ALL TIME"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => openBoard(id)}
                  style={{ ...quietButton, flex: 1, padding: "10px 0", ...(boardPeriod === id ? { border: "1px solid #FF4500", color: "#FF7A00" } : {}) }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div style={{ ...muted, marginTop: 10 }}>
              Longest single run {boardPeriod === "week" ? "this week (Monday to Sunday)" : "ever"}.
            </div>
            <RankLine rows={board} period={boardPeriod} signedIn={Boolean(user)} />
            <BoardList rows={board} />
            <button className="action-btn" onClick={() => setScreen(result ? "result" : "garage")} style={{ ...quietButton, marginTop: 14 }}>
              ‹ BACK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Where you stand: "You're #4 of 23 drivers this week."
function RankLine({ rows, period, signedIn, onNeedAccount }) {
  if (!rows) return <div style={{ ...muted, marginTop: 10 }}>Loading…</div>;
  const me = rows.find((r) => r.is_me);
  const drivers = rows[0]?.drivers || 0;
  const when = period === "week" ? "this week" : "all time";
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
          background: r.is_me ? "rgba(255,69,0,0.1)" : "none",
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

// "Other": a rainbow swatch that opens the phone's color wheel.
function OtherColor({ color, onChange }) {
  const custom = !GAME_COLORS.includes(color);
  return (
    <label
      title="Any color"
      style={{
        position: "relative",
        width: 30,
        height: 30,
        borderRadius: "50%",
        cursor: "pointer",
        background: custom ? color : "conic-gradient(#ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
        border: custom ? "3px solid #fff" : "1px solid #333",
        boxShadow: custom ? "0 0 0 2px #a855f7" : "none",
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        fontWeight: 900,
        color: "#fff",
        textShadow: "0 1px 2px #000",
      }}
    >
      {custom ? "" : "+"}
      <input
        type="color"
        aria-label="Pick any color"
        value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#ff4500"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: 0, padding: 0 }}
      />
    </label>
  );
}

function CarPreview({ look, plate }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 300 * dpr;
    c.height = 170 * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, "#1A1A1A");
    g.addColorStop(1, "#0A0A0A");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 300, 170);
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 140, 300, 30);
    drawCar(ctx, 150, 156, 170, { color: look.color, body: look.body, spoiler: look.spoiler, plate, sport: true });
  }, [look.color, look.body, look.spoiler, plate]);
  return <canvas ref={ref} style={{ width: "100%", maxWidth: 300, height: "auto", aspectRatio: "300 / 170", display: "block", margin: "14px auto 6px", borderRadius: 12 }} />;
}

// The running game. Registers the run with the server, plays, and reports.
function Game({ look, plate, rules, vehicleId, signedIn, onDone, onQuit }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const runRef = useRef(null);
  const touch = useRef(null);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (signedIn) {
      startRun(vehicleId)
        .then((id) => (runRef.current = id))
        .catch((e) => console.warn(e.message));
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

  useEffect(() => {
    if (countdown > 0) return;
    const c = canvasRef.current;
    const W = Math.min(430, window.innerWidth) - 32;
    const H = Math.min(Math.round(W * 1.45), window.innerHeight - 120);
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const g = newGame(Math.random, rules);
    stateRef.current = g;
    const me = { color: look.color, body: look.body, spoiler: look.spoiler, plate };
    let last = performance.now();
    let raf = 0;
    let ended = false;

    const frame = (now) => {
      const events = step(g, (now - last) / 1000);
      last = now;
      if (events.includes("crash") && navigator.vibrate) navigator.vibrate(120);
      if (events.includes("boost") && navigator.vibrate) navigator.vibrate([40, 30, 40]);
      drawGame(ctx, W, H, g, me, ART);
      if (g.over && !ended) {
        ended = true;
        const r = { dist: Math.floor(g.dist), score: scoreOf(g), pickups: g.pickups, boosts: g.boosts, smashed: g.smashed, crashes: g.crashes };
        if (!signedIn || !runRef.current) return onDone(r);
        finishRun(runRef.current, g)
          .then((server) => onDone({ ...r, server: server?.status === "ok" ? server : null, serverError: server && server.status !== "ok" ? `Run not counted (${server.status}).` : "" }))
          .catch((e) => onDone({ ...r, serverError: e.message }));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "a") steer(g, -1);
      if (e.key === "ArrowRight" || e.key === "d") steer(g, 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [countdown <= 0]);

  function onPointerDown(e) {
    touch.current = { x: e.clientX, t: Date.now() };
  }
  function onPointerUp(e) {
    const g = stateRef.current;
    if (!g || !touch.current) return;
    const dx = e.clientX - touch.current.x;
    if (Math.abs(dx) > 30) steer(g, dx > 0 ? 1 : -1);
    else {
      const rect = e.currentTarget.getBoundingClientRect();
      steer(g, e.clientX < rect.left + rect.width / 2 ? -1 : 1);
    }
    touch.current = null;
  }

  return (
    <div style={{ marginTop: 10, position: "relative" }}>
      {countdown > 0 ? (
        <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96, fontWeight: 900, color: "#FF4500" }}>
          {countdown}
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
const chipOn = { border: "1px solid #FF4500", color: "#FF7A00", background: "rgba(255,69,0,0.12)" };
