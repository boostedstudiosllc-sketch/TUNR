import { useEffect, useState } from "react";
import { DEFAULT_LEVELS, LEVEL_IDS, loadGameSettings, saveGameSettings } from "../lib/rush.js";
import { LEVELS } from "./TunrRush.jsx";
import { muted, label, bigButton, quietButton } from "./Sheet.jsx";

const mph = (ms) => `${Math.round(ms * 2.237)} MPH`;
const secs = (v) => (v === 0 ? "off" : `${v} sec`);
const pct = (v) => `${Math.round(v * 100)}%`;

// Each level's settings: what it's called, its range and step, and how to
// show it. Ranges match game_level_ok() in 065_rush_difficulty.sql.
const FIELDS = [
  { key: "points", name: "Points", help: "For reaching the goal; 0 = no points", min: 0, max: 10, step: 1, show: (v) => `${v} pt${v === 1 ? "" : "s"}` },
  { key: "goal", name: "Goal", help: "Distance in one run", min: 300, max: 20000, step: 50, show: (v) => `${v.toLocaleString()} m` },
  { key: "startTime", name: "Starting clock", help: "Seconds at the start", min: 10, max: 180, step: 1, show: secs },
  { key: "clockSeconds", name: "⏱ pickup adds", min: 0, max: 10, step: 0.5, show: secs },
  { key: "clockChance", name: "How often ⏱ shows up", help: "Share of traffic rows with one", min: 0, max: 0.5, step: 0.02, show: pct },
  { key: "crashSeconds", name: "A crash costs", min: 0, max: 15, step: 0.5, show: secs },
  { key: "traffic", name: "Traffic", help: "100% is normal; higher = more cars", min: 0.5, max: 2.5, step: 0.05, show: pct },
  { key: "startSpeed", name: "Starting speed", min: 10, max: 120, step: 1, show: mph },
  { key: "ramp", name: "Speeds up", help: "Meters per +1 m/s; lower = speeds up quicker", min: 10, max: 200, step: 5, show: (v) => `every ${v} m` },
  { key: "topSpeed", name: "Top speed", min: 30, max: 130, step: 1, show: mph },
  { key: "boostSeconds", name: "Boost lasts", help: "The Boosted badge; off = no badges", min: 0, max: 10, step: 0.5, show: secs },
  { key: "boostChance", name: "How often the badge shows up", help: "Share of traffic rows with one", min: 0, max: 0.3, step: 0.01, show: pct },
  { key: "boostSpeed", name: "Boost speed", min: 30, max: 160, step: 1, show: mph },
];

const round = (v, step) => Math.round(v / step) * step;

// Settings → Admin → TUNR Rush: game on/off, tries a day, and each level's
// rules. Saved rules apply from each player's next run, and the server
// checks runs against them.
export default function RushAdmin({ onToast }) {
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("easy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadGameSettings()
      .then((r) => (setSaved(r), setDraft(r)))
      .catch((e) => setError(e.message));
  }, []);

  if (!draft) return <div style={{ ...muted, marginTop: 10 }}>{error || "Loading…"}</div>;

  const lvl = draft.levels[tab];
  const setLevel = (patch) => setDraft((d) => ({ ...d, levels: { ...d.levels, [tab]: { ...d.levels[tab], ...patch } } }));
  const nudge = (f, dir) => setLevel({ [f.key]: Math.min(f.max, Math.max(f.min, Number(round(lvl[f.key] + dir * f.step, f.step).toFixed(2)))) });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    for (const id of LEVEL_IDS) {
      const L = draft.levels[id];
      if (L.boostSpeed < L.topSpeed) return setError(`${LEVELS[id].name}: boost speed should be at least the top speed, or a boost slows you down.`);
    }
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
        Each day players pick Easy, Medium or Hard. Their first run locks it in until tomorrow, and they get a set number of
        tries to reach its goal. Changes apply from each player's next run.
      </div>

      <button
        onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
        aria-pressed={draft.enabled}
        style={{ ...row, width: "100%", cursor: "pointer", marginTop: 12, textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 900, fontSize: 15 }}>Game is {draft.enabled ? "on" : "parked"}</span>
          <span style={{ ...muted, fontSize: 12 }}>{draft.enabled ? "Anyone can play" : "Nobody can start a run"}</span>
        </span>
        <span style={{ ...pill, background: draft.enabled ? "#10B981" : "#333" }}>{draft.enabled ? "ON" : "OFF"}</span>
      </button>
      <Stepper
        name="Tries a day"
        help="At the level picked for the day; 0 = unlimited"
        value={draft.triesPerDay}
        show={(v) => (v === 0 ? "unlimited" : `${v}`)}
        changed={draft.triesPerDay !== saved.triesPerDay}
        onStep={(dir) => setDraft((d) => ({ ...d, triesPerDay: Math.min(10, Math.max(0, d.triesPerDay + dir)) }))}
        atMin={draft.triesPerDay <= 0}
        atMax={draft.triesPerDay >= 10}
      />

      <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
        {LEVEL_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...quietButton,
              flex: 1,
              padding: "10px 0",
              ...(tab === id ? { border: `1px solid ${LEVELS[id].color}`, color: LEVELS[id].color } : {}),
            }}
          >
            {LEVELS[id].name.toUpperCase()}
          </button>
        ))}
      </div>
      {FIELDS.map((f) => (
        <Stepper
          key={f.key}
          name={f.name}
          help={f.help}
          value={lvl[f.key]}
          show={f.show}
          changed={lvl[f.key] !== saved.levels[tab][f.key]}
          onStep={(dir) => nudge(f, dir)}
          atMin={lvl[f.key] <= f.min}
          atMax={lvl[f.key] >= f.max}
        />
      ))}
      <button onClick={() => setLevel(DEFAULT_LEVELS[tab])} style={{ ...quietButton, marginTop: 8 }}>
        RESET {LEVELS[tab].name.toUpperCase()} TO DEFAULTS
      </button>

      {error && <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 10 }}>{error}</div>}
      <button disabled={busy || !changed} onClick={save} style={{ ...bigButton, marginTop: 14, opacity: busy || !changed ? 0.5 : 1 }}>
        {busy ? "SAVING…" : changed ? "SAVE CHANGES" : "SAVED"}
      </button>
      <button disabled={!changed} onClick={() => setDraft(saved)} style={{ ...quietButton, marginTop: 8, opacity: changed ? 1 : 0.5 }}>
        UNDO CHANGES
      </button>
      {saved.updatedAt && (
        <div style={{ ...muted, fontSize: 11.5, marginTop: 10, textAlign: "center" }}>
          Last changed {new Date(saved.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

function Stepper({ name, help, value, show, changed, onStep, atMin, atMax }) {
  return (
    <div style={row}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 800, fontSize: 14.5 }}>{name}</span>
        {help && <span style={{ ...muted, fontSize: 11.5, lineHeight: 1.35, display: "block" }}>{help}</span>}
      </span>
      <button aria-label={`Less ${name}`} disabled={atMin} onClick={() => onStep(-1)} style={stepBtn}>
        −
      </button>
      <span style={{ width: 82, textAlign: "center", fontWeight: 900, color: changed ? "#3CABFD" : "#F0F0F0" }}>{show(value)}</span>
      <button aria-label={`More ${name}`} disabled={atMax} onClick={() => onStep(1)} style={stepBtn}>
        +
      </button>
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
