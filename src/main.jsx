import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TUNR from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./theme.css";
import "./lib/theme.js";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <TUNR />
    </ErrorBoundary>
  </StrictMode>
);

// After an update, a copy of the app that was already open (say, left
// running on a phone) asks for code files that no longer exist, because each
// release renames them: "Importing a module script failed". Reload once to
// pick up the new release. Not more than once a minute, so a real outage
// can't reload in a loop; then the screen shows its own error with the reason.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "tunr.reloadedForUpdate";
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch (e) {
    console.warn("Couldn't note the reload for an update:", e.message);
    return;
  }
  console.warn("A newer version is out; reloading.", event.payload?.message);
  window.location.reload();
});

// Makes the app installable to a home screen, and keeps this version's files
// on the phone for offline play (public/sw.js). Registration failures are
// not worth surfacing — the app works the same online without it.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: "precache" }))
      .catch((e) => console.warn(`Offline mode isn't set up on this browser. (${e.message})`));
  });
}
