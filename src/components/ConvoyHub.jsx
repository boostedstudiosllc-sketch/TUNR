import { useEffect, useState } from "react";
import { startConvoy, joinConvoy, myConvoys, openConvoy } from "../lib/convoy.js";
import { cleanConvoyCode } from "../lib/convoyMath.js";
import Sheet, { sheetTitle, muted, label, field, bigButton, quietButton } from "./Sheet.jsx";

// Start a convoy, join one with its code, or reopen one you're in.
// (From the Linkups tab; a linkup's own convoy starts from LinkupDetail.)
export default function ConvoyHub({ onClose }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    myConvoys()
      .then(setMine)
      .catch((e) => setError(e.message));
  }, []);

  const go = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const { id } = await fn();
      openConvoy(id);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="Convoy">
      <div style={sheetTitle}>🚗 CONVOY</div>
      <div style={{ ...muted, marginTop: 4 }}>Drive together and see everyone in the group on the map, live. Only people in the convoy see where you are, and only while you share.</div>

      {mine.length > 0 && (
        <>
          <div style={{ ...label, marginTop: 14 }}>YOU'RE IN</div>
          {mine.map((c) => (
            <button key={c.id} onClick={() => (openConvoy(c.id), onClose())} style={{ ...quietButton, marginTop: 6, display: "flex", justifyContent: "space-between", padding: "12px 14px" }}>
              <span>🚗 {c.name}</span>
              <span style={{ letterSpacing: 2 }}>{c.code} ›</span>
            </button>
          ))}
        </>
      )}

      <div style={{ ...label, marginTop: 16 }}>START ONE</div>
      <input style={field} maxLength={40} placeholder="Name it (optional): Sunday mountain run" value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={busy} onClick={() => go(() => startConvoy(name))} style={{ ...bigButton, marginTop: 8 }}>
        🚗 START A CONVOY
      </button>

      <div style={{ ...label, marginTop: 16 }}>JOIN WITH A CODE</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(() => joinConvoy(code));
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          style={{ ...field, flex: 1, letterSpacing: 4, fontWeight: 800, textTransform: "uppercase" }}
          placeholder="ABC123"
          aria-label="Convoy code"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(cleanConvoyCode(e.target.value))}
        />
        <button type="submit" disabled={busy || code.length !== 6} style={{ ...bigButton, width: 100, marginTop: 0 }}>
          JOIN
        </button>
      </form>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 8 }}>
          {error}
        </div>
      )}
      <div style={{ ...muted, fontSize: 12, marginTop: 12 }}>Mount your phone and let a passenger run the app. A convoy ends by itself after 6 hours.</div>
    </Sheet>
  );
}
