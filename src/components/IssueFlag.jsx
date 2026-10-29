import { useState } from "react";

const WHAT = {
  "Cancelled or postponed": "it's cancelled or postponed",
  "Wrong date or time": "the date or time is wrong",
  "Wrong location": "the location is wrong",
};

// A meet enough people have flagged. The meet stays up; the flag says why
// when tapped, so people can check the flyer or ask in the chat.
export default function IssueFlag({ issue, count, size = "small" }) {
  const [open, setOpen] = useState(false);
  const big = size === "large";
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "100%" }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label="Flagged — tap to see why"
        style={{
          background: "rgba(245,158,11,0.12)",
          border: "1px solid rgba(245,158,11,0.5)",
          color: "#F59E0B",
          fontSize: big ? 11.5 : 10,
          padding: big ? "5px 11px" : "3px 8px",
          borderRadius: big ? 20 : 4,
          letterSpacing: 0.6,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        🚩 FLAGGED {open ? "▴" : "▾"}
      </button>
      {open && (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block",
            marginTop: 6,
            padding: "8px 10px",
            borderRadius: 6,
            background: "var(--n-17130a)",
            border: "1px solid rgba(245,158,11,0.35)",
            color: "var(--a-e5b95c)",
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: "'Barlow', sans-serif",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <strong>
            {count > 0 ? `${count} people` : "Several people"} say {WHAT[issue] || "something here is wrong"}.
          </strong>{" "}
          It's still listed — check the flyer or ask in the meet chat before you head out.
        </span>
      )}
    </span>
  );
}
