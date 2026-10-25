import { useEffect, useState } from "react";
import { DEFAULT_RULES, loadGameSettings, saveGameSettings } from "../lib/rush.js";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";

const mph = (ms) => `${Math.round(ms * 2.237)} MPH`;
const secs = (v) => (v === 0 ? "off" : `${v} sec`);
const pct = (v) => `${Math.round(v * 100)}%`;

// Each setting: what it's called, its range and step, and how to show it.
const FIELDS = [
  { key: "goal", name: "Daily goal", help: "Distance in one run for the daily points", min: 500, max: 20000, step: 250, show: (v) => `${v.toLocaleString()} m` },
  { key: "dailyPoints", name: "Points for the goal", help: "Once a day per person; 0 turns game points off", min: 0, max: 10, step: 1, show: (v) => `${v} pt${v === 1 ? "" : "s"}` },
  { key: "startTime", name: "Starting clock", help: "Seconds on the clock at the start", min: 20, max: 180, step: 5, show: secs },
  { key: "clockSeconds", name: "⏱ pickup adds", min: 0, max: 10, step: 0.5, show: secs },
  { key: "crashSeconds", name: "A crash costs", min: 0, max: 15, step: 0.5, show: secs },
  { key: "clockChance", name: "How often ⏱ shows up", help: "Share of traffic rows with one", min: 0, max: 0.5, step: 0.02, show: pct },
  { key: "boostSeconds", name: "Boost lasts", help: "The Boosted badge; off = no badges", min: 0, max: 10, step: 0.5, show: secs },
  { key: "boostChance", name: "How often the badge shows up", help: "Share of traffic rows with one", min: 0, max: 0.3, step: 0.01, show: pct },
  { key: "traffic", name: "Traffic", help: "100% is normal; higher = more cars, harder", min: 0.5, max: 2, step: 0.05, show: pct },
  { key: "topSpeed", name: "Top speed", min: 30, max: 100, step: 1, show: mph },
  { key: "boostSpeed", name: "Boost speed", min: 30, max: 130, step: 1, show: mph },
];

const PRESETS = {
  Easy: { goal: 2500, startTime: 75, clockSeconds: 4, crashSeconds: 3, boostSeconds: 4, boostChance: 0.12, clockChance: 0.26, traffic: 0.85 },
  Normal: {
    goal: DEFAULT_RULES.goal,
    startTime: DEFAULT_RULES.startTime,
    clockSeconds: DEFAULT_RULES.clockSeconds,
    crashSeconds: DEFAULT_RULES.crashSeconds,
    boostSeconds: DEFAULT_RULES.boostSeconds,
    boostChance: DEFAULT_RULES.boostChance,
    clockChance: DEFAULT_RULES.clockChance,
    traffic: DEFAULT_RULES.traffic,
  },
  Hard: { goal: 4000, startTime: 50, clockSeconds: 3, crashSeconds: 5, boostSeconds: 3, boostChance: 0.05, clockChance: 0.18, traffic: 1.25 },
};

const round = (v, step) => Math.round(v / step) * step;

// Settings → Admin → TUNR Rush: the game's rules. Saved rules apply from
// each player's next run, and the server checks runs against them.
export default function RushAdmin({ onToast }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadGameSettings()
      .then((r) => (setSaved(r), setDraft(r)))
      .catch((e) => setError(e.message));
  }, []);

  if (!draft) return <div style={{ ...muted, marginTop: 10 }}>{error || "Loading…"}</div>;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const nudge = (f, dir) =>
    set({ [f.key]: Math.min(f.max, Math.max(f.min, Number(round(draft[f.key] + dir * f.step, f.step).toFixed(2)))) });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    if (draft.boostSpeed < draft.topSpeed) return setError("Boost speed should be at least the top speed, or a boost slows you down.");
    setBusy(true);
    setError("");
    try {
      await saveGameSettings(draft);
      const fresh = await loadGameSettings();
      setSaved(fresh);
      setDraft(fresh);
      onToast("🎮 TUNR Rush settings saved");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={muted}>
        The rules for the TUNR Rush game. Changes apply from each player's next run, and the server checks every
        run against them.
      </div>

      <button
        onClick={() => set({ enabled: !draft.enabled })}
        aria-pressed={draft.enabled}
        style={{ ...row, width: "100%", cursor: "pointer", marginTop: 12, textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 900, fontSize: 15 }}>Game is {draft.enabled ? "on" : "parked"}</span>
          <span style={{ ...muted, fontSize: 12 }}>{draft.enabled ? "Anyone can play" : "Nobody can start a run"}</span>
        </span>
        <span style={{ ...pill, background: draft.enabled ? "#10B981" : "#333" }}>{draft.enabled ? "ON" : "OFF"}</span>
      </button>

      <div style={{ ...label, marginTop: 16 }}>QUICK SETUPS</div>
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(PRESETS).map(([name, p]) => (
          <button key={name} onClick={() => set(p)} style={{ ...quietButton, flex: 1, padding: "10px 0" }}>
            {name.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ ...label, marginTop: 16 }}>RULES</div>
      {FIELDS.map((f) => (
        <div key={f.key} style={row}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: 14.5 }}>{f.name}</span>
            {f.help && <span style={{ ...muted, fontSize: 11.5, lineHeight: 1.35, display: "block" }}>{f.help}</span>}
          </span>
          <button aria-label={`Less ${f.name}`} disabled={draft[f.key] <= f.min} onClick={() => nudge(f, -1)} style={stepBtn}>
            −
          </button>
          <span style={{ width: 78, textAlign: "center", fontWeight: 900, color: draft[f.key] !== saved[f.key] ? "#FF7A00" : "#F0F0F0" }}>
            {f.show(draft[f.key])}
          </span>
          <button aria-label={`More ${f.name}`} disabled={draft[f.key] >= f.max} onClick={() => nudge(f, 1)} style={stepBtn}>
            +
          </button>
        </div>
      ))}

      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 10 }}>{error}</div>}
      <button disabled={busy || !changed} onClick={save} style={{ ...bigButton, marginTop: 14, opacity: busy || !changed ? 0.5 : 1 }}>
        {busy ? "SAVING…" : changed ? "SAVE CHANGES" : "SAVED"}
      </button>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button disabled={!changed} onClick={() => setDraft(saved)} style={{ ...quietButton, flex: 1, opacity: changed ? 1 : 0.5 }}>
          UNDO CHANGES
        </button>
        <button onClick={() => set({ ...DEFAULT_RULES, enabled: draft.enabled })} style={{ ...quietButton, flex: 1 }}>
          BACK TO DEFAULTS
        </button>
      </div>
      {saved.updatedAt && (
        <div style={{ ...muted, fontSize: 11.5, marginTop: 10, textAlign: "center" }}>
          Last changed {new Date(saved.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

const row = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  marginTop: 6,
  background: "#121212",
  border: "1px solid #222",
  borderRadius: 12,
  color: "#F0F0F0",
  fontFamily: "'Barlow Condensed', sans-serif",
  boxSizing: "border-box",
};
const stepBtn = {
  width: 40,
  height: 40,
  flexShrink: 0,
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: 10,
  color: "#F0F0F0",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
};
const pill = { padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 900, color: "#fff", letterSpacing: 1 };
