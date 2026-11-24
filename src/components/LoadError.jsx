// "Couldn't load … (reason)  TRY AGAIN": shown where a list or panel would
// have been, so a failure never looks like an empty screen.
export default function LoadError({ message, onRetry, style }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, border: "1px solid #EF4444", color: "var(--a-f87171)", fontSize: 13, lineHeight: 1.45, fontFamily: "'Barlow', sans-serif", ...style }}>
      {message}
      {onRetry && (
        <>
          {" "}
          <button onClick={onRetry} style={{ background: "none", border: "none", color: "var(--a-3cabfd)", fontWeight: 800, cursor: "pointer", padding: 0, font: "inherit" }}>
            TRY AGAIN
          </button>
        </>
      )}
    </div>
  );
}
