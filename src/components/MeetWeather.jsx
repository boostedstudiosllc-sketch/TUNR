import { useEffect, useState } from "react";
import { loadMeetWeather, meetWindow } from "../lib/weather.js";

// The forecast for a meet's spot and hours, on the meet page, once it's
// within about two weeks. A heads-up line when it looks rough.
export default function MeetWeather({ event }) {
  const [wx, setWx] = useState(null);
  const [error, setError] = useState("");
  const win = meetWindow(event);
  const key = `${event.id}:${win?.start}`;
  useEffect(() => {
    if (!win) return;
    let live = true;
    setError("");
    loadMeetWeather(event, win)
      .then((w) => live && setWx(w))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [key]);

  if (error) return <div style={{ marginTop: 10, fontSize: 12, color: "var(--n-888888)", fontFamily: "'Barlow', sans-serif" }}>{error}</div>;
  if (!wx) return null;
  const bits = [wx.text, wx.tempF != null && `${wx.tempF}°F`, `${wx.rain}% rain`, wx.wind >= 15 && `${wx.wind} mph wind`].filter(Boolean);
  return (
    <div
      role="group"
      aria-label="Meet weather"
      style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: wx.alert ? "rgba(245,158,11,0.12)" : "var(--n-141414)", border: `1px solid ${wx.alert ? "#B45309" : "var(--n-232323)"}`, display: "flex", alignItems: "center", gap: 10 }}
    >
      <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>
        {wx.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 10.5, fontWeight: 900, letterSpacing: 1.5, color: "var(--n-8a94a3)" }}>WEATHER AT THE MEET</span>
        <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{bits.join(" · ")}</span>
        {wx.alert && <span style={{ display: "block", fontSize: 12.5, color: "var(--a-fbbf24)", fontWeight: 700, fontFamily: "'Barlow', sans-serif" }}>⚠️ {wx.alert}. Check with the host before you head out.</span>}
      </span>
    </div>
  );
}
