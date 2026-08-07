import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TUNR from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TUNR />
  </StrictMode>
);

// Makes the app installable to a home screen. Registration failures are not
// worth surfacing — the app works identically without it.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
