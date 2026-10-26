// TUNR's password policy, shared by the app and the server (api/password.js,
// api/sign-in.js). No imports, so both can use it.
//
//   * at least 8 characters (72 at most: longer ones can't be stored safely)
//   * at least 3 of the 4 kinds: uppercase, lowercase, number, symbol
//   * can't reuse any of your last 24 passwords (checked by the server)
//   * 10 wrong tries in a row locks the account for 30 minutes
//   * passwords never expire

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_KINDS_NEEDED = 3;
export const PASSWORD_HISTORY = 24;
export const LOCKOUT_TRIES = 10;
export const LOCKOUT_MINUTES = 30;

const KINDS = [
  { id: "upper", label: "an uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "a lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "a number", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "a symbol (like ! ? # $)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// What's in a password so far, for the checklist under the field.
export function passwordChecks(password = "") {
  const kinds = KINDS.map((k) => ({ id: k.id, label: k.label, ok: k.test(password) }));
  return {
    length: password.length >= PASSWORD_MIN,
    tooLong: password.length > PASSWORD_MAX,
    kinds,
    kindsMet: kinds.filter((k) => k.ok).length,
  };
}

// null when the password meets the policy; otherwise what's wrong, in
// plain words.
export function passwordProblem(password = "") {
  const c = passwordChecks(password);
  if (c.tooLong) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (!c.length) return `Use at least ${PASSWORD_MIN} characters.`;
  if (c.kindsMet < PASSWORD_KINDS_NEEDED) {
    const missing = c.kinds.filter((k) => !k.ok).map((k) => k.label);
    return `Mix in ${PASSWORD_KINDS_NEEDED - c.kindsMet} more of these: ${missing.join(", ")}. Passwords need 3 of the 4 kinds (uppercase, lowercase, number, symbol).`;
  }
  return null;
}
