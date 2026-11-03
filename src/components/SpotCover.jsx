// A photo spot's cover with its name on it (PhotoSpots.jsx). White text on a
// dark fade over the photo in light mode too, so it's in the theme script's
// always-dark list (scripts/theme-colors.mjs).
export default function SpotCover({ spot: s, onOpen }) {
  const cover = s.photo_urls?.[0];
  return (
    <button onClick={onOpen} aria-label={`Open ${s.title}`} style={{ position: "relative", display: "block", width: "100%", padding: 0, border: "none", cursor: "pointer", aspectRatio: "16 / 9", background: cover ? `center / cover no-repeat url("${cover}")` : "linear-gradient(135deg, #0B1E3F, #0A4F9C)" }}>
      {!cover && <span style={{ fontSize: 46 }}>📸</span>}
      <span style={{ position: "absolute", inset: "auto 0 0 0", padding: "28px 12px 10px", background: "linear-gradient(transparent, rgba(0,0,0,0.85))", color: "#FFFFFF", textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 21, fontWeight: 900, lineHeight: 1.05 }}>{s.title}</span>
        <span style={{ display: "block", fontSize: 12.5, fontFamily: "'Barlow', sans-serif", opacity: 0.85, marginTop: 2 }}>
          {[s.place && s.place !== s.title ? s.place : null, s.milesLabel && `${s.milesLabel} away`].filter(Boolean).join(" · ")}
        </span>
      </span>
      {s.photo_urls?.length > 1 && (
        <span style={{ position: "absolute", top: 8, right: 8, fontSize: 11, fontWeight: 900, padding: "2px 7px", borderRadius: 6, background: "rgba(0,0,0,0.6)", color: "#FFFFFF" }}>
          1/{s.photo_urls.length}
        </span>
      )}
    </button>
  );
}
