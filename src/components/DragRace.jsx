import { useEffect, useRef, useState } from "react";
import { newRace, tick, tap, nitro, treeLights, remoteSample, remoteDone, myReport, RIVALS, WHY, REDLINE, SHIFT_ZONE, GOOD_ZONE, RATIOS, QUARTER, reactionWord, loadDragProgress, saveDragResult } from "../lib/dragEngine.js";
import { RushAudio } from "../lib/rushAudio.js";
import TrackButton from "./TrackButton.jsx";
import { lookOf, DEFAULT_LOOK } from "../lib/rushEngine.js";
import { muted, bigButton, quietButton } from "./Sheet.jsx";
import { GarageRow, useGarageCar } from "./Showroom.jsx";
import DragFriend from "./DragFriend.jsx";
import { REPORT_MS } from "../lib/remoteMotion.js";
import { sharedGame } from "../lib/gameRooms.js";

// Drag Race: a quarter mile against five rivals in turn. Launch on the
// green, shift in the green, one shot of nitro. Free play; your times and
// how far up the ladder you are stay on this phone.

const fmt = (n, d = 3) => (n == null ? "—" : n.toFixed(d));

export default function DragRace({ onClose, user = null, onNeedAccount }) {
  const garage = useGarageCar(user, "drag");
  const look = garage.car ? lookOf(garage.car) : { ...DEFAULT_LOOK, spoiler: "wing" };
  const [progress, setProgress] = useState(loadDragProgress);
  const [rival, setRival] = useState(() => Math.min(loadDragProgress().beaten, RIVALS.length - 1));
  const [racing, setRacing] = useState(false);
  // Racing a friend; opens straight there from a shared room link.
  const [friend, setFriend] = useState(() => {
    try {
      return sharedGame() === "drag";
    } catch (e) {
      console.warn("Couldn't read the shared race code:", e.message);
      return false;
    }
  });
  const [round, setRound] = useState(0);
  const [result, setResult] = useState(null);
  const [sound, setSound] = useState({ music: true, sfx: true });
  const audio = useRef(null);

  useEffect(() => {
    audio.current = new RushAudio({ game: "drag" });
    setSound(audio.current.prefs);
    return () => audio.current?.dispose();
  }, []);

  useEffect(() => {
    if (racing || friend) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [racing, friend, onClose]);

  function start(i = rival) {
    setRival(i);
    setResult(null);
    setRacing(true);
    setRound((r) => r + 1);
    if (audio.current?.unlock() && audio.current.prefs.music) audio.current.startMusic();
  }

  function toggle(kind) {
    const a = audio.current;
    if (!a) return;
    const on = !sound[kind];
    if (kind === "music") {
      a.setMusic(on);
      if (on && a.unlock()) a.startMusic();
    } else a.setSfx(on);
    setSound((s) => ({ ...s, [kind]: on }));
  }

  const iconBtn = { ...quietButton, width: 44, height: 44, padding: 0, fontSize: 17 };
  const nextRival = result?.won && rival < RIVALS.length - 1 ? rival + 1 : null;

  return (
    <div role="dialog" aria-label="Drag Race" style={{ position: "fixed", inset: 0, zIndex: 410, background: "#0A0A0A", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {friend ? (
        <>
          <div style={{ height: "calc(8px + env(safe-area-inset-top))" }} />
          <DragFriend user={user} look={look} audio={audio} onExit={() => setFriend(false)} onNeedAccount={onNeedAccount} />
        </>
      ) : racing ? (
        <DragRun
          key={round}
          look={look}
          rivalIndex={rival}
          audio={audio}
          onDone={(r) => {
            setProgress(saveDragResult(rival, r));
            setResult(r);
            setRacing(false);
            audio.current?.stopEngine();
          }}
          onQuit={() => {
            setRacing(false);
            audio.current?.stopEngine();
          }}
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "calc(8px + env(safe-area-inset-top)) 12px 8px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ flex: 1, fontSize: 25, fontWeight: 900, letterSpacing: 1 }}>
              🚦 DRAG <span style={{ color: "#0080F0" }}>RACE</span>
            </div>
            <button onClick={() => toggle("music")} aria-label={sound.music ? "Turn music off" : "Turn music on"} style={{ ...iconBtn, opacity: sound.music ? 1 : 0.4 }}>
              🎵
            </button>
            <TrackButton audio={audio} style={iconBtn} />
            <button onClick={() => toggle("sfx")} aria-label={sound.sfx ? "Turn sound effects off" : "Turn sound effects on"} style={iconBtn}>
              {sound.sfx ? "🔊" : "🔇"}
            </button>
            <button onClick={onClose} aria-label="Close the game" style={{ ...iconBtn, fontSize: 18 }}>
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
              {result ? (
                <ResultCard result={result} rival={RIVALS[rival]} />
              ) : (
                <div style={{ ...muted, fontSize: 13.5 }}>
                  A quarter mile, side by side. Watch the tree: three ambers, then <strong style={{ color: "#4ADE80" }}>green</strong>. Tap <strong>LAUNCH</strong> on the green (too early is a red light), then <strong>SHIFT</strong> each time the needle's in the green. One shot of <strong style={{ color: "#60A5FA" }}>NITRO</strong>. Beat each rival to unlock the next.
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: "#7D8796", margin: "18px 2px 8px" }}>THE LADDER</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {RIVALS.map((r, i) => {
                  const locked = i > progress.beaten;
                  const beaten = i < progress.beaten;
                  const picked = i === rival;
                  return (
                    <button
                      key={r.id}
                      disabled={locked}
                      onClick={() => setRival(i)}
                      aria-pressed={picked}
                      aria-label={`${r.name}${locked ? ", locked" : beaten ? ", beaten" : ""}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${picked ? "#0080F0" : "#232833"}`, background: picked ? "rgba(0,128,240,0.12)" : "#13161c", color: "#F0F0F0", cursor: locked ? "default" : "pointer", opacity: locked ? 0.45 : 1, textAlign: "left", fontFamily: "'Barlow Condensed', sans-serif" }}
                    >
                      <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#111", flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>{r.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: "#8A94A3", fontFamily: "'Barlow', sans-serif" }}>{r.tag}</span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: beaten ? "#4ADE80" : locked ? "#6B7280" : "#FACC15" }}>{beaten ? "✓ BEATEN" : locked ? "🔒" : "NEXT UP"}</span>
                    </button>
                  );
                })}
              </div>

              <GarageRow user={user} garage={garage} game="Drag Race" first={{ icon: "🚦", name: "TUNR drag car", sub: "The blue one", look }} hint="Add your car in Profile → Garage to race it here. Underglow and decals show up too." />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
                {[
                  ["BEST ET", progress.bestEt ? `${fmt(progress.bestEt)}s` : "—"],
                  ["TOP SPEED", progress.bestTrap ? `${fmt(progress.bestTrap, 1)} mph` : "—"],
                  ["BEST LIGHT", progress.bestRt != null ? `${fmt(progress.bestRt)}s` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "#13161c", border: "1px solid #232833", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "#8A94A3" }}>{k}</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#FACC15" }}>{v}</div>
                  </div>
                ))}
              </div>

              <button className="action-btn" onClick={() => start(nextRival ?? rival)} style={{ ...bigButton, marginTop: 14, background: "#FACC15", color: "#111", fontSize: 20, letterSpacing: 2 }}>
                {nextRival != null ? `▶ NEXT: ${RIVALS[nextRival].name.toUpperCase()}` : result ? "▶ RACE AGAIN" : `▶ RACE ${RIVALS[rival].name.toUpperCase()}`}
              </button>
              <button className="action-btn" onClick={() => setFriend(true)} style={{ ...bigButton, marginTop: 10, background: "linear-gradient(135deg, #DB2777, #7C3AED)", color: "#fff", fontSize: 18, letterSpacing: 2 }}>
                👥 RACE A FRIEND · LIVE
              </button>
              {progress.beaten >= RIVALS.length && <div style={{ ...muted, textAlign: "center", marginTop: 8, color: "#FACC15" }}>🏆 You beat the whole ladder. Now chase a quicker ET.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ResultCard({ result, rival }) {
  const rows = [
    ["REACTION", result.reaction != null ? `${fmt(result.reaction)}s` : "—", reactionWord(result.reaction)],
    ["60 FT", result.sixty ? `${fmt(result.sixty)}s` : "—"],
    ["ET (1/4 MILE)", result.et ? `${fmt(result.et)}s` : "—", result.rivalEt ? `${rival.name}: ${fmt(result.rivalEt)}s` : ""],
    ["TRAP SPEED", result.trapMph ? `${fmt(result.trapMph, 1)} mph` : "—"],
    ["SHIFTS", `${result.perfect}/${RATIOS.length - 1} perfect`],
  ];
  return (
    <div style={{ padding: 14, borderRadius: 14, background: result.won ? "linear-gradient(135deg, rgba(34,197,94,0.18), #15181e)" : "#15181e", border: `1px solid ${result.won ? "#16A34A" : "#2A2E36"}` }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, color: result.won ? "#4ADE80" : "#F87171" }}>{result.won ? "🏁 WIN" : result.why === "red" ? "🔴 RED LIGHT" : "LOSS"}</div>
        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05 }}>{result.won ? `You beat ${rival.name}` : result.why === "lost" ? `Lost to ${rival.name}` : WHY[result.why]}</div>
        {result.margin != null && <div style={{ ...muted, marginTop: 2 }}>{result.won ? "by" : "lost by"} {fmt(result.margin)}s</div>}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(([k, v, note]) => (
          <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 15 }}>
            <span style={{ width: 110, color: "#8A94A3", fontWeight: 800, fontSize: 12.5, letterSpacing: 1 }}>{k}</span>
            <span style={{ fontWeight: 900 }}>{v}</span>
            {note && <span style={{ ...muted, fontSize: 12 }}>{note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// One race. `remote` (racing a friend): { seed, round, opponent: { name,
// look }, room, hooks }: the other car comes from the room, and this phone
// reports its own as it goes.
export function DragRun({ look, rivalIndex = 0, audio, onDone, onQuit, remote = null }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const raceRef = useRef(null);
  const hud = useRef({});
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const live = useRef({ paused: false });
  live.current.paused = paused;
  const done = useRef(onDone);
  done.current = onDone;
  const [flash, setFlash] = useState(null);
  const [mode, setMode] = useState("LAUNCH");
  const [nitroLeft, setNitroLeft] = useState(true);

  useEffect(() => {
    const race = remote ? newRace(0, remote.seed, { remote: true }) : newRace(rivalIndex, (Date.now() % 100000) + 7);
    raceRef.current = race;
    if (import.meta.env.DEV) window.__drag = race;
    const r = RIVALS[rivalIndex];
    let lastSent = 0;
    let sentDone = false;
    if (remote) {
      const mine = (p) => p?.round === remote.round;
      remote.hooks.current = {
        pos: (p) => mine(p) && remoteSample(race, p),
        done: (p) => mine(p) && remoteDone(race, p.report),
        bye: () => remoteDone(race, { out: "left" }),
      };
    }
    const report = (fn) => Promise.resolve(fn()).catch((e) => console.warn("Couldn't reach the other phone:", e.message));
    let view;
    let raf = 0;
    let last = 0;
    let reported = false;
    let lastAmbers = 0;
    let disposed = false;
    import("../lib/dragRender3d.js")
      .then((m) => {
        if (disposed) return;
        const rival = remote
          ? { look: remote.opponent.look, plate: String(remote.opponent.name || "").toUpperCase().slice(0, 7) }
          : { color: r.color, body: r.body, plate: r.name.split(" ")[0].toUpperCase().slice(0, 7) };
        view = m.createDrag3D(canvas.current, { me: { ...look, plate: "TUNR" }, rival });
        raf = requestAnimationFrame(frame);
      })
      .catch((e) => setError(`Couldn't start the 3D strip. (${e.message})`));
    const a = audio.current;
    a?.startEngine();

    const say = (text, color) => {
      setFlash({ text, color, at: Date.now() });
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      const el = wrap.current;
      if (!el || !view) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.dataset.w !== `${w}x${h}`) {
        el.dataset.w = `${w}x${h}`;
        view.resize(w, h);
      }
      // Against a friend the clock never stops (the other phone's doesn't).
      if (!live.current.paused || remote) tick(race, dt);
      if (remote) {
        const me = race.me;
        if (now - lastSent > REPORT_MS && race.phase !== "done" && me.finishAt == null) {
          lastSent = now;
          report(() => remote.room.send("pos", { round: remote.round, t: race.t, x: me.x, v: me.v, nitro: me.nitroOn }));
        }
        if (!sentDone && (me.finishAt != null || race.phase === "done")) {
          sentDone = true;
          report(() => remote.room.send("done", { round: remote.round, report: race.phase === "done" ? myReport(race) : { finishAt: me.finishAt, launchedAt: me.launchedAt, trap: me.trap } }));
        }
      }
      for (const ev of race.events.splice(0)) {
        if (ev.type === "red") {
          say("RED LIGHT", "#F87171");
          a?.crash();
        }
        if (ev.type === "launch") {
          say(reactionWord(ev.reaction).toUpperCase(), ev.reaction < 0.2 ? "#4ADE80" : "#FACC15");
          setMode("SHIFT");
          a?.pop();
        }
        if (ev.type === "shift" && ev.who === "me") {
          say(ev.quality === "perfect" ? "PERFECT SHIFT" : ev.quality === "good" ? "GOOD SHIFT" : ev.quality === "late" ? "LATE SHIFT" : "EARLY SHIFT", ev.quality === "perfect" ? "#4ADE80" : ev.quality === "good" ? "#FACC15" : "#F87171");
          a?.pop();
          if (ev.gear >= RATIOS.length) setMode("FLAT OUT");
        }
        if (ev.type === "nitro" && ev.who === "me") {
          setNitroLeft(false);
          a?.boost();
        }
      }
      const L = treeLights(race);
      if (L.ambers > lastAmbers) {
        lastAmbers = L.ambers;
        a?.beep();
      }
      view.update(race, dt);
      const me = race.me;
      a?.engine(me.rpm / 30, me.nitroOn);
      // The HUD, straight to the DOM (no re-render per frame).
      const H = hud.current;
      if (H.needle) H.needle.style.width = `${Math.min(100, (me.rpm / (REDLINE + 150)) * 100)}%`;
      if (H.needle) H.needle.style.background = me.rpm >= SHIFT_ZONE[0] && me.rpm <= SHIFT_ZONE[1] ? "#4ADE80" : me.rpm > SHIFT_ZONE[1] ? "#F87171" : "#F0F0F0";
      if (H.gear) H.gear.textContent = me.launchedAt == null ? "N" : String(me.gear + 1);
      if (H.speed) H.speed.textContent = String(Math.round(me.v * 2.23694));
      if (H.gap) {
        const gap = me.x - race.them.x;
        H.gap.textContent = me.launchedAt == null ? "" : `${gap >= 0 ? "▲" : "▼"} ${Math.abs(gap).toFixed(1)} m`;
        H.gap.style.color = gap >= 0 ? "#4ADE80" : "#F87171";
      }
      if (H.bar) H.bar.style.width = `${Math.min(100, (me.x / QUARTER) * 100)}%`;
      if (H.bar2) H.bar2.style.width = `${Math.min(100, (race.them.x / QUARTER) * 100)}%`;
      if (H.lights) {
        const nodes = H.lights.children;
        for (let i = 0; i < 3; i++) nodes[i].style.background = L.ambers > i && !L.green && !L.red ? "#F59E0B" : "#2a2a2a";
        nodes[3].style.background = L.green && race.t < 4.5 ? "#22C55E" : "#2a2a2a";
        nodes[4].style.background = L.red ? "#EF4444" : "#2a2a2a";
      }
      if (race.phase === "done" && !reported) {
        reported = true;
        setTimeout(() => done.current(race.result), race.result.why === "red" ? 1200 : 1800);
      }
    };

    const onKey = (e) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        if (!live.current.paused) tap(race);
      }
      if (e.key === "n" || e.key === "Shift") nitro(race);
      if (e.key === "Escape" || e.key === "p") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      if (remote) remote.hooks.current = {};
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      view?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [flash]);

  const press = (fn) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      if (!paused && raceRef.current) fn(raceRef.current);
    },
    onContextMenu: (e) => e.preventDefault(),
  });
  const pedal = { position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", borderRadius: 22, color: "#fff", fontWeight: 900, letterSpacing: 1.5, fontFamily: "'Barlow Condensed', sans-serif", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", zIndex: 2, boxShadow: "0 6px 18px rgba(0,0,0,0.4)" };
  const zoneL = (SHIFT_ZONE[0] / (REDLINE + 150)) * 100;
  const zoneW = ((SHIFT_ZONE[1] - SHIFT_ZONE[0]) / (REDLINE + 150)) * 100;
  const goodL = (GOOD_ZONE[0] / (REDLINE + 150)) * 100;
  const goodW = ((GOOD_ZONE[1] - GOOD_ZONE[0]) / (REDLINE + 150)) * 100;

  return (
    <div ref={wrap} style={{ position: "relative", flex: 1, overflow: "hidden", background: "#070a14", touchAction: "none" }}>
      <canvas ref={canvas} aria-label="Drag Race: the strip" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {error && (
        <div role="alert" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "#FCA5A5", zIndex: 5 }}>
          {error}
        </div>
      )}
      {/* Top: the tree, the race progress, pause. */}
      <div style={{ position: "absolute", top: "calc(10px + env(safe-area-inset-top))", left: 12, right: 12, display: "flex", alignItems: "center", gap: 10, zIndex: 2 }}>
        <div ref={(el) => (hud.current.lights = el)} aria-label="Start lights" style={{ display: "flex", gap: 5, background: "rgba(0,0,0,0.55)", borderRadius: 12, padding: "8px 10px" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: "#2a2a2a", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)" }} />
          ))}
        </div>
        <div style={{ flex: 1, background: "rgba(0,0,0,0.55)", borderRadius: 12, padding: "7px 10px" }}>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
            <div ref={(el) => (hud.current.bar = el)} style={{ height: "100%", width: 0, background: "#0080F0" }} />
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden", marginTop: 4 }}>
            <div ref={(el) => (hud.current.bar2 = el)} style={{ height: "100%", width: 0, background: remote ? "#F472B6" : RIVALS[rivalIndex].color }} />
          </div>
        </div>
        <button onClick={() => setPaused(true)} aria-label="Pause" style={{ ...quietButton, width: 44, height: 44, padding: 0, fontSize: 16, background: "rgba(0,0,0,0.5)" }}>
          ❚❚
        </button>
      </div>

      {flash && (
        <div key={flash.at} aria-live="polite" style={{ position: "absolute", top: "26%", left: 0, right: 0, textAlign: "center", fontSize: 34, fontWeight: 900, letterSpacing: 2, color: flash.color, textShadow: "0 3px 14px rgba(0,0,0,0.8)", zIndex: 3, pointerEvents: "none", animation: "dragPop 0.9s ease forwards" }}>
          {flash.text}
        </div>
      )}
      <style>{"@keyframes dragPop { 0% { transform: scale(0.7); opacity: 0 } 15% { transform: scale(1.08); opacity: 1 } 70% { opacity: 1 } 100% { transform: translateY(-16px); opacity: 0 } }"}</style>

      {/* Bottom: tach, gear, speed. */}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "calc(130px + env(safe-area-inset-bottom))", width: "min(420px, calc(100% - 24px))", background: "rgba(0,0,0,0.6)", borderRadius: 14, padding: "8px 12px", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#8A94A3", letterSpacing: 1 }}>GEAR</span>
          <span ref={(el) => (hud.current.gear = el)} style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, width: 22 }}>
            N
          </span>
          <span ref={(el) => (hud.current.speed = el)} style={{ fontSize: 30, fontWeight: 900, lineHeight: 1, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            0
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#8A94A3" }}>MPH</span>
          <span ref={(el) => (hud.current.gap = el)} style={{ fontSize: 14, fontWeight: 900, width: 70, textAlign: "right" }} />
        </div>
        <div aria-label="Tachometer" style={{ position: "relative", height: 14, borderRadius: 7, background: "rgba(255,255,255,0.1)", overflow: "hidden", marginTop: 6 }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${goodL}%`, width: `${goodW}%`, background: "rgba(250,204,21,0.3)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${zoneL}%`, width: `${zoneW}%`, background: "rgba(74,222,128,0.45)" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(REDLINE / (REDLINE + 150)) * 100}%`, right: 0, background: "rgba(248,113,113,0.6)" }} />
          <div ref={(el) => (hud.current.needle = el)} style={{ position: "absolute", top: 3, bottom: 3, left: 0, width: 0, borderRadius: 4, background: "#F0F0F0" }} />
        </div>
      </div>

      <button aria-label="Nitro" disabled={!nitroLeft || mode === "LAUNCH"} {...press(nitro)} style={{ ...pedal, left: "calc(16px + env(safe-area-inset-left))", width: 96, height: 96, fontSize: 17, border: "2px solid rgba(255,255,255,0.45)", background: nitroLeft && mode !== "LAUNCH" ? "rgba(37,99,235,0.92)" : "rgba(55,65,81,0.6)", opacity: nitroLeft ? 1 : 0.5 }}>
        NITRO
        <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>{nitroLeft ? "1 SHOT" : "USED"}</span>
      </button>
      <button aria-label={mode === "LAUNCH" ? "Launch" : "Shift"} disabled={mode === "FLAT OUT"} {...press(tap)} style={{ ...pedal, right: "calc(16px + env(safe-area-inset-right))", width: 150, height: 96, fontSize: 24, border: "2px solid rgba(255,255,255,0.5)", background: mode === "LAUNCH" ? "rgba(22,163,74,0.92)" : mode === "SHIFT" ? "rgba(234,179,8,0.95)" : "rgba(55,65,81,0.6)", color: mode === "SHIFT" ? "#111" : "#fff" }}>
        {mode}
        {mode === "LAUNCH" && <span style={{ display: "block", fontSize: 11, opacity: 0.85 }}>ON THE GREEN</span>}
      </button>

      {paused && (
        <div style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 300, background: "#0D1226", border: "1px solid #1E2A4A", borderRadius: 16, padding: 20, textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>PAUSED</div>
            <button className="action-btn" onClick={() => setPaused(false)} style={{ ...bigButton, background: "#FACC15", color: "#111" }}>
              ▶ RESUME
            </button>
            <button className="action-btn" onClick={onQuit} style={{ ...quietButton, padding: "11px 0" }}>
              QUIT TO MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
