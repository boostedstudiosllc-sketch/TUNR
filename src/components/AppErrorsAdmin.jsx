import { useEffect, useState } from "react";
import { loadAppErrors, clearAppErrors } from "../lib/appErrors.js";
import { muted, label, quietButton, Chip } from "./Sheet.jsx";
import LoadError from "./LoadError.jsx";

// Settings → Admin → App errors: what members were shown ("Couldn't follow
// @atl. (you don't have access to that)") next to what actually happened
// ("permission denied for table follows"), how often and to whom.
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export default function AppErrorsAdmin({ onToast }) {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function refresh() {
    setError("");
    return loadAppErrors(days)
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    refresh();
  }, [days]);

  async function clear(detail) {
    if (!detail && !window.confirm("Clear the whole error log?")) return;
    setBusy(detail || "all");
    try {
      const n = await clearAppErrors(detail);
      onToast(`Cleared ${n} ${n === 1 ? "entry" : "entries"}`);
      await refresh();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div style={{ ...muted }}>What members were told, and the technical reason behind it. Members never see the technical part. Kept 30 days.</div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {[1, 7, 30].map((d) => (
          <Chip key={d} active={days === d} onClick={() => setDays(d)}>
            {d === 1 ? "TODAY" : `${d} DAYS`}
          </Chip>
        ))}
      </div>
      <LoadError message={error} onRetry={refresh} />
      {rows === null && !error && <div style={{ ...muted, marginTop: 12 }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ ...muted, marginTop: 12 }}>No errors. 🎉</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {(rows || []).map((r) => (
          <div key={r.detail} style={{ background: "var(--n-141414)", border: "1px solid var(--n-222222)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'Barlow', sans-serif" }}>{r.shown || "(no message)"}</div>
            <div style={{ ...label, marginTop: 8, marginBottom: 2 }}>TECHNICAL</div>
            <div style={{ fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace", color: "var(--a-f87171)", wordBreak: "break-word" }}>{r.detail}</div>
            <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>
              {r.times}× · {r.people} {Number(r.people) === 1 ? "person" : "people"}
              {r.usernames?.length ? ` (${r.usernames.slice(0, 5).map((u) => `@${u}`).join(", ")}${r.usernames.length > 5 ? "…" : ""})` : ""} · last {ago(r.last_at)}
              {r.page ? ` · ${r.page}` : ""}
            </div>
            {r.agent && <div style={{ ...muted, fontSize: 11, marginTop: 2, wordBreak: "break-word" }}>{r.agent}</div>}
            <button disabled={Boolean(busy)} onClick={() => clear(r.detail)} style={{ ...quietButton, marginTop: 8, padding: "7px 0", fontSize: 12 }}>
              {busy === r.detail ? "CLEARING…" : "FIXED · CLEAR"}
            </button>
          </div>
        ))}
      </div>
      {rows?.length > 0 && (
        <button disabled={Boolean(busy)} onClick={() => clear(null)} style={{ ...quietButton, marginTop: 14 }}>
          {busy === "all" ? "CLEARING…" : "CLEAR ALL"}
        </button>
      )}
    </div>
  );
}
