import { useState } from "react";
import { isIos, isStandalone } from "../lib/alerts.js";
import Sheet, { sheetTitle } from "./Sheet.jsx";
import { IphoneSteps } from "./AlertSettings.jsx";

const KEY = "tunr.homescreen.dismissed";
const AGAIN_AFTER_DAYS = 14;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - at < AGAIN_AFTER_DAYS * 86400000;
  } catch (e) {
    return false;
  }
}

// iPhone in Safari: alerts (and a full-screen app) need TUNR on the Home
// Screen, which iOS never suggests on its own. A small banner, shown again
// two weeks after it's closed.
export default function HomeScreenPrompt() {
  const [hidden, setHidden] = useState(() => !isIos() || isStandalone() || dismissedRecently());
  const [steps, setSteps] = useState(false);
  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch (e) {
      // Private browsing: it just shows again next visit.
    }
    setHidden(true);
  }

  return (
    <div style={{ margin: "0 20px 12px", background: "var(--n-141414)", border: "1px solid var(--n-2a2a2a)", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ fontSize: 22 }}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Add TUNR to your Home Screen</div>
        <div style={{ fontSize: 11.5, color: "var(--n-888888)", lineHeight: 1.4, fontFamily: "'Barlow', sans-serif" }}>
          On iPhone, linkup alerts and meet reminders only work from there.
        </div>
      </div>
      <button
        onClick={() => setSteps(true)}
        style={{ background: "#0080F0", border: "none", color: "#fff", borderRadius: 6, padding: "7px 10px", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.8, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        HOW
      </button>
      <button onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "var(--n-666666)", fontSize: 16, cursor: "pointer", padding: 2 }}>
        ✕
      </button>
      {steps && (
        <Sheet onClose={() => setSteps(false)} label="Add to Home Screen">
          <div style={sheetTitle}>ADD TO HOME SCREEN</div>
          <div style={{ marginTop: 10 }}>
            <IphoneSteps />
          </div>
        </Sheet>
      )}
    </div>
  );
}
