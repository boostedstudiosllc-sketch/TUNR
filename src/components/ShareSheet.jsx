import { useEffect, useState } from "react";
import { cardContent, drawCard } from "../lib/shareCard.js";
import Sheet, { sheetTitle, muted } from "./Sheet.jsx";
import { errorReason } from "../lib/errors.js";

// "Share": a branded card of a meet, a car or a part (shareCard.js), with
// Save, Copy Image, Copy Link and Share to… — TUNR's take on the share
// screen apps show after a screenshot. (A web app can't see screenshots,
// so it opens from the SHARE buttons instead.)
export default function ShareSheet({ kind, data, title = "Share", onClose, onToast }) {
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const card = cardContent(kind, data, { origin: window.location.origin });
  const fileName = `tunr-${kind}-${String(data.slug || data.id || "card").slice(0, 40)}.png`;

  useEffect(() => {
    let url = "";
    drawCard(card)
      .then((b) => {
        setBlob(b);
        url = URL.createObjectURL(b);
        setPreview(url);
      })
      .catch((e) => setError(`Couldn't make the share picture. (${errorReason(e)})`));
    return () => url && URL.revokeObjectURL(url);
  }, [kind, data?.id]);

  const file = () => new File([blob], fileName, { type: "image/png" });
  const text = `${card.title} on TUNR`;

  const actions = [
    {
      icon: "⬇️",
      label: "Save",
      run: async () => {
        // On phones the share menu's "Save Image" puts it in Photos.
        if (navigator.canShare?.({ files: [file()] })) return navigator.share({ files: [file()] });
        const a = document.createElement("a");
        a.href = preview;
        a.download = fileName;
        a.click();
        onToast?.("Saved");
      },
    },
    {
      icon: "🖼️",
      label: "Copy Image",
      run: async () => {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("This browser can't copy pictures. Use Save instead.");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        onToast?.("Picture copied");
      },
    },
    {
      icon: "🔗",
      label: "Copy Link",
      run: async () => {
        await navigator.clipboard.writeText(card.link);
        onToast?.("Link copied");
      },
    },
    {
      icon: "↗️",
      label: "Share to…",
      run: async () => {
        if (navigator.canShare?.({ files: [file()] })) return navigator.share({ files: [file()], text, url: card.link });
        if (navigator.share) return navigator.share({ title: card.title, text, url: card.link });
        await navigator.clipboard.writeText(card.link);
        onToast?.("Sharing isn't available here, so the link was copied");
      },
    },
  ];

  const tap = async (a) => {
    setError("");
    try {
      await a.run();
    } catch (e) {
      if (e?.name !== "AbortError") setError(`${a.label} didn't work. (${e?.message || e})`);
    }
  };

  return (
    <Sheet onClose={onClose} label={title} zIndex={340}>
      <div style={{ ...sheetTitle, textAlign: "center" }}>{title.toUpperCase()}</div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
        {preview ? (
          <img src={preview} alt={`Share card: ${card.title}`} style={{ width: "100%", maxWidth: 340, aspectRatio: "4 / 5", borderRadius: 16, border: "1px solid var(--n-2a2a2a)", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }} />
        ) : (
          <div style={{ width: "100%", maxWidth: 340, aspectRatio: "4 / 5", borderRadius: 16, background: "var(--n-131313)", display: "flex", alignItems: "center", justifyContent: "center", ...muted }}>{error ? "" : "Making your card…"}</div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 18 }}>
        {actions.map((a) => (
          <button key={a.label} disabled={!blob} onClick={() => tap(a)} style={{ background: "none", border: "none", color: "var(--n-f0f0f0)", cursor: blob ? "pointer" : "default", opacity: blob ? 1 : 0.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "'Barlow', sans-serif", fontSize: 13, fontWeight: 700 }}>
            <span aria-hidden style={{ width: 58, height: 58, borderRadius: "50%", background: "var(--n-1e1e1e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 12, textAlign: "center" }}>
          {error}
        </div>
      )}
    </Sheet>
  );
}
