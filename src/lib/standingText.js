// Words for a member's standing (113_member_standing.sql), pure so it's
// tested in test/standing.test.js.

// "Member since October 2025"
export function memberSince(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Member since ${d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" })}`;
}

// The badge: "Top 5% · Atlanta" (or "· TUNR" when ranked across the app), or "".
export function standingLabel(st) {
  if (!st?.top) return "";
  return `Top ${st.top}% · ${st.area || "TUNR"}`;
}

// The line on the share card.
export function standingLine(st, name = null) {
  if (!st?.top) return "";
  const where = st.area && st.area !== "TUNR" ? `in ${st.area}` : "on TUNR";
  const who = name ? `@${name} is` : "You're";
  const praise = st.top <= 5 ? "one of its most active members" : "one of its regulars";
  return `${who} in the top ${st.top}% of the car scene ${where}: ${praise}!`;
}

// "#3 of 214 in Atlanta · last 12 months"
export function rankLine(st) {
  if (!st?.rank || !st?.of) return "";
  const where = st.area && st.area !== "TUNR" ? `in ${st.area}` : "on TUNR";
  return `#${st.rank.toLocaleString("en-US")} of ${st.of.toLocaleString("en-US")} ${where} · last 12 months`;
}

export const initials = (name = "") =>
  String(name)
    .replace(/^@/, "")
    .split(/[._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "T";
