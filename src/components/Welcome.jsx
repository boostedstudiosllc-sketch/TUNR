import { useEffect, useRef, useState } from "react";
import AuthForm from "./AuthForm.jsx";
import TermsOfService from "./TermsOfService.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import { googleEnabled, signInWithGoogle } from "../lib/store.js";
import { drawCar } from "../lib/rushEngine.js";

// The first thing someone new sees: what TUNR is, and how to come in —
// Google, email (sign up or log in), or as a guest. A new account reads and
// agrees to the terms on the next screen; a guest agrees with the line by
// the guest button.
export default function Welcome({ onGuest }) {
  const [panel, setPanel] = useState(null); // null | "signup" | "login"
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    let alive = true;
    googleEnabled().then((on) => alive && setGoogle(on));
    return () => {
      alive = false;
    };
  }, []);

  async function withGoogle() {
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e.message);
    }
  }

  const btn = {
    width: "100%",
    padding: "15px 0",
    borderRadius: 12,
    border: "none",
    fontSize: 15.5,
    fontWeight: 900,
    letterSpacing: 1.2,
    cursor: "pointer",
    fontFamily: "'Barlow Condensed', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  };
  const link = { background: "none", border: "none", padding: 0, color: "#9AA4B2", textDecoration: "underline", cursor: "pointer", fontSize: "inherit", fontFamily: "'Barlow', sans-serif" };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(120% 70% at 50% 0%, #0b2a52 0%, #06101f 45%, #050608 100%)",
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 430, margin: "0 auto", padding: "calc(28px + env(safe-area-inset-top)) 22px calc(22px + env(safe-area-inset-bottom))", boxSizing: "border-box", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2, lineHeight: 0.9, textShadow: "0 0 40px rgba(0,128,240,0.45)" }}>
            TUN<span style={{ color: "#0080F0" }}>R</span>
          </div>
          <div style={{ fontSize: 13, letterSpacing: 5, color: "#7FBFF5", marginTop: 8, fontWeight: 800 }}>GEORGIA'S CAR SCENE</div>
          <div style={{ fontSize: 15, color: "#B9C2CF", marginTop: 10, fontFamily: "'Barlow', sans-serif", lineHeight: 1.45 }}>
            Find meets near you, link up with drivers, show off your garage, and play the arcade for points.
          </div>
        </div>

        {!panel && <NightRoad />}

        {panel ? (
          <div style={{ marginTop: 18, background: "rgba(10,14,22,0.92)", border: "1px solid #1E2A3C", borderRadius: 16, padding: 16 }}>
            <button onClick={() => setPanel(null)} style={{ background: "none", border: "none", color: "#7FBFF5", fontSize: 14, fontWeight: 800, cursor: "pointer", padding: 0, marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>
              ← BACK
            </button>
            <AuthForm key={panel} initialMode={panel} hideGoogle />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
            {google && (
              <button className="action-btn" onClick={withGoogle} style={{ ...btn, background: "#fff", color: "#111" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                CONTINUE WITH GOOGLE
              </button>
            )}
            <button className="action-btn" onClick={() => setPanel("signup")} style={{ ...btn, background: "#0080F0", color: "#fff", boxShadow: "0 6px 24px rgba(0,128,240,0.4)" }}>
              ✉️ SIGN UP WITH EMAIL
            </button>
            <button className="action-btn" onClick={() => setPanel("login")} style={{ ...btn, background: "rgba(255,255,255,0.06)", color: "#F0F0F0", border: "1px solid #2A3646" }}>
              I HAVE AN ACCOUNT · LOG IN
            </button>
            {error && (
              <div role="alert" style={{ fontSize: 13, color: "#F87171", fontFamily: "'Barlow', sans-serif", textAlign: "center" }}>
                {error}
              </div>
            )}
            <button className="action-btn" onClick={onGuest} style={{ ...btn, background: "none", color: "#B9C2CF", padding: "12px 0", fontSize: 15 }}>
              CONTINUE AS GUEST →
            </button>
            <div style={{ fontSize: 11.5, color: "#7D8796", textAlign: "center", lineHeight: 1.55, fontFamily: "'Barlow', sans-serif" }}>
              Browsing as a guest means you're 18 or older and agree to the{" "}
              <button type="button" onClick={() => setShowTerms(true)} style={link}>
                Terms of Service
              </button>{" "}
              and{" "}
              <button type="button" onClick={() => setShowPrivacy(true)} style={link}>
                Privacy Policy
              </button>
              . New accounts read and agree to them after signing up.
            </div>
          </div>
        )}
      </div>
      {showTerms && <TermsOfService readOnly onClose={() => setShowTerms(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

// A car cruising a night road: the road lines rush by, the tail lights glow.
function NightRoad() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    let raf = 0;
    const start = performance.now();
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(r.width * dpr)) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width;
      const h = r.height;
      ctx.clearRect(0, 0, w, h);
      const horizon = h * 0.22;
      // The road, narrowing to the horizon.
      ctx.fillStyle = "#14171d";
      ctx.beginPath();
      ctx.moveTo(w * 0.47, horizon);
      ctx.lineTo(w * 0.53, horizon);
      ctx.lineTo(w * 1.05, h);
      ctx.lineTo(-w * 0.05, h);
      ctx.closePath();
      ctx.fill();
      // Edge lines in TUNR blue.
      ctx.strokeStyle = "rgba(0,128,240,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.47, horizon);
      ctx.lineTo(-w * 0.05, h);
      ctx.moveTo(w * 0.53, horizon);
      ctx.lineTo(w * 1.05, h);
      ctx.stroke();
      // Center dashes rushing toward you.
      const t = ((now - start) / 1000) * 1.4;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let k = 0; k < 8; k++) {
        const u = (k / 8 + t) % 1; // 0 far … 1 near
        const d = u * u;
        const y = horizon + (h - horizon) * d;
        const len = 4 + 34 * d;
        const half = 0.6 + 3.5 * d;
        ctx.fillRect(w / 2 - half, y, half * 2, len);
      }
      // The car, gently swaying, tail lights pulsing.
      const sway = Math.sin(t * 1.3) * w * 0.02;
      drawCar(ctx, w / 2 + sway, h * 0.92, Math.min(w * 0.5, 210), { color: "#0080F0", body: "coupe", spoiler: "wing", plate: "TUNR", sport: true });
      const glow = 0.35 + Math.sin(t * 4) * 0.1;
      const g = ctx.createRadialGradient(w / 2 + sway, h * 0.8, 4, w / 2 + sway, h * 0.8, w * 0.35);
      g.addColorStop(0, `rgba(255,40,40,${glow})`);
      g.addColorStop(1, "rgba(255,40,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, w, h - horizon);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ width: "100%", height: "min(36vh, 280px)", display: "block", margin: "18px 0 14px" }} />;
}
