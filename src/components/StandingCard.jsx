import { classOf, classLine, positionLine, sinceShort, slipRows, slipNumber, barcode } from "../lib/standingText.js";
import { timeSlipImage } from "../lib/standingCard.js";

// A member's TUNR time slip (from StandingBadge.jsx): the printed slip a drag
// strip hands you after a pass, with their class stamped on it. Always dark
// (a share image), so scripts/theme-colors.mjs leaves it alone. On your own
// slip, your activity rows show and SHARE makes the picture (standingCard.js)
// for Instagram, TikTok or Messages.

export const PAPER = "#F4EFE2";
export const INK = "#1D1B18";
export const STAMP = "#C81E2C";
export const MONO = "'Space Mono', 'Courier New', monospace";

// The small ticket-stub tag on a profile.
export const slipTag = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px 3px 8px",
  borderRadius: 3,
  border: "none",
  borderLeft: `3px dashed ${STAMP}`,
  background: PAPER,
  color: INK,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.4,
  cursor: "pointer",
  fontFamily: MONO,
};

const edge = (top) => ({
  height: 10,
  // A torn edge: paper teeth, the bottom one turned over.
  background: `linear-gradient(135deg, transparent 50%, ${PAPER} 50%) 0 0 / 14px 10px, linear-gradient(225deg, transparent 50%, ${PAPER} 50%) 0 0 / 14px 10px`,
  backgroundRepeat: "repeat-x",
  transform: top ? "none" : "rotate(180deg)",
});
const rule = { borderTop: `2px dashed ${INK}`, opacity: 0.35, margin: "10px 0" };

export default function StandingCard({ st, activity, username, isMe, onClose, onToast }) {
  const cls = classOf(st);
  const rows = slipRows(st, isMe ? activity : null);
  const area = String(st.area || "TUNR").toUpperCase();
  const share = async () => {
    try {
      const blob = await timeSlipImage({ st, activity: isMe ? activity : null, username });
      const file = new File([blob], `tunr-time-slip-${cls.name.toLowerCase().replace(/\s+/g, "-")}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${cls.name} on TUNR`, text: `Running ${cls.name} ${st.area && st.area !== "TUNR" ? `in ${st.area} ` : ""}on TUNR 🏁` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        onToast?.("Saved your time slip");
      }
    } catch (e) {
      if (e.name !== "AbortError") onToast?.(`Couldn't share the slip. (${e.message})`);
    }
  };

  return (
    <div
      role="dialog"
      aria-label={`${cls.name} time slip`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 480,
        // Asphalt, with the start line's lane stripes.
        background: "repeating-linear-gradient(90deg, transparent 0 46%, rgba(250,204,21,0.07) 46% 47%, transparent 47% 100%), radial-gradient(circle at 30% 20%, #2A2A2A, #121212 70%)",
        color: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowY: "auto",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(12px + env(safe-area-inset-top)) 14px 0" }}>
        <button onClick={onClose} aria-label="Back" style={{ width: 42, height: 42, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 20, cursor: "pointer" }}>
          ‹
        </button>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2.5, color: "#8A8A8A" }}>TIME SLIP</span>
        <span style={{ width: 42 }} />
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "16px 0 10px" }}>
        <div style={{ width: "min(330px, 86vw)", transform: "rotate(-1.5deg)", filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.55))" }}>
          <div style={edge(true)} />
          <div style={{ background: PAPER, color: INK, padding: "8px 18px 16px", fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55, position: "relative" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: 6, lineHeight: 1 }}>TUNR</div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5 }}>OFFICIAL TIME SLIP · {area}</div>
              <div style={{ fontSize: 10.5, opacity: 0.6 }}>{slipNumber(username)} · LAST 12 MONTHS</div>
            </div>
            <div style={rule} />
            <Row label="DRIVER" value={`@${username}`} />
            {st.member_since && <Row label="SINCE" value={sinceShort(st.member_since)} />}
            <Row label="LANE" value={area} />
            <div style={rule} />
            {rows.map(([label, value]) => (
              <Row key={label} label={label} value={value} dots bold={label === "POSITION"} />
            ))}
            <div style={rule} />

            {/* The class, stamped on in red ink. */}
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 4px" }}>
              <div style={{ transform: "rotate(-5deg)", border: `3px solid ${STAMP}`, borderRadius: 6, padding: "6px 14px 4px", color: STAMP, textAlign: "center", opacity: 0.92, boxShadow: `inset 0 0 0 2px ${PAPER}, inset 0 0 0 4px ${STAMP}` }}>
                <div style={{ fontSize: 10, letterSpacing: 2.5, fontWeight: 700 }}>CLASS</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: cls.name.length > 9 ? 36 : 44, fontWeight: 900, letterSpacing: 1.5, lineHeight: 0.95 }}>{cls.name}</div>
                <div style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: 700, marginTop: 2 }}>TOP {cls.top}% · {area}</div>
              </div>
            </div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontSize: 13, lineHeight: 1.4, textAlign: "center", marginTop: 10 }}>{classLine(st, isMe ? null : username)}</div>
            {positionLine(st) && <div style={{ fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.7 }}>{positionLine(st).toUpperCase()}</div>}

            <div style={rule} />
            <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", alignItems: "stretch", gap: 2, height: 34 }}>
              {barcode(username).map((w, i) => (
                <span key={i} style={{ width: w, background: i % 2 ? "transparent" : INK }} />
              ))}
            </div>
            <div style={{ fontSize: 9.5, textAlign: "center", letterSpacing: 1, opacity: 0.6, marginTop: 4 }}>SCORED ON CHECK-INS, MEETS HOSTED, PHOTOS, LINKUPS & POSTS</div>
          </div>
          <div style={edge(false)} />
        </div>
      </div>

      {isMe && (
        <div style={{ alignSelf: "stretch", padding: "8px 20px calc(20px + env(safe-area-inset-bottom))" }}>
          <button onClick={share} style={{ width: "100%", padding: "15px 0", borderRadius: 12, border: "none", background: "#FACC15", color: "#111", fontSize: 17, fontWeight: 900, letterSpacing: 1.5, cursor: "pointer", fontFamily: "inherit" }}>
            🏁 SHARE MY SLIP
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: "#8A8A8A", marginTop: 6, fontFamily: "'Barlow', sans-serif" }}>Your activity rows only show on your own slip.</div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, dots = false, bold = false }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontWeight: bold ? 700 : 400 }}>
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ flex: 1, borderBottom: dots ? `2px dotted rgba(29,27,24,0.45)` : "none", transform: "translateY(-4px)" }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "62%" }}>{value}</span>
    </div>
  );
}
