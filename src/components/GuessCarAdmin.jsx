import { useEffect, useRef, useState } from "react";
import { loadCarPuzzles, addCarPuzzle, updateCarPuzzle, deleteCarPuzzle } from "../lib/guessCar.js";
import { uploadVehiclePhoto } from "../lib/store.js";
import { CAR_LIST, findCarPhoto } from "../lib/wikimediaCars.js";
import { muted, field, label, bigButton, quietButton } from "./Sheet.jsx";

// Settings → Admin → Guess the Car: the car photos the game picks from
// (members' public build cars with photos are in the game too). Use photos
// you took or have the rights to, and credit the photographer.

export default function GuessCarAdmin({ user, onToast }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ make: "", model: "", year: "", credit: "", file: null });
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(null); // { done, total, added, none, failed, finished }
  const stop = useRef(false);

  const load = () =>
    loadCarPuzzles()
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.file) return setError("Pick a photo of the car.");
    if (!form.make.trim() || !form.model.trim()) return setError("Add the make and the model.");
    setBusy(true);
    setError("");
    try {
      const photo_url = await uploadVehiclePhoto(form.file, user.id);
      await addCarPuzzle({ photo_url, make: form.make.trim(), model: form.model.trim(), year: form.year ? Number(form.year) : null, credit: form.credit.trim() || null });
      setForm({ make: "", model: "", year: "", credit: "", file: null });
      e.target.reset();
      onToast?.("Car added to Guess the Car");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn, done) {
    setError("");
    try {
      await fn();
      if (done) onToast?.(done);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Cars from the list that aren't in yet.
  const have = new Set((rows || []).map((r) => `${r.make} ${r.model}`.toLowerCase()));
  const missing = CAR_LIST.filter(([make, model]) => !have.has(`${make} ${model}`.toLowerCase()));

  async function importAll() {
    setError("");
    stop.current = false;
    const run = { done: 0, total: missing.length, added: 0, none: [], failed: [] };
    setImporting({ ...run });
    for (const [make, model, words] of missing) {
      if (stop.current) break;
      try {
        const photo = await findCarPhoto(words);
        if (photo) {
          await addCarPuzzle({ make, model, ...photo });
          run.added += 1;
        } else run.none.push(`${make} ${model}`);
      } catch (e) {
        run.failed.push(`${make} ${model} (${e.message})`);
        // Commons asked us to slow down: stop rather than hammer it.
        if (/429|ratelimit/i.test(e.message)) {
          setError(`Wikimedia asked to slow down, so the import stopped. Try again in a few minutes. (${e.message})`);
          break;
        }
      }
      run.done += 1;
      setImporting({ ...run });
      await new Promise((ok) => setTimeout(ok, 350));
    }
    setImporting({ ...run, finished: true });
    if (run.added) onToast?.(`Added ${run.added} cars from Wikimedia`);
    load();
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div>
      <div style={{ ...muted }}>
        The game shows one car a day from these photos plus members' cars that have a photo and a public build page. Use photos you took or have permission to use, and credit whoever shot them. The answer is the make and model exactly as you type them.
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "var(--n-101820)", border: "1px solid #1E3A5F" }}>
        <div style={label}>IMPORT FROM WIKIMEDIA COMMONS</div>
        <div style={{ ...muted, fontSize: 12.5 }}>
          Finds one free-to-use photo for each of {CAR_LIST.length} popular cars and adds it with the photographer's credit and licence (shown in the game, as the licences require). Takes a couple of minutes. Check the list after and hide any odd picks.
        </div>
        {importing && (
          <div role="status" style={{ ...muted, marginTop: 8, color: "var(--n-cbd5e1)" }}>
            {importing.finished ? "Done" : "Finding photos…"} {importing.done}/{importing.total} · {importing.added} added
            {importing.none.length ? ` · ${importing.none.length} with no good photo` : ""}
            {importing.failed.length ? ` · ${importing.failed.length} failed` : ""}
            {importing.finished && importing.none.length > 0 && <div style={{ fontSize: 12 }}>No good photo: {importing.none.join(", ")}</div>}
            {importing.finished && importing.failed.length > 0 && <div style={{ fontSize: 12, color: "var(--a-f87171)" }}>Failed: {importing.failed.join("; ")}</div>}
          </div>
        )}
        {importing && !importing.finished ? (
          <button onClick={() => (stop.current = true)} style={{ ...quietButton, width: "100%", marginTop: 8, padding: "11px 0" }}>
            STOP
          </button>
        ) : (
          <button onClick={importAll} disabled={!rows || !missing.length} style={{ ...bigButton, marginTop: 8, opacity: !rows || !missing.length ? 0.5 : 1 }}>
            {missing.length ? `IMPORT ${missing.length} CARS` : "ALL LIST CARS ARE IN"}
          </button>
        )}
      </div>
      <form onSubmit={add} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={label}>ADD A CAR</div>
        <input type="file" accept="image/*" aria-label="Car photo" onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))} style={{ ...field, padding: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={field} placeholder="Make (Nissan)" aria-label="Make" maxLength={30} value={form.make} onChange={set("make")} />
          <input style={field} placeholder="Model (GT-R)" aria-label="Model" maxLength={40} value={form.model} onChange={set("model")} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...field, width: 110 }} placeholder="Year" aria-label="Year" inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value.replace(/\D/g, "") }))} />
          <input style={field} placeholder="Photo credit (Shot by @name)" aria-label="Photo credit" maxLength={80} value={form.credit} onChange={set("credit")} />
        </div>
        <button type="submit" disabled={busy} style={{ ...bigButton, opacity: busy ? 0.6 : 1 }}>
          {busy ? "ADDING…" : "+ ADD CAR"}
        </button>
      </form>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ ...label, marginTop: 18 }}>PHOTOS ({rows?.length ?? "…"})</div>
      {rows?.length === 0 && <div style={muted}>None yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(rows || []).map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, borderRadius: 12, background: "var(--n-141414)", border: "1px solid var(--n-232323)", opacity: r.active ? 1 : 0.55 }}>
            <img src={r.photo_url} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>
                {r.year ? `${r.year} ` : ""}
                {r.make} {r.model}
              </div>
              <div style={{ ...muted, fontSize: 12 }}>
                {r.source_url ? (
                  <a href={r.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--a-93c5fd)" }}>
                    {r.credit || "Source"}
                  </a>
                ) : (
                  r.credit || "No credit"
                )}
              </div>
            </div>
            <button onClick={() => act(() => updateCarPuzzle(r.id, { active: !r.active }), r.active ? "Taken out of the game" : "Back in the game")} style={{ ...quietButton, padding: "7px 10px", fontSize: 12 }}>
              {r.active ? "HIDE" : "SHOW"}
            </button>
            <button
              onClick={() => window.confirm(`Remove the ${r.make} ${r.model}?`) && act(() => deleteCarPuzzle(r.id), "Removed")}
              aria-label={`Remove the ${r.make} ${r.model}`}
              style={{ ...quietButton, padding: "7px 10px", fontSize: 12, color: "var(--a-f87171)" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
