// Loads Mapbox GL from its CDN once (the same version MapView.jsx uses) and
// resolves with window.mapboxgl, or null when there's no VITE_MAPBOX_TOKEN.

export const MAPBOX_TOKEN = import.meta.env?.VITE_MAPBOX_TOKEN || "";
let loading = null;

export function loadMapbox() {
  if (!MAPBOX_TOKEN) return Promise.resolve(null);
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  loading ||= new Promise((ok, fail) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
    script.onload = () => {
      window.mapboxgl.accessToken = MAPBOX_TOKEN;
      ok(window.mapboxgl);
    };
    script.onerror = () => {
      loading = null;
      fail(new Error("the map didn't load (no connection to Mapbox?)"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
