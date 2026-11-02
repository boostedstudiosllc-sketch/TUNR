// Words for a member's standing (113_member_standing.sql), shown as a TUNR
// time slip: the printed slip a drag strip hands you after a pass. How active
// someone is becomes a racing class and a grid position, not a big
// percentage. Pure, so it's tested in test/standing.test.js.

// The classes, from the most active down (113's tiers: top 1 / 5 / 10 / 25 %).
export const CLASSES = [
  { top: 1, name: "PRO MOD", blurb: "the very top of the scene" },
  { top: 5, name: "PRO STOCK", blurb: "one of the scene's heavy hitters" },
  { top: 10, name: "SUPER STREET", blurb: "a regular you'll see at every meet" },
  { top: 25, name: "STREET", blurb: "out at the meets, making it count" },
];

export function classOf(st) {
  return CLASSES.find((c) => c.top === st?.top) || null;
}

const where = (st) => (st?.area && st.area !== "TUNR" ? `in ${st.area}` : "on TUNR");

// "Member since October 2025"
export function memberSince(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Member since ${d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" })}`;
}

// "10/2025", for the slip.
export function sinceShort(iso) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  const [m, y] = d.toLocaleDateString("en-US", { month: "2-digit", year: "numeric", timeZone: "America/New_York" }).split("/");
  return `${m}/${y}`;
}

// The profile tag: "PRO STOCK · Atlanta", or "".
export function standingLabel(st) {
  const c = classOf(st);
  return c ? `${c.name} · ${st.area || "TUNR"}` : "";
}

// "P9 of 214 in Atlanta"
export function positionLine(st) {
  if (!st?.rank || !st?.of) return "";
  return `P${st.rank.toLocaleString("en-US")} of ${st.of.toLocaleString("en-US")} ${where(st)}`;
}

// The sentence under the class.
export function classLine(st, name = null) {
  const c = classOf(st);
  if (!c) return "";
  const who = name ? `@${name} runs` : "You run";
  return `${who} ${c.name.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())} ${where(st)}: ${c.blurb}. That's the top ${c.top}% most active over the last 12 months.`;
}

// The slip's rows: [label, value]. Your own activity (my_activity, 114) only
// on your own slip; everyone sees the score and the position.
export function slipRows(st, activity = null) {
  const rows = [];
  if (activity) {
    rows.push(["CHECK-INS", activity.checkins ?? 0], ["MEETS HOSTED", activity.hosted ?? 0], ["MEET PHOTOS", activity.photos ?? 0], ["LINKUPS", activity.linkups ?? 0], ["POSTS", activity.posts ?? 0]);
  }
  rows.push(["SCORE", (st?.score ?? 0).toLocaleString("en-US")]);
  if (st?.rank && st?.of) rows.push(["POSITION", `P${st.rank}/${st.of}`]);
  return rows;
}

// A slip number that stays the same for a member: "No. 048213".
export function slipNumber(seed = "") {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `No. ${String(h % 1000000).padStart(6, "0")}`;
}

// Bar widths (1–3) for the slip's barcode, from the same seed.
export function barcode(seed = "", bars = 44) {
  const out = [];
  let h = 7;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < bars; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(1 + ((h >>> 16) % 3));
  }
  return out;
}
