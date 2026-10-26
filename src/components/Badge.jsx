import { useState } from "react";
import { createPortal } from "react-dom";

// Profile badges. Icon only — no words on the badge itself; tapping one says
// what it's for. The database decides who has them, so showing them is all
// the client ever does.
const BADGES = {
  photographer: {
    title: "Photographer",
    gradient: "linear-gradient(135deg, #38BDF8, #2563EB)",
    explain: () =>
      "Shoots cars at meets. Self-declared on their profile, so check their work before you book.",
    glyph: (
      // A camera.
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
        <path d="M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z" />
        <circle cx="12" cy="13.2" r="3.3" />
      </g>
    ),
  },
  photographer_verified: {
    title: "Verified photographer",
    gradient: "linear-gradient(135deg, #22D3EE, #1D4ED8)",
    explain: () =>
      "A photographer TUNR has checked. Still worth looking at their work first.",
    glyph: (
      // A camera with a check.
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 8h3.5l1.5-2.5h5L15 8h3.5v6.5" />
        <path d="M3.5 8v11H13" />
        <circle cx="10.5" cy="13" r="3" />
        <path d="M15.5 18.5l2 2 4-4.5" />
      </g>
    ),
  },
  day_one: {
    title: "Day 1",
    gradient: "linear-gradient(135deg, #FFC53D, #FF8A00)",
    explain: (number) =>
      `Signed up before TUNR launched.${number ? ` Member #${number}.` : ""} Nobody can get this one now.`,
    glyph: (
      // A sunrise: here from the start.
      <g fill="none" stroke="#1A0B00" strokeWidth="2.2" strokeLinecap="round">
        <path d="M6 16a6 6 0 0 1 12 0" />
        <path d="M3 16h18" />
        <path d="M12 5.5v2.5M5.6 8.6l1.7 1.7M18.4 8.6l-1.7 1.7" />
      </g>
    ),
  },
  connector: {
    title: "Connector",
    gradient: "linear-gradient(135deg, #A855F7, #EC4899)",
    explain: () => "Brought five or more friends to TUNR.",
    glyph: (
      // Two chain links.
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </g>
    ),
  },
  founding_host: {
    title: "Founding host",
    gradient: "linear-gradient(135deg, #FF5A1F, #C21E00)",
    explain: () =>
      "One of the first car meet hosts on TUNR, verified before launch. Nobody can get this one now.",
    glyph: (
      // A checkered flag.
      <g>
        <path d="M6.5 4v16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M7.5 5h11v9h-11z" fill="#fff" />
        <path
          d="M7.5 5h2.75v3h-2.75zM13 5h2.75v3H13zM10.25 8H13v3h-2.75zM15.75 8h2.75v3h-2.75zM7.5 11h2.75v3H7.5zM13 11h2.75v3H13z"
          fill="#8A1400"
        />
      </g>
    ),
  },
};

export default function Badge({ kind, number = null, size = 16 }) {
  const [open, setOpen] = useState(false);
  const badge = BADGES[kind];
  if (!badge) return null;

  return (
    <>
      <button
        type="button"
        aria-label={badge.title}
        title={badge.title}
        onClick={(e) => {
          // Badges sit inside tappable cards; don't open the meet too.
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          padding: 0,
          border: "none",
          borderRadius: "50%",
          background: badge.gradient,
          boxShadow: "0 0 0 1.5px rgba(0,0,0,0.6)",
          cursor: "pointer",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      >
        <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24" aria-hidden="true">
          {badge.glyph}
        </svg>
      </button>
      {open &&
        createPortal(
          <BadgeInfo badge={badge} number={number} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  );
}

// Badges can sit next to each other; this keeps the gap consistent.
export function Badges({ dayOne, dayOneNumber, foundingHost, photographer, photographerVerified, connector, size = 16 }) {
  if (!dayOne && !foundingHost && !photographer && !photographerVerified && !connector) return null;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", verticalAlign: "middle" }}>
      {foundingHost && <Badge kind="founding_host" size={size} />}
      {dayOne && <Badge kind="day_one" number={dayOneNumber} size={size} />}
      {connector && <Badge kind="connector" size={size} />}
      {photographerVerified ? (
        <Badge kind="photographer_verified" size={size} />
      ) : (
        photographer && <Badge kind="photographer" size={size} />
      )}
    </span>
  );
}

function BadgeInfo({ badge, number, onClose }) {
  return (
    <div
      onClick={(e) => {
        // React bubbles portal events to the badge's ancestors; stop here.
        e.stopPropagation();
        onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        role="dialog"
        aria-label={badge.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 300,
          background: "#131313",
          border: "1px solid #2A2A2A",
          borderRadius: 14,
          padding: "22px 20px 18px",
          textAlign: "center",
          color: "#F0F0F0",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            margin: "0 auto",
            borderRadius: "50%",
            background: badge.gradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={36} height={36} viewBox="0 0 24 24" aria-hidden="true">
            {badge.glyph}
          </svg>
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: 0.5,
            marginTop: 12,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          {badge.title.toUpperCase()}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "#AAA",
            lineHeight: 1.6,
            marginTop: 6,
            fontFamily: "'Barlow', sans-serif",
          }}
        >
          {badge.explain(number)}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "11px 0",
            background: "#1E1E1E",
            border: "1px solid #2A2A2A",
            borderRadius: 8,
            color: "#DDD",
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: 1.5,
            cursor: "pointer",
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          GOT IT
        </button>
      </div>
    </div>
  );
}
