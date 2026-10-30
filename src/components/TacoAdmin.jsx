import { useEffect, useState } from "react";
import { muted, label, field, quietButton } from "./Sheet.jsx";
import { loadTacoPicks, saveTacoPick, setTacoResult, deleteTacoPick, nextTuesday, lineText } from "../lib/taco.js";

// Admin → Points: Taco Tuesday. Without anything here, each Tuesday's pick
// is made automatically from the biggest meet coming up and settles itself.
// Set your own question for a coming Tuesday, and enter its result after.

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export default function TacoAdmin({ onToast }) {
  const [picks, setPicks] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ day: nextTuesday(today()), question: "", line: "", taco_line: "" });
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    loadTacoPicks()
      .then((p) => (setPicks(p), setError("")))
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      onToast(done);
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (draft.day <= today()) return onToast("Pick a coming Tuesday (today's may already have picks).");
    if (new Date(`${draft.day}T12:00:00Z`).getUTCDay() !== 2) return onToast("That date isn't a Tuesday.");
    if (draft.question.trim().length < 5) return onToast("Write the question.");
    if (!(Number(draft.taco_line) >= 0) || !(Number(draft.line) >= 0) || draft.line === "" || draft.taco_line === "") return onToast("Fill in both lines (numbers).");
    run(() => saveTacoPick(draft), "Taco Tuesday pick saved").then(() => setDraft((d) => ({ ...d, question: "", line: "", taco_line: "" })));
  };

  return (
    <div>
      <div style={{ ...muted, fontSize: 12.5 }}>
        Every Tuesday a free MORE / LESS pick is made by itself from the biggest meet coming up (how many going when it starts) and pays the
        right picks once the meet starts. To ask your own question instead, set it below for a coming Tuesday and enter the result afterwards.
        Use half points for lines (like 29.5) so nobody ties.
      </div>
      {error && <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>{error}</div>}

      <div style={{ marginTop: 10, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={label}>TUESDAY</div>
        <input type="date" style={field} value={draft.day} onChange={(e) => setDraft((d) => ({ ...d, day: e.target.value }))} />
        <div style={{ ...label, marginTop: 10 }}>QUESTION</div>
        <input style={field} maxLength={200} placeholder="How many cars at Cars & Coffee Saturday?" value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} />
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={label}>USUAL LINE</div>
            <input style={field} inputMode="decimal" placeholder="40.5" value={draft.line} onChange={(e) => setDraft((d) => ({ ...d, line: e.target.value.replace(/[^\d.]/g, "") }))} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>🌮 TACO LINE</div>
            <input style={field} inputMode="decimal" placeholder="29.5" value={draft.taco_line} onChange={(e) => setDraft((d) => ({ ...d, taco_line: e.target.value.replace(/[^\d.]/g, "") }))} />
          </div>
        </div>
        <button disabled={busy} onClick={save} style={{ ...quietButton, marginTop: 10 }}>
          SAVE PICK
        </button>
      </div>

      {(picks || []).map((p) => (
        <div key={p.id} style={{ marginTop: 10, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "var(--n-888888)", fontWeight: 700 }}>
            {p.day} · {p.stat === "going" ? "automatic" : "yours"} · line {lineText(p.line)} → 🌮 {lineText(p.taco_line)}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 4 }}>{p.question}</div>
          <div style={{ ...muted, fontSize: 12.5, marginTop: 4 }}>
            {p.settled_at ? `Settled: finished at ${p.result == null ? "– (called off)" : lineText(p.result)}.` : p.result != null ? `Result ${lineText(p.result)}; pays out next time anyone opens Perks.` : p.stat === "going" ? "Settles itself when the meet starts." : "Waiting on your result."}
          </div>
          {p.stat === "manual" && !p.settled_at && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={{ ...field, flex: 1 }} inputMode="decimal" placeholder="Result" value={results[p.id] ?? ""} onChange={(e) => setResults((r) => ({ ...r, [p.id]: e.target.value.replace(/[^\d.]/g, "") }))} />
              <button disabled={busy || !results[p.id]} onClick={() => run(() => setTacoResult(p.id, results[p.id]), "Result saved")} style={{ ...quietButton, flex: 1 }}>
                SAVE RESULT
              </button>
            </div>
          )}
          {p.day > today() && (
            <button disabled={busy} onClick={() => run(() => deleteTacoPick(p.id), "Pick deleted")} style={{ ...quietButton, marginTop: 8, color: "var(--a-f87171)" }}>
              DELETE
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
