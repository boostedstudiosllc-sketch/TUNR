// Scratch card odds, worked out from a card's prizes and weights
// (scratch_cards in 105_taco_tuesday_scratch_cards.sql), for the odds table
// every card shows. Pure, so it's tested in test/scratch.test.js.

const total = (card) => card.weights.reduce((a, b) => a + b, 0);

// [{ prize, pct }] for each prize, in order.
export function oddsRows(card) {
  const t = total(card);
  return card.prizes.map((prize, i) => ({ prize, pct: (card.weights[i] / t) * 100 }));
}

// Chance (0–100) of winning at most `max` points.
export function chanceUpTo(card, max) {
  return oddsRows(card).reduce((sum, r) => sum + (r.prize <= max ? r.pct : 0), 0);
}

// The average win per card (what you get back on average for its cost).
export function averageWin(card) {
  return oddsRows(card).reduce((sum, r) => sum + (r.prize * r.pct) / 100, 0);
}

export function prizeRange(card) {
  return [Math.min(...card.prizes), Math.max(...card.prizes)];
}

// "45%", "8%", "2.5%", "0.3%"
export function pctText(pct) {
  if (pct >= 10) return `${Math.round(pct)}%`;
  return `${Math.round(pct * 10) / 10}%`;
}
