import { useEffect, useState } from "react";
import { setupSteps, platformOf, homeScreenSteps, SETUP_KEY, MOTION_KEY, LATER } from "../lib/setupSteps.js";
import { pushSupport, deviceSubscribed, enablePush, isStandalone } from "../lib/alerts.js";
import { loadPitStop } from "../lib/pitStop.js";
import { PitStopCard } from "./PitStop.jsx";

// First-run setup, one thing per screen (like a language app's): location,
// the home screen, alerts, motion, then the Daily Pit Stop. Each has a big
// button and NOT NOW; anything skipped can be turned on later from Profile →
// ⚙️ Settings → Setup & permissions (which opens this with every screen).
// Which screens a phone gets: setupSteps.js. Always dark.

// Chrome on Android offers "Install app" once; keep the offer for our button.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__tunrInstall = e;
  });
}

const SCREENS = {
  location: {
    art: "📍",
    title: "Find meets near you",
    points: ["See how far every meet is, and the closest first", "Check in at meets to earn points", "Drive in convoys and save where you parked"],
    button: "TURN ON LOCATION",
  },
  homescreen: {
    art: "📲",
    title: "Put TUNR on your home screen",
    points: ["Opens like an app, full screen, in one tap", "On iPhone, alerts only work from the home screen", "Home screen widgets (your next meet, your streak) come with the App Store app"],
  },
  alerts: {
    art: "🔔",
    title: "Don't miss a meet",
    points: ["A heads-up before meets you're going to", "Linkups starting near you, and friends' invites", "Weather alerts and your reward news"],
    button: "TURN ON ALERTS",
  },
  motion: {
    art: "🧭",
    title: "Motion & compass",
    points: ["Your arrow on the convoy map points the way you're facing, even stopped at a light", "Only used while you're in a convoy"],
    button: "ALLOW MOTION",
  },
  pitstop: { art: "🏁" },
};

