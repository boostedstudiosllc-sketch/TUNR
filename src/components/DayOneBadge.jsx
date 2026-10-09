// The Day 1 mark: on your profile, and next to your name in comments.
// Set by the database, so showing it here is all the client ever does.
export default function DayOneBadge({ number, size = "small" }) {
  const big = size === "large";
  return (
    <span
      title={number ? `Day 1 member #${number} — here before launch` : "Day 1 — here before launch"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: big ? 6 : 4,
        padding: big ? "5px 11px" : "1px 6px",
        borderRadius: big ? 6 : 4,
        background: "linear-gradient(135deg, #FFB300, #FF7A00)",
        color: "#140800",
        fontSize: big ? 13 : 9.5,
        fontWeight: 900,
        letterSpacing: big ? 1.4 : 0.8,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        fontFamily: "'Barlow Condensed', sans-serif",
        verticalAlign: "middle",
      }}
    >
      DAY 1{number ? <span style={{ opacity: 0.7 }}>#{number}</span> : null}
    </span>
  );
}
