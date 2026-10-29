import { useEffect, useState } from "react";
import { loadCarPuzzles, addCarPuzzle, updateCarPuzzle, deleteCarPuzzle } from "../lib/guessCar.js";
import { uploadVehiclePhoto } from "../lib/store.js";
import { muted, field, label, bigButton, quietButton } from "./Sheet.jsx";

// Settings → Admin → Guess the Car: the car photos the game picks from
// (members' public build cars with photos are in the game too). Use photos
// you took or have the rights to, and credit the photographer.

export default function GuessCarAdmin({ user, onToast }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ make: "", model: "", year: "", credit: "", file: null });
  const [busy, setBusy] = useState(false);

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

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div>
      <div style={{ ...muted }}>
        The game shows one car a day from these photos plus members' cars that have a photo and a public build page. Use photos you took or have permission to use, and credit whoever shot them. The answer is the make and model exactly as you type them.
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
        <div role="alert" style={{ ...muted, color: "#F87171", marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ ...label, marginTop: 18 }}>PHOTOS ({rows?.length ?? "…"})</div>
      {rows?.length === 0 && <div style={muted}>None yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(rows || []).map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, borderRadius: 12, background: "#141414", border: "1px solid #232323", opacity: r.active ? 1 : 0.55 }}>
            <img src={r.photo_url} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 15 }}>
                {r.year ? `${r.year} ` : ""}
                {r.make} {r.model}
              </div>
              <div style={{ ...muted, fontSize: 12 }}>{r.credit || "No credit"}</div>
            </div>
            <button onClick={() => act(() => updateCarPuzzle(r.id, { active: !r.active }), r.active ? "Taken out of the game" : "Back in the game")} style={{ ...quietButton, padding: "7px 10px", fontSize: 12 }}>
              {r.active ? "HIDE" : "SHOW"}
            </button>
            <button
              onClick={() => window.confirm(`Remove the ${r.make} ${r.model}?`) && act(() => deleteCarPuzzle(r.id), "Removed")}
              aria-label={`Remove the ${r.make} ${r.model}`}
              style={{ ...quietButton, padding: "7px 10px", fontSize: 12, color: "#F87171" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
