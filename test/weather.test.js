import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeForecast, alertFor, meetWindow, inForecastRange, describeCode } from "../src/lib/weather.js";
import { weatherAlerts, withWeather } from "../api/reminders.js";

// Hourly forecast for 2026-10-31, 00:00 to 23:00 local.
const day = (over = {}) => {
  const time = Array.from({ length: 24 }, (_, h) => `2026-10-31T${String(h).padStart(2, "0")}:00`);
  return {
    time,
    temperature_2m: time.map(() => 64),
    precipitation_probability: time.map(() => 10),
    weather_code: time.map(() => 1),
    wind_speed_10m: time.map(() => 6),
    ...over,
  };
};

test("weather: only the meet's hours count", () => {
  const rain = Array(24).fill(5);
  rain[8] = 90; // a morning shower, before the meet
  rain[20] = 40;
  const wx = summarizeForecast(day({ precipitation_probability: rain }), "2026-10-31T19:00", "2026-10-31T22:00");
  assert.equal(wx.rain, 40);
  assert.equal(wx.tempF, 64);
  assert.equal(wx.text, "Partly cloudy");
  assert.equal(wx.alert, null);
});

test("weather: no end time means three hours; the worst weather sets the picture", () => {
  const codes = Array(24).fill(1);
  codes[21] = 95; // storm at 9 PM
  codes[23] = 95; // after the three hours
  const wx = summarizeForecast(day({ weather_code: codes }), "2026-10-31T18:00", null);
  assert.equal(wx.icon, "⛈️");
  assert.equal(wx.alert, "Thunderstorms forecast");
  assert.equal(summarizeForecast(day(), "2026-11-20T19:00", null), null);
});

test("weather: what's worth a heads-up", () => {
  assert.equal(alertFor({ code: 3, rain: 70, wind: 5, temps: [60] }), "Rain likely (70%)");
  assert.equal(alertFor({ code: 3, rain: 20, wind: 34, temps: [60] }), "Strong wind (34 mph)");
  assert.equal(alertFor({ code: 0, rain: 0, wind: 4, temps: [96, 99] }), "Hot: up to 99°F");
  assert.equal(alertFor({ code: 0, rain: 0, wind: 4, temps: [30, 35] }), "Freezing: down to 30°F");
  assert.equal(alertFor({ code: 73, rain: 30, wind: 4, temps: [30] }), "Snow or ice forecast");
  assert.equal(alertFor({ code: 2, rain: 30, wind: 10, temps: [70] }), null);
  assert.equal(describeCode(61).text, "Rain");
});

test("weather: a weekly meet's next run, and how far ahead forecasts go", () => {
  const now = new Date("2026-10-29T15:00:00Z"); // a Thursday
  const w = meetWindow({ start: "2026-01-03T19:00", end: "2026-01-03T22:00", recurrence: "weekly:SAT", timezone: "America/New_York" }, now);
  assert.deepEqual(w, { start: "2026-10-31T19:00", end: "2026-10-31T22:00" });
  assert.equal(inForecastRange("2026-10-31T19:00", now), true);
  assert.equal(inForecastRange("2026-12-01T19:00", now), false);
  assert.equal(inForecastRange("2026-10-20T19:00", now), false);
});

test("weather in the reminders: added to the body, and the host is told", async () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const events = [
    { id: "e1", title: "Tuner Night", start_at: "2026-10-31T23:00:00Z", end_at: null, timezone: "America/New_York", lat: 33.75, lng: -84.39, created_by: "host1" },
    { id: "e2", title: "No Spot", start_at: "2026-10-31T23:00:00Z", timezone: "America/New_York", lat: null, lng: null, created_by: "host2" },
  ];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ hourly: day({ precipitation_probability: Array(24).fill(80), weather_code: Array(24).fill(63) }) }));
  };
  const alerts = await weatherAlerts(events, now, fetchImpl);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /latitude=33\.750&longitude=-84\.390/);
  assert.deepEqual(alerts, { e1: { alert: "Rain likely (80%)", icon: "🌧️" } });

  const items = withWeather(
    [
      { user_id: "u1", kind: "meet_reminder", title: "Today: Tuner Night", body: "7:00 PM · Atlanta, GA", link: "meet:e1", dedupe: "meet:e1:2026-10-31" },
      { user_id: "u2", kind: "meet_reminder", title: "Today: No Spot", body: "7:00 PM", link: "meet:e2", dedupe: "meet:e2:2026-10-31" },
    ],
    events,
    alerts,
    now
  );
  assert.equal(items[0].body, "7:00 PM · Atlanta, GA · 🌧️ Rain likely (80%)");
  assert.equal(items[1].body, "7:00 PM");
  assert.deepEqual(
    items.slice(2).map((i) => [i.user_id, i.kind, i.title, i.dedupe]),
    [["host1", "meet_weather", "🌧️ Rain likely (80%) for Tuner Night", "weather:e1:2026-10-31"]]
  );

  // A forecast outage never stops the reminders.
  const down = await weatherAlerts(events, now, async () => new Response("", { status: 503 }));
  assert.deepEqual(down, {});
});
