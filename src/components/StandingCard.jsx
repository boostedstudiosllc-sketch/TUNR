import { standingLine, rankLine, initials } from "../lib/standingText.js";
import { standingCard } from "../lib/standingCard.js";

// The full-screen "Top X%" card (from StandingBadge.jsx), always dark like a
// share image. On your own, SHARE makes the picture (standingCard.js) and
// opens the phone's share sheet (Instagram, TikTok, Messages) or saves it.
export default function StandingCard({ st, username, isMe, onClose, onToast }) {
  const line = standingLine(st, isMe ? null : username);
  const share = async () => {
    try {
      const blob = await standingCard({ top: st.top, area: st.area, line: standingLine(st), username });
      const file = new File([blob], `tunr-top-${st.top}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Top ${st.top}% on TUNR`, text: `Top ${st.top}% of the car scene${st.area && st.area !== "TUNR" ? ` in ${st.area}` : ""} on TUNR 🏁` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        onToast?.("Saved your card");
      }
    } catch (e) {
      if (e.name !== "AbortError") onToast?.(`Couldn't share the card. (${e.message})`);
    }
  };

  return (
    <div role="dialog" aria-label={`Top ${st.top}%`} style={{ position: "fixed", inset: 0, zIndex: 480, background: "linear-gradient(180deg, #0B1E3F, #0A4F9C 55%, #06152E)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Barlow Condensed', sans-serif", overflowY: "auto" }}>
      <div style={{ alignSelf: "stretch", padding: "calc(12px + env(safe-area-inset-top)) 14px 0" }}>
        <button onClick={onClose} aria-label="Back" style={{ width: 42, height: 42, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 20, cursor: "pointer" }}>
          ‹
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 24px", textAlign: "center" }}>
        <div style={{ position: "relative", width: 170, height: 170 }}>
          <div style={{ width: 170, height: 170, borderRadius: "50%", border: "5px solid #fff", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 900, boxSizing: "border-box" }}>{initials(username)}</div>
          <div aria-hidden="true" style={{ position: "absolute", top: -18, right: -26, width: 86, height: 86, background: "#FACC15", clipPath: "polygon(50% 0,61% 22%,85% 15%,78% 39%,100% 50%,78% 61%,85% 85%,61% 78%,50% 100%,39% 78%,15% 85%,22% 61%,0 50%,22% 39%,15% 15%,39% 22%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>
            🏁
          </div>
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, marginTop: 26, color: "#fff", WebkitTextStroke: "3px #0080F0", textShadow: "0 6px 0 #0080F0, 0 10px 24px rgba(0,0,0,0.35)" }}>TOP {st.top}%</div>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 2, marginTop: 6, textShadow: "0 3px 0 #0080F0" }}>{String(st.area || "TUNR").toUpperCase()}</div>
        <div style={{ fontSize: 19, fontFamily: "'Barlow', sans-serif", marginTop: 22, maxWidth: 340, lineHeight: 1.4 }}>{line}</div>
        {rankLine(st) && <div style={{ fontSize: 13, fontFamily: "'Barlow', sans-serif", marginTop: 10, color: "rgba(255,255,255,0.7)" }}>{rankLine(st)}</div>}
        <div style={{ fontSize: 13, fontFamily: "'Barlow', sans-serif", marginTop: 4, color: "rgba(255,255,255,0.6)" }}>Ranked on check-ins, meets hosted, photos, linkups and posts.</div>
        <div style={{ fontSize: 44, fontWeight: 900, marginTop: 30, letterSpacing: -0.5 }}>
          TUN<span style={{ color: "#3CABFD" }}>R</span>
        </div>
        <div style={{ fontSize: 16, fontFamily: "'Barlow', sans-serif", color: "rgba(255,255,255,0.8)" }}>@{username}</div>
      </div>
      {isMe && (
        <div style={{ alignSelf: "stretch", padding: "12px 20px calc(20px + env(safe-area-inset-bottom))" }}>
          <button onClick={share} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: "#fff", color: "#0B1E3F", fontSize: 17, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit" }}>
            📤 SHARE TO INSTAGRAM, TIKTOK, MESSAGES…
          </button>
        </div>
      )}
    </div>
  );
}
