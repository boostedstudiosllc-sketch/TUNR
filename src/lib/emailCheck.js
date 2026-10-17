// Catching mistyped and throwaway email addresses at sign-up, before an
// account is made that can never be confirmed (and would be deleted a week
// later). "karan@gmial.con" → "Did you mean karan@gmail.com?".

// Real addresses at these are fine as typed.
const KNOWN = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "hotmail.co.uk", "outlook.co.uk", "live.co.uk", "hotmail.ca", "live.ca", "hotmail.fr", "outlook.fr",
  "yahoo.com", "ymail.com", "rocketmail.com", "yahoo.co.uk", "yahoo.ca",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me", "pm.me",
  "comcast.net", "att.net", "sbcglobal.net", "bellsouth.net", "verizon.net", "charter.net", "cox.net",
  "gmx.com", "zoho.com", "mail.com", "email.com", "yandex.com", "tutanota.com", "fastmail.com",
]);

// Big providers whose names get mistyped. Close misspellings of these are
// blocked with a suggestion; short ones (aol, live, msn, me) are only
// checked for a wrong ending, since lots of real domains are one letter off.
const PROVIDERS = ["gmail", "googlemail", "hotmail", "outlook", "yahoo", "icloud", "protonmail"];
const SHORT_PROVIDERS = ["aol", "live", "msn", "ymail", "comcast", "verizon", "sbcglobal", "bellsouth"];

// Endings that are almost always ".com" with a slip of the finger.
const TLD_TYPOS = new Set(["con", "cmo", "ocm", "vom", "xom", "comm", "cim", "clm", "cpm", "coom", "comn", "ccom", "cpom", "cokm", "co,", "c0m"]);

// Throwaway inboxes: anyone can read them, so they can't confirm anything.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "grr.la",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "tempmail.net", "tempmailo.com", "tempail.com", "tempr.email", "tmpmail.org", "tmpmail.net",
  "yopmail.com", "yopmail.fr", "trashmail.com", "trashmail.de", "getnada.com", "nada.email",
  "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mintemail.com",
  "mohmal.com", "emailondeck.com", "discard.email", "spamgourmet.com", "mailnesia.com",
  "mytemp.email", "burnermail.io", "moakt.com", "mailcatch.com", "getairmail.com",
  "inboxkitten.com", "spambox.us", "mailpoof.com", "emailfake.com", "crazymailing.com",
]);

// Edits between two short strings, counting a swapped pair as one.
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// { ok: true } or { ok: false, message, suggestion? } — suggestion is the
// whole corrected address.
export function checkEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Enter your email address." };
  if (/\s/.test(email)) return { ok: false, message: "Email addresses can't have spaces in them." };
  const at = email.split("@");
  if (at.length !== 2 || !at[0] || !at[1]) return { ok: false, message: "That doesn't look like an email address — it needs one @." };
  const [local, domain] = at;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, message: "The part before the @ has a character email addresses can't use." };
  }
  if (!domain.includes(".")) {
    const fix = PROVIDERS.concat(SHORT_PROVIDERS).find((p) => domain === p + "com" || domain === p);
    return fix
      ? { ok: false, message: `That's missing a dot. Did you mean ${local}@${fix}.com?`, suggestion: `${local}@${fix}.com` }
      : { ok: false, message: "The part after the @ is missing its ending, like .com." };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || domain.split(".").some((p) => !p || p.startsWith("-") || p.endsWith("-"))) {
    return { ok: false, message: "The part after the @ isn't a valid web address." };
  }
  if (KNOWN.has(domain)) return { ok: true };
  if (DISPOSABLE.has(domain)) {
    return { ok: false, message: "Throwaway email addresses can't be used on TUNR. Use an email you'll keep — you'll need it to confirm your account." };
  }

  const labels = domain.split(".");
  const name = labels[0];
  const tld = labels[labels.length - 1];
  const suggest = (d) => ({
    ok: false,
    message: `Check the spelling — did you mean ${local}@${d}?`,
    suggestion: `${local}@${d}`,
  });

  // gmial.com, gmail.con, hotmial.co, outlok.com …
  const close = PROVIDERS.find((p) => name === p || (Math.abs(name.length - p.length) <= 2 && editDistance(name, p) <= 2));
  if (close) return suggest(`${close}.com`);
  // aol.con, live.cm, comcast.met …
  if (SHORT_PROVIDERS.includes(name)) return suggest(`${name}.${name === "comcast" || name === "verizon" || name === "sbcglobal" || name === "bellsouth" ? "net" : "com"}`);
  // anything.con
  if (TLD_TYPOS.has(tld)) return suggest([...labels.slice(0, -1), "com"].join("."));
  return { ok: true };
}

// Whether the domain exists at all, asked of Google's public DNS. Only a
// definite "no such domain" fails; if the lookup itself fails we let it
// through rather than block someone over our own hiccup.
export async function domainExists(email, { fetchImpl = fetch } = {}) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain || KNOWN.has(domain)) return true;
  try {
    const res = await fetchImpl(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    if (!res.ok) return true;
    const body = await res.json();
    return body.Status !== 3; // 3 = NXDOMAIN
  } catch (e) {
    console.warn("domain check skipped:", e?.message);
    return true;
  }
}
