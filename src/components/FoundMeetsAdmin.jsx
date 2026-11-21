import { useEffect, useState } from "react";
import { loadFoundMeets, addFoundMeet, dismissFoundMeet, whenLabel } from "../lib/foundMeets.js";
import { muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

const VIBES = ["JDM", "Euro", "Exotic", "Domestic", "Truck"];
const KIND = { meet: "🚗 Meet", show: "🏆 Car show", cruise: "🛣️ Cruise", track: "🏁 Track day", other: "📍 Event" };

// Settings → Admin → Found meets (125_found_meets.sql): meets and shows the
// daily finder found on public event sites. ADD lists one (credited to its
// source and host); DISMISS hides it. "Maybe already on TUNR" ones are shown
// last, in case the match was wrong.
export default function FoundMeetsAdmin({ onToast, onOpenLink }) {
  const [list, setList] = useState(null);
  const [vibes, setVibes] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const refresh = () =>
    loadFoundMeets()
      .then(setList)
      .catch((e) => (setList([]), setError(e.message)));
  useEffect(() => {
    refresh();
  }, []);

  const act = async (id, fn) => {
    setBusy(id);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const fresh = (list || []).filter((f) => f.status === "new");
  const maybe = (list || []).filter((f) => f.status === "duplicate");

  const card = (f) => (
    <div key={f.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--n-1e1e1e)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--n-888888)", letterSpacing: 0.6 }}>{KIND[f.kind] || KIND.other}</div>
      <div style={{ fontSize: 17, fontWeight: 900 }}>{f.title}</div>
      <div style={{ ...muted, color: "var(--n-cccccc)" }}>
        {whenLabel(f.starts_local)}
        {f.ends_local ? ` to ${whenLabel(f.ends_local).split(" · ")[1]}` : ""}
      </div>
      <div style={muted}>
        📍 {f.location}
        {f.city && !f.location.includes(f.city.split(",")[0]) ? `, ${f.city}` : ""}
      </div>
      {(f.host || f.instagram) && (
        <div style={muted}>
          Host: {f.host || ""}
          {f.instagram ? ` @${f.instagram}` : ""}
        </div>
      )}
      {f.details && <div style={{ ...muted, fontSize: 12.5 }}>{f.details}</div>}
      <a href={f.source_url} target="_blank" rel="noreferrer noopener" style={{ ...muted, color: "var(--a-3cabfd)", fontWeight: 700, wordBreak: "break-all" }}>
        Source: {f.source_name || new URL(f.source_url).hostname} ↗
      </a>
      {f.status === "duplicate" && f.event_id && (
        <button onClick={() => onOpenLink?.(`meet:${f.event_id}`)} style={{ display: "block", background: "none", border: "none", padding: "4px 0", color: "#FACC15", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          Maybe already on TUNR: see that meet ›
        </button>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
        <select style={{ ...field, width: 100 }} value={vibes[f.id] || "JDM"} onChange={(e) => setVibes((v) => ({ ...v, [f.id]: e.target.value }))} aria-label="Vibe">
          {VIBES.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <button
          disabled={busy !== null}
          onClick={() =>
            act(f.id, async () => {
              const r = await addFoundMeet(f, vibes[f.id] || "JDM");
              onToast?.(r.pinned ? `Added “${f.title}”` : `Added “${f.title}”. Couldn't find the spot on the map; edit the meet to pin it.`);
            })
          }
          style={{ ...bigButton, marginTop: 0, flex: 1 }}
        >
          {busy === f.id ? "ADDING…" : "ADD TO TUNR"}
        </button>
        <button disabled={busy !== null} onClick={() => act(f.id, () => dismissFoundMeet(f.id))} style={{ ...quietButton, marginTop: 0, width: 90 }}>
          DISMISS
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={muted}>Every morning TUNR searches public event sites for Georgia car meets and shows. Check each one (open the source), then add the good ones. Nothing shows in the app until you add it.</div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      {list === null && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}
      {list?.length === 0 && !error && <div style={{ ...muted, marginTop: 12 }}>Nothing waiting. New finds show up here after the morning search.</div>}
      {fresh.length > 0 && <div style={{ ...label, marginTop: 14 }}>NEW ({fresh.length})</div>}
      {fresh.map(card)}
      {maybe.length > 0 && <div style={{ ...label, marginTop: 18 }}>MAYBE ALREADY ON TUNR ({maybe.length})</div>}
      {maybe.map(card)}
    </div>
  );
}
