// The Instagram account a claim should be handed to. Needs an @ or an
// instagram.com link — a bare word or phone number could be anyone's
// account. The details box is where the form asks for it; contact second.
const IG = /^@([a-z0-9_.]{1,30})$/i;
const IG_URL = /instagram\.com\/([a-z0-9_.]{1,30})/i;
export function claimHandle(row) {
  if (!row || row.kind !== "claim") return null;
  for (const text of [row.details, row.contact]) {
    const t = (text || "").trim();
    const m = t.match(IG) || t.match(IG_URL);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
