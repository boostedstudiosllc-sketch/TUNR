import { useEffect, useState } from "react";
import { loadBoostWeek, setBoostDay, loadBoostSettings, saveBoostSettings } from "../lib/boost.js";
import { mondayOf, weekdayName } from "../lib/boostRules.js";
import { todayKey } from "../lib/dates.js";
import { muted, label, field, quietButton } from "./Sheet.jsx";

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Settings → Admin → Boost Day (132): this week's and next week's pick (the
// Sunday job picks the slowest weekday by RSVPs), change it, and set the
// bonus and the stay time. Members only see Boost Day on the day.
export default function BoostAdmin({ onToast }) {
  const thisMonday = mondayOf(todayKey());
  const [week, setWeek] = useState(thisMonday);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = () =>
    loadBoostWeek(week)
      .then((d) => (setData(d), setError("")))
      .catch((e) => (setData({}), setError(e.message)));
  useEffect(() => {
    refresh();
  }, [week]);
  useEffect(() => {
    loadBoostSettings()
      .then((s) => setSettings({ points: String(s.boost_points), minutes: String(s.boost_stay_minutes) }))
      .catch((e) => setError(e.message));
  }, []);

  const act = async (fn, done) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onToast?.(done);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const days = [0, 1, 2, 3, 4].map((i) => addDays(week, i));
  const scores = data?.scores || {};
  return (
    <div>
      <div style={muted}>Every Sunday TUNR picks the coming week's slowest weekday (fewest RSVPs: half from that week's meets so far, half from the last 4 weeks). People who opt in that day get bonus points for RSVPing to a meet before it starts and showing up. Members only see it on the day.</div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {[thisMonday, addDays(thisMonday, 7)].map((m, i) => (
          <button key={m} onClick={() => setWeek(m)} aria-pressed={week === m} style={{ ...quietButton, marginTop: 0, flex: 1, borderColor: week === m ? "#F59E0B" : undefined, color: week === m ? "#F59E0B" : undefined }}>
            {i ? "NEXT WEEK" : "THIS WEEK"}
          </button>
        ))}
      </div>
      <div style={{ ...label, marginTop: 14 }}>
        {data?.day ? `BOOST DAY: ${weekdayName(data.day).toUpperCase()} (${data.picked_by === "admin" ? "picked by an admin" : "picked automatically"})` : data ? "NO BOOST DAY (NO WEEKDAY MEETS)" : "LOADING…"}
      </div>
      {data?.day && <div style={{ ...muted, fontSize: 12.5 }}>{data.entries} opted in · {data.paid} earned it{data.alerted ? " · morning alert sent" : ""}</div>}
      {days.map((d) => {
        const sc = scores[d];
        const picked = data?.day === d;
        const past = d < todayKey();
        return (
          <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: picked ? "#F59E0B" : undefined }}>
                {picked ? "🔥 " : ""}
                {weekdayName(d)}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--n-888888)", fontWeight: 700 }}>
                {sc ? `${sc.meets} meet${sc.meets === 1 ? "" : "s"} · ${sc.rsvps_now} RSVPs now · ${sc.avg_4_weeks} avg (4 wks) · score ${sc.score}` : "No score (no meets when it was picked)"}
              </span>
            </span>
            {!picked && !past && (
              <button disabled={busy} onClick={() => act(() => setBoostDay(week, d), `Boost Day moved to ${weekdayName(d)}`)} style={{ ...quietButton, marginTop: 0, width: "auto", padding: "6px 10px", fontSize: 12.5 }}>
                MAKE IT THIS DAY
              </button>
            )}
          </div>
        );
      })}

      {settings && (
        <>
          <div style={{ ...label, marginTop: 18 }}>BONUS AND STAY TIME</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>BONUS POINTS (0 = OFF)</div>
              <input style={field} inputMode="numeric" value={settings.points} onChange={(e) => setSettings((s) => ({ ...s, points: e.target.value.replace(/\D/g, "") }))} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>STAY (MINUTES)</div>
              <input style={field} inputMode="numeric" value={settings.minutes} onChange={(e) => setSettings((s) => ({ ...s, minutes: e.target.value.replace(/\D/g, "") }))} />
            </div>
          </div>
          <button disabled={busy} onClick={() => act(() => saveBoostSettings(settings), "Boost Day settings saved")} style={{ ...quietButton, marginTop: 8 }}>
            SAVE
          </button>
        </>
      )}
    </div>
  );
}
