import { useState } from "react";
import { updatePassword } from "../lib/store.js";
import { passwordProblem } from "../lib/passwordRules.js";
import PasswordChecklist from "./PasswordChecklist.jsx";
import Sheet, { sheetTitle, muted, label, field, bigButton } from "./Sheet.jsx";

// Choosing a new password: from Settings while signed in, or after tapping a
// password-reset link (which signs you in and lands here).
export function SetPasswordForm({ onDone, onToast }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    if (password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await updatePassword(password);
      onToast("🔑 Password changed");
      setPassword("");
      setAgain("");
      onDone && onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={label}>NEW PASSWORD</div>
      <input style={field} type="password" autoComplete="new-password" placeholder="8+ characters, mix it up" value={password} onChange={(e) => setPassword(e.target.value)} />
      <PasswordChecklist password={password} />
      <div style={{ ...muted, fontSize: 11.5, marginTop: 4 }}>It can't be one of your last 24 passwords. Passwords never expire.</div>
      <div style={{ ...label, marginTop: 12 }}>TYPE IT AGAIN</div>
      <input
        style={field}
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      {error && <div style={{ ...muted, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      <button disabled={busy} onClick={save} style={{ ...bigButton, marginTop: 14 }}>
        {busy ? "SAVING…" : "SAVE NEW PASSWORD"}
      </button>
    </div>
  );
}

export default function SetPasswordSheet({ onClose, onToast }) {
  return (
    <Sheet onClose={onClose} label="Set a new password" zIndex={320}>
      <div style={sheetTitle}>SET A NEW PASSWORD</div>
      <div style={{ ...muted, marginTop: 2, marginBottom: 14 }}>You opened a password reset link. Choose your new password.</div>
      <SetPasswordForm onDone={onClose} onToast={onToast} />
    </Sheet>
  );
}
