import { useEffect, useRef, useState } from "react";
import Sheet, { sheetTitle, muted, bigButton, quietButton } from "./Sheet.jsx";
import { loadScratchShop, buyScratch } from "../lib/scratch.js";
import { oddsRows, chanceUpTo, prizeRange, pctText } from "../lib/scratchOdds.js";
import { drawFoil, rub, rubbedOff } from "../lib/scratchCanvas.js";

// 🎟️ Scratch cards on the Perks tab: spend points on a card, scratch it
// with your finger, win points straight into your balance. The server picks
// the prize (buy_scratch in 105_taco_tuesday_scratch_cards.sql); the odds
// shown are read from the same table it uses.

const LOOKS = {
  tuneup: { from: "var(--n-065f46)", to: "#10B981", icon: "🔧" },
  turbo: { from: "#1e3a8a", to: "#0080F0", icon: "🌀" },
  supercharged: { from: "#78350f", to: "#F59E0B", icon: "⚡" },
};
const look = (id) => LOOKS[id] || { from: "var(--n-374151)", to: "var(--n-9ca3af)", icon: "🎟️" };

export default function ScratchCards({ user, onNeedAccount, onToast }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="action-btn"
        onClick={() => (user ? setOpen(true) : onNeedAccount())}
        style={{
          width: "100%",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          background: "linear-gradient(135deg, var(--n-1f0a2e), var(--n-141414))",
          border: "1px solid #5b2a86",
          borderRadius: 12,
          color: "var(--n-f0f0f0)",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 28 }}>🎟️</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 900, letterSpacing: 0.5 }}>
            SCRATCH <span style={{ color: "var(--a-c084fc)" }}>CARDS</span>
          </span>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--a-c4a5e0)", fontFamily: "'Barlow', sans-serif" }}>
            2, 5 or 10 points a card. Win up to 20.
          </span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 20, color: "var(--a-c4a5e0)" }}>›</span>
      </button>
      {open && <ScratchShop onClose={() => setOpen(false)} onToast={onToast} />}
    </>
  );
}

function ScratchShop({ onClose, onToast }) {
  const [shop, setShop] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [odds, setOdds] = useState(null);
  const [playing, setPlaying] = useState(null); // { card, prize }

  const refresh = () =>
    loadScratchShop()
      .then((s) => (setShop(s), setError("")))
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);

  const play = async (card) => {
    setBusy(card.id);
    setError("");
    try {
      const r = await buyScratch(card.id);
      setPlaying({ card, prize: r.prize, balance: r.balance });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  if (playing)
    return (
      <Sheet onClose={onClose} label="Scratch card" portal>
        <ScratchPlay
          {...playing}
          onAgain={() => {
            setPlaying(null);
            refresh();
          }}
          onRevealed={(prize) => onToast?.(`🎟️ +${prize} point${prize === 1 ? "" : "s"}`)}
        />
      </Sheet>
    );

  const left = shop ? shop.max_per_day - shop.played_today : 0;
  return (
    <Sheet onClose={onClose} label="Scratch cards" portal>
      <div style={sheetTitle}>🎟️ SCRATCH CARDS</div>
      {shop && (
        <div style={{ ...muted, marginTop: 4 }}>
          You have <b style={{ color: "var(--n-f0f0f0)" }}>{shop.balance ?? 0} points</b> · {left > 0 ? `${left} of ${shop.max_per_day} cards left today` : "no cards left today"}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "var(--a-f87171)", fontWeight: 700 }}>{error}</div>}
      {shop && !shop.on && <div style={{ ...muted, marginTop: 12 }}>Scratch cards are closed right now.</div>}

      {shop?.on &&
        shop.cards.map((c) => {
          const [lo, hi] = prizeRange(c);
          const L = look(c.id);
          const short = (shop.balance ?? 0) < c.cost;
          const blocked = c.sold_out || short || left <= 0;
          const usual = c.cost <= 2 ? 2 : c.cost <= 5 ? 5 : 11;
          return (
            <div key={c.id} style={{ marginTop: 12, borderRadius: 14, overflow: "hidden", border: "1px solid var(--n-2a2a2a)", position: "relative" }}>
              <div style={{ padding: "14px 16px", background: `linear-gradient(135deg, ${L.from}, ${L.to})`, color: "var(--n-ffffff)", display: "flex", alignItems: "center", gap: 12 }}>
                <span aria-hidden="true" style={{ fontSize: 30 }}>{L.icon}</span>
                <div style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>{c.name.toUpperCase()}</div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    Win {lo}–{hi} points · {pctText(chanceUpTo(c, usual))} chance of {lo === usual ? usual : `${lo}–${usual}`}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "'Barlow Condensed', sans-serif" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{c.cost}</div>
                  <div style={{ fontSize: 10.5, letterSpacing: 1.2, opacity: 0.9 }}>POINTS</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: 10, background: "var(--n-111111)" }}>
                <button onClick={() => setOdds(odds === c.id ? null : c.id)} style={{ ...quietButton, flex: 1, padding: "10px 0", fontSize: 12.5 }}>
                  {odds === c.id ? "HIDE ODDS" : "ODDS"}
                </button>
                <button
                  className="action-btn"
                  disabled={blocked || Boolean(busy)}
                  onClick={() => play(c)}
                  style={{ ...bigButton, flex: 2, padding: "10px 0", fontSize: 13, background: blocked ? "var(--n-2a2a2a)" : L.to, color: blocked ? "var(--n-888888)" : "var(--n-ffffff)", opacity: busy && busy !== c.id ? 0.6 : 1 }}
                >
                  {c.sold_out ? "SOLD OUT TODAY" : busy === c.id ? "…" : short ? `NEED ${c.cost} POINTS` : `PLAY · ${c.cost} PTS`}
                </button>
              </div>
              {odds === c.id && <OddsTable card={c} />}
            </div>
          );
        })}

      {shop?.recent?.length > 0 && (
        <div style={{ ...muted, fontSize: 12, marginTop: 14 }}>
          Your last cards: {shop.recent.map((r) => `+${r.prize}`).join(", ")}
        </div>
      )}
      <div style={{ ...muted, fontSize: 11.5, marginTop: 12 }}>
        Just for fun. The odds shown are the real odds and the same for everyone; the server picks each prize. Winnings go straight into your balance.
        Points aren't cash. Up to 10 cards a day. One day each week the Tune-Up card sells out.
      </div>
      <button onClick={onClose} style={{ ...quietButton, marginTop: 12 }}>
        CLOSE
      </button>
    </Sheet>
  );
}

