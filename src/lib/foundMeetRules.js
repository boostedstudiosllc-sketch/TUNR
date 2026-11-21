// Meets found online (125): words for the admin page. No network here.

// "Sat, Dec 5 · 6:00 PM" from "2026-12-05T18:00" (already local time).
export function whenLabel(local) {
  const [d, t] = String(local || "").split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [h, min] = (t || "00:00").split(":").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day, 12));
  const wd = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const hr = h % 12 || 12;
  return `${wd} · ${hr}:${String(min).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
