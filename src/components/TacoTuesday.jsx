import { useEffect, useState } from "react";
import { loadTaco, makeTacoPick, lineText } from "../lib/taco.js";

// 🌮 Taco Tuesday on the Perks tab: Tuesday's free MORE-or-LESS pick
// against a discounted "taco line" (the usual line crossed out next to it),
// and how last week's went. Rules live in 105_taco_tuesday_scratch_cards.sql.

const go = (link) => window.dispatchEvent(new CustomEvent("tunr:open", { detail: { link } }));
const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function TacoTuesday({ user, onNeedAccount, onToast }) {
  const [taco, setTaco] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    loadTaco()
      .then((t) => (setTaco(t), setError("")))
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!taco && !error) return null;
  const pick = taco?.pick;
  const open = pick?.open;
  const mine = pick?.my_choice;

  const choose = async (choice) => {
    if (!user) return onNeedAccount();
    setBusy(true);
    try {
      await makeTacoPick(choice);
      onToast?.(`🌮 Locked in: ${choice.toUpperCase()} than ${lineText(pick.taco_line)}. Good luck!`);
      await refresh();
    } catch (e) {
      onToast?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginBottom: 14,
        padding: "14px 16px",
        borderRadius: 12,
        background: "linear-gradient(135deg, var(--n-2a1a05), var(--n-141414))",
        border: `1px solid ${open ? "#F59E0B" : "var(--n-4a3410)"}`,
        fontFamily: "'Barlow Condensed', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 28 }}>🌮</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.5, color: "var(--n-f0f0f0)" }}>
            TACO <span style={{ color: "#F59E0B" }}>TUESDAY</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--a-c9a96b)", fontFamily: "'Barlow', sans-serif" }}>
            Free every Tuesday: pick MORE or LESS on the taco line. Right pick: +{taco?.points ?? 5} points.
          </div>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--a-f87171)", fontFamily: "'Barlow', sans-serif" }}>{error}</div>}

      {pick && (open || pick.day >= weekAgo(taco.today)) ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "var(--n-f0f0f0)", lineHeight: 1.25 }}>{pick.question}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 15, color: "var(--n-777777)", textDecoration: "line-through" }}>{lineText(pick.line)}</span>
            <span style={{ fontSize: 30, fontWeight: 900, color: "#F59E0B", lineHeight: 1 }}>{lineText(pick.taco_line)}</span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: "#F59E0B", border: "1px solid #F59E0B", borderRadius: 10, padding: "2px 7px" }}>🌮 TACO LINE</span>
          </div>

          {open && !mine && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {[
                ["more", "⬆ MORE", "#10B981"],
                ["less", "⬇ LESS", "#F87171"],
              ].map(([id, text, color]) => (
                <button
                  key={id}
                  className="action-btn"
                  disabled={busy}
                  onClick={() => choose(id)}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${color}`, background: "var(--n-141414)", color, fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 13, color: "var(--a-c9a96b)", fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 }}>
            {statusLine(pick, mine, taco)}
          </div>
          {pick.event_id && (
            <button onClick={() => go(`meet:${pick.event_id}`)} style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#F59E0B", fontSize: 12.5, fontWeight: 800, letterSpacing: 0.8, cursor: "pointer", fontFamily: "inherit" }}>
              SEE THE MEET ›
            </button>
          )}
        </div>
      ) : (
        !error && (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--a-c9a96b)", fontFamily: "'Barlow', sans-serif" }}>
            Next pick: {taco.is_tuesday ? "later today" : dayName(taco.next_tuesday)}.
          </div>
        )
      )}
    </div>
  );
}

function weekAgo(today) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function statusLine(pick, mine, taco) {
  const res = pick.result == null ? null : lineText(pick.result);
  if (pick.open) {
    if (mine) return `You picked ${mine.toUpperCase()}. Results after ${pick.stat === "going" ? "the meet starts" : "it's decided"}. ${pick.entries} ${pick.entries === 1 ? "pick" : "picks"} so far.`;
    return `Closes tonight at midnight. ${pick.entries} ${pick.entries === 1 ? "pick" : "picks"} so far.`;
  }
  if (pick.outcome === "won") return `✅ It finished at ${res}. You called it: +${taco.points} points are waiting in your 📋 checklist.`;
  if (pick.outcome === "lost") return `It finished at ${res}. Not this time; next pick ${dayName(taco.next_tuesday)}.`;
  if (pick.outcome === "void") return "This one was called off (the meet was removed). Next pick Tuesday.";
  if (pick.settled) return `It finished at ${res ?? "–"}. Next pick ${dayName(taco.next_tuesday)}.`;
  return mine ? `You picked ${mine.toUpperCase()}. Waiting on the result.` : `Picks are closed. Waiting on the result.`;
}
