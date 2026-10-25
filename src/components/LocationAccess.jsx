import { useEffect, useState } from "react";
import { locationStatus, watchLocationStatus, askForLocation, enableSteps, LOCATION_USES } from "../lib/location.js";
import { muted, label, bigButton } from "./Sheet.jsx";

const STATUS = {
  granted: { text: "On", color: "#10B981" },
  denied: { text: "Blocked", color: "#F87171" },
  prompt: { text: "Not turned on yet", color: "#FACC15" },
  unsupported: { text: "Not available", color: "#A0A0A0" },
};

// The live location setting for this device, kept in step if it changes.
export function useLocationStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let stop = () => {};
    let alive = true;
    locationStatus().then((s) => alive && setStatus(s));
    watchLocationStatus((s) => alive && setStatus(s)).then((f) => (stop = f));
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return [status, setStatus];
}

export function LocationPill({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  return <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.text}</span>;
}

// Settings → Location: what it's for, its state here, and how to turn it on.
export function LocationPage({ onToast }) {
  const [status, setStatus] = useLocationStatus();
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    setBusy(true);
    const next = await askForLocation();
    setStatus(next);
    setBusy(false);
    if (next === "granted") onToast("📍 Location is on");
    else if (next === "denied") onToast("Location is blocked. Follow the steps below to allow it.");
    else onToast("Couldn't get your location. Check that location is on for your phone, then try again.");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>Location on this device</div>
        <LocationPill status={status} />
      </div>
      <div style={{ ...muted, marginTop: 6 }}>
        TUNR checks your location only at the moment you tap for it, and never in the background.
        Several features need it to work:
      </div>

      <div style={{ marginTop: 10 }}>
        {LOCATION_USES.map(([icon, title, sub]) => (
          <div key={title} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #1A1A1A" }}>
            <span aria-hidden="true" style={{ width: 22, textAlign: "center" }}>{icon}</span>
            <span>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>{title}</span>
              <span style={{ display: "block", ...muted, fontSize: 12.5 }}>{sub}</span>
            </span>
          </div>
        ))}
      </div>

      {status !== "granted" && status !== "unsupported" && (
        <button className="action-btn" disabled={busy} onClick={turnOn} style={{ ...bigButton, marginTop: 16, opacity: busy ? 0.6 : 1 }}>
          {busy ? "ASKING…" : "📍 TURN ON LOCATION"}
        </button>
      )}
      {status === "granted" && (
        <div style={{ ...muted, color: "#10B981", marginTop: 14 }}>
          ✓ All set. To turn it off, use the same settings as the steps below and choose Don't Allow.
        </div>
      )}
      {status === "unsupported" && (
        <div style={{ ...muted, color: "#F87171", marginTop: 14 }}>
          This browser can't share location. Try Safari on iPhone or Chrome on Android.
        </div>
      )}

      {status !== "unsupported" && (
        <>
          <div style={{ ...label, marginTop: 20 }}>{status === "denied" ? "HOW TO UNBLOCK IT" : "IF IT'S BLOCKED"}</div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "#CCC", fontFamily: "'Barlow', sans-serif", fontSize: 13.5, lineHeight: 1.6 }}>
            {enableSteps().map((step) => (
              <li key={step} style={{ marginBottom: 6 }}>{step}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// A heads-up inside the check-in box when location isn't on yet.
export function LocationNotice({ status, onTurnOn, busy }) {
  const [showSteps, setShowSteps] = useState(false);
  if (!status || status === "granted") return null;
  const blocked = status === "denied";
  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        background: blocked ? "rgba(248,113,113,0.08)" : "rgba(250,204,21,0.07)",
        border: `1px solid ${blocked ? "#7F1D1D" : "#4A3A00"}`,
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: blocked ? "#F87171" : "#FACC15" }}>
        📍 {blocked ? "Location is blocked for TUNR" : "Location is needed to check in"}
      </div>
      <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>
        Points are for being at the meet, so TUNR checks you're within a quarter mile of its pin. Only
        when you tap, never in the background.
      </div>
      {blocked ? (
        showSteps ? (
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, color: "#CCC", fontFamily: "'Barlow', sans-serif", fontSize: 12.5, lineHeight: 1.55 }}>
            {enableSteps().map((step) => (
              <li key={step} style={{ marginBottom: 4 }}>{step}</li>
            ))}
          </ol>
        ) : (
          <button onClick={() => setShowSteps(true)} style={linkButton}>How to turn it on →</button>
        )
      ) : (
        <button onClick={onTurnOn} disabled={busy} style={linkButton}>{busy ? "Asking…" : "Turn on location →"}</button>
      )}
    </div>
  );
}

const linkButton = {
  background: "none",
  border: "none",
  padding: "8px 0 0",
  color: "#38BDF8",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "'Barlow', sans-serif",
};
