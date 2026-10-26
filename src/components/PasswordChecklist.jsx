import { passwordChecks, PASSWORD_MIN, PASSWORD_KINDS_NEEDED } from "../lib/passwordRules.js";

// Live checklist under a new-password field: length, then 3 of the 4 kinds.
export default function PasswordChecklist({ password }) {
  if (!password) return null;
  const c = passwordChecks(password);
  const row = (ok, text) => (
    <div key={text} style={{ color: ok ? "#34D399" : "#888" }}>
      {ok ? "✓" : "○"} {text}
    </div>
  );
  return (
    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, fontFamily: "'Barlow', sans-serif" }}>
      {row(c.length && !c.tooLong, `At least ${PASSWORD_MIN} characters`)}
      {row(c.kindsMet >= PASSWORD_KINDS_NEEDED, `${PASSWORD_KINDS_NEEDED} of these 4 (${c.kindsMet} so far):`)}
      <div style={{ paddingLeft: 16 }}>{c.kinds.map((k) => row(k.ok, k.label))}</div>
    </div>
  );
}
