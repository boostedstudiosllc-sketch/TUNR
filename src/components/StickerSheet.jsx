import { useEffect, useState } from "react";
import { buildPageUrl, loadScanStats, setBuildPagePublic } from "../lib/buildpage.js";
import { loadMyInvites } from "../lib/invites.js";
import Sheet, { sheetTitle, muted, label, bigButton, quietButton } from "./Sheet.jsx";

// A car's "Scan my build" QR: turn its public page on, see scans, print the
// sticker (one big, two small), or share the link.
export default function StickerSheet({ vehicle, onClose, onToast, onChanged }) {
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

  async function print() {
    const win = window.open("", "_blank");
    if (!win) return onToast("Your browser blocked the print window. Allow pop-ups for TUNR and try again.");
    try {
      const { default: QRCode } = await import("qrcode");
      const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
      const sticker = (size) => `<div class="s s${size}"><div class="t">SCAN MY BUILD</div><div class="q">${svg}</div><div class="n">${esc(name)}</div><div class="b">TUNR · Georgia car meets</div></div>`;
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Scan my build sticker</title><style>
        @page { size: letter; margin: 0.5in; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
        .bar { padding: 12px; font-size: 14px; background: #FFF4E5; border-bottom: 1px solid #F0D0A0; }
        .bar button { font-size: 14px; padding: 6px 14px; margin-left: 8px; }
        .wrap { display: flex; flex-wrap: wrap; gap: 0.4in; padding: 0.4in; align-items: flex-start; }
        .s { background: #0A0A0A; color: #fff; border-radius: 0.18in; text-align: center; box-sizing: border-box; border: 1px dashed #999; }
        .sL { width: 3.5in; padding: 0.22in; }
        .sS { width: 2in; padding: 0.13in; }
        .t { font-weight: 900; letter-spacing: 2px; color: #FF7A00; }
        .sL .t { font-size: 16pt; } .sS .t { font-size: 8.5pt; }
        .q { background: #fff; border-radius: 0.08in; margin: 0.1in auto; padding: 0.08in; }
        .sL .q { width: 2.6in; } .sS .q { width: 1.5in; }
        .q svg { width: 100%; height: auto; display: block; }
        .n { font-weight: 800; } .sL .n { font-size: 12pt; } .sS .n { font-size: 7pt; }
        .b { color: #aaa; } .sL .b { font-size: 8pt; } .sS .b { font-size: 5.5pt; }
        @media print { .bar { display: none; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body><div class="bar">Print on sticker paper (or regular paper and tape it inside the window), then cut along the dashed lines.<button onclick="window.print()">Print</button></div><div class="wrap">${sticker("L")}${sticker("S")}${sticker("S")}</div></body></html>`);
      win.document.close();
    } catch (e) {
      win.close();
      onToast(`Couldn't make the sticker. (${e.message})`);
    }
  }

  return (
    <Sheet onClose={onClose} label="Scan my build sticker" zIndex={296}>
      <div style={sheetTitle}>🔳 SCAN MY BUILD</div>
      <div style={{ ...muted, marginTop: 4 }}>
        A QR sticker for your window. At meets, people scan it to see your {name}, its build notes and
        your @username, even when you're not around. If they join TUNR from it, it counts as your
        invite, and you get +5 points when they check in at their first meet.
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: isPublic ? "rgba(16,185,129,0.08)" : "#121212",
          border: `1px solid ${isPublic ? "#14532D" : "#2A2A2A"}`,
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
          style={{ ...quietButton, width: "auto", padding: "9px 14px", color: isPublic ? "#10B981" : "#FACC15", borderColor: isPublic ? "#14532D" : "#4A3A00" }}
        >
          {isPublic ? "ON" : "TURN ON"}
        </button>
      </div>

      <div style={{ background: "#0A0A0A", border: "1px solid #222", borderRadius: 16, padding: 18, marginTop: 14, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2, color: "#FF7A00" }}>SCAN MY BUILD</div>
        {qr ? (
          <img src={qr} alt={`QR code for ${name}`} style={{ width: 200, height: 200, background: "#fff", borderRadius: 10, padding: 8, marginTop: 10 }} />
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
            <div key={l} style={{ flex: 1, background: "#121212", border: "1px solid #222", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
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
      <div style={{ ...muted, fontSize: 12, marginTop: 8 }}>
        Free to print at home. Want a weatherproof vinyl one? When available, it's a reward in Points &amp; rewards.
      </div>
    </Sheet>
  );
}
