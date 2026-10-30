import { useEffect, useState } from "react";

// ⏭ beside a game's 🎵: skips to the next song (gameMusic.js) and shows its
// name for a moment. The pick is remembered for that game. ensure: makes the
// game's RushAudio if it doesn't exist yet (TUNR Rush makes it on START).
export default function TrackButton({ audio, style, ensure }) {
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!shown) return undefined;
    const t = setTimeout(() => setShown(null), 2200);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => {
          const a = audio.current || ensure?.();
          if (!a) return;
          setShown(a.nextSong());
        }}
        aria-label="Next song"
        style={style}
      >
        ⏭
      </button>
      {shown && (
        <span
          role="status"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            whiteSpace: "nowrap",
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.85)",
            border: "1px solid #2a2a2a",
            color: "#f0f0f0",
            fontSize: 12.5,
            fontWeight: 800,
            letterSpacing: 0.5,
            fontFamily: "'Barlow Condensed', sans-serif",
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          🎵 {shown.name} · {shown.style}
        </span>
      )}
    </span>
  );
}
