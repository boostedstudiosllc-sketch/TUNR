import { createPortal } from "react-dom";

// A panel that slides up from the bottom, like the meet and profile sheets.
// portal: draw it at the top level of the page instead of where it's opened,
// for panels opened from the sticky header (the alerts bell), which would
// otherwise sit under the tab bar.
export default function Sheet({ onClose, children, zIndex = 260, label, portal = false }) {
  const panel = (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        width: "100%",
        maxWidth: 430,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.88)",
        zIndex,
        display: "flex",
        alignItems: "flex-end",
        fontFamily: "'Barlow Condensed', sans-serif",
        color: "var(--n-f0f0f0)",
      }}
    >
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "var(--n-0f0f0f)",
          borderRadius: "16px 16px 0 0",
          border: "1px solid var(--n-1e1e1e)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "18px 20px calc(28px + env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
          color: "var(--n-f0f0f0)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
          <button onClick={onClose} aria-label="Close" style={closeButton}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  return portal ? createPortal(panel, document.body) : panel;
}

const closeButton = {
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  color: "var(--n-ffffff)",
  borderRadius: "50%",
  width: 32,
  height: 32,
  fontSize: 15,
  cursor: "pointer",
};

export const sheetTitle = {
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: 0.5,
  fontFamily: "'Barlow Condensed', sans-serif",
};

export const muted = { fontSize: 13, color: "var(--n-888888)", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif" };

export const label = { fontSize: 10.5, color: "var(--n-666666)", letterSpacing: 1.6, fontWeight: 700, marginBottom: 6 };

export const field = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--n-161616)",
  border: "1px solid var(--n-2a2a2a)",
  borderRadius: 8,
  padding: "11px 12px",
  color: "var(--n-f0f0f0)",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
};

export const bigButton = {
  width: "100%",
  padding: "14px 0",
  background: "#0080F0",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 1.4,
  cursor: "pointer",
  fontFamily: "'Barlow Condensed', sans-serif",
};

export const quietButton = {
  ...bigButton,
  background: "var(--n-1a1a1a)",
  border: "1px solid var(--n-2a2a2a)",
  color: "var(--n-cccccc)",
};

export function Chip({ active, onClick, children, color = "#0080F0" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "9px 4px",
        borderRadius: 18,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.6,
        whiteSpace: "nowrap",
        cursor: "pointer",
        background: active ? "rgba(0, 128, 240,0.16)" : "var(--n-161616)",
        color: active ? "var(--a-3cabfd)" : "var(--n-888888)",
        border: `1px solid ${active ? color : "var(--n-2a2a2a)"}`,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {children}
    </button>
  );
}
