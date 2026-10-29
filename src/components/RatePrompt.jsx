import { useEffect, useState } from "react";
import Sheet, { sheetTitle, muted, field, bigButton, quietButton } from "./Sheet.jsx";
import { sendRating, GOOGLE_REVIEW_URL } from "../lib/ratings.js";
import { noteVisitAndShouldAsk, markAsked } from "../lib/ratePrompt.js";

// "Enjoying TUNR?": tap the stars, add a note if you like, done. Then a
// public Google review is offered to everyone (whatever they rated).
// Shown now and then by itself (see ratings.js), or from Settings
// (open = true).
export default function RatePrompt({ user, open = false, onClose, onToast }) {
  const [show, setShow] = useState(open);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // On its own: count this visit, and maybe ask a little while in.
  useEffect(() => {
    if (open || !user) return undefined;
    if (!noteVisitAndShouldAsk()) return undefined;
    const t = setTimeout(() => setShow(true), 25000);
    return () => clearTimeout(t);
  }, [user?.id, open]);

  if (!show || !user) return null;

  function close(how) {
    markAsked(how);
    setShow(false);
    onClose?.();
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      await sendRating(stars, note);
      markAsked("rated");
      setDone(true);
      onToast?.("⭐ Thanks for rating TUNR!");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={() => close(done ? "rated" : "not_now")} label="Rate TUNR" zIndex={330} portal>
      {!done ? (
        <>
          <div style={{ ...sheetTitle, textAlign: "center" }}>ENJOYING TUNR?</div>
          <div style={{ ...muted, textAlign: "center", marginTop: 4 }}>Tap a star. It takes two seconds and helps us make it better.</div>
          <div role="radiogroup" aria-label="Stars" style={{ display: "flex", justifyContent: "center", gap: 8, margin: "16px 0 6px" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setStars(n)}
                style={{ background: "none", border: "none", padding: 2, cursor: "pointer", fontSize: 40, lineHeight: 1, filter: n <= stars ? "none" : "grayscale(1) opacity(0.35)", transform: n <= stars ? "scale(1.08)" : "none", transition: "transform 0.12s" }}
              >
                ⭐
              </button>
            ))}
          </div>
          {stars > 0 && (
            <>
              <textarea
                style={{ ...field, minHeight: 70, marginTop: 8 }}
                maxLength={1000}
                placeholder={stars >= 4 ? "What do you like most? (optional)" : "What would make it better? (optional)"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {error && (
                <div role="alert" style={{ ...muted, color: "var(--a-f87171)", marginTop: 6 }}>
                  {error}
                </div>
              )}
              <button className="action-btn" disabled={busy} onClick={send} style={{ ...bigButton, marginTop: 10 }}>
                {busy ? "SENDING…" : "SEND RATING"}
              </button>
            </>
          )}
          <button onClick={() => close("not_now")} style={{ ...quietButton, marginTop: 8, padding: "11px 0" }}>
            NOT NOW
          </button>
        </>
      ) : (
        <>
          <div style={{ ...sheetTitle, textAlign: "center" }}>THANK YOU 🙌</div>
          <div style={{ ...muted, textAlign: "center", marginTop: 6 }}>
            {GOOGLE_REVIEW_URL ? "Got a minute? A Google review helps other Georgia car people find TUNR." : "Every rating is read by the TUNR team."}
          </div>
          {GOOGLE_REVIEW_URL && (
            <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={() => close("rated")} style={{ ...bigButton, display: "block", textAlign: "center", textDecoration: "none", marginTop: 14, background: "var(--n-ffffff)", color: "var(--n-111111)" }}>
              ⭐ REVIEW TUNR ON GOOGLE
            </a>
          )}
          <button onClick={() => close("rated")} style={{ ...quietButton, marginTop: 8, padding: "11px 0" }}>
            DONE
          </button>
        </>
      )}
    </Sheet>
  );
}
