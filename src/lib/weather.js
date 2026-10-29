// Meet weather, from Open-Meteo (free, no key): the forecast for a meet's
// spot and hours, and whether it's worth a heads-up (rain, storms, snow,
// strong wind, real heat or cold). Used by the meet page and by the
// meet-day reminders (api/reminders.js), so nothing here touches Supabase.

import { nextOccurrenceKey } from "./dates.js";

const API = "https://api.open-meteo.com/v1/forecast";
export const FORECAST_DAYS = 16;

// WMO weather codes → icon and words.
const CODES = [
  [[0], "☀️", "Clear"],
  [[1, 2], "⛅", "Partly cloudy"],
  [[3], "☁️", "Cloudy"],
  [[45, 48], "🌫️", "Fog"],
  [[51, 53, 55, 56, 57], "🌦️", "Drizzle"],
  [[61, 63, 80, 81], "🌧️", "Rain"],
  [[65, 82], "🌧️", "Heavy rain"],
  [[66, 67], "🧊", "Freezing rain"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "Snow"],
  [[95, 96, 99], "⛈️", "Thunderstorms"],
];
export function describeCode(code) {
  const hit = CODES.find(([list]) => list.includes(code));
  return hit ? { icon: hit[1], text: hit[2] } : { icon: "🌡️", text: "Forecast" };
}
const STORMY = new Set([65, 66, 67, 71, 73, 75, 77, 82, 85, 86, 95, 96, 99]);

// The meet's hours out of an hourly forecast ({ time: ["2026-10-31T19:00",
// …], temperature_2m, precipitation_probability, weather_code,
// wind_speed_10m }, times in the meet's own time zone). start/end are local
// "YYYY-MM-DDTHH:mm" strings; no end means three hours. Returns null when
// the forecast doesn't reach that far.
export function summarizeForecast(hourly, start, end) {
  if (!hourly?.time?.length || !start) return null;
  const from = start.slice(0, 13);
  const to = (end && end > start ? end : addHours(start, 3)).slice(0, 13);
  const idx = [];
  hourly.time.forEach((t, i) => {
    const h = t.slice(0, 13);
    if (h >= from && h <= to) idx.push(i);
  });
  if (!idx.length) return null;
  const pick = (key) => idx.map((i) => hourly[key]?.[i]).filter((v) => typeof v === "number");
  const temps = pick("temperature_2m");
  const rain = Math.max(0, ...pick("precipitation_probability"));
  const wind = Math.max(0, ...pick("wind_speed_10m"));
  const codes = pick("weather_code");
  // The worst weather in those hours sets the picture.
  const code = codes.reduce((worst, c) => (severity(c) > severity(worst) ? c : worst), codes[0] ?? 0);
  const { icon, text } = describeCode(code);
  const tempF = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null;
  return { icon, text, tempF, high: temps.length ? Math.round(Math.max(...temps)) : null, low: temps.length ? Math.round(Math.min(...temps)) : null, rain, wind: Math.round(wind), alert: alertFor({ code, rain, wind, temps }) };
}

const severity = (c) => (STORMY.has(c) ? 3 : c >= 51 ? 2 : c >= 45 ? 1 : 0);

// A heads-up worth sending, or null.
export function alertFor({ code, rain, wind, temps = [] }) {
  if ([95, 96, 99].includes(code)) return "Thunderstorms forecast";
  if ([71, 73, 75, 77, 85, 86, 66, 67].includes(code)) return "Snow or ice forecast";
  if (rain >= 60) return `Rain likely (${rain}%)`;
  if (wind >= 30) return `Strong wind (${Math.round(wind)} mph)`;
  if (temps.length && Math.max(...temps) >= 98) return `Hot: up to ${Math.round(Math.max(...temps))}°F`;
  if (temps.length && Math.min(...temps) <= 32) return `Freezing: down to ${Math.round(Math.min(...temps))}°F`;
  return null;
}

function addHours(local, n) {
  const d = new Date(`${local.slice(0, 16)}:00Z`);
  d.setUTCHours(d.getUTCHours() + n);
  return d.toISOString().slice(0, 16);
}

// Is the meet close enough for a forecast? (local "YYYY-MM-DD…" vs today)
export function inForecastRange(startLocal, now = new Date()) {
  const days = (new Date(`${startLocal.slice(0, 10)}T12:00:00Z`) - new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`)) / 864e5;
  return days >= 0 && days < FORECAST_DAYS - 1;
}

// A meet's next run as local { start, end } ("YYYY-MM-DDTHH:mm"), for
// summarizeForecast. Weekly and monthly meets use their next date.
export function meetWindow(event, now = new Date()) {
  const key = event?.start && nextOccurrenceKey(event, now);
  if (!key) return null;
  const start = `${key}T${event.start.slice(11, 16)}`;
  const endTime = event.end?.slice(11, 16);
  return { start, end: endTime && endTime > start.slice(11) ? `${key}T${endTime}` : null };
}

// Fetches the hourly forecast for a spot. Throws with the reason.
export async function fetchHourly(lat, lng, timezone = "America/New_York", fetchImpl = fetch) {
  const url = `${API}?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=${encodeURIComponent(timezone)}&forecast_days=${FORECAST_DAYS}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Couldn't load the weather. (forecast service said ${res.status})`);
  const data = await res.json();
  return data.hourly;
}

// The meet page: cached per spot for 30 minutes.
const cache = new Map();
export async function loadMeetWeather({ lat, lng, timezone }, { start, end } = {}) {
  if (lat == null || lng == null || !start || !inForecastRange(start)) return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${timezone}`;
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > 30 * 60e3) {
    const p = fetchHourly(lat, lng, timezone || undefined);
    cache.set(key, { at: Date.now(), p });
    p.catch(() => cache.delete(key));
  }
  return summarizeForecast(await cache.get(key).p, start, end);
}
