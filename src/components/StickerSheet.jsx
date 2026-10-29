import { useEffect, useState } from "react";
import { buildPageUrl, loadScanStats, setBuildPagePublic } from "../lib/buildpage.js";
import { loadMyInvites } from "../lib/invites.js";
import Sheet, { sheetTitle, muted, label, bigButton, quietButton } from "./Sheet.jsx";
import useInvitePoints, { plusPoints } from "./useInvitePoints.js";
import PrintPage from "./PrintPage.jsx";
import StickerOrder from "./StickerOrder.jsx";

// A car's "Scan my build" QR: turn its public page on, see scans, print the
// sticker (one big, two small), or share the link.
export default function StickerSheet({ vehicle, onClose, onToast, onChanged }) {
  const pts = useInvitePoints();
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState("");
  const [isPublic, setIsPublic] = useState(Boolean(vehicle.public_page));
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");

  useEffect(() => {
    loadMyInvites()
      .then((d) => setCode(d?.code || ""))
      .catch((e) => (setCode(""), onToast(e.message)));
    loadScanStats(vehicle.id)
      .then(setStats)
      .catch((e) => console.warn(e.message));
  }, [vehicle.id]);

  const url = code === null ? "" : buildPageUrl(vehicle.id, code);

  useEffect(() => {
    if (!url) return;
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: "M" }))
      .then(setQr)
      .catch((e) => onToast(`Couldn't draw the QR code. (${e.message})`));
  }, [url]);

  async function togglePublic() {
    setBusy(true);
    try {
      await setBuildPagePublic(vehicle.id, !isPublic);
      setIsPublic(!isPublic);
      onToast(isPublic ? "Build page turned off" : "🔳 Build page is on. Anyone who scans can see it.");
      onChanged && onChanged();
    } catch (e) {
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: `Check out my ${name} on TUNR`, url });
      } else {
        await navigator.clipboard.writeText(url);
        onToast("Link copied");
      }
    } catch (e) {
      if (e.name !== "AbortError") onToast(`Couldn't share. (${e.message})`);
    }
  }

  // One big sticker and two small ones, shown in the app to print.
  const [printHtml, setPrintHtml] = useState("");
  async function print() {
    try {
      setPrintHtml(await stickerHtml(url, name, ["L", "S", "S"]));
    } catch (e) {
      onToast(`Couldn't make the sticker. (${e.message})`);
    }
  }

  if (printHtml) {
    return (
      <PrintPage
        title="Scan my build sticker"
        tip="Print on sticker paper (or regular paper and tape it inside the window), then cut along the dashed lines."
        html={printHtml}
        css={STICKER_CSS}
        onBack={() => setPrintHtml("")}
      />
    );
  }


  return (
    <Sheet onClose={onClose} label="Scan my build sticker" zIndex={296}>
      <div style={sheetTitle}>🔳 SCAN MY BUILD</div>
      <div style={{ ...muted, marginTop: 4 }}>
        A QR sticker for your window. At meets, people scan it to see your {name}, its build notes and
        your @username, even when you're not around. If they join TUNR from it, it counts as your
        invite{pts?.invite > 0 ? `, and you get ${plusPoints(pts.invite)} when they check in at their first meet` : ""}.
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: isPublic ? "rgba(16,185,129,0.08)" : "var(--n-121212)",
          border: `1px solid ${isPublic ? "#14532D" : "var(--n-2a2a2a)"}`,
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 900 }}>Public build page</span>
          <span style={{ display: "block", ...muted, fontSize: 12 }}>
            {isPublic ? "On: anyone who scans sees this car and your @username." : "Off: scans show “private”. Turn on before you print."}
          </span>
        </span>
        <button
          className="action-btn"
          disabled={busy}
          onClick={togglePublic}
          role="switch"
          aria-checked={isPublic}
          style={{ ...quietButton, width: "auto", padding: "9px 14px", color: isPublic ? "#10B981" : "#FACC15", borderColor: isPublic ? "#14532D" : "var(--n-4a3a00)" }}
        >
          {isPublic ? "ON" : "TURN ON"}
        </button>
      </div>

      <div style={{ background: "var(--n-0a0a0a)", border: "1px solid var(--n-222222)", borderRadius: 16, padding: 18, marginTop: 14, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2, color: "var(--a-3cabfd)" }}>SCAN MY BUILD</div>
        {qr ? (
          <img src={qr} alt={`QR code for ${name}`} style={{ width: 200, height: 200, background: "var(--n-ffffff)", borderRadius: 10, padding: 8, marginTop: 10 }} />
        ) : (
          <div style={{ ...muted, margin: "40px 0" }}>Drawing the QR…</div>
        )}
        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 8 }}>{name}</div>
      </div>

      {stats && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[
            [stats.month, "SCANS THIS MONTH"],
            [stats.total, "ALL-TIME SCANS"],
            [stats.joined, "JOINED FROM IT"],
          ].map(([n, l]) => (
            <div key={l} style={{ flex: 1, background: "var(--n-121212)", border: "1px solid var(--n-222222)", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{n}</div>
              <div style={{ ...label, marginBottom: 0, fontSize: 9.5 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="action-btn" disabled={!url || !isPublic} onClick={print} style={{ ...bigButton, flex: 2, opacity: url && isPublic ? 1 : 0.5 }}>
          🖨️ PRINT MY STICKER
        </button>
        <button className="action-btn" disabled={!url} onClick={share} style={{ ...quietButton, flex: 1 }}>
          SHARE
        </button>
      </div>
      <StickerOrder vehicle={vehicle} name={name} isPublic={isPublic} onToast={onToast} />
    </Sheet>
  );
}

// The sticker artwork for PrintPage: one per size given ("L" 3.5 in, "S" 2 in).
export async function stickerHtml(url, name, sizes) {
  const { default: QRCode } = await import("qrcode");
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sticker = (size) =>
    `<div class="s s${size}"><div class="t">SCAN MY BUILD</div><div class="q">${svg}</div><div class="n">${esc(name)}</div><div class="b">TUNR · Georgia car meets</div></div>`;
  return `<div class="wrap">${sizes.map(sticker).join("")}</div>`;
}

export const STICKER_CSS = `
  .print-page .wrap { display: flex; flex-wrap: wrap; gap: 0.4in; padding: 0.4in; align-items: flex-start; justify-content: center; }
  .print-page .s { background: var(--n-0a0a0a); color: var(--n-ffffff); border-radius: 0.18in; text-align: center; box-sizing: border-box; border: 1px dashed var(--n-999999); }
  .print-page .sL { width: 3.5in; max-width: 100%; padding: 0.22in; }
  .print-page .sS { width: 2in; padding: 0.13in; }
  .print-page .t { font-weight: 900; letter-spacing: 2px; color: #3CABFD; }
  .print-page .sL .t { font-size: 16pt; } .print-page .sS .t { font-size: 8.5pt; }
  .print-page .q { background: var(--n-ffffff); border-radius: 0.08in; margin: 0.1in auto; padding: 0.08in; }
  .print-page .sL .q { width: 2.6in; max-width: 100%; box-sizing: border-box; } .print-page .sS .q { width: 1.5in; }
  .print-page .q svg { width: 100%; height: auto; display: block; }
  .print-page .n { font-weight: 800; } .print-page .sL .n { font-size: 12pt; } .print-page .sS .n { font-size: 7pt; }
  .print-page .b { color: var(--n-aaaaaa); } .print-page .sL .b { font-size: 8pt; } .print-page .sS .b { font-size: 5.5pt; }
`;
