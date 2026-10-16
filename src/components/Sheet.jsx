// A panel that slides up from the bottom, like the meet and profile sheets.
export default function Sheet({ onClose, children, zIndex = 260, label }) {
  return (
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
      }}
    >
      <div
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#0F0F0F",
          borderRadius: "16px 16px 0 0",
          border: "1px solid #1E1E1E",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "18px 20px 28px",
          animation: "slideUp 0.25s ease",
          color: "#F0F0F0",
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
}

const closeButton = {
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  color: "#fff",
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

export const muted = { fontSize: 13, color: "#888", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif" };

export const label = { fontSize: 10.5, color: "#666", letterSpacing: 1.6, fontWeight: 700, marginBottom: 6 };

export const field = {
  width: "100%",
  boxSizing: "border-box",
  background: "#161616",
  border: "1px solid #2A2A2A",
  borderRadius: 8,
  padding: "11px 12px",
  color: "#F0F0F0",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Barlow', sans-serif",
};

export const bigButton = {
  width: "100%",
  padding: "14px 0",
  background: "#FF4500",
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
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  color: "#CCC",
};

export function Chip({ active, onClick, children, color = "#FF4500" }) {
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
        background: active ? "rgba(255,69,0,0.16)" : "#161616",
        color: active ? "#FF7A00" : "#888",
        border: `1px solid ${active ? color : "#2A2A2A"}`,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      {children}
    </button>
  );
}