function OddsTable({ card }) {
  return (
    <div style={{ padding: "6px 14px 12px", background: "var(--n-111111)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6 }}>
      {oddsRows(card).map((r) => (
        <div key={r.prize} style={{ fontSize: 12, color: "var(--n-cccccc)", fontFamily: "'Barlow', sans-serif", padding: "4px 6px", borderRadius: 6, background: "var(--n-161616)", textAlign: "center" }}>
          <b>+{r.prize}</b> <span style={{ color: "var(--n-888888)" }}>{pctText(r.pct)}</span>
        </div>
      ))}
    </div>
  );
}

// The card itself: a silver layer you rub off with a finger (or mouse).
function ScratchPlay({ card, prize, balance, onAgain, onRevealed }) {
  const canvasRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const moves = useRef(0);
  const last = useRef(null);
  const L = look(card.id);

  useEffect(() => {
    drawFoil(canvasRef.current);
  }, []);

  const reveal = () => {
    if (revealed) return;
    setRevealed(true);
    onRevealed(prize);
  };

  // Mostly scratched off? Show the rest.
  const check = () => {
    if (rubbedOff(canvasRef.current) > 0.5) reveal();
  };

  const scratch = (e) => {
    if (revealed || (e.pointerType === "mouse" && e.buttons !== 1)) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    rub(canvasRef.current, e.type === "pointerdown" ? null : last.current, x, y);
    last.current = { x, y };
    if (++moves.current % 8 === 0) check();
  };

  return (
    <div>
      <div style={sheetTitle}>
        {L.icon} {card.name.toUpperCase()}
      </div>
      <div style={{ ...muted, marginTop: 2 }}>Rub the silver off with your finger.</div>
      <div style={{ position: "relative", marginTop: 14, height: 190, borderRadius: 16, overflow: "hidden", background: `linear-gradient(135deg, ${L.from}, ${L.to})` }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--n-ffffff)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, fontWeight: 800, opacity: 0.9 }}>YOU WON</div>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1 }}>+{prize}</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>POINT{prize === 1 ? "" : "S"}</div>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Scratch area"
          onPointerDown={scratch}
          onPointerMove={scratch}
          onPointerUp={() => {
            last.current = null;
            if (!revealed) check();
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "grab", transition: "opacity 0.5s", opacity: revealed ? 0 : 1, pointerEvents: revealed ? "none" : "auto" }}
        />
      </div>
      {revealed ? (
        <>
          <div style={{ ...muted, marginTop: 12, textAlign: "center" }}>
            Added to your balance. You now have <b style={{ color: "var(--n-f0f0f0)" }}>{balance} points</b>.
          </div>
          <button className="action-btn" onClick={onAgain} style={{ ...bigButton, marginTop: 12 }}>
            BACK TO THE CARDS
          </button>
        </>
      ) : (
        <button onClick={reveal} style={{ ...quietButton, marginTop: 12 }}>
          REVEAL ALL
        </button>
      )}
    </div>
  );
}
