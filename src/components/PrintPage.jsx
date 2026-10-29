import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// A page to print, shown over the app with ← BACK and 🖨️ PRINT along the top.
// Used instead of opening a new window: on an iPhone home-screen app a new
// window has no way back. Printing shows only the page itself.
//
// html: the page's markup (already escaped by the caller). css: its styles,
// written under `.print-page .sheet`. pageMargin: the printed page's margin.
export default function PrintPage({ title, tip, html, css = "", pageMargin = "0.5in", onBack }) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    const onKey = (e) => e.key === "Escape" && back.current();
    window.addEventListener("keydown", onKey);
    return () => {
      document.title = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [title]);

  return createPortal(
    <div className="print-page" role="dialog" aria-label={title}>
      <style>{`
        .print-page { position: fixed; inset: 0; z-index: 400; overflow-y: auto; background: var(--n-ffffff); color: var(--n-111111); font-family: Arial, Helvetica, sans-serif; }
        .print-page .bar { position: sticky; top: 0; z-index: 1; display: flex; gap: 8px; padding: calc(10px + env(safe-area-inset-top)) 12px 10px; background: var(--n-0a0a0a); }
        .print-page .bar button { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; letter-spacing: 1px; font-size: 15px; padding: 11px 16px; border-radius: 8px; cursor: pointer; }
        .print-page .back { background: var(--n-1a1a1a); color: var(--n-e6e6e6); border: 1px solid var(--n-2a2a2a); }
        .print-page .go { flex: 1; background: #0080F0; color: var(--n-ffffff); border: none; }
        .print-page .tip { padding: 12px 16px 0; font-size: 13.5px; line-height: 1.45; color: var(--n-333333); }
        .print-page .sheet { overflow-x: auto; padding-bottom: env(safe-area-inset-bottom); }
        ${css}
        @media print {
          @page { size: letter; margin: ${pageMargin}; }
          body > *:not(.print-page) { display: none !important; }
          html, body { background: var(--n-ffffff) !important; }
          .print-page { position: static; overflow: visible; }
          .print-page .bar, .print-page .tip { display: none; }
          .print-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="bar">
        <button type="button" className="back" onClick={onBack}>
          ← BACK
        </button>
        <button type="button" className="go" onClick={() => window.print()}>
          🖨️ PRINT
        </button>
      </div>
      {tip && <div className="tip">{tip}</div>}
      <div className="sheet" dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body
  );
}
