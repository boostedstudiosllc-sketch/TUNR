import { useEffect, useState } from "react";
import { loadComebackAdmin, saveComebackSettings } from "../lib/comeback.js";
import { muted, label, field, bigButton } from "./Sheet.jsx";
import LoadError from "./LoadError.jsx";

// Settings → Admin → Comeback nudges: on/off, points per step, last 30 days.
export default function ComebackAdmin({ onToast }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    setError("");
    return loadComebackAdmin()
      .then((d) => {
        setData(d);
        setForm({ ...d.settings });
      })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setBusy(true);
    try {
      await saveComebackSettings(form);
      onToast("Saved");
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const s = data?.stats || {};
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div>
      <div style={muted}>
        Members who haven't opened TUNR in a while get one alert per step (3, 7, 14 and 30 days away), at a random time in the afternoon: meets near them, new parts for their car, or what's new. From 7 days on it comes with bonus points to claim within 48 hours. Members can turn it off in Alerts.
      </div>
      <LoadError message={error} onRetry={refresh} />
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
          {[
            ["SENT", s.sent ?? 0],
            ["CAME BACK", s.came_back ?? 0],
            ["CLAIMED", s.claimed ?? 0],
            ["POINTS PAID", s.points_paid ?? 0],
            ["WITH POINTS", s.with_points ?? 0],
            ["WAITING", s.waiting ?? 0],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "var(--n-141414)", border: "1px solid var(--n-222222)", borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ ...label, marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {form && (
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontFamily: "'Barlow', sans-serif", fontSize: 14 }}>
            <input type="checkbox" checked={form.comeback_on !== false} onChange={(e) => setForm((f) => ({ ...f, comeback_on: e.target.checked }))} />
            Send comeback nudges
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {[
              ["comeback_points_7", "7 DAYS AWAY"],
              ["comeback_points_14", "14 DAYS"],
              ["comeback_points_30", "30 DAYS"],
            ].map(([k, l]) => (
              <div key={k}>
                <div style={label}>{l}</div>
                <input style={field} inputMode="numeric" value={form[k] ?? ""} onChange={set(k)} aria-label={`Points at ${l.toLowerCase()}`} />
              </div>
            ))}
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>Points, 0 to 100. 0 sends the nudge without points.</div>
          <button disabled={busy} onClick={save} style={{ ...bigButton, marginTop: 14 }}>
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </>
      )}
    </div>
  );
}
