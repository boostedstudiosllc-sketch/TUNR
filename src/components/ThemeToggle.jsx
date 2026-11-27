import { useEffect, useState } from "react";
import { themePref, setThemePref, activeTheme } from "../lib/theme.js";
import { showError, showToast } from "../lib/toast.js";

// One tap between dark and light, in the top bar. (Settings → Theme also
// has Auto, which follows the phone.)
export default function ThemeToggle() {
  const [mode, setMode] = useState(() => activeTheme());
  useEffect(() => {
    const sync = () => setMode(activeTheme());
    window.addEventListener("tunr:theme", sync);
    return () => window.removeEventListener("tunr:theme", sync);
  }, []);
  const next = mode === "dark" ? "light" : "dark";
  function flip() {
    try {
      const wasAuto = themePref() === "system";
      setThemePref(next);
      setMode(next);
      showToast(`${next === "light" ? "☀️ Light" : "🌙 Dark"} mode${wasAuto ? ". Auto is in Settings → Theme" : ""}`);
    } catch (e) {
      showError("Couldn't switch the theme.", e);
    }
  }
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--n-161616)", border: "1px solid var(--n-2a2a2a)", color: "var(--n-dddddd)", fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
    >
      <span aria-hidden="true">{mode === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}