export default function SetupTour({ all = false, onDone, onToast }) {
  const [steps, setSteps] = useState(null);
  const [i, setI] = useState(0);
  const [pit, setPit] = useState(null);
  const [state, setState] = useState({}); // step → "on" | "busy" | message
  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints, navigator.platform);
  const canInstall = Boolean(window.__tunrInstall);

  useEffect(() => {
    let alive = true;
    (async () => {
      let geo = "geolocation" in navigator ? "prompt" : "unsupported";
      try {
        if (geo !== "unsupported" && navigator.permissions?.query) geo = (await navigator.permissions.query({ name: "geolocation" })).state;
      } catch (e) {
        console.warn(`Couldn't check location permission. (${e.message})`);
      }
      const push = pushSupport();
      const pushOn = push === "ready" ? await deviceSubscribed() : false;
      let motionOn = false;
      try {
        motionOn = localStorage.getItem(MOTION_KEY) === "granted";
      } catch (e) {
        console.warn(e.message);
      }
      const status = await loadPitStop().catch((e) => (console.warn(e.message), null));
      if (!alive) return;
      setPit(status);
      const list = setupSteps({
        platform,
        standalone: isStandalone(),
        geo,
        push,
        pushOn,
        motionAsk: typeof window.DeviceOrientationEvent?.requestPermission === "function",
        motionOn,
        pitStopOn: Boolean(status?.on),
        all,
      });
      setState({ location: geo === "granted" ? "on" : undefined, alerts: pushOn ? "on" : undefined, motion: motionOn ? "on" : undefined, homescreen: isStandalone() ? "on" : undefined });
      if (!list.length) finish();
      else setSteps(list);
    })();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    try {
      localStorage.setItem(SETUP_KEY, "1");
    } catch (e) {
      console.warn(e.message);
    }
    onDone();
  }
  const next = () => (i + 1 >= steps.length ? finish() : setI(i + 1));
  const mark = (step, value) => setState((s) => ({ ...s, [step]: value }));
  const onThenNext = (step) => {
    mark(step, "on");
    setTimeout(next, 700);
  };

  async function act(step) {
    mark(step, "busy");
    try {
      if (step === "location") {
        await new Promise((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 15000, maximumAge: 60000 }));
        onThenNext(step);
      } else if (step === "alerts") {
        await enablePush();
        onThenNext(step);
      } else if (step === "motion") {
        const r = await window.DeviceOrientationEvent.requestPermission();
        if (r !== "granted") throw new Error("Motion wasn't allowed. You can allow it later in your phone's Safari settings.");
        localStorage.setItem(MOTION_KEY, "granted");
        onThenNext(step);
      } else if (step === "homescreen") {
        const prompt = window.__tunrInstall;
        if (!prompt) return next();
        await prompt.prompt();
        const choice = await prompt.userChoice;
        window.__tunrInstall = null;
        if (choice?.outcome === "accepted") onThenNext(step);
        else mark(step, undefined);
      }
    } catch (e) {
      const why =
        e.code === 1 && step === "location"
          ? "Location is blocked for TUNR. Turn it on in your phone's Settings (Privacy → Location Services → your browser), then try again."
          : e.message;
      mark(step, why);
    }
  }

  if (!steps) return <div style={{ position: "fixed", inset: 0, zIndex: 495, background: "#0B0D10" }} />;
  const step = steps[i];
  const s = SCREENS[step];
  const st = state[step];
  const iosAlertsNeedHome = step === "alerts" && pushSupport() === "ios_home_screen";

  return (
    <div role="dialog" aria-label="Set up TUNR" style={{ position: "fixed", inset: 0, zIndex: 495, background: "radial-gradient(circle at 50% 20%, #13233D, #0B0D10 65%)", color: "#F0F0F0", display: "flex", flexDirection: "column", fontFamily: "'Barlow Condensed', sans-serif" }}>
      {/* Progress, like a lesson bar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + env(safe-area-inset-top)) 18px 0" }}>
        <button onClick={finish} aria-label="Close setup" style={{ background: "none", border: "none", color: "#8A94A3", fontSize: 22, cursor: "pointer", padding: 4 }}>
          ✕
        </button>
        <div style={{ flex: 1, height: 12, borderRadius: 6, background: "#1F242C", overflow: "hidden" }}>
          <div style={{ width: `${((i + 1) / steps.length) * 100}%`, height: "100%", borderRadius: 6, background: "linear-gradient(90deg, #0080F0, #3CABFD)", transition: "width 0.35s ease" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 900, color: "#8A94A3" }}>
          {i + 1}/{steps.length}
        </span>
      </div>

      <div key={step} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 26px", animation: "fadeIn 0.3s ease" }}>
        {step === "pitstop" ? (
          <>
            <PitStopCard status={pit} onError={onToast} />
            <div style={{ fontSize: 14, color: "#9AA4B2", fontFamily: "'Barlow', sans-serif", textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              Points come from checking in at meets, the weekly spin, games and more. Trade them for merch in Perks.
            </div>
          </>
        ) : (
          <>
            <div aria-hidden="true" style={{ width: 132, height: 132, margin: "0 auto", borderRadius: "50%", background: "rgba(0,128,240,0.14)", border: "2px solid rgba(60,171,253,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 66 }}>
              {st === "on" ? "✅" : s.art}
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05, textAlign: "center", marginTop: 22 }}>{s.title.toUpperCase()}</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "18px auto 0", maxWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}>
              {s.points.map((p) => (
                <li key={p} style={{ display: "flex", gap: 10, fontSize: 16, color: "#C9D1DC", fontFamily: "'Barlow', sans-serif", lineHeight: 1.35 }}>
                  <span style={{ color: "#3CABFD", fontWeight: 900 }}>✓</span>
                  {p}
                </li>
              ))}
            </ul>
            {step === "homescreen" && !(platform !== "ios" && canInstall) && st !== "on" && (
              <ol style={{ margin: "18px auto 0", maxWidth: 360, paddingLeft: 22, color: "#F0F0F0", fontFamily: "'Barlow', sans-serif", fontSize: 15, lineHeight: 1.5, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "12px 14px 12px 34px" }}>
                {homeScreenSteps(platform, canInstall).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            )}
            {iosAlertsNeedHome && (
              <div style={{ margin: "16px auto 0", maxWidth: 360, fontSize: 14.5, color: "#FACC15", fontFamily: "'Barlow', sans-serif", textAlign: "center", lineHeight: 1.45 }}>
                On iPhone, put TUNR on your home screen first (the screen before), open it from there, and turn alerts on in Profile → 🔔 Alerts.
              </div>
            )}
            {st && st !== "on" && st !== "busy" && (
              <div role="alert" style={{ margin: "14px auto 0", maxWidth: 360, fontSize: 14, color: "#FCA5A5", fontFamily: "'Barlow', sans-serif", textAlign: "center" }}>
                {st}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: "10px 22px calc(18px + env(safe-area-inset-bottom))" }}>
        {step === "pitstop" ? (
          <BigButton onClick={finish}>LET'S RIDE</BigButton>
        ) : st === "on" ? (
          <BigButton onClick={next} green>
            ✓ {step === "homescreen" ? "ON YOUR HOME SCREEN" : "TURNED ON"} · NEXT
          </BigButton>
        ) : step === "homescreen" ? (
          platform !== "ios" && canInstall ? <BigButton onClick={() => act("homescreen")}>ADD TO HOME SCREEN</BigButton> : <BigButton onClick={next}>DONE</BigButton>
        ) : iosAlertsNeedHome ? (
          <BigButton onClick={next}>GOT IT</BigButton>
        ) : (
          <BigButton onClick={() => act(step)} disabled={st === "busy"}>
            {st === "busy" ? "…" : s.button}
          </BigButton>
        )}
        {step !== "pitstop" && st !== "on" && (
          <>
            <button onClick={next} style={{ width: "100%", marginTop: 8, padding: "12px 0", background: "none", border: "none", color: "#8A94A3", fontSize: 16, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit" }}>
              NOT NOW
            </button>
            <div style={{ fontSize: 12, color: "#5E6773", textAlign: "center", fontFamily: "'Barlow', sans-serif" }}>{LATER}</div>
          </>
        )}
      </div>
    </div>
  );
}

function BigButton({ children, onClick, disabled = false, green = false }) {
  return (
    <button
      className="action-btn"
      onClick={onClick}
      disabled={disabled}
      style={{ width: "100%", padding: "16px 0", borderRadius: 14, border: "none", background: green ? "#10B981" : "#0080F0", color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", boxShadow: `0 5px 0 ${green ? "#047857" : "#0057A8"}` }}
    >
      {children}
    </button>
  );
}
