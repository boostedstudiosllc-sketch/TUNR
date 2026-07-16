import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TUNR from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TUNR />
  </StrictMode>
);
