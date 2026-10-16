import { useState } from "react";
import { LINKUP_RULES } from "../lib/linkupRules.js";
import { acceptLinkupTerms } from "../lib/linkups.js";
import Sheet, { sheetTitle, muted, bigButton } from "./Sheet.jsx";

// Asked once, before someone first posts or joins a linkup. The database
// refuses both until this is saved, so it can't be skipped.
export default function LinkupTerms({ onAgreed, onClose, onShowTerms }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function agree() {
    setBusy(true);
    setError("");
    try {
      await acceptLinkupTerms();
      onAgreed();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} label="Linkup rules" zIndex={290}>
      <div style={sheetTitle}>BEFORE YOUR FIRST LINKUP</div>
      <div style={{ ...muted, marginTop: 4 }}>Linkups are real people meeting up. The ground rules:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {LINKUP_RULES.map(([title, text]) => (
          <div key={title} style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: "9px 12px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div>
            <div style={{ ...muted, fontSize: 12.5 }}>{text}</div>
          </div>
        ))}
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ accentColor: "#FF4500", width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
        />
        <span style={{ ...muted, color: "#CCC" }}>
          I'm 18 or older, I agree to these rules and the{" "}
          <button
            type="button"
            onClick={onShowTerms}
            style={{ background: "none", border: "none", padding: 0, color: "#FF7A00", fontWeight: 700, cursor: "pointer", font: "inherit" }}
          >
            Terms of Service
          </button>
          , and I understand I go to any linkup at my own risk.
        </span>
      </label>
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      <button disabled={!checked || busy} onClick={agree} style={{ ...bigButton, marginTop: 14, opacity: checked ? 1 : 0.4 }}>
        {busy ? "SAVING…" : "I AGREE"}
      </button>
    </Sheet>
  );
}
