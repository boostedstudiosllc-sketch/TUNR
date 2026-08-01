import { useEffect, useRef } from "react";
import { VIBES } from "../data/events.js";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function MapView({ events, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // Load mapbox-gl from CDN once
  useEffect(() => {
    if (!MAPBOX_TOKEN) return;
    let cancelled = false;

    function init() {
      if (cancelled || mapRef.current || !containerRef.current) return;
      const mapboxgl = window.mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-84.39, 33.85],
        zoom: 8.6,
      });
      mapRef.current = map;
    }

    if (window.mapboxgl) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
      script.onload = () => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
        document.head.appendChild(link);
        init();
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync markers whenever the event list changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.mapboxgl) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    events
      .filter((e) => e.lat != null && e.lng != null)
      .forEach((event) => {
        const color = VIBES[event.vibe] || "#FF4500";
        const el = document.createElement("div");
        el.style.cssText = `
          width: 30px; height: 30px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          background: ${color};
          border: 2px solid #0A0A0A;
          cursor: pointer;
          box-shadow: 0 4px 16px ${color}77;
          display: flex; align-items: center; justify-content: center;
        `;
        const inner = document.createElement("div");
        inner.style.cssText =
          "transform: rotate(45deg); color: #fff; font-size: 10px; font-weight: 900; font-family: 'Barlow Condensed', sans-serif;";
        inner.textContent = event.vibe.slice(0, 1);
        el.appendChild(inner);
        el.addEventListener("click", () => onSelect(event));

        const marker = new window.mapboxgl.Marker(el)
          .setLngLat([event.lng, event.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
  }, [events, onSelect]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        style={{
          height: 300,
          borderRadius: 12,
          border: "1px dashed #2A2A2A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontSize: 13,
          textAlign: "center",
          padding: 20,
        }}
      >
        Map unavailable — set VITE_MAPBOX_TOKEN to enable the live map.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 400,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #222",
      }}
    />
  );
}
